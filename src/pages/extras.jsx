import { useState } from 'react';
import { useStore } from '../store.jsx';
import Screen from '../ui/Screen.jsx';
import { FormFields, Pill } from '../ui/components.jsx';
import { fmtDate, fmtPHP } from '../domain/util.js';
import {
  DELIVERY_TYPES, EC_STATES, ORDER_OF, TRUCKS, WAREHOUSES, orderRows,
} from '../domain/fulfillment.js';

const dateCol = (key, label) => ({ key, label, render: (r) => fmtDate(r[key]), csv: (r) => r[key] || '' });
const pillCol = (key, label = 'Status') => ({ key, label, pill: true });
const count = (test) => (rows) => rows.filter(test).length;
const Empty = ({ children }) => <div className="empty">{children}</div>;

// ───────────────────────────── Fulfillment ─────────────────────────────

const createPackage = {
  name: 'packageCreateOrder', label: 'Create Package', title: 'Create Package',
  intro: (r) => `One package for ${r.soNo}. It covers the whole order, so every item must be received.`,
  when: (r) => r.canPackage,
  fields: [{ key: 'deliveryType', label: 'Delivery Type', type: 'select', options: DELIVERY_TYPES, required: true }],
  payload: (r, v) => ({ soNo: r.soNo, ...v }),
};

function Bar({ label, value, max, tone }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track"><span className={`bar-fill ${tone || ''}`} style={{ width: `${max ? Math.round((value * 100) / max) : 0}%` }} /></span>
      <span className="bar-val">{value}</span>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return <div className={`stat ${tone ? 'stat-' + tone : ''}`}><div className="stat-value">{value}</div><div className="stat-label">{label}</div>{sub && <div className="stat-sub">{sub}</div>}</div>;
}

export function FulfillmentDashboard() {
  const { db } = useStore();
  const [view, setView] = useState('Overview');
  const items = db.items;
  const orders = orderRows(db);
  const ff = db.exceptions.filter((e) => e.source === 'Fulfillment');
  const inPipeline = items.filter((i) => i.stage !== 'Dispatched').length;
  const stages = ORDER_OF.slice(0, 6).map((s) => [s, orders.filter((o) => o.stage === s).length]);
  const max = Math.max(1, ...stages.map(([, n]) => n));
  const bottleneck = stages.slice().sort((a, b) => b[1] - a[1])[0];
  const tally = (key) => items.reduce((m, i) => { if (i[key]) m[i[key]] = (m[i[key]] || 0) + 1; return m; }, {});
  return (
    <section className="screen">
      <header className="screen-head"><div><h1>Fulfillment Dashboard</h1><p className="muted">Fulfillment Scoreboard: live data across the pipeline, from order readiness through pick, pack, quality check and delivery.</p></div></header>
      <div className="stats">
        <Stat label="Items in Pipeline" value={inPipeline} />
        <Stat label="New Items" value={items.filter((i) => i.stage === 'Readiness Gate').length} sub="at Order Readiness" tone="warn" />
        <Stat label="Delivered" value={items.filter((i) => i.stage === 'Dispatched').length} tone="ok" />
        <Stat label="Open Issues" value={ff.filter((e) => e.status !== 'Closed').length} tone="bad" />
        <Stat label="QC Passed" value={items.filter((i) => i.qcStatus === 'Approved').length} tone="ok" />
        <Stat label="QC Damaged" value={ff.length} tone="bad" />
        <Stat label="Items Picked" value={items.filter((i) => !['Readiness Gate', 'Pick'].includes(i.stage)).length} />
        <Stat label="Items Packed" value={items.filter((i) => ['Crate', 'Order Aggregation', 'Dispatched'].includes(i.stage) || i.qcStatus === 'Approved').length} />
      </div>
      <div className="card">
        <div className="toolbar"><div className="tabs" role="tablist">
          {['Overview', 'Quality', 'Team'].map((v) => <button key={v} role="tab" aria-selected={view === v} className={`tab ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{v}</button>)}
        </div></div>
        <div className="pad">
          {view === 'Overview' && (
            <>
              <h3 className="card-title">Pipeline by stage</h3>
              {stages.map(([s, n]) => <Bar key={s} label={s} value={n} max={max} />)}
              <p className="hint">Bottleneck: <b>{bottleneck[1] ? bottleneck[0] : 'none'}</b>{bottleneck[1] ? ` (${bottleneck[1]} order(s) waiting)` : ''}.</p>
            </>
          )}
          {view === 'Quality' && (
            <>
              <h3 className="card-title">QC results</h3>
              {Object.entries(tally('qcStatus')).map(([k, n]) => <Bar key={k} label={k} value={n} max={items.length} tone={k === 'Rejected' ? 'bad' : ''} />)}
              <h3 className="card-title">Exception Control</h3>
              {EC_STATES.map((st) => <Bar key={st} label={st} value={ff.filter((e) => (e.fcStatus || 'Pending') === st).length} max={Math.max(1, ff.length)} />)}
            </>
          )}
          {view === 'Team' && (
            <>
              <h3 className="card-title">Pickers</h3>
              {Object.entries(tally('picker')).map(([k, n]) => <Bar key={k} label={k} value={n} max={items.length} />)}
              <h3 className="card-title">Packers and checkers</h3>
              {Object.entries(tally('packer')).map(([k, n]) => <Bar key={k} label={k} value={n} max={items.length} />)}
              {Object.keys(tally('picker')).length + Object.keys(tally('packer')).length === 0 && <Empty>No one is assigned yet.</Empty>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Groupings({ rows }) {
  const by = ORDER_OF.map((s) => [s, rows.filter((r) => r.stage === s)]).filter(([, l]) => l.length);
  if (!by.length) return <Empty>Nothing here yet.</Empty>;
  return (
    <div className="grouping">
      {by.map(([s, list]) => (
        <div className="card group-card" key={s}>
          <div className="group-head"><b>{s}</b><span className="muted">{list.length}</span></div>
          <ul className="plain-list">{list.map((r) => <li key={r.id}><b>{r.soNo}</b> · {r.customer} · {r.lines} line(s) · {r.qty} pcs {r.pac && <span className="muted">· {r.pac}</span>}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

const orderCols = [
  { key: 'soNo', label: 'Sales Order' }, { key: 'customer', label: 'Customer' }, { key: 'lines', label: 'Lines' }, { key: 'qty', label: 'Qty' },
  { key: 'orderType', label: 'Order Type' }, { key: 'pac', label: 'PAC #' }, { key: 'deliveryType', label: 'Delivery Type' },
  { key: 'stage', label: 'Stage', pill: true },
];

export function SalesOrderReport() {
  const { db } = useStore();
  const rows = orderRows(db);
  const stat = (s) => ({ label: s, value: count((r) => r.stage === s), tone: undefined });
  return (
    <Screen
      title="Sales Order Report"
      subtitle="Sales orders grouped by Sales Order, latest first, with a stage card for every step."
      rows={rows}
      columns={orderCols}
      tabs={[
        { key: 'list', label: 'List', test: () => true },
        { key: 'groupings', label: 'Groupings', test: () => true, render: () => <Groupings rows={rows} /> },
        { key: 'package', label: 'Create Package', test: (r) => r.canPackage },
      ]}
      stats={[
        { ...stat('Waiting for Package'), tone: 'warn' }, stat('Order Readiness'), stat('Picking'), stat('Quality Checking'), stat('Crate'),
        { ...stat('For Delivery'), tone: 'ok' }, { label: 'Exceptions', value: count((r) => r.exception), tone: 'bad' },
      ]}
      actions={[createPackage]}
    />
  );
}

export function PreOrder() {
  const { db } = useStore();
  const rows = orderRows(db).filter((o) => /pre order/i.test(o.orderType)).map((o) => ({
    ...o, received: o.items.every((i) => i.received), forCrate: o.items.some((i) => i.forCrate),
    onHold: o.items.some((i) => db.prs.some((p) => p.no === i.prNo && p.hold === 'On Hold')),
  }));
  return (
    <Screen
      title="Pre-Order"
      subtitle="Pre-order report: received pre-orders waiting for a package."
      rows={rows}
      columns={orderCols}
      tabs={[
        { key: 'list', label: 'List', test: () => true },
        { key: 'groupings', label: 'Groupings', test: () => true, render: () => <Groupings rows={rows} /> },
      ]}
      stats={[
        { label: 'Pending', value: count((r) => !r.received), tone: 'warn' },
        { label: 'Received', value: count((r) => r.received), tone: 'ok' },
        { label: 'For Crate', value: count((r) => r.forCrate) },
        { label: 'Exceptions', value: count((r) => r.exception), tone: 'bad' },
        { label: 'On Hold', value: count((r) => r.onHold), tone: 'warn' },
      ]}
      empty="No pre-orders. They appear here when an inquiry with the Pre Order type becomes a Sales Order."
      actions={[createPackage]}
    />
  );
}

export function ExceptionControl() {
  const { db } = useStore();
  const rows = db.exceptions.filter((e) => e.source === 'Fulfillment').map((e) => ({ ...e, fc: e.fcStatus || 'Pending', so: (db.items.find((i) => i.id === e.itemId) || {}).soNo || '' }));
  const pill = (s) => ({ key: 'p-' + s, label: s, test: (r) => s === 'All' || r.fc === s });
  return (
    <Screen
      title="Exception Control"
      subtitle="Damaged items: exception module for items rejected during QC, assessed, reworked and resolved before re-dispatch."
      rows={rows}
      columns={[
        { key: 'no', label: 'Exception' }, { key: 'so', label: 'Sales Order' }, { key: 'item', label: 'Item' }, { key: 'type', label: 'Type' }, { key: 'qty', label: 'Qty' },
        { key: 'notes', label: 'Reason' }, { key: 'rrNo', label: 'Replacement' }, { key: 'fc', label: 'Status', pill: true },
      ]}
      tabs={[
        { key: 'qc', label: 'QC Rejects', test: () => true },
        { key: 'cms', label: 'CMS Complaints', test: () => false, render: () => <Empty>No complaints have come in from CMS yet.</Empty> },
        ...['All', ...EC_STATES].map(pill),
      ]}
      stats={EC_STATES.map((st) => ({ label: st, value: count((r) => r.fc === st), tone: st === 'Unrepairable' ? 'bad' : st === 'Completed' ? 'ok' : st === 'In Rework' ? 'warn' : undefined }))}
      actions={[
        { name: 'ecRework', label: 'Send to rework', when: (r) => r.fc === 'Pending' },
        { name: 'ecUnrepairable', label: 'Unrepairable', tone: 'danger', title: 'Mark unrepairable', submit: 'Mark unrepairable', when: (r) => ['Pending', 'In Rework'].includes(r.fc), confirm: 'Mark this item unrepairable? A replacement can then be requested.' },
        { name: 'ecComplete', label: 'Complete rework', when: (r) => r.fc === 'In Rework' },
        {
          name: 'exceptionCreateRR', label: 'Create RR', title: 'Create Replacement Request', when: (r) => r.fc === 'Unrepairable' && !r.rrNo,
          fields: [{ key: 'supplier', label: 'Source the replacement from', type: 'select', options: db.suppliers.filter((x) => !x.stock).map((x) => x.name), required: true, default: (r) => r.supplier }],
        },
      ]}
    />
  );
}

export function TransferItem() {
  const { db } = useStore();
  const kinds = ['Warehouse Request', 'Transfer Warehouse'];
  return (
    <Screen
      title="Transfer Item"
      subtitle="Warehouse requests and warehouse-to-warehouse transfers."
      rows={db.transfers}
      columns={[
        { key: 'no', label: 'Transfer' }, { key: 'kind', label: 'Type' }, { key: 'item', label: 'Item' }, { key: 'qty', label: 'Qty' },
        { key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'status', label: 'Status', pill: true },
      ]}
      tabs={kinds.map((k) => ({ key: k, label: k, test: (r) => r.kind === k }))}
      stats={[
        { label: 'Pending', value: count((r) => ['Pending', 'Pending Dispatch', 'Dispatched'].includes(r.status)), tone: 'warn' },
        { label: 'Done', value: count((r) => ['Done', 'Received'].includes(r.status)), tone: 'ok' },
      ]}
      create={{
        label: 'New Request', action: 'transferCreate', title: 'New Request', submit: 'Create',
        fields: [
          { key: 'kind', label: 'Type', type: 'select', options: kinds, required: true, default: kinds[0] },
          { key: 'item', label: 'Item', required: true },
          { key: 'qty', label: 'Quantity', type: 'number', required: true },
          { key: 'from', label: 'From', type: 'select', options: WAREHOUSES, required: true },
          { key: 'to', label: 'To', type: 'select', options: WAREHOUSES, required: true },
        ],
      }}
      actions={[{
        name: 'transferAdvance', label: 'Next step', when: (r) => !['Done', 'Received'].includes(r.status),
      }]}
    />
  );
}

// ───────────────────────────── Delivery Management ─────────────────────────────

export function DeliveryAnalytics() {
  const { db, today } = useStore();
  const [, again] = useState(0);
  const sr = db.serviceRequests;
  const done = sr.filter((s) => s.status === 'Completed');
  const tiles = [
    ['Service Requests Added (Today)', sr.filter((s) => s.createdOn === today).length],
    ['Pending Appointments (Assigned)', sr.filter((s) => s.status === 'Scheduled').length],
    ['Complete Appointments (Assigned)', done.length],
    ['Completed Installations (Today)', done.filter((s) => s.type === 'Installation').length],
    ['Failed Deliveries', sr.filter((s) => s.status === 'Exception').length],
  ];
  const byTeam = db.teams.map((t) => [t.name, sr.filter((s) => s.team === t.id).length]);
  const max = Math.max(1, ...byTeam.map(([, n]) => n));
  return (
    <section className="screen">
      <header className="screen-head">
        <div><h1>Delivery Analytics</h1><p className="muted">Read-only dashboard: service requests, installations, deliveries and exceptions at a glance.</p></div>
        <div className="head-actions"><button className="btn" onClick={() => again((n) => n + 1)}>Refresh</button></div>
      </header>
      <div className="stats">{tiles.map(([l, v], i) => <Stat key={l} label={l} value={v} tone={i === 4 ? 'bad' : i === 2 ? 'ok' : undefined} />)}</div>
      <div className="card pad">
        <h3 className="card-title">Jobs by team</h3>
        {byTeam.map(([n, v]) => <Bar key={n} label={n} value={v} max={max} />)}
        <h3 className="card-title">By status</h3>
        {['Initial Scheduling', 'Service Request', 'Scheduled', 'Ongoing', 'Completed', 'Exception'].map((s) => <Bar key={s} label={s} value={sr.filter((x) => x.status === s).length} max={Math.max(1, sr.length)} />)}
      </div>
    </section>
  );
}

export function Archived() {
  const { db } = useStore();
  const rows = db.serviceRequests.filter((s) => ['Completed', 'Exception'].includes(s.status)).map((s) => ({ ...s, outcome: s.status === 'Completed' ? 'Completed' : 'Failed', hasReturn: db.salesReturns.some((r) => r.srNo === s.no) }));
  return (
    <Screen
      title="Archived"
      subtitle="Completed and failed deliveries with their installation outcome."
      rows={rows}
      columns={[
        { key: 'no', label: 'Service Request' }, { key: 'soNo', label: 'Sales Order' }, { key: 'customer', label: 'Customer' }, { key: 'type', label: 'Type' },
        dateCol('scheduledDate', 'Date'), { key: 'team', label: 'Team', render: (r) => (db.teams.find((t) => t.id === r.team) || {}).name || '—', csv: (r) => r.team }, { key: 'outcome', label: 'Outcome', pill: true },
        { key: 'hasReturn', label: 'Return', render: (r) => (r.hasReturn ? <Pill>Opened</Pill> : <span className="muted">—</span>), csv: (r) => (r.hasReturn ? 'Opened' : '') },
      ]}
      tabs={[
        { key: 'archived', label: 'Archived', test: () => true },
        { key: 'ship', label: 'Create Shipment', test: (r) => r.outcome === 'Failed' && !r.hasReturn },
        ...['All', 'Completed', 'Failed'].map((s) => ({ key: 'p-' + s, label: s, test: (r) => s === 'All' || r.outcome === s })),
      ]}
      stats={[
        { label: 'Total Archived', value: (r) => r.length },
        { label: 'Completed', value: count((r) => r.outcome === 'Completed'), tone: 'ok' },
        { label: 'Failed', value: count((r) => r.outcome === 'Failed'), tone: 'bad' },
        { label: 'Installation Complete', value: count((r) => r.outcome === 'Completed' && r.type === 'Installation') },
      ]}
      create={{
        label: 'Create Sales Return', action: 'salesReturnCreate', title: 'Create Sales Return', submit: 'Create',
        fields: [
          { key: 'id', label: 'Delivery', type: 'select', required: true, options: rows.filter((r) => !r.hasReturn).map((r) => ({ value: r.id, label: `${r.no} · ${r.customer} (${r.outcome})` })) },
          { key: 'warehouse', label: 'Return to warehouse', type: 'select', options: WAREHOUSES, default: WAREHOUSES[0] },
        ],
      }}
      actions={[{
        name: 'salesReturnCreate', label: 'Create Sales Return', when: (r) => !r.hasReturn,
        fields: [{ key: 'warehouse', label: 'Return to warehouse', type: 'select', options: WAREHOUSES, default: WAREHOUSES[0] }],
      }]}
    />
  );
}

export function SiteVisits() {
  const { db } = useStore();
  const kinds = ['Installation Assessment', 'Repair Assessment', 'Other'];
  return (
    <Screen
      title="Field Service Site Visits"
      subtitle="Site assessments before installation or repair."
      rows={db.siteVisits}
      columns={[
        { key: 'no', label: 'Visit' }, { key: 'srNo', label: 'Service Request' }, { key: 'customer', label: 'Customer' }, { key: 'kind', label: 'Type' },
        dateCol('visitDate', 'Date'), { key: 'siteReady', label: 'Site Ready', render: (r) => <Pill tone={r.siteReady ? 'ok' : 'warn'}>{r.siteReady ? 'Ready' : 'Not ready'}</Pill>, csv: (r) => (r.siteReady ? 'Ready' : 'Not ready') },
        { key: 'notes', label: 'Notes' },
      ]}
      tabs={['All', ...kinds].map((k) => ({ key: k, label: k, test: (r) => k === 'All' || r.kind === k }))}
      stats={[
        { label: 'Total Visits', value: (r) => r.length },
        { label: 'Site Ready', value: count((r) => r.siteReady), tone: 'ok' },
        { label: 'Installation', value: count((r) => r.kind === 'Installation Assessment') },
        { label: 'Repair', value: count((r) => r.kind === 'Repair Assessment') },
      ]}
      actions={[{
        name: 'siteVisitUpdate', label: 'Save Changes', title: 'Save site visit',
        fields: [
          { key: 'siteReady', label: 'Site is ready', type: 'checkbox', default: (r) => r.siteReady },
          { key: 'notes', label: 'Notes', type: 'textarea', default: (r) => r.notes },
        ],
      }]}
      create={{
        label: 'Schedule Visit', action: 'siteVisitCreate', title: 'Schedule a site visit', submit: 'Schedule',
        fields: [
          { key: 'id', label: 'Service Request', type: 'select', required: true, options: db.serviceRequests.filter((s) => !['Completed'].includes(s.status)).map((s) => ({ value: s.id, label: `${s.no} · ${s.customer}` })) },
          { key: 'kind', label: 'Type', type: 'select', options: kinds, required: true },
          { key: 'visitDate', label: 'Visit date', type: 'date' },
        ],
      }}
    />
  );
}

export function SalesReturns() {
  const { db } = useStore();
  return (
    <Screen
      title="Sales Returns"
      subtitle="Returns and reverse logistics, sent to Books."
      rows={db.salesReturns}
      columns={[
        { key: 'no', label: 'Return' }, { key: 'srNo', label: 'Service Request' }, { key: 'soNo', label: 'Sales Order' }, { key: 'customer', label: 'Customer' },
        { key: 'warehouse', label: 'Warehouse' }, { key: 'rma', label: 'RMA' }, { key: 'reason', label: 'Reason' }, { key: 'qty', label: 'Qty' }, { key: 'status', label: 'Status', pill: true },
      ]}
      tabs={['All', 'Created', 'Pending'].map((s) => ({ key: s, label: s, test: (r) => s === 'All' || r.status === s }))}
      stats={[
        { label: 'Total Returns', value: (r) => r.length },
        { label: 'Created', value: count((r) => r.status === 'Created'), tone: 'ok' },
        { label: 'Pending', value: count((r) => r.status === 'Pending'), tone: 'warn' },
        { label: 'Warehouses Involved', value: (r) => new Set(r.map((x) => x.warehouse)).size },
      ]}
      actions={[{
        name: 'salesReturnSendToBooks', label: 'Send to Books', title: 'Send return to Books', when: (r) => r.status === 'Pending',
        fields: [
          { key: 'rma', label: 'RMA number', required: true },
          { key: 'reason', label: 'Reason', type: 'textarea', required: true },
          { key: 'qty', label: 'Item quantity', type: 'number', required: true },
          { key: 'signature', label: 'Signature (type the name)', required: true },
        ],
      }]}
    />
  );
}

function Entries({ kind }) {
  const { db, act, today } = useStore();
  const rows = db.truckEntries.filter((e) => e.kind === kind);
  const [f, setF] = useState({ truck: TRUCKS[0], date: today, cost: '', liters: '', note: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const fields = [
    { key: 'truck', label: 'Truck', type: 'select', options: TRUCKS, required: true },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'cost', label: 'Cost (₱)', type: 'number', required: true },
    ...(kind === 'fuel' ? [{ key: 'liters', label: 'Liters', type: 'number' }] : []),
    { key: 'note', label: 'Note' },
  ];
  return (
    <div className="pad">
      <form onSubmit={(e) => { e.preventDefault(); if (act('truckEntryAdd', { kind, ...f })) setF((s) => ({ ...s, cost: '', liters: '', note: '' })); }}>
        <FormFields fields={fields} values={f} setValue={set} />
        <button type="submit" className="btn btn-primary">Add {kind === 'fuel' ? 'fuel' : 'service'} entry</button>
      </form>
      {rows.length === 0 ? <Empty>No entries yet.</Empty> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Date</th><th>Truck</th>{kind === 'fuel' && <th>Liters</th>}<th>Cost</th><th>Note</th></tr></thead>
          <tbody>{rows.map((e) => <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.truck}</td>{kind === 'fuel' && <td>{e.liters}</td>}<td>{fmtPHP(e.cost)}</td><td>{e.note || '—'}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

export function TruckMaintenance() {
  const { db } = useStore();
  return (
    <Screen
      title="Truck Maintenance"
      subtitle="Daily vehicle checklist, fuel entries and service entries."
      rows={db.truckChecks}
      columns={[
        { key: 'no', label: 'Checklist' }, { key: 'truck', label: 'Truck' }, dateCol('date', 'Date'), { key: 'issues', label: 'Issues found' },
        { key: 'notes', label: 'Notes' }, { key: 'signature', label: 'Signed by' }, { key: 'status', label: 'Status', pill: true },
      ]}
      tabs={[
        { key: 'track', label: 'Track Maintenance', test: () => true },
        { key: 'fuel', label: 'Fuel Entries', test: () => true, render: () => <Entries kind="fuel" /> },
        { key: 'service', label: 'Service Entries', test: () => true, render: () => <Entries kind="service" /> },
      ]}
      stats={[
        { label: 'Total Checklists', value: (r) => r.length },
        { label: 'Open', value: count((r) => r.status === 'Open'), tone: 'warn' },
        { label: 'In Progress', value: count((r) => r.status === 'In Progress') },
        { label: 'Completed', value: count((r) => r.status === 'Completed'), tone: 'ok' },
        { label: 'Issues Found', value: (r) => r.reduce((n, c) => n + c.issues, 0), tone: 'bad' },
      ]}
      create={{
        label: 'Add Checklist', action: 'truckChecklistCreate', title: 'Add Checklist', submit: 'Add',
        fields: [
          { key: 'truck', label: 'Truck', type: 'select', options: TRUCKS, required: true },
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'issues', label: 'Issues found', type: 'number', default: 0 },
          { key: 'notes', label: 'Notes', type: 'textarea' },
        ],
      }}
      actions={[
        { name: 'truckChecklistAdvance', label: 'Start', when: (r) => r.status === 'Open' },
        {
          name: 'truckChecklistAdvance', label: 'Complete', title: 'Complete checklist', when: (r) => r.status === 'In Progress',
          fields: [{ key: 'signature', label: 'Signature (type the name)', required: true }],
        },
      ]}
    />
  );
}

export function ScheduleRequests() {
  const { db } = useStore();
  return (
    <Screen
      title="Schedule Requests"
      subtitle="Client requests to change a delivery schedule."
      rows={db.scheduleRequests}
      columns={[
        { key: 'no', label: 'Request' }, { key: 'srNo', label: 'Service Request' }, { key: 'customer', label: 'Customer' },
        dateCol('currentDate', 'Current date'), dateCol('newDate', 'Wants'), { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status', pill: true },
      ]}
      tabs={['All', 'Pending Review', 'Confirmed', 'Declined'].map((s) => ({ key: s, label: s, test: (r) => s === 'All' || r.status === s }))}
      create={{
        label: 'New Request', action: 'scheduleRequestCreate', title: 'New schedule request', submit: 'Send request',
        fields: [
          { key: 'id', label: 'Service Request', type: 'select', required: true, options: db.serviceRequests.filter((s) => s.status !== 'Completed').map((s) => ({ value: s.id, label: `${s.no} · ${s.customer}` })) },
          { key: 'newDate', label: 'New date', type: 'date', required: true },
          { key: 'reason', label: 'Reason', type: 'textarea', required: true },
        ],
      }}
      actions={[
        { name: 'scheduleRequestDecide', label: 'Confirm', when: (r) => r.status === 'Pending Review', payload: (r) => ({ id: r.id, decision: 'Confirm' }), confirm: (r) => `Move ${r.srNo} to start from ${r.newDate}?` },
        {
          name: 'scheduleRequestDecide', label: 'Decline', tone: 'danger', title: 'Decline request', submit: 'Decline', when: (r) => r.status === 'Pending Review',
          fields: [{ key: 'note', label: 'Why?', type: 'textarea', required: true }], payload: (r, v) => ({ id: r.id, decision: 'Decline', ...v }),
        },
      ]}
    />
  );
}

export { pillCol };
