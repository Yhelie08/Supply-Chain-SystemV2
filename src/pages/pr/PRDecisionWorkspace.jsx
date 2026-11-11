import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import {
  HOLD_REASONS, PRIORITIES, SHIP_MODES, holdDays, holdState, isInactive,
  loadBalancing, nextStep, priceInfo, readiness, recommendedSupplier,
} from '../../domain/pr.js';
import { fmtDate, fmtMoneyIn, fmtPHP } from '../../domain/util.js';
import { forecastRows, resolveSettings } from '../../domain/forecast.js';
import { ConfirmModal } from '../inquiry/parts.jsx';
import './decision-workspace.css';

export default function PRDecisionWorkspace({ prId, onBack }) {
  const { db, act, today, notify } = useStore();
  const pr = db.prs.find((p) => p.id === prId);

  const [activeTab, setActiveTab] = useState('Fenteng');
  const [messages, setMessages] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [showTimeline, setShowTimeline] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [holdModal, setHoldModal] = useState(null); // 'hold' | 'cancel'

  // Draft state for edit mode
  const [draft, setDraft] = useState({
    supplier: '',
    mode: '',
    priority: '',
    price: '',
    targetDate: '',
    overrideReason: '',
  });

  const product = useMemo(() => db.products.find((p) => p.sku === pr?.sku), [db.products, pr]);
  const forecast = useMemo(() => forecastRows(db, resolveSettings(db.settings && db.settings.forecast), today), [db, today]);
  const isAtRisk = useMemo(() => {
    if (!pr) return false;
    return forecast.some((f) => f.o.prNo === pr.no && (f.sev.code === 'atrisk' || f.sev.code === 'miss'));
  }, [forecast, pr]);

  if (!pr) {
    return (
      <div className="pr-decision-workspace" style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Purchase Request not found</h2>
        <button className="btn" onClick={onBack} style={{ marginTop: '16px' }}>← Back to Queue</button>
      </div>
    );
  }

  const r = readiness(pr, product);
  const step = nextStep(pr, product);
  const info = priceInfo(pr, product);
  const lbRows = loadBalancing(db.suppliers, db.pos, pr.category, pr.quotes || []);
  const rec = recommendedSupplier(db.suppliers, db.pos, pr.category, pr.quotes || []);
  const isConverted = pr.status === 'Converted to PO';
  const isHeld = pr.hold === 'On Hold';
  const isCancelled = pr.hold === 'Cancelled';
  const delayStatus = isAtRisk ? 'At Risk' : pr.delayStatus || 'On Track';

  // Priority Score computation (matching live widget: 80 High, 55 Med, 30 Low)
  const priorityScore = pr.priority === 'HIGH' ? 80 : pr.priority === 'MEDIUM' ? 55 : 30;
  const scoreColor = priorityScore >= 80 ? 'var(--red)' : priorityScore >= 50 ? 'var(--green)' : 'var(--amber)';

  const priorityBreakdown = [
    { label: 'Delivery Urgency', score: pr.priority === 'HIGH' ? 30 : 18, max: 30, color: pr.priority === 'HIGH' ? 'red' : 'amber', note: '' },
    { label: 'Blocking / Issues', score: delayStatus === 'Delayed' ? 25 : delayStatus === 'At Risk' ? 10 : 5, max: 25, color: delayStatus === 'On Track' ? 'green' : 'red', note: delayStatus },
    { label: 'Deal Value', score: (info.final || 0) > 10000 ? 18 : (info.final || 0) > 1000 ? 12 : 6, max: 20, color: 'green', note: `₱${(pr.srpApproved || info.final || 2986).toLocaleString()}` },
    { label: 'Aging', score: 10, max: 15, color: 'amber', note: '' },
    { label: 'Client Type', score: 4, max: 10, color: 'gray', note: pr.customerType || 'End User' },
  ];

  const handleStartEdit = () => {
    setDraft({
      supplier: pr.supplier || '',
      mode: pr.mode || '',
      priority: pr.priority || 'MEDIUM',
      price: pr.price || '',
      targetDate: pr.targetDate || '',
      overrideReason: pr.overrideReason || '',
    });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    act('prEdit', {
      id: pr.id,
      data: {
        ...draft,
        price: draft.price ? Number(draft.price) : pr.price,
      },
    });
    setIsEditing(false);
  };

  const handleCreatePO = () => {
    setConfirm({
      message: `Approve active PRs for ${pr.soNo || 'this order'} · ${pr.customer} and convert to Purchase Order?`,
      yes: 'Create PO →',
      run: () => act('prGroupCreatePO', { soNo: pr.soNo, customer: pr.customer }),
    });
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const thread = activeTab;
    const newMsg = {
      sender: 'HC Purchasing',
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => ({
      ...prev,
      [thread]: [...(prev[thread] || []), newMsg],
    }));
    setChatInput('');
  };

  return (
    <div className="pr-decision-workspace">
      {/* Topbar */}
      <div className="detail-topbar">
        <span className="detail-topbar-title">{pr.no} — Decision Workspace</span>
        <button className="btn btn-sm btn-ghost" onClick={onBack}>← Back to Queue</button>
      </div>

      {/* Next Step Banner */}
      <div className="ns-banner">
        <span>
          <span className="ns-lbl">YOU ARE HERE</span>
          <b>{step.here}</b>
        </span>
        <span className="ns-arrow">→</span>
        <span>
          <span className="ns-lbl">NEXT STEP</span>
          <b>{step.action}</b> {step.who && <span className="ns-who">({step.who})</span>}
        </span>
      </div>

      {/* Subheader */}
      <div className="detail-subheader">
        <div className="detail-subheader-left">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back to Queue</button>
          <span className="detail-pr-no">{pr.no}</span>
          <span className="detail-so">{pr.soNo || '— No SO —'}</span>
          <span className="detail-customer">{pr.customer}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span className="badge-pill status-readypo">● {pr.status}</span>
            <span className="badge-pill" style={{ background: pr.priority === 'HIGH' ? 'var(--red-light)' : 'var(--amber-light)', color: pr.priority === 'HIGH' ? 'var(--red)' : 'var(--amber)', borderColor: pr.priority === 'HIGH' ? 'var(--red-mid)' : 'var(--amber-mid)' }}>
              ● {pr.priority}
            </span>
            <span className={`badge-pill ${delayStatus === 'At Risk' ? 'delay-atrisk' : 'delay-ontrack'}`}>
              ● {delayStatus}
            </span>
            <span className={`badge-pill ${r.ready ? 'rec-yes' : 'status-pending'}`}>
              Ready for PO: {r.ready ? 'YES' : 'NO'}
            </span>
            <span className="badge-pill status-pending">
              Converted: {isConverted ? 'YES' : 'NO'}
            </span>
            {pr.hold && (
              <span className={`badge-pill ${pr.hold === 'Cancelled' ? 'delay-atrisk' : 'status-readypo'}`}>
                ● {pr.hold.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="detail-subheader-right">
          {!isHeld && !isCancelled && !isConverted && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setHoldModal('hold')}>Put On Hold</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setHoldModal('cancel')} style={{ color: 'var(--red)' }}>Cancel PR</button>
            </>
          )}
          {(isHeld || isCancelled) && (
            <button className="btn btn-ghost btn-sm" onClick={() => act('prResume', { id: pr.id })}>
              {isHeld ? 'Resume' : 'Restore'}
            </button>
          )}

          {!isConverted && (
            isEditing ? (
              <>
                <button className="btn btn-sm btn-ghost" onClick={() => setIsEditing(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSaveEdit}>Save</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={handleStartEdit}>Edit</button>
            )
          )}

          <button className="btn btn-ghost btn-sm" onClick={() => notify(isConverted ? 'ok' : 'neutral', isConverted ? `PO: ${pr.poNo || 'Linked'}` : 'No PO created yet')}>
            View PO
          </button>

          {!isConverted && (
            <button
              className="btn-create-po"
              disabled={!r.ready || isHeld || isCancelled}
              onClick={handleCreatePO}
              title={!r.ready ? 'All 4 conditions must pass to convert to PO' : 'Convert group to PO'}
            >
              Create PO →
            </button>
          )}
        </div>
      </div>

      {/* Meta Line */}
      <div className="detail-meta">
        Locked: <strong>{isConverted ? 'Yes' : 'No'}</strong>
        <span className="detail-meta-sep">·</span>
        Created: <strong>{fmtDate(pr.createdAt || today)}</strong>
        <span className="detail-meta-sep">·</span>
        Last updated: <strong>{fmtDate(today)}</strong>
      </div>

      {/* Body Grid */}
      <div className="detail-body">
        {/* Main Column */}
        <div className="dMain">
          {/* 1. Product Info */}
          <div className="sec-card">
            <div className="sec-header">
              <span className="sec-title">Product Info</span>
            </div>
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: 'var(--radius)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 800, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                  {pr.item ? pr.item.slice(0, 2).toUpperCase() : 'PR'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '4px' }}>Item Photo / Name</div>
                  <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--gray-800)' }}>{pr.item}</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-400)', fontFamily: 'monospace', marginTop: '3px' }}>{pr.sku}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--gray-600)', lineHeight: 1.4, marginTop: '6px' }}>
                    {pr.description || pr.no}
                  </div>
                </div>
              </div>
            </div>

            <div className="detail-info-grid">
              <div className="detail-field">
                <div className="detail-label-sm">Quantity</div>
                <div className="detail-val">{pr.qty} {pr.unit || 'pcs'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-label-sm">Supplier Target Date</div>
                <div className="detail-val">{fmtDate(pr.targetDate)}</div>
              </div>
              <div className="detail-field">
                <div className="detail-label-sm">INQ Reference</div>
                <div className="detail-val blue">{pr.inqNo || <span className="muted">— None</span>}</div>
              </div>
              <div className="detail-field">
                <div className="detail-label-sm">Customer</div>
                <div className="detail-val">{pr.customer}</div>
              </div>
              <div className="detail-field">
                <div className="detail-label-sm">Customer Type</div>
                <div className="detail-val">{pr.customerType || 'End User'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-label-sm">Sales Owner</div>
                <div className="detail-val">{pr.salesOwner || 'HC Sales Coordinator'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-label-sm">PR Date</div>
                <div className="detail-val">{fmtDate(pr.createdAt || today)}</div>
              </div>
              <div className="detail-field">
                <div className="detail-label-sm">Category</div>
                <div className="detail-val"><span className="badge-pill cat-badge">{pr.category || 'Outdoor Light'}</span></div>
              </div>
              <div className="detail-field">
                <div className="detail-label-sm">Delay Status</div>
                <div className="detail-val"><span className={`badge-pill ${delayStatus === 'At Risk' ? 'delay-atrisk' : 'delay-ontrack'}`}>● {delayStatus}</span></div>
              </div>
              <div className="detail-field span-2">
                <div className="detail-label-sm">Similar Item</div>
                <div className="detail-val">{pr.similarItem ? <span style={{ color: 'var(--blue)', fontWeight: 600 }}>✓ Open to similar design</span> : <span className="muted">Not flagged</span>}</div>
              </div>
              <div className="detail-field span-4">
                <div className="detail-label-sm">Attachments</div>
                <div style={{ marginTop: '4px', color: 'var(--gray-400)', fontSize: '13px', fontStyle: 'italic' }}>No attachments</div>
              </div>
            </div>
          </div>

          {/* 2. Supplier Recommendation — Load Balancing */}
          <div className="sec-card">
            <div className="sec-header">
              <span className="sec-title">Supplier Recommendation — Load Balancing</span>
              <span className="sec-hint">System decides · Human supervises</span>
            </div>
            <div className="sec-body" style={{ padding: '0' }}>
              <div className="table-wrap">
                <table className="rec-table">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Step 1 — Category</th>
                      <th>Active POs</th>
                      <th>Load Bar</th>
                      <th>Step 2 — Status</th>
                      <th>Step 3 — Eligible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lbRows.map((s) => {
                      const isMatch = s.category === 'Match';
                      const pct = Math.min(100, s.percent || 0);
                      const barClass = pct >= 90 ? 'red' : pct >= 75 ? 'amber' : 'green';
                      return (
                        <tr key={s.name}>
                          <td>
                            <div className="rec-sname">{s.name}</div>
                            <div className="rec-scat">{isMatch ? 'Match' : 'Not Match'}</div>
                          </td>
                          <td className={isMatch ? 'rec-match-y' : 'rec-match-n'}>
                            {isMatch ? '✓ Match' : '✗ No match'}
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--gray-800)' }}>
                            {s.activePOs}
                          </td>
                          <td>
                            <div className="rec-load-row">
                              <div className="rec-lb-bg">
                                <div className={`rec-lb ${barClass}`} style={{ width: `${pct}%`, display: 'block' }} />
                              </div>
                              <span className={`rec-lpct ${barClass}`}>{pct}%</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge-pill ${s.loadStatus === 'Overloaded' ? 'rec-status-over' : s.loadStatus === 'Near Capacity' ? 'rec-status-nearcap' : 'rec-status-normal'}`}>
                              ● {s.loadStatus}
                            </span>
                          </td>
                          <td>
                            {s.eligible === 'Recommended' ? (
                              <span className="rec-el-rec">● Recommended</span>
                            ) : s.eligible === 'Removed' ? (
                              <span className="rec-el-removed">✕ Removed — Step 1</span>
                            ) : s.eligible === 'Awaiting Quote' ? (
                              <span className="rec-el-avail" style={{ opacity: 0.8 }}>Awaiting Quote</span>
                            ) : (
                              <span className="rec-el-avail">Available</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 3. Supplier Selection */}
          <div className="sec-card">
            <div className="sec-header">
              <span className="sec-title">Supplier Selection</span>
            </div>
            <div className="sec-body">
              <div className="fg fg-3">
                <div>
                  <div className="fi-lbl">Selected Supplier</div>
                  <div className="fi-val" style={{ color: 'var(--blue)', fontSize: '15px' }}>
                    {isEditing ? (
                      <select
                        className="select"
                        value={draft.supplier}
                        onChange={(e) => setDraft({ ...draft, supplier: e.target.value })}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--gray-300)' }}
                      >
                        <option value="">-- Select Supplier --</option>
                        {db.suppliers.map((s) => (
                          <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      pr.supplier || '—'
                    )}
                  </div>
                </div>
                <div>
                  <div className="fi-lbl">Followed Recommendation</div>
                  <div className="fi-val">
                    {pr.supplier ? (pr.supplier === rec ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Yes</span> : <span style={{ color: 'var(--amber)', fontWeight: 700 }}>No (Override)</span>) : <span className="muted">—</span>}
                  </div>
                </div>
                <div>
                  <div className="fi-lbl">Priority</div>
                  <div className="fi-val">
                    {isEditing ? (
                      <select
                        className="select"
                        value={draft.priority}
                        onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--gray-300)' }}
                      >
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span className="pri-med"><span className="priority-dot" />{pr.priority}</span>
                    )}
                  </div>
                </div>
                {pr.overrideReason && (
                  <div style={{ gridColumn: 'span 3' }}>
                    <div className="fi-lbl">Override Reason</div>
                    <div className="fi-val" style={{ fontWeight: 400, fontSize: '13.5px', color: 'var(--gray-700)' }}>
                      {pr.overrideReason}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Pricing & Approval */}
          <div className="sec-card">
            <div className="sec-header">
              <span className="sec-title">Pricing &amp; Approval</span>
            </div>
            <div className="sec-body">
              <div className="fg fg-4">
                <div>
                  <div className="fi-lbl">Final Price ({info.source})</div>
                  <div className="fi-val price">
                    {info.final > 0 ? fmtMoneyIn(info.final, info.currency) : '—'}
                  </div>
                </div>
                <div>
                  <div className="fi-lbl">Price Status</div>
                  <div className="fi-val">
                    {info.approved ? <span className="badge-pill rec-yes">Approved</span> : <span className="badge-pill status-readypo">Pending Quote</span>}
                  </div>
                </div>
                <div>
                  <div className="fi-lbl">Supplier Confirmed</div>
                  <div className="fi-val">
                    {pr.supplier ? <span className="badge-pill rec-yes">✓ Yes</span> : <span className="badge-pill status-pending">Pending</span>}
                  </div>
                </div>
                <div>
                  <div className="fi-lbl">INQ Negotiated Ref.</div>
                  <div className="fi-val" style={{ color: 'var(--gray-600)' }}>
                    {pr.inqNo ? fmtPHP(info.final) : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Shipment & Timeline */}
          <div className="sec-card">
            <div className="sec-header">
              <span className="sec-title">Shipment &amp; Timeline</span>
            </div>
            <div className="sec-body">
              <div className="fg fg-5">
                <div>
                  <div className="fi-lbl">Shipping Mode</div>
                  <div className="fi-val">
                    {isEditing ? (
                      <select
                        className="select"
                        value={draft.mode}
                        onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--gray-300)' }}
                      >
                        <option value="">-- Mode --</option>
                        {SHIP_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <span className="badge-pill ship-badge">● {pr.mode || 'Airfreight'}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="fi-lbl">Target Delivery</div>
                  <div className="fi-val">{fmtDate(pr.targetDate)}</div>
                </div>
                <div>
                  <div className="fi-lbl">Remaining Days</div>
                  <div className="fi-val" style={{ color: delayStatus === 'At Risk' ? 'var(--red)' : 'var(--green)' }}>
                    {delayStatus === 'At Risk' ? 'Overdue' : '15 days'}
                  </div>
                </div>
                <div>
                  <div className="fi-lbl">Required Days (lead)</div>
                  <div className="fi-val">14 days</div>
                </div>
                <div>
                  <div className="fi-lbl">Delay Status</div>
                  <div className="fi-val">
                    <span className={`badge-pill ${delayStatus === 'At Risk' ? 'delay-atrisk' : 'delay-ontrack'}`}>
                      ● {delayStatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="dSidebar">
          {/* Priority Score */}
          <div className="side-card">
            <div className="side-hdr">Priority Score</div>
            <div className="side-body">
              <div className="score-top">
                <span className="score-num" style={{ color: scoreColor }}>{priorityScore}</span>
                <span className="score-denom">/ 100</span>
              </div>
              <span className="pri-med"><span className="priority-dot" />{pr.priority}</span>
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--gray-100)', paddingTop: '10px' }}>
                {priorityBreakdown.map((pb) => (
                  <div key={pb.label} className="score-row">
                    <span className="score-lbl">{pb.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      <div className="score-bar-bg">
                        <div className={`score-bar ${pb.color}`} style={{ width: `${Math.round((pb.score / pb.max) * 100)}%`, display: 'block' }} />
                      </div>
                      <span className="score-pts">{pb.score}/{pb.max}</span>
                      {pb.note && <span className="score-note" title={pb.note}>{pb.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SRP & Pricing Summary */}
          <div className="side-card">
            <div className="side-hdr">SRP &amp; Pricing Summary</div>
            <div className="side-body">
              <div className="conv-row">
                <span className="conv-lbl">Selected Final Cost</span>
                <span className="conv-val muted">{info.final > 0 ? fmtMoneyIn(info.final, info.currency) : '—'}</span>
              </div>
              <div className="conv-row">
                <span className="conv-lbl">SRP (Approved)</span>
                <span className="conv-val" id="dvSrpApprovedPR">
                  {pr.srpApproved > 0 ? fmtPHP(pr.srpApproved) : `${fmtPHP(info.final || 2986)} (auto)`}
                </span>
              </div>
              <div className="conv-row">
                <span className="conv-lbl">Margin</span>
                <span className="conv-val" style={{ color: 'var(--gray-500)' }}>
                  {pr.srpApproved && info.final ? `${Math.round(((pr.srpApproved - info.final) / pr.srpApproved) * 100)}%` : '—'}
                </span>
              </div>
              <div className="conv-row">
                <span className="conv-lbl">SRP Status</span>
                <span className="conv-val" style={{ color: pr.srpApproved ? 'var(--green)' : 'var(--gray-400)' }}>
                  ● {pr.srpApproved ? 'Approved' : 'Pending Approval'}
                </span>
              </div>
            </div>
          </div>

          {/* PR Readiness Checklist */}
          <div className="side-card">
            <div className="side-hdr">PR Readiness Checklist</div>
            <div className="side-body">
              <div className="ri-row">
                <div className="ri-left">
                  <div className="ri-icon-ok">✓</div>
                  <span className="ri-lbl">Approved</span>
                </div>
                <span className="ri-detail">{pr.salesOwner || 'HC Sales Coordinator'}</span>
              </div>

              <div className="ri-row">
                <div className="ri-left">
                  <div className={pr.supplier ? 'ri-icon-ok' : 'ri-icon-fail'}>{pr.supplier ? '✓' : '✕'}</div>
                  <span className="ri-lbl">Supplier selected</span>
                </div>
                <span className="ri-detail">{pr.supplier || '—'}</span>
              </div>

              <div className="ri-row">
                <div className="ri-left">
                  <div className={info.approved ? 'ri-icon-ok' : 'ri-icon-fail'}>{info.approved ? '✓' : '✕'}</div>
                  <span className="ri-lbl">Final price confirmed</span>
                </div>
                <span className="ri-detail">{info.approved ? `${fmtMoneyIn(info.final, info.currency)} quote` : '—'}</span>
              </div>

              <div className="ri-row">
                <div className="ri-left">
                  <div className={pr.mode || pr.sourcingType === 'Local' ? 'ri-icon-ok' : 'ri-icon-fail'}>{pr.mode || pr.sourcingType === 'Local' ? '✓' : '✕'}</div>
                  <span className="ri-lbl">Shipping mode selected</span>
                </div>
                <span className="ri-detail">{pr.mode || 'Airfreight'}</span>
              </div>

              <div className="ri-row">
                <div className="ri-left">
                  <div className={pr.targetDate ? 'ri-icon-ok' : 'ri-icon-fail'}>{pr.targetDate ? '✓' : '✕'}</div>
                  <span className="ri-lbl">Target date exists</span>
                </div>
                <span className="ri-detail">{fmtDate(pr.targetDate)}</span>
              </div>

              {r.ready ? (
                <div className="ri-pass">
                  <div className="ri-pass-t">✓ Ready for PO — conditions satisfied</div>
                </div>
              ) : (
                <div className="ri-fail">
                  <div className="ri-fail-t">Not yet ready — conditions pending</div>
                </div>
              )}
            </div>
          </div>

          {/* Conversation */}
          <div className="side-card">
            <div className="side-hdr">Conversation</div>
            <div className="chat-panel">
              <div className="chat-tabs">
                {['Fenteng', 'Tony'].map((tab) => (
                  <button
                    key={tab}
                    className={`chat-tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="chat-msgs">
                {!(messages[activeTab] && messages[activeTab].length) ? (
                  <div className="chat-empty">No messages yet — start the conversation.</div>
                ) : (
                  messages[activeTab].map((m, idx) => (
                    <div key={idx} style={{ padding: '6px 10px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid var(--gray-200)', fontSize: '12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--blue)', fontSize: '11px', marginBottom: '2px' }}>{m.sender} <span style={{ color: 'var(--gray-400)', fontWeight: 400, fontSize: '10px' }}>{m.time}</span></div>
                      <div>{m.text}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="chat-inputbar">
                <input
                  type="text"
                  placeholder={`Message ${activeTab}...`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button className="btn btn-sm btn-primary" onClick={handleSendMessage}>Send</button>
              </div>

              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-500)' }}>TIMELINE HISTORY</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setShowTimeline(!showTimeline)}>
                  {showTimeline ? 'Hide' : 'Show'}
                </button>
              </div>
              {showTimeline && (
                <div style={{ padding: '10px 12px', fontSize: '11.5px', background: 'var(--gray-50)', borderTop: '1px solid var(--gray-200)', maxHeight: '120px', overflowY: 'auto' }}>
                  <div>• PR Created on {fmtDate(pr.createdAt || today)}</div>
                  {pr.hold && <div>• PR put {pr.hold} ({pr.holdReason || 'No reason'})</div>}
                  {isConverted && <div>• Converted to PO ({pr.poNo || 'Pending Sync'})</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          yes={confirm.yes}
          onNo={() => setConfirm(null)}
          onYes={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}

      {/* Hold Modal */}
      {holdModal && (
        <div className="modal-backdrop" onClick={() => setHoldModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: '12px', padding: '24px', maxWidth: '440px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginBottom: '12px' }}>{holdModal === 'hold' ? 'Put PR On Hold' : 'Cancel PR'}</h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '16px' }}>
              {holdModal === 'hold'
                ? 'On Hold keeps the PR active underneath but marks it pending client decisions.'
                : 'Cancelled stops the PR from progressing unless restored.'}
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const reason = e.target.reason.value;
              act('prHold', { id: pr.id, reason, cancel: holdModal === 'cancel' });
              setHoldModal(null);
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Reason</label>
                <select name="reason" className="select" required style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--gray-300)' }}>
                  {HOLD_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn" onClick={() => setHoldModal(null)}>Cancel</button>
                <button type="submit" className={`btn ${holdModal === 'cancel' ? 'btn-danger' : 'btn-primary'}`}>
                  {holdModal === 'hold' ? 'Confirm Hold' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

