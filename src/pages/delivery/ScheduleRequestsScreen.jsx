import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { fmtDate } from '../../domain/util.js';
import './dms.css';

export default function ScheduleRequestsScreen() {
  const { db, notify } = useStore();
  const [, setTick] = useState(0);

  const rows = db.scheduleRequests || [];

  const columns = [
    { key: 'no', label: 'REQUEST #', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--accent, #00897b)' }}>{r.no}</div>
        <div className="muted" style={{ fontSize: '12px' }}>{r.srNo} · {r.customer}</div>
      </div>
    )},
    { key: 'currentDate', label: 'CURRENT DATE', render: (r) => fmtDate(r.currentDate) },
    { key: 'newDate', label: 'REQUESTED DATE', render: (r) => (
      <span style={{ fontWeight: 600, color: 'var(--accent, #00897b)' }}>{fmtDate(r.newDate)}</span>
    )},
    { key: 'reason', label: 'REASON' },
    { key: 'status', label: 'STATUS', pill: true },
  ];

  const tabs = ['All', 'Pending Review', 'Confirmed', 'Declined'].map((s) => ({
    key: s,
    label: s,
    test: (r) => s === 'All' || r.status === s,
  }));

  return (
    <Screen
      title="Schedule Requests"
      subtitle="Client requests to change a delivery schedule."
      rows={rows}
      columns={columns}
      tabs={tabs}
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      )}
      create={{
        label: 'New Request',
        action: 'scheduleRequestCreate',
        title: 'New schedule request',
        submit: 'Send request',
        fields: [
          {
            key: 'id',
            label: 'Service Request',
            type: 'select',
            required: true,
            options: (db.serviceRequests || []).filter((s) => s.status !== 'Completed').map((s) => ({ value: s.id, label: `${s.no} · ${s.customer}` })),
          },
          { key: 'newDate', label: 'New date', type: 'date', required: true },
          { key: 'reason', label: 'Reason', type: 'textarea', required: true },
        ],
      }}
      actions={[
        {
          name: 'scheduleRequestDecide',
          label: 'Confirm',
          when: (r) => r.status === 'Pending Review',
          payload: (r) => ({ id: r.id, decision: 'Confirm' }),
          confirm: (r) => `Move ${r.srNo} to start from ${r.newDate}?`,
        },
        {
          name: 'scheduleRequestDecide',
          label: 'Decline',
          tone: 'danger',
          title: 'Decline request',
          submit: 'Decline',
          when: (r) => r.status === 'Pending Review',
          fields: [{ key: 'note', label: 'Why?', type: 'textarea', required: true }],
          payload: (r, v) => ({ id: r.id, decision: 'Decline', ...v }),
        },
      ]}
    />
  );
}

