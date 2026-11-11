import { useState } from 'react';
import { Modal } from '../../ui/components.jsx';
import { readiness, margin as marginOf } from '../../domain/inquiry.js';
import { fmtCNY, fmtPHP } from '../../domain/util.js';

export const BASE = '#/procurement/inquiry';
export const goTo = (sub = '') => {
  window.location.hash = sub ? `${BASE}/${sub}` : BASE;
};

// ── Status and next-step chips ──

export function StatusBadge({ status }) {
  const tone = status === 'Ready' ? 'ok' : status === 'In Progress' ? 'warn' : status === 'Fully Ready' ? 'ok' : 'bad';
  return <span className={`pill pill-${tone}`}>{status === 'Ready' ? 'Ready for Estimate' : status}</span>;
}

export function NextStepPill({ ns }) {
  if (!ns) return <span className="muted">—</span>;
  const lead = ns.tone === 'done' ? '✓' : ns.tone === 'wait' ? 'Waiting on:' : 'Next:';
  return (
    <span className={`ns-pill ns-${ns.tone}`}>
      {lead} {ns.action}
      {ns.who && <span className="ns-who"> — {ns.who}</span>}
    </span>
  );
}

export function NextStepBanner({ ns }) {
  const label = ns.tone === 'done' ? 'Status' : ns.tone === 'wait' ? 'Waiting on' : 'Next step';
  return (
    <div className={`ns-banner ns-${ns.tone}`}>
      <span><span className="ns-lbl">You are here</span><b>{ns.here}</b></span>
      <span className="ns-arrow">→</span>
      <span><span className="ns-lbl">{label}</span><b>{ns.action}</b>{ns.who && <span className="ns-who"> ({ns.who})</span>}</span>
    </div>
  );
}

// ── Readiness checklist and pricing summary ──

export function ReadinessCard({ inq }) {
  const r = readiness(inq);
  return (
    <div className="card side-card">
      <div className="side-head">Readiness Checklist</div>
      <div className="side-body flush">
        {r.checks.map((c) => (
          <div key={c.key} className={`check-item ${c.passed ? 'done' : ''}`}>
            <span className={`check-icon ${c.passed ? 'ci-done' : 'ci-pending'}`} aria-hidden="true">{c.passed ? '✓' : '✗'}</span>
            <div>
              <div className="check-title">{c.title}</div>
              <div className="check-sub">{c.sub}</div>
            </div>
          </div>
        ))}
        {r.passed === 5 ? (
          <div className="readiness-banner rb-ready">✓ READY FOR ESTIMATE<br /><small>All 5 conditions passed</small></div>
        ) : (
          <div className="readiness-banner rb-pending">{r.passed} of 5 conditions passed</div>
        )}
      </div>
    </div>
  );
}

export function PricingCard({ inq, children }) {
  const sel = (inq.quotes || []).find((q) => q.selected);
  const cost = sel ? Number(sel.negotiated) > 0 ? Number(sel.negotiated) : Number(sel.initial) || 0 : 0;
  const m = marginOf(inq);
  const approved = Number(inq.srp) > 0;
  return (
    <div className="card side-card">
      <div className="side-head">SRP &amp; Pricing Summary</div>
      <div className="side-body">
        <div className="pricing-row"><span>Selected Final Cost</span><b>{cost > 0 ? fmtCNY(cost) : '—'}</b></div>
        <div className="pricing-row"><span>SRP (Approved)</span><b>{approved ? fmtPHP(inq.srp) : '—'}</b></div>
        <div className="pricing-row" title="Cost is CNY and SRP is PHP. No exchange rate is applied, as in the original widget.">
          <span>Margin</span>
          <b className={m == null ? '' : m >= 0 ? 'pv-green' : 'pv-red'}>{m == null ? '—' : `${m.toFixed(0)}%`}</b>
        </div>
        <div className="pricing-row"><span>SRP Status</span><b className={approved ? 'pv-green' : 'muted'}>● {approved ? 'Approved' : 'Pending'}</b></div>
        {children}
      </div>
    </div>
  );
}

// ── Autocomplete: a text box with a dropdown of matches and an optional "+ create new" row ──

export function Combo({ id, value, onChange, options, onPick, onAdd, addLabel, placeholder, invalid, emptyText = 'No matches', startsWith, disabled }) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const list = options.filter((o) => (startsWith ? o.label.toLowerCase().startsWith(q) : o.label.toLowerCase().includes(q)));
  return (
    <div className="combo">
      <input
        id={id} value={value} placeholder={placeholder} disabled={disabled} autoComplete="off"
        className={invalid ? 'invalid' : ''} aria-invalid={invalid ? 'true' : undefined} aria-expanded={open}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && !disabled && (
        <div className="combo-list" role="listbox">
          {list.length === 0 && <div className="combo-empty">{emptyText}</div>}
          {list.slice(0, 200).map((o) => (
            <div key={o.id} role="option" className="combo-item" onMouseDown={(e) => { e.preventDefault(); onPick(o); setOpen(false); }}>{o.label}</div>
          ))}
          {onAdd && (
            <div className="combo-item combo-add" onMouseDown={(e) => { e.preventDefault(); setOpen(false); onAdd(value.trim()); }}>
              {typeof addLabel === 'function' ? addLabel(value.trim()) : addLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConfirmModal({ message, yes = 'Yes', onYes, onNo }) {
  return (
    <Modal
      title="Please confirm"
      onClose={onNo}
      footer={
        <>
          <button className="btn" onClick={onNo}>Cancel</button>
          <button className="btn btn-primary" onClick={onYes}>{yes}</button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

export function Field({ label, req, hint, children, wide, id }) {
  return (
    <div className={`field ${wide ? 'field-wide' : ''}`}>
      <label htmlFor={id}>{label}{req && <span className="req"> *</span>}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div className="card form-card">
      <div className="card-head">{title}</div>
      <div className="card-body">{children}</div>
    </div>
  );
}
