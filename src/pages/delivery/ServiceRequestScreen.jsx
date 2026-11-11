import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { fmtDate } from '../../domain/util.js';
import './dms.css';

const confirmFields = [
  { key: 'method', label: 'Confirmation method', type: 'select', options: ['Phone call', 'SMS', 'Viber', 'Site visit waiver signed'], required: true },
  { key: 'notes', label: 'Confirmation notes', type: 'textarea' },
];

export default function ServiceRequestScreen() {
  const { db, today, act, notify } = useStore();
  const [, setTick] = useState(0);

  const rows = db.serviceRequests || [];

  const columns = [
    { key: 'no', label: 'SERVICE REQUEST / SO', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--accent, #00897b)' }}>{r.no}</div>
        <div className="muted" style={{ fontSize: '12px' }}>{r.soNo} · {r.customer}</div>
      </div>
    )},
    { key: 'item', label: 'ITEM / ADDRESS', render: (r) => (
      <div>
        <div>{r.item}</div>
        <div className="muted" style={{ fontSize: '12px' }}>{r.address}</div>
      </div>
    )},
    { key: 'type', label: 'TYPE', render: (r) => <Pill tone={r.type?.includes('Install') ? 'warn' : 'default'}>{r.type}</Pill> },
    { key: 'initialDate', label: 'INITIAL DATE', render: (r) => (
      r.initialDate ? (
        <div>
          <div style={{ fontWeight: 600 }}>{fmtDate(r.initialDate)}</div>
          <div className="muted" style={{ fontSize: '11px' }}>{r.initialTime || 'Anytime'}</div>
        </div>
      ) : <span className="muted">Not set</span>
    )},
    { key: 'siteConfirmed', label: 'SITE CONFIRMED', render: (r) => (
      r.type === 'Pick Up' ? <span className="muted">Pick Up (N/A)</span> :
      r.siteConfirmed ? <Pill tone="ok">Site Confirmed</Pill> : <Pill tone="warn">Needs Confirmation</Pill>
    )},
    { key: 'priority', label: 'PRIORITY', render: (r) => r.priority ? <Pill tone="bad">High Priority</Pill> : <span className="muted">Normal</span> },
    { key: 'status', label: 'STATUS', pill: true },
  ];

  const tabs = [
    { key: 'Active', label: 'Active', test: (r) => r.status !== 'Completed' && r.status !== 'Cancelled' },
    { key: 'Walang appointment', label: 'Walang appointment', test: (r) => ['Service Request', 'Initial Scheduling'].includes(r.status) },
    { key: 'Needs site confirmation', label: 'Needs site confirmation', test: (r) => !r.siteConfirmed && r.type !== 'Pick Up' },
    { key: 'Waiting for a slot', label: 'Waiting for a slot', test: (r) => r.status === 'Service Request' },
    { key: 'Suggestion to approve', label: 'Suggestion to approve', test: (r) => !!r.suggestedDate || r.status === 'Service Request' },
    { key: 'Scheduled', label: 'Scheduled', test: (r) => r.status === 'Scheduled' },
    { key: 'Flagged', label: 'Flagged', test: (r) => r.status === 'Exception' || !!r.flagged },
    { key: 'Pull out', label: 'Pull out', test: (r) => r.type?.toLowerCase().includes('pull') },
    { key: 'High priority', label: 'High priority', test: (r) => !!r.priority },
  ];

  const stats = [
    { label: 'Active Requests', value: (r) => r.filter((x) => x.status !== 'Completed').length, tone: 'warn' },
    { label: 'Needs Confirmation', value: (r) => r.filter((x) => !x.siteConfirmed && x.type !== 'Pick Up').length, tone: 'bad' },
    { label: 'Priority', value: (r) => r.filter((x) => x.priority).length, tone: 'bad' },
    { label: 'Scheduled', value: (r) => r.filter((x) => x.status === 'Scheduled').length, tone: 'ok' },
  ];

  return (
    <Screen
      title="Service Request"
      subtitle="The scheduling engine books the earliest team with room, starting from the initial date."
      rows={rows}
      columns={columns}
      tabs={tabs}
      stats={stats}
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => notify('info', 'Create a new service request')}>
            New request
          </button>
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      )}
      actions={[
        {
          name: 'srConfirmSite',
          label: 'Mark site confirmed',
          title: 'Confirm site readiness',
          when: (r) => r.type !== 'Pick Up' && !r.siteConfirmed,
          fields: confirmFields,
        },
        {
          name: 'srSchedule',
          label: 'Auto-schedule',
          title: 'Auto-schedule team and slot',
          when: (r) => r.status === 'Service Request',
        },
        {
          name: 'srSetInitial',
          label: 'Override',
          title: 'Override date and time',
          fields: [
            { key: 'date', label: 'Confirmed delivery date', type: 'date', required: true, default: (r) => r.initialDate },
            { key: 'reason', label: 'Override reason', type: 'textarea', required: true },
          ],
        },
      ]}
      create={{
        label: 'Request',
        action: 'srSchedule',
        title: 'New Service Request',
        fields: [
          { key: 'id', label: 'Service Request', type: 'select', required: true, options: rows.filter((x) => x.status === 'Service Request').map((x) => ({ value: x.id, label: `${x.no} · ${x.customer}` })) },
        ],
      }}
    />
  );
}

