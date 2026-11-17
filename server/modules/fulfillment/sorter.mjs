// Fulfillment sorting engine (spec: HomeCartel v1.4, 05 Shared Engines / 01 Sorting Engine; this module covers Fulfillment only).
// categorize(): what kind of attention a package needs. rankAndCutLine(): oldest-SO-first order plus today's cut line.
// Pure where possible: categorize() takes everything it needs as arguments so it is trivially testable and so a second run
// on identical input always gives the identical answer (determinism is an explicit acceptance requirement).
import { blank } from '../../workflows/deluge.mjs';
import { needsPaymentApproval } from './workflows.mjs';
import { zohoNow } from '../../criteria.mjs';
import { policyReader } from '../delivery-management/scheduling.mjs';

const SOF_NAME = 'Sales_Order_Fulfillment';
const OPEN_STAGE = (stage) => stage !== 'For Delivery';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const OPEN_EXCEPTION_STATUSES = new Set(['Pending', 'In Rework']);
const BROKEN_ORDER_TYPES = new Set(['Complaint', 'Replacement']);

// Calendar-day slack: target minus today. (The full spec formula also subtracts work days still needed; that
// refinement needs the manpower calculator, which is a later slice — see the design doc's §3.)
function daysUntil(dateStr, now) {
  if (blank(dateStr)) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((d - today) / 86400000);
}

function effectiveTarget(sof, policy) {
  if (!blank(sof.target_delivery_date)) return sof.target_delivery_date;
  if (blank(sof.SO_Created_Date)) return null;
  const days = Number(policy('default_promise_days')) || 25;
  const d = new Date(`${String(sof.SO_Created_Date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function blockedCheck(sof, gates, openExceptions) {
  const so = text(sof.SO_No);
  const paymentBlocked = gates.some((g) => text(g.sales_order_number) === so && needsPaymentApproval(g));
  if (paymentBlocked) return 'Payment not cleared';
  const exceptionOpen = openExceptions.some((e) => text(e.Sales_Order) === so && OPEN_EXCEPTION_STATUSES.has(text(e.Status)));
  if (exceptionOpen) return 'Open exception';
  if (blank(sof.Shipping_Address) && blank(sof.Billing_Address)) return 'Missing delivery address';
  return null;
}

export function categorize(sof, { gates = [], openExceptions = [], now = new Date(), policy = () => null } = {}) {
  const blockedReason = blockedCheck(sof, gates, openExceptions);
  if (blockedReason) return { category: 'blocked', blockedReason, priorityReason: blockedReason };

  const isBroken = BROKEN_ORDER_TYPES.has(text(sof.order_type));
  const target = effectiveTarget(sof, policy);
  const noTargetSet = blank(sof.target_delivery_date);
  const slack = daysUntil(target, now);

  if (isBroken) {
    return { category: 'broken', blockedReason: null, priorityReason: noTargetSet ? 'Replacement, no target set' : 'Replacement / complaint' };
  }
  if (slack !== null && slack < 0) {
    return { category: 'late', blockedReason: null, priorityReason: `${Math.abs(slack)} day(s) past target` };
  }
  const forecastMisses = !blank(sof.Forecast_Delivery) && !blank(target) && sof.Forecast_Delivery > target;
  const atRiskSlackDays = Number(policy('at_risk_slack_days')) || 3;
  if (forecastMisses || (slack !== null && slack <= atRiskSlackDays)) {
    return { category: 'at_risk', blockedReason: null, priorityReason: forecastMisses ? 'Forecast misses target' : `${slack} day(s) of slack left` };
  }
  return { category: 'on_time', blockedReason: null, priorityReason: noTargetSet ? 'On time (no target set)' : 'On time' };
}

const toNum = (v) => { const n = parseFloat(text(v)); return Number.isFinite(n) ? n : 0; };

// Line-quantity sum stand-in for box count (real box count is a later slice; this matches the spec's own
// "estimated" fallback for an uncounted package rather than inventing different behavior).
function estimatedBoxes(sof) {
  return (sof.Item_Details1 || []).reduce((n, row) => n + toNum(row.Quantity), 0);
}

// "SO-3" / "SO-20": compared as the number after the last run of digits, not lexicographically (lexical order
// would put "SO-20" before "SO-3"). A record number with no digits at all sorts after every one that has them.
function recordNumberKey(soNo) {
  const m = /(\d+)\s*$/.exec(text(soNo));
  return m ? Number(m[1]) : Infinity;
}

function compareKey(e) {
  // Urgent is always false this slice (no urgency_requests table yet) — the slot is first so Slice 5 only
  // has to fill in a real value later, not change the comparator shape.
  const urgent = 0;
  const created = text(e.sof.SO_Created_Date) || '9999-99-99';
  const target = text(e.sof.target_delivery_date) || '9999-99-99';
  return [urgent, created, target, recordNumberKey(e.sof.SO_No), text(e.sof.SO_No)];
}

function compare(a, b) {
  const ka = compareKey(a), kb = compareKey(b);
  for (let i = 0; i < ka.length; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
  return 0;
}

export function rankAndCutLine(entries, { policy = () => null } = {}) {
  const sorted = entries.slice().sort(compare);
  const cutLine = Number(policy('fulfillment_cut_line_boxes')) || 50;
  let used = 0;
  return sorted.map((e, i) => {
    const boxes = estimatedBoxes(e.sof);
    const fitsBefore = used < cutLine;
    used += boxes;
    return { ...e, queueRank: i + 1, suggestedRelease: fitsBefore };
  });
}

async function scoreAllOpenPackages(store) {
  const [sofs, gates, exceptions, policy] = await Promise.all([
    store.find(SOF_NAME, (r) => OPEN_STAGE(r.Fulfillment_Stage)),
    store.find('Sales_Order_Readiness_Gate'),
    store.find('Exception_Control1'),
    policyReader(store),
  ]);
  const openExceptions = exceptions.filter((e) => OPEN_EXCEPTION_STATUSES.has(text(e.Status)));
  const now = new Date();
  const entries = sofs.map((sof) => ({ sof, ...categorize(sof, { gates, openExceptions, now, policy }) }));
  return rankAndCutLine(entries, { policy });
}

// Writes the scored result back onto Sales_Order_Fulfillment. Suggested_Action is left blank this slice: the
// spec's `suggested_actions` lookup table (Admin-editable module/category/condition -> text) is shared
// infrastructure beyond this slice's scope, and hardcoding English strings here would just be thrown away once
// that table exists.
export async function rescoreAll(store) {
  const scored = await scoreAllOpenPackages(store);
  const stamp = zohoNow();
  for (const e of scored) {
    await store.updateRecord(SOF_NAME, e.sof.ID, {
      Category: e.category, Blocked_Reason: e.blockedReason || '', Queue_Rank: String(e.queueRank),
      Priority_Reason: e.priorityReason, Suggested_Action: '', Suggested_Release: e.suggestedRelease, Scored_At: stamp,
    }, { byForm: true });
  }
  return { scored: scored.length };
}

// Re-score everything (ranks are global, so a single-SO change can shift everyone's rank) — this is a thin
// name for callers who only know which SO changed; it does not skip work, it documents intent at the call site.
export async function rescoreOne(store, _soNo) {
  return rescoreAll(store);
}
