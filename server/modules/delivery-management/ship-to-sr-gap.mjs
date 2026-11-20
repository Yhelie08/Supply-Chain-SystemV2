// Delivery Analytics key number #7 (spec v1.4, Delivery 09): the gap between "Ship" (the package reaches Order
// Aggregation / To Ship in Fulfillment) and the Service Request being created. Read-only, no new fields.
//
// Where the two timestamps come from:
//   - aggregation: Fulfillment's own Stage_Events row `package.aggregated` (spec v1.4 name, written by the Python Fulfillment since 2026-11-20)
//     or `package.order_aggregation` (the old name; every row written before that, and by the Node Fulfillment, carries it),
//     keyed by the Sales_Order_Fulfillment record ID (one record per package).
//   - Service Request created: Service_Request1.Added_Time.
//   - the link: Service_Request1.Sales_Order + Package_Number (can be several packages, comma separated)
//     matches Sales_Order_Fulfillment.SO_No + Package.
//
// A Service Request with several packages counts from the LAST package to reach aggregation (the SR cannot
// be complete before then). A Service Request whose packages have no aggregation event (made before the event
// log existed, or manually) is counted as "unmatched" and left out of the numbers, not guessed at. A negative
// gap (SR made before aggregation, e.g. a manual SR) is counted as "negative" and also left out.
import { blank } from '../../workflows/deluge.mjs';

const SR = 'Service_Request1';
const SOF = 'Sales_Order_Fulfillment';
const EVENTS = 'Stage_Events';
const AGGREGATED = ['package.aggregated', 'package.order_aggregation']; // new spec name and the old one: both count as the same event
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// "2026-11-18 03:45:00 PM" -> Date (local). Same small per-file parser job-status.mjs uses.
function parseZoho(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(text(v));
  if (!m) return null;
  let h = m[4] == null ? 0 : Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
}

const round1 = (n) => Math.round(n * 10) / 10;
const average = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function getShipToSrGap(store) {
  const [srs, sofs, events] = await Promise.all([
    // Added_Time is blank on Service Requests migrated from Zoho (Production backup, 2026-11-19): they cannot be
    // measured, so they are counted as unmatched below, not dropped silently.
    store.find(SR, (r) => !blank(r.Sales_Order) && !blank(r.Package_Number)),
    store.find(SOF, (r) => !blank(r.SO_No) && !blank(r.Package)),
    store.find(EVENTS, (e) => e.Record_Type === 'package' && AGGREGATED.includes(e.Event)),
  ]);

  // package ID -> earliest aggregation time. Compared as IDs in text, never as Numbers (see site-visits.mjs:
  // this app's shared ID sequence can pass JS's safe-integer range).
  const aggregatedAt = new Map();
  for (const e of events) {
    const at = parseZoho(e.Occurred_At);
    if (!at) continue;
    const key = text(e.Record_Id);
    if (!aggregatedAt.has(key) || at < aggregatedAt.get(key)) aggregatedAt.set(key, at);
  }
  const packageId = new Map(); // "SO|package" -> package record ID
  for (const s of sofs) packageId.set(`${text(s.SO_No)}|${text(s.Package)}`, text(s.ID));

  const gaps = [];
  let unmatched = 0, negative = 0;
  for (const sr of srs) {
    const created = parseZoho(sr.Added_Time);
    const pacs = text(sr.Package_Number).split(',').map((p) => p.trim()).filter(Boolean);
    const times = pacs.map((p) => aggregatedAt.get(packageId.get(`${text(sr.Sales_Order)}|${p}`)));
    if (!created || !pacs.length || times.some((t) => !t)) { unmatched++; continue; }
    const last = new Date(Math.max(...times.map((t) => t.getTime())));
    const hours = (created - last) / 3600000;
    if (hours < 0) { negative++; continue; }
    gaps.push(hours);
  }

  return {
    count: gaps.length, unmatched, negative,
    avgHours: gaps.length ? round1(average(gaps)) : null,
    medianHours: gaps.length ? round1(median(gaps)) : null,
    maxHours: gaps.length ? round1(Math.max(...gaps)) : null,
  };
}
