// Delivery sorting engine (spec: HomeCartel v1.4, 05 Shared Engines / 01 Sorting Engine; Delivery 02 §2 "The
// delivery sorter"). Same four categories and the same sort key as Fulfillment (server/modules/fulfillment/sorter.mjs):
// broken > late > at_risk > on_time, blocked kept apart. Oldest Order Date first inside a category.
//
// There is no `delivery_jobs` table yet (see "Delivery vs Spec v1.4 - para sa review.md" §1: this module is still a
// 1:1 port of the old Zoho system). This reads and writes the fields that already exist on Service_Appointment_Form
// instead of waiting for that migration — the same "overlay onto the existing form" approach Procurement and
// Fulfillment used for their own spec v1.4 work.
//
// Deliberately NOT done here (left for later steps of the Delivery v1.4 roadmap):
//   - the capacity cut line / "Suggested Release" (needs the team-day scheduling engine, Delivery 02 §1-4)
//   - the anti-burial aging alerts (05/01 §5) — Fulfillment's own sorter.mjs does not have these yet either
//   - "Broken" sub-rules the current schema cannot see: a failed/partial job's specific reason (damaged_in_transit,
//     refused) has no field; a Dispatch-stage exception requeue (Rescheduled_Via_Exception) is used as the nearest
//     real signal of "redo of a failed job" instead.
import { blank, truthy } from '../../workflows/deluge.mjs';
import { policyReader, SA, day } from './scheduling.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const DONE_STATUSES = new Set(['Completed', 'Failed']);
const OPEN_STATUS = (status) => !DONE_STATUSES.has(text(status));

// Calendar-day slack: target minus today. (Mirrors Fulfillment's own sorter.mjs; a later step can subtract work
// days still needed once the scheduling engine's own capacity calculator feeds this.)
function daysUntil(dateStr, now) {
  if (blank(dateStr)) return null;
  const d = new Date(`${day(dateStr)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(`${day(now.toISOString())}T00:00:00Z`);
  return Math.round((d - today) / 86400000);
}

export function effectiveTarget(sa, policy) {
  if (!blank(sa.Requested_Delivery_Date)) return sa.Requested_Delivery_Date;
  if (blank(sa.Order_Date)) return null;
  const days = Number(policy('default_promise_days')) || 25;
  const d = new Date(`${day(sa.Order_Date)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Spec: "linked to an open RR, a Sales Return redelivery, or a failed/partial job with a fault reason" (05/01 §1).
// This schema has no RR link, so: a Complaint (RMA-driven redelivery already has RMA/Original_SO set by Sales
// Returns, 04/07), a Dispatch-stage exception requeue (the nearest existing signal of "this is a redo of a
// failed job"), or a redelivery the general FR-R2 pattern (failure-redelivery.mjs) flagged Broken_Redelivery —
// damaged-in-transit or a refused job — counts as broken.
function isBroken(sa) {
  return !blank(sa.Complaint) || !blank(sa.Complaint_ID) || !blank(sa.RMA) || !blank(sa.Original_SO)
    || !blank(sa.Rescheduled_Via_Exception) || truthy(sa.Broken_Redelivery);
}

// Spec: "Blocked when: site checklist incomplete, permit pending, payment not cleared, no contact, open exception"
// (Delivery 02 §2). The site checklist and permits do not exist in this schema yet (review §1); payment belongs to
// Books, which this module does not call for appointments. Only the two blocked reasons the schema can actually see:
function blockedCheck(sa) {
  if (text(sa.Exception_Status) === 'Flagged') return 'Open exception';
  if (blank(sa.Contact) && blank(sa.Email)) return 'No contact on file';
  const hasAddress = !blank(sa.Customer_Address) || !blank(sa.Address);
  if (!hasAddress) return 'Missing delivery address';
  return null;
}

export function categorize(sa, { now = new Date(), policy = () => null } = {}) {
  const blockedReason = blockedCheck(sa);
  if (blockedReason) return { category: 'blocked', blockedReason, priorityReason: blockedReason };

  const target = effectiveTarget(sa, policy);
  const noTargetSet = blank(sa.Requested_Delivery_Date);
  const slack = daysUntil(target, now);

  if (isBroken(sa)) {
    return { category: 'broken', blockedReason: null, priorityReason: noTargetSet ? 'Complaint/return, no target set' : 'Complaint, return or redo of a failed job' };
  }
  if (slack !== null && slack < 0) {
    return { category: 'late', blockedReason: null, priorityReason: `${Math.abs(slack)} day(s) past target` };
  }
  const forecastMisses = !blank(sa.Forecast_Delivery) && !blank(target) && sa.Forecast_Delivery > target;
  const atRiskSlackDays = Number(policy('at_risk_slack_days')) || 3;
  if (forecastMisses || (slack !== null && slack <= atRiskSlackDays)) {
    return { category: 'at_risk', blockedReason: null, priorityReason: forecastMisses ? 'Forecast misses target' : `${slack} day(s) of slack left` };
  }
  return { category: 'on_time', blockedReason: null, priorityReason: noTargetSet ? 'On time (no target set)' : 'On time' };
}

// "SO-3" / "SO-20": compared as the number after the last run of digits, like Fulfillment's own sorter.mjs — lexical
// order would put "SO-20" before "SO-3".
function recordNumberKey(soNo) {
  const m = /(\d+)\s*$/.exec(text(soNo));
  return m ? Number(m[1]) : Infinity;
}

function compareKey(e) {
  const urgent = truthy(e.sa.Priority) ? 0 : 1; // the one existing manual-priority-shaped flag (M1 is not built yet, see review §1)
  const created = text(e.sa.Order_Date) || '9999-99-99';
  const target = text(e.sa.Requested_Delivery_Date) || '9999-99-99';
  const soNo = text(e.sa.Sales_Order_Display) || text(e.sa.Sales_Order);
  return [urgent, created, target, recordNumberKey(soNo), soNo];
}

function compare(a, b) {
  const ka = compareKey(a), kb = compareKey(b);
  for (let i = 0; i < ka.length; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
  return 0;
}

// SE-3: category comes first (broken, then late, then at_risk, then on_time — 05/01 §1's own numbered order),
// oldest Order Date inside each category second. Blocked is numbered on its own, starting back at 1, same as
// Procurement's sorting.mjs `rank()` — never mixed into the main queue's numbers.
const CATEGORY_ORDER = ['broken', 'late', 'at_risk', 'on_time'];
export function rank(entries) {
  const out = [];
  let n = 0;
  for (const cat of [...CATEGORY_ORDER, 'blocked']) {
    const list = entries.filter((e) => e.category === cat).sort(compare);
    if (cat === 'blocked') n = 0;
    for (const e of list) out.push({ ...e, queueRank: ++n });
  }
  return out;
}

// `overrides` ({ key: value }) is for previews only (Control Panel "what would this setting do"): see policyReader.
async function scoreAllOpenJobs(store, overrides = {}) {
  const [sas, policy] = await Promise.all([
    store.find(SA, (r) => OPEN_STATUS(r.Appointment_Status)),
    policyReader(store, overrides),
  ]);
  const now = new Date();
  const entries = sas.map((sa) => ({ sa, ...categorize(sa, { now, policy }) }));
  return rank(entries);
}

// Read-only: the categories every open job WOULD get with these trial settings. Writes nothing.
export const previewCategories = (store, overrides) => scoreAllOpenJobs(store, overrides);

// Writes the scored result back onto Service_Appointment_Form. A widget write to these fields is dropped (see the
// spec-forms overlay); only this function may set them.
export async function rescoreAll(store) {
  const scored = await scoreAllOpenJobs(store);
  const stamp = new Date().toISOString();
  let changed = 0;
  for (const e of scored) {
    const want = { Category: e.category, Blocked_Reason: e.blockedReason || '', Queue_Rank: String(e.queueRank), Priority_Reason: e.priorityReason, Suggested_Action: '' };
    const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => text(v) !== text(e.sa[k])));
    if (!Object.keys(diff).length) continue;
    await store.updateRecord(SA, e.sa.ID, { ...diff, Scored_At: stamp }, { byForm: true });
    changed++;
  }
  return { scored: scored.length, changed };
}

// Ranks are global (one job's change can shift everyone's rank), so this always rescores everything; the name just
// documents intent at the call site — same pattern as Fulfillment's rescoreOne.
export async function rescoreOne(store, _appointmentId) {
  return rescoreAll(store);
}
