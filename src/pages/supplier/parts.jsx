import { useState } from 'react';
import { useStore } from '../../store.jsx';
import { ActionModal, Pill } from '../../ui/components.jsx';
import LangToggle from '../../ui/LangToggle.jsx';
import { useLang } from '../../i18n.js';
import { fmtDateTime } from '../../domain/util.js';
import { chatKey } from '../../domain/inquiry.js';

// The strip above every portal page: which supplier this is, and the EN / 中文 switch.
export function PortalBar({ supplier }) {
  const { t } = useLang();
  return (
    <div className="portal-bar">
      <span className="portal-badge">{t('Supplier Portal')} · {supplier}</span>
      <LangToggle />
    </div>
  );
}

// The two inner tabs every portal page has: the list, and the same lines grouped.
export function ViewTabs({ views, view, setView }) {
  return (
    <div className="tabs view-tabs" role="tablist" aria-label="View">
      {views.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={view === key} className={`tab ${view === key ? 'on' : ''}`} onClick={() => setView(key)}>{label}</button>
      ))}
    </div>
  );
}

// Lines grouped under a heading (quote group, Sales Order...), each with the columns the list has and an optional action.
export function GroupCards({ title, subtitle, groups, columns, action, empty }) {
  const { t } = useLang();
  const { act } = useStore();
  const [form, setForm] = useState(null);
  return (
    <section className="screen">
      <header className="screen-head"><div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div></header>
      {groups.length === 0 && <div className="card pad empty">{empty || t('Nothing here yet.')}</div>}
      {groups.map((g) => (
        <div key={g.key} className="card group-card">
          <div className="group-head"><b>{g.title}</b><span className="muted">{g.rows.length}</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}{action && <th className="col-actions">{t('Actions')}</th>}</tr></thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id}>
                    {columns.map((c) => <td key={c.label} data-label={c.label}>{c.render ? c.render(r) : r[c.key] === '' || r[c.key] == null ? <span className="muted">—</span> : String(r[c.key])}</td>)}
                    {action && (
                      <td className="col-actions" data-label={t('Actions')}>
                        {(!action.when || action.when(r)) && <button className="btn btn-sm" onClick={() => setForm({ row: r })}>{action.label}</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {form && action && (
        <ActionModal spec={action} row={form.row} onClose={() => setForm(null)} onSubmit={(values) => act(action.name, action.payload(form.row, values))} />
      )}
    </section>
  );
}

export const groupBy = (rows, keyOf, titleOf = (k) => k) => {
  const by = new Map();
  rows.forEach((r) => { const k = keyOf(r); if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
  return [...by.entries()]
    .sort(([a], [b]) => (a.startsWith('—') ? 1 : b.startsWith('—') ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([k, list]) => ({ key: k, title: titleOf(k, list), rows: list }));
};

// The conversation with the buyer on an inquiry, from the supplier's side.
export function SupplierChat({ inq, supplier }) {
  const { db, act } = useStore();
  const { t } = useLang();
  const [text, setText] = useState('');
  const key = chatKey(supplier);
  const msgs = db.messages.filter((m) => m.inqNo === inq.no && m.supplier === key);
  const send = () => { if (act('chatSend', { id: inq.id, supplier, role: 'Supplier', message: text })) setText(''); };
  return (
    <div className="supplier-chat">
      <h4>{t('Conversation')}</h4>
      <div className="chat-msgs" role="log" aria-live="polite">
        {msgs.length === 0 && <div className="empty small">{t('No messages yet — start the conversation.')}</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.role === 'Supplier' ? 'mine' : 'theirs'}`}>
            <div className="chat-meta">{m.role === 'Buyer' ? t('Buyer') : m.sender}</div>{m.message}<div className="chat-time">{fmtDateTime(m.at)}</div>
          </div>
        ))}
      </div>
      <textarea rows={2} value={text} placeholder={t('Message the buyer...')} aria-label={t('Message the buyer...')} onChange={(e) => setText(e.target.value)} />
      <div className="chat-foot"><button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={send}>{t('Send')}</button></div>
    </div>
  );
}

// Shared by Inquiries and PR: the Respond form. Declining (Unavailable or Cannot Produce) asks first.
export function respondSpec({ supplier, name, t, withNegotiated, label }) {
  const AV = ['Confirmed', 'Pending', 'Unavailable', 'Cannot Produce'];
  const lines = (row) => (row ? row.sQuote : null);
  return {
    name, label: t(label || 'Respond'), title: t('Your Response'), submit: t('Submit Response'), yesLabel: t('Yes'), cancelLabel: t('Cancel'),
    intro: t('Fields marked * are required before you can submit.'),
    fields: [
      { key: 'availability', label: t('Availability'), type: 'select', options: AV.map((v) => ({ value: v, label: v })), required: true, default: (r) => (lines(r) && lines(r).availability !== 'Pending' ? lines(r).availability : '') },
      { key: 'leadTime', label: t('Lead Time (days)'), default: (r) => (lines(r) ? lines(r).leadTime : '') },
      { key: 'initial', label: t('Initial Price'), type: 'number', default: (r) => (lines(r) && lines(r).initial ? lines(r).initial : '') },
      ...(withNegotiated ? [{ key: 'negotiated', label: t('Negotiated Price'), type: 'number', default: (r) => (lines(r) && lines(r).negotiated ? lines(r).negotiated : '') }] : []),
    ],
    confirmIf: (v) => (v.availability === 'Unavailable' || v.availability === 'Cannot Produce'
      ? t('Mark this item as "{avail}"?\n\nThe buyer will see this response, and it will be removed from your active queue.').replace('{avail}', v.availability) : ''),
    payload: (row, v) => ({ id: row.id, supplier, ...v }),
  };
}

export const StatusPill = ({ status, t }) => <Pill>{t(status)}</Pill>;
