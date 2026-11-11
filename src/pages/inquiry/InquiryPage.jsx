import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { nextStep, readiness, selectedQuote, quoteFinal } from '../../domain/inquiry.js';
import { addDays, fmtCNY, fmtPHP } from '../../domain/util.js';
import { ConfirmModal, NextStepPill, StatusBadge, goTo } from './parts.jsx';
import InquiryForm from './InquiryForm.jsx';
import InquiryDetail from './InquiryDetail.jsx';

// Routes under #/procurement/inquiry:   (nothing) list · new · <id> detail · <id>/edit
export default function InquiryPage({ sub = '' }) {
  const { db } = useStore();
  if (sub === 'new') return <InquiryForm mode="new" />;
  const [id, tail] = sub.split('/');
  if (id) {
    const inq = db.inquiries.find((q) => q.id === id);
    if (!inq) {
      return (
        <section className="screen">
          <h1>Inquiry not found</h1>
          <p className="muted">It may have been deleted.</p>
          <a className="btn" href="#/procurement/inquiry">← INQ List</a>
        </section>
      );
    }
    return tail === 'edit' ? <InquiryForm mode="edit" inquiry={inq} /> : <InquiryDetail inquiry={inq} />;
  }
  return <InquiryList />;
}

const createdMs = (q) => Date.parse(q.createdAt) || 0;
const ago = (q, today) => (q.createdAt || '').slice(0, 10) >= addDays(today, -7);

function searchText(q) {
  return [q.no, q.quoteGroup, q.createdAt, q.customer, q.item, q.sku, q.description, q.qty, q.unit, q.targetDate, q.waitingOn, q.customerType, q.salesOwner,
    q.dimension, q.colorBody, q.colorTemperature, q.bulbType, q.voltage, q.lumens, q.orderType, q.projectName].join(' ').toLowerCase();
}

function InquiryList() {
  const { db, act, today } = useStore();
  const [view, setView] = useState('inquiries');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null);

  const all = db.inquiries;
  const counts = useMemo(() => {
    const c = { all: all.length, Ready: 0, 'In Progress': 0, 'Not Ready': 0 };
    all.forEach((q) => { c[readiness(q).status] += 1; });
    return c;
  }, [all]);
  const groups = useMemo(() => buildGroups(all), [all]);
  const newThisWeek = all.filter((q) => ago(q, today)).length;
  const fullyReady = groups.filter((g) => g.status === 'Fully Ready').length;
  const groupsInProgress = groups.filter((g) => g.status === 'In Progress').length;

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all
      .filter((q) => (filter === 'all' || readiness(q).status === filter) && (!s || searchText(q).includes(s)))
      .sort((a, b) => createdMs(b) - createdMs(a) || b.no.localeCompare(a.no));
  }, [all, filter, search]);

  const askEstimate = (q) => {
    const isUpdate = q.status === 'Estimate Created';
    setConfirm({
      message: `${isUpdate ? 'Update' : 'Create'} the estimate for ${q.no}?`,
      yes: isUpdate ? 'Update estimate' : 'Create estimate',
      run: () => act('inquiryEstimate', { id: q.id }),
    });
  };

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <h1>Inquiries</h1>
          <p className="muted">Quote suppliers, clear the five readiness conditions, then create the estimate and convert it to a Sales Order.</p>
        </div>
        <div className="head-actions">
          <div className="status-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: '20px', fontSize: '13px', marginRight: '10px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
            <span>{counts.all} Open · {counts.Ready} Ready</span>
          </div>
          <button className="btn btn-primary" onClick={() => goTo('new')}>+ New Inquiry</button>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><div className="stat-value">{counts.all}</div><div className="stat-label">Open INQs</div><div className="stat-sub">{newThisWeek > 0 ? `+${newThisWeek} this week` : 'All records'}</div></div>
        <div className="stat"><div className="stat-value">{groups.length}</div><div className="stat-label">Quote Groups</div><div className="stat-sub">{groupsInProgress} in progress</div></div>
        <div className="stat stat-ok"><div className="stat-value">{counts.Ready}</div><div className="stat-label">Ready for Estimate</div></div>
        <div className="stat stat-bad"><div className="stat-value">{counts['Not Ready']}</div><div className="stat-label">Blocked / Not Ready</div></div>
        <div className="stat stat-ok"><div className="stat-value">{fullyReady}</div><div className="stat-label">Fully Ready Groups</div></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={view === 'inquiries'} className={`tab ${view === 'inquiries' ? 'on' : ''}`} onClick={() => setView('inquiries')}>INQ List</button>
            <button role="tab" aria-selected={view === 'groups'} className={`tab ${view === 'groups' ? 'on' : ''}`} onClick={() => setView('groups')}>Quote Groups</button>
          </div>
          {view === 'inquiries' && (
            <div className="tabs">
              {[['all', 'All'], ['Ready', 'Ready'], ['In Progress', 'In Progress'], ['Not Ready', 'Not Ready']].map(([k, label]) => (
                <button key={k} className={`tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label} <span className="count">({counts[k]})</span></button>
              ))}
            </div>
          )}
          <input className="search" type="search" placeholder="Search inquiries…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search inquiries" />
        </div>

        {view === 'inquiries' ? (
          rows.length === 0 ? (
            <div className="empty">No inquiries match.</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>INQ #</th><th>Quote Group</th><th>Customer</th><th>Image</th><th>Item</th><th>SKU</th><th>Description</th><th>Qty</th>
                      <th>Target</th><th>Status</th><th>Next step</th><th>Estimate</th><th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((q) => {
                      const st = readiness(q).status;
                      return (
                        <tr key={q.id} tabIndex={0} onClick={() => goTo(q.id)} onKeyDown={(e) => e.key === 'Enter' && goTo(q.id)}>
                          <td data-label="INQ #"><a className="cell-link" href={`#/procurement/inquiry/${q.id}`} onClick={(e) => e.stopPropagation()}>{q.no}</a></td>
                          <td data-label="Quote Group">{q.quoteGroup || '—'}</td>
                          <td data-label="Customer">{q.customer}</td>
                          <td data-label="Image"><span style={{ display: 'inline-block', width: '28px', height: '28px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', textAlign: 'center', lineHeight: '26px', fontSize: '11px' }}>🖼</span></td>
                          <td data-label="Item" className="desc" title={q.item}>{q.item}</td>
                          <td data-label="SKU"><span className="mono">{q.sku || '—'}</span></td>
                          <td data-label="Description" className="desc" title={q.description}>{q.description || '—'}</td>
                          <td data-label="Qty">{q.qty} {q.unit}</td>
                          <td data-label="Target">{q.targetDate || '—'}</td>
                          <td data-label="Status"><StatusBadge status={st} /></td>
                          <td data-label="Next step"><NextStepPill ns={nextStep(q)} /></td>
                          <td data-label="Estimate" onClick={(e) => e.stopPropagation()}>
                            {q.status === 'Sales Order' ? (
                              <span className="pill pill-ok">{q.soNo}</span>
                            ) : st === 'Ready' ? (
                              <button className={`btn btn-sm ${q.status === 'Estimate Created' ? '' : 'btn-green'}`} onClick={() => askEstimate(q)}>
                                {q.status === 'Estimate Created' ? 'Update Estimate' : 'Create Estimate'}
                              </button>
                            ) : (
                              <button className="btn btn-sm" disabled title="All five readiness conditions must pass first">Create Estimate</button>
                            )}
                          </td>
                          <td data-label="Created" className="muted">{(q.createdAt || '').slice(0, 10)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="foot-info">Showing <b>{rows.length}</b> of <b>{all.length}</b> records</div>
            </>
          )
        ) : (
          <QuoteGroups groups={groups} search={search} askEstimate={askEstimate} />
        )}
      </div>

      {confirm && (
        <ConfirmModal message={confirm.message} yes={confirm.yes} onNo={() => setConfirm(null)} onYes={() => { confirm.run(); setConfirm(null); }} />
      )}
    </section>
  );
}

// ───────────── Quote Groups: one card per Project + Group Discount, chips per inquiry ─────────────

function buildGroups(all) {
  const byKey = {};
  all.forEach((q) => {
    const proj = q.projectName || '— No Project —';
    const pct = q.groupDiscountPct === '' || q.groupDiscountPct == null ? '' : String(q.groupDiscountPct);
    const key = `${proj}|||${pct === '' ? '__none__' : pct}`;
    (byKey[key] ||= []).push(q);
  });
  return Object.keys(byKey).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((key) => {
    const rows = byKey[key].slice().sort((a, b) => createdMs(b) - createdMs(a));
    const ready = rows.filter((r) => readiness(r).status === 'Ready').length;
    const pct = rows[0].groupDiscountPct === '' ? '' : String(rows[0].groupDiscountPct);
    const status = ready === rows.length ? 'Fully Ready' : ready > 0 ? 'In Progress' : 'Not Ready';
    return {
      key, rows, total: rows.length, ready, pending: rows.length - ready, status, pct,
      label: rows[0].quoteGroup || (pct ? `${pct}% Discount` : 'No Discount Set'),
      desc: status === 'Fully Ready' ? 'All INQs cleared. The estimate can be created.' : status === 'In Progress' ? `${ready} of ${rows.length} INQs ready` : 'No INQs have met the readiness conditions yet',
      customer: rows[0].customer, owner: rows[0].salesOwner, created: (rows[0].createdAt || '').slice(0, 10),
      project: rows[0].projectName || '— No Project —',
    };
  });
}

function QuoteGroups({ groups, search, askEstimate }) {
  const { act } = useStore();
  const [editing, setEditing] = useState({});
  const [draft, setDraft] = useState({});
  const [confirm, setConfirm] = useState(null);
  const s = search.trim().toLowerCase();

  const sections = useMemo(() => {
    const filtered = groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => !s || searchText(r).includes(s)) }))
      .filter((g) => g.rows.length);
    const byProject = {};
    filtered.forEach((g) => (byProject[g.project] ||= []).push(g));
    const newest = (gs) => Math.max(...gs.flatMap((g) => g.rows.map(createdMs)));
    return Object.keys(byProject)
      .sort((a, b) => (a === '— No Project —' ? 1 : b === '— No Project —' ? -1 : newest(byProject[b]) - newest(byProject[a])))
      .map((p) => ({ project: p, groups: byProject[p] }));
  }, [groups, s]);

  if (!sections.length) return <div className="empty">No quote groups match.</div>;

  const saveSrp = (q) => {
    const amount = parseFloat(draft[q.id]) || 0;
    if (amount <= 0) { act('inquiryApproveSrp', { id: q.id, amount: 0 }); return; }
    setConfirm({
      message: `Approve SRP amount of ${fmtPHP(amount)} for ${q.no}?`,
      run: () => { if (act('inquiryApproveSrp', { id: q.id, amount })) setEditing((e) => ({ ...e, [q.id]: false })); },
    });
  };

  return (
    <div className="qg-wrap">
      {sections.map((sec) => (
        <div key={sec.project} className="qg-project">
          <div className="qg-project-title">{sec.project}</div>
          {sec.groups.map((g) => {
            const targets = g.rows.filter((r) => r.status !== 'Sales Order' && readiness(r).status === 'Ready');
            const anyEstimated = targets.some((r) => r.status === 'Estimate Created');
            return (
              <div key={g.key} className="qg-card">
                <div className="qg-top">
                  <div>
                    <div className="qg-title">
                      <span className="qg-tag">{g.label}</span>
                      <span className={`pill pill-${g.status === 'Fully Ready' ? 'ok' : g.status === 'In Progress' ? 'warn' : 'bad'}`}>{g.status}</span>
                      <span className="muted">{g.desc}</span>
                    </div>
                    <div className="qg-meta">Customer: <b>{g.customer}</b> · Sales Owner: <b>{g.owner}</b> · Discount: <b>{g.pct !== '' ? `${g.pct}%` : '—'}</b> · Created: <b>{g.created}</b></div>
                  </div>
                  <div className="qg-right">
                    <div className="qg-counts">
                      <div><b>{g.total}</b><span>Total INQs</span></div>
                      <div><b className="pv-green">{g.ready}</b><span>Ready</span></div>
                      <div><b className="pv-amber">{g.pending}</b><span>Pending</span></div>
                    </div>
                    {g.status === 'Fully Ready' && targets.length ? (
                      <button className={`btn btn-sm ${anyEstimated ? '' : 'btn-green'}`} onClick={() => askEstimate(targets[0])}>{anyEstimated ? 'Update Estimate' : 'Create Estimate'}</button>
                    ) : (
                      <button className="btn btn-sm" disabled title="Every INQ in the group must be ready first">Create Estimate</button>
                    )}
                  </div>
                </div>
                <div className="qg-chips">
                  {g.rows.map((q) => {
                    const st = readiness(q).status;
                    const sel = selectedQuote(q);
                    const locked = Number(q.srp) > 0 && !editing[q.id];
                    return (
                      <div key={q.id} className="qg-chip" onClick={() => goTo(q.id)}>
                        <span className={`dot dot-${st === 'Ready' ? 'ok' : st === 'In Progress' ? 'warn' : 'bad'}`} />
                        <span className="qg-chip-label" title={`${q.no} · ${q.item}`}>{q.no} · {q.item}</span>
                        <span className="muted">Qty: <b>{q.qty} {q.unit}</b></span>
                        <span className="muted">Supplier: <b>{sel ? sel.supplier : '—'}</b></span>
                        <span className="muted" title="Supplier price per unit">Unit Price: <b>{sel ? fmtCNY(quoteFinal(sel)) : '—'}</b></span>
                        <span className="qg-srp" onClick={(e) => e.stopPropagation()}>
                          {q.status === 'Sales Order' ? (
                            <span>SRP: <b>{fmtPHP(q.srp)}</b></span>
                          ) : locked ? (
                            <>SRP: <b>{fmtPHP(q.srp)}</b> <button className="btn btn-sm" onClick={() => { setDraft((d) => ({ ...d, [q.id]: q.srp })); setEditing((e) => ({ ...e, [q.id]: true })); }}>Edit</button></>
                          ) : (
                            <>
                              SRP: ₱
                              <input
                                type="number" min="0" step="0.01" className="qg-srp-input" placeholder="0.00" aria-label={`SRP for ${q.no}`}
                                value={draft[q.id] ?? (q.srp || '')} onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveSrp(q); } }}
                              />
                              <button className="btn btn-sm btn-primary" onClick={() => saveSrp(q)}>Save</button>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {confirm && <ConfirmModal message={confirm.message} yes="Approve SRP" onNo={() => setConfirm(null)} onYes={() => { confirm.run(); setConfirm(null); }} />}
    </div>
  );
}
