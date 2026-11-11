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
import {
  DeliveryAnalytics as _DeliveryAnalytics,
  ArchivedScreen as _Archived,
  SiteVisitsScreen as _SiteVisits,
  SalesReturnsScreen as _SalesReturns,
  TruckMaintenanceScreen as _TruckMaintenance,
  ScheduleRequestsScreen as _ScheduleRequests,
} from './delivery/index.js';

export function DeliveryAnalytics(props) {
  return <_DeliveryAnalytics {...props} />;
}
export function Archived(props) {
  return <_Archived {...props} />;
}
export function SiteVisits(props) {
  return <_SiteVisits {...props} />;
}
export function SalesReturns(props) {
  return <_SalesReturns {...props} />;
}
export function TruckMaintenance(props) {
  return <_TruckMaintenance {...props} />;
}
export function ScheduleRequests(props) {
  return <_ScheduleRequests {...props} />;
}



export { pillCol };
