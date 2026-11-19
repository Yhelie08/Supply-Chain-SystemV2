// The event log (spec 05 Shared Engines / 04 Timestamps and Event Log): Stage_Events.
//   T-2  stamps are set by the server; nothing a user types becomes a stamp
//   T-3  every event stores when it happened (Occurred_At) and when the system was told (Reported_At)
//   T-5  when only the order of events is known, a bound ("before") is stored, never a made-up time
//   T-6  the first time a record enters a stage is kept; a second visit is a new row with Visit_No + 1
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, parseDate, todayDate } from '../../workflows/deluge.mjs';

export const SHIPMENT_EVENTS = ['production_started', 'production_finished', 'shipped_out', 'arrived_port', 'customs_cleared', 'arrived_warehouse', 'received'];
// event -> the stage the shipment is in after it, and the column on the shipment that keeps the first stamp
export const SHIPMENT_STAGE_OF = {
  production_started: 'production', production_finished: 'production', shipped_out: 'shipped_out', arrived_port: 'arrived_port',
  customs_cleared: 'customs_cleared', arrived_warehouse: 'arrived_warehouse', received: 'received',
};
export const SHIPMENT_STAMP_OF = {
  production_started: 'Production_Started_At', production_finished: 'Production_Finished_At', shipped_out: 'Shipped_Out_At', arrived_port: 'Arrived_Port_At',
  customs_cleared: 'Customs_Cleared_At', arrived_warehouse: 'Arrived_Warehouse_At', received: 'Received_At',
};
export const SHIPMENT_STAGES = ['production', 'shipped_out', 'arrived_port', 'customs_cleared', 'arrived_warehouse', 'received'];

// "2026-11-10", "2026-11-10 14:30[:05]" or Zoho's "2026-11-10 02:30:05 PM" -> { date: Date (that moment), dateOnly }.
export function parseWhen(v) {
  const s = String(v ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(s);
  if (!m) return null;
  let h = m[4] == null ? 0 : Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: m[4] == null };
}
const pad = (n) => String(n).padStart(2, '0');
const dayText = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// What the person says happened -> the text to store, and the Date. Blank = now. A future moment is refused.
export function occurredFrom(input, now = new Date()) {
  if (blank(input)) return { text: zohoNow(now), date: now, bound: 'exact' };
  const w = parseWhen(input);
  if (!w) throw new ZohoError(2001, `"${input}" is not a date. Use yyyy-MM-dd or yyyy-MM-dd HH:mm:ss.`);
  const tooLate = w.dateOnly ? w.date > todayDate() : w.date > now;
  if (tooLate) throw new ZohoError(2001, 'The event cannot have happened in the future. Leave the date blank if it happened just now.');
  return { text: w.dateOnly ? dayText(w.date) : zohoNow(w.date), date: w.date, bound: 'exact' };
}

export async function eventsOf(store, recordType, recordId) {
  return store.find('Stage_Events', (r) => r.Record_Type === recordType && String(r.Record_Id) === String(recordId));
}

// Writes one event row. Returns the row's visit number. `event` is the full name, e.g. "shipment.shipped_out".
export async function logEvent(store, { recordType, recordId, recordNo, event, occurredAt, bound = 'exact', source = 'user', actor = '', note = '' }) {
  const before = (await eventsOf(store, recordType, recordId)).filter((r) => r.Event === event);
  const visit = before.length + 1;
  await store.addRecord('Stage_Events', {
    Record_Type: recordType, Record_Id: String(recordId), Record_No: recordNo ?? '', Event: event, Occurred_At: occurredAt, Reported_At: zohoNow(),
    Occurred_Bound: bound, Source: source, Actor: actor, Visit_No: visit, Note: note,
  });
  return visit;
}

// "Days waiting" helper used by the sorting engine's aging guard and by the board: whole days between two stamps.
export const daysBetween = (a, b) => {
  const x = parseDate(a), y = parseDate(b);
  return x && y ? Math.round((y - x) / 86400000) : null;
};
