// Translates the common Zoho criteria forms to a parameterized SQL condition, so Postgres does the
// filtering. Returns null for anything it is not sure about; the store then falls back to the JS
// predicate in criteria.mjs, so behaviour never gets worse than the SQLite engine.
//
// Supported: field == / != literal (string, number, true/false, null), field.contains/startsWith/endsWith("text"),
// combined with && || ! and parentheses. Every piece is two-valued (never NULL), so NOT is safe.
import { TOKEN, today } from '../criteria.mjs';
import { columns } from '../model.mjs';
import { q } from './schema.mjs';

class Unsupported extends Error {}
const no = () => { throw new Unsupported(); };

function tokenize(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  let m;
  while (TOKEN.lastIndex < src.length) {
    if (!(m = TOKEN.exec(src))) no();
    if (!/^\s+$/.test(m[0])) out.push(m[0]);
  }
  return out;
}

// criteriaToSql(src, form, { user }, offset) -> { sql, params } | null. Placeholders start at $offset+1.
export function criteriaToSql(src, form, ctx = {}, offset = 0) {
  if (!src || !String(src).trim()) return { sql: 'TRUE', params: [] };
  const cols = columns[form];
  const params = [];
  const param = (v) => { params.push(v); return `$${offset + params.length}`; };
  try {
    const toks = tokenize(String(src));
    let i = 0;
    const peek = () => toks[i];
    const take = () => toks[i++];

    const operand = () => {
      const t = take();
      if (t === undefined) no();
      if (/^["']/.test(t)) return { lit: 'string', value: t.slice(1, -1).replace(/\\(.)/g, '$1') };
      if (/^\d/.test(t)) return { lit: 'number', value: t };
      if (t === 'true' || t === 'false') return { lit: 'bool', value: t === 'true' };
      if (t === 'null') return { lit: 'null' };
      if (t === 'zoho.currentdate') return { lit: 'string', value: today() };
      if (t === 'zoho.loginuser' || t === 'zoho.loginuserid') return { lit: 'string', value: ctx.user || '' };
      if (/^[A-Za-z_]\w*$/.test(t) && (t === 'ID' || cols[t])) return { field: t };
      return no();
    };

    const compare = (a, op, b) => {
      if (a.lit && b.field) [a, b] = [b, a];
      if (!a.field || !b.lit) no();
      const eq = op === '==';
      const col = q(a.field);
      if (a.field === 'ID') {
        if (b.lit === 'null') return eq ? 'FALSE' : 'TRUE';
        if ((b.lit === 'string' || b.lit === 'number') && /^\d+$/.test(b.value)) return `${col} ${eq ? '=' : '<>'} ${param(b.value)}::bigint`;
        return no();
      }
      const kind = cols[a.field].kind;
      if (kind === 'text') {
        if (b.lit === 'null') return `${eq ? '' : 'NOT '}(${col} IS NULL OR ${col} = '')`;
        if (b.lit === 'string' && b.value !== '') return `${col} IS ${eq ? 'NOT ' : ''}DISTINCT FROM ${param(b.value)}`;
        return no();
      }
      if (kind === 'num') {
        if (b.lit === 'null') return `${col} IS ${eq ? '' : 'NOT '}NULL`;
        if (b.lit === 'number') return `${col} IS ${eq ? 'NOT ' : ''}DISTINCT FROM ${param(b.value)}::numeric`;
        return no();
      }
      if (kind === 'bool' && b.lit === 'bool') return `COALESCE(${col}, FALSE) ${eq ? '=' : '<>'} ${param(b.value)}::boolean`;
      return no();
    };

    const method = (a, m) => {
      const arg = take();
      if (!a.field || a.field === 'ID' || cols[a.field].kind !== 'text' || !/^["']/.test(arg || '') || take() !== ')') no();
      const col = q(a.field);
      const p = param(arg.slice(1, -1).replace(/\\(.)/g, '$1'));
      if (m === 'contains') return `COALESCE(strpos(${col}, ${p}) > 0, FALSE)`;
      if (m === 'startsWith') return `COALESCE(left(${col}, length(${p})) = ${p}, FALSE)`;
      return `COALESCE(right(${col}, length(${p})) = ${p}, FALSE)`;
    };

    const primary = () => {
      if (peek() === '(') { take(); const e = or(); if (take() !== ')') no(); return `(${e})`; }
      const a = operand();
      const t = take();
      if (t === '==' || t === '!=') return compare(a, t, operand());
      const mm = /^\.(contains|startsWith|endsWith)\s*\($/.exec(t || '');
      if (mm) return method(a, mm[1]);
      return no();
    };
    const unary = () => (peek() === '!' ? (take(), `NOT (${unary()})`) : primary());
    const and = () => { let e = unary(); while (peek() === '&&') { take(); e = `(${e} AND ${unary()})`; } return e; };
    const or = () => { let e = and(); while (peek() === '||') { take(); e = `(${e} OR ${and()})`; } return e; };

    const sql = or();
    if (i !== toks.length) no();
    return { sql, params };
  } catch (e) {
    if (e instanceof Unsupported) return null;
    throw e;
  }
}
