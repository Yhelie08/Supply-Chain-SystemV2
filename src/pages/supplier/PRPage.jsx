import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import { useLang } from '../../i18n.js';
import { fmtDate } from '../../domain/util.js';
import { isInactive } from '../../domain/pr.js';
import { prRows, prStatus, prViewOnly, quotesEditable } from '../../domain/supplier.js';
import { GroupCards, PortalBar, ViewTabs, groupBy, respondSpec } from './parts.jsx';

// Purchase requests assigned to a supplier. One that came from an inquiry is view-only here: it is quoted on the inquiry.
export default function SupplierPR({ supplier }) {
  const { db } = useStore();
  const { t } = useLang();
  const [view, setView] = useState('list');

  const rows = prRows(db, supplier).map((p) => ({ ...p, sStatus: prStatus(p, supplier), sQuote: (p.quotes || []).find((q) => q.supplier === supplier) }));
  const count = (s) => (all) => all.filter((r) => r.sStatus === s).length;
  const canRespond = (r) => quotesEditable(r.sStatus) && !prViewOnly(r) && !isInactive(r);
  const respond = { ...respondSpec({ supplier, name: 'supplierRespondPR', t, withNegotiated: false }), when: canRespond };

  const columns = [
    { key: 'no', label: t('PR No') }, { key: 'item', label: t('Item Name') }, { key: 'sku', label: t('SKU') }, { key: 'description', label: t('Description') },
    { key: 'qty', label: t('Qty') }, { key: 'targetDate', label: t('Target Delivery'), render: (r) => fmtDate(r.targetDate), csv: (r) => r.targetDate },
    { key: 'priority', label: t('Priority') },
    { key: 'sStatus', label: t('Status'), render: (r) => <Pill>{t(r.sStatus)}</Pill>, csv: (r) => r.sStatus },
  ];
  const pills = ['All', 'Waiting', 'Submit Response', 'Selected'].map((s) => ({ key: s, label: t(s), test: (r) => s === 'All' || r.sStatus === s }));
  const heading = { title: t('Purchase Request'), subtitle: t('Purchase requests assigned to you — submit pricing, availability and lead time.') };

  return (
    <>
      <PortalBar supplier={supplier} />
      <ViewTabs views={[['list', t('All PRs')], ['groups', t('PR Groups')]]} view={view} setView={setView} />
      {view === 'groups' ? (
        <GroupCards {...heading} groups={groupBy(rows, (r) => r.soNo || '— No Sales Order —')} columns={[columns[0], columns[1], columns[4], columns[5], columns[6], columns[7]]} action={respond} />
      ) : (
        <Screen
          {...heading}
          rows={rows}
          columns={columns}
          tabs={pills}
          stats={[
            { label: t('Waiting'), value: count('Waiting'), sub: t('Not yet responded'), tone: 'warn' },
            { label: t('Submit Response'), value: count('Submit Response'), sub: t('In progress') },
            { label: t('Selected'), value: count('Selected'), sub: t('Awaiting PO'), tone: 'ok' },
          ]}
          viewButton={t('View')}
          actions={[respond]}
          drawerExtra={(r) => (
            <p className="hint">
              {prViewOnly(r) ? `${r.no} came from ${r.inquiryNo}, so it is view-only here. It is quoted on the inquiry.`
                : isInactive(r) ? `${r.no} is ${r.hold}, so it cannot be quoted.` : ''}
            </p>
          )}
          searchKeys={['item', 'sku', 'no']}
        />
      )}
    </>
  );
}
