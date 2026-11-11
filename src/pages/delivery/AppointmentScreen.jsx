import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { fmtDate } from '../../domain/util.js';
import './dms.css';

export default function AppointmentScreen() {
  const { db, today, act, notify } = useStore();
  const [activeTab, setActiveTab] = useState('scheduled');
  const [, setTick] = useState(0);

  const rows = (db.serviceRequests || []).filter((s) => ['Scheduled', 'Service Request'].includes(s.status));
  const scheduled = rows.filter((s) => s.status === 'Scheduled');
  const awaiting = rows.filter((s) => s.status === 'Service Request');

  const columns = [
    { key: 'no', label: 'SERVICE APPOINTMENT / SO', render: (r) => (
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
    { key: 'team', label: 'ASSIGNED TEAM', render: (r) => {
      const team = (db.teams || []).find((t) => t.id === r.team);
      return team ? (
        <div>
          <div style={{ fontWeight: 600 }}>{team.name}</div>
          <div className="muted" style={{ fontSize: '11px' }}>{team.installer || 'Installer'} · {team.vehicle || 'Truck'}</div>
        </div>
      ) : <span className="muted">Unassigned</span>;
    }},
    { key: 'scheduledDate', label: 'CONFIRMED SCHEDULE', render: (r) => (
      r.scheduledDate ? (
        <div>
          <div style={{ fontWeight: 600 }}>{fmtDate(r.scheduledDate)}</div>
          <div className="muted" style={{ fontSize: '11px' }}>{r.timeSlot || 'Morning'}</div>
        </div>
      ) : <span className="muted">Pending approval</span>
    )},
    { key: 'status', label: 'STATUS', pill: true },
  ];

  const tabs = [
    { key: 'awaiting', label: 'Awaiting approval', test: (r) => r.status === 'Service Request' },
    { key: 'scheduled', label: 'Scheduled appointments', test: (r) => r.status === 'Scheduled' },
    { key: 'calendar', label: 'Calendar', test: () => true },
  ];

  const stats = [
    { label: 'Awaiting approval', value: (r) => r.filter((x) => x.status === 'Service Request').length, tone: 'warn' },
    { label: 'Scheduled appointments', value: (r) => r.filter((x) => x.status === 'Scheduled').length, tone: 'ok' },
    { label: 'Ready to dispatch', value: (r) => r.filter((x) => x.status === 'Scheduled' && x.scheduledDate === today).length, tone: 'ok' },
    { label: 'Blocked by the gate', value: (r) => r.filter((x) => x.status === 'Scheduled' && !x.siteConfirmed && x.type !== 'Pick Up').length, tone: 'bad' },
    { label: 'Packages still here', value: (r) => r.filter((x) => x.status === 'Scheduled').length, tone: 'default' },
  ];

  return (
    <Screen
      title="Service Appointment"
      subtitle="Approve or override the engine's schedule, then dispatch one package at a time when the checklist passes."
      rows={rows}
      columns={columns}
      tabs={tabs}
      stats={stats}
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => notify('info', 'Reviewing appointment queue')}>
            Review
          </button>
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      )}
      actions={[
        {
          name: 'srStart',
          label: 'Start job',
          title: 'Start delivery job',
          when: (r) => r.status === 'Scheduled',
        },
        {
          name: 'srSchedule',
          label: 'Review',
          title: 'Review and confirm appointment',
          when: (r) => r.status === 'Service Request',
        },
        {
          name: 'srSetInitial',
          label: 'Override schedule',
          title: 'Override scheduled date',
          when: (r) => r.status === 'Scheduled',
          fields: [
            { key: 'date', label: 'New date', type: 'date', required: true, default: (r) => r.scheduledDate },
            { key: 'reason', label: 'Reason for override', type: 'textarea', required: true },
          ],
        },
      ]}
    />
  );
}

