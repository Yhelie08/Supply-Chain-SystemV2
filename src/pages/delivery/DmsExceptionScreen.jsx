import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { fmtDate } from '../../domain/util.js';
import './dms.css';

export default function DmsExceptionScreen() {
  const { db, today, act, notify } = useStore();
  const [, setTick] = useState(0);

  // Failed deliveries wait here for a decision
  const rows = (db.serviceRequests || []).filter((s) => s.status === 'Exception');

  const columns = [
    { key: 'no', label: 'EXCEPTION / SR', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--bad, #dc2626)' }}>{r.no}</div>
        <div className="muted" style={{ fontSize: '12px' }}>{r.soNo} · {r.customer}</div>
      </div>
    )},
    { key: 'address', label: 'CUSTOMER ADDRESS', render: (r) => (
      <div>
        <div>{r.address || '—'}</div>
        <div className="muted" style={{ fontSize: '11px' }}>{r.item}</div>
      </div>
    )},
    { key: 'team', label: 'ASSIGNED TEAM', render: (r) => {
      const team = (db.teams || []).find((t) => t.id === r.team);
      return team ? team.name : '—';
    }},
    { key: 'reason', label: 'FAILURE REASON', render: (r) => (
      <div>
        <div style={{ color: 'var(--bad, #dc2626)', fontWeight: 500 }}>{r.reason || 'Delivery failed at site'}</div>
        <div className="muted" style={{ fontSize: '11px' }}>Resolve by: {fmtDate(r.scheduledDate || today)}</div>
      </div>
    )},
    { key: 'severity', label: 'SEVERITY', render: (r) => (
      r.reason?.toLowerCase().includes('damage') || r.priority ? (
        <Pill tone="bad">High</Pill>
      ) : <Pill tone="warn">Medium</Pill>
    )},
    { key: 'exStatus', label: 'STATUS', render: (r) => (
      r.inProgress ? <Pill tone="warn">In Progress</Pill> : <Pill tone="bad">Open</Pill>
    )},
    { key: 'actions', label: 'ACTIONS', render: (r) => (
      <div style={{ display: 'flex', gap: '6px' }}>
        <button className="btn sm" onClick={() => { r.inProgress = true; notify('ok', `Started ${r.no}`); setTick((t) => t + 1); }}>Start</button>
        <button className="btn sm btn-primary" onClick={() => notify('info', `Resolve ${r.no}`)}>Resolve</button>
        <button className="btn sm btn-danger" onClick={() => notify('warn', `Dismiss ${r.no}`)}>Dismiss</button>
      </div>
    )},
  ];

  const tabs = [
    { key: 'open', label: 'Open', test: (r) => !r.inProgress },
    { key: 'in_progress', label: 'In Progress', test: (r) => !!r.inProgress },
    { key: 'resolved', label: 'Resolved', test: () => false },
    { key: 'all', label: 'All', test: () => true },
  ];

  const stats = [
    { label: 'Open Exceptions', value: (r) => r.filter((x) => !x.inProgress).length, tone: 'bad' },
    { label: 'Open — High Severity', value: (r) => r.filter((x) => !x.inProgress && (x.reason?.toLowerCase().includes('damage') || x.priority)).length, tone: 'bad' },
    { label: 'Past Resolve-By', value: (r) => r.filter((x) => (x.scheduledDate || today) < today).length, tone: 'bad' },
    { label: 'Resolved', value: () => (db.audit || []).filter((a) => a.action === 'srResolve').length, tone: 'ok' },
  ];

  return (
    <Screen
      title="DMS Exception Queue"
      subtitle="The human intervention layer — everything the system will not resolve on its own."
      rows={rows}
      columns={columns}
      tabs={tabs}
      stats={stats}
      empty="No failed deliveries. Nothing is waiting for a decision."
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      )}
      actions={[
        {
          name: 'startException',
          label: 'Start',
          title: 'Start working on exception',
          when: (r) => !r.inProgress,
          run: (r) => {
            r.inProgress = true;
            notify('ok', `Started investigation for ${r.no}.`);
            setTick((t) => t + 1);
          },
        },
        {
          name: 'srResolve',
          label: 'Resolve',
          title: 'Resolve exception',
          fields: [
            {
              key: 'action',
              label: 'Resolution action',
              type: 'select',
              options: ['Reschedule', 'Revert to System'],
              required: true,
              hint: 'Reschedule makes it a priority job. Revert to System hands it back to the engine.',
            },
            { key: 'newDate', label: 'New date (for Reschedule)', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ],
        },
        {
          name: 'dismissException',
          label: 'Dismiss',
          title: 'Dismiss exception',
          tone: 'danger',
          fields: [
            { key: 'reason', label: 'Why is this being dismissed?', type: 'textarea', required: true },
          ],
          run: (r, v) => {
            act('srResolve', { id: r.id, action: 'Revert to System', notes: 'Dismissed: ' + (v?.reason || '') });
            notify('warn', `Exception ${r.no} dismissed.`);
          },
        },
      ]}
    />
  );
}
