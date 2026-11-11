import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { Pill } from '../../ui/components.jsx';
import {
  DEFAULTS, HORIZON_DEF, SETTING_DEFS, TOGGLE_DEFS, daysBetween, forecastRows, measuredPrep, resolveSettings, startOfWeek, weeklyBuckets,
} from '../../domain/forecast.js';
import { addDays, fmtDate } from '../../domain/util.js';

const short = (iso) => (iso ? fmtDate(iso).slice(0, 6) : '—');

// Procurement to Delivery Forecast: a window per order, built leg by leg, compared with what the client expects.
export default function ForecastPage() {
  const { db, today } = useStore();
  const settings = useMemo(() => resolveSettings(db.settings && db.settings.forecast), [db.settings]);
  const [tab, setTab] = useState('volume');
  const [q, setQ] = useState('');
  const [sev, setSev] = useState('all');
  const [mode, setMode] = useState('all');
  const [sort, setSort] = useState('soonest');

  const rows = useMemo(() => forecastRows(db, settings, today), [db, settings, today]);
  const modes = useMemo(() => [...new Set(rows.map((r) => r.f.bucket))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (sev === 'all' || r.sev.code === sev) && (mode === 'all' || r.f.bucket === mode)
        && (!needle || [r.o.soNo, r.o.prNo, r.o.customer, r.o.supplier, r.o.shipNo, r.o.itemName, r.o.sku].join(' ').toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (sort === 'latest') return (b.variance === null ? -Infinity : b.variance) - (a.variance === null ? -Infinity : a.variance); // worst promise-breakers first
        if (sort === 'target') return !a.o.target ? 1 : !b.o.target ? -1 : a.o.target < b.o.target ? -1 : 1;
        return !a.f.likely ? 1 : !b.f.likely ? -1 : a.f.likely < b.f.likely ? -1 : a.f.likely > b.f.likely ? 1 : 0;
      });
  }, [rows, q, sev, mode, sort]);

  const weeks = useMemo(() => weeklyBuckets(filtered, settings, today), [filtered, settings, today]);
  const weekEnd = addDays(startOfWeek(today), 6);
  const tiles = {
    open: filtered.length,
    week: filtered.filter((r) => r.f.likely && r.f.likely <= weekEnd).length,
    atrisk: filtered.filter((r) => r.sev.code === 'atrisk').length,
    miss: filtered.filter((r) => r.sev.code === 'miss').length,
    notarget: filtered.filter((r) => r.sev.code === 'notarget').length,
  };

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <h1>Procurement to Delivery Forecast</h1>
          <p className="muted">Procurement to delivery · {rows.length} open order{rows.length === 1 ? '' : 's'} · today {fmtDate(today)}</p>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><div className="stat-value">{tiles.open}</div><div className="stat-label">Open orders</div><div className="stat-sub">not yet delivered</div></div>
        <div className="stat"><div className="stat-value">{tiles.week}</div><div className="stat-label">This week</div><div className="stat-sub">likely date up to Sunday</div></div>
        <div className="stat stat-warn"><div className="stat-value">{tiles.atrisk}</div><div className="stat-label">At risk</div><div className="stat-sub">only just fits the client date</div></div>
        <div className="stat stat-bad"><div className="stat-value">{tiles.miss}</div><div className="stat-label">Will miss</div><div className="stat-sub">later than the client expects</div></div>
        <div className="stat"><div className="stat-value">{tiles.notarget}</div><div className="stat-label">No client date</div><div className="stat-sub">no target date recorded</div></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="tabs" role="tablist">
            {[['volume', 'Volume'], ['forecast', 'Forecast'], ['settings', 'Forecast Settings']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          {tab !== 'settings' && (
            <>
              <input className="search" type="search" placeholder="Search SO, PR, customer, supplier…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search forecast" />
              <select aria-label="Status filter" value={sev} onChange={(e) => setSev(e.target.value)}>
                <option value="all">All statuses</option><option value="ontrack">On track</option><option value="atrisk">At risk</option>
                <option value="miss">Will miss / overdue</option><option value="notarget">No client date</option>
              </select>
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="soonest">Arriving soonest</option><option value="latest">Latest against the client</option><option value="target">By client date</option>
              </select>
              <select aria-label="Mode filter" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="all">All modes</option>{modes.map((m) => <option key={m}>{m}</option>)}
              </select>
              <span className="muted">{filtered.length} shown</span>
            </>
          )}
        </div>
        {tab === 'volume' && <VolumeChart weeks={weeks} />}
        {tab === 'forecast' && <ForecastTable rows={filtered} today={today} />}
        {tab === 'settings' && <SettingsPanel settings={settings} measured={measuredPrep(db, today)} saved={!!(db.settings && Object.keys(db.settings.forecast || {}).length)} />}
      </div>

      <p className="muted small-print">
        The forecast is a <b>window</b> (Earliest to Latest), not an exact date. &quot;Client expects&quot; is the order&apos;s target delivery date. An order
        with no target date is counted separately instead of as on time. This page only reads your orders; the only thing you can change here is the settings.
      </p>
    </section>
  );
}

const COLORS = { ontrack: '#2a78d6', atrisk: '#c47f00', miss: '#d03b3b' };

function VolumeChart({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.total));
  return (
    <div className="card-body">
      <div className="fc-legend">
        {[['ontrack', 'On track'], ['atrisk', 'At risk'], ['miss', 'Will miss']].map(([k, label]) => (
          <span key={k}><i style={{ background: COLORS[k] }} /> {label}</span>
        ))}
      </div>
      <div className="fc-chart" role="img" aria-label="Orders arriving per week, by status">
        {weeks.map((w) => (
          <div key={w.start} className="fc-col" title={`${short(w.start)} – ${short(w.end)}: ${w.total} order(s)`}>
            <div className="fc-total">{w.total || ''}</div>
            <div className="fc-stack" style={{ height: `${(w.total / max) * 100}%` }}>
              {['miss', 'atrisk', 'ontrack'].map((k) => (w[k] ? <span key={k} style={{ flex: w[k], background: COLORS[k] }} /> : null))}
            </div>
            <div className="fc-label">{short(w.start)}</div>
          </div>
        ))}
      </div>
      <p className="muted">Each bar is a week, by the order&apos;s <b>likely</b> arrival date. The colour is the comparison with the client&apos;s date.</p>
    </div>
  );
}

function ForecastTable({ rows, today }) {
  const [open, setOpen] = useState(null);
  if (!rows.length) return <div className="empty">No order matches this filter.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>PR / SO</th><th>Customer</th><th>Mode</th><th>Position now</th><th>Earliest</th><th>Likely</th><th>Latest</th><th>Client expects</th><th>Early / late</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open === r.o.prNo;
            return (
              <FragmentRow key={r.o.prNo} r={r} isOpen={isOpen} today={today} toggle={() => setOpen(isOpen ? null : r.o.prNo)} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ r, isOpen, toggle, today }) {
  const { o, f } = r;
  return (
    <>
      <tr tabIndex={0} aria-expanded={isOpen} onClick={toggle} onKeyDown={(e) => e.key === 'Enter' && toggle()}>
        <td data-label="PR / SO"><b>{o.soNo || 'No SO'}</b> <span className="chip">{o.prNo}</span><div className="muted">{o.itemName}{o.qty ? ` ×${o.qty}` : ''}</div></td>
        <td data-label="Customer">{o.customer || '—'}</td>
        <td data-label="Mode">{f.bucket}{f.assumedMode && <> <Pill tone="warn">mode assumed</Pill></>}</td>
        <td data-label="Position"><div>{f.position}</div><div className="muted">from {f.anchorLabel}</div></td>
        <td data-label="Earliest">{fmtDate(f.earliest)}</td>
        <td data-label="Likely"><b>{fmtDate(f.likely)}</b></td>
        <td data-label="Latest">{fmtDate(f.latest)}</td>
        <td data-label="Client expects">{o.target ? fmtDate(o.target) : <b className="pv-amber">no date</b>}</td>
        <td data-label="Early / late">
          {r.variance === null ? <span className="muted">—</span> : <b className={r.variance > 0 ? 'pv-red' : 'pv-green'}>{r.variance > 0 ? `+${r.variance}d late` : r.variance === 0 ? 'exactly' : `${-r.variance}d early`}</b>}
          {r.varianceWorst !== null && r.varianceWorst !== r.variance && <div className="muted">worst case {r.varianceWorst > 0 ? `+${r.varianceWorst}d` : r.varianceWorst === 0 ? 'exactly' : `${r.varianceWorst}d`}</div>}
        </td>
        <td data-label="Status"><Pill tone={r.sev.tone}>{r.sev.label}</Pill>{f.overdueModel && <div><Pill tone="bad">past its own estimate</Pill></div>}</td>
      </tr>
      {isOpen && (
        <tr className="fc-detail" style={{ cursor: 'default' }}>
          <td colSpan={10}>
            <div className="muted fc-cap">How this date was built</div>
            <div className="fc-legs">
              <span className="chip">{f.anchorLabel}</span>
              {f.legs.map((l, i) => (
                <span key={i} className="fc-leg"><span className="muted">+</span> <span className="chip chip-accent">{l.name} <b>{l.days[0] === l.days[1] ? l.days[0] : `${l.days[0]}–${l.days[1]}`}d</b></span></span>
              ))}
              <span className="muted">=</span> <span className="chip chip-dark">{short(f.earliest)} – {short(f.latest)}</span>
            </div>
            <div className="kv-grid fc-facts">
              <div><span className="muted">Item:</span> {o.itemName || '—'}</div>
              <div><span className="muted">SKU / Qty:</span> <span className="mono">{o.sku || '—'}</span> {o.qty ? `(${o.qty})` : ''}</div>
              <div><span className="muted">Supplier:</span> {o.supplier || '—'}</div>
              <div><span className="muted">Sourcing:</span> {o.sourcing || '—'}</div>
              <div><span className="muted">Shipment:</span> {o.shipNo || '—'} {o.shipStatus ? `(${o.shipStatus})` : ''}</div>
              <div><span className="muted">Date shipped:</span> {fmtDate(o.dateShipped)}</div>
              <div><span className="muted">Fulfillment stage:</span> {o.stage || '—'}</div>
              <div><span className="muted">Prep started:</span> {fmtDate(o.prepStart)}</div>
              <div><span className="muted">Delivery type:</span> {o.deliveryType || '—'}</div>
              <div><span className="muted">Days from today:</span> {f.likely ? daysBetween(today, f.likely) : '—'}</div>
            </div>
            {o.shipEta && (
              <p className="muted">For reference, the shipment&apos;s own Estimated Warehouse Arrival says {fmtDate(o.shipEta)}. It is worked out by a different rule, so the two can legitimately disagree.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// The live widget shows these read-only (they come from a Creator form). Here there is no such form, so they are editable.
function SettingsPanel({ settings, measured, saved }) {
  const { act } = useStore();
  const [draft, setDraft] = useState(() => ({ ...settings }));
  const groups = [...new Set(SETTING_DEFS.map((s) => s.group))];
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = Object.keys(DEFAULTS).some((k) => String(draft[k]) !== String(settings[k]));
  return (
    <div className="card-body">
      <p className="muted">{saved ? 'These are your saved settings.' : 'These are the built-in defaults.'} Every leg is a range of days, so each order gets a window instead of one date.</p>
      <div className="fc-groups">
        {groups.map((g) => (
          <fieldset key={g} className="fc-group">
            <legend>{g}</legend>
            {SETTING_DEFS.filter((s) => s.group === g).map((s) => (
              <label key={s.key} className="fc-field">{s.label}
                <input type="number" min="0" aria-label={`${g} ${s.label}`} value={draft[s.key]} onChange={(e) => set(s.key, e.target.value)} />
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {measured.prepMedian !== null && (
        <p className="notice">Measured from {measured.prepCount} order(s): preparation actually takes a median of <b>{measured.prepMedian} day(s)</b>. The setting says {settings.fc_prep_min}–{settings.fc_prep_max}.</p>
      )}
      <div className="fc-toggles">
        {TOGGLE_DEFS.map((t) => (
          <label key={t.key} className="check-field"><input type="checkbox" checked={!!Number(draft[t.key])} onChange={(e) => set(t.key, e.target.checked ? 1 : 0)} /> <span><b>{t.label}</b><span className="hint block">{t.help}</span></span></label>
        ))}
        <label className="fc-field">{HORIZON_DEF.label}
          <input type="number" min="1" max="52" aria-label={HORIZON_DEF.label} value={draft[HORIZON_DEF.key]} onChange={(e) => set(HORIZON_DEF.key, e.target.value)} />
        </label>
      </div>
      <div className="head-actions">
        <button className="btn btn-primary" disabled={!dirty} onClick={() => act('forecastSettingsSave', { values: draft })}>Save settings</button>
        <button className="btn" onClick={() => { if (act('forecastSettingsReset', {})) setDraft({ ...DEFAULTS }); }}>Reset to defaults</button>
      </div>
      <p className="muted">
        Note: three different sea-freight lead times exist in this system (the PR timeline, the shipment arrival estimate, and this forecast). They are kept separate on purpose and deciding which one wins is still open.
      </p>
    </div>
  );
}
