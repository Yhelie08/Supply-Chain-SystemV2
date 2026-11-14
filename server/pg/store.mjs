// Postgres version of the data layer in db.mjs: the same operations the widget SDK needs, but async.
// `db` is anything with query(sql, params) -> { rows }: a pg Pool in production, PGlite in tests.
//
// IDs are strings in JavaScript and BIGINT in Postgres; they are never turned into numbers, because a
// Zoho ID (19 digits) does not fit in one. Filtering is done by Postgres when criteria-sql.mjs can
// translate the Zoho criteria; otherwise the rows are filtered in JavaScript exactly like db.mjs does.
import { columns, formOfReport, formByName, lookupDisplay, displayFromFormat } from '../model.mjs';
import { ZohoError, zohoNow, compileCriteria } from '../criteria.mjs';
import { q, ownColumns } from './schema.mjs';
import { criteriaToSql } from './criteria-sql.mjs';

const isId = (id) => /^\d{1,19}$/.test(String(id));
const idOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v.ID ?? v.id ?? '' : v);
const notFound = () => new ZohoError(9280, 'No records found for the given criteria.');
const cast = { json: '::jsonb', num: '::numeric', bool: '::boolean', text: '' };

// Runs fn inside a transaction on one connection (pg Pool) or PGlite's transaction.
export async function withTx(db, fn) {
  if (typeof db.connect === 'function') {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
      throw e;
    } finally { client.release(); }
  }
  return db.transaction((tx) => fn(tx));
}

// What the database gets for each field: ready to bind, with the cast from `cast` in the SQL.
export function encode(form, data, existingExtra) {
  const cols = columns[form];
  const out = {};
  const extra = { ...(existingExtra || {}) };
  for (let [k, v] of Object.entries(data || {})) {
    const c = cols[k];
    if (!c) { if (!['ID', 'Added_Time', 'Modified_Time', 'Added_User'].includes(k)) extra[k] = v; continue; }
    if (c.lookup) v = Array.isArray(v) ? v.map(idOf) : idOf(v);
    if (c.kind === 'json') {
      if (c.type === 'grid' && Array.isArray(v)) v = v.map((r, i) => ({ ID: r.ID || String(Date.now()) + i, ...r }));
      out[k] = v === '' || v == null ? null : JSON.stringify(v);
    } else if (c.kind === 'bool') out[k] = v === true || v === 'true' || v === 1 || v === '1';
    else if (c.kind === 'num') out[k] = v === '' || v == null || isNaN(Number(v)) ? null : String(Number(v));
    else out[k] = v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return { out, extra: Object.keys(extra).length ? JSON.stringify(extra) : null };
}

export function createStore(db) {
  const selectList = (form) => ['t."ID"::text AS "ID"', 't."Added_Time"', 't."Modified_Time"', 't."Added_User"', 't."_extra"',
    ...ownColumns(form).map(([n, c]) => (c.kind === 'num' ? `t.${q(n)}::text AS ${q(n)}` : `t.${q(n)}`))].join(', ');

  function displayOf(form, row) {
    // Zoho's own display format for this form first ("[item_name]"); the first filled text column if that gives nothing.
    if (lookupDisplay[form]) {
      const shown = displayFromFormat(lookupDisplay[form], row);
      if (shown.trim() !== '') return shown;
    }
    for (const [name, c] of ownColumns(form)) {
      const v = row[name];
      if (c.kind === 'text' && v != null && v !== '' && !c.lookup) return String(v);
      if (c.type === 'name' && v) return [v.first_name, v.last_name].filter(Boolean).join(' ');
    }
    return String(row.ID);
  }

  // One query per lookup form for a whole result set, instead of one per row and field.
  async function loadDisplays(form, rows) {
    const need = new Map();
    for (const [name, c] of ownColumns(form)) {
      if (!c.lookup || !columns[c.lookup]) continue;
      for (const row of rows) {
        for (const id of [].concat(row[name] ?? [])) {
          if (!isId(id)) continue;
          if (!need.has(c.lookup)) need.set(c.lookup, new Set());
          need.get(c.lookup).add(String(id));
        }
      }
    }
    const displays = new Map();
    for (const [lookupForm, ids] of need) {
      const { rows: found } = await db.query(`SELECT ${selectList(lookupForm)} FROM ${q(lookupForm)} t WHERE t."ID" = ANY($1::bigint[])`, [[...ids]]);
      displays.set(lookupForm, new Map(found.map((r) => [r.ID, displayOf(lookupForm, r)])));
    }
    return displays;
  }

  function toRecord(form, row, displays, { raw = false } = {}) {
    const rec = { ID: row.ID, Added_Time: row.Added_Time || '', Modified_Time: row.Modified_Time || '', Added_User: row.Added_User || '' };
    for (const [name, c] of ownColumns(form)) {
      let v = row[name];
      if (c.kind === 'json') {
        v = v ?? (['grid', 'list', 'checkboxes'].includes(c.type) ? [] : '');
        // Zoho gives a name field its display text too; widgets show that (and fall back to the ID without it)
        if (c.type === 'name' && v && typeof v === 'object' && !Array.isArray(v)) {
          v = { ...v, zc_display_value: [v.prefix, v.first_name, v.last_name, v.suffix].filter(Boolean).join(' ') };
        }
      }
      else if (c.kind === 'bool') v = v === true;
      else if (c.kind === 'num') v = v == null ? '' : String(v);
      else v = v ?? '';
      if (!raw && c.lookup && v !== '' && v != null) {
        const one = (id) => { const dv = displays.get(c.lookup)?.get(String(id)) ?? String(id); return { ID: String(id), display_value: dv, zc_display_value: dv }; };
        v = Array.isArray(v) ? v.map(one) : one(v);
      }
      rec[name] = v;
    }
    if (row._extra) Object.assign(rec, row._extra);
    return rec;
  }

  const records = async (form, rows, opts) => {
    const displays = opts?.raw ? new Map() : await loadDisplays(form, rows);
    return rows.map((r) => toRecord(form, r, displays, opts));
  };

  return {
    async getRecords(reportName, { criteria, page = 1, pageSize, max_records, user } = {}) {
      const { form, criteria: reportCriteria } = formOfReport(reportName);
      const size = Math.min(Number(pageSize || max_records || 200) || 200, 1000);
      const offset = Math.max((Number(page) || 1) - 1, 0) * size;

      // Fast path: Postgres filters and pages.
      const where = [];
      const params = [];
      let translated = true;
      for (const src of [reportCriteria, criteria]) {
        if (!src || !String(src).trim()) continue;
        const t = criteriaToSql(src, form, { user }, params.length);
        if (!t) { translated = false; break; }
        where.push(t.sql);
        params.push(...t.params);
      }
      if (translated) {
        const { rows } = await db.query(
          `SELECT ${selectList(form)} FROM ${q(form)} t ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t."ID" LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, size, offset],
        );
        return records(form, rows);
      }

      // Slow path, same behaviour as db.mjs: filter in JavaScript.
      let reportTest = () => true;
      try { reportTest = compileCriteria(reportCriteria, { user }); } catch (e) { console.warn(`[report ${reportName}] criteria ignored: ${e.message}`); }
      const test = compileCriteria(criteria, { user });
      const { rows } = await db.query(`SELECT ${selectList(form)} FROM ${q(form)} t ORDER BY t."ID"`);
      const all = (await records(form, rows)).filter((r) => reportTest(r) && test(r));
      return all.slice(offset, offset + size);
    },

    // raw: lookup fields stay plain IDs instead of { ID, display_value } (what Deluge's input.Field gives).
    async getRecordById(reportName, id, { raw = false } = {}) {
      const { form } = formOfReport(reportName);
      if (!isId(id)) throw notFound();
      const { rows } = await db.query(`SELECT ${selectList(form)} FROM ${q(form)} t WHERE t."ID" = $1::bigint`, [String(id)]);
      if (!rows.length) throw notFound();
      return (await records(form, rows, { raw }))[0];
    },

    async addRecord(formName, data, user = '') {
      const form = formByName(formName);
      return withTx(db, async (tx) => {
        const input = { ...data };
        const auto = ownColumns(form).filter(([k, c]) => c.type === 'autonumber' && (input[k] == null || input[k] === ''));
        if (auto.length) await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [form]);
        for (const [k] of auto) {
          const r = await tx.query(`SELECT COALESCE(MAX(${q(k)}), 0) + 1 AS n FROM ${q(form)}`);
          input[k] = Number(r.rows[0].n);
        }
        const { out, extra } = encode(form, input);
        const now = zohoNow();
        const names = ['Added_Time', 'Modified_Time', 'Added_User', '_extra', ...Object.keys(out)];
        const vals = [now, now, user, extra, ...Object.values(out)];
        const casts = ['', '', '', '::jsonb', ...Object.keys(out).map((k) => cast[columns[form][k].kind])];
        const res = await tx.query(
          `INSERT INTO ${q(form)} (${names.map(q).join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}${casts[i]}`).join(', ')}) RETURNING "ID"::text AS id`,
          vals,
        );
        return res.rows[0].id;
      });
    },

    async updateRecord(reportOrForm, id, data, { byForm = false } = {}) {
      const form = byForm ? formByName(reportOrForm) : formOfReport(reportOrForm).form;
      if (!isId(id)) throw notFound();
      const cur = await db.query(`SELECT "_extra" FROM ${q(form)} WHERE "ID" = $1::bigint`, [String(id)]);
      if (!cur.rows.length) throw notFound();
      const { out, extra } = encode(form, data, cur.rows[0]._extra);
      const sets = [['_extra', extra, '::jsonb'], ['Modified_Time', zohoNow(), ''],
        ...Object.entries(out).map(([k, v]) => [k, v, cast[columns[form][k].kind]])];
      await db.query(
        `UPDATE ${q(form)} SET ${sets.map(([k, , c], i) => `${q(k)} = $${i + 1}${c}`).join(', ')} WHERE "ID" = $${sets.length + 1}::bigint`,
        [...sets.map(([, v]) => v), String(id)],
      );
      return String(id);
    },

    async deleteRecord(reportName, id) {
      const { form } = formOfReport(reportName);
      if (!isId(id)) throw notFound();
      const res = await db.query(`DELETE FROM ${q(form)} WHERE "ID" = $1::bigint RETURNING "ID"`, [String(id)]);
      if (!res.rows.length) throw notFound();
      return String(id);
    },

    // Deluge-style helper for ported functions: find('Form', rec => ...)
    // Optional { criteria } is a Zoho criteria string, e.g. '(SO_No == "SO-1")': Postgres filters, so only those rows are read (on a remote
    // database reading a whole table costs a lot). `test` still runs on what comes back, so a criteria that cannot be translated is safe:
    // it falls back to reading everything.
    async find(formName, test = () => true, { criteria } = {}) {
      const form = formByName(formName);
      const t = criteria ? criteriaToSql(criteria, form, {}, 0) : null;
      const { rows } = t
        ? await db.query(`SELECT ${selectList(form)} FROM ${q(form)} t WHERE ${t.sql} ORDER BY t."ID"`, t.params)
        : await db.query(`SELECT ${selectList(form)} FROM ${q(form)} t ORDER BY t."ID"`);
      return (await records(form, rows, { raw: true })).filter(test);
    },

    async tableCounts() {
      const parts = Object.keys(columns).map((f) => `SELECT ${`'${f.replace(/'/g, "''")}'`} AS form, COUNT(*)::int AS rows FROM ${q(f)}`);
      const { rows } = await db.query(parts.join(' UNION ALL '));
      return rows.filter((r) => r.rows);
    },
  };
}
