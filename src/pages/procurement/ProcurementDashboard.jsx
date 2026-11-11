import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../store.jsx';
import { procurementDashboard } from '../../domain/dashboard.js';
import { fmtCNY, fmtPHP } from '../../domain/util.js';

const compact = (n, cur) => {
  const sym = cur === 'PHP' ? '₱' : '¥';
  const v = Number(n) || 0;
  return `${sym}${v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0)}`;
};
const money = (n, cur) => (cur === 'PHP' ? fmtPHP(n) : fmtCNY(n)) || `${cur === 'PHP' ? '₱' : '¥'}0`;

function Spark({ data, color }) {
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${24 - (v / max) * 22}`).join(' ');
  return <svg className="spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function Kpi({ label, value, sub, k, color, goodWhen, icon }) {
  const d = k ? k.deltaPct : null;
  const good = d === null || d === 0 ? null : goodWhen === 'down' ? d < 0 : goodWhen === 'up' ? d > 0 : null;
  return (
    <div className="card kpi" style={{ position: 'relative' }}>
      {icon && (
        <span style={{ position: 'absolute', top: '16px', right: '16px', width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>
          {icon}
        </span>
      )}
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="muted kpi-sub">{sub}</div>
      {k && (
        <div className="kpi-foot">
          <span className={d === 0 ? 'muted' : good === null ? '' : good ? 'pv-green' : 'pv-red'}>{d === 0 ? 'No change' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}%`}</span>
          <Spark data={k.spark} color={color} />
        </div>
      )}
    </div>
  );
}

function Bars({ rows }) {
  const total = rows.reduce((t, r) => t + r.count, 0) || 1;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.key} className="bar-row">
          <span className="bar-label">{r.label}</span>
          <span className="bar-track"><span style={{ width: `${(r.count / total) * 100}%`, background: r.color }} /></span>
          <b>{r.count}</b>
        </div>
      ))}
    </div>
  );
}

const ICON = { pr: '📄', po: '📦', exc: '⚠', inq: '📥', ship: '🚢', recv: '🗄', rr: '↻' };

// Procurement Dashboard: live numbers across every Procurement module.
export default function ProcurementDashboard() {
  const { db, today } = useStore();
  const d = useMemo(() => procurementDashboard(db, today), [db, today]);
  const [search, setSearch] = useState('');
  const refs = { overview: useRef(null), analytics: useRef(null), suppliers: useRef(null) };
  const jump = (k) => refs[k].current && refs[k].current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const q = search.trim().toLowerCase();
  const activity = d.activity.filter((a) => !q || `${a.title} ${a.desc}`.toLowerCase().includes(q));
  const maxChart = Math.max(1, ...d.chart.flatMap((c) => [c.PR, c.PO]));
  const topMax = Math.max(1, ...d.topSuppliers.map((s) => s.spend));
  const spendText = Object.entries(d.spendByCurrency).map(([c, v]) => money(v, c)).join(' · ') || '₱0';

  return (
    <section className="screen">
      <div ref={refs.overview} className="dash-anchor" />
      <header className="screen-head">
        <div>
          <p className="eyebrow">Supply Chain App · Procurement</p>
          <h1>Procurement Overview</h1>
          <p className="muted">Live data across every Procurement module: Inquiries, Purchase Requests, Purchase Orders, Shipments, Receiving, Exceptions, Replacement Requests and Suppliers.</p>
        </div>
        <div className="tabs" role="navigation" aria-label="Sections">
          {[['overview', 'Overview'], ['analytics', 'Analytics'], ['suppliers', 'Suppliers']].map(([k, label]) => (
            <button key={k} className="tab" onClick={() => jump(k)}>{label}</button>
          ))}
        </div>
      </header>

      <div className="kpi-grid">
        <Kpi label="Purchase Requests" value={d.pr.count} sub="last 4 weeks vs prior 4" k={d.pr} color="#eb6834" icon="📄" />
        <Kpi label="Active Purchase Orders" value={d.po.count} sub="not yet completed / cancelled" k={d.po} color="#2a78d6" icon="📦" />
        <Kpi label="Open Exceptions" value={d.exc.count} sub="not resolved / closed" k={d.exc} color="#d03b3b" goodWhen="down" icon="⚠" />
        <Kpi label="Open Inquiries" value={d.inq.count} sub="last 4 weeks vs prior 4" k={d.inq} color="#3987e5" icon="📥" />
        <Kpi label="Shipments In Transit" value={d.ship.count} sub="not yet delivered" k={d.ship} color="#2a78d6" icon="🚢" />
        <Kpi label="Pending Receiving" value={d.recv.count} sub={d.totalMissing > 0 ? `${d.totalMissing} units short-shipped total` : 'not yet fully received'} k={d.recv} color="#fab219" goodWhen="down" icon="🗄" />
        <Kpi label="Open Replacement Requests" value={d.rr.count} sub="not completed" k={d.rr} color="#d03b3b" goodWhen="down" icon="↻" />
        <Kpi label="Total Suppliers" value={d.supplierCount} sub={`${spendText} total PO spend`} icon="🚚" />
      </div>

      <div className="dash-two">
        <div className="card">
          <div className="card-head">Purchase Requests vs Purchase Orders: last 8 weeks</div>
          <div className="card-body">
            {d.chart.every((c) => !c.PR && !c.PO) ? <div className="empty small">No PR/PO activity in this window yet.</div> : (
              <div className="dash-chart" role="img" aria-label="PRs and POs per week">
                {d.chart.map((c) => (
                  <div key={c.label} className="dash-col" title={`Week of ${c.label}: ${c.PR} PR, ${c.PO} PO`}>
                    <div className="dash-pair">
                      <span className="b-pr" style={{ height: `${(c.PR / maxChart) * 100}%` }} />
                      <span className="b-po" style={{ height: `${(c.PO / maxChart) * 100}%` }} />
                    </div>
                    <div className="fc-label">{c.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="fc-legend"><span><i style={{ background: '#eb6834' }} /> Purchase Requests</span><span><i style={{ background: '#2a78d6' }} /> Purchase Orders</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head">Top Suppliers by Spend</div>
          <div className="card-body">
            {d.topSuppliers.length === 0 ? <div className="empty small">No supplier has a PO line yet.</div> : d.topSuppliers.map((s, i) => (
              <div key={s.name} className="top-sup">
                <div className="top-sup-head"><span>{i + 1}. {s.name}</span><span className="muted">{s.count} line{s.count === 1 ? '' : 's'} · {compact(s.spend, s.currency)}</span></div>
                <span className="bar-track"><span style={{ width: `${Math.max(4, (s.spend / topMax) * 100)}%`, background: '#2a78d6' }} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <h2 className="card-title grow">Recent Activity</h2>
          <input className="search" type="search" placeholder="Search PR#, PO#, supplier…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search activity" />
        </div>
        {activity.length === 0 ? <div className="empty small">No activity matches.</div> : (
          <ul className="activity">
            {activity.map((a, i) => (
              <li key={i}><span className="act-icon" aria-hidden="true">{ICON[a.type]}</span><div><b>{a.title}</b> {a.desc}<div className="muted">{a.when}</div></div></li>
            ))}
          </ul>
        )}
      </div>

      <div ref={refs.analytics} className="dash-anchor" />
      <h2>Analytics</h2>
      <div className="kpi-grid">
        {Object.entries(d.breakdowns).map(([title, rows]) => (
          <div key={title} className="card"><div className="card-head">{title}</div><div className="card-body"><Bars rows={rows} /></div></div>
        ))}
      </div>

      <div ref={refs.suppliers} className="dash-anchor" />
      <h2>Suppliers</h2>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Supplier</th><th>PO lines</th><th>Active lines</th><th>Spend</th></tr></thead>
            <tbody>
              {d.suppliers.map((s) => (
                <tr key={s.name} style={{ cursor: 'default' }}>
                  <td data-label="Supplier"><b>{s.name}</b></td><td data-label="PO lines">{s.count}</td><td data-label="Active lines">{s.active}</td><td data-label="Spend">{money(s.spend, s.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
