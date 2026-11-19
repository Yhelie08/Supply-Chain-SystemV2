// Failure, Redelivery and the Delivery Exception Queue (spec v1.4, Delivery 05). The general FR-R1-R5 pattern.
//
// 2026-11-18 owner correction: createRedeliveryJob used to create the redelivery appointment itself, straight
// away, and only raised a Dispatch exception for 2 of the 11 failure reason codes (damaged_in_transit, refused)
// — every other code bypassed dispatcher review entirely. The owner's instinct ("dapat sa exception ito
// pumunta, kasi doon ito ireresolved") was right: every failure reason code now raises a Dispatch-stage
// exception and nothing else; the redelivery itself is created only when that exception is resolved, by
// exception-queue.mjs's existing EXC_Resolve_Sync Dispatch-stage requeue (the same mechanism dispatch.mjs's own
// "Failed pre-delivery gate" exception already resolves into). One mechanism creates a redelivery, not two.
//
// Not built here: FR-R3's "only the lines still owed" (no per-line quantity model exists on an appointment, the
// same gap noted for the Load Sheet's Box_Count — a redelivery copies every line, same simplification as the
// old EXC_Resolve_Sync requeue already makes); the Delivery Exception Queue's unsigned-remote-delivery row (no
// remote signature flow). The permit-pending-near-target row was added 2026-11-19 (read from the Site_Checklist
// grid in getDeliveryExceptionQueue, window = permit_warn_days).
import { zohoNow, ZohoError } from '../../criteria.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { SA, raiseException, policyReader, toLong, BROKEN_FAILURE_CODES } from './scheduling.mjs';
import { stampJobStatus } from './job-status.mjs';
import { permitPending } from './site-checklist.mjs';

const EXC = 'DMS_Exception_Queue';
const AQ = 'Approval_Queue';
const CATALOGUE = 'Delivery_Failure_Reasons';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const refuse = (message) => { throw new ZohoError(2001, message); };
const DONE_STATUSES = new Set(['Completed', 'Failed']);

// "2026-11-18 03:45:00 PM" -> Date. Local to this file (same reasoning as earliest-slot.mjs's own parseZoho).
function parseZoho(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(text(v));
  if (!m) return null;
  let h = m[4] == null ? 0 : Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
}

// The spec's own [DEFAULT list, Admin-editable]. Delivery_Failure_Reasons is the edit surface — see its own form
// header; this table being empty (true until someone edits it) means the default applies.
export const DEFAULT_FAILURE_REASONS = [
  { Code: 'not_home', Reason: 'Customer / receiver not on site', Next_Step: 'Call customer, reschedule' },
  { Code: 'refused', Reason: 'Customer refused (wrong item, finish, changed mind)', Next_Step: 'Exception + CS call; RR or return' },
  { Code: 'wrong_address', Reason: 'Address wrong or not found', Next_Step: 'Sales agent fixes address, reschedule' },
  { Code: 'gate_refused', Reason: 'Gate / subdivision / building refused entry', Next_Step: 'Get permit / gate pass, reschedule' },
  { Code: 'unreachable', Reason: 'Cannot reach customer by phone', Next_Step: 'Sales agent contacts, reschedule' },
  { Code: 'site_not_ready', Reason: 'Site not ready (no support, ceiling not done, other trades working)', Next_Step: 'Reschedule after customer confirms; check site checklist' },
  { Code: 'weather_road', Reason: 'Flooding, road closure', Next_Step: 'Reschedule, same priority' },
  { Code: 'damaged_in_transit', Reason: 'Item damaged on the way', Next_Step: 'Exception (fault origin transit) + RR' },
  { Code: 'vehicle_problem', Reason: 'Vehicle breakdown', Next_Step: 'Reschedule; truck maintenance record' },
  { Code: 'out_of_time', Reason: 'Team ran out of time', Next_Step: 'Reschedule next available, top of queue' },
  { Code: 'other', Reason: 'Other (notes required)', Next_Step: 'Dispatcher decides' },
];

// A row's own presence in the table is what makes it valid — "Active" is there for an admin to see at a
// glance, not a second gate (deleting a row is how a code is retired, same as every other catalogue in this app).
export async function failureReasonCodes(store) {
  const rows = await store.find(CATALOGUE);
  return rows.length ? rows.map((r) => text(r.Code)) : DEFAULT_FAILURE_REASONS.map((r) => r.Code);
}

async function prepareApproval(store, { kind, sa, summary, options, payload }) {
  const existing = await store.find(AQ, (i) => i.Kind === kind && text(i.Record_Id) === String(sa.ID) && i.Status === 'pending');
  if (existing.length) return existing[0].ID;
  const policy = await policyReader(store);
  const slaHours = toLong(policy('approval_sla_hours'), 24);
  return store.addRecord(AQ, {
    Kind: kind, Record_Type: 'service_appointment', Record_Id: String(sa.ID), Record_No: text(sa.Sales_Order),
    Summary: summary, Options: JSON.stringify(options), Payload: JSON.stringify(payload),
    Prepared_By_Type: 'system', Status: 'pending', Due_At: zohoNow(new Date(Date.now() + slaHours * 3600000)),
  });
}

// FR-R1: never edit and retry a failed job (this function never writes Appointment_Status or creates the
// redelivery itself — see the file header, 2026-11-18). FR-R2's "keeps the original Order Date, target and
// Broken category" is now exception-queue.mjs's job, at resolve time (its own Dispatch-stage requeue copy).
const FAILED_VISIT_PREFIX = 'Failed visit: ';
export async function createRedeliveryJob(store, failedSaId, { reasonCode, notes = '', user = '' } = {}) {
  const failed = await store.getRecordById(SA, failedSaId, { raw: true });
  if (!failed) refuse('Service Appointment not found.');
  if (!DONE_STATUSES.has(text(failed.Appointment_Status))) refuse('Only a job that is already Completed or Failed can get a redelivery.');
  const [already] = await store.find(SA, (r) => String(r.Rescheduled_From_SA) === String(failedSaId));
  if (already) refuse(`A redelivery already exists for this job (${text(already.Sales_Order)}).`);
  const [openExc] = await store.find(EXC, (r) => String(r.Sales_Order_Reference) === String(failedSaId) && r.Status === 'Open' && text(r.Exception_Reason).startsWith(FAILED_VISIT_PREFIX));
  if (openExc) refuse('A redelivery exception is already open for this job; it gets created once that is resolved in the Exception Queue.');
  const validCodes = await failureReasonCodes(store);
  if (!validCodes.includes(reasonCode)) refuse(`"${reasonCode}" is not one of the failure reason codes: ${validCodes.join(', ')}.`);
  if (reasonCode === 'other' && blank(notes)) refuse('Notes are required for failure reason "other".');

  await store.updateRecord(SA, failedSaId, { Failure_Reason_Code: reasonCode, Failure_Notes: notes }, { byForm: true, user });

  // Every reason code now raises (not just damaged_in_transit/refused): the redelivery is created only when a
  // dispatcher resolves this in the Exception Queue, same as every other Dispatch-stage exception.
  const severity = BROKEN_FAILURE_CODES.has(reasonCode) ? 'High' : 'Medium';
  const raised = await raiseException(store, failed, { stage: 'Dispatch', reason: `${FAILED_VISIT_PREFIX}${reasonCode}`, severity }, user);
  return { raisedException: raised };
}

// FR-R4 (silence alert): done (partial/failed) with no redelivery scheduled within 2 days. A job only counts
// once it has a Failure_Reason_Code (a normal one-visit Completed job owes nothing). "No redelivery yet" means
// no other appointment's Rescheduled_From_SA points back at it.
export async function checkRedeliverySilence(store, { now = new Date() } = {}) {
  const policy = await policyReader(store);
  const days = toLong(policy('redelivery_silence_days'), 2);
  const cutoff = new Date(now.getTime() - days * 86400000);
  const all = await store.find(SA, (r) => DONE_STATUSES.has(text(r.Appointment_Status)) && !blank(r.Failure_Reason_Code));
  let alerted = 0;
  for (const sa of all) {
    const doneAt = parseZoho(sa.Job_Done_At);
    if (!doneAt || doneAt > cutoff) continue; // unknown or not old enough yet: never alert on a guess.
    const [redone] = await store.find(SA, (r) => String(r.Rescheduled_From_SA) === String(sa.ID));
    if (redone) continue;
    const raised = await raiseException(store, sa, { stage: 'Delivery', reason: `No redelivery scheduled within ${days} days`, severity: 'Medium' });
    if (raised) alerted++;
  }
  return { checked: all.length, alerted };
}

// FR-R5: force-close. Goes to the supervisor's Approval_Queue (Kind force_close, the exact name in the spec's
// own 05/06 table) for review after the fact — this does not ask permission first, it records the dispatcher's
// emergency decision and flags it for later review, same as the spec's own wording ("reported weekly").
export async function forceCloseJob(store, saId, { outcome, reason, user = '' } = {}) {
  if (!['Completed', 'Failed'].includes(outcome)) refuse('Outcome must be Completed or Failed.');
  if (blank(reason)) refuse('A reason is required to force-close a job.');
  const sa = await store.getRecordById(SA, saId, { raw: true });
  if (!sa) refuse('Service Appointment not found.');
  await store.updateRecord(SA, saId, {
    Appointment_Status: outcome, Force_Closed: true, Force_Close_Reason: reason,
  }, { byForm: true, user });
  await stampJobStatus(store, saId);
  const approvalId = await prepareApproval(store, {
    kind: 'force_close', sa,
    summary: `${text(sa.Sales_Order)} was force-closed as ${outcome}: ${reason}`,
    options: ['Confirm', 'Reopen'],
    // previousStatus: what "Reopen" puts the job back to (approval-decisions.mjs).
    payload: { outcome, reason, closedBy: user, previousStatus: text(sa.Appointment_Status) },
  });
  return { approvalId: String(approvalId) };
}

// The Delivery Exception Queue (replaces DMS Exception Queue; sorted by category and Order Date like
// everything else). Merges: open DMS_Exception_Queue rows, done jobs with a failure reason and no redelivery
// yet (FR-R4's own condition, re-checked live rather than waiting for the nightly sweep), and pending
// Approval_Queue items of Kind schedule_shortfall/third_party_booking ("Urgent - no slot" / third-party
// decisions). NOT included: unsigned remote deliveries (no remote-signature flow exists) and permits pending
// close to the date (permit status lives inside Site_Checklist's grid, not a field this can query cheaply).
export async function getDeliveryExceptionQueue(store, { now = new Date() } = {}) {
  const [exceptions, approvals, appointments] = await Promise.all([
    store.find(EXC, (r) => r.Status === 'Open'),
    store.find(AQ, (r) => r.Status === 'pending' && ['schedule_shortfall', 'third_party_booking', 'force_close'].includes(r.Kind)),
    store.find(SA),
  ]);
  const byId = new Map(appointments.map((r) => [String(r.ID), r]));
  const openExceptionFor = new Set(exceptions.map((e) => String(e.Sales_Order_Reference)));
  const items = [];
  for (const e of exceptions) {
    const sa = byId.get(String(e.Sales_Order_Reference));
    items.push({ kind: 'exception', id: String(e.ID), saId: sa ? sa.ID : '', so: sa ? text(sa.Sales_Order) : '', category: sa?.Category || '', orderDate: sa?.Order_Date || '', summary: text(e.Exception_Reason) });
  }
  for (const a of approvals) {
    const sa = byId.get(String(a.Record_Id));
    // Parsed here, not left as a string: the widget needs the actual option list to render decide buttons.
    let options = [];
    try { options = JSON.parse(a.Options || '[]'); } catch { /* malformed Options: no buttons, not a crash */ }
    items.push({ kind: a.Kind, id: String(a.ID), saId: a.Record_Id, so: sa ? text(sa.Sales_Order) : text(a.Record_No), category: sa?.Category || '', orderDate: sa?.Order_Date || '', summary: text(a.Summary), options });
  }
  for (const sa of appointments) {
    if (!DONE_STATUSES.has(text(sa.Appointment_Status)) || blank(sa.Failure_Reason_Code)) continue;
    const redone = appointments.some((r) => String(r.Rescheduled_From_SA) === String(sa.ID));
    if (redone || openExceptionFor.has(String(sa.ID))) continue; // already showing as an 'exception' row above
    items.push({ kind: 'awaiting_redelivery', id: String(sa.ID), saId: sa.ID, so: text(sa.Sales_Order), category: sa.Category || '', orderDate: sa.Order_Date || '', summary: `Failed (${sa.Failure_Reason_Code}), no redelivery yet` });
  }
  // A work permit / gate pass that is Required and still Pending, with the job close (permit_warn_days, default 2)
  // or already past its date. The checklist keeps it inside the Site_Checklist grid, so it is read from there.
  const policy = await policyReader(store);
  const warnDays = toLong(policy('permit_warn_days'), 2);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const sa of appointments) {
    if (DONE_STATUSES.has(text(sa.Appointment_Status)) || !blank(sa.Job_Archived_At) || !permitPending(sa.Site_Checklist)) continue;
    const date = text(sa.Confirmed_Schedule_Date || sa.Suggested_Schedule_Date).slice(0, 10);
    const when = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) : null;
    if (!when) continue; // no date yet: nothing to be close to
    const daysAway = Math.round((when - today) / 86400000);
    if (daysAway > warnDays) continue;
    items.push({
      kind: 'permit_pending', id: `permit-${sa.ID}`, saId: sa.ID, so: text(sa.Sales_Order), category: sa.Category || '', orderDate: sa.Order_Date || '',
      summary: `Work permit / gate pass still Pending; the job is ${daysAway < 0 ? `${-daysAway} day(s) past its date` : daysAway === 0 ? 'today' : `in ${daysAway} day(s)`} (${date}). Dispatch is blocked until it is obtained.`,
    });
  }
  const CATEGORY_ORDER = { broken: 0, late: 1, at_risk: 2, on_time: 3, blocked: 4, '': 5 };
  items.sort((a, b) => (CATEGORY_ORDER[a.category] ?? 5) - (CATEGORY_ORDER[b.category] ?? 5) || text(a.orderDate).localeCompare(text(b.orderDate)));
  return items;
}
