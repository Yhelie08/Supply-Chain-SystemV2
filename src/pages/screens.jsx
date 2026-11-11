import { useState } from 'react';
import { useStore } from '../store.jsx';
import Screen from '../ui/Screen.jsx';
import { Pill } from '../ui/components.jsx';
import { paymentOK } from '../domain/actions.js';
import { fmtDate, fmtMoneyIn } from '../domain/util.js';
import { EXCEPTION_DEPTS, EXCEPTION_TYPES, exceptionLabel, exceptionOpen, exceptionOverdue, exceptionSeverity, receivingState, rrKind, shipmentFlags } from '../domain/procurement.js';

const MODES = ['Air', 'LCL', 'FCL', 'Local'];
const PICKERS = ['Ben Santos', 'Dina Cruz', 'Eli Park'];
const PACKERS = ['Carlo Reyes', 'Faye Lopez', 'Gabe Ortiz'];
const HOLD_REASONS = ['Client undecided', 'Awaiting client payment', 'Price changed', 'Client stopped the order', 'Other'];

const dateCol = (key, label) => ({ key, label, render: (r) => fmtDate(r[key]), csv: (r) => r[key] || '' });
const pillCol = (key, label = 'Status') => ({ key, label, pill: true });
const yesNo = (v) => <Pill tone={v ? 'ok' : 'warn'}>{v ? 'Yes' : 'No'}</Pill>;

// ───────────────────────────── Procurement ─────────────────────────────

export function POScreen() {
  const { db } = useStore();
  // Each PO shows the Sales Orders and customers behind its lines, and whether its lines ship by different modes.
  const rows = db.pos.map((po) => {
    const lines = db.prs.filter((p) => po.prIds.includes(p.id));
    const uniq = (list) => [...new Set(list.filter(Boolean))];
    const modes = uniq(lines.map((l) => l.mode));
    const received = lines.length > 0 && lines.every((l) => db.items.some((i) => i.prNo === l.no && i.received));
    return {
      ...po, soNos: uniq(lines.map((l) => l.soNo)).join(', '), customers: uniq(lines.map((l) => l.customer)).join(', '),
      mixed: modes.length > 1, fulfillment: received ? 'Received' : lines.some((l) => db.items.some((i) => i.prNo === l.no)) ? 'On order' : '',
      followed: lines.filter((l) => l.followedRecommendation === 'Yes').length, overrides: lines.filter((l) => l.followedRecommendation === 'No').length,
    };
  });
  const active = (r) => r.status !== 'Completed' && r.status !== 'Cancelled';
  return (
    <Screen
      title="Purchase Order"
      subtitle="Track all created POs. Each one is created from a Sales Order group on the Purchase Request page."
      rows={rows}
      columns={[
        { key: 'no', label: 'PO' }, { key: 'supplier', label: 'Supplier' },
        { key: 'soNos', label: 'SO' }, { key: 'customers', label: 'Customer' },
        { key: 'prNos', label: 'PRs', render: (r) => r.prNos.join(', '), csv: (r) => r.prNos.join(' ') },
        { key: 'qty', label: 'Qty' },
        { key: 'total', label: 'Total', render: (r) => fmtMoneyIn(r.total, r.currency), csv: (r) => r.total },
        { key: 'mode', label: 'Mode' },
        { key: 'mixed', label: 'Mixed Shipping', render: (r) => (r.mixed ? <Pill tone="warn">Mixed</Pill> : <span className="muted">—</span>), csv: (r) => (r.mixed ? 'Mixed' : '') },
        { key: 'fulfillment', label: 'Fulfillment' },
        dateCol('etd', 'ETD'), dateCol('eta', 'ETA'), pillCol('status'),
      ]}
      tabs={['All', 'Draft', 'Sent', 'Confirmed', 'Completed', 'Cancelled'].map((s) => ({ key: s, label: s, test: (r) => s === 'All' || r.status === s }))}
      stats={[
        { label: 'Active POs', value: (r) => r.filter(active).length, sub: 'not completed or cancelled' },
        { label: 'Total Value', value: (r) => fmtMoneyIn(r.filter(active).reduce((n, x) => n + (x.currency === 'CNY' ? x.total : 0), 0), 'CNY'), sub: 'active POs, CNY' },
        { label: 'Awaiting Confirm', value: (r) => r.filter((x) => x.status === 'Sent').length, sub: 'sent to the supplier', tone: 'warn' },
        { label: 'Followed Rec.', value: (r) => r.reduce((n, x) => n + x.followed, 0), sub: 'lines on the recommended supplier', tone: 'ok' },
        { label: 'Overrides', value: (r) => r.reduce((n, x) => n + x.overrides, 0), sub: 'lines on another supplier', tone: 'warn' },
      ]}
      headExtra={<a className="btn" href="#/procurement/pr/groups">Grouping Workspace</a>}
      actions={[
        { name: 'poSend', label: 'Send', when: (r) => r.status === 'Draft' },
        {
          name: 'poAcknowledge', label: 'Acknowledge', title: 'Supplier acknowledgement', when: (r) => r.status === 'Sent',
          intro: 'Both dates are required, and a PO can only be acknowledged once.',
          fields: [
            { key: 'etd', label: 'ETD (leaves supplier)', type: 'date', required: true },
            { key: 'eta', label: 'ETA (reaches warehouse)', type: 'date', required: true },
          ],
        },
        {
          name: 'poCancel', label: 'Cancel', tone: 'danger', title: 'Cancel this PO', submit: 'Cancel PO', when: (r) => ['Draft', 'Sent', 'Confirmed'].includes(r.status),
          intro: 'Its pending shipment is removed and its PRs go back to the Ready queue. A PO that has shipped cannot be cancelled.',
          fields: [{ key: 'reason', label: 'Reason', type: 'textarea', required: true }],
        },
      ]}
    />
  );
}

// Groups used by the Shipment Grouping view and the Partial Receive Timeline.
function ShipmentGrouping() {
  const { db } = useStore();
  const bucket = (list, test) => list.filter(test);
  const modes = ['LCL', 'FCL', 'Airfreight', 'Local'];
  const label = { Airfreight: 'Air' };
  const block = (title, list) => (
    <div className="card group-card" key={title}>
      <div className="group-head"><b>{title}</b><span className="muted">{list.length}</span></div>
      {list.length === 0 ? <div className="empty small">No shipments.</div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Shipment</th><th>PO / RR</th><th>Supplier</th><th>Item</th><th>Qty</th><th>ETA</th><th>Status</th></tr></thead>
          <tbody>{list.map((x) => <tr key={x.id}><td>{x.no}</td><td>{x.poNo || x.rrNo || '—'}</td><td>{x.supplier}</td><td>{x.item}</td><td>{x.qty}</td><td>{fmtDate(x.eta)}</td><td><Pill>{x.status}</Pill></td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
  return (
    <div className="grouping">
      {[['In Transit', (x) => x.status === 'In Transit'], ['Delivered', (x) => x.status === 'Arrived']].map(([state, test]) => (
        <section key={state}>
          <h3 className="card-title">{state}</h3>
          {modes.map((m) => block(`${state} · ${label[m] || m}`, bucket(db.shipments, (x) => test(x) && x.mode === m)))}
        </section>
      ))}
    </div>
  );
}

export function ShipmentScreen() {
  const { db, today } = useStore();
  const rows = db.shipments.map((sh) => {
    const fl = shipmentFlags(sh, db, today);
    return { ...sh, ...fl, remainingText: fl.remaining == null ? '' : fl.remaining < 0 ? `${-fl.remaining} day(s) late` : `${fl.remaining} day(s)`, requiredOn: fl.required };
  });
  const n = (test) => (r) => r.filter(test).length;
  const pills = [
    ['All', () => true], ['Pending', (r) => r.status === 'Pending'], ['In Transit', (r) => r.status === 'In Transit'],
    ['Arriving in 1 Week', (r) => r.arrivingSoon], ['Delayed', (r) => r.delayed], ['Delivered', (r) => r.status === 'Arrived'],
    ['Needs Attention', (r) => r.attention], ['Ship Mode Unmatched', (r) => r.modeMismatch],
  ];
  return (
    <Screen
      title="Shipments"
      subtitle="Execution queue: from PO acknowledgment to warehouse arrival."
      rows={rows}
      columns={[
        { key: 'no', label: 'Shipment' }, { key: 'poNo', label: 'PO' }, { key: 'rrNo', label: 'Replacement' },
        { key: 'supplier', label: 'Supplier' }, { key: 'item', label: 'Item' }, { key: 'mode', label: 'Mode' },
        dateCol('etd', 'ETD'), dateCol('eta', 'ETA'), dateCol('requiredOn', 'Required'),
        { key: 'remainingText', label: 'Remaining' },
        { key: 'attentionWhy', label: 'Attention', render: (r) => (r.attention ? <Pill tone="bad">{r.attentionWhy}</Pill> : <span className="muted">—</span>), csv: (r) => r.attentionWhy },
        pillCol('status'),
      ]}
      tabs={[
        ...pills.map(([s, test]) => ({ key: s, label: s, test })),
        { key: 'grouping', label: 'Shipment Grouping', test: () => true, render: () => <ShipmentGrouping /> },
      ]}
      stats={[
        { label: 'Total', value: n(() => true) },
        { label: 'Pending', value: n((r) => r.status === 'Pending'), tone: 'warn' },
        { label: 'In Transit', value: n((r) => r.status === 'In Transit') },
        { label: 'Arriving in 1 Week', value: n((r) => r.arrivingSoon) },
        { label: 'Delayed', value: n((r) => r.delayed), tone: 'bad' },
        { label: 'Delivered', value: n((r) => r.status === 'Arrived'), tone: 'ok' },
        { label: 'Needs Attention', value: n((r) => r.attention), tone: 'warn' },
        { label: 'Ship Mode Unmatched', value: n((r) => r.modeMismatch), tone: 'warn' },
      ]}
      headExtra={({ setTab }) => <button className="btn" onClick={() => setTab('grouping')}>Shipment Grouping</button>}
      actions={[
        { name: 'shipmentTransit', label: 'Mark in transit', when: (r) => r.status === 'Pending' },
        { name: 'shipmentArrive', label: 'Mark arrived', when: (r) => r.status === 'In Transit' },
      ]}
    />
  );
}

// Every receiving that has been counted more than once, with each count from the audit trail.
function PartialTimeline() {
  const { db } = useStore();
  const list = db.receivings.filter((r) => r.status === 'Partial' || db.audit.filter((a) => a.ref === r.id).length > 1);
  return (
    <div className="timeline-wrap">
      {list.length === 0 && <div className="empty">No receiving has been counted in parts yet.</div>}
      {list.map((r) => (
        <div className="card group-card" key={r.id}>
          <div className="group-head"><b>{r.no} · {r.item}</b><span className="muted">{r.accepted + r.damaged + r.missing} of {r.expected} counted</span></div>
          <ul className="timeline">
            {db.audit.filter((a) => a.ref === r.id).map((a, i) => <li key={i}><div>{a.msg}</div><div className="muted">{new Date(a.at).toLocaleString()}</div></li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ReceivingScreen() {
  const { db } = useStore();
  const arrived = (r, d) => d.shipments.find((x) => x.id === r.shipmentId)?.status === 'Arrived';
  const rows = db.receivings.map((r) => ({ ...r, ...receivingState(r, db) }));
  const n = (test) => (r) => r.filter(test).length;
  const pills = [
    ['All', () => true], ['Pending Inspection', (r) => r.pending], ['Incomplete Receive', (r) => r.incomplete], ['Complete Receive', (r) => r.complete],
    ['With Exceptions', (r) => r.withExceptions], ['Sent to Books', (r) => r.sentToBooks], ['Awaiting Replacement', (r) => r.awaitingReplacement],
  ];
  return (
    <Screen
      title="Receiving"
      subtitle="Warehouse receiving: inspect shipments, log damage or missing items, send to Books."
      rows={rows}
      columns={[
        { key: 'no', label: 'Receiving' }, { key: 'shipmentNo', label: 'Shipment' }, { key: 'supplier', label: 'Supplier' },
        { key: 'item', label: 'Item' }, { key: 'expected', label: 'Expected' }, { key: 'accepted', label: 'Accepted' },
        { key: 'damaged', label: 'Damaged' }, { key: 'missing', label: 'Missing' }, dateCol('sentToBooks', 'Books'), pillCol('status'),
      ]}
      tabs={[
        ...pills.map(([s, test]) => ({ key: s, label: s, test })),
        { key: 'timeline', label: 'Partial Receive Timeline', test: () => true, render: () => <PartialTimeline /> },
      ]}
      stats={[
        { label: 'Pending Inspection', value: n((r) => r.pending), tone: 'warn' },
        { label: 'Incomplete Receive', value: n((r) => r.incomplete), tone: 'warn' },
        { label: 'Complete Receive', value: n((r) => r.complete), tone: 'ok' },
        { label: 'With Exceptions', value: n((r) => r.withExceptions), tone: 'bad' },
        { label: 'Sent to Books', value: n((r) => r.sentToBooks) },
      ]}
      create={{
        label: 'New Receiving', action: 'receivingCreate', title: 'New Receiving — create from scratch', submit: 'Create receiving',
        fields: [
          { key: 'supplier', label: 'Supplier', type: 'select', options: db.suppliers.filter((x) => !x.stock).map((x) => x.name), required: true },
          { key: 'item', label: 'Item', required: true },
          { key: 'qty', label: 'Quantity expected', type: 'number', required: true },
        ],
      }}
      headExtra={({ setTab }) => (
        <>
          <button className="btn" onClick={() => setTab('timeline')}>Partial Receive Timeline</button>
          <button className="btn" onClick={() => window.print()}>Print Stickers</button>
        </>
      )}
      actions={[
        {
          name: 'receive', label: 'Receive', title: 'Receive goods',
          when: (r, d) => (r.status === 'Open' || r.status === 'Partial') && arrived(r, d),
          intro: (r) => `Expected ${r.expected}. Already counted: ${r.accepted} accepted, ${r.damaged} damaged, ${r.missing} missing.`,
          fields: [
            { key: 'accepted', label: 'Accepted', type: 'number', default: 0 },
            { key: 'damaged', label: 'Damaged', type: 'number', default: 0 },
            { key: 'missing', label: 'Missing', type: 'number', default: 0 },
          ],
        },
        { name: 'receivingSendToBooks', label: 'Send to Books', when: (r) => r.status === 'Received' && !r.sentToBooks },
      ]}
    />
  );
}

function RRList() {
  const { db } = useStore();
  return (
    <div className="card">
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Replacement</th><th>Exception</th><th>Supplier</th><th>Item</th><th>Qty</th><th>ETA</th><th>Status</th></tr></thead>
        <tbody>
          {db.rrs.map((r) => <tr key={r.id}><td>{r.no}</td><td>{r.excNo}</td><td>{r.supplier}</td><td>{r.item}</td><td>{r.qty}</td><td>{fmtDate(r.eta)}</td><td><Pill>{r.status}</Pill></td></tr>)}
          {db.rrs.length === 0 && <tr><td colSpan={7} className="muted">No replacement requests.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}

export function ExceptionScreen() {
  const { db, today } = useStore();
  const rows = db.exceptions.map((e) => ({
    ...e, severity: exceptionSeverity(e), label: exceptionLabel(e), overdue: exceptionOverdue(e, today), openNow: exceptionOpen(e), dept: e.dept || (e.source === 'Fulfillment' ? 'Quality' : 'Procurement'),
  }));
  const n = (test) => (r) => r.filter(test).length;
  const top = [
    ['All Open', (r) => r.openNow], ['High Severity', (r) => r.openNow && r.severity === 'High'], ['Waiting on Supplier', (r) => r.status === 'RR Created'],
    ['Receiving Source', (r) => r.source === 'Procurement'], ['Fulfillment QC Source', (r) => r.source === 'Fulfillment'],
  ];
  const pills = [
    ['All', () => true], ['Open', (r) => r.status === 'Open'], ['Under Review', (r) => r.status === 'Under Review'], ['Waiting', (r) => r.status === 'RR Created'],
    ['Resolved', (r) => r.status === 'Resolved'], ['Closed', (r) => r.status === 'Closed'], ['Overdue', (r) => r.overdue],
  ];
  const sources = ['Procurement', 'Fulfillment'];
  return (
    <Screen
      title="Exceptions"
      subtitle="Damaged, missing or rejected goods, from both receiving and QC."
      rows={rows}
      columns={[
        { key: 'no', label: 'Exception' }, { key: 'source', label: 'Source' }, { key: 'supplier', label: 'Supplier' },
        { key: 'item', label: 'Item' }, { key: 'type', label: 'Type' }, { key: 'qty', label: 'Qty' },
        { key: 'severity', label: 'Severity', render: (r) => <Pill tone={r.severity === 'High' ? 'bad' : 'warn'}>{r.severity}</Pill>, csv: (r) => r.severity },
        { key: 'dept', label: 'Dept' }, { key: 'assignee', label: 'Assignee' }, dateCol('dueDate', 'Due'),
        { key: 'rrNo', label: 'Replacement' }, { key: 'label', label: 'Status', render: (r) => <Pill tone={r.overdue ? 'bad' : undefined}>{r.overdue ? 'Overdue' : r.label}</Pill>, csv: (r) => r.label },
      ]}
      tabs={[
        ...top.map(([s, test]) => ({ key: s, label: s, test })),
        { key: 'rrlist', label: 'RR List', test: () => true, render: () => <RRList /> },
        ...pills.map(([s, test]) => ({ key: 'p-' + s, label: s, test })),
      ]}
      stats={[
        { label: 'Open Exceptions', value: n((r) => r.openNow), tone: 'bad' },
        { label: 'High Severity', value: n((r) => r.openNow && r.severity === 'High'), tone: 'bad' },
        { label: 'Waiting on Supplier', value: n((r) => r.status === 'RR Created'), tone: 'warn' },
        { label: 'Overdue', value: n((r) => r.overdue), tone: 'bad' },
        { label: 'Receiving Exceptions', value: n((r) => r.source === 'Procurement' && r.openNow) },
        { label: 'Fulfillment QC Exceptions', value: n((r) => r.source === 'Fulfillment' && r.openNow) },
      ]}
      create={{
        label: 'Raise Exception', action: 'exceptionRaise', title: 'Raise Exception', submit: 'Raise exception',
        fields: [
          { key: 'source', label: 'Source', type: 'select', options: sources, required: true, default: 'Procurement' },
          { key: 'item', label: 'Item', required: true },
          { key: 'type', label: 'Type', type: 'select', options: EXCEPTION_TYPES, required: true },
          { key: 'qty', label: 'Quantity', type: 'number', required: true },
          { key: 'supplier', label: 'Supplier', type: 'select', options: db.suppliers.filter((x) => !x.stock).map((x) => x.name) },
          { key: 'notes', label: 'Notes', type: 'textarea' },
        ],
      }}
      actions={[
        {
          name: 'exceptionReview', label: 'Assign for review', title: 'Assign for review', when: (r) => r.status === 'Open' || r.status === 'Under Review',
          fields: [
            { key: 'assignee', label: 'Assignee', required: true, default: (r) => r.assignee },
            { key: 'dueDate', label: 'Due date', type: 'date', required: true, default: (r) => r.dueDate },
            { key: 'dept', label: 'Department', type: 'select', options: EXCEPTION_DEPTS, default: (r) => r.dept },
          ],
        },
        {
          name: 'exceptionCreateRR', label: 'Create replacement', title: 'Create Replacement Request', when: (r) => r.status === 'Open' || r.status === 'Under Review',
          fields: [{ key: 'supplier', label: 'Source the replacement from', type: 'select', options: db.suppliers.filter((x) => !x.stock).map((x) => x.name), required: true, default: (r) => r.supplier }],
        },
        {
          name: 'exceptionResolve', label: 'Resolve', title: 'Resolve exception', when: (r) => r.status === 'Open' || r.status === 'Under Review',
          fields: [{ key: 'note', label: 'How was it resolved?', type: 'textarea', required: true }],
        },
      ]}
    />
  );
}

export function ReplacementScreen() {
  const { db } = useStore();
  const rows = db.rrs.map((r) => ({ ...r, kind: rrKind(r) }));
  const n = (test) => (r) => r.filter(test).length;
  const kinds = [['Procurement', 'Procurement'], ['Fulfillment', 'Fulfillment'], ['Local', 'Local (HC System)']];
  const statuses = ['All', 'Open', 'Acknowledged', 'In Production', 'Shipped', 'Received', 'Closed', 'Cancelled'];
  const approveFields = [
    { key: 'expShip', label: 'Expected ship date', type: 'date', required: true },
    { key: 'eta', label: 'ETA', type: 'date', required: true },
  ];
  return (
    <Screen
      title="Replacement Request"
      subtitle="Damaged, missing, QC or complaint replacement pipeline: exception to closed RR."
      rows={rows}
      columns={[
        { key: 'no', label: 'Replacement' }, { key: 'kind', label: 'Type' }, { key: 'excNo', label: 'Exception' }, { key: 'supplier', label: 'Supplier' },
        { key: 'item', label: 'Item' }, { key: 'qty', label: 'Qty' }, dateCol('expShip', 'Expected ship'), dateCol('eta', 'ETA'), pillCol('status'),
      ]}
      tabs={[
        ...kinds.map(([k, label]) => ({ key: k, label, test: (r) => r.kind === k })),
        ...statuses.map((s) => ({ key: 's-' + s, label: s, test: (r) => s === 'All' || r.status === s })),
      ]}
      stats={['Open', 'Acknowledged', 'In Production', 'Shipped', 'Received', 'Closed', 'Cancelled'].map((s) => ({
        label: s, value: n((r) => r.status === s), tone: s === 'Cancelled' ? 'bad' : s === 'Open' ? 'warn' : s === 'Closed' || s === 'Received' ? 'ok' : undefined,
      }))}
      actions={[
        { name: 'rrApprove', label: 'Approve', title: 'Approve replacement', when: (r) => r.status === 'Open' && r.kind !== 'Local', fields: approveFields },
        { name: 'rrApprove', label: 'Acknowledge', title: 'Acknowledge (HC System, Local)', when: (r) => r.status === 'Open' && r.kind === 'Local', fields: approveFields },
        { name: 'rrClose', label: 'Close', when: (r) => r.status === 'Received', confirm: 'Close this replacement request?' },
        {
          name: 'rrCancel', label: 'Cancel', tone: 'danger', title: 'Cancel replacement', submit: 'Cancel replacement', when: (r) => ['Open', 'Acknowledged', 'In Production'].includes(r.status),
          intro: 'Its replacement shipment is removed and the exception opens again.',
          fields: [{ key: 'reason', label: 'Reason', type: 'textarea', required: true }],
        },
      ]}
    />
  );
}

// ───────────────────────────── Fulfillment ─────────────────────────────

function blocker(it, today) {
  if (!it.received) return `On order (${it.prNo})`;
  if (!it.pac) return 'No package';
  if (!it.picker) return 'No picker';
  if (!paymentOK(it, today)) return 'Unpaid';
  return '';
}

const itemCols = {
  so: { key: 'soNo', label: 'Sales Order' },
  customer: { key: 'customer', label: 'Customer' },
  item: { key: 'name', label: 'Item' },
  qty: { key: 'qty', label: 'Qty' },
  source: { key: 'prNo', label: 'Source', render: (r) => (r.prNo ? `On order · ${r.prNo}` : 'In stock'), csv: (r) => r.prNo || 'In stock' },
  pac: { key: 'pac', label: 'PAC #' },
  payment: { key: 'payment', label: 'Payment', render: (r) => <Pill>{r.payment}</Pill>, csv: (r) => r.payment },
  picker: { key: 'picker', label: 'Picker' },
  packer: { key: 'packer', label: 'Packer' },
  crate: { key: 'crateStatus', label: 'Crating', render: (r) => <Pill>{r.crateStatus}</Pill>, csv: (r) => r.crateStatus },
  qc: { key: 'qcStatus', label: 'QC', render: (r) => <Pill>{r.qcStatus}</Pill>, csv: (r) => r.qcStatus },
};

export function GateScreen() {
  const { db, today } = useStore();
  const rows = db.items.filter((i) => i.stage === 'Readiness Gate');
  return (
    <Screen
      title="Order Readiness"
      subtitle="Nothing reaches the pickers until it is received, packaged, assigned and paid for."
      rows={rows}
      columns={[
        itemCols.so, itemCols.customer, itemCols.item, itemCols.qty, itemCols.source, itemCols.pac, itemCols.picker, itemCols.payment,
        { key: 'blocker', label: 'Blocker', render: (r) => { const b = blocker(r, today); return b ? <Pill tone="bad">{b}</Pill> : <Pill tone="ok">Ready</Pill>; }, csv: (r) => blocker(r, today) },
      ]}
      tabs={[
        { key: 'all', label: 'All', test: () => true },
        { key: 'ready', label: 'Ready to release', test: (r) => !blocker(r, today) },
        { key: 'blocked', label: 'Blocked', test: (r) => !!blocker(r, today) },
      ]}
      stats={[
        { label: 'At the gate', value: (r) => r.length },
        { label: 'Ready', value: (r) => r.filter((x) => !blocker(x, today)).length, tone: 'ok' },
        { label: 'Blocked', value: (r) => r.filter((x) => blocker(x, today)).length, tone: 'bad' },
      ]}
      actions={[
        { name: 'gateRelease', label: 'Release to Pick', when: (r) => !blocker(r, today) },
        {
          name: 'assignPicker', label: 'Assign picker', fields: [{ key: 'picker', label: 'Picker', type: 'select', options: PICKERS, required: true, default: (r) => r.picker }],
        },
        {
          name: 'setPayment', label: 'Set payment', fields: [{ key: 'payment', label: 'Payment', type: 'select', options: ['Paid', 'Unpaid', 'Credit'], required: true, default: (r) => r.payment }],
        },
        {
          name: 'approveOverride', label: 'Approve dispatch override', title: 'Approve dispatch override', when: (r) => !paymentOK(r, today),
          intro: 'Lets an unpaid item through. It needs a reason and a date in the future.',
          fields: [
            { key: 'reason', label: 'Reason', type: 'textarea', required: true },
            { key: 'until', label: 'Valid until', type: 'date', required: true },
          ],
        },
      ]}
    />
  );
}

export function PickScreen() {
  const { db } = useStore();
  return (
    <Screen
      title="Pick"
      subtitle="Pick report: mark an item picked and it goes straight to Pack & QC."
      rows={db.items.filter((i) => i.stage === 'Pick')}
      columns={[itemCols.so, itemCols.customer, itemCols.item, itemCols.qty, itemCols.pac, itemCols.picker]}
      stats={[{ label: 'Total', value: (r) => r.length }]}
      actions={[{ name: 'pickDone', label: 'Mark as Picked' }]}
    />
  );
}

export function PackQCPage() {
  const { db } = useStore();
  return (
    <Screen
      title="Pack & QC"
      subtitle="The packer is the quality checker. Approve routes the item on; reject needs a reason and raises a Fulfillment exception."
      rows={db.items.filter((i) => i.stage === 'QC')}
      columns={[itemCols.so, itemCols.customer, itemCols.item, itemCols.qty, itemCols.pac,
        { key: 'checker', label: 'Quality checker' }, itemCols.qc,
        { key: 'forCrate', label: 'Needs crate', render: (r) => yesNo(r.forCrate), csv: (r) => (r.forCrate ? 'Yes' : 'No') }]}
      stats={[
        { label: 'Awaiting QC', value: (r) => r.filter((x) => x.qcStatus === 'Pending').length, tone: 'warn' },
        { label: 'Rejected', value: (r) => r.filter((x) => x.qcStatus === 'Rejected').length, tone: 'bad' },
      ]}
      actions={[
        {
          name: 'qcAssign', label: 'Assign packer', title: 'Assign packer / checker', when: (r) => r.qcStatus === 'Pending',
          fields: [{ key: 'packer', label: 'Packer (also the quality checker)', type: 'select', options: PACKERS, required: true, default: (r) => r.packer }],
        },
        { name: 'qcApprove', label: 'Approve', when: (r) => r.qcStatus === 'Pending' && !!r.checker },
        {
          name: 'qcReject', label: 'Reject', tone: 'danger', title: 'Reject at QC', submit: 'Reject', when: (r) => r.qcStatus === 'Pending' && !!r.checker,
          fields: [
            { key: 'type', label: 'Problem', type: 'select', options: ['Damaged', 'Wrong item', 'Defective', 'Spare Parts'], default: 'Damaged' },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true },
          ],
        },
        { name: 'qcRecheck', label: 'Recheck', when: (r) => r.qcStatus === 'Rejected' || r.qcStatus === 'Replacement received' },
      ]}
    />
  );
}

export function CrateScreen() {
  const { db } = useStore();
  return (
    <Screen
      title="Crate"
      subtitle="Nothing moves on until Crating Status is Done."
      rows={db.items.filter((i) => i.stage === 'Crate')}
      columns={[itemCols.so, itemCols.customer, itemCols.item, itemCols.qty, itemCols.pac, itemCols.crate]}
      stats={[{ label: 'To crate', value: (r) => r.length, tone: 'warn' }]}
      actions={[
        {
          name: 'crateSet', label: 'Set status',
          fields: [{ key: 'status', label: 'Crating status', type: 'select', options: ['Pending', 'In Progress', 'Done'], required: true, default: (r) => r.crateStatus }],
        },
        { name: 'crateComplete', label: 'Mark crated', when: (r) => r.crateStatus === 'Done' },
      ]}
    />
  );
}

export function AggregationScreen() {
  const { db } = useStore();
  return (
    <Screen
      title="To Ship"
      subtitle="Items that passed QC wait here. Dispatch creates the Service Request in Delivery Management."
      rows={db.items.filter((i) => i.stage === 'Order Aggregation' || i.stage === 'Dispatched')}
      columns={[itemCols.so, itemCols.customer, itemCols.item, itemCols.qty, itemCols.pac, itemCols.payment,
        { key: 'stage', label: 'Stage', render: (r) => <Pill tone={r.stage === 'Dispatched' ? 'ok' : 'info'}>{r.stage === 'Dispatched' ? 'Dispatched' : 'For delivery'}</Pill>, csv: (r) => r.stage },
        { key: 'srNo', label: 'Service Request' }]}
      tabs={[
        { key: 'wait', label: 'For delivery', test: (r) => r.stage === 'Order Aggregation' },
        { key: 'done', label: 'Dispatched', test: (r) => r.stage === 'Dispatched' },
      ]}
      stats={[
        { label: 'Ready to dispatch', value: (r) => r.filter((x) => x.stage === 'Order Aggregation').length, tone: 'warn' },
        { label: 'Dispatched', value: (r) => r.filter((x) => x.stage === 'Dispatched').length, tone: 'ok' },
      ]}
      actions={[
        {
          name: 'dispatch', label: 'Dispatch', title: 'Dispatch to Delivery', when: (r) => r.stage === 'Order Aggregation',
          fields: [
            { key: 'type', label: 'Delivery type', type: 'select', options: ['Delivery', 'Installation', 'Pick Up'], default: 'Delivery' },
            { key: 'requestedDate', label: 'Customer’s requested date', type: 'date' },
          ],
        },
        { name: 'setPayment', label: 'Set payment', when: (r) => r.stage === 'Order Aggregation', fields: [{ key: 'payment', label: 'Payment', type: 'select', options: ['Paid', 'Unpaid', 'Credit'], required: true, default: (r) => r.payment }] },
      ]}
    />
  );
}

// ───────────────────────────── Delivery Management ─────────────────────────────

const teamName = (db, id) => (id === 'Pick Up' ? 'Pick Up' : (db.teams.find((t) => t.id === id) || {}).name || '');

const srCols = {
  no: { key: 'no', label: 'Job' }, so: { key: 'soNo', label: 'Sales Order' }, customer: { key: 'customer', label: 'Customer' },
  address: { key: 'address', label: 'Address' }, item: { key: 'item', label: 'Item' }, type: { key: 'type', label: 'Type', pill: true },
  initial: dateCol('initialDate', 'Initial date'),
  site: { key: 'siteConfirmed', label: 'Site confirmed', render: (r) => (r.type === 'Pick Up' ? <span className="muted">n/a</span> : yesNo(r.siteConfirmed)), csv: (r) => (r.siteConfirmed ? 'Yes' : 'No') },
  priority: { key: 'priority', label: 'Priority', render: (r) => (r.priority ? <Pill tone="bad">Priority</Pill> : <span className="muted">—</span>), csv: (r) => (r.priority ? 'Yes' : '') },
  team: { key: 'team', label: 'Team', render: (r, d) => teamName(d, r.team) || <span className="muted">—</span>, csv: (r, d) => teamName(d, r.team) },
  date: dateCol('scheduledDate', 'Scheduled'),
  reason: { key: 'exceptionReason', label: 'What went wrong' },
};

const confirmFields = [
  { key: 'method', label: 'Confirmation method', type: 'select', options: ['Phone call', 'SMS', 'Email', 'Site visit'], required: true },
  { key: 'notes', label: 'Notes', type: 'textarea', required: true },
];

export function InitialSchedulingScreen() {
  const { db } = useStore();
  return (
    <Screen
      title="Initial Scheduling"
      subtitle="Everything dispatched from To Ship lands here. Set the first date, confirm the site, then hand off."
      rows={db.serviceRequests.filter((s) => s.status === 'Initial Scheduling')}
      columns={[srCols.no, srCols.so, srCols.customer, srCols.address, srCols.item, srCols.type, srCols.initial, srCols.site]}
      stats={[
        { label: 'Waiting', value: (r) => r.length },
        { label: 'No date yet', value: (r) => r.filter((x) => !x.initialDate).length, tone: 'warn' },
        { label: 'Site confirmed', value: (r) => r.filter((x) => x.siteConfirmed).length, tone: 'ok' },
      ]}
      actions={[
        { name: 'srHandOff', label: 'Hand off', when: (r) => !!r.initialDate },
        { name: 'srSetInitial', label: 'Set date', fields: [{ key: 'date', label: 'Initial delivery date', type: 'date', required: true, default: (r) => r.initialDate }] },
        { name: 'srConfirmSite', label: 'Confirm site', title: 'Confirm site', when: (r) => r.type !== 'Pick Up', fields: confirmFields },
      ]}
    />
  );
}

export function ServiceRequestScreen() {
  const { db } = useStore();
  return (
    <Screen
      title="Service Request"
      subtitle="The scheduling engine books the earliest team with room, starting from the initial date."
      rows={db.serviceRequests.filter((s) => s.status === 'Service Request')}
      columns={[srCols.no, srCols.so, srCols.customer, srCols.item, srCols.type, srCols.initial, srCols.site, srCols.priority]}
      stats={[
        { label: 'To schedule', value: (r) => r.length, tone: 'warn' },
        { label: 'Priority (rescheduled)', value: (r) => r.filter((x) => x.priority).length, tone: 'bad' },
      ]}
      actions={[
        { name: 'srSchedule', label: 'Schedule' },
        { name: 'srConfirmSite', label: 'Confirm site', title: 'Confirm site', when: (r) => r.type !== 'Pick Up' && !r.siteConfirmed, fields: confirmFields },
        { name: 'srSetInitial', label: 'Change date', fields: [{ key: 'date', label: 'Initial delivery date', type: 'date', required: true, default: (r) => r.initialDate }] },
      ]}
    />
  );
}

export function AppointmentScreen() {
  const { db, today } = useStore();
  return (
    <Screen
      title="Service Appointment"
      subtitle="Scheduled jobs, by team and day."
      rows={db.serviceRequests.filter((s) => s.status === 'Scheduled')}
      columns={[srCols.no, srCols.so, srCols.customer, srCols.address, srCols.type, srCols.team, srCols.date]}
      tabs={[
        { key: 'all', label: 'All', test: () => true },
        { key: 'today', label: 'Today', test: (r) => r.scheduledDate === today },
        { key: 'up', label: 'Upcoming', test: (r) => r.scheduledDate > today },
      ]}
      stats={[{ label: 'Scheduled', value: (r) => r.length }, { label: 'Today', value: (r) => r.filter((x) => x.scheduledDate === today).length, tone: 'ok' }]}
      actions={[{ name: 'srStart', label: 'Start job' }]}
    />
  );
}

export function OngoingScreen() {
  const { db } = useStore();
  return (
    <Screen
      title="Ongoing Service"
      subtitle="Jobs in the field, and the ones just finished."
      rows={db.serviceRequests.filter((s) => s.status === 'Ongoing' || s.status === 'Completed')}
      columns={[srCols.no, srCols.so, srCols.customer, srCols.address, srCols.type, srCols.team, srCols.date, pillCol('status')]}
      tabs={['Ongoing', 'Completed'].map((s) => ({ key: s, label: s, test: (r) => r.status === s }))}
      stats={[
        { label: 'In the field', value: (r) => r.filter((x) => x.status === 'Ongoing').length, tone: 'warn' },
        { label: 'Completed', value: (r) => r.filter((x) => x.status === 'Completed').length, tone: 'ok' },
      ]}
      actions={[
        { name: 'srComplete', label: 'Complete', when: (r) => r.status === 'Ongoing' },
        {
          name: 'srFail', label: 'Mark failed', tone: 'danger', title: 'Delivery failed', submit: 'Send to exception queue', when: (r) => r.status === 'Ongoing',
          fields: [{ key: 'reason', label: 'What went wrong', type: 'textarea', required: true }],
        },
      ]}
    />
  );
}

export function DmsExceptionScreen() {
  const { db } = useStore();
  return (
    <Screen
      title="DMS Exception Queue"
      subtitle="Failed deliveries wait here for a decision."
      rows={db.serviceRequests.filter((s) => s.status === 'Exception')}
      columns={[srCols.no, srCols.so, srCols.customer, srCols.address, srCols.team, srCols.reason]}
      empty="No failed deliveries. Nothing is waiting for a decision."
      actions={[
        {
          name: 'srResolve', label: 'Resolve', title: 'Resolve exception',
          fields: [
            { key: 'action', label: 'Resolution action', type: 'select', options: ['Reschedule', 'Revert to System'], required: true, hint: 'Reschedule makes it a priority job. Revert to System hands it back to the engine.' },
            { key: 'newDate', label: 'New date (for Reschedule)', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ],
        },
      ]}
    />
  );
}

export function TeamsScreen() {
  const { db, today } = useStore();
  const booked = (t, from, to) =>
    db.serviceRequests.filter((s) => s.team === t.id && s.scheduledDate >= from && s.scheduledDate <= to && ['Scheduled', 'Ongoing'].includes(s.status)).length;
  return (
    <Screen
      title="Daily Team Availability"
      subtitle="Each team takes a fixed number of jobs a day. A day off removes the team from the engine’s search."
      rows={db.teams}
      columns={[
        { key: 'name', label: 'Team' },
        { key: 'capacity', label: 'Jobs per day' },
        { key: 'today', label: 'Booked today', render: (r) => booked(r, today, today), csv: (r) => booked(r, today, today) },
        { key: 'week', label: 'Booked next 7 days', render: (r) => booked(r, today, new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10)), csv: () => '' },
        { key: 'off', label: 'Days off', render: (r) => (r.off.length ? r.off.join(', ') : <span className="muted">None</span>), csv: (r) => r.off.join(' ') },
      ]}
      actions={[
        { name: 'teamCapacity', label: 'Set capacity', fields: [{ key: 'capacity', label: 'Jobs per day', type: 'number', required: true, default: (r) => r.capacity }] },
        { name: 'teamToggleOff', label: 'Toggle day off', title: 'Toggle a day off', fields: [{ key: 'date', label: 'Date', type: 'date', required: true }], hint: 'Enter a date again to bring the team back.' },
      ]}
    />
  );
}
