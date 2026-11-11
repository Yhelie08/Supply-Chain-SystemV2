import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { useLang } from '../../i18n.js';
import { fmtDate } from '../../domain/util.js';
import { MODE_LABEL, SHIP_MODES, shipmentLabel, shipmentRows } from '../../domain/supplier.js';
import { GroupCards, PortalBar, ViewTabs, groupBy } from './parts.jsx';

// Shipments of a supplier. They exist once its PO is acknowledged; the supplier marks what it is shipping, with a date and a mode.
export default function SupplierShipments({ supplier }) {
  const { db, today } = useStore();
  const { t } = useLang();
  const [view, setView] = useState('list');

  const rows = shipmentRows(db, supplier).map((s) => ({ ...s, sStatus: shipmentLabel(s), modeText: MODE_LABEL[s.mode] || s.mode, ref: s.poNo || s.rrNo }));
  const count = (s) => (all) => all.filter((r) => r.sStatus === s).length;

  const ship = {
    name: 'supplierShip', label: t('Ship'), title: t('Ship these items?'), submit: t('Ship'), cancelLabel: t('Cancel'), yesLabel: t('Yes'),
    when: (r) => r.status === 'Pending',
    confirmIf: () => t('This marks {n} item(s) as shipped and cannot be undone from here. Continue?').replace('{n}', '1'),
    fields: [
      { key: 'dateShipped', label: t('Date Shipped'), type: 'date', required: true, default: today },
      { key: 'mode', label: t('Mode'), type: 'select', required: true, options: SHIP_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] })), default: (r) => r.mode },
    ],
    payload: (r, v) => ({ id: r.id, supplier, ...v }),
  };
  const columns = [
    { key: 'no', label: t('Shipment No') }, { key: 'ref', label: 'PO / RR' }, { key: 'item', label: t('Item') }, { key: 'qty', label: t('Total Items') },
    { key: 'modeText', label: t('Mode') },
    { key: 'dateShipped', label: t('Date Shipped'), render: (r) => fmtDate(r.dateShipped), csv: (r) => r.dateShipped },
    { key: 'eta', label: t('ETA'), render: (r) => fmtDate(r.eta), csv: (r) => r.eta },
    { key: 'sStatus', label: t('Status'), render: (r) => <Pill>{t(r.sStatus)}</Pill>, csv: (r) => r.sStatus },
  ];
  const pills = [['All', 'All'], ['LCL', 'LCL'], ['FCL', 'FCL'], ['Airfreight', 'Air Freight']].map(([key, label]) => ({ key, label: t(label), test: (r) => key === 'All' || r.mode === key }));
  const heading = { title: t('Shipments'), subtitle: t("Shipments — mark what you're shipping today, per item.") };

  return (
    <>
      <PortalBar supplier={supplier} />
      <ViewTabs views={[['list', t('All Shipments')], ['groups', t('Shipment Groups')]]} view={view} setView={setView} />
      {view === 'groups' ? (
        <GroupCards {...heading} groups={groupBy(rows, (r) => r.ref || '— No PO —')} columns={[columns[0], columns[2], columns[3], columns[4], columns[7]]} action={ship} />
      ) : (
        <Screen
          {...heading}
          rows={rows}
          columns={columns}
          tabs={pills}
          stats={[
            { label: t('Shipments'), value: (r) => r.length },
            { label: t('Total Items'), value: (r) => r.reduce((n, x) => n + x.qty, 0) },
            { label: t('Pending'), value: count('Pending'), tone: 'warn' },
            { label: t('Shipped'), value: count('Shipped'), tone: 'ok' },
          ]}
          viewButton={(r) => (r.status === 'Pending' ? t('Review') : t('View'))}
          actions={[ship]}
          searchKeys={['no', 'poNo', 'rrNo', 'item']}
        />
      )}
    </>
  );
}
