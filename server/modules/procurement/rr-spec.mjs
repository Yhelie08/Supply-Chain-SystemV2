// Exceptions and Replacement Requests of the HomeCartel spec v1.4 (02 Procurement / 06, 05 Shared Engines 01 and 04).
//   RR-R3  the RR carries a Target Delivery (the original target if it is still ahead, else today + rr_default_days) and the original
//          SO's Order Date (set by createRRMain in replacement-requests.mjs, which uses targetFor / orderDateFor below)
//   RR-R4  a replacement is the BROKEN category: first in every queue (sorting.mjs). Here: the RR's own rank and the forecast of its
//          replacement shipment, written after every scoring (rollupRr)
//   events exception.raised, rr.created, rr.acknowledged, rr.replacement_received (the first one of each stays: T-6)
//   alert  the buyer is told when an RR is not acknowledged within rr_ack_window_days (daily job)
//   RR-R6  the monthly report (custom API get_rr_report): replacements by cause, by fault origin and by supplier
// The widgets cannot write the server fields (Order_Date, Original_Supplier, ...): a widget write to them is dropped.
import { register } from '../../workflows/index.mjs';
import { zohoNow } from '../../criteria.mjs';
import { blank, toNum, parseDate, ymd, addDays, dayDiff, todayDate } from '../../workflows/deluge.mjs';
import { loadSettings } from './plan.mjs';
import { logEvent } from './events.mjs';
import { notify } from './decisions-core.mjs';
import { isReady } from './receiving.mjs';
import { portalOf } from '../../workflows/suppliers.mjs';

const RR = 'Replacement_Request';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const okBody = (message, data) => ({ code: 3000, message, data });
const SERVER_ONLY = ['Order_Date', 'Original_Supplier', 'Replacement_Received_At', 'Rr_Forecast_Pickable', 'Rr_Category', 'Rr_Queue_Rank', 'Rr_Ack_Alert_At'];
const DONE = ['Closed', 'Completed', 'Cancelled'];

// ---------- RR-R3: target and order date ----------
export function targetFor(originalTarget, settings, today = todayDate()) {
  const t = parseDate(originalTarget);
  if (t && t > today) return ymd(t);
  return ymd(addDays(today, toNum(settings.rr_default_days) || 21));
}
// The original SO's Order Date: the PR's own Order Date, else the Sales Order's creation date.
export async function orderDateFor(store, { prNo, soNo }) {
  if (!blank(prNo)) {
    const [pr] = await store.find('Purchase_Request1', (p) => text(p.PR_No) === text(prNo));
    if (pr && !blank(pr.Order_Date)) return text(pr.Order_Date).slice(0, 10);
  }
  if (!blank(soNo)) {
    const [so] = await store.find('Sales_Order_Fulfillment', (s) => text(s.SO_No) === text(soNo));
    if (so && !blank(so.SO_Created_Date)) return text(so.SO_Created_Date).slice(0, 10);
  }
  return '';
}
export async function originalTargetFor(store, { prNo }) {
  if (blank(prNo)) return '';
  const [pr] = await store.find('Purchase_Request1', (p) => text(p.PR_No) === text(prNo));
  return pr ? text(pr.Target_Delivery).slice(0, 10) : '';
}

// ---------- events ----------
export async function logOnce(store, { recordType, record, no, event, note = '', source = 'system' }) {
  const have = await store.find('Stage_Events', (e) => e.Record_Type === recordType && String(e.Record_Id) === String(record.ID) && e.Event === event);
  if (have.length) return false;
  await logEvent(store, { recordType, recordId: record.ID, recordNo: no, event, occurredAt: zohoNow(), source, note });
  return true;
}

register(RR, {
  beforeAdd: ({ input }) => { for (const f of SERVER_ONLY) delete input[f]; },
  beforeUpdate: ({ input }) => { for (const f of SERVER_ONLY) delete input[f]; },
  afterAdd: async ({ id, store }) => {
    const rr = await store.getRecordById(RR, id, { raw: true });
    await logOnce(store, { recordType: 'rr', record: rr, no: rr.RR_No, event: 'rr.created', note: text(rr.RR_Supplier) });
  },
  afterUpdate: async ({ id, record, previous, store }) => {
    if (text(record.RR_Status) === 'Acknowledged' && text(previous?.RR_Status) !== 'Acknowledged') {
      const rr = await store.getRecordById(RR, id, { raw: true });
      await logOnce(store, { recordType: 'rr', record: rr, no: rr.RR_No, event: 'rr.acknowledged', note: text(rr.RR_Supplier) });
    }
  },
});

register('Exceptions', {
  afterAdd: async ({ id, store }) => {
    const exc = await store.getRecordById('Exceptions', id, { raw: true });
    await logOnce(store, { recordType: 'exception', record: exc, no: exc.Exception_No, event: 'exception.raised', note: text(exc.Source_Module) });
  },
});

// The replacement arrived: stamp the RR once every line of a Receiving record that carries its number is counted and binned.
export async function stampReplacementReceived(store, rrNo) {
  for (const rr of await store.find(RR, (r) => text(r.RR_No) === text(rrNo))) {
    if (!blank(rr.Replacement_Received_At)) continue;
    await store.updateRecord(RR, rr.ID, { Replacement_Received_At: zohoNow() }, { byForm: true });
    await logOnce(store, { recordType: 'rr', record: rr, no: rr.RR_No, event: 'rr.replacement_received' });
  }
}
async function onReceiving({ id, store }) {
  const rcv = await store.getRecordById('Receiving', id, { raw: true });
  for (const l of rcv.Receiving_Line_Items || []) if (!blank(l.RR_No) && isReady(l)) await stampReplacementReceived(store, l.RR_No);
}
register('Receiving', { afterAdd: onReceiving, afterUpdate: onReceiving });

// ---------- RR-R4: the RR's own rank (Broken is first), and the forecast of its replacement shipment ----------
// shipments = the shipments as just scored. An open RR is Broken; they are ranked by the original Order Date (oldest first), then target.
export async function rollupRr(store, shipments = null) {
  const ships = shipments ?? await store.find('Shipments');
  const open = (await store.find(RR)).filter((r) => !DONE.includes(text(r.RR_Status)));
  const order = [...open].sort((a, b) => (text(a.Order_Date) || '9999').localeCompare(text(b.Order_Date) || '9999') || (text(a.Target_Delivery) || '9999').localeCompare(text(b.Target_Delivery) || '9999') || text(a.RR_No).localeCompare(text(b.RR_No)));
  const rankOf = new Map(order.map((r, i) => [String(r.ID), i + 1]));
  for (const r of await store.find(RR)) {
    const isOpen = !DONE.includes(text(r.RR_Status));
    const ship = text(r.Cloned_Shipment_No) === '' ? null : ships.find((s) => text(s.Shipment_No) === text(r.Cloned_Shipment_No));
    const want = { Rr_Category: isOpen ? 'broken' : '', Rr_Queue_Rank: isOpen ? rankOf.get(String(r.ID)) : '', Rr_Forecast_Pickable: ship ? text(ship.Forecast_Pickable).slice(0, 10) : '' };
    const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => text(r[k]) !== text(v)));
    if (Object.keys(diff).length) await store.updateRecord(RR, r.ID, diff, { byForm: true });
  }
}

// ---------- daily: an RR the supplier has not acknowledged ----------
export async function runRrDaily(store, { now = new Date() } = {}) {
  const settings = await loadSettings(store);
  const days = toNum(settings.rr_ack_window_days) || 1;
  const today = todayDate();
  let alerted = 0;
  for (const rr of await store.find(RR)) {
    if (text(rr.RR_Status) !== 'Open' || !blank(rr.Rr_Ack_Alert_At) || blank(rr.RR_Date)) continue;
    const made = parseDate(text(rr.RR_Date).slice(0, 10));
    if (!made || dayDiff(today, made) < days) continue;
    await notify(store, settings, { ship: { Shipment_No: rr.RR_No, ID: rr.ID }, type: 'RR Not Acknowledged', message: `${rr.RR_No} (${text(rr.RR_Supplier) || 'no supplier'}) has not been acknowledged after ${days} day(s). Follow it up.`, page: 'Replacement_Request1' });
    await store.updateRecord(RR, rr.ID, { Rr_Ack_Alert_At: zohoNow(now) }, { byForm: true });
    alerted++;
  }
  return { alerted };
}

// ---------- RR-R6: the monthly report ----------
const CAUSE_OF = { 'Receiving Damage': 'Damage', 'Receiving Missing': 'Missing part', 'QC Failure': 'Wrong spec / QC failure', 'Management Decision': 'Management decision' };
const count = (rows, key) => Object.entries(rows.reduce((m, r) => { const k = key(r) || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
export async function get_rr_report(payload, store) {
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(text(payload?.month)) ? text(payload.month) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rrs = (await store.find(RR)).filter((r) => text(r.RR_Date).startsWith(month));
  const excByNo = new Map((await store.find('Exceptions')).map((e) => [text(e.Exception_No), e]));
  const supplierName = (r) => portalOf(r.RR_Supplier)?.name ?? (text(r.RR_Supplier).trim() || 'unknown');
  const reworkJobs = (await store.find('Exception_Control1').catch(() => [])).filter((e) => text(e.Added_Time).startsWith(month) && (text(e.Rework_Status) !== '' || /true/i.test(text(e.Rework)))).length;
  const packages = (await store.find('Package_Shipments').catch(() => [])).filter((p) => text(p.Added_Time).startsWith(month)).length;
  return okBody('RR report.', {
    month, total: rrs.length,
    by_cause: count(rrs, (r) => CAUSE_OF[text(r.Source_Type)] || text(r.Source_Type)),
    by_fault_origin: count(rrs, (r) => text(excByNo.get(text(r.Source_Exception_No))?.Fault_Origin)),
    by_supplier: count(rrs, supplierName),
    changed_supplier: rrs.filter((r) => text(r.Original_Supplier) !== '' && text(r.Original_Supplier) !== text(r.RR_Supplier)).length,
    rework: { replacements: rrs.length, rework_jobs: reworkJobs, packages, rate: packages ? Math.round(((rrs.length + reworkJobs) / packages) * 1000) / 10 : null },
  });
}
