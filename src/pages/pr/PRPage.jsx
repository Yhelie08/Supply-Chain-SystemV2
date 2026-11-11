import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { FormFields, Modal, Pill } from '../../ui/components.jsx';
import { CUSTOMER_TYPES, SALES_OWNERS } from '../../domain/inquiry.js';
import {
  HOLD_REASONS, PRIORITIES, PRICE_SOURCE_LABEL, SHIP_MODES, SOURCING_TYPES, holdDays, holdState, isInactive, loadBalancing, nextStep,
  portfolioLoad, priceInfo, readiness, recommendedSupplier,
} from '../../domain/pr.js';
import { fmtDate, fmtMoneyIn, fmtPHP } from '../../domain/util.js';
import { forecastRows, resolveSettings } from '../../domain/forecast.js';
import { ConfirmModal, NextStepPill } from '../inquiry/parts.jsx';
import PRDecisionWorkspace from './PRDecisionWorkspace.jsx';

const productOf = (db, r) => db.products.find((p) => p.sku === r.sku);
const priorityTone = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'neutral' };
const realSuppliers = (db) => db.suppliers.filter((s) => !s.stock).map((s) => s.name);

// ───────────── the page: seven views over the same PRs ─────────────

export default function PRPage({ sub = '' }) {
  const { db, today } = useStore();
  const [selectedPRId, setSelectedPRId] = useState(null);
  const rows = db.prs;
  const readyQueue = (r) => r.status === 'Ready for PO' && !isInactive(r);
  const count = (fn) => rows.filter(fn).length;
  // PRs whose forecast says the client date is at risk or will be missed.
  const forecast = useMemo(() => forecastRows(db, resolveSettings(db.settings && db.settings.forecast), today), [db, today]);
  const atRisk = new Set(forecast.filter((f) => f.sev.code === 'atrisk' || f.sev.code === 'miss').map((f) => f.o.prNo));

  const columns = [
    { key: 'no', label: 'PR NO.' },
    {
      key: 'workspace',
      label: 'DECISION WORKSPACE',
      render: (r) => (
        <button
          className="btn btn-sm"
          style={{
            background: 'var(--orange, #EA580C)',
            border: 'none',
            color: '#FFF',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPRId(r.id);
          }}
        >
          Workspace ↗
        </button>
      ),
    },
    { key: 'next', label: 'NEXT STEP', render: (r, d) => <NextStepPill ns={nextStep(r, productOf(d, r))} />, csv: (r, d) => nextStep(r, productOf(d, r)).action },
    { key: 'inqNo', label: 'INQ #', render: (r) => r.inqNo || '—' },
    { key: 'soNo', label: 'SO NO.' },
    { key: 'image', label: 'IMAGE', render: () => <span style={{ display: 'inline-block', width: '28px', height: '28px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', textAlign: 'center', lineHeight: '26px', fontSize: '11px' }}>🖼</span> },
    { key: 'item', label: 'PRODUCT' },
    { key: 'sku', label: 'SKU', render: (r) => <span className="mono">{r.sku}</span> },
    { key: 'qty', label: 'QTY', render: (r) => `${r.qty} ${r.unit || ''}`.trim(), csv: (r) => r.qty },
    { key: 'customer', label: 'CUSTOMER' },
    { key: 'recSupplier', label: 'REC. SUPPLIER', render: (r, d) => recommendedSupplier(r, productOf(d, r)) || '—' },
    { key: 'supplier', label: 'SELECTED SUPPLIER', render: (r) => r.supplier || '—' },
    { key: 'price', label: 'FINAL PRICE', render: (r, d) => { const i = priceInfo(r, productOf(d, r)); return i.final > 0 ? fmtMoneyIn(i.final, i.currency) : <span className="muted">—</span>; }, csv: (r, d) => priceInfo(r, productOf(d, r)).final },
    { key: 'targetDate', label: 'TARGET DATE', render: (r) => fmtDate(r.targetDate), csv: (r) => r.targetDate },
    { key: 'priority', label: 'PRIORITY', render: (r) => <Pill tone={priorityTone[r.priority] || 'neutral'}>{r.priority}</Pill>, csv: (r) => r.priority },
    {
      key: 'status', label: 'PR STATUS',
      render: (r) => (<><Pill tone={r.status === 'Ready for PO' ? 'ok' : 'neutral'}>● {r.status}</Pill>{r.hold && <> <Pill tone={r.hold === 'Cancelled' ? 'bad' : 'warn'}>{r.hold.toUpperCase()}</Pill></>}</>),
      csv: (r) => `${r.status}${r.hold ? ` (${r.hold})` : ''}`,
    },
    { key: 'createdAt', label: 'PR DATE', render: (r) => (r.createdAt ? fmtDate(r.createdAt) : fmtDate(today)) },
    { key: 'forecast', label: 'FORECAST', render: (r) => atRisk.has(r.no) ? <span className="pill pill-bad" style={{ fontSize: '11px' }}>⚠ At Risk</span> : <span className="pill pill-ok" style={{ fontSize: '11px' }}>On Track</span> },
    // Keep mode for backward compatibility
    { key: 'mode', label: 'Ship mode', render: (r) => (r.sourcingType === 'Local' ? 'Local' : r.mode || <span className="muted">—</span>), csv: (r) => (r.sourcingType === 'Local' ? 'Local' : r.mode) },
  ];

  const holdFields = [
    { key: 'reason', label: 'Reason', type: 'select', options: HOLD_REASONS, required: true },
    { key: 'notes', label: 'Notes', type: 'textarea', hint: 'Required when the reason is Other.' },
  ];

  if (selectedPRId) {
    return <PRDecisionWorkspace prId={selectedPRId} onBack={() => setSelectedPRId(null)} />;
  }

    return (
      <Screen
        title="Purchase Requests"
        subtitle="One PR per item. A PR becomes Ready for PO by itself once four conditions pass, then its Sales Order group is turned into a PO."
        rows={rows}
        columns={columns}
        searchKeys={['no', 'soNo', 'customer', 'item', 'sku', 'supplier', 'status', 'hold']}
        stats={[
          { label: 'Total Ready PRs', value: () => count(readyQueue), sub: 'Ready for PO', tone: 'ok' },
          { label: 'High Priority', value: () => count((r) => readyQueue(r) && r.priority === 'HIGH'), sub: 'Urgent action', tone: 'bad' },
          { label: 'At Risk', value: () => count((r) => atRisk.has(r.no) && !isInactive(r)), sub: 'Target date close', tone: 'warn' },
          { label: 'Supplier Overrides', value: () => count((r) => r.followedRecommendation === 'No' && r.status !== 'Converted to PO'), sub: 'Deviation logged' },
          { label: 'Near Capacity Suppliers', value: () => portfolioLoad(db.suppliers, db.pos).filter((s) => s.status !== 'Normal').length, sub: '80-99% load', tone: 'warn' },
          { label: 'On Hold', value: () => count((r) => r.hold === 'On Hold'), sub: 'Waiting on client', tone: 'warn' },
        ]}
        tabs={[
          { key: 'all', label: 'All PRs', test: () => true },
          { key: 'queue', label: 'Ready for PO Queue', test: readyQueue },
          { key: 'converted', label: 'Converted to PO', test: (r) => r.status === 'Converted to PO' },
          { key: 'onhold', label: 'On Hold', test: (r) => r.hold === 'On Hold' },
          { key: 'cancelled', label: 'Cancelled', test: (r) => r.hold === 'Cancelled' },
        { key: 'groups', label: 'PR Groups', test: () => true, render: () => <PRGroups /> },
        { key: 'load', label: 'Supplier Load View', test: () => true, render: () => <LoadView /> },
      ]}
      initialTab={sub}
      create={{ label: 'New PR', Modal: NewPRModal }}
      headExtra={({ setTab }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="pill pill-warn" style={{ fontWeight: 600 }}>● {count(readyQueue)} Ready for PO</span>
          <button className="btn" onClick={() => setTab('groups')}>PO Grouping Workspace</button>
        </div>
      )}
      actions={[
        {
          name: 'openWorkspace', label: 'Workspace', title: 'Open Decision Workspace', tone: 'primary',
          run: (r) => setSelectedPRId(r.id),
        },
        {
          name: 'prGroupCreatePO', label: 'Group→PO', title: 'Create Purchase Order (Group→PO)', tone: 'primary',
          when: (r) => readyQueue(r),
          payload: (r) => ({ soNo: r.soNo, customer: r.customer }),
          confirm: (r) => `Approve the active PRs for ${r.soNo || 'this order'} · ${r.customer} and convert them to a Purchase Order? Held or cancelled PRs are left out.`,
        },
        {
          name: 'prEdit', label: 'Edit', title: 'Edit PR', when: (r) => r.status !== 'Converted to PO',
          payload: (r, v) => ({ id: r.id, data: v }),
          fields: [
            { key: 'supplier', label: 'Selected supplier', type: 'select', options: realSuppliers(db), default: (r) => r.supplier, hint: 'Choosing a supplier other than the recommended one needs an override reason.' },
            { key: 'mode', label: 'Shipping mode', type: 'select', options: SHIP_MODES, default: (r) => r.mode, hint: 'Local PRs need no shipping mode.' },
            { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, default: (r) => r.priority },
            { key: 'price', label: 'Final price from supplier (¥)', type: 'number', default: (r) => r.price },
            { key: 'targetDate', label: 'Target date', type: 'date', default: (r) => r.targetDate },
            { key: 'overrideReason', label: 'Override reason', type: 'textarea', default: (r) => r.overrideReason },
          ],
        },
        {
          name: 'prSetSrp', label: 'Approve SRP', title: 'Approve SRP', when: (r) => r.status !== 'Converted to PO',
          intro: 'The approved SRP (PHP) becomes the final price and is what goes to the Purchase Order.',
          fields: [{ key: 'amount', label: 'SRP amount (₱)', type: 'number', required: true, default: (r) => r.srpApproved || '' }],
        },
        {
          name: 'prHold', label: 'Put on hold', title: 'Put PR on hold', submit: 'Put on hold', when: (r) => !r.hold && r.status !== 'Converted to PO',
          intro: 'On Hold means the client has not decided yet. The PR keeps its real status underneath.',
          fields: [...holdFields, { key: 'followUp', label: 'Follow up by', type: 'date' }],
        },
        {
          name: 'prHold', label: 'Cancel PR', tone: 'danger', title: 'Cancel PR', submit: 'Cancel this PR', when: (r) => r.hold !== 'Cancelled' && r.status !== 'Converted to PO',
          intro: 'Cancelled means the client confirmed. You can still restore it.',
          payload: (r, v) => ({ id: r.id, ...v, cancel: true }), fields: holdFields,
        },
        { name: 'prResume', label: 'Resume', when: (r) => r.hold === 'On Hold' },
        { name: 'prResume', label: 'Restore', when: (r) => r.hold === 'Cancelled' },
      ]}
      drawerExtra={(r, d) => <PRPanels pr={r} db={d} today={today} onOpenWorkspace={(id) => setSelectedPRId(id)} />}
    />
  );
}

// ───────────── detail panels: readiness, pricing, hold, supplier recommendation ─────────────

function PRPanels({ pr, db, today, onOpenWorkspace }) {
  const product = productOf(db, pr);
  const r = readiness(pr, product);
  const info = r.info;
  const rows = loadBalancing(db.suppliers, db.pos, pr.category, pr.quotes);
  const rec = recommendedSupplier(db.suppliers, db.pos, pr.category, pr.quotes);
  const days = holdDays(pr, today);
  return (
    <>
      {onOpenWorkspace && (
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: '16px', background: 'var(--orange, #EA580C)', borderColor: '#EA580C', color: '#FFF', fontWeight: 700 }}
          onClick={() => onOpenWorkspace(pr.id)}
        >
          Open Full Decision Workspace →
        </button>
      )}
      <h4>Readiness for PO ({r.passed} of 4)</h4>
      <div className="pr-checks">
        {r.checks.map((c) => (
          <div key={c.key} className={`check-item ${c.passed ? 'done' : ''}`}>
            <span className={`check-icon ${c.passed ? 'ci-done' : 'ci-pending'}`} aria-hidden="true">{c.passed ? '✓' : '✗'}</span>
            <div><div className="check-title">{c.title}</div><div className="check-sub">{c.sub}</div></div>
          </div>
        ))}
      </div>
      <h4>Pricing</h4>
      <dl className="kv">
        <div className="kv-row"><dt>Final price</dt><dd>{info.final > 0 ? fmtMoneyIn(info.final, info.currency) : '—'}</dd></div>
        <div className="kv-row"><dt>Price source</dt><dd>{PRICE_SOURCE_LABEL[info.source]}</dd></div>
        <div className="kv-row"><dt>Price status</dt><dd>{info.approved ? <Pill tone="ok">Approved</Pill> : <Pill tone="warn">Awaiting supplier quote</Pill>}</dd></div>
        <div className="kv-row"><dt>SRP approved</dt><dd>{pr.srpApproved > 0 ? fmtPHP(pr.srpApproved) : '—'}</dd></div>
        <div className="kv-row"><dt>Followed recommendation</dt><dd>{pr.followedRecommendation || '—'}{pr.overrideReason ? ` · ${pr.overrideReason}` : ''}</dd></div>
      </dl>
      {holdState(pr) !== 'Active' && (
        <>
          <h4>{pr.hold}</h4>
          <dl className="kv">
            <div className="kv-row"><dt>Reason</dt><dd>{pr.holdReason}</dd></div>
            {pr.holdNotes && <div className="kv-row"><dt>Notes</dt><dd>{pr.holdNotes}</dd></div>}
            <div className="kv-row"><dt>Since</dt><dd>{fmtDate(pr.holdDate)}{days != null ? ` (${days} day${days === 1 ? '' : 's'})` : ''}</dd></div>
            {pr.holdFollowUp && <div className="kv-row"><dt>Follow up by</dt><dd>{fmtDate(pr.holdFollowUp)}</dd></div>}
          </dl>
        </>
      )}
      <h4>Supplier recommendation{rec ? `: ${rec}` : ''}</h4>
      {rows.length === 0 ? <div className="muted">No category on this PR, so no recommendation.</div> : (
        <div className="table-wrap">
          <table className="table lb-table">
            <thead><tr><th>Supplier</th><th>Category</th><th>Active lines</th><th>Load</th><th>Eligibility</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.name}>
                  <td>{x.name}</td><td>{x.category}</td><td>{x.activePOs}</td>
                  <td>{x.percent}% <Pill tone={x.loadStatus === 'Overloaded' ? 'bad' : x.loadStatus === 'Near Capacity' ? 'warn' : 'ok'}>{x.loadStatus}</Pill></td>
                  <td><Pill tone={x.eligible === 'Recommended' ? 'ok' : x.eligible === 'Removed' ? 'neutral' : x.eligible === 'Available' ? 'info' : 'warn'}>{x.eligible}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ───────────── PR Groups: one card per Sales Order and customer, with Create PO and inline SRP ─────────────

function PRGroups() {
  const { db, act } = useStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState({});
  const [draft, setDraft] = useState({});
  const [confirm, setConfirm] = useState(null);
  const num = (no) => parseInt(String(no).replace(/[^0-9]/g, ''), 10) || 0;

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = {};
    db.prs.forEach((r) => {
      if (q && ![r.soNo, r.customer, r.no, r.sku, r.item].join(' ').toLowerCase().includes(q)) return;
      const key = `${r.soNo}||${r.customer}`;
      (map[key] ||= { key, soNo: r.soNo, customer: r.customer, rows: [] }).rows.push(r);
    });
    const out = Object.values(map);
    out.forEach((g) => g.rows.sort((a, b) => num(b.no) - num(a.no)));
    return out.sort((a, b) => num(b.rows[0].no) - num(a.rows[0].no));
  }, [db.prs, search]);

  const saveSrp = (r) => {
    const amount = parseFloat(draft[r.id]) || 0;
    if (amount <= 0) { act('prSetSrp', { id: r.id, amount: 0 }); return; }
    setConfirm({ message: `Approve SRP of ${fmtPHP(amount)} for ${r.no}?`, yes: 'Approve SRP', run: () => { if (act('prSetSrp', { id: r.id, amount })) setEditing((e) => ({ ...e, [r.id]: false })); } });
  };

  return (
    <div className="qg-wrap">
      <input className="search" type="search" placeholder="Search groups…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search groups" />
      {groups.length === 0 && <div className="empty">No PR groups match.</div>}
      {groups.map((g) => {
        const active = g.rows.filter((r) => !isInactive(r));
        const converted = g.rows.some((r) => r.status === 'Converted to PO');
        const ready = active.filter((r) => r.status === 'Ready for PO').length;
        return (
          <div key={g.key} className="qg-card">
            <div className="qg-top">
              <div>
                <div className="qg-title"><span className="qg-tag">{g.soNo || '— No SO —'}</span><b>{g.customer}</b></div>
                <div className="qg-meta">{g.rows.length} PR(s) · {ready} of {active.length} active ready{g.rows.length > active.length ? ` · ${g.rows.length - active.length} held or cancelled` : ''}</div>
              </div>
              <div className="qg-right">
                {converted ? <Pill tone="ok">Converted to PO</Pill> : (
                  <button className="btn btn-green btn-sm" onClick={() => setConfirm({
                    message: `Approve ${active.length} PR(s) for ${g.soNo} · ${g.customer} and convert to a Purchase Order?`, yes: 'Create PO',
                    run: () => act('prGroupCreatePO', { soNo: g.soNo, customer: g.customer }),
                  })}>Create PO →</button>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>PR</th><th>Product</th><th>SKU</th><th>Qty</th><th>Supplier</th><th>Unit price</th><th>SRP</th><th>Status</th></tr></thead>
                <tbody>
                  {g.rows.map((r) => {
                    const i = priceInfo(r, productOf(db, r));
                    const locked = r.status === 'Converted to PO';
                    const edit = editing[r.id];
                    return (
                      <tr key={r.id} style={{ cursor: 'default' }}>
                        <td data-label="PR">{r.no}</td><td data-label="Product">{r.item}</td><td data-label="SKU"><span className="mono">{r.sku}</span></td>
                        <td data-label="Qty">{r.qty} {r.unit}</td><td data-label="Supplier">{r.supplier || '—'}</td>
                        <td data-label="Unit price">{i.final > 0 ? fmtMoneyIn(i.final, i.currency) : '—'}</td>
                        <td data-label="SRP">
                          {edit ? (
                            <span className="qg-srp">₱<input type="number" min="0" step="0.01" className="qg-srp-input" aria-label={`SRP for ${r.no}`} value={draft[r.id] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && saveSrp(r)} />
                              <button className="btn btn-sm btn-primary" onClick={() => saveSrp(r)}>Save</button>
                              <button className="btn btn-sm" onClick={() => setEditing((e) => ({ ...e, [r.id]: false }))}>Cancel</button></span>
                          ) : (
                            <span className="qg-srp">{r.srpApproved > 0 ? fmtPHP(r.srpApproved) : '—'}
                              {!locked && <button className="btn btn-sm" onClick={() => { setDraft((d) => ({ ...d, [r.id]: r.srpApproved || '' })); setEditing((e) => ({ ...e, [r.id]: true })); }}>Edit</button>}</span>
                          )}
                        </td>
                        <td data-label="Status"><Pill>{r.status}</Pill>{r.hold && <> <Pill tone={r.hold === 'Cancelled' ? 'bad' : 'warn'}>{r.hold.toUpperCase()}</Pill></>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {confirm && <ConfirmModal message={confirm.message} yes={confirm.yes} onNo={() => setConfirm(null)} onYes={() => { confirm.run(); setConfirm(null); }} />}
    </div>
  );
}

// ───────────── Supplier Load View ─────────────

function LoadView() {
  const { db } = useStore();
  const rows = portfolioLoad(db.suppliers, db.pos);
  return (
    <div className="card-body">
      <p className="muted">Load is the number of PO lines on unfinished POs against each supplier&apos;s capacity. It is shown for information and never blocks a PR.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Supplier</th><th>Handles</th><th>Active PO lines</th><th>Capacity</th><th>Load</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.name} style={{ cursor: 'default' }}>
                <td data-label="Supplier"><b>{x.name}</b></td><td data-label="Handles">{x.categories}</td><td data-label="Active PO lines">{x.active}</td>
                <td data-label="Capacity">{x.maxCapacity || '—'}</td>
                <td data-label="Load"><div className="load-bar" role="img" aria-label={`${x.percent}% loaded`}><span style={{ width: `${Math.min(100, x.percent)}%` }} className={x.status === 'Overloaded' ? 'bad' : x.status === 'Near Capacity' ? 'warn' : 'ok'} /></div> {x.percent}%</td>
                <td data-label="Status"><Pill tone={x.status === 'Overloaded' ? 'bad' : x.status === 'Near Capacity' ? 'warn' : 'ok'}>{x.status}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────── New PR: a PR created by hand rather than from an inquiry ─────────────

function NewPRModal({ onClose }) {
  const { db, act } = useStore();
  const [v, setV] = useState({
    sourcingType: 'Import', itemId: '', qty: '', targetDate: '', customerId: '', customerType: '', salesOwner: '', soNo: '', supplier: '', mode: '',
    priority: 'MEDIUM', price: '', overrideReason: '', similarItem: false,
  });
  const set = (k, val) => setV((s) => {
    const next = { ...s, [k]: val };
    if (k === 'customerId') { const c = db.customers.find((x) => x.id === val); next.customerType = c && CUSTOMER_TYPES.includes(c.type) ? c.type : s.customerType; }
    if (k === 'sourcingType' && val === 'Local') Object.assign(next, { supplier: 'HC System', mode: '', overrideReason: '' });
    if (k === 'sourcingType' && val === 'Import' && s.supplier === 'HC System') next.supplier = '';
    return next;
  });
  const local = v.sourcingType === 'Local';
  const product = db.products.find((p) => p.id === v.itemId);
  const recommended = product ? recommendedSupplier(db.suppliers, db.pos, product.category, []) : '';
  const needsOverride = !local && !!v.supplier;
  const fields = [
    { key: 'sourcingType', label: 'Sourcing type', type: 'select', options: SOURCING_TYPES, hint: 'Local sources from HC System, with no freight.' },
    { key: 'itemId', label: 'Item / SKU', type: 'select', options: db.products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` })), required: true },
    { key: 'qty', label: 'Quantity', type: 'number', required: true },
    { key: 'targetDate', label: 'Target date', type: 'date', required: true },
    { key: 'customerId', label: 'Customer', type: 'select', options: db.customers.map((c) => ({ value: c.id, label: c.name })), required: true },
    { key: 'customerType', label: 'Customer type', type: 'select', options: CUSTOMER_TYPES, required: true },
    { key: 'salesOwner', label: 'Sales owner', type: 'select', options: SALES_OWNERS, required: true },
    { key: 'soNo', label: 'Sales order (optional)' },
    ...(local ? [] : [
      { key: 'supplier', label: 'Selected supplier', type: 'select', options: realSuppliers(db).filter((n) => n !== 'HC System'), hint: `Recommended: ${recommended || '— (no supplier has quoted yet)'}` },
      { key: 'mode', label: 'Shipping mode', type: 'select', options: SHIP_MODES },
    ]),
    { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
    { key: 'price', label: 'Final price from supplier (¥)', type: 'number' },
    ...(needsOverride ? [{ key: 'overrideReason', label: 'Override reason', type: 'textarea', required: true, hint: 'Required because this supplier is not the recommended one.' }] : []),
    { key: 'similarItem', label: 'A similar item is acceptable', type: 'checkbox' },
  ];
  return (
    <Modal title="New Purchase Request" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button type="submit" form="new-pr" className="btn btn-primary">Submit PR →</button></>}>
      <form id="new-pr" noValidate onSubmit={(e) => { e.preventDefault(); if (act('prCreate', { data: { ...v, qty: Number(v.qty) } })) onClose(); }}>
        <p className="intro">Supplier, price and shipping mode can be filled in later. The PR becomes Ready for PO by itself once its four conditions pass.</p>
        <FormFields fields={fields} values={v} setValue={set} />
      </form>
    </Modal>
  );
}
