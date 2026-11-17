// Ship & Track on the Shipments form, from the HomeCartel spec v1.4 (02 Procurement / 04 Ship and Track,
// 05 Shared Engines 01 Sorting, 03 Dates and Forecast, 04 Timestamps and Event Log).
//
// What runs when a widget writes a shipment (hooks only run for widget writes; the server's own writes go through the plain store):
//   before   - drops every field only the server may write (planned dates, actual stamps, queue columns, Order_Date)   [T-2, ST-R1]
//            - turns Report_Event (or a Stage / Shipment_Status change) into a stage event: forward moves only keep the first stamp,
//              a shipout implies "production finished before ..." [ST-R5, T-5], and leaving Production needs a production photo [ST-R3]
//            - recomputes the planned dates from the PO date + 1 and the settings, and copies Order Date and PO Date  [DT-1]
//   after    - writes the Stage_Events rows (occurred + reported time), then re-scores the whole shipment list [SE-3]
// Schedules (server/schedules.mjs): Shipment_Ladder_Daily = the supplier ladder, silence alert, full re-score.
//
// Older rows that have no Stage (imported from Zoho) are scored for the board but never get ladder rungs or silence alerts:
// the spec says an import must not raise hundreds of alerts on day one (T-9, Sorting Engine section 5).
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, idOf, toNum, truthy, parseDate, ymd, addDays, dayDiff, todayDate } from '../../workflows/deluge.mjs';
import { loadSettings, plannedChain, forecastChain, normMode, transitDays, customsDays, supplierDaysFrom, supplierRowFrom } from './plan.mjs';
import { notify, prepareItem, syncAirUpgradeItems, markStaleItems, escalateOverdue } from './decisions-core.mjs';
import { checkPosAcknowledged, rollupPoCategories } from './po-spec.mjs';
import { rollupRr } from './rr-spec.mjs';
import { categorise, rank } from './sorting.mjs';
import { SHIPMENT_EVENTS, SHIPMENT_STAGE_OF, SHIPMENT_STAMP_OF, SHIPMENT_STAGES, occurredFrom, logEvent, parseWhen } from './events.mjs';

const SHIP = 'Shipments';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// Fields a widget may never write (spec T-2, ST-R1): the server computes them.
export const SERVER_ONLY = [
  'Stage', 'Order_Date', 'PO_Date', 'Production_Start_Planned', 'Production_End_Planned', 'Shipout_Planned', 'Arrival_Planned', 'Receive_Planned',
  'Production_Started_At', 'Production_Finished_At', 'Shipped_Out_At', 'Arrived_Port_At', 'Customs_Cleared_At', 'Arrived_Warehouse_At', 'Received_At',
  'Last_Supplier_Update_At', 'Last_Chase_At', 'Category', 'Blocked_Reason', 'Queue_Rank', 'Priority_Reason', 'Suggested_Action', 'Date_Needed',
  'Forecast_Pickable', 'Slack_Days', 'Days_Late', 'Scored_At', 'Risk_Status', 'Supplier_Expected_Date', 'Delay_Reason',
];
const TRANSIENT = ['Report_Event', 'Report_Occurred_At', 'Report_Source', 'Report_Note', 'Target_Change_Reason', 'Report_Delay_Date', 'Report_Delay_Reason'];
const targetPending = new Map(); // shipment id -> { old, new, reason } to log after the save

// The legacy Shipment_Status values the Zoho widgets still use, kept in step with the stage.
const LEGACY_OF_STAGE = { production: 'Pending', shipped_out: 'In Transit', arrived_port: 'In Transit', customs_cleared: 'In Transit', arrived_warehouse: 'Delivered', received: 'Delivered' };
export function effectiveStage(r) {
  if (SHIPMENT_STAGES.includes(r.Stage)) return r.Stage;
  const s = text(r.Shipment_Status);
  if (s === 'Delivered') return 'arrived_warehouse';
  if (['In Transit', 'Arriving In 1 Week'].includes(s) || text(r.Ship_Out_Date) !== '') return 'shipped_out';
  return 'production';
}
const stageIndex = (s) => SHIPMENT_STAGES.indexOf(s);
const toDay = (v) => { const w = parseWhen(v); return w ? new Date(w.date.getFullYear(), w.date.getMonth(), w.date.getDate()) : parseDate(v); };
const same = (a, b) => text(a) === text(b);

// ---------- facts about one shipment ----------
async function poOf(store, ship) {
  const id = idOf(ship.PO_No);
  if (id === '') return null;
  try { return await store.getRecordById('Purchase_Order', id, { raw: true }); } catch { return null; }
}
async function orderDateOf(store, ship) {
  const so = text(ship.Sales_Order);
  let best = null;
  for (const r of so === '' ? [] : await store.find('Sales_Order_Fulfillment', (x) => text(x.SO_No) === so, { criteria: `(SO_No == "${so.replace(/["\\]/g, '')}")` })) {
    const d = toDay(r.SO_Created_Date);
    if (d && (!best || d < best)) best = d;
  }
  // a shipment of a PO with several Sales Orders: the oldest Order Date among its PRs (spec DT-1)
  const prNos = (ship.PO_Shipments || []).map((l) => text(l.PR_No)).filter(Boolean);
  if (prNos.length) {
    const crit = prNos.map((n) => 'PR_No == ' + JSON.stringify(n)).join(' || ');
    for (const p of await store.find('Purchase_Request1', (x) => prNos.includes(text(x.PR_No)), { criteria: '(' + crit + ')' })) {
      const d = toDay(p.Order_Date);
      if (d && (!best || d < best)) best = d;
    }
  }
  return best;
}
const poDateOf = (po) => (po ? toDay(po.PO_Date) || toDay(po.Sent_On) || toDay(po.Added_Time) : null);
const modeOf = (ship) => text(ship.Shipment_Mode) || text((ship.PO_Shipments || []).find((l) => text(l.Shipping_Mode))?.Shipping_Mode) || '';

// The server-owned columns that follow from the PO and the settings.
export async function planPatch(store, ship, settings) {
  const patch = {};
  const po = await poOf(store, ship);
  const poDate = poDateOf(po) || toDay(ship.PO_Date);
  const orderDate = (await orderDateOf(store, ship)) || toDay(ship.Order_Date);
  if (poDate) patch.PO_Date = ymd(poDate);
  if (orderDate) patch.Order_Date = ymd(orderDate);
  const mode = modeOf(ship);
  if (mode !== '' && text(ship.Shipment_Mode) === '') patch.Shipment_Mode = normMode(mode);
  const eff = { ...settings, ...supplierDaysFrom(await store.find('Suppliers'), ship.Supplier) };
  const plan = poDate ? plannedChain(eff, { poDate, productionDays: ship.Required_Days_Lead, mode }) : null;
  if (plan) {
    patch.Production_Start_Planned = ymd(plan.productionStart); patch.Production_End_Planned = ymd(plan.productionEnd);
    patch.Shipout_Planned = ymd(plan.shipout); patch.Arrival_Planned = ymd(plan.arrival); patch.Receive_Planned = ymd(plan.receive);
    // a delay report (SP-R5): the supplier's new date replaces the computed one for the stage it is in, and the stages after it follow
    const promised = toDay(ship.Supplier_Expected_Date);
    if (promised) {
      const inProduction = effectiveStage(ship) === 'production';
      const shipout = inProduction ? promised : plan.shipout;
      const arrival = inProduction ? addDays(promised, transitDays(eff, mode)) : promised;
      if (inProduction) { patch.Production_End_Planned = ymd(addDays(promised, -eff.consolidation_days)); patch.Shipout_Planned = ymd(shipout); }
      patch.Arrival_Planned = ymd(arrival); patch.Receive_Planned = ymd(addDays(arrival, customsDays(eff, mode) + eff.receiving_days));
    }
  }
  return patch;
}


// What one event does to a shipment: the columns to write (the first stamp is kept, T-6; the stage only moves forward) and the
// Stage_Events rows. `gate` = the production photo rule (ST-R3): the buyer and tracker screens enforce it; the supplier-reported
// shipout (server write from the supplier's own copy) cannot refuse an after-save, so it passes gate: false (gap, see the notes).
function buildEvent(previous, rec, event, occurred, source, note, { gate = true } = {}) {
  const cur = effectiveStage(previous);
  const toStage = SHIPMENT_STAGE_OF[event];
  if (gate && cur === 'production' && stageIndex(toStage) > stageIndex('production') && blank(rec.Production_Photos)) {
    throw new ZohoError(2001, 'Add at least one production photo before the shipment leaves Production.');
  }
  const events = [];
  const patch = {};
  const stamp = (ev, when, bound) => {
    const col = SHIPMENT_STAMP_OF[ev];
    if (blank(previous[col])) patch[col] = when; // T-6: the first stamp stays
    events.push({ event: ev, occurredAt: when, bound, source: ev === event ? source : 'system', note: ev === event ? note : `implied by ${event}` });
  };
  // ST-R5 / T-5: a later event implies the earlier ones (but not "production started", which only the supplier knows)
  for (const ev of SHIPMENT_EVENTS) {
    if (ev === event) break;
    if (ev === 'production_started') continue;
    if (blank(previous[SHIPMENT_STAMP_OF[ev]])) stamp(ev, occurred.text, 'before');
  }
  stamp(event, occurred.text, occurred.bound);
  const stage = stageIndex(toStage) > stageIndex(cur) ? toStage : cur;
  patch.Stage = stage;
  const legacy = LEGACY_OF_STAGE[stage];
  if (stage !== 'production' && text(previous.Shipment_Status) !== legacy) { patch.Previous_Status = previous.Shipment_Status; patch.Shipment_Status = legacy; }
  if (source === 'supplier') patch.Last_Supplier_Update_At = zohoNow();
  if (event === 'shipped_out' && blank(rec.Ship_Out_Date)) patch.Ship_Out_Date = ymd(toDay(occurred.text));
  if (event === 'arrived_warehouse' && blank(rec.Arrival_Date)) patch.Arrival_Date = ymd(toDay(occurred.text));
  return { patch, events };
}

// A delay report (spec SP-R4 / SP-R5): the new expected date and a reason. The date is the supplier's promise for the next stage (ship
// out while the shipment is in Production, arrival after that). Nothing else moves: the target date is never changed by a delay (DT-5).
const LAST_STAGES = ['arrived_warehouse', 'received'];
function buildDelay(ship, dateText, reason, source) {
  const date = toDay(dateText);
  if (!date) throw new ZohoError(2001, 'Give the new expected date of the delay.');
  if (text(reason).trim() === '') throw new ZohoError(2001, 'Give a reason for the delay.');
  if (date < todayDate()) throw new ZohoError(2001, 'The new expected date cannot be in the past.');
  if (LAST_STAGES.includes(effectiveStage(ship))) throw new ZohoError(2001, 'This shipment has already arrived at the warehouse.');
  const patch = { Supplier_Expected_Date: ymd(date), Delay_Reason: text(reason).trim() };
  if (source === 'supplier') patch.Last_Supplier_Update_At = zohoNow();
  const was = toDay(ship.Supplier_Expected_Date) || toDay(effectiveStage(ship) === 'production' ? ship.Shipout_Planned : ship.Arrival_Planned);
  return { patch, event: { event: 'delay_reported', occurredAt: zohoNow(), bound: 'exact', source, note: `new expected date ${ymd(date)}${was ? ` (was ${ymd(was)})` : ''}: ${text(reason).trim()}` } };
}

// What the supplier's own copy of a shipment shows on the Production screen. Only what the supplier may see (SP-R1): the PO number, the
// lines (SKU, item, quantity), the planned production dates and the stage. Called after every change of the shipment.
const PORTAL_COPIES = ['Tony_Shipment', 'Fenteng_Shipment'];
export async function refreshSupplierView(store, shipId) {
  const ship = await store.getRecordById(SHIP, shipId, { raw: true }).catch(() => null);
  if (!ship) return;
  const stage = effectiveStage(ship);
  const status = stage !== 'production' ? 'shipped' : !blank(ship.Production_Finished_At) ? 'finished' : !blank(ship.Production_Started_At) ? 'in_production' : 'not_started';
  const po = await poOf(store, ship);
  const view = {
    Prod_Po_No: po ? text(po.PO_No) : '', Prod_Status: status,
    Prod_Planned_Start: text(ship.Production_Start_Planned), Prod_Planned_End: text(ship.Production_End_Planned),
    Prod_Started_On: text(ship.Production_Started_At), Prod_Finished_On: text(ship.Production_Finished_At), Prod_Expected_Date: text(ship.Supplier_Expected_Date),
    Prod_Lines: (ship.PO_Shipments || []).map((l) => `${text(l.SKU)} ${text(l.Item_Name)} x${text(l.Shipment_QTY) || text(l.Ordered_QTY)}`.trim()).join('\n'),
  };
  for (const form of PORTAL_COPIES) {
    for (const copy of await store.find(form, (c) => text(c.Parent_Shipment_ID) === String(shipId), { criteria: `(Parent_Shipment_ID == "${String(shipId).replace(/["\\]/g, '')}")` })) {
      const patch = Object.fromEntries(Object.entries(view).filter(([k, v]) => text(copy[k]) !== text(v)));
      if (Object.keys(patch).length) await store.updateRecord(form, copy.ID, patch, { byForm: true });
    }
  }
}

// The deposit of the PO of a shipment, as a sentence for the day-3 decision (spec 04: "deposit paid (amount, buyer only)").
export async function depositNote(store, ship) {
  const po = await poOf(store, ship);
  if (!po) return 'No PO, so no deposit.';
  const paid = truthy(po.Deposit_Paid);
  const amount = toNum(po.Deposit_Amount);
  return paid ? `Deposit paid${amount > 0 ? `: ${amount}` : ''} on ${text(po.PO_No)}.` : `No deposit paid on ${text(po.PO_No)}.`;
}

// For the server's own writers (the supplier's delay report, Receiving, ...): same rules as the widget path.
export async function reportShipmentDelay(store, shipId, { date, reason, source = 'user' } = {}) {
  const ship = await store.getRecordById(SHIP, shipId, { raw: true }).catch(() => null);
  if (!ship) throw new ZohoError(2001, 'Shipment not found.');
  const { patch, event } = buildDelay(ship, date, reason, source);
  await store.updateRecord(SHIP, shipId, { ...patch, ...(await planPatch(store, { ...ship, ...patch }, await loadSettings(store))) }, { byForm: true });
  await logEvent(store, { recordType: 'shipment', recordId: shipId, recordNo: ship.Shipment_No, event: `shipment.${event.event}`, occurredAt: event.occurredAt, bound: event.bound, source: event.source, note: event.note });
  await rescoreShipments(store);
  await refreshSupplierView(store, shipId);
  return true;
}

// For the server's own writers (the supplier's shipout sync, Receiving): records the event through the plain store.
// `occurredAt` blank = now. A "before" bound means only the order of events is known (spec T-5).
export async function applyShipmentEvent(store, shipId, event, { occurredAt = '', source = 'system', note = '', bound = 'exact', gate = false } = {}) {
  const ship = await store.getRecordById(SHIP, shipId, { raw: true }).catch(() => null);
  if (!ship || !SHIPMENT_EVENTS.includes(event)) return false;
  const occurred = { ...occurredFrom(occurredAt), bound };
  const { patch, events } = buildEvent(ship, ship, event, occurred, source, note, { gate });
  await store.updateRecord(SHIP, shipId, { ...patch, ...(await planPatch(store, { ...ship, ...patch }, await loadSettings(store))) }, { byForm: true });
  for (const e of events) await logEvent(store, { recordType: 'shipment', recordId: shipId, recordNo: ship.Shipment_No, event: `shipment.${e.event}`, occurredAt: e.occurredAt, bound: e.bound, source: e.source, note: e.note });
  await rescoreShipments(store);
  await refreshSupplierView(store, shipId);
  return true;
}

// ---------- the hooks ----------
const pending = new Map(); // shipment id -> events to write after the save

async function beforeSave({ input, previous, id, store, user }) {
  const adding = !previous;
  const settings = await loadSettings(store);
  const asked = { status: text(input.Shipment_Status), event: text(input.Report_Event), targetReason: text(input.Target_Change_Reason).trim() };
  const reportAt = input.Report_Occurred_At, source = text(input.Report_Source) || 'user', note = text(input.Report_Note);
  const delay = { date: text(input.Report_Delay_Date), reason: text(input.Report_Delay_Reason) };
  for (const f of SERVER_ONLY) delete input[f];
  for (const f of TRANSIENT) if (f in input) input[f] = '';

  const rec = { ...(previous || {}), ...input };
  if (adding) input.Stage = 'production';
  // DT-4: changing a promise needs a reason; it is logged with the old and the new date (the forecast never does this by itself, DT-5)
  if (!adding && 'Target_Date' in input && !blank(previous.Target_Date) && text(input.Target_Date) !== text(previous.Target_Date)) {
    if (asked.targetReason === '') throw new ZohoError(2001, 'Give a reason for changing the target date.');
    targetPending.set(String(id), { old: text(previous.Target_Date), new: text(input.Target_Date), reason: asked.targetReason });
  }

  // a stage event asked for: Report_Event, or a Shipment_Status change made the old way (Stage itself is server-only)
  let event = asked.event;
  if (!event && !adding) {
    if (asked.status && asked.status !== text(previous.Shipment_Status)) {
      const cur = effectiveStage(previous);
      if (asked.status === 'In Transit' && stageIndex(cur) < stageIndex('shipped_out')) event = 'shipped_out';
      else if (asked.status === 'Delivered' && stageIndex(cur) < stageIndex('arrived_warehouse')) event = 'arrived_warehouse';
    }
  }
  if (event) {
    if (adding) throw new ZohoError(2001, 'Save the shipment first, then report an event on it.');
    if (!SHIPMENT_EVENTS.includes(event)) throw new ZohoError(2001, `Unknown event "${event}".`);
    const occurred = occurredFrom(reportAt);
    const { patch, events } = buildEvent(previous, rec, event, occurred, source, note, { gate: true });
    Object.assign(input, patch);
    pending.set(String(id), events.map((e) => ({ ...e, actor: user || '' })));
    input.Supplier_Expected_Date = ''; // a stage that happened replaces the old promise
  }
  if (delay.date !== '' || delay.reason.trim() !== '') {
    if (adding) throw new ZohoError(2001, 'Save the shipment first, then report a delay on it.');
    const { patch, event: dev } = buildDelay({ ...rec, ...input }, delay.date, delay.reason, source);
    Object.assign(input, patch);
    pending.set(String(id), [...(pending.get(String(id)) || []), { ...dev, actor: user || '' }]);
  }
  Object.assign(input, await planPatch(store, { ...rec, ...input }, settings));
}

async function afterSave({ id, store, user }) {
  const t = targetPending.get(String(id));
  if (t) {
    targetPending.delete(String(id));
    const ship = await store.getRecordById(SHIP, id, { raw: true });
    await store.addRecord('Target_Date_Changes', { Record_Type: 'shipment', Record_Id: String(id), Record_No: ship.Shipment_No, Old_Date: t.old, New_Date: t.new, Reason: t.reason, Changed_By: user || '', Customer_Told: false, Changed_At: zohoNow(), Via: 'person' });
  }
  const events = pending.get(String(id));
  if (events) {
    pending.delete(String(id));
    const ship = await store.getRecordById(SHIP, id, { raw: true });
    for (const e of events) await logEvent(store, { recordType: 'shipment', recordId: id, recordNo: ship.Shipment_No, event: `shipment.${e.event}`, occurredAt: e.occurredAt, bound: e.bound, source: e.source, actor: e.actor, note: e.note });
  }
  await rescoreShipments(store);
  await refreshSupplierView(store, id);
}

register(SHIP, { beforeAdd: beforeSave, beforeUpdate: beforeSave, afterAdd: afterSave, afterUpdate: afterSave });

// A PR put on hold (or released / cancelled) changes which shipments are blocked: re-score at once, not at the next nightly run.
register('Purchase_Request1', {
  afterUpdate: async ({ record, previous, store }) => {
    if (text(record.Hold_Status) !== text(previous?.Hold_Status)) await rescoreShipments(store);
  },
});

// A buyer who writes what they did on a ladder rung (called the supplier) stamps the last chase, as a side effect (T-4).
register('Ladder_Events', {
  afterUpdate: async ({ record, previous, store }) => {
    if (blank(previous?.Action_Taken) && !blank(record.Action_Taken) && !blank(record.Record_Id)) {
      await store.updateRecord(SHIP, record.Record_Id, { Last_Chase_At: zohoNow() }, { byForm: true });
      await logEvent(store, { recordType: 'shipment', recordId: record.Record_Id, recordNo: record.Record_No, event: 'shipment.chased', occurredAt: zohoNow(), source: 'user', note: text(record.Action_Taken) });
    }
  },
});

// ---------- scoring (Sorting Engine, Procurement) ----------
const forecast_of = (rows, ship) => { const r = rows.find((x) => x.s === ship); return r?.forecast ? ymd(r.forecast.pickable) : ''; };
async function heldPrs(store) {
  const held = new Map();
  for (const pr of await store.find('Purchase_Request1', (r) => ['On Hold', 'Cancelled'].includes(text(r.Hold_Status)), { criteria: '(Hold_Status == "On Hold" || Hold_Status == "Cancelled")' })) held.set(text(pr.PR_No), text(pr.Hold_Status));
  return held;
}

// Re-scores every open shipment: the whole list is ranked, never only what is on screen (SE-3). Writes only what changed.
// full = also re-read the PO and the Sales Order dates (the nightly run); the per-save run uses the dates already on the shipment.
// settings = values to try instead of the saved ones; dryRun = write nothing and answer what each shipment would become (the
// "show the effect before saving" of the Control Panel, CP-R4).
export async function rescoreShipments(store, { today = todayDate(), full = false, settings: tryOut = null, dryRun = false } = {}) {
  const settings = await loadSettings(store, tryOut);
  const supplierRows = await store.find('Suppliers');
  const [ships, held, ladder] = [await store.find(SHIP), await heldPrs(store), await store.find('Ladder_Events')];
  const rungOf = new Map();
  for (const l of ladder) rungOf.set(text(l.Record_Id), Math.max(rungOf.get(text(l.Record_Id)) || 0, toNum(l.Rung)));

  // a shipment is BROKEN while an open Replacement Request points at it (RR.Cloned_Shipment_No), spec 06 RR-R4
  const brokenBy = new Map((await store.find('Replacement_Request')).filter((r) => !['Closed', 'Completed', 'Cancelled'].includes(text(r.RR_Status)) && text(r.Cloned_Shipment_No) !== '').map((r) => [text(r.Cloned_Shipment_No), text(r.RR_No)]));
  const rows = [];
  for (const s of ships) {
    const row = { ...s };
    if (full) Object.assign(row, await planPatch(store, s, settings));
    const stage = effectiveStage(s);
    const d = (v) => toDay(v);
    const poDate = d(row.PO_Date);
    const mode = modeOf(row);
    const eff = { ...settings, ...supplierDaysFrom(supplierRows, s.Supplier) };
    const forecast = forecastChain(eff, {
      poDate, productionDays: s.Required_Days_Lead, mode, today,
      expected: effectiveStage(s) === 'production' ? { shipout: s.Supplier_Expected_Date } : { arrival: s.Supplier_Expected_Date },
      actual: { production_started: s.Production_Started_At, production_finished: s.Production_Finished_At, shipped_out: s.Shipped_Out_At || s.Ship_Out_Date, arrived_port: s.Arrived_Port_At, arrived_warehouse: s.Arrived_Warehouse_At || (stage === 'arrived_warehouse' ? s.Arrival_Date : null) },
    });
    const prNos = (s.PO_Shipments || []).map((l) => text(l.PR_No)).filter(Boolean);
    const heldNos = prNos.filter((n) => held.has(n));
    // days late (spec ladder): production not started by PO + 1, then production not finished by its planned end, then arrival overdue
    let daysLate = 0;
    const started = !blank(s.Production_Started_At), finished = !blank(s.Production_Finished_At);
    if (stage === 'production' && poDate && !started) daysLate = Math.max(0, dayDiff(today, addDays(poDate, 1)));
    else if (stage === 'production' && !finished && d(row.Production_End_Planned)) daysLate = Math.max(0, dayDiff(today, d(row.Production_End_Planned)));
    else if (stage === 'shipped_out' && d(row.Arrival_Planned)) daysLate = Math.max(0, dayDiff(today, d(row.Arrival_Planned)));
    const stamp = d(s[SHIPMENT_STAMP_OF[{ production: 'production_started', shipped_out: 'shipped_out', arrived_port: 'arrived_port', customs_cleared: 'customs_cleared', arrived_warehouse: 'arrived_warehouse', received: 'received' }[stage]]]) || d(s.Added_Time);
    const scored = categorise({
      stage, orderDate: d(row.Order_Date) || d(s.Added_Time), target: d(s.Target_Date), forecastPickable: forecast?.pickable, mode,
      broken: brokenBy.get(text(s.Shipment_No)) || '',
      held: heldNos.length ? `PR ${heldNos.join(', ')} is ${held.get(heldNos[0])}` : '', noSupplier: text(s.Supplier) === '',
      ladderRung: rungOf.get(String(s.ID)) || 0, daysLate, productionStarted: started, productionFinished: finished,
      arrivalPlanned: d(row.Arrival_Planned), lastSupplierUpdate: s.Last_Supplier_Update_At ? dayDiff(today, d(s.Last_Supplier_Update_At)) : null,
      stageSince: stamp ? Math.max(0, dayDiff(today, stamp)) : null,
    }, settings, today);
    rows.push({ s, row, scored, daysLate, forecast, stage, mode, poDate, target: d(s.Target_Date), item: { id: String(s.ID), no: s.Shipment_No, category: scored.category, orderDate: d(row.Order_Date) || d(s.Added_Time), target: d(s.Target_Date), noRank: stage === 'received' } });
  }
  const ranks = rank(rows.map((r) => r.item));

  if (dryRun) return { scored: rows.length, results: rows.map((r) => ({ id: String(r.s.ID), no: r.s.Shipment_No, category: r.scored.category, slack_days: r.scored.slack_days })) };
  let changed = 0;
  for (const { s, row, scored, daysLate, forecast, item } of rows) {
    const want = {
      Category: scored.category, Blocked_Reason: scored.blocked_reason, Queue_Rank: ranks.get(item.id) ?? '', Priority_Reason: scored.priority_reason,
      Suggested_Action: scored.suggested_action, Date_Needed: scored.date_needed ?? '', Forecast_Pickable: forecast ? ymd(forecast.pickable) : '',
      Slack_Days: scored.slack_days ?? '', Days_Late: daysLate,
      // Risk Status used to be a manual pick; it now follows the forecast: misses the date needed = Delayed, little slack = At Risk
      Risk_Status: item.noRank || scored.slack_days == null ? '' : scored.slack_days < 0 ? 'Delayed' : scored.slack_days <= settings.proc_watch_slack_days ? 'At Risk' : 'On Track',
    };
    if (full) for (const k of ['PO_Date', 'Order_Date', 'Production_Start_Planned', 'Production_End_Planned', 'Shipout_Planned', 'Arrival_Planned', 'Receive_Planned']) if (row[k] !== undefined && !same(row[k], s[k])) want[k] = row[k];
    const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => !same(v, s[k])));
    if (Object.keys(diff).length === 0) continue;
    diff.Scored_At = zohoNow();
    await store.updateRecord(SHIP, s.ID, diff, { byForm: true });
    changed++;
  }
  // the PO list by category: each PO takes the most urgent category of its shipments (spec 03, PO list)
  await rollupPoCategories(store, rows.map(({ s, scored, item }) => ({ poId: idOf(s.PO_No), category: scored.category, rank: ranks.get(item.id), reason: scored.priority_reason, forecast: forecast_of(rows, s), done: ['received'].includes(effectiveStage(s)) })));
  // the replacement requests: their rank and the forecast of their replacement shipment
  await rollupRr(store, rows.map((r) => ({ ...r.s, Forecast_Pickable: r.forecast ? ymd(r.forecast.pickable) : '' })));
  // decisions the engine prepares, and the ones that went stale (spec 05/06 AQ-4)
  const prepared = await syncAirUpgradeItems(store, settings, rows, today);
  const stale = await markStaleItems(store, new Map(rows.map((r) => [String(r.s.ID), { ...r.s, Category: r.scored.category }])), effectiveStage);
  return { scored: rows.length, changed, prepared, stale };
}

// ---------- the supplier ladder, silence alert, full re-score (daily) ----------
const RUNG_TEXT = { 1: 'Call the supplier', 2: 'Ask the supplier for a discount in writing', 3: 'Decide: cancel and re-source, or hold' };

export async function runShipmentLadder(store, { log = () => {}, today = todayDate() } = {}) {
  const settings = await loadSettings(store);
  const out = { rungs: 0, decisions: 0, overdue: 0 };
  const suppliers = await store.find('Suppliers');
  const have = await store.find('Ladder_Events');
  const fired = (id, kind, rung) => have.some((l) => text(l.Record_Id) === String(id) && l.Kind === kind && toNum(l.Rung) === rung);
  const notices = await store.find('App_Notifications', (n) => n.Notification_Type === 'Shipment Overdue');
  await rescoreShipments(store, { today, full: true });

  for (const s of await store.find(SHIP)) {
    if (!SHIPMENT_STAGES.includes(s.Stage)) continue; // older rows: no alerts (T-9)
    const poDate = toDay(s.PO_Date);
    const stage = s.Stage;
    let kind = '', late = 0;
    if (stage === 'production' && poDate && blank(s.Production_Started_At)) { kind = 'production_start'; late = dayDiff(today, addDays(poDate, 1)); }
    else if (stage === 'production' && blank(s.Production_Finished_At) && toDay(s.Production_End_Planned)) { kind = 'production_finish'; late = dayDiff(today, toDay(s.Production_End_Planned)); }
    if (kind && late >= 1) {
      for (const rung of [1, 2, 3]) {
        if (late < settings[`ladder_rung${rung}_days`] || fired(s.ID, kind, rung)) continue;
        const action = rung === 3 && kind === 'production_finish' ? 'Decide: hold, or upgrade the mode' : RUNG_TEXT[rung];
        await store.addRecord('Ladder_Events', { Record_Type: 'shipment', Record_Id: String(s.ID), Record_No: s.Shipment_No, PO_No: text((await poOf(store, s))?.PO_No), Supplier: s.Supplier, Kind: kind, Rung: rung, Days_Late: late, Fired_At: zohoNow(), Action_Text: action });
        await notify(store, settings, { ship: s, type: 'Supplier Ladder', message: `${s.Shipment_No} (${text(s.Supplier)}): ${kind === 'production_start' ? 'production has not started' : 'production is not finished'}, ${late} day(s) late. Rung ${rung}: ${action}.` });
        out.rungs++;
        if (rung === 3) {
          // LD-R2: never an automatic cancel; day 3 is a prepared decision
          const options = kind === 'production_start' ? ['cancel_resource', 'hold'] : ['hold', 'upgrade_mode'];
          const main = truthy(supplierRowFrom(suppliers, s.Supplier)?.Is_Main_Supplier);
          await prepareItem(store, settings, {
            kind: 'ladder_day3', ship: s, options, payload: { kind, rung, days_late: late, main_supplier: main },
            summary: `${s.Shipment_No} (${text(s.Supplier)}): ${late} days late. Options: ${options.join(' / ')}.${main ? ' Main supplier: the supervisor decides too.' : ''} ${await depositNote(store, s)} Taobao alternative is not recorded yet.`,
          });
          out.decisions++;
        }
      }
    }
    // silence is an alert: shipped out, not at the port within transit days + 3 (expected window, spec Timestamps)
    if (stage === 'shipped_out') {
      const out_ = toDay(s.Shipped_Out_At) || toDay(s.Ship_Out_Date);
      if (out_ && today > addDays(out_, transitDays(settings, modeOf(s)) + settings.arrival_overdue_grace_days) && !notices.some((n) => text(n.Source_Record_No) === text(s.Shipment_No))) {
        await notify(store, settings, { ship: s, type: 'Shipment Overdue', message: `${s.Shipment_No} has not arrived at the port. Ask the forwarder for tracking.` });
        out.overdue++;
      }
    }
  }
  out.escalated = await escalateOverdue(store, settings);
  out.unacknowledged = await checkPosAcknowledged(store, settings, today);
  log(`${out.rungs} ladder rung(s), ${out.decisions} decision(s), ${out.overdue} overdue alert(s), ${out.escalated} escalated, ${out.unacknowledged} PO(s) not acknowledged`);
  return out;
}
