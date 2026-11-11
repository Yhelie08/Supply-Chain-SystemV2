import { useEffect, useRef, useState } from 'react';
import { StoreProvider } from './store.jsx';
import { FIRST_PATH, ROUTES, SECTIONS } from './nav.js';
import { Toasts } from './ui/components.jsx';
import Bell from './ui/Bell.jsx';

function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || FIRST_PATH;
  const [path, setPath] = useState(read);
  useEffect(() => {
    const h = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return path;
}

// The section switcher in the top bar: Analytic, Procurement, Tony Fan, Fenteng Lighting, Fulfillment, Delivery Management.
function SectionMenu({ current }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="section-switch" ref={box}>
      <button className="section-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="rocket" aria-hidden="true" />{current.label}<span className="chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="section-menu" role="menu" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.key} role="menuitem" href={`#/${s.pages[0].path}`} className={`section-item ${s.key === current.key ? 'on' : ''}`} onClick={() => setOpen(false)}>
              <span className="rocket" aria-hidden="true" />{s.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Shell() {
  const path = useRoute();
  // A page owns every path beneath its own, e.g. #/procurement/inquiry/new or #/procurement/inquiry/<id>.
  const route = ROUTES.find((r) => r.path === path) || ROUTES.find((r) => path.startsWith(r.path + '/')) || ROUTES[0];
  const sub = path.startsWith(route.path + '/') ? path.slice(route.path.length + 1) : '';
  const Page = route.Component;

  const section = route.section;
  const pages = section.pages;

  useEffect(() => {
    document.title = `${route.label} · Supply Chain`;
  }, [route]);

  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-row">
          <a className="brand" href={`#/${FIRST_PATH}`}><span className="brand-mark" aria-hidden="true">SCA</span>Supply Chain App</a>
          <SectionMenu current={section} />
          <span className="topnav-spacer" />
          <a className={`ref-link ${section.key === 'reference' ? 'on' : ''}`} href="#/rules">Reference</a>
          <Bell />
        </div>
        <nav className="tabbar" aria-label="Pages">
          {pages.map((p) => (
            <a key={p.path} href={`#/${p.path}`} className={`tab-link ${p.path === route.path ? 'active' : ''}`} aria-current={p.path === route.path ? 'page' : undefined}>
              {p.short || p.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="main">
        <div className="panel">
          <Page key={route.path} sub={sub} />
        </div>
      </main>
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
