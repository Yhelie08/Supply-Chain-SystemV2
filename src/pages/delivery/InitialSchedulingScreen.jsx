import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { fmtDate } from '../../domain/util.js';
import './dms.css';

const TYPES = [
  'Delivery Only',
  'With Installation',
  'Delivery and Installation',
  'Full-Day Install',
  'Multi-Day Install',
  'Replacement',
  'Site Visit',
  'Pullout',
  'Pick Up',
];

const confirmFields = [
  { key: 'method', label: 'Confirmation method', type: 'select', options: ['Phone call', 'SMS', 'Viber', 'Site visit waiver signed'], required: true },
  { key: 'notes', label: 'Confirmation notes', type: 'textarea' },
];

export default function InitialSchedulingScreen() {
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
    { key: 'item', label: 'ITEM / DETAILS', render: (r) => (
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
    { key: 'status', label: 'STAGE', pill: true },
  ];

  const tabs = [
    { key: 'All', label: 'All', test: () => true },
    { key: 'From Dispatch', label: 'From Dispatch', test: (r) => r.status === 'Initial Scheduling' || !!r.packageNo },
    { key: 'Ready to hand off', label: 'Ready to hand off', test: (r) => r.status === 'Initial Scheduling' && !!r.initialDate },
    { key: 'Handed off', label: 'Handed off', test: (r) => r.status !== 'Initial Scheduling' },
    { key: 'Today', label: 'Today', test: (r) => r.initialDate === today || r.createdOn === today },
    { key: 'Upcoming', label: 'Upcoming', test: (r) => r.initialDate > today },
    { key: 'Not yet completed', label: 'Not yet completed', test: (r) => r.status !== 'Completed' },
    { key: 'Rescheduled', label: 'Rescheduled', test: (r) => r.rescheduled || r.priority },
  ];

  const stats = [
    { label: 'Waiting', value: (r) => r.filter((x) => x.status === 'Initial Scheduling').length, tone: 'warn' },
    { label: 'No date yet', value: (r) => r.filter((x) => !x.initialDate).length, tone: 'bad' },
    { label: 'Ready to hand off', value: (r) => r.filter((x) => x.status === 'Initial Scheduling' && !!x.initialDate).length, tone: 'ok' },
    { label: 'Site confirmed', value: (r) => r.filter((x) => x.siteConfirmed).length, tone: 'ok' },
  ];

  return (
    <Screen
      title="Initial Scheduling"
      subtitle="Entry point for new delivery scheduling: set the first date, confirm the site, then hand off."
      rows={rows}
      columns={columns}
      tabs={tabs}
      stats={stats}
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => notify('info', 'Fill initial delivery details')}>
            New schedule
          </button>
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      )}
      actions={[
        {
          name: 'srHandOff',
          label: 'Hand off',
          title: 'Hand off to Service Request',
          when: (r) => r.status === 'Initial Scheduling' && !!r.initialDate,
        },
        {
          name: 'srSetInitial',
          label: 'Reschedule',
          title: 'Reschedule initial date',
          fields: [
            { key: 'date', label: 'New initial date', type: 'date', required: true, default: (r) => r.initialDate },
            { key: 'reason', label: 'Reschedule reason', type: 'textarea' },
          ],
        },
        {
          name: 'srConfirmSite',
          label: 'Confirm site',
          title: 'Confirm site readiness',
          when: (r) => r.type !== 'Pick Up' && !r.siteConfirmed,
          fields: confirmFields,
        },
      ]}
      create={{
        label: 'Schedule',
        action: 'srSetInitial',
        title: 'New schedule',
        fields: [
          { key: 'id', label: 'Delivery item', type: 'select', required: true, options: rows.filter((x) => !x.initialDate).map((x) => ({ value: x.id, label: `${x.no} · ${x.customer} (${x.item})` })) },
          { key: 'date', label: 'Initial delivery date', type: 'date', required: true },
          { key: 'type', label: 'Delivery Type', type: 'select', options: TYPES },
        ],
      }}
    />
  );
}

