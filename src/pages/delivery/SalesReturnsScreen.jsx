import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { WAREHOUSES } from '../../domain/fulfillment.js';
import './dms.css';

export default function SalesReturnsScreen() {
  const { db, notify } = useStore();
  const [, setTick] = useState(0);

  const rows = db.salesReturns || [];

  const columns = [
    { key: 'no', label: 'RETURN #', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--accent, #00897b)' }}>{r.no}</div>
        <div className="muted" style={{ fontSize: '12px' }}>{r.srNo} · {r.customer}</div>
      </div>
    )},
    { key: 'soNo', label: 'SALES ORDER' },
    { key: 'warehouse', label: 'WAREHOUSE' },
    { key: 'rma', label: 'RMA' },
    { key: 'reason', label: 'REASON' },
    { key: 'qty', label: 'QTY' },
    { key: 'status', label: 'STATUS', pill: true },
  ];

  const tabs = ['All', 'Created', 'Pending'].map((s) => ({
    key: s,
    label: s,
    test: (r) => s === 'All' || r.status === s,
  }));

  const stats = [
    { label: 'Total Returns', value: (r) => r.length },
    { label: 'Created', value: (r) => r.filter((x) => x.status === 'Created').length, tone: 'ok' },
    { label: 'Pending', value: (r) => r.filter((x) => x.status === 'Pending').length, tone: 'warn' },
    { label: 'Warehouses Involved', value: (r) => new Set(r.map((x) => x.warehouse)).size },
  ];

  return (
    <Screen
      title="Sales Returns"
      subtitle="Returns and reverse logistics, sent to Books."
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
          name: 'salesReturnSendToBooks',
          label: 'Send to Books',
          title: 'Send return to Books',
          when: (r) => r.status === 'Pending',
          fields: [
            { key: 'rma', label: 'RMA number', required: true },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true },
            { key: 'qty', label: 'Item quantity', type: 'number', required: true },
            { key: 'signature', label: 'Signature (type the name)', required: true },
          ],
        },
      ]}
      create={{
        label: 'New Sales Return',
        action: 'salesReturnCreate',
        title: 'New Sales Return',
        submit: 'Create Return',
        fields: [
          {
            key: 'id',
            label: 'Service Request',
            type: 'select',
            required: true,
            options: (db.serviceRequests || []).map((s) => ({ value: s.id, label: `${s.no} · ${s.customer}` })),
          },
          { key: 'warehouse', label: 'Warehouse', type: 'select', options: WAREHOUSES, default: WAREHOUSES[0] },
        ],
      }}
    />
  );
}

