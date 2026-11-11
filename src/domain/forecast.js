// The Procurement-to-Delivery Forecast, ported from the live "PR Forecast" widget
// (Procurement/PR Forecast/Widget/app/index.html). Every leg is a RANGE, so the output is a window
// (Earliest / Likely / Latest), never one precise date. Nothing here is stored except the settings.

import { addDays } from './util.js';
import { leadDays } from './pr.js';

export const SETTING_DEFS = [
  { group: 'Air Freight', key: 'fc_air_transit_min', label: 'Transit: min', def: 5 },
  { group: 'Air Freight', key: 'fc_air_transit_max', label: 'Transit: max', def: 7 },
  { group: 'Air Freight', key: 'fc_air_customs_min', label: 'Customs to WH: min', def: 2 },
  { group: 'Air Freight', key: 'fc_air_customs_max', label: 'Customs to WH: max', def: 3 },
  { group: 'LCL', key: 'fc_lcl_transit_min', label: 'Transit: min', def: 35 },
  { group: 'LCL', key: 'fc_lcl_transit_max', label: 'Transit: max', def: 60 },
  { group: 'LCL', key: 'fc_lcl_customs_min', label: 'Customs to WH: min', def: 7 },
  { group: 'LCL', key: 'fc_lcl_customs_max', label: 'Customs to WH: max', def: 10 },
  { group: 'FCL', key: 'fc_fcl_transit_min', label: 'Transit: min', def: 35 },
  { group: 'FCL', key: 'fc_fcl_transit_max', label: 'Transit: max', def: 60 },
  { group: 'FCL', key: 'fc_fcl_customs_min', label: 'Customs to WH: min', def: 7 },
  { group: 'FCL', key: 'fc_fcl_customs_max', label: 'Customs to WH: max', def: 10 },
  { group: 'Local (HC System)', key: 'fc_local_transit_min', label: 'Transit: min', def: 0 },
  { group: 'Local (HC System)', key: 'fc_local_transit_max', label: 'Transit: max', def: 0 },
  { group: 'Local (HC System)', key: 'fc_local_customs_min', label: 'Customs to WH: min', def: 0 },
  { group: 'Local (HC System)', key: 'fc_local_customs_max', label: 'Customs to WH: max', def: 0 },
  { group: 'Warehouse', key: 'fc_prep_min', label: 'Preparation thru QC: min', def: 7 },
  { group: 'Warehouse', key: 'fc_prep_max', label: 'Preparation thru QC: max', def: 7 },
  { group: 'Warehouse', key: 'fc_delivery_min', label: 'Delivery: min', def: 0 },
  { group: 'Warehouse', key: 'fc_delivery_max', label: 'Delivery: max', def: 0 },
];
export const TOGGLE_DEFS = [
  {
    key: 'fc_reanchor', label: 'Re-anchor on the latest real event', def: 1,
    help: 'ON: once a shipment has actually sailed, or the order is already in Picking, QC or Crate, the forecast counts forward from that event instead of the PR date, so it tightens as the order moves. OFF: always count the full chain from the PR date.',
  },
  {
    key: 'fc_include_supplier_lead', label: "Add the supplier's Required Days Lead", def: 0,
    help: 'OFF: the transit range already absorbs production time. ON: also add the PR\'s own lead time on top, for orders still in procurement.',
  },
];
export const HORIZON_DEF = { key: 'fc_horizon_weeks', label: 'Weeks shown in the volume chart', def: 12 };

export const DEFAULTS = (() => {
  const d = {};
  SETTING_DEFS.forEach((s) => { d[s.key] = s.def; });
  TOGGLE_DEFS.forEach((t) => { d[t.key] = t.def; });
  d[HORIZON_DEF.key] = HORIZON_DEF.def;
  return d;
})();

export const ALL_KEYS = Object.keys(DEFAULTS);
export const resolveSettings = (saved) => ({ ...DEFAULTS, ...(saved || {}) });

// ───────────── dates (ISO strings) ─────────────

const day = (v) => (v ? String(v).slice(0, 10) : null);
export const daysBetween = (a, b) => Math.round((Date.parse(day(b)) - Date.parse(day(a))) / 86400000);
export function startOfWeek(iso) {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  return addDays(iso, dow === 0 ? -6 : 1 - dow); // Monday
}
const keyOf = (v) => String(v == null ? '' : v).trim().toUpperCase();

// ───────────── the model ─────────────

export const PREP_STAGES = ['Order Readiness', 'Picking', 'Quality Checking', 'Crate'];
const STAGE_OF = {
  'Readiness Gate': 'Order Readiness', Pick: 'Picking', QC: 'Quality Checking', Crate: 'Crate',
  'Order Aggregation': 'For Delivery', Dispatched: 'For Delivery',
};

// Which leg lengths apply, from the shipment mode and sourcing type.
export function legsFor(mode, sourcing, S) {
  const m = keyOf(mode);
  if (keyOf(sourcing) === 'LOCAL') return { bucket: 'Local (HC System)', assumed: false, transit: [S.fc_local_transit_min, S.fc_local_transit_max], customs: [S.fc_local_customs_min, S.fc_local_customs_max] };
  if (m.includes('AIR')) return { bucket: 'Air Freight', assumed: false, transit: [S.fc_air_transit_min, S.fc_air_transit_max], customs: [S.fc_air_customs_min, S.fc_air_customs_max] };
  if (m === 'FCL') return { bucket: 'FCL', assumed: false, transit: [S.fc_fcl_transit_min, S.fc_fcl_transit_max], customs: [S.fc_fcl_customs_min, S.fc_fcl_customs_max] };
  // A blank or unrecognised mode falls back to LCL, and says so, so nobody reads an assumed 35-60 days as a known one.
  return { bucket: 'LCL', assumed: m !== 'LCL', transit: [S.fc_lcl_transit_min, S.fc_lcl_transit_max], customs: [S.fc_lcl_customs_min, S.fc_lcl_customs_max] };
}

// Walks the chain from the most advanced real event we can see, and returns the legs still left to run.
export function buildForecast(o, S, today) {
  const L = legsFor(o.mode, o.sourcing, S);
  const prep = [S.fc_prep_min, S.fc_prep_max];
  const delivery = [S.fc_delivery_min, S.fc_delivery_max];
  const reanchor = !!S.fc_reanchor;
  const preOrder = String(o.orderType || '').toUpperCase().includes('PRE ORDER');
  const stockOnHand = !!o.hasSof && !preOrder; // reached Fulfillment and is not a pre-order: no import leg left
  let legs = [];
  let anchor = null;
  let position = '';
  let anchorLabel = '';

  if (reanchor && o.stage === 'For Delivery') {
    anchor = today; position = 'Ready for delivery'; anchorLabel = 'today';
    legs = [{ name: 'Delivery', days: delivery }];
  } else if (reanchor && PREP_STAGES.includes(o.stage)) {
    const start = o.prepStart || today;
    const elapsed = Math.max(0, daysBetween(start, today));
    anchor = today; position = `In ${o.stage}`; anchorLabel = 'today';
    legs = [
      { name: `Preparation left (${elapsed} of ${prep[1]} days used)`, days: [Math.max(0, prep[0] - elapsed), Math.max(0, prep[1] - elapsed)] },
      { name: 'Delivery', days: delivery },
    ];
  } else if (stockOnHand) {
    anchor = today; position = 'Stock on hand'; anchorLabel = 'today';
    legs = [{ name: 'Preparation thru QC', days: prep }, { name: 'Delivery', days: delivery }];
  } else if (reanchor && o.shipArrived) {
    anchor = today; position = 'At warehouse'; anchorLabel = 'today';
    legs = [{ name: 'Preparation thru QC', days: prep }, { name: 'Delivery', days: delivery }];
  } else if (reanchor && o.dateShipped) {
    anchor = o.dateShipped; position = 'In transit'; anchorLabel = `shipped ${o.dateShipped}`;
    legs = [
      { name: `${L.bucket} transit`, days: L.transit }, { name: 'Customs to WH', days: L.customs },
      { name: 'Preparation thru QC', days: prep }, { name: 'Delivery', days: delivery },
    ];
  } else {
    anchor = o.prAdded; position = o.prAdded ? 'Procurement' : 'No PR date'; anchorLabel = o.prAdded ? `PR ${o.prAdded}` : '—';
    if (S.fc_include_supplier_lead && o.supplierLead) legs.push({ name: 'Supplier production lead', days: [o.supplierLead, o.supplierLead] });
    legs.push({ name: `${L.bucket} transit`, days: L.transit }, { name: 'Customs to WH', days: L.customs },
      { name: 'Preparation thru QC', days: prep }, { name: 'Delivery', days: delivery });
  }

  if (!anchor) return { position, bucket: L.bucket, assumedMode: L.assumed, legs, earliest: null, likely: null, latest: null, anchorLabel, overdueModel: false };

  const sumMin = legs.reduce((t, l) => t + (l.days[0] || 0), 0);
  const sumMax = legs.reduce((t, l) => t + (l.days[1] || 0), 0);
  let earliest = addDays(anchor, sumMin);
  let latest = addDays(anchor, sumMax);
  // The model can land wholly in the past on an order that never moved. That is real information (the chain has
  // blown through its own estimate), so it is flagged and the dates are pulled to today.
  const overdueModel = latest < today;
  if (earliest < today) earliest = today;
  if (latest < today) latest = today;
  const likely = addDays(earliest, Math.round(daysBetween(earliest, latest) / 2));
  return { position, bucket: L.bucket, assumedMode: L.assumed, legs, earliest, likely, latest, spanDays: sumMax - sumMin, anchorLabel, overdueModel };
}

export function severityOf(f, target, today) {
  if (!f.likely) return { code: 'unknown', label: 'No date', tone: 'neutral' };
  if (!target) return { code: 'notarget', label: 'No target', tone: 'neutral' };
  if (today > target) return { code: 'miss', label: 'Overdue', tone: 'bad' };
  if (f.latest <= target) return { code: 'ontrack', label: 'On track', tone: 'ok' };
  if (f.earliest <= target) return { code: 'atrisk', label: 'At risk', tone: 'warn' };
  return { code: 'miss', label: 'Will miss', tone: 'bad' };
}

// ───────────── from the records to forecast rows ─────────────

// The Purchase Request is the spine, because the user's model starts at the PR date. Each PR is joined forward to its
// shipment, its Fulfillment item and its delivery job. A pure-stock order with no PR is therefore not listed.
export function buildOrders(db) {
  return db.prs.map((pr) => {
    const ship = db.shipments.find((s) => !s.rrNo && (s.prNos || []).includes(pr.no));
    const item = db.items.find((i) => i.prNo === pr.no);
    const inquiry = db.inquiries.find((q) => q.no === pr.inquiryNo);
    const job = item && db.serviceRequests.find((s) => s.itemId === item.id);
    const reached = !!(item && item.received);
    return {
      prNo: pr.no, soNo: pr.soNo, itemName: pr.item, sku: pr.sku, qty: pr.qty, customer: pr.customer,
      prAdded: day(pr.createdAt), supplier: pr.supplier, sourcing: pr.sourcingType,
      prStatus: pr.hold === 'Cancelled' ? 'Cancelled' : pr.status, supplierLead: leadDays(pr.lead),
      shipNo: ship ? ship.no : '', dateShipped: ship ? day(ship.dateShipped) : null, shipArrived: ship ? ship.status === 'Arrived' : false,
      shipEta: ship ? day(ship.eta) : null, shipStatus: ship ? ship.status : '',
      hasSof: reached, stage: reached ? STAGE_OF[item.stage] || '' : '', target: day(pr.targetDate),
      prepStart: item ? day(item.gateOn || item.createdOn) : null, mode: (ship && ship.mode) || pr.mode,
      deliveryType: job ? job.type : '', orderType: inquiry ? inquiry.orderType : 'Normal', delivered: !!(job && job.status === 'Completed'),
    };
  });
}

export function forecastRows(db, settings, today) {
  return buildOrders(db)
    .filter((o) => keyOf(o.prStatus) !== 'CANCELLED' && !o.delivered)
    .map((o) => {
      const f = buildForecast(o, settings, today);
      return {
        o, f, sev: severityOf(f, o.target, today),
        variance: o.target && f.likely ? daysBetween(o.target, f.likely) : null,
        varianceWorst: o.target && f.latest ? daysBetween(o.target, f.latest) : null,
      };
    })
    .sort((a, b) => (!a.f.likely ? 1 : !b.f.likely ? -1 : a.f.likely < b.f.likely ? -1 : a.f.likely > b.f.likely ? 1 : 0));
}

export function weeklyBuckets(rows, settings, today) {
  const n = Math.max(1, Math.min(52, Number(settings.fc_horizon_weeks) || 12));
  const w0 = startOfWeek(today);
  const out = Array.from({ length: n }, (_, i) => ({ start: addDays(w0, i * 7), end: addDays(w0, i * 7 + 6), ontrack: 0, atrisk: 0, miss: 0, total: 0 }));
  rows.forEach((r) => {
    if (!r.f.likely) return;
    const idx = Math.floor(daysBetween(w0, startOfWeek(r.f.likely)) / 7);
    if (idx < 0 || idx >= out.length) return;
    const slot = r.sev.code === 'atrisk' ? 'atrisk' : r.sev.code === 'miss' ? 'miss' : 'ontrack';
    out[idx][slot] += 1;
    out[idx].total += 1;
  });
  return out;
}

// The one leg that can be MEASURED from existing records: how long preparation really took.
export function measuredPrep(db, today) {
  const spans = [];
  buildOrders(db).forEach((o) => {
    if (!o.prepStart || (o.stage !== 'Crate' && o.stage !== 'For Delivery')) return;
    const d = daysBetween(o.prepStart, today);
    if (d >= 0 && d < 365) spans.push(d);
  });
  if (!spans.length) return { prepMedian: null, prepCount: 0 };
  spans.sort((a, b) => a - b);
  const mid = Math.floor(spans.length / 2);
  return { prepCount: spans.length, prepMedian: spans.length % 2 ? spans[mid] : Math.round((spans[mid - 1] + spans[mid]) / 2) };
}

export function validateSettings(values) {
  const errors = [];
  const num = (k) => Number(values[k]);
  SETTING_DEFS.forEach((s) => {
    const v = num(s.key);
    if (!Number.isFinite(v) || v < 0) errors.push(`${s.group} ${s.label} must be zero or more.`);
  });
  SETTING_DEFS.filter((s) => s.key.endsWith('_min')).forEach((s) => {
    const max = s.key.replace(/_min$/, '_max');
    if (num(s.key) > num(max)) errors.push(`${s.group} ${s.label.split(':')[0]}: the minimum cannot be above the maximum.`);
  });
  const h = num(HORIZON_DEF.key);
  if (!Number.isInteger(h) || h < 1 || h > 52) errors.push('Weeks shown must be a whole number from 1 to 52.');
  return errors;
}
