import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { useLang } from '../../i18n.js';
import { fmtDate, fmtMoneyIn } from '../../domain/util.js';
import { poLabel, poRows } from '../../domain/supplier.js';
import { GroupCards, PortalBar, ViewTabs, groupBy } from './parts.jsx';

// Purchase orders sent to a supplier. Acknowledging one with an ETD and ETA confirms it and creates the shipment.
export default function SupplierPO({ supplier }) {
  const { db } = useStore();
  const { t } = useLang();
  const [view, setView] = useState('list');

  const soOf = (po) => (db.prs.find((p) => po.prIds.includes(p.id)) || {}).soNo || '— No Sales Order —';
  const rows = poRows(db, supplier).map((p) => ({ ...p, sStatus: poLabel(p), lines: p.prNos.length, soNo: soOf(p) }));
  const count = (s) => (all) => all.filter((r) => r.sStatus === s).length;
  const currency = rows[0] ? rows[0].currency : 'CNY';

  const ack = {
    name: 'supplierAckPO', label: t('Acknowledge PO'), title: t('Acknowledge this Purchase Order?'), submit: t('Acknowledge PO'), cancelLabel: t('Cancel'), yesLabel: t('Yes'),
    when: (r) => r.status === 'Sent',
    intro: t('This confirms you can fulfill this PO as listed and notifies the buyer. ETD/ETA above will be saved with it.'),
    fields: [
      { key: 'etd', label: t('ETD'), type: 'date', required: true, hint: t('Estimated Time of Departure from your side') },
      { key: 'eta', label: t('ETA'), type: 'date', required: true, hint: t("Estimated Time of Arrival at warehouse — should not be later than the buyer's Target Delivery above") },
    ],
    payload: (r, v) => ({ id: r.id, supplier, ...v }),
  };
  const columns = [
    { key: 'no', label: t('PO No') }, { key: 'lines', label: t('Lines') },
    { key: 'qty', label: t('Qty') },
    { key: 'total', label: t('Total Value'), render: (r) => fmtMoneyIn(r.total, r.currency), csv: (r) => r.total },
    { key: 'createdOn', label: t('PO Date'), render: (r) => fmtDate(r.createdOn), csv: (r) => r.createdOn },
    { key: 'etd', label: t('ETD'), render: (r) => fmtDate(r.etd), csv: (r) => r.etd }, { key: 'eta', label: t('ETA'), render: (r) => fmtDate(r.eta), csv: (r) => r.eta },
    { key: 'sStatus', label: t('Status'), render: (r) => <Pill>{tp(r.sStatus)}</Pill>, csv: (r) => r.sStatus },
  ];
  const tp = (s) => t(s, 'po');
  const pills = ['All', 'Awaiting Acknowledge', 'Confirmed'].map((s) => ({ key: s, label: tp(s), test: (r) => s === 'All' || r.sStatus === s }));
  const heading = { title: t('Purchase Order'), subtitle: t('Purchase Orders — review line items and acknowledge to confirm.') };

  // The line items of a PO, read-only.
  const lineItems = (po) => {
    const lines = db.prs.filter((p) => po.prIds.includes(p.id));
    return (
      <>
        <h4>{t('Line Items — Read-Only')}</h4>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('PR No')}</th><th>{t('SKU')}</th><th>{t('Item Name')}</th><th>{t('Qty')}</th><th>{t('Shipping Mode')}</th><th>{t('Target Delivery')}</th><th>{t('Priority')}</th></tr></thead>
            <tbody>
              {lines.map((l) => <tr key={l.id}><td>{l.no}</td><td>{l.sku}</td><td>{l.item}</td><td>{l.qty}</td><td>{l.mode || '—'}</td><td>{fmtDate(l.targetDate)}</td><td>{l.priority}</td></tr>)}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  return (
    <>
      <PortalBar supplier={supplier} />
      <ViewTabs views={[['list', t('All POs')], ['groups', t('PO Groups')]]} view={view} setView={setView} />
      {view === 'groups' ? (
        <GroupCards {...heading} groups={groupBy(rows, (r) => r.soNo)} columns={[columns[0], columns[1], columns[2], columns[3], columns[7]]} action={ack} />
      ) : (
        <Screen
          {...heading}
          rows={rows}
          columns={columns}
          tabs={pills}
          stats={[
            { label: t('Total POs'), value: (r) => r.length, sub: t('All time') },
            { label: t('Awaiting Acknowledge'), value: count('Awaiting Acknowledge'), sub: t('Needs your action'), tone: 'warn' },
            { label: tp('Confirmed'), value: count('Confirmed'), sub: t('Acknowledged'), tone: 'ok' },
            { label: t('Total Value'), value: (r) => fmtMoneyIn(r.reduce((n, x) => n + x.total, 0), currency), sub: t('All POs') },
          ]}
          viewButton={t('View')}
          actions={[ack]}
          drawerExtra={lineItems}
          searchKeys={['no', 'sStatus']}
        />
      )}
    </>
  );
}
