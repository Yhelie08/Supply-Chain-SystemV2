// Purchase Order, from the HomeCartel spec v1.4 (02 Procurement / 03 Purchase Order and Feasibility Gate, 05 Shared Engines 04):
//   one state (draft / sent / acknowledged / closed / cancelled), stamped as events (po.created / sent / acknowledged / closed / cancelled)
//   PO-R5  the buyer is told when a PO is not acknowledged within po_ack_window_days; a late acknowledgement never moves the production clock
//   PO-R8  the PO closes by itself when every line is fully received
//   a PO is never deleted (cancel it); the fields below are written by the server, a widget write to them is dropped
// The Create PO function itself (the feasibility gate, grouping by supplier + mode) is po-create.mjs.
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, idOf, toNum, parseDate, dayDiff, todayDate } from '../../workflows/deluge.mjs';
import { logEvent, parseWhen } from './events.mjs';
import { notify } from './decisions-core.mjs';

const PO = 'Purchase_Order';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const PO_SERVER_ONLY = ['Supplier_Id', 'Supplier_Name', 'Shipment_Mode', 'Earliest_Order_Date', 'Earliest_Target', 'Born_Late', 'Shortfall_Days', 'Feasibility_Note', 'Po_State', 'Cancelled_At',
  'Lines_Raised', 'Lines_Born_Late', 'Po_Category', 'Po_Queue_Rank', 'Po_Priority_Reason', 'Po_Forecast_Pickable', 'Po_Scored_At'];

export function poState(po) {
  const status = text(po.PO_Status);
  if (status === 'Cancelled') return 'cancelled';
  if (status === 'Completed' || text(po.Completed_On) !== '') return 'closed';
  if (text(po.Acknowledge_On) !== '' || status.startsWith('Confirmed')) return 'acknowledged';
  if (text(po.Sent_On) !== '' || status === 'Sent') return 'sent';
  return 'draft';
}

register(PO, {
  beforeUpdate: ({ input, previous }) => {
    for (const f of PO_SERVER_ONLY) delete input[f];
    const rec = { ...previous, ...input };
    input.Po_State = poState(rec);
    if (input.Po_State === 'cancelled' && poState(previous) !== 'cancelled') input.Cancelled_At = zohoNow();
  },
  beforeAdd: ({ input }) => { for (const f of PO_SERVER_ONLY) delete input[f]; },
  beforeDelete: () => { throw new ZohoError(2001, 'A PO is never deleted: cancel it (PO Status = Cancelled).'); },
  afterAdd: async ({ id, record, store, user }) => { await logEvent(store, { recordType: 'po', recordId: id, recordNo: record.PO_No, event: 'po.created', occurredAt: zohoNow(), source: 'user', actor: user || '' }); },
  afterUpdate: async ({ id, record, previous, store, user }) => {
    const log = (event) => logEvent(store, { recordType: 'po', recordId: id, recordNo: record.PO_No, event, occurredAt: zohoNow(), source: 'user', actor: user || '' });
    if (blank(previous.Sent_On) && !blank(record.Sent_On)) await log('po.sent');
    if (blank(previous.Acknowledge_On) && !blank(record.Acknowledge_On)) await log('po.acknowledged');
    if (blank(previous.Completed_On) && !blank(record.Completed_On)) await log('po.closed');
    if (poState(previous) !== 'cancelled' && poState(record) === 'cancelled') await log('po.cancelled');
  },
});

// The supplier acknowledged (set by the supplier portal function, a server write that fires no hooks): stamp the state and the event.
export async function recordPoAcknowledged(store, poId, who = '') {
  const po = await store.getRecordById(PO, poId, { raw: true }).catch(() => null);
  if (!po) return;
  await store.updateRecord(PO, po.ID, { Po_State: 'acknowledged' }, { byForm: true });
  await logEvent(store, { recordType: 'po', recordId: po.ID, recordNo: po.PO_No, event: 'po.acknowledged', occurredAt: text(po.Acknowledge_On) || zohoNow(), source: 'supplier', actor: who, note: 'reported in the supplier portal' });
}

// PO-R5: sent but not acknowledged within the window -> one alert for the buyer (the production clock is not moved).
export async function checkPosAcknowledged(store, settings, today = todayDate()) {
  let n = 0;
  const told = await store.find('App_Notifications', (x) => x.Notification_Type === 'PO Not Acknowledged');
  for (const po of await store.find(PO, (p) => poState(p) === 'sent')) {
    const sent = parseWhen(po.Sent_On)?.date ?? parseDate(po.Sent_On);
    if (!sent) continue;
    const days = dayDiff(today, new Date(sent.getFullYear(), sent.getMonth(), sent.getDate()));
    if (days < settings.po_ack_window_days || told.some((x) => text(x.Source_Record_No) === text(po.PO_No))) continue;
    await notify(store, settings, { ship: { Shipment_No: po.PO_No, ID: po.ID }, type: 'PO Not Acknowledged', message: `${po.PO_No} (${text(po.Supplier_Name) || text(po.PO_Line_Items?.[0]?.Supplier)}) was sent ${days} day(s) ago and the supplier has not acknowledged it.` });
    n++;
  }
  return n;
}

// PO-R8: closes when every line is fully received (accepted quantity of its PR number across the receivings >= the ordered quantity).
export async function closePoIfReceived(store, poNo) {
  const [po] = await store.find(PO, (p) => text(p.PO_No) === text(poNo));
  if (!po || poState(po) === 'closed' || poState(po) === 'cancelled') return false;
  const lines = po.PO_Line_Items || [];
  if (!lines.length) return false;
  const got = new Map();
  for (const r of await store.find('Receiving', (x) => text(x.PO_No) === text(poNo))) for (const l of r.Receiving_Line_Items || []) got.set(text(l.PR_No), (got.get(text(l.PR_No)) || 0) + toNum(l.Accepted_Qty));
  if (!lines.every((l) => (got.get(text(l.PR_No)) || 0) >= toNum(l.QTY) && toNum(l.QTY) > 0)) return false;
  await store.updateRecord(PO, po.ID, { PO_Status: 'Completed', Completed_On: zohoNow(), Po_State: 'closed' }, { byForm: true });
  await logEvent(store, { recordType: 'po', recordId: po.ID, recordNo: po.PO_No, event: 'po.closed', occurredAt: zohoNow(), source: 'system', note: 'every line received' });
  return true;
}
register('Receiving', {
  afterAdd: ({ record, store }) => closePoIfReceived(store, record.PO_No),
  afterUpdate: ({ record, store }) => closePoIfReceived(store, record.PO_No),
});


// ---------- the PO list by category (spec 03 Screens: PO list, Act now / Tell customer / Watch / On track) ----------
const URGENCY = ['broken', 'act_now', 'tell_customer', 'watch', 'on_track', 'blocked'];
// items = one per scored shipment: { poId, category, rank, reason, forecast, done }. A PO takes the most urgent category of its
// shipments that are still going; a PO whose shipments are all received has none.
export async function rollupPoCategories(store, items) {
  const byPo = new Map();
  for (const it of items) {
    if (blank(it.poId) || it.done) continue;
    (byPo.get(String(it.poId)) || byPo.set(String(it.poId), []).get(String(it.poId))).push(it);
  }
  for (const po of await store.find(PO)) {
    const mine = byPo.get(String(po.ID)) || [];
    const cat = [...URGENCY].find((c) => mine.some((m) => m.category === c)) ?? '';
    const best = mine.filter((m) => m.category === cat).sort((a, b) => Number(a.rank ?? 1e9) - Number(b.rank ?? 1e9))[0];
    const forecast = mine.map((m) => text(m.forecast)).filter(Boolean).sort().pop() ?? '';
    const want = { Po_Category: cat, Po_Queue_Rank: best && best.rank !== undefined && best.rank !== '' ? best.rank : '', Po_Priority_Reason: best?.reason ?? '', Po_Forecast_Pickable: forecast };
    const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => text(po[k]) !== text(v)));
    if (Object.keys(diff).length) await store.updateRecord(PO, po.ID, { ...diff, Po_Scored_At: zohoNow() }, { byForm: true });
  }
}

// ---------- read APIs for the PO screen and the Dashboard ----------
const okBody = (message, data) => ({ code: 3000, message, data });
const isoDay = (v) => text(v).slice(0, 10);

// Custom API: born-late rate (spec PO-R3): lines born late / lines raised, per week of the PO date, newest week first.
export async function get_born_late_rate(payload, store) {
  const weeks = Math.min(52, Math.max(1, Number(payload?.weeks) || 4));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; }; // Monday
  const thisWeek = start(today);
  const rows = [];
  for (let w = 0; w < weeks; w++) { const from = new Date(thisWeek); from.setDate(from.getDate() - 7 * w); const to = new Date(from); to.setDate(to.getDate() + 7); rows.push({ week_start: from.toISOString().slice(0, 10), from, to, raised: 0, born_late: 0 }); }
  for (const po of await store.find(PO)) {
    if (text(po.PO_Status) === 'Cancelled' || blank(po.Lines_Raised)) continue;
    const d = new Date(isoDay(po.PO_Date) + 'T00:00:00');
    const w = rows.find((r) => d >= r.from && d < r.to);
    if (w) { w.raised += Number(po.Lines_Raised) || 0; w.born_late += Number(po.Lines_Born_Late) || 0; }
  }
  const raised = rows.reduce((a, r) => a + r.raised, 0), late = rows.reduce((a, r) => a + r.born_late, 0);
  return okBody('Born-late rate.', {
    weeks: rows.map(({ week_start, raised, born_late }) => ({ week_start, raised, born_late, rate: raised ? Math.round((born_late / raised) * 1000) / 10 : null })),
    raised, born_late: late, rate: raised ? Math.round((late / raised) * 1000) / 10 : null,
  });
}

// Custom API: what the PO detail shows about its shipments: planned vs actual dates, the category, the supplier ladder and the event log.
export async function get_po_tracking(payload, store) {
  const poId = text(payload?.poId);
  if (poId === '') return okBody('No PO.', { shipments: [] });
  const ships = (await store.find('Shipments')).filter((s) => text(idOf(s.PO_No)) === poId);
  const out = [];
  for (const s of ships) {
    const id = String(s.ID);
    const ladder = (await store.find('Ladder_Events', (l) => text(l.Record_Id) === id)).sort((a, b) => Number(b.ID) - Number(a.ID));
    const events = (await store.find('Stage_Events', (e) => text(e.Record_Id) === id)).sort((a, b) => Number(b.ID) - Number(a.ID)).slice(0, 30);
    out.push({
      id, shipment_no: text(s.Shipment_No), stage: text(s.Stage), mode: text(s.Shipment_Mode), category: text(s.Category), reason: text(s.Priority_Reason),
      suggested_action: text(s.Suggested_Action), forecast_pickable: text(s.Forecast_Pickable), expected_date: text(s.Supplier_Expected_Date), delay_reason: text(s.Delay_Reason),
      planned: { production_start: text(s.Production_Start_Planned), production_end: text(s.Production_End_Planned), shipout: text(s.Shipout_Planned), arrival: text(s.Arrival_Planned), receive: text(s.Receive_Planned) },
      actual: { production_started: text(s.Production_Started_At), production_finished: text(s.Production_Finished_At), shipped_out: text(s.Shipped_Out_At), arrived_port: text(s.Arrived_Port_At), customs_cleared: text(s.Customs_Cleared_At), arrived_warehouse: text(s.Arrived_Warehouse_At), received: text(s.Received_At) },
      ladder: ladder.map((l) => ({ rung: text(l.Rung), at: text(l.Added_Time), action: text(l.Action_Taken), note: text(l.Note) })),
      events: events.map((e) => ({ event: text(e.Event), occurred_at: text(e.Occurred_At), reported_at: text(e.Reported_At), source: text(e.Source), note: text(e.Note) })),
    });
  }
  return okBody('PO tracking.', { shipments: out });
}
