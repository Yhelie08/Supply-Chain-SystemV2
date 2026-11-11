import { useState } from 'react';
import { useStore } from '../../store.jsx';
import { ActionModal } from '../../ui/components.jsx';
import { COLLATERAL_FIELDS, chatKey, nextStep, quoteFinal, readiness, selectedQuote, signalNext } from '../../domain/inquiry.js';
import { fmtCNY, fmtDateTime, fmtPHP } from '../../domain/util.js';
import { ConfirmModal, NextStepBanner, PricingCard, ReadinessCard, goTo } from './parts.jsx';

const dash = (v) => (v === '' || v == null ? '—' : String(v));
const yes = (v) => <span className={v ? 'pv-green' : 'pv-red'} aria-label={v ? 'Yes' : 'No'}>{v ? '✓' : '✗'}</span>;

function KV({ label, children, wide }) {
  return (
    <div className={`kv-cell ${wide ? 'wide' : ''}`}>
      <div className="kv-label">{label}</div>
      <div className="kv-value">{children}</div>
    </div>
  );
}

const availTone = { Confirmed: 'ok', Pending: 'warn', Unavailable: 'bad', 'Cannot Produce': 'bad' };
const stageTone = { Final: 'ok', Negotiating: 'warn', Declined: 'bad', 'Not Selected': 'neutral' };
const collTone = { Completed: 'ok', 'N/A': 'neutral', Required: 'warn', HideToSupplier: 'info', Pending: 'bad' };

export default function InquiryDetail({ inquiry: q }) {
  const { db, act, notify } = useStore();
  const [confirm, setConfirm] = useState(null);
  const [convert, setConvert] = useState(false);
  const [chat, setChat] = useState(null); // supplier key being discussed
  const [srp, setSrp] = useState('');
  const r = readiness(q);
  const ns = nextStep(q);
  const sel = selectedQuote(q);
  const locked = q.status === 'Sales Order';
  const specs = [['Dimension', q.dimension], ['Color Body', q.colorBody], ['Color Temperature', q.colorTemperature], ['Type of Bulb', q.bulbType], ['Voltage', q.voltage], ['Lumens', q.lumens]];
  const hasSpecs = specs.some(([, v]) => v);
  const approved = Number(q.srp) > 0;

  const ask = (message, yesLabel, run) => setConfirm({ message, yes: yesLabel, run });
  const askEstimate = () => {
    const upd = q.status === 'Estimate Created';
    ask(`${upd ? 'Update' : 'Create'} the estimate for ${q.no}?`, upd ? 'Update estimate' : 'Create estimate', () => act('inquiryEstimate', { id: q.id }));
  };
  const askSrp = () => {
    const amount = parseFloat(srp) || 0;
    if (amount <= 0) { notify('refuse', 'Enter a valid SRP amount first.'); return; }
    ask(`Approve SRP amount of ${fmtPHP(amount)} for ${q.no}?`, 'Approve SRP', () => act('inquiryApproveSrp', { id: q.id, amount }));
  };
  const askDelete = () => ask(`Delete ${q.no}? This cannot be undone.`, 'Delete', () => { if (act('inquiryDelete', { id: q.id })) goTo(''); });

  const timeline = db.timeline.filter((t) => t.inqNo === q.no).slice().reverse();
  const stockOrLocal = sel && db.suppliers.find((s) => s.name === sel.supplier && (s.stock || s.local));

  return (
    <section className="screen inquiry-detail">
      <header className="screen-head">
        <div className="head-left">
          <button className="btn" onClick={() => goTo('')}>← INQ List</button>
          <div className="title-row"><h1>Inquiry Detail</h1><span className="inq-badge">{q.no}</span></div>
        </div>
        <div className="head-actions">
          {locked ? (
            <span className="pill pill-ok">Locked · {q.soNo}</span>
          ) : (
            <>
              {r.passed === 5 && (
                <button className={`btn ${q.status === 'Estimate Created' ? 'btn-primary' : 'btn-green'}`} onClick={askEstimate}>{q.status === 'Estimate Created' ? 'Update Estimate' : 'Create Estimate'}</button>
              )}
              {q.status === 'Estimate Created' && <button className="btn btn-green" onClick={() => setConvert(true)}>Convert to Sales Order</button>}
              <button className="btn" onClick={() => goTo(`${q.id}/edit`)}>Edit</button>
              <button className="btn btn-danger-ghost" onClick={askDelete}>Delete</button>
            </>
          )}
        </div>
      </header>

      <NextStepBanner ns={ns} />

      <div className="detail-layout">
        <div className="detail-main">
          <div className="card form-card">
            <div className="card-head">Product Info</div>
            <div className="card-body">
              <div className="product-box">
                <div className="product-thumb" aria-hidden="true">{(q.item || '?').slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="product-name">{q.item}</div>
                  <div className="mono muted">{dash(q.sku)}</div>
                  <div className={q.description ? '' : 'muted italic'}>{q.description || 'No description'}</div>
                </div>
              </div>
              <div className="kv-grid">
                <KV label="Quantity">{q.qty} {q.unit}</KV>
                <KV label="Target Date">{dash(q.targetDate)}</KV>
                <KV label="Open to Similar Design">{yes(q.openToSimilar)}</KV>
                <KV label="Order Type">{dash(q.orderType)}</KV>
              </div>
              {hasSpecs && (
                <>
                  <div className="field-section">Specifications</div>
                  <div className="kv-grid">{specs.map(([l, v]) => <KV key={l} label={l}>{dash(v)}</KV>)}</div>
                </>
              )}
              {q.additionalDescription && <><div className="field-section">Additional Details</div><p>{q.additionalDescription}</p></>}
              {(q.attachments.length > 0 || q.similarPhotos.length > 0) && (
                <>
                  <div className="field-section">Files</div>
                  <div className="chips">
                    {q.attachments.map((a, i) => <span key={`a${i}`} className="chip">📎 {a.name}</span>)}
                    {q.similarPhotos.map((a, i) => <span key={`s${i}`} className="chip">📷 {a.name}</span>)}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card form-card">
            <div className="card-head">Customer, Project &amp; Sales</div>
            <div className="card-body">
              <div className="kv-grid">
                <KV label="Customer">{q.customer}</KV><KV label="Customer Type">{dash(q.customerType)}</KV>
                <KV label="Design Company">{dash(q.designCompany)}</KV><KV label="Design Partner">{dash(q.designPartner)}</KV>
                <KV label="Designer/Architect">{dash(q.designerArchitect)}</KV><KV label="Project">{dash(q.projectName)}</KV>
                <KV label="Project Type">{dash(q.projectType)}</KV><KV label="Quote Group">{dash(q.quoteGroup)}</KV>
                <KV label="Group Discount">{q.groupDiscountPct !== '' ? `${q.groupDiscountPct}%` : '—'}</KV><KV label="Additional Discount Needed">{dash(q.addtlDiscNeeded)}</KV>
                <KV label="Sales Owner">{dash(q.salesOwner)}</KV><KV label="Commission">{dash(q.commission)}</KV>
                <KV label="For Bidding">{yes(q.forBidding)}</KV><KV label="Created">{(q.createdAt || '').slice(0, 10)}</KV>
                <KV label="Suppliers" wide>{q.suppliers.join(', ')}</KV>
              </div>
            </div>
          </div>

          <div className="card form-card">
            <div className="card-head">Supplier Quotes <small className="muted">Click Fenteng or Tony to open the conversation</small></div>
            {q.quotes.length === 0 ? (
              <div className="empty small">No supplier quotes yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Supplier</th><th>Availability</th><th>Initial</th><th>Negotiated</th><th>Final</th><th>Lead time</th><th>Stage</th><th>Selected</th></tr></thead>
                  <tbody>
                    {q.quotes.map((x) => {
                      const key = chatKey(x.supplier);
                      return (
                        <tr key={x.supplier} className={`${x.selected ? 'row-selected' : ''} ${key ? 'qr-clickable' : ''}`}
                          onClick={key ? () => setChat(key) : undefined} title={key ? `Open conversation with ${key}` : undefined}>
                          <td data-label="Supplier"><b>{x.supplier}</b></td>
                          <td data-label="Availability"><span className={`pill pill-${availTone[x.availability] || 'neutral'}`}>{x.availability}</span></td>
                          <td data-label="Initial">{fmtCNY(x.initial)}</td>
                          <td data-label="Negotiated" className="pv-amber">{fmtCNY(x.negotiated)}</td>
                          <td data-label="Final"><b>{fmtCNY(quoteFinal(x))}</b></td>
                          <td data-label="Lead time">{dash(x.leadTime)}</td>
                          <td data-label="Stage"><span className={`pill pill-${stageTone[x.stage] || 'neutral'}`}>{x.stage}</span></td>
                          <td data-label="Selected">{x.selected ? <span className="pv-green">✓ Selected</span> : <span className="muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card form-card">
            <div className="card-head">Product Collateral</div>
            <div className="card-body">
              <div className="collateral-grid">
                {COLLATERAL_FIELDS.map(([k, label]) => (
                  <div key={k} className="collateral-item"><div className="kv-label">{label}</div><span className={`pill pill-${collTone[q.collateral[k]] || 'neutral'}`}>{q.collateral[k]}</span></div>
                ))}
              </div>
              {q.specDetails && <p><span className="kv-label">Specification Details</span><br />{q.specDetails}</p>}
            </div>
          </div>

          <div className="card form-card">
            <div className="card-head">Timeline History</div>
            <TimelineList entries={timeline} />
          </div>
        </div>

        <aside className="detail-side">
          <ReadinessCard inq={q} />
          <PricingCard inq={q}>
            {!locked && !approved && (
              <div className="srp-row">
                <label htmlFor="dSrp">Approve SRP</label>
                <div className="srp-input-wrap"><span>₱</span><input id="dSrp" type="number" min="0" step="0.01" placeholder="0.00" value={srp} onChange={(e) => setSrp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askSrp()} /></div>
                <button className="btn btn-green btn-sm" onClick={askSrp}>Approve SRP</button>
              </div>
            )}
            {approved && <div className="srp-done">✓ SRP Approved</div>}
          </PricingCard>
          <div className="card side-card">
            <div className="side-head">Signals</div>
            <div className="side-body">
              <div className="pricing-row"><span>Estimate Created</span><b>{q.status === 'Open' ? 'No' : 'Yes'}</b></div>
              <div className="pricing-row"><span>Estimate No</span><b>{dash(q.estimateNo)}</b></div>
              <div className="pricing-row"><span>Sales Order</span><b>{dash(q.soNo)}</b></div>
              <div className="pricing-row"><span>Waiting On</span><b>{q.waitingOn === 'None' ? '— Nothing' : q.waitingOn}</b></div>
              <div className="pricing-row"><span>Next</span><b className={r.passed === 5 ? 'pv-green' : 'pv-blue'}>{signalNext(q)}</b></div>
            </div>
          </div>
          {chat && <ConversationPanel inq={q} supplier={chat} onClose={() => setChat(null)} />}
          <InternalNotes inq={q} />
        </aside>
      </div>

      {confirm && <ConfirmModal message={confirm.message} yes={confirm.yes} onNo={() => setConfirm(null)} onYes={() => { confirm.run(); setConfirm(null); }} />}
      {convert && (
        <ActionModal
          row={q}
          spec={{
            title: `Convert ${q.no} to a Sales Order`, submit: 'Create Sales Order',
            intro: stockOrLocal
              ? `${sel.supplier} is ${stockOrLocal.stock ? 'warehouse stock, so no Purchase Request is needed' : 'local sourcing, so no freight is needed'}.`
              : `A Purchase Request will be raised for ${sel.supplier}. Choose the shipping mode now, or set it later on the PR.`,
            fields: [
              ...(stockOrLocal ? [] : [{ key: 'mode', label: 'Shipping mode', type: 'select', options: ['Airfreight', 'LCL', 'FCL'] }]),
              { key: 'payment', label: 'Payment', type: 'select', options: ['Unpaid', 'Paid', 'Credit'], default: 'Unpaid' },
              { key: 'forCrate', label: 'Needs wooden crating', type: 'checkbox' },
            ],
          }}
          onClose={() => setConvert(false)}
          onSubmit={(v) => act('inquiryApprove', { id: q.id, ...v })}
        />
      )}
    </section>
  );
}

const TL_TONE = { Created: 'ok', Updated: 'info', Approval: 'ok', Estimate: 'info', Message: 'neutral', Deleted: 'bad' };

function TimelineList({ entries }) {
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, 5);
  if (!entries.length) return <div className="empty small">No activity yet.</div>;
  return (
    <div className="card-body">
      <ul className="timeline tl-list">
        {shown.map((t) => (
          <li key={t.id}>
            <div className="tl-head"><b>{t.title}</b><span className={`pill pill-${TL_TONE[t.type] || 'neutral'}`}>{t.type}</span></div>
            <div className="muted">{t.actor} · {fmtDateTime(t.at)}</div>
            {t.changes.length > 0 && (
              <ul className="tl-changes">
                {t.changes.map((c, i) => <li key={i}><span className="muted">{c.label}:</span> {c.from ? <><s>{c.from}</s> → </> : null}<b>{c.to}</b></li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {entries.length > 5 && <button className="btn btn-sm" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${entries.length}`}</button>}
    </div>
  );
}

function ConversationPanel({ inq, supplier, onClose }) {
  const { db, act } = useStore();
  const [text, setText] = useState('');
  const [as, setAs] = useState('Buyer');
  const [min, setMin] = useState(false);
  const full = inq.quotes.find((x) => chatKey(x.supplier) === supplier);
  const msgs = db.messages.filter((m) => m.inqNo === inq.no && m.supplier === supplier);
  const send = () => { if (act('chatSend', { id: inq.id, supplier: full ? full.supplier : supplier, role: as, message: text })) setText(''); };
  return (
    <div className="card side-card chat-panel">
      <div className="side-head chat-head" onClick={() => setMin(!min)}>
        <span>Conversation — {supplier}</span>
        <span onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" aria-label={min ? 'Expand' : 'Minimize'} onClick={() => setMin(!min)}>{min ? '+' : '−'}</button>
          <button className="icon-btn" aria-label="Close conversation" onClick={onClose}>×</button>
        </span>
      </div>
      {!min && (
        <div className="side-body">
          <div className="chat-msgs" role="log" aria-live="polite">
            {msgs.length === 0 && <div className="empty small">No messages yet. Start the conversation.</div>}
            {msgs.map((m) => (
              <div key={m.id} className={`chat-bubble ${m.role === 'Buyer' ? 'mine' : 'theirs'}`}>
                <div className="chat-meta">{m.sender}</div>{m.message}<div className="chat-time">{fmtDateTime(m.at)}</div>
              </div>
            ))}
          </div>
          <textarea rows={2} value={text} placeholder="Type a message…" aria-label="Message" onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <div className="chat-foot">
            <label className="hint">Send as
              <select value={as} onChange={(e) => setAs(e.target.value)} aria-label="Send as">
                <option value="Buyer">Buyer</option><option value="Supplier">{supplier} (demo reply)</option>
              </select>
            </label>
            <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={send}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InternalNotes({ inq }) {
  const { db, act } = useStore();
  const [text, setText] = useState('');
  const [role, setRole] = useState('HC Sales');
  const notes = db.notes.filter((n) => n.inqNo === inq.no);
  const send = () => { if (act('noteSend', { id: inq.id, role, message: text })) setText(''); };
  return (
    <div className="card side-card">
      <div className="side-head">Internal Conversation <small className="muted">Sales ↔ Purchasing</small></div>
      <div className="side-body">
        <div className="chat-msgs" role="log">
          {notes.length === 0 && <div className="empty small">No internal notes yet.</div>}
          {notes.map((n) => (
            <div key={n.id} className={`chat-bubble ${n.role === 'HC Sales' ? 'mine' : 'theirs'}`}>
              <div className="chat-meta">{n.role}</div>{n.message}<div className="chat-time">{fmtDateTime(n.at)}</div>
            </div>
          ))}
        </div>
        <textarea rows={2} value={text} placeholder="Write a note for your team…" aria-label="Internal note" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="chat-foot">
          <label className="hint">Posting as
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Posting as"><option>HC Sales</option><option>HC Purchasing</option></select>
          </label>
          <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}
