import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { fmtDate } from '../../domain/util.js';
import './dms.css';

const kinds = ['Installation Assessment', 'Repair Assessment', 'Other'];

export default function SiteVisitsScreen() {
  const { db, notify } = useStore();
  const [, setTick] = useState(0);

  const rows = db.siteVisits || [];

  const columns = [
    { key: 'no', label: 'VISIT #', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--accent, #00897b)' }}>{r.no}</div>
        <div className="muted" style={{ fontSize: '12px' }}>{r.srNo} · {r.customer}</div>
      </div>
    )},
    { key: 'kind', label: 'TYPE', render: (r) => <Pill tone={r.kind?.includes('Repair') ? 'warn' : 'default'}>{r.kind}</Pill> },
    { key: 'visitDate', label: 'VISIT DATE', render: (r) => fmtDate(r.visitDate) },
    { key: 'siteReady', label: 'SITE READY', render: (r) => (
      <Pill tone={r.siteReady ? 'ok' : 'warn'}>{r.siteReady ? 'Ready' : 'Not ready'}</Pill>
    )},
    { key: 'notes', label: 'NOTES', render: (r) => r.notes || '—' },
  ];

  const tabs = ['All', ...kinds].map((k) => ({
    key: k,
    label: k,
    test: (r) => k === 'All' || r.kind === k,
  }));

  const stats = [
    { label: 'Total Visits', value: (r) => r.length },
    { label: 'Site Ready', value: (r) => r.filter((x) => x.siteReady).length, tone: 'ok' },
    { label: 'Installation', value: (r) => r.filter((x) => x.kind === 'Installation Assessment').length },
    { label: 'Repair', value: (r) => r.filter((x) => x.kind === 'Repair Assessment').length },
  ];

  return (
    <Screen
      title="Field Service Site Visits"
      subtitle="Site assessments before installation or repair."
      rows={rows}
      columns={columns}
      tabs={tabs}
      stats={stats}
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      )}
      actions={[
        {
          name: 'siteVisitUpdate',
          label: 'Save Changes',
          title: 'Save site visit',
          fields: [
            { key: 'siteReady', label: 'Site is ready', type: 'checkbox', default: (r) => r.siteReady },
            { key: 'notes', label: 'Notes', type: 'textarea', default: (r) => r.notes },
          ],
        },
      ]}
      create={{
        label: 'Schedule Visit',
        action: 'siteVisitCreate',
        title: 'Schedule a site visit',
        submit: 'Schedule',
        fields: [
          {
            key: 'id',
            label: 'Service Request',
            type: 'select',
            required: true,
            options: (db.serviceRequests || []).filter((s) => s.status !== 'Completed').map((s) => ({ value: s.id, label: `${s.no} · ${s.customer}` })),
          },
          { key: 'kind', label: 'Type', type: 'select', options: kinds, required: true },
          { key: 'visitDate', label: 'Visit date', type: 'date' },
        ],
      }}
    />
  );
}

