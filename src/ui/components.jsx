import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';

const TONES = {
  ok: ['Received', 'Completed', 'Approved', 'Paid', 'Acknowledged', 'Done', 'Closed', 'Credit', 'Replacement received', 'Sales Order', 'Dispatched', 'Ready for PO', 'Arrived', 'Active', 'Selected', 'Confirmed', 'Shipped'],
  warn: ['Pending', 'Partial', 'Draft', 'Sent', 'Quoted', 'In Transit', 'On Hold', 'Open', 'In Progress', 'Waiting', 'Submit Response', 'Awaiting Acknowledge', 'Awaiting Approval', 'In Production'],
  bad: ['Cancelled', 'Rejected', 'Exception', 'Unpaid', 'Closed – Exceptions', 'Overdue', 'Not Selected'],
  info: ['Scheduled', 'Ongoing', 'Estimate Created', 'Converted to PO', 'RR Created', 'Service Request', 'Initial Scheduling', 'Pick Up', 'Delivery', 'Installation'],
};

export function toneOf(text) {
  for (const [tone, list] of Object.entries(TONES)) if (list.includes(text)) return tone;
  return 'neutral';
}

export function Pill({ children, tone }) {
  if (children == null || children === '') return <span className="muted">—</span>;
  return <span className={`pill pill-${tone || toneOf(String(children))}`}>{children}</span>;
}

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'ok' ? 'status' : 'alert'}>
          <div className="toast-body">
            <div>{t.text}</div>
            {t.rule && <div className="toast-rule">Rule {t.rule}. Find it under Reference → Rules.</div>}
          </div>
          <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}

function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function Modal({ title, children, onClose, footer }) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ title, subtitle, children, onClose }) {
  useEscape(onClose);
  return (
    <div className="overlay overlay-right" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="muted">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

// A form built from field declarations: {key, label, type, options, required, hint, default}.
export function FormFields({ fields, values, setValue }) {
  const first = useRef(null);
  useEffect(() => {
    if (first.current) first.current.focus();
  }, []);
  return (
    <div className="form-grid">
      {fields.map((f, i) => {
        const id = `f-${f.key}`;
        const v = values[f.key];
        const common = {
          id,
          ref: i === 0 ? first : undefined,
          value: v ?? '',
          onChange: (e) => setValue(f.key, e.target.value),
          required: f.required,
        };
        let input;
        if (f.type === 'select') {
          input = (
            <select {...common}>
              <option value="">{f.placeholder || 'Choose…'}</option>
              {f.options.map((o) => (typeof o === 'object' ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o} value={o}>{o}</option>))}
            </select>
          );
        } else if (f.type === 'textarea') {
          input = <textarea {...common} rows={3} />;
        } else if (f.type === 'checkbox') {
          input = (
            <input id={id} type="checkbox" ref={i === 0 ? first : undefined} checked={!!v} onChange={(e) => setValue(f.key, e.target.checked)} />
          );
        } else {
          input = <input {...common} type={f.type || 'text'} min={f.type === 'number' ? 0 : undefined} />;
        }
        return (
          <div key={f.key} className={`field ${f.type === 'checkbox' ? 'field-check' : ''} ${f.wide ? 'field-wide' : ''}`}>
            <label htmlFor={id}>
              {f.label}
              {f.required && <span className="req" title="Required"> *</span>}
            </label>
            {input}
            {f.hint && <div className="hint">{f.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function ActionModal({ spec, row, onClose, onSubmit }) {
  const fields = spec.fields || [];
  const [values, setValues] = useState(() => {
    const init = {};
    fields.forEach((f) => {
      const d = typeof f.default === 'function' ? f.default(row) : f.default;
      init[f.key] = d ?? (f.type === 'checkbox' ? false : '');
    });
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState('');
  const setValue = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  // spec.confirmIf(values, row) returns a question to ask before the step runs (for example when declining), or ''.
  const go = () => {
    setBusy(true);
    const ok = onSubmit(values);
    if (ok) onClose();
    else setBusy(false);
  };
  const submit = (e) => {
    e.preventDefault();
    const q = spec.confirmIf ? spec.confirmIf(values, row) : '';
    if (q && !asking) setAsking(q);
    else go();
  };

  return (
    <Modal
      title={spec.title || spec.label}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={asking ? () => setAsking('') : onClose}>{spec.cancelLabel || 'Cancel'}</button>
          <button type="submit" form="action-form" className={`btn ${spec.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {asking ? (spec.yesLabel || 'Yes') : spec.submit || spec.label}
          </button>
        </>
      }
    >
      <form id="action-form" onSubmit={submit}>
        {asking ? <p className="intro confirm-ask" role="alert">{asking}</p> : (
          <>
            {spec.intro && <p className="intro">{typeof spec.intro === 'function' ? spec.intro(row) : spec.intro}</p>}
            <FormFields fields={fields} values={values} setValue={setValue} />
          </>
        )}
      </form>
    </Modal>
  );
}
