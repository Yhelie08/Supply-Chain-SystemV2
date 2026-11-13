// SA_Scheduling_Engine, ported from zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__1..4.dg.
// One Zoho workflow with four actions, all "on add or edit, on success". They run in order, and each one reads the
// `input` as it was when the save finished (so Action 2 does not see what Action 1 wrote in the same save, which is
// what the scripts' own comments say), while the record it changes is read fresh from the database.
//   1. Site confirmed and no dates yet: run the scheduling engine (scheduling.mjs).
//   2. A confirmed date without a calendar entry: Pick Up and 3rd Party confirm at once; otherwise flag an override,
//      check the team's capacity for that day (Calendar Conflict exception, or a deliberate ASAP override), write the
//      calendar summary and mark the appointment Scheduled.
//   3. Completed (or Failed with a calendar entry): tag the calendar summary "[Completed]" / "[Failed]" once.
//   4. A Pick Up that still has an installer: release the team and confirm (or queue) the pickup.
// The four are four hooks, so an error in one is logged and does not skip the others.
//
// Quirks kept ("mirrors Zoho"): the clean-up of old flags resolves the exception whenever its reason is Calendar Full or
// Overtime Declined, flagged or not (the `&&` binds tighter than the `||`); Action 3's `||` means Failed only counts
// when a calendar entry exists. Numbers in the summaries print with two decimals, a blank team prints "null".
// Hooks run in the order they are registered; Zoho's order of the workflows is this one before SA_Sync_Sales_Order_Display.
import { register } from '../../workflows/index.mjs';
import { withLock } from './locks.mjs';
import { zohoNow } from '../../criteria.mjs';
import { truthy, blank, toNum, sameValue } from '../../workflows/deluge.mjs';
import { SA, scheduleSlot, customerName, defaultDuration, normalizeType, policyReader, raiseException, toLong, r6, hrs, nullText, day } from './scheduling.mjs';

const fresh = (store, id) => store.getRecordById(SA, id, { raw: true });
const save = (store, id, changes) => (Object.keys(changes).length ? store.updateRecord(SA, id, changes, { byForm: true }) : null);
const hoursText = (n, fullDay) => (fullDay ? String(n) : hrs(n));

// Action 1
async function runEngine({ id, record, store, user }) {
  if (record.Site_Confirmation_Status === 'Confirmed' && blank(record.Suggested_Schedule_Date) && blank(record.Confirmed_Schedule_Date)) {
    await scheduleSlot(store, id, false, { user });
  }
}

// Action 2
// The capacity check reads the team's other confirmed jobs and then writes this one: two at once would both see room.
// They are queued with the engine's other scheduling work (locks.mjs), one at a time.
const confirmCalendar = (args) => withLock('scheduling', () => confirmCalendarNow(args));

async function confirmCalendarNow({ id, record: input, store, user }) {
  if (blank(input.Confirmed_Schedule_Date) || truthy(input.Calendar_Entry_Created)) return;
  const rec = await fresh(store, id);
  const typeRaw = input.Type_of_Delivery ?? '';
  const dType = normalizeType(typeRaw);
  const timeSlot = blank(rec.Confirmed_Time_Slot) ? '' : String(rec.Confirmed_Time_Slot);
  const changes = {};
  const set = (k, v) => { changes[k] = v; };
  const head = `Title: ${nullText(rec.Sales_Order)} - ${customerName(rec)} | Date: ${day(rec.Confirmed_Schedule_Date)} | Time: ${timeSlot}`;

  // PICK UP: no team, confirm at once. 3RD PARTY: the dispatcher decided, confirm at once.
  if (dType === 'Pick Up') {
    set('Fleet_Assignment', 'Customer Pickup');
    set('Calendar_Event_Summary', `${head} | Type: Pick Up | Notes: Customer/dispatcher-scheduled pickup, no delivery team assigned`);
    set('Calendar_Entry_Created', true);
    set('Appointment_Status', 'Scheduled');
    return save(store, id, changes);
  }
  if (input.Fleet_Decision === '3rd Party') {
    const fleet = blank(rec.Fleet_Assignment) ? '3rd Party' : rec.Fleet_Assignment;
    set('Calendar_Event_Summary', `${head} | Fleet: ${fleet} | Notes: 3rd-party courier, no internal team assigned`);
    set('Calendar_Entry_Created', true);
    set('Appointment_Status', 'Scheduled');
    return save(store, id, changes);
  }

  // OVERRIDE OR APPROVE? Override By / Reason are already forced by the validation (service-appointment.mjs).
  const isOverride = blank(input.Suggested_Schedule_Date) || !sameValue(input.Confirmed_Schedule_Date, input.Suggested_Schedule_Date) || !sameValue(input.Confirmed_Time_Slot, input.Suggested_Time_Slot);
  if (isOverride) { set('Override_Applied', true); set('Override_Timestamp', zohoNow()); }

  // CAPACITY CHECK: the team's hours that day (the last availability record with a cap wins; 8 when none),
  // against the other confirmed jobs of the team on that day.
  let teamCap = 8;
  const availability = await store.find('Daily_Team_Availability', (a) => day(a.Availability_Date) === day(input.Confirmed_Schedule_Date) && a.Installer === input.Installer);
  for (const a of availability) if (toNum(a.Max_Capacity_Hours) > 0) teamCap = toNum(a.Max_Capacity_Hours);
  const policy = await policyReader(store);
  const factor = 1 + toLong(policy('traffic_buffer_percent'), 15) / 100;
  let myDuration = toNum(input.Estimated_Duration);
  if (myDuration === 0) myDuration = defaultDuration(dType);
  const fullDay = dType === 'Full-Day Install';
  const myBuffered = fullDay ? 8 : r6(myDuration * factor);
  const others = await store.find(SA, (r) => r.Installer === input.Installer && day(r.Confirmed_Schedule_Date) === day(input.Confirmed_Schedule_Date) && truthy(r.Calendar_Entry_Created) && r.ID !== id);
  let otherHours = 0;
  for (const o of others) otherHours = r6(otherHours + (o.Type_of_Delivery === 'Full-Day Install' ? 8 : r6(toNum(o.Estimated_Duration) * factor)));
  const projected = r6(otherHours + myBuffered);
  const capacityExceeded = projected > teamCap;

  // A full day with no override is an accident (two officers booking at once): blocked. With an override it is on
  // purpose (ASAP): allowed, and the summary says so.
  if (capacityExceeded && !isOverride) {
    set('Exception_Status', 'Flagged');
    set('Exception_Reason', 'Calendar Conflict');
    await save(store, id, changes);
    await raiseException(store, rec, { stage: 'Calendar', reason: 'Calendar Conflict', severity: 'High' }, user);
    return;
  }

  // CALENDAR WRITE
  const where = `${rec.Customer_Address ?? ''}${blank(rec.City) ? '' : `, ${rec.City}`}`;
  let notes = isOverride ? `Override: ${rec.Override_Reason ?? ''}` : '';
  if (capacityExceeded) notes = `${notes}${notes !== '' ? ' | ' : ''}ASAP - Exceeds Daily Capacity (${hrs(projected)} / ${teamCap} hrs)`;
  set('Calendar_Event_Summary', `${head} (${hoursText(myBuffered, fullDay)} hrs) | Team: ${nullText(rec.Installer)} / ${nullText(rec.Assigned_to_Driver)} | Fleet: ${nullText(rec.Fleet_Assignment)} | Type: ${blank(typeRaw) ? '-' : typeRaw} | Location: ${where} | Notes: ${notes}`);
  // Clear a flag left by an earlier blocked attempt, but only the ones this engine raises.
  if ((rec.Exception_Status === 'Flagged' && rec.Exception_Reason === 'Calendar Conflict') || rec.Exception_Reason === 'Calendar Full' || rec.Exception_Reason === 'Slot Pushed — Overtime Declined') set('Exception_Status', 'Resolved');
  set('Calendar_Entry_Created', true);
  set('Appointment_Status', 'Scheduled');
  return save(store, id, changes);
}

// Action 3
async function tagFinishedStatus({ id, record: input, store }) {
  const status = input.Appointment_Status;
  if (!(status === 'Completed' || (status === 'Failed' && truthy(input.Calendar_Entry_Created)))) return;
  const tag = `[${status}]`;
  if (blank(input.Calendar_Event_Summary) || !String(input.Calendar_Event_Summary).includes(tag)) {
    const rec = await fresh(store, id);
    await save(store, id, { Calendar_Event_Summary: `${rec.Calendar_Event_Summary ?? ''} ${tag}` });
  }
}

// Action 4
async function convertToPickUp({ id, record: input, store }) {
  if (input.Type_of_Delivery !== 'Pick Up' || blank(input.Installer)) return;
  const rec = await fresh(store, id);
  const changes = { Installer: '', Assigned_to_Driver: '', Suggested_Schedule_Date: '', Suggested_Time_Slot: '', Fleet_Assignment: 'Customer Pickup' };
  if (!blank(input.Confirmed_Schedule_Date)) {
    const timeSlot = blank(input.Confirmed_Time_Slot) ? '' : String(input.Confirmed_Time_Slot);
    changes.Calendar_Event_Summary = `Title: ${nullText(rec.Sales_Order)} - ${customerName(rec)} | Date: ${day(rec.Confirmed_Schedule_Date)} | Time: ${timeSlot} | Type: Pick Up | Notes: Converted from delivery to Pick Up - original team released`;
    changes.Calendar_Entry_Created = true;
    changes.Appointment_Status = 'Scheduled';
  } else {
    changes.Calendar_Entry_Created = false;
    changes.Appointment_Status = 'Queued';
  }
  await save(store, id, changes);
}

const actions = [runEngine, confirmCalendar, tagFinishedStatus, convertToPickUp];
register(SA, { afterAdd: actions, afterUpdate: actions });
