// The catalogue of Procurement settings (spec 05 Shared Engines / 08 Control Panel, CP-R1, CP-R2).
// Every number the Procurement code reads is listed here with a plain label, a default, limits and one sentence saying what it
// affects. Code holds the formulas only. A changed value is a row in Procurement_Settings (no row = the default); every change is
// kept in Procurement_Settings_History. Defaults: the spec's (Defaults and Open Items section C) for the numbers only Ship & Track uses, and what
// the forecast engine used before for the forecast numbers (below).
import { ENGINE_DEFAULTS as E } from './forecast-settings.mjs';

// The forecast numbers (transit, customs, fulfillment, delivery, the two switches) are the SAME settings the forecast engine reads:
// see forecast-settings.mjs. Their "default" is what the engine used before, not the spec's example numbers (spec: LCL / FCL 30 days,
// Air 14, fulfillment 3, delivery 2: to be measured), so saving nothing changes nothing.
export const SETTING_DEFS = [
  // --- planned dates (the feasibility calculator) ---
  { key: 'production_days', label: 'Production days (when no lead time is quoted)', type: 'days', default: 20, min: 1, max: 180, group: 'Planned dates', affects: 'The planned production end of every shipment with no quoted lead time and no supplier default.' },
  { key: 'consolidation_days', label: 'Consolidation days (production end to shipout)', type: 'days', default: 3, min: 0, max: 30, group: 'Planned dates', affects: 'The planned shipout date of every shipment.' },
  { key: 'receiving_days', label: 'Receiving days (arrival to binned and pickable)', type: 'days', default: 2, min: 0, max: 14, group: 'Planned dates', affects: 'The date the goods are pickable, which is what is compared with the date needed.' },
  { key: 'transit_air_min_days', label: 'Transit days, Air: shortest', type: 'days', default: E.airTMin, min: 1, max: 200, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every air shipment (the middle of the shortest and the longest).' },
  { key: 'transit_air_max_days', label: 'Transit days, Air: longest', type: 'days', default: E.airTMax, min: 1, max: 200, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every air shipment (the middle of the shortest and the longest).' },
  { key: 'customs_air_min_days', label: 'Customs to warehouse days, Air: shortest', type: 'days', default: E.airCMin, min: 0, max: 60, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every air shipment (the middle of the shortest and the longest).' },
  { key: 'customs_air_max_days', label: 'Customs to warehouse days, Air: longest', type: 'days', default: E.airCMax, min: 0, max: 60, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every air shipment (the middle of the shortest and the longest).' },
  { key: 'transit_lcl_min_days', label: 'Transit days, LCL (sea, shared container): shortest', type: 'days', default: E.lclTMin, min: 1, max: 200, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every LCL shipment (the middle of the shortest and the longest).' },
  { key: 'transit_lcl_max_days', label: 'Transit days, LCL (sea, shared container): longest', type: 'days', default: E.lclTMax, min: 1, max: 200, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every LCL shipment (the middle of the shortest and the longest).' },
  { key: 'customs_lcl_min_days', label: 'Customs to warehouse days, LCL (sea, shared container): shortest', type: 'days', default: E.lclCMin, min: 0, max: 60, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every LCL shipment (the middle of the shortest and the longest).' },
  { key: 'customs_lcl_max_days', label: 'Customs to warehouse days, LCL (sea, shared container): longest', type: 'days', default: E.lclCMax, min: 0, max: 60, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every LCL shipment (the middle of the shortest and the longest).' },
  { key: 'transit_fcl_min_days', label: 'Transit days, FCL (sea, full container): shortest', type: 'days', default: E.fclTMin, min: 1, max: 200, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every FCL shipment (the middle of the shortest and the longest).' },
  { key: 'transit_fcl_max_days', label: 'Transit days, FCL (sea, full container): longest', type: 'days', default: E.fclTMax, min: 1, max: 200, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every FCL shipment (the middle of the shortest and the longest).' },
  { key: 'customs_fcl_min_days', label: 'Customs to warehouse days, FCL (sea, full container): shortest', type: 'days', default: E.fclCMin, min: 0, max: 60, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every FCL shipment (the middle of the shortest and the longest).' },
  { key: 'customs_fcl_max_days', label: 'Customs to warehouse days, FCL (sea, full container): longest', type: 'days', default: E.fclCMax, min: 0, max: 60, group: 'Forecast and plan: transit', affects: 'The forecast of every order, and the planned arrival of every FCL shipment (the middle of the shortest and the longest).' },
  { key: 'local_transit_days', label: 'Transit days, local sourcing', type: 'days', default: E.locTMin, min: 0, max: 30, group: 'Forecast and plan: transit', affects: 'The forecast of orders sourced locally (HC System).' },
  { key: 'local_customs_days', label: 'Customs days, local sourcing', type: 'days', default: E.locCMin, min: 0, max: 30, group: 'Forecast and plan: transit', affects: 'The forecast of orders sourced locally.' },
  { key: 'fulfillment_days', label: 'Fulfillment days (pickable to ready to load: picking, QC, crating)', type: 'days', default: E.prepMin, min: 0, max: 30, group: 'Forecast and plan: handling', affects: 'The forecast of every order after the goods arrive, and the date needed (target delivery minus fulfillment and delivery days).' },
  { key: 'delivery_days', label: 'Delivery days (ready to load to the customer)', type: 'days', default: E.delMin, min: 0, max: 30, group: 'Forecast and plan: handling', affects: 'The forecast of every order, and the date needed.' },
  { key: 'forecast_reanchor', label: 'Re-anchor the forecast on the latest real event', type: 'yes_no', default: E.reAnchor, group: 'Forecast and plan: handling', affects: 'Whether the forecast restarts from the stage an order is really in (shipped, in picking, ...) or from the day the PR was added.' },
  { key: 'forecast_include_supplier_lead_time', label: 'Add the supplier lead time to the forecast', type: 'yes_no', default: E.addSupLead, group: 'Forecast and plan: handling', affects: 'Whether the quoted lead time of the supplier is added to the procurement leg of the forecast.' },
  // --- sorting ---
  { key: 'proc_watch_slack_days', label: 'Watch: slack at or below this many days', type: 'days', default: 7, min: 0, max: 60, group: 'Sorting', affects: 'Which on-track shipments move to Watch, and the At Risk status.' },
  { key: 'default_promise_days', label: 'Promise days when an order has no target', type: 'days', default: 25, min: 1, max: 120, group: 'Sorting', affects: 'The target used to rank a shipment whose order has no Target Delivery (order date + this).' },
  // --- supplier ladder ---
  { key: 'ladder_rung1_days', label: 'Ladder rung 1 (call the supplier): days late', type: 'days', default: 1, min: 1, max: 30, group: 'Supplier ladder', affects: 'When the buyer is told to call a late supplier. Late = production not started by PO date + 1.' },
  { key: 'ladder_rung2_days', label: 'Ladder rung 2 (ask for a discount): days late', type: 'days', default: 2, min: 1, max: 30, group: 'Supplier ladder', affects: 'When the buyer is told to ask the supplier for a discount in writing.' },
  { key: 'ladder_rung3_days', label: 'Ladder rung 3 (decide): days late', type: 'days', default: 3, min: 1, max: 30, group: 'Supplier ladder', affects: 'When the cancel-and-re-source or hold decision is put in the Decisions list.' },
  { key: 'arrival_overdue_grace_days', label: 'Arrival alert: days after the transit time', type: 'days', default: 3, min: 0, max: 30, group: 'Supplier ladder', affects: 'When a shipped-out shipment that has not reached the port raises the overdue alert.' },
  // --- decisions and alerts ---
  { key: 'po_ack_window_days', label: 'Days the supplier has to acknowledge a PO', type: 'days', default: 1, min: 1, max: 14, group: 'Decisions and alerts', affects: 'When a PO that the supplier has not acknowledged raises an alert for the buyer. A late acknowledgement never moves the production clock (it starts at PO date + 1).' },
  { key: 'inquiry_quote_days', label: 'Days a supplier has to quote an inquiry', type: 'days', default: 2, min: 1, max: 14, group: 'Decisions and alerts', affects: 'When a supplier that has not quoted an inquiry raises an alert for the buyer (spec Inquiry, notifications).' },
  { key: 'rr_default_days', label: 'Days to deliver a replacement', type: 'days', default: 21, min: 1, max: 90, group: 'Decisions and alerts', affects: 'The target of a new Replacement Request when the original target has already passed (today + this many days).' },
  { key: 'rr_ack_window_days', label: 'Days the supplier has to acknowledge a Replacement Request', type: 'days', default: 1, min: 1, max: 14, group: 'Decisions and alerts', affects: 'When a Replacement Request the supplier has not acknowledged raises an alert for the buyer.' },
  { key: 'receiving_count_window_days', label: 'Days to count an arrived shipment', type: 'days', default: 1, min: 1, max: 14, group: 'Receiving alerts', affects: 'When an arrived shipment that nobody has counted raises a "receiving backed up" alert.' },
  { key: 'receiving_bin_window_days', label: 'Days to bin a counted shipment', type: 'days', default: 1, min: 1, max: 14, group: 'Receiving alerts', affects: 'When counted goods with no bin location raise an alert (stock exists but cannot be picked).' },
  { key: 'receiving_available_window_hours', label: 'Hours from binned to available', type: 'hours', default: 2, min: 1, max: 72, group: 'Receiving alerts', affects: 'When binned goods that are still not available raise an alert (something in the readiness step is broken).' },
  { key: 'approval_sla_hours', label: 'Hours to decide before it escalates', type: 'hours', default: 24, min: 1, max: 168, group: 'Decisions and alerts', affects: 'A decision not made in this time is escalated to the supervisor.' },
  { key: 'procurement_alert_email', label: 'Alert recipient (until roles exist)', type: 'text', default: '', group: 'Decisions and alerts', affects: 'Who receives the in-app alerts of the ladder, the overdue arrival and the escalation. Blank = the address the old shipment schedules used.' },
];

export const DEFS = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d]));
export const GROUPS = [...new Set(SETTING_DEFS.map((d) => d.group))];
export const defaultSettings = () => Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d.default]));

// null when the value is fine, otherwise the plain-words reason it is refused (CP-R6).
export function problemWith(key, raw) {
  const d = DEFS[key];
  if (!d) return `"${key}" is not a Procurement setting.`;
  if (d.type === 'text') return String(raw ?? '').length > 200 ? 'Too long (200 characters at most).' : null;
  if (d.type === 'yes_no') return ['true', 'false'].includes(String(raw).toLowerCase()) ? null : `${d.label}: choose yes or no.`;
  const n = Number(raw);
  if (raw === '' || raw == null || !Number.isFinite(n)) return `${d.label}: enter a number.`;
  if (!Number.isInteger(n)) return `${d.label}: use whole numbers.`;
  if (n < d.min || n > d.max) return `${d.label}: ${n} is outside the allowed range (${d.min} to ${d.max}).`;
  return null;
}

// A shortest / longest pair must not cross. `values` = the value in use of every key; returns the reason, or null.
export function rangeProblem(key, raw, values) {
  const m = /^((?:transit|customs)_(?:air|lcl|fcl))_(min|max)_days$/.exec(key);
  if (!m) return null;
  const other = values[`${m[1]}_${m[2] === 'min' ? 'max' : 'min'}_days`];
  const n = Number(raw);
  if (m[2] === 'min' && n > Number(other)) return `${DEFS[key].label}: the shortest (${n}) cannot be more than the longest (${other}).`;
  if (m[2] === 'max' && n < Number(other)) return `${DEFS[key].label}: the longest (${n}) cannot be less than the shortest (${other}).`;
  return null;
}

// The ladder days must go up: rung 1 < rung 2 < rung 3.
export function ladderProblem(s) {
  return s.ladder_rung1_days < s.ladder_rung2_days && s.ladder_rung2_days < s.ladder_rung3_days ? null : 'The ladder days must go up: rung 1 before rung 2 before rung 3.';
}
