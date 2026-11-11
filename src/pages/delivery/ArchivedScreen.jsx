import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { fmtDate } from '../../domain/util.js';
import { WAREHOUSES } from '../../domain/fulfillment.js';
import './dms.css';

export default function ArchivedScreen() {
  const { db, notify } = useStore();
  const [, setTick] = useState(0);

  const rows = (db.serviceRequests || [])
    .filter((s) => ['Completed', 'Exception'].includes(s.status))
    .map((s) => ({
      ...s,
      outcome: s.status === 'Completed' ? 'Completed' : 'Failed',
      hasReturn: (db.salesReturns || []).some((r) => r.srNo === s.no),
    }));

  const columns = [
    { key: 'no', label: 'SERVICE REQUEST', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--accent, #00897b)' }}>{r.no}</div>
        <div className="muted" style={{ fontSize: '12px' }}>{r.soNo} · {r.customer}</div>
      </div>
    )},
    { key: 'type', label: 'TYPE' },
    { key: 'scheduledDate', label: 'DATE', render: (r) => fmtDate(r.scheduledDate) },
    { key: 'team', label: 'TEAM', render: (r) => {
      const team = (db.teams || []).find((t) => t.id === r.team);
      return team ? team.name : '—';
    }},
    { key: 'outcome', label: 'OUTCOME', render: (r) => (
      <Pill tone={r.outcome === 'Completed' ? 'ok' : 'bad'}>{r.outcome}</Pill>
    )},
    { key: 'hasReturn', label: 'RETURN', render: (r) => (
      r.hasReturn ? <Pill tone="warn">Opened</Pill> : <span className="muted">—</span>
    )},
  ];

  const tabs = [
    { key: 'archived', label: 'Archived', test: () => true },
    { key: 'ship', label: 'Create Shipment', test: (r) => r.outcome === 'Failed' && !r.hasReturn },
    { key: 'all', label: 'All', test: () => true },
    { key: 'completed', label: 'Completed', test: (r) => r.outcome === 'Completed' },
    { key: 'failed', label: 'Failed', test: (r) => r.outcome === 'Failed' },
  ];

  const stats = [
    { label: 'Total Archived', value: (r) => r.length },
    { label: 'Completed', value: (r) => r.filter((x) => x.outcome === 'Completed').length, tone: 'ok' },
    { label: 'Failed', value: (r) => r.filter((x) => x.outcome === 'Failed').length, tone: 'bad' },
    { label: 'Installation Complete', value: (r) => r.filter((x) => x.outcome === 'Completed' && x.type === 'Installation').length, tone: 'ok' },
  ];

  return (
    <Screen
      title="Archived"
      subtitle="Completed and failed deliveries with their installation outcome."
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
        label: 'Create Sales Return',
        action: 'salesReturnCreate',
        title: 'Create Sales Return',
        submit: 'Create',
        fields: [
          {
            key: 'id',
            label: 'Delivery',
            type: 'select',
            required: true,
            options: rows.filter((r) => !r.hasReturn).map((r) => ({ value: r.id, label: `${r.no} · ${r.customer} (${r.outcome})` })),
          },
          { key: 'warehouse', label: 'Return to warehouse', type: 'select', options: WAREHOUSES, default: WAREHOUSES[0] },
        ],
      }}
      actions={[
        {
          name: 'salesReturnCreate',
          label: 'Create Sales Return',
          when: (r) => !r.hasReturn,
          fields: [{ key: 'warehouse', label: 'Return to warehouse', type: 'select', options: WAREHOUSES, default: WAREHOUSES[0] }],
        },
      ]}
    />
  );
}

