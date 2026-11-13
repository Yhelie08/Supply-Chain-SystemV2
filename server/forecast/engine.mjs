// The forecast ladder, ported from zoho-export/parsed/functions/fcStampBySoNo.dg (sections 1, 5 and 6) as ONE pure function.
// No database here: the callers (stamp.mjs for one SO, and the daily schedule) gather the facts and pass them in, so the
// two ways of working out a forecast cannot drift apart (in Zoho the schedule carries a text copy of this ladder and a
// separate script checks that the two stay identical).
//
// Given where an order is (stage, stock or pre-order, shipment mode, sourcing, when the PR was added, when prep started,
// when it shipped, the client's target date) it answers: the forecast delivery date, a window text and a status.
//
// Quirks kept ("mirrors Zoho"; to be confirmed against Zoho Development, see the comparison step of the plan):
//  - Precedence in the Deluge test `reAnchor && stage == "Order Readiness" || stage == "Picking" || ...`: Picking, Pack,
//    Quality Checking and Crate are taken as prep stages even when re-anchoring is off; only "Order Readiness" and
//    "For Delivery" need the switch.
//  - The middle date is `earliest + round(span / 2)`; Deluge `.round(0)` is taken as round-half-up.
//  - A past-due estimate keeps its dates clamped to today and says "lampas na sa tantiya" in the window.
import { addDays, dayDiff } from '../workflows/deluge.mjs';

export const DEFAULT_SETTINGS = Object.freeze({
  airTMin: 5, airTMax: 7, airCMin: 2, airCMax: 3,
  lclTMin: 35, lclTMax: 60, lclCMin: 7, lclCMax: 10,
  fclTMin: 35, fclTMax: 60, fclCMin: 7, fclCMax: 10,
  locTMin: 0, locTMax: 0, locCMin: 0, locCMax: 0,
  prepMin: 7, prepMax: 7, delMin: 0, delMax: 0,
  reAnchor: true, addSupLead: false,
});

const blank = (v) => v == null || v === '';
// Deluge `.toLong()` on a number or numeric text; the first Forecast_Settings record wins, an empty field keeps the default.
const long = (v, fallback) => (blank(v) || Number.isNaN(Number(v)) ? fallback : Math.trunc(Number(v)));

// Section 1: the settings record (or none) -> the numbers the ladder uses.
export function settingsFrom(record) {
  const s = { ...DEFAULT_SETTINGS };
  if (!record) return s;
  const d = DEFAULT_SETTINGS;
  s.airTMin = long(record.Air_Transit_Min, d.airTMin); s.airTMax = long(record.Air_Transit_Max, d.airTMax);
  s.airCMin = long(record.Air_Customs_to_WH_Min, d.airCMin); s.airCMax = long(record.Air_Customs_to_WH_Max, d.airCMax);
  s.lclTMin = long(record.LCL_Transit_Min, d.lclTMin); s.lclTMax = long(record.LCL_Transit_Max, d.lclTMax);
  s.lclCMin = long(record.LCL_Customs_to_WH_Min, d.lclCMin); s.lclCMax = long(record.LCL_Customs_to_WH_Max, d.lclCMax);
  s.fclTMin = long(record.FCL_Transit_Min, d.fclTMin); s.fclTMax = long(record.FCL_Transit_Max, d.fclTMax);
  s.fclCMin = long(record.FCL_Customs_to_WH_Min, d.fclCMin); s.fclCMax = long(record.FCL_Customs_to_WH_Max, d.fclCMax);
  if (!blank(record.Local_Transit_Days)) s.locTMin = s.locTMax = long(record.Local_Transit_Days, 0);
  if (!blank(record.Local_Customs_Days)) s.locCMin = s.locCMax = long(record.Local_Customs_Days, 0);
  if (!blank(record.Prep_Days_Thru_QC)) s.prepMin = s.prepMax = long(record.Prep_Days_Thru_QC, d.prepMin);
  if (!blank(record.Delivery_Days)) s.delMin = s.delMax = long(record.Delivery_Days, 0);
  // With a settings record present the two switches are read as written: only "true" turns them on.
  s.reAnchor = String(record.Re_anchor_on_Latest_Real_Event ?? '').toLowerCase() === 'true';
  s.addSupLead = String(record.Include_Supplier_Lead_Time ?? '').toLowerCase() === 'true';
  return s;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');
const mmmDd = (d) => `${MONTHS[d.getMonth()]} ${pad2(d.getDate())}`;
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Deluge daysBetween as the script uses it: always the size of the gap.
const gap = (a, b) => Math.abs(dayDiff(b, a));

// The transit and customs days to use: Local sourcing first, then the shipment mode (Air, FCL), else sea (LCL, with "LCL?" when
// the mode is not exactly LCL). Shared with the purchase-request version of the ladder (purchase-request.mjs).
export function bucketOf(s, sourcing, modeVal) {
  const modeKey = String(modeVal ?? '').toUpperCase();
  const srcKey = String(sourcing ?? '').toUpperCase();
  if (srcKey === 'LOCAL') return { tMin: s.locTMin, tMax: s.locTMax, cMin: s.locCMin, cMax: s.locCMax, bucket: 'Local' };
  if (modeKey.includes('AIR')) return { tMin: s.airTMin, tMax: s.airTMax, cMin: s.airCMin, cMax: s.airCMax, bucket: 'Air' };
  if (modeKey === 'FCL') return { tMin: s.fclTMin, tMax: s.fclTMax, cMin: s.fclCMin, cMax: s.fclCMax, bucket: 'FCL' };
  return { tMin: s.lclTMin, tMax: s.lclTMax, cMin: s.lclCMin, cMax: s.lclCMax, bucket: modeKey === 'LCL' ? 'LCL' : 'LCL?' };
}

export const PREP_STAGES = ['Order Readiness', 'Picking', 'Pack', 'Quality Checking', 'Crate'];

/**
 * @param {object} i
 *   today        Date (local midnight)
 *   settings     from settingsFrom()
 *   stage        Sales_Order_Fulfillment.Fulfillment_Stage ('' when none)
 *   stockOnHand  true unless the order type contains "PRE ORDER"
 *   modeVal      shipment mode text; sourcing  Sourcing_Type text; supLead  Required_Days_Lead (number)
 *   prAdded      Date | null (the anchor of the procurement leg); prepStart Date | null; prepFound boolean
 *   dateShipped  Date | null; shipStatus text
 *   clientTarget Date | null (null = the client gave no date)
 * @returns {{skip: true} | {skip: false, delivery, window, status, earliest, latest, position, bucket}}
 */
export function computeForecast(i) {
  const { today, settings: s } = i;
  const { tMin, tMax, cMin, cMax, bucket } = bucketOf(s, i.sourcing, i.modeVal);

  let anchor = today; let anchorFound = false; let sumMin = 0; let sumMax = 0; let position = '';
  const stage = i.stage ?? '';
  if (s.reAnchor && stage === 'For Delivery') {
    anchorFound = true; sumMin = s.delMin; sumMax = s.delMax; position = 'Ready';
  } else if ((s.reAnchor && stage === 'Order Readiness') || ['Picking', 'Pack', 'Quality Checking', 'Crate'].includes(stage)) {
    anchorFound = true;
    const used = i.prepFound && i.prepStart ? gap(i.prepStart, today) : 0;
    const leftMin = Math.max(0, s.prepMin - used);
    const leftMax = Math.max(0, s.prepMax - used);
    sumMin = leftMin + s.delMin; sumMax = leftMax + s.delMax; position = stage;
  } else if (i.stockOnHand) {
    anchorFound = true; sumMin = s.prepMin + s.delMin; sumMax = s.prepMax + s.delMax; position = 'Stock on hand';
  } else if (s.reAnchor && i.shipStatus === 'Delivered') {
    anchorFound = true; sumMin = s.prepMin + s.delMin; sumMax = s.prepMax + s.delMax; position = 'At WH';
  } else if (s.reAnchor && i.dateShipped) {
    anchor = i.dateShipped; anchorFound = true;
    sumMin = tMin + cMin + s.prepMin + s.delMin; sumMax = tMax + cMax + s.prepMax + s.delMax; position = 'In transit';
  } else {
    if (i.prAdded) { anchor = i.prAdded; anchorFound = true; }
    sumMin = tMin + cMin + s.prepMin + s.delMin; sumMax = tMax + cMax + s.prepMax + s.delMax;
    if (s.addSupLead) { sumMin += Number(i.supLead) || 0; sumMax += Number(i.supLead) || 0; }
    position = 'Procurement';
  }
  // Better a blank than a null that wipes a date already stamped.
  if (!anchorFound) return { skip: true };

  return finish({ today, anchor, sumMin, sumMax, bucket, position, clientTarget: i.clientTarget ?? null, variance: true });
}

// From the anchor and the day counts to the answer: the clamped window, the middle date, the text and the status. Shared with
// the purchase-request version, which has no "vs client" text (variance: false).
export function finish({ today, anchor, sumMin, sumMax, bucket, position, clientTarget, variance }) {
  let earliest = addDays(anchor, sumMin);
  let latest = addDays(anchor, sumMax);
  const pastIts = latest < today;
  if (earliest < today) earliest = today;
  if (latest < today) latest = today;
  const span = gap(earliest, latest);
  const fcDate = addDays(earliest, Math.round(span / 2));
  let window = `${mmmDd(earliest)} - ${mmmDd(latest)}, ${latest.getFullYear()} | ${bucket} | ${position}`;
  if (pastIts) window += ' | lampas na sa tantiya';

  const target = clientTarget ?? null;
  let status;
  if (!target) status = 'No Client Date';
  else if (today > target) status = 'Overdue';
  else if (latest <= target) status = 'On Track';
  else if (earliest <= target) status = 'At Risk';
  else status = 'Will Miss';
  if (target && variance) {
    let varDays = gap(target, fcDate);
    if (fcDate < target) varDays = -varDays;
    window += varDays > 0 ? ` | +${varDays}d vs client` : varDays < 0 ? ` | ${-varDays}d early` : ' | sakto sa client';
  }
  return { skip: false, delivery: ymd(fcDate), window, status, earliest: ymd(earliest), latest: ymd(latest), position, bucket };
}
