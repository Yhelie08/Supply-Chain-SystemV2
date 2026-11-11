import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { useLang } from '../../i18n.js';
import { fmtCNY, fmtDate } from '../../domain/util.js';
import { COLLATERAL_FIELDS } from '../../domain/inquiry.js';
import { collateralEditable, inquiryRows, inquiryStatus, quoteGroupOf, quotesEditable } from '../../domain/supplier.js';
import { GroupCards, PortalBar, SupplierChat, ViewTabs, groupBy, respondSpec } from './parts.jsx';

// Inquiries assigned to a supplier: answer with availability, lead time and price; the selected supplier then completes the collateral.
export default function SupplierInquiries({ supplier }) {
  const { db } = useStore();
  const { t } = useLang();
  const [view, setView] = useState('list');

  const rows = inquiryRows(db, supplier).map((i) => {
    const q = i.quotes.find((x) => x.supplier === supplier);
    return {
      ...i, sStatus: inquiryStatus(i, supplier), sQuote: q, sAvail: q.availability, sLead: q.leadTime, sInitial: q.initial, sFinal: q.final,
    };
  });
  const count = (s) => (all) => all.filter((r) => r.sStatus === s).length;

  const respond = { ...respondSpec({ supplier, name: 'supplierRespondInquiry', t, withNegotiated: true }), when: (r) => quotesEditable(r.sStatus) };
  const collateral = {
    name: 'supplierCollateral', label: t('Product Collateral'), title: t('Product Collateral'), submit: t('Save'), cancelLabel: t('Cancel'),
    when: (r) => collateralEditable(r.sStatus),
    intro: t("You're the selected supplier — pricing is now locked. Complete the collateral checklist below to finish."),
    fields: COLLATERAL_FIELDS.map(([key, label]) => ({
      key, label: t(label), type: 'select', options: ['Pending', 'N/A', 'Completed'].map((v) => ({ value: v, label: v })), default: (r) => (['Pending', 'N/A', 'Completed'].includes(r.collateral[key]) ? r.collateral[key] : 'Pending'),
    })),
    payload: (r, v) => ({ id: r.id, supplier, ...v }),
  };

  const columns = [
    { key: 'no', label: t('INQ No') }, { key: 'item', label: t('Item Name') }, { key: 'sku', label: t('SKU') }, { key: 'description', label: t('Description') },
    { key: 'qty', label: t('Qty') }, { key: 'targetDate', label: t('Target Date'), render: (r) => fmtDate(r.targetDate), csv: (r) => r.targetDate },
    { key: 'sAvail', label: t('Availability'), render: (r) => (r.sAvail === 'Pending' ? <span className="muted">—</span> : r.sAvail), csv: (r) => r.sAvail },
    { key: 'sLead', label: t('Lead Time (days)') },
    { key: 'sFinal', label: t('Final Price'), render: (r) => (r.sFinal ? fmtCNY(r.sFinal) : <span className="muted">—</span>), csv: (r) => r.sFinal },
    { key: 'sStatus', label: t('Status'), render: (r) => <Pill>{t(r.sStatus)}</Pill>, csv: (r) => r.sStatus },
  ];

  const pills = ['All', 'Waiting', 'Submit Response', 'Selected', 'Completed'].map((s) => ({ key: s, label: t(s), test: (r) => s === 'All' || r.sStatus === s }));
  const detailCols = [...columns, { key: 'specDetails', label: t('Specification Details') }, { key: 'additionalDescription', label: t('Additional Description') }];

  const heading = { title: t('Inquiries'), subtitle: t('Inquiries assigned to you — submit pricing, availability and collateral.') };
  const tabs = <ViewTabs views={[['list', t('Inquiries')], ['groups', t('Group Inquiry')]]} view={view} setView={setView} />;

  return (
    <>
      <PortalBar supplier={supplier} />
      {tabs}
      {view === 'groups' ? (
        <GroupCards
          {...heading}
          groups={groupBy(rows, quoteGroupOf, (k, list) => `${k}${list[0].projectName ? ` · ${list[0].projectName}` : ''}`)}
          columns={[columns[0], columns[1], columns[2], columns[4], columns[6], columns[7], { ...columns[8] }, columns[9]]}
          action={respond}
        />
      ) : (
        <Screen
          {...heading}
          rows={rows}
          columns={columns}
          details={detailCols}
          tabs={pills}
          stats={[
            { label: t('Waiting'), value: count('Waiting'), sub: t('Not yet responded'), tone: 'warn' },
            { label: t('Submit Response'), value: count('Submit Response'), sub: t('In progress') },
            { label: t('Selected'), value: count('Selected'), sub: t('Awaiting PO'), tone: 'ok' },
            { label: t('Completed'), value: count('Completed'), sub: t('Locked, done') },
          ]}
          viewButton={t('View')}
          actions={[respond, collateral]}
          drawerExtra={(row) => <SupplierChat inq={row} supplier={supplier} />}
          searchKeys={['item', 'sku', 'no']}
        />
      )}
    </>
  );
}
