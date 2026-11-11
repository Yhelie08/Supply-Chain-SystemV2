import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { fmtDate } from '../../domain/util.js';
import './dms.css';

export default function OngoingScreen() {
  const { db, today, act, notify } = useStore();
  const [, setTick] = useState(0);

  const rows = (db.serviceRequests || []).filter((s) => ['Ongoing', 'Completed'].includes(s.status));

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
    { key: 'team', label: 'TEAM', render: (r) => {
      const team = (db.teams || []).find((t) => t.id === r.team);
      return team ? team.name : '—';
    }},
    { key: 'scheduledDate', label: 'DATE', render: (r) => fmtDate(r.scheduledDate) },
    { key: 'fieldWorkStatus', label: 'FIELD WORK', render: (r) => {
      if (r.status === 'Completed') return <Pill tone="ok">Installation Completed</Pill>;
      if (r.fieldWorkStarted) return <Pill tone="warn">Started</Pill>;
      return <Pill tone="default">Not Started</Pill>;
    }},
    { key: 'status', label: 'STATUS', pill: true },
  ];

  const tabs = [
    { key: 'today', label: 'Today', test: (r) => r.scheduledDate === today },
    { key: 'all', label: 'All Ongoing', test: () => true },
    { key: 'not_started', label: 'Not Started', test: (r) => r.status === 'Ongoing' && !r.fieldWorkStarted },
    { key: 'started', label: 'Started', test: (r) => r.status === 'Ongoing' && !!r.fieldWorkStarted },
    { key: 'completed', label: 'Installation Completed', test: (r) => r.status === 'Completed' },
  ];

  const stats = [
    { label: 'Ongoing Deliveries', value: (r) => r.filter((x) => x.status === 'Ongoing').length, tone: 'warn' },
    { label: 'Not Started', value: (r) => r.filter((x) => x.status === 'Ongoing' && !x.fieldWorkStarted).length, tone: 'default' },
    { label: 'Started', value: (r) => r.filter((x) => x.status === 'Ongoing' && !!x.fieldWorkStarted).length, tone: 'warn' },
    { label: 'Installation Completed', value: (r) => r.filter((x) => x.status === 'Completed').length, tone: 'ok' },
  ];

  return (
    <Screen
      title="Ongoing Service"
      subtitle="Installation and site completion form for deliveries in the field."
      rows={rows}
      columns={columns}
      tabs={tabs}
      stats={stats}
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => notify('ok', 'Field Work progress saved.')}>
            Save Field Work
          </button>
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      )}
      actions={[
        {
          name: 'srComplete',
          label: 'Complete',
          title: 'Complete installation & delivery',
          when: (r) => r.status === 'Ongoing',
        },
        {
          name: 'srFail',
          label: 'Mark failed',
          tone: 'danger',
          title: 'Delivery failed',
          submit: 'Send to exception queue',
          when: (r) => r.status === 'Ongoing',
          fields: [{ key: 'reason', label: 'What went wrong', type: 'textarea', required: true }],
        },
      ]}
    />
  );
}

