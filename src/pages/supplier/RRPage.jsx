import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { useLang } from '../../i18n.js';
import { fmtDate } from '../../domain/util.js';
import { MODE_LABEL, SHIP_MODES, rrLabel, rrRows } from '../../domain/supplier.js';
import { GroupCards, PortalBar, ViewTabs, groupBy } from './parts.jsx';

// Replacement requests sent to a supplier: approve one, then keep its progress up to date until it ships.
export default function SupplierRR({ supplier }) {
  const { db } = useStore();
  const { t } = useLang();
  const [view, setView] = useState('list');

  const reasonOf = (rr) => {
    const exc = db.exceptions.find((e) => e.id === rr.excId);
    return exc ? exc.type : '';
  };
  const rows = rrRows(db, supplier).map((r) => ({ ...r, sStatus: rrLabel(r), reason: reasonOf(r) }));
  const count = (s) => (all) => all.filter((r) => r.sStatus === s).length;
  const inProgress = (all) => all.filter((r) => ['Acknowledged', 'In Production', 'Shipped'].includes(r.status)).length;

  const approve = {
    name: 'supplierApproveRR', label: t('Approve RR'), title: t('Approve this Replacement Request?'), submit: t('Approve RR'), cancelLabel: t('Cancel'), yesLabel: t('Yes'),
    when: (r) => r.status === 'Open',
    intro: t('This confirms you can fulfill the replacement as listed. It cannot be undone from here.'),
    fields: [
      { key: 'mode', label: t('Shipment Mode'), type: 'select', required: true, options: SHIP_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] })) },
      { key: 'expShip', label: t('Expected Ship Date'), type: 'date', required: true },
      { key: 'eta', label: t('ETA'), type: 'date', required: true },
    ],
    payload: (r, v) => ({ id: r.id, supplier, ...v }),
  };
  const progress = {
    name: 'supplierRRProgress', label: t('Update Progress'), title: t('Update Progress'), submit: t('Save'), cancelLabel: t('Cancel'),
    when: (r) => r.status === 'Acknowledged' || r.status === 'In Production',
    intro: t('Approved — update ship dates/ETA/status below as the replacement progresses.'),
    fields: [
      { key: 'status', label: t('Status'), type: 'select', required: true, options: ['In Production', 'Shipped'].map((v) => ({ value: v, label: t(v) })) },
      { key: 'expShip', label: t('Expected Ship Date'), type: 'date', default: (r) => r.expShip },
      { key: 'eta', label: t('ETA'), type: 'date', default: (r) => r.eta },
    ],
    payload: (r, v) => ({ id: r.id, supplier, ...v }),
  };
  const columns = [
    { key: 'no', label: t('RR No') }, { key: 'item', label: t('Item') }, { key: 'qty', label: t('Qty') }, { key: 'reason', label: t('Reason') },
    { key: 'raisedOn', label: t('RR Date'), render: (r) => fmtDate(r.raisedOn), csv: (r) => r.raisedOn },
    { key: 'expShip', label: t('Expected Ship Date'), render: (r) => fmtDate(r.expShip), csv: (r) => r.expShip },
    { key: 'eta', label: t('ETA'), render: (r) => fmtDate(r.eta), csv: (r) => r.eta },
    { key: 'sStatus', label: t('Status'), render: (r) => <Pill>{t(r.sStatus)}</Pill>, csv: (r) => r.sStatus },
  ];
  const pills = ['All', 'Awaiting Approval', 'Acknowledged', 'In Production', 'Shipped'].map((s) => ({ key: s, label: t(s), test: (r) => s === 'All' || r.sStatus === s }));
  const heading = { title: t('Replacement Request'), subtitle: t('Replacement Requests — review and approve replacements for damaged/missing items.') };

  return (
    <>
      <PortalBar supplier={supplier} />
      <ViewTabs views={[['list', t('All RRs')], ['groups', t('RR Groups')]]} view={view} setView={setView} />
      {view === 'groups' ? (
        <GroupCards {...heading} groups={groupBy(rows, (r) => r.excNo || '— No Exception —')} columns={[columns[0], columns[1], columns[2], columns[3], columns[7]]} action={approve} />
      ) : (
        <Screen
          {...heading}
          rows={rows}
          columns={columns}
          tabs={pills}
          stats={[
            { label: t('Total RRs'), value: (r) => r.length, sub: t('All time') },
            { label: t('Awaiting Approval'), value: count('Awaiting Approval'), sub: t('Needs your action'), tone: 'warn' },
            { label: t('In Progress'), value: inProgress, sub: t('Acknowledged → Shipped') },
            { label: t('Received'), value: count('Received'), sub: t('Delivered'), tone: 'ok' },
          ]}
          viewButton={(r) => (r.status === 'Open' ? t('Review') : t('View'))}
          actions={[approve, progress]}
          searchKeys={['no', 'item', 'reason']}
        />
      )}
    </>
  );
}
