import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { ActionModal, Drawer, Modal, Pill } from './components.jsx';

// One declaration becomes a working page: stat cards, tabs with live counts, search,
// a table, a detail drawer, row actions that call the workflow engine, and CSV export.
//
//   rows        the records to show
//   columns     [{ key, label, render?(row, db), pill? }]
//   tabs        [{ key, label, test(row) }]          filters with live counts
//   stats       [{ label, value(rows), tone? }]
//   actions     [{ name, label, when?(row), fields?, payload?(row, values), tone }]
//   bulk        like an action, but runs on the checked rows (ids)
//   create      { label, action, fields }            a "New" button

function cellValue(col, row, db) {
  if (col.render) return col.render(row, db);
  const v = row[col.key];
  if (col.pill) return <Pill>{v}</Pill>;
  return v === '' || v == null ? <span className="muted">—</span> : String(v);
}

function plain(col, row, db) {
  if (col.csv) return col.csv(row, db);
  const v = row[col.key];
  return v == null ? '' : String(v);
}

function toCsv(columns, rows, db) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(plain(c, r, db))).join(','));
  return [head, ...body].join('\n');
}

export default function Screen({
  title, subtitle, rows, columns, tabs, stats, actions = [], bulk, create, searchKeys, details, empty, historyOf, drawerExtra, viewButton, headExtra, initialTab,
}) {
  const { db, act } = useStore();
  const [tab, setTab] = useState(tabs ? (tabs.some((t) => t.key === initialTab) ? initialTab : tabs[0].key) : null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const [custom, setCustom] = useState(false);
  const [checked, setChecked] = useState([]);

  const activeTab = tabs && tabs.find((t) => t.key === tab);
  const shown = useMemo(() => {
    let out = rows;
    if (activeTab) out = out.filter(activeTab.test);
    const q = query.trim().toLowerCase();
    if (q) {
      const keys = searchKeys || columns.map((c) => c.key);
      out = out.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    return out;
  }, [rows, activeTab, query, searchKeys, columns]);

  const openRow = open ? rows.find((r) => r.id === open) : null;
  const rowActions = (row) => actions.filter((a) => !a.when || a.when(row, db));

  const runAction = (spec, row) => (values) =>
    act(spec.name, spec.payload ? spec.payload(row, values) : { id: row && row.id, ...values });

  const start = (spec, row) => {
    if (spec.fields && spec.fields.length) setForm({ spec, row });
    else if (spec.confirm) setForm({ spec: { ...spec, fields: [] }, row });
    else runAction(spec, row)({});
  };

  const download = () => {
    const blob = new Blob([toCsv(columns, shown, db)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggle = (id) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const history = openRow ? db.audit.filter((a) => a.ref === openRow.id).slice().reverse() : [];

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <div className="head-actions">
          {typeof headExtra === 'function' ? headExtra({ setTab }) : headExtra}
          <button className="btn" onClick={download} disabled={!shown.length}>Export CSV</button>
          {create && <button className="btn btn-primary" onClick={() => (create.Modal ? setCustom(true) : setForm({ spec: { ...create, name: create.action }, row: null }))}>+ {create.label}</button>}
        </div>
      </header>

      {stats && (
        <div className="stats">
          {stats.map((s) => (
            <div key={s.label} className={`stat ${s.tone ? 'stat-' + s.tone : ''}`}>
              <div className="stat-value">{s.value(rows)}</div>
              <div className="stat-label">{s.label}</div>
              {s.sub && <div className="stat-sub">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          {tabs && (
            <div className="tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
                  {t.label}{!t.render && <> <span className="count">{rows.filter(t.test).length}</span></>}
                </button>
              ))}
            </div>
          )}
          {!(activeTab && activeTab.render) && <input className="search" type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />}
          {bulk && (
            <button
              className="btn btn-primary"
              disabled={!checked.length}
              onClick={() => start({ ...bulk, payload: () => ({ ids: checked }) }, null)}
            >
              {bulk.label} ({checked.length})
            </button>
          )}
        </div>

        {activeTab && activeTab.render ? (
          activeTab.render()
        ) : shown.length === 0 ? (
          <div className="empty">{empty || 'Nothing here yet.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {bulk && <th className="col-check" />}
                  {columns.map((c) => <th key={c.key + c.label}>{c.label}</th>)}
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)}>
                    {bulk && (
                      <td className="col-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.no || r.id}`} />
                      </td>
                    )}
                    {columns.map((c) => <td key={c.key + c.label} data-label={c.label}>{cellValue(c, r, db)}</td>)}
                    <td className="col-actions" data-label="Actions" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        {viewButton && <button className="btn btn-sm" onClick={() => setOpen(r.id)}>{typeof viewButton === 'function' ? viewButton(r) : viewButton}</button>}
                        {rowActions(r).slice(0, 2).map((a) => (
                          <button key={a.label} className={`btn btn-sm ${a.tone === 'danger' ? 'btn-danger-ghost' : ''}`} onClick={() => start(a, r)}>{a.label}</button>
                        ))}
                        {rowActions(r).length > 2 && <button className="btn btn-sm" onClick={() => setOpen(r.id)}>More…</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {custom && create && create.Modal && <create.Modal onClose={() => setCustom(false)} />}

      {openRow && (
        <Drawer title={openRow.no || openRow.name || openRow.id} subtitle={title} onClose={() => setOpen(null)}>
          <dl className="kv">
            {(details || columns).map((c) => (
              <div key={c.key + c.label} className="kv-row">
                <dt>{c.label}</dt>
                <dd>{cellValue(c, openRow, db)}</dd>
              </div>
            ))}
          </dl>
          {drawerExtra && drawerExtra(openRow, db)}
          <h4>Actions</h4>
          <div className="drawer-actions">
            {rowActions(openRow).length === 0 && <span className="muted">No steps are available in this status.</span>}
            {rowActions(openRow).map((a) => (
              <button key={a.label} className={`btn ${a.tone === 'danger' ? 'btn-danger-ghost' : ''}`} onClick={() => start(a, openRow)}>{a.label}</button>
            ))}
          </div>
          {(historyOf ? historyOf(openRow, db) : history).length > 0 && (
            <>
              <h4>History</h4>
              <ul className="timeline">
                {(historyOf ? historyOf(openRow, db) : history).map((h, i) => (
                  <li key={i}>
                    <div>{h.msg}</div>
                    <div className="muted">{new Date(h.at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Drawer>
      )}

      {form && form.spec.confirm && !(form.spec.fields || []).length ? (
        <Modal
          title={form.spec.title || form.spec.label}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)}>Cancel</button>
              <button className={`btn ${form.spec.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => { runAction(form.spec, form.row)({}); setForm(null); }}>{form.spec.label}</button>
            </>
          }
        >
          <p>{typeof form.spec.confirm === 'function' ? form.spec.confirm(form.row) : form.spec.confirm}</p>
        </Modal>
      ) : (
        form && (
          <ActionModal
            spec={form.spec}
            row={form.row}
            onClose={() => setForm(null)}
            onSubmit={(values) => {
              const ok = runAction(form.spec, form.row)(values);
              if (ok && bulk && form.spec.name === bulk.name) setChecked([]);
              return ok;
            }}
          />
        )
      )}
    </section>
  );
}
