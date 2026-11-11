import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { RULES, TAGS } from '../domain/rules.js';
import { paymentOK } from '../domain/actions.js';
import { conversion } from '../domain/analytic.js';
import { fmtMoneyIn } from '../domain/util.js';

function Kpi({ label, value, sub, tone }) {
  return <div className={`stat ${tone ? 'stat-' + tone : ''}`}><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-sub">{sub}</div></div>;
}

function Row({ label, value, max }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round((value * 100) / max)}%` }} /></span>
      <span className="bar-val">{value}</span>
    </div>
  );
}

function Stage({ to, label, count, tone }) {
  return (
    <a className={`stage ${tone ? 'stage-' + tone : ''}`} href={`#/${to}`}>
      <span className="stage-count">{count}</span>
      <span className="stage-label">{label}</span>
    </a>
  );
}

function Lane({ title, accent, children }) {
  return (
    <section className={`lane lane-${accent}`}>
      <h2>{title}</h2>
      <div className="stages">{children}</div>
    </section>
  );
}

export function Dashboard() {
  const { db, today, reset } = useStore();
  const c = conversion(db);
  const n = (rows, fn) => rows.filter(fn).length;
  const stage = (s) => n(db.items, (i) => i.stage === s);
  const sr = (s) => n(db.serviceRequests, (x) => x.status === s);

  const attention = [];
  const gateBlocked = db.items.filter((i) => i.stage === 'Readiness Gate' && (!i.received || !i.pac || !i.picker || !paymentOK(i, today)));
  if (gateBlocked.length) attention.push({ to: 'fulfillment/readiness', tone: 'warn', text: `${gateBlocked.length} item(s) at Order Readiness are blocked.` });
  const held = n(db.prs, (p) => p.hold === 'On Hold');
  if (held) attention.push({ to: 'procurement/pr', tone: 'warn', text: `${held} PR(s) are on hold.` });
  const noRR = n(db.exceptions, (e) => e.status === 'Open');
  if (noRR) attention.push({ to: 'procurement/exceptions', tone: 'bad', text: `${noRR} exception(s) have no replacement yet.` });
  const late = n(db.shipments, (s) => s.status !== 'Arrived' && s.eta && s.eta < today);
  if (late) attention.push({ to: 'procurement/shipments', tone: 'bad', text: `${late} shipment(s) are past their ETA.` });
  const unscheduled = n(db.serviceRequests, (s) => s.status === 'Initial Scheduling' && !s.initialDate);
  if (unscheduled) attention.push({ to: 'delivery/initial', tone: 'warn', text: `${unscheduled} dispatched job(s) have no initial date.` });
  const failed = sr('Exception');
  if (failed) attention.push({ to: 'delivery/exceptions', tone: 'bad', text: `${failed} failed delivery(ies) need a decision.` });
  const toQc = n(db.items, (i) => i.qcStatus === 'Rejected');
  if (toQc) attention.push({ to: 'fulfillment/pack-qc', tone: 'bad', text: `${toQc} item(s) were rejected at QC.` });

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <h1>Supply Chain Analytic</h1>
          <p className="muted">From the first inquiry to the customer’s door. Click any stage to open it.</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => window.confirm('Replace all data with the sample data?') && reset()}>Reset sample data</button>
        </div>
      </header>

      <div className="stats">
        <Kpi label="Overall Fulfillment" value={`${c.kpi.overall}%`} sub="items delivered" tone="ok" />
        <Kpi label="PO Completion" value={`${c.kpi.poCompletion}%`} sub="POs completed" />
        <Kpi label="Pick-to-Pack" value={`${c.kpi.pickToPack}%`} sub="picked items that passed QC" />
        <Kpi label="On-Time Delivery" value={`${c.kpi.onTime}%`} sub="delivered by the requested date" tone="ok" />
        <Kpi label="Total Orders" value={c.kpi.orders} sub="Sales Orders" />
        <Kpi label="Overall Impact Rate" value={`${c.kpi.impact}%`} sub="exceptions per order" tone={c.kpi.impact >= 10 ? 'bad' : undefined} />
        <Kpi label="Total PO Spend" value={fmtMoneyIn(c.kpi.spendCNY, 'CNY')} sub="CNY, not cancelled" />
      </div>

      <div className="card pad">
        <h2 className="card-title">Order Fulfillment Funnel</h2>
        {c.funnel.map(([label, v]) => <Row key={label} label={label} value={v} max={Math.max(1, c.funnel[0][1], ...c.funnel.map((x) => x[1]))} />)}
      </div>
      <div className="grid-2">
        <div className="card pad">
          <h2 className="card-title">Delivery Type Split</h2>
          {c.split.map(([label, v]) => <Row key={label} label={label} value={v} max={Math.max(1, ...c.split.map((x) => x[1]))} />)}
        </div>
        <div className="card pad">
          <h2 className="card-title">Top Exception Reasons</h2>
          {c.reasons.length === 0 ? <div className="muted">No exceptions.</div> : c.reasons.slice(0, 5).map(([label, v]) => <Row key={label} label={label} value={v} max={c.reasons[0][1]} />)}
        </div>
      </div>
      <div className="card pad">
        <h2 className="card-title">Supplier Breakdown</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Supplier</th><th>POs</th><th>Completed</th><th>Spend</th><th>Exceptions</th></tr></thead>
          <tbody>{c.suppliers.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.pos}</td><td>{x.completed}</td><td>{fmtMoneyIn(x.spend, x.currency)}</td><td>{x.exceptions}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="card pad">
        <h2 className="card-title">Insights & Alerts</h2>
        <ul className="attention">{c.insights.map((i, k) => <li key={k} className={`att-${i.tone}`}>{i.text}</li>)}</ul>
      </div>

      <div className="card pad">
        <h2 className="card-title">Needs attention</h2>
        {attention.length === 0 ? (
          <div className="muted">Nothing is stuck.</div>
        ) : (
          <ul className="attention">
            {attention.map((a) => (
              <li key={a.to}><a href={`#/${a.to}`}><span className={`dot dot-${a.tone}`} />{a.text}</a></li>
            ))}
          </ul>
        )}
      </div>

      <Lane title="1 · Procurement" accent="violet">
        <Stage to="procurement/inquiry" label="Open inquiries" count={n(db.inquiries, (q) => q.status !== 'Sales Order')} />
        <Stage to="procurement/pr" label="Active PRs" count={n(db.prs, (p) => p.status !== 'Converted to PO' && !p.hold)} />
        <Stage to="procurement/po" label="POs not acknowledged" count={n(db.pos, (p) => p.status === 'Draft' || p.status === 'Sent')} />
        <Stage to="procurement/shipments" label="Shipments on the way" count={n(db.shipments, (s) => s.status !== 'Arrived')} />
        <Stage to="procurement/receiving" label="To receive" count={n(db.receivings, (r) => r.status === 'Open' || r.status === 'Partial')} />
        <Stage to="procurement/exceptions" label="Open exceptions" count={n(db.exceptions, (e) => e.status !== 'Closed')} tone={n(db.exceptions, (e) => e.status === 'Open') ? 'bad' : ''} />
      </Lane>

      <Lane title="2 · Fulfillment" accent="blue">
        <Stage to="fulfillment/readiness" label="Order Readiness" count={stage('Readiness Gate')} />
        <Stage to="fulfillment/pick" label="Pick" count={stage('Pick')} />
        <Stage to="fulfillment/pack-qc" label="QC" count={stage('QC')} />
        <Stage to="fulfillment/crate" label="Crate" count={stage('Crate')} />
        <Stage to="fulfillment/to-ship" label="Ready to dispatch" count={stage('Order Aggregation')} />
      </Lane>

      <Lane title="3 · Delivery Management" accent="teal">
        <Stage to="delivery/initial" label="Initial Scheduling" count={sr('Initial Scheduling')} />
        <Stage to="delivery/requests" label="Service Request" count={sr('Service Request')} />
        <Stage to="delivery/appointments" label="Scheduled" count={sr('Scheduled')} />
        <Stage to="delivery/ongoing" label="Ongoing" count={sr('Ongoing')} />
        <Stage to="delivery/exceptions" label="Failed" count={sr('Exception')} tone={sr('Exception') ? 'bad' : ''} />
        <Stage to="delivery/ongoing" label="Completed" count={sr('Completed')} tone="ok" />
      </Lane>
    </section>
  );
}

export function RulesScreen() {
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const shown = useMemo(
    () => RULES.filter((r) => (!tag || r.tag === tag) && (!q || `${r.id} ${r.module} ${r.text}`.toLowerCase().includes(q.toLowerCase()))),
    [tag, q],
  );
  const modules = [...new Set(shown.map((r) => r.module))];
  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <h1>Rules &amp; Conditions</h1>
          <p className="muted">{RULES.length} rules. When a button refuses, the message names the rule id from this list.</p>
        </div>
      </header>
      <div className="card">
        <div className="toolbar">
          <div className="tabs">
            <button className={`tab ${tag === '' ? 'on' : ''}`} onClick={() => setTag('')}>All</button>
            {TAGS.map((t) => (
              <button key={t} className={`tab ${tag === t ? 'on' : ''}`} onClick={() => setTag(t)}>{t}</button>
            ))}
          </div>
          <input className="search" type="search" placeholder="Search rules…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rules" />
        </div>
        <div className="rules">
          {modules.length === 0 && <div className="empty">No rule matches.</div>}
          {modules.map((m) => (
            <div key={m} className="rule-group">
              <h3>{m}</h3>
              {shown.filter((r) => r.module === m).map((r) => (
                <div key={r.id} className="rule">
                  <span className={`tag tag-${r.tag}`}>{r.tag}</span>
                  <span className="rule-text">{r.text}</span>
                  <code className="rule-id">{r.id}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ActivityScreen() {
  const { db } = useStore();
  const rows = db.audit.slice().reverse();
  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <h1>Activity</h1>
          <p className="muted">Every workflow step taken in this browser, newest first.</p>
        </div>
      </header>
      <div className="card pad">
        {rows.length === 0 ? <div className="muted">No activity yet.</div> : (
          <ul className="timeline">
            {rows.map((h, i) => (
              <li key={i}>
                <div>{h.msg}</div>
                <div className="muted">{h.action} · {new Date(h.at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
