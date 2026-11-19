// Receiving, from the HomeCartel spec v1.4 (02 Procurement / 05 Receiving, 05 Shared Engines 01, 04, 05):
//   the four events as SERVER stamps: arrived (gate log, or "before the first count", T-5), counted (the first saved quantity), binned
//   (a bin location is written), available (counted in full AND binned = pickable). "Received" now means pickable (D12, RCV-R4).
//   RCV-R3 an exception found at receiving records where it was found and who is at fault (supplier / transit / unknown)
//   RCV-R6 silence alerts: arrived -> counted, counted -> binned, binned -> available
//   RCV-R7 received less than ordered -> the suggested action "Raise a replacement request" (and the buyer is told once)
//   the Arrivals list: expected this week + arrived but not worked, oldest Sales Order first (SE-1..5)
// Not here: the Purchase Receive in Zoho Books for the quantity of each save (RCV-R1, RCV-R2): the Books calls are on hold.
import { register } from '../../workflows/index.mjs';
import { zohoNow } from '../../criteria.mjs';
import { blank, toNum, parseDate, ymd, dayDiff, todayDate } from '../../workflows/deluge.mjs';
import { loadSettings } from './plan.mjs';
import { logEvent, occurredFrom, parseWhen } from './events.mjs';
import { notify, parseZoho } from './decisions-core.mjs';
import { applyShipmentEvent } from './ship-track.mjs';
import { isBinned, isReady } from './receiving.mjs';

const RCV = 'Receiving';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const n = (v) => (blank(v) ? 0 : toNum(v));
const toDay = (v) => { const w = parseWhen(v); return w ? new Date(w.date.getFullYear(), w.date.getMonth(), w.date.getDate()) : parseDate(v); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (d) => `${d.getDate()} ${MON[d.getMonth()]}`;
const SERVER_ONLY = ['Order_Date', 'Arrived_At', 'Counted_At', 'Binned_At', 'Available_At', 'Rcv_State', 'Days_Waiting', 'Queue_Rank', 'Priority_Reason', 'Suggested_Action', 'Line_Stamps', 'Rcv_Forecast_Pickable'];
const lineKey = (l) => `${text(l.PR_No)}|${text(l.SKU)}`;
const counted = (l) => n(l.Accepted_Qty) + n(l.Damage_Qty) + n(l.Missing_Qty) > 0;
const fullyCounted = (l) => n(l.Expected_Qty) > 0 && n(l.Accepted_Qty) + n(l.Damage_Qty) + n(l.Missing_Qty) >= n(l.Expected_Qty);
const pending = new Map(); // receiving id -> events to write after the save

// Root cause of a damage / missing row -> who is at fault (RCV-R3)
export const FAULT_OF = {
  'Production Damage': 'supplier', 'Different product inside the box vs label': 'supplier', 'Wrong Item Sent': 'supplier', 'Wrong Quantity': 'supplier',
  'Missing from Shipment': 'supplier', 'Late Delivery': 'supplier', 'Shipping Damage': 'transit',
};

// ---------- before the save: the stamps ----------
async function beforeSave({ input, previous, id }) {
  const arrivedReport = input.Report_Arrived_On;
  for (const f of SERVER_ONLY) delete input[f];
  input.Report_Arrived_On = '';
  const rec = { ...(previous || {}), ...input };
  const lines = rec.Receiving_Line_Items || [];
  const was = (() => { try { return JSON.parse(previous?.Line_Stamps || '{}'); } catch { return {}; } })();
  const stamps = { ...was };
  const now = zohoNow();
  const events = [];
  const keep = (v) => text(v) !== '';

  // arrived: the gate log if a person gave it; else it is derived "before the first count" (T-5): the exact time is not known
  let arrivedAt = text(previous?.Arrived_At);
  if (!blank(arrivedReport)) {
    const o = occurredFrom(arrivedReport);
    if (!arrivedAt) { arrivedAt = o.text; input.Arrived_At = o.text; events.push({ event: 'receiving.arrived', occurredAt: o.text, bound: 'exact', source: 'user' }); }
  }
  let firstCount = false;
  for (const l of lines) {
    const k = lineKey(l);
    const s = (stamps[k] = { ...(stamps[k] || {}) });
    if (!keep(s.counted_at) && counted(l)) { s.counted_at = now; firstCount = true; }
    if (!keep(s.binned_at) && isBinned(l)) s.binned_at = now;
    if (!keep(s.available_at) && isReady(l)) s.available_at = now;
  }
  if (!arrivedAt && firstCount) { arrivedAt = now; input.Arrived_At = now; events.push({ event: 'receiving.arrived', occurredAt: now, bound: 'before', source: 'system', note: 'before the first count' }); }
  const all = (field) => lines.length > 0 && lines.every((l) => keep(stamps[lineKey(l)]?.[field]));
  const any = (field) => lines.some((l) => keep(stamps[lineKey(l)]?.[field]));
  if (!text(previous?.Counted_At) && any('counted_at')) { input.Counted_At = now; events.push({ event: 'receiving.counted', occurredAt: now, bound: 'exact', source: 'user' }); }
  if (!text(previous?.Binned_At) && all('binned_at')) { input.Binned_At = now; events.push({ event: 'receiving.binned', occurredAt: now, bound: 'exact', source: 'user' }); }
  if (!text(previous?.Available_At) && all('available_at')) { input.Available_At = now; events.push({ event: 'receiving.available', occurredAt: now, bound: 'exact', source: 'system' }); }
  input.Line_Stamps = JSON.stringify(stamps);

  // RCV-R7: every line counted and something short or damaged -> suggest a replacement request
  const short = lines.length > 0 && lines.every(fullyCounted) && lines.some((l) => n(l.Missing_Qty) > 0 || n(l.Damage_Qty) > 0 || n(l.Accepted_Qty) < n(l.Expected_Qty));
  input.Suggested_Action = short ? 'Raise a replacement request: received less than ordered (shortage or damage)' : '';
  if (id) pending.set(String(id), events); else pending.set('new', events);
}

// ---------- after the save ----------
async function afterSave({ id, record, previous, store, user }) {
  const events = pending.get(String(id)) ?? pending.get('new') ?? [];
  pending.delete(String(id)); pending.delete('new');
  for (const e of events) await logEvent(store, { recordType: 'receiving', recordId: id, recordNo: record.Receive_No1, event: e.event, occurredAt: e.occurredAt, bound: e.bound, source: e.source, actor: user || '', note: e.note || '' });
  const settings = await loadSettings(store);

  // RCV-R3: the exceptions of this receiving: found at receiving, fault origin from the root cause, the quantity
  for (const exc of await store.find('Exceptions', (e) => text(e.Receive_No) === text(record.Receive_No1) && text(record.Receive_No1) !== '')) {
    const rows = (record.Damage_Missing_Details || []).filter((d) => text(d.SKU) === text(String(exc.Exception_Line_Key ?? '').split('||')[1]) || text(d.PR_No) === text(exc.Receiving_Line_ID));
    const origins = rows.map((d) => FAULT_OF[text(d.Root_Cause_Category)]).filter(Boolean);
    const patch = { Found_Stage: 'receiving', Affected_Qty: rows.reduce((s, d) => s + (blank(d.Qty) ? 1 : n(d.Qty)), 0) };
    if (blank(exc.Fault_Origin)) patch.Fault_Origin = origins[0] ?? 'unknown';
    if (blank(exc.Caused_Stage)) patch.Caused_Stage = patch.Fault_Origin ?? exc.Fault_Origin ?? 'unknown';
    await store.updateRecord('Exceptions', exc.ID, patch, { byForm: true });
    if (!(await store.find('Stage_Events', (e) => e.Record_Type === 'exception' && String(e.Record_Id) === String(exc.ID))).length) {
      await logEvent(store, { recordType: 'exception', recordId: exc.ID, recordNo: exc.Exception_No, event: 'exception.raised', occurredAt: zohoNow(), source: 'system', note: `found at receiving ${record.Receive_No1}` });
    }
  }
  // the shipment is received when every line is pickable
  const shipId = text(record.Shipments && typeof record.Shipments === 'object' ? record.Shipments.ID : record.Shipments);
  if (shipId && text(record.Receive_Status) === 'Received' && text(previous?.Receive_Status) !== 'Received') {
    await applyShipmentEvent(store, shipId, 'received', { source: 'system', note: 'every line counted and binned' }).catch((e) => console.error('[receiving] received event', e.message));
  }
  if (text(record.Suggested_Action) !== '' && text(previous?.Suggested_Action) === '') {
    await notify(store, settings, { ship: { Shipment_No: record.Receive_No1, ID: id }, type: 'Receiving Shortage', message: `${record.Receive_No1}: received less than ordered. Raise a replacement request.` });
  }
  await rescoreReceivings(store);
}

register(RCV, { beforeAdd: beforeSave, beforeUpdate: beforeSave, afterAdd: afterSave, afterUpdate: afterSave });

// Exceptions: where it was found is the server's; when it was resolved is stamped, never typed (T-2).
register('Exceptions', {
  beforeAdd: ({ input }) => { delete input.Found_Stage; delete input.Resolved_At; },
  beforeUpdate: ({ input, previous }) => {
    delete input.Found_Stage; delete input.Resolved_At;
    if (text(input.Exception_Status) === 'Resolved' && text(previous.Exception_Status) !== 'Resolved' && blank(previous.Resolved_At)) input.Resolved_At = zohoNow();
  },
  afterUpdate: async ({ id, record, previous, store, user }) => {
    if (text(record.Exception_Status) === 'Resolved' && text(previous.Exception_Status) !== 'Resolved') {
      await logEvent(store, { recordType: 'exception', recordId: id, recordNo: record.Exception_No, event: 'exception.resolved', occurredAt: zohoNow(), source: 'user', actor: user || '' });
    }
  },
});

// ---------- the Arrivals list (the sorting engine for Receiving) ----------
const STATE_RANK = { arrived: 0, counted: 1, binned: 2, expected: 3 };
export async function rescoreReceivings(store, { today = todayDate() } = {}) {
  const open = await store.find(RCV, (r) => text(r.Available_At) === '' || text(r.Rcv_State) !== 'available');
  const ships = new Map((await store.find('Shipments')).map((s) => [String(s.ID), s]));
  const rows = [];
  for (const r of open) {
    const lines = r.Receiving_Line_Items || [];
    const ship = ships.get(text(r.Shipments && typeof r.Shipments === 'object' ? r.Shipments.ID : r.Shipments));
    let state = text(r.Available_At) ? 'available' : text(r.Binned_At) ? 'binned' : text(r.Counted_At) ? 'counted' : text(r.Arrived_At) || text(ship?.Arrived_Warehouse_At) || text(ship?.Stage) === 'arrived_warehouse' ? 'arrived' : 'expected';
    if (state === 'binned' && lines.every(isReady)) state = 'available';
    const since = toDay(state === 'counted' ? r.Counted_At : state === 'binned' ? r.Binned_At : text(r.Arrived_At) || ship?.Arrived_Warehouse_At || '') ;
    const waiting = since ? Math.max(0, dayDiff(today, since)) : null;
    let order = null;
    const prNos = lines.map((l) => text(l.PR_No)).filter(Boolean);
    if (prNos.length) for (const p of await store.find('Purchase_Request1', (x) => prNos.includes(text(x.PR_No)), { criteria: `(${prNos.map((k) => `PR_No == ${JSON.stringify(k)}`).join(' || ')})` })) { const d = toDay(p.Order_Date); if (d && (!order || d < order)) order = d; }
    if (!order && text(ship?.Order_Date)) order = toDay(ship.Order_Date);
    const planned = toDay(ship?.Receive_Planned || ship?.Arrival_Planned);
    rows.push({ r, state, waiting, order, planned, forecast: text(ship?.Forecast_Pickable).slice(0, 10) });
  }
  const live = rows.filter((x) => x.state !== 'available');
  const ordered = [...live].sort((a, b) => (STATE_RANK[a.state] - STATE_RANK[b.state]) || ((a.order?.getTime() ?? Infinity) - (b.order?.getTime() ?? Infinity)) || String(a.r.Receive_No1).localeCompare(String(b.r.Receive_No1), undefined, { numeric: true }));
  const rank = new Map(ordered.map((x, i) => [String(x.r.ID), i + 1]));
  let changed = 0;
  for (const x of rows) {
    const reasonParts = [x.order ? `SO dated ${dm(x.order)} (${dayDiff(today, x.order)} days)` : 'no order date'];
    reasonParts.push(x.state === 'expected' ? `expected ${x.planned ? dm(x.planned) : 'date not known'}` : x.state === 'arrived' ? `arrived${x.waiting != null ? ` ${x.waiting} day(s) ago` : ''}, not counted` : x.state === 'counted' ? `counted${x.waiting != null ? ` ${x.waiting} day(s) ago` : ''}, not binned` : x.state === 'binned' ? 'binned, becoming available' : 'available');
    const action = text(x.r.Suggested_Action) || (x.state === 'arrived' ? 'Count and inspect it' : x.state === 'counted' ? 'Write the bin location' : '');
    const want = { Rcv_State: x.state, Days_Waiting: x.waiting ?? '', Queue_Rank: x.state === 'available' ? '' : rank.get(String(x.r.ID)) ?? '', Rcv_Forecast_Pickable: x.forecast, Priority_Reason: reasonParts.join(' · '), Suggested_Action: action, Order_Date: x.order ? ymd(x.order) : '' };
    const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => text(v) !== text(x.r[k])));
    if (!Object.keys(diff).length) continue;
    await store.updateRecord(RCV, x.r.ID, diff, { byForm: true });
    changed++;
  }
  return { scored: rows.length, changed };
}

// ---------- silence alerts (RCV-R6) ----------
export async function checkReceivingSilence(store, settings, now = new Date()) {
  let made = 0;
  const told = await store.find('App_Notifications', (x) => ['Receiving Backed Up', 'Receiving Not Binned', 'Receiving Not Available'].includes(x.Notification_Type));
  const once = async (r, type, message) => {
    if (told.some((x) => x.Notification_Type === type && text(x.Source_Record_No) === text(r.Receive_No1))) return;
    await notify(store, settings, { ship: { Shipment_No: r.Receive_No1, ID: r.ID }, type, message });
    made++;
  };
  const hours = (v) => { const d = parseZoho(v); return d ? (now - d) / 3600000 : null; };
  for (const r of await store.find(RCV, (x) => text(x.Available_At) === '')) {
    const arrived = hours(r.Arrived_At), counted = hours(r.Counted_At), binned = hours(r.Binned_At);
    if (!text(r.Counted_At) && arrived != null && arrived >= settings.receiving_count_window_days * 24) await once(r, 'Receiving Backed Up', `${r.Receive_No1} arrived ${Math.floor(arrived / 24)} day(s) ago and has not been counted.`);
    if (text(r.Counted_At) && !text(r.Binned_At) && counted != null && counted >= settings.receiving_bin_window_days * 24) await once(r, 'Receiving Not Binned', `${r.Receive_No1} was counted ${Math.floor(counted / 24)} day(s) ago but has no bin location: the stock cannot be picked.`);
    if (text(r.Binned_At) && binned != null && binned >= settings.receiving_available_window_hours) await once(r, 'Receiving Not Available', `${r.Receive_No1} was binned ${Math.floor(binned)} hour(s) ago and is still not available: check the readiness step.`);
  }
  return made;
}

// The daily run (Receiving_Silence_Daily): re-rank the Arrivals list and raise the silence alerts.
export async function runReceivingDaily(store, { log = () => {}, now = new Date() } = {}) {
  const settings = await loadSettings(store);
  const r = await rescoreReceivings(store, { today: new Date(now.getFullYear(), now.getMonth(), now.getDate()) });
  const alerts = await checkReceivingSilence(store, settings, now);
  log(`${r.scored} receiving(s) scored, ${alerts} alert(s)`);
  return { ...r, alerts };
}
