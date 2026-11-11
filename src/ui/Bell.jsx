import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';

// The notification bell in the top bar. Every workflow step already leaves an audit line, so the bell is a view
// of those steps: "unread" means taken since the last time this browser opened the bell. The marker is a
// per-viewer convenience, so it lives in the browser and not in the data. Steps are counted with db.auditSeq
// (not by timestamp, because the sample data's timestamps are not on this browser's clock).
const KEY = 'supply-chain-v2:bell-seen';
const readSeen = () => { try { const v = localStorage.getItem(KEY); return v === null ? null : Number(v); } catch { return null; } };
const writeSeen = (v) => { try { localStorage.setItem(KEY, String(v)); } catch { /* the bell still works without storage */ } };

export default function Bell() {
  const { db } = useStore();
  const seq = db.auditSeq || db.audit.length;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readSeen() ?? seq);
  const box = useRef(null);

  useEffect(() => { if (readSeen() === null) writeSeen(seq); }, [seq]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const unread = open ? 0 : Math.max(0, seq - seen);
  const recent = db.audit.slice(-8).reverse();

  const toggle = () => {
    if (!open) { setSeen(seq); writeSeen(seq); }
    setOpen(!open);
  };

  return (
    <div className="bell" ref={box}>
      <button className="bell-btn" aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} aria-haspopup="true" aria-expanded={open} onClick={toggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="region" aria-label="Notifications">
          <div className="bell-head">Notifications</div>
          {recent.length === 0 ? <div className="muted bell-empty">Nothing yet. Steps taken in the app show up here.</div> : (
            <ul>
              {recent.map((a, i) => (
                <li key={i}>
                  <div>{a.msg}</div>
                  <div className="muted">{new Date(a.at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
          <a className="bell-all" href="#/activity" onClick={() => setOpen(false)}>See all activity</a>
        </div>
      )}
    </div>
  );
}
