import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { FormFields, Pill } from '../../ui/components.jsx';
import { fmtDate, fmtPHP } from '../../domain/util.js';
import { TRUCKS } from '../../domain/fulfillment.js';
import './dms.css';

function Entries({ kind }) {
  const { db, act, today } = useStore();
  const rows = (db.truckEntries || []).filter((e) => e.kind === kind);
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
        <button type="submit" className="btn btn-primary">Add {kind === 'fuel' ? 'Fuel Entry' : 'Service Entry'}</button>
      </form>
      {rows.length === 0 ? <div className="empty">No entries yet.</div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Date</th><th>Truck</th>{kind === 'fuel' && <th>Liters</th>}<th>Cost</th><th>Note</th></tr></thead>
          <tbody>{rows.map((e) => <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.truck}</td>{kind === 'fuel' && <td>{e.liters}</td>}<td>{fmtPHP(e.cost)}</td><td>{e.note || '—'}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function TruckMaintenanceScreen() {
  const { db, notify } = useStore();
  const [, setTick] = useState(0);

  const rows = db.truckChecks || [];

  const columns = [
    { key: 'no', label: 'CHECKLIST #', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--accent, #00897b)' }}>{r.no}</div>
        <div className="muted" style={{ fontSize: '12px' }}>{r.truck}</div>
      </div>
    )},
    { key: 'date', label: 'DATE', render: (r) => fmtDate(r.date) },
    { key: 'issues', label: 'ISSUES FOUND', render: (r) => (
      r.issues > 0 ? <Pill tone="bad">{r.issues} issues</Pill> : <Pill tone="ok">Clean</Pill>
    )},
    { key: 'notes', label: 'NOTES', render: (r) => r.notes || '—' },
    { key: 'signature', label: 'SIGNED BY', render: (r) => r.signature || <span className="muted">Pending</span> },
    { key: 'status', label: 'STATUS', pill: true },
  ];

  const tabs = [
    { key: 'track', label: 'Track Maintenance', test: () => true },
    { key: 'fuel', label: 'Fuel Entries', test: () => true, render: () => <Entries kind="fuel" /> },
    { key: 'service', label: 'Service Entries', test: () => true, render: () => <Entries kind="service" /> },
  ];

  const stats = [
    { label: 'Total Checklists', value: (r) => r.length },
    { label: 'Open', value: (r) => r.filter((x) => x.status === 'Open').length, tone: 'warn' },
    { label: 'In Progress', value: (r) => r.filter((x) => x.status === 'In Progress').length },
    { label: 'Completed', value: (r) => r.filter((x) => x.status === 'Completed').length, tone: 'ok' },
    { label: 'Issues Found', value: (r) => r.reduce((n, c) => n + (c.issues || 0), 0), tone: 'bad' },
  ];

  return (
    <Screen
      title="Truck Maintenance"
      subtitle="Daily vehicle checklist, fuel entries and service entries."
      rows={rows}
      columns={columns}
      tabs={tabs}
      stats={stats}
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      )}
      create={{
        label: 'Add Checklist',
        action: 'truckChecklistCreate',
        title: 'Add Checklist',
        submit: 'Add',
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
          name: 'truckChecklistAdvance',
          label: 'Complete',
          title: 'Complete checklist',
          when: (r) => r.status === 'In Progress',
          fields: [{ key: 'signature', label: 'Signature (type the name)', required: true }],
        },
      ]}
    />
  );
}

