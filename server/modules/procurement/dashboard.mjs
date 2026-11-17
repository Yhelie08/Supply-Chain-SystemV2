// The Procurement Dashboard of the HomeCartel spec v1.4 (02 Procurement / 08): one custom API, get_procurement_dashboard, that works out every
// block, and for every number the link (page + query) of the list behind it. Nothing is stored: it is read from the records each time.
//   Today          Act now, Tell the customer, Broken, decisions waiting, PRs needing a manual quote, POs not acknowledged
//   Born-late rate % of PO lines raised with a shortfall at the gate, weekly (PO-R3)
//   On-time arrival % of shipment lines that arrived by the PLANNED arrival (recomputed from the PO date and the settings, so a supplier's
//                  delay report, which moves the plan, does not hide a late arrival), overall and by supplier
//   Scorecard      per supplier: lead time planned vs actual, late starts, ladder rungs fired, reporting lag, damage rate (fault = supplier)
//   Pipeline       lines by stage with the oldest Order Date of each
//   Replacements   open RRs, oldest first, and the rework rate
import { blank, toNum, parseDate, ymd, addDays, dayDiff, todayDate } from '../../workflows/deluge.mjs';
import { loadSettings, plannedChain, supplierDaysFrom } from './plan.mjs';
import { effectiveStage } from './ship-track.mjs';
import { get_born_late_rate } from './po-spec.mjs';
import { get_rr_report } from './rr-spec.mjs';
import { portalOf } from '../../workflows/suppliers.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const day = (v) => text(v).slice(0, 10);
const okBody = (message, data) => ({ code: 3000, message, data });
const link = (page, query = {}) => ({ page, query: Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') });
const supplierName = (n) => portalOf(n)?.name ?? (text(n).trim() || 'unknown');
const lineCount = (s) => Math.max(1, (s.PO_Shipments || []).length);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const DONE_RR = ['Closed', 'Completed', 'Cancelled'];
const STAGE_GROUP = { production: 'production', shipped_out: 'shipout', arrived_port: 'transit', customs_cleared: 'transit', arrived_warehouse: 'receive' };

export async function get_procurement_dashboard(_payload, store) {
  const today = todayDate();
  const settings = await loadSettings(store);
  const ships = await store.find('Shipments');
  const supplierRows = await store.find('Suppliers');
  const live = ships.filter((s) => effectiveStage(s) !== 'received');

  // ----- Today -----
  const cat = (c) => live.filter((s) => text(s.Category) === c);
  const pending = (await store.find('Approval_Queue')).filter((i) => text(i.Status) === 'pending');
  const kind = (k) => pending.filter((i) => text(i.Kind) === k).length;
  const manualQuote = (await store.find('Purchase_Request1')).filter((p) => text(p.Pricing_Status) === 'needs_manual_quote' && ['open', 'ready_for_po', ''].includes(text(p.Pr_State))).length;
  const notAcked = (await store.find('Purchase_Order')).filter((p) => text(p.Po_State) === 'sent').length;
  const top = [...cat('broken'), ...cat('act_now')].sort((a, b) => toNum(a.Queue_Rank || 1e9) - toNum(b.Queue_Rank || 1e9)).slice(0, 5)
    .map((s) => ({ id: String(s.ID), no: text(s.Shipment_No), supplier: supplierName(s.Supplier), reason: text(s.Priority_Reason), action: text(s.Suggested_Action) }));
  const todayBlock = {
    act_now: { count: cat('act_now').length, link: link('Shipments1', { cat: 'act_now' }) },
    tell_customer: { count: cat('tell_customer').length, link: link('Shipments1', { cat: 'tell_customer' }) },
    broken: { count: cat('broken').length, link: link('Shipments1', { cat: 'broken' }) },
    decisions: { count: pending.length, air_upgrade: kind('air_upgrade'), ladder_day3: kind('ladder_day3'), forecast_promise_change: kind('forecast_promise_change'), link: link('Decisions') },
    manual_quote: { count: manualQuote, link: link('Purchase_Request', { pricing: 'needs_manual_quote' }) },
    pos_not_acknowledged: { count: notAcked, link: link('Purchase_Order1', { status: 'sent' }) },
    top,
  };

  // ----- Born-late rate -----
  const born = (await get_born_late_rate({ weeks: 8 }, store)).data;
  const bornBlock = { ...born, link: link('Purchase_Order1', { born: 'late' }) };

  // ----- On-time arrival and the scorecard -----
  const per = new Map(); // supplier -> numbers
  const slot = (name) => { if (!per.has(name)) per.set(name, { supplier: name, lines: 0, on_time: 0, planned: [], actual: [], late_starts: 0, rungs: 0, lag: [], damage_qty: 0, received_qty: 0 }); return per.get(name); };
  const byShipId = new Map(ships.map((s) => [String(s.ID), s]));
  for (const s of ships) {
    const p = slot(supplierName(s.Supplier));
    const poDate = parseDate(day(s.PO_Date));
    // the plan as it was made (without any later promise of the supplier)
    const eff = { ...settings, ...supplierDaysFrom(supplierRows, s.Supplier) };
    const plan = poDate ? plannedChain(eff, { poDate, productionDays: s.Required_Days_Lead, mode: text(s.Shipment_Mode) || 'LCL' }) : null;
    const arrived = parseDate(day(s.Arrived_Port_At)) || parseDate(day(s.Arrived_Warehouse_At));
    if (plan && arrived) {
      const n = lineCount(s);
      p.lines += n; if (arrived <= plan.arrival) p.on_time += n;
      p.planned.push(dayDiff(plan.arrival, poDate)); p.actual.push(dayDiff(arrived, poDate));
    }
    if (poDate) {
      const due = addDays(poDate, 1);
      const started = parseDate(day(s.Production_Started_At));
      if (started ? started > due : (effectiveStage(s) === 'production' && today > due)) p.late_starts++;
    }
  }
  for (const l of await store.find('Ladder_Events')) { const s = byShipId.get(text(l.Record_Id)); if (s) slot(supplierName(s.Supplier)).rungs++; }
  for (const e of await store.find('Stage_Events')) {
    if (e.Record_Type !== 'shipment' || text(e.Source) !== 'supplier') continue;
    const s = byShipId.get(text(e.Record_Id)); const a = parseDate(day(e.Occurred_At)), b = parseDate(day(e.Reported_At));
    if (s && a && b) slot(supplierName(s.Supplier)).lag.push(Math.max(0, dayDiff(b, a)));
  }
  for (const r of await store.find('Receiving')) slot(supplierName(r.Supplier)).received_qty += toNum(r.Total_Expected_Qty);
  for (const x of await store.find('Exceptions')) {
    if (text(x.Fault_Origin) !== 'supplier') continue;
    const sup = (x.Product_Context1 || []).map((c) => text(c.Supplier)).find(Boolean);
    slot(supplierName(sup)).damage_qty += toNum(x.Affected_Qty);
  }
  const rows = [...per.values()].filter((p) => p.supplier !== 'unknown' || p.lines || p.rungs).sort((a, b) => a.supplier.localeCompare(b.supplier));
  const lines = rows.reduce((a, p) => a + p.lines, 0), onTime = rows.reduce((a, p) => a + p.on_time, 0);
  const onTimeBlock = { rate: pct(onTime, lines), lines, on_time: onTime, by_supplier: rows.filter((p) => p.lines).map((p) => ({ supplier: p.supplier, lines: p.lines, on_time: p.on_time, rate: pct(p.on_time, p.lines) })), link: link('Shipments1', { stage: 'receive' }) };
  const scorecard = rows.map((p) => ({
    supplier: p.supplier, lead_planned_days: avg(p.planned), lead_actual_days: avg(p.actual), late_starts: p.late_starts, ladder_rungs: p.rungs,
    reporting_lag_days: avg(p.lag), damage_rate_supplier_fault: pct(p.damage_qty, p.received_qty), damage_qty: p.damage_qty, received_qty: p.received_qty,
  }));

  // ----- Pipeline -----
  const pipe = { production: [], shipout: [], transit: [], receive: [] };
  for (const s of live) { const g = STAGE_GROUP[effectiveStage(s)]; if (g) pipe[g].push(s); }
  const pipeline = Object.entries(pipe).map(([stage, list]) => ({
    stage, lines: list.reduce((a, s) => a + lineCount(s), 0), shipments: list.length,
    oldest_order_date: list.map((s) => day(s.Order_Date)).filter(Boolean).sort()[0] ?? '', link: link('Shipments1', { stage }),
  }));

  // ----- Replacements -----
  const openRr = (await store.find('Replacement_Request')).filter((r) => !DONE_RR.includes(text(r.RR_Status)))
    .sort((a, b) => (day(a.Order_Date) || '9999').localeCompare(day(b.Order_Date) || '9999') || text(a.RR_No).localeCompare(text(b.RR_No)));
  const rework = (await get_rr_report({}, store)).data.rework;
  const replacements = {
    open: openRr.length, rework, link: link('Replacement_Request1'),
    oldest: openRr.slice(0, 5).map((r) => ({ no: text(r.RR_No), supplier: text(r.RR_Supplier), order_date: day(r.Order_Date), target: day(r.Target_Delivery), forecast: day(r.Rr_Forecast_Pickable) })),
  };

  return okBody('Procurement dashboard.', { today: todayBlock, born_late: bornBlock, on_time: onTimeBlock, scorecard, pipeline, replacements, as_of: ymd(today) });
}
