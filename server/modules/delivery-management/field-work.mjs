// Field_Work workflows, ported from zoho-export/parsed/workflows/form/Field_Work/*.dg.
// Only the events that run on API writes are here (on validate = before, on success = after).
//
// Ported here: FW_Validate_Reschedule_Re, FW_Reschedule_To_Exceptio, FW_Completion_Schedule_Sy.
// Ported elsewhere: FW_Instant_Forecast (forecast-stamp.mjs; the engine fcStampBySoNo lives on feature/forecast-engine).
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, truthy } from '../../workflows/deluge.mjs';
import { SA, customerName, storedClock, day } from './scheduling.mjs';

const EXC = 'DMS_Exception_Queue';

// FW_Validate_Reschedule_Reason. The Deluge condition is
//   Status == "Reschedule Requested" && Reschedule_Reason == null || Reschedule_Reason == ""
// By precedence the second part would refuse ANY save with an empty reason. In Zoho a blank text is null, so that part
// never fires and the real rule is only the first one. Here a blank text is "" (the import and the widgets store it so),
// so porting the condition literally would refuse every Field_Work save that has no reason, which is most of them.
// Deliberate difference: only the real rule is ported.
function rescheduleReason({ input, previous }) {
  const rec = { ...(previous || {}), ...input };
  if (rec.Status === 'Reschedule Requested' && blank(rec.Reschedule_Reason)) {
    throw new ZohoError(2001, 'Reschedule Reason is required when Status is set to Reschedule Requested.');
  }
}

// An exception inserted by a script. These two scripts do not look for an open duplicate first (the engine's do).
const insertException = (store, appointment, fields, user) => store.addRecord(EXC, {
  Sales_Order_Reference: appointment.ID, Customer_Name: customerName(appointment), Date_Raised: zohoNow(), Status: 'Open', ...fields,
}, user);

// FW_Reschedule_To_Exception_And_Requeue: a reschedule request only raises a Dispatch exception for the first appointment
// of that sales order. Nothing about the delivery changes until an officer resolves it (EXC_Resolve_Sync). Reschedule_Processed
// is set even when no appointment was found, as in the script.
async function rescheduleToException({ id, record: input, store, user }) {
  if (input.Status !== 'Reschedule Requested' || truthy(input.Reschedule_Processed)) return;
  const [appointment] = await store.find(SA, (r) => r.Sales_Order === input.Sales_Order);
  if (appointment) {
    await insertException(store, appointment, {
      Exception_Stage: 'Dispatch', Exception_Reason: input.Reschedule_Reason, Severity: 'Medium', Raised_By: 'Officer', Assigned_To: 'Delivery Officer',
    }, user);
  }
  await store.updateRecord('Field_Work', id, { Reschedule_Processed: true }, { byForm: true });
}

// ----- date-times: "2026-10-27 09:39:00 AM", "2026-10-27 21:39:00" or "27-Oct-2026 09:39:00 AM" (the time zone is the server's) -----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parseDateTime(value) {
  const s = String(value ?? '').trim();
  let y; let mo; let d; let rest;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(.*))?$/.exec(s);
  if (m) { [, y, mo, d, rest] = m; } else if ((m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(.*))?$/.exec(s))) { [, d, mo, y, rest] = m; mo = MONTHS.findIndex((x) => x.toLowerCase() === mo.toLowerCase()) + 1; } else return null;
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(rest ?? '');
  let hour = t ? Number(t[1]) : 0;
  if (t && t[4]) { const pm = t[4].toUpperCase() === 'PM'; if (pm && hour !== 12) hour += 12; if (!pm && hour === 12) hour = 0; }
  return { year: Number(y), month: Number(mo), day: Number(d), hour, minute: t ? Number(t[2]) : 0 };
}
const clock12 = (hour24, minute) => `${hour24 % 12 === 0 ? 12 : hour24 % 12}:${String(minute).padStart(2, '0')} ${hour24 >= 12 ? 'PM' : 'AM'}`;
const clock12Padded = (hour24, minute) => `${String(hour24 % 12 === 0 ? 12 : hour24 % 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour24 >= 12 ? 'PM' : 'AM'}`;
// A "9:00 AM" or "09:00:00 AM" text in minutes since midnight, -1 when it is not a clock text.
function minutesOf(text) {
  const parts = String(text ?? '').trim().split(' ');
  if (parts.length !== 2) return -1;
  const hm = parts[0].split(':');
  if (hm.length < 2) return -1;
  let hour = parseInt(hm[0], 10);
  const minute = parseInt(hm[1], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return -1;
  const ap = parts[1].toUpperCase();
  if (ap === 'PM' && hour !== 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

// FW_Completion_Schedule_Sync: when the installation is complete, finish the appointment and fix the team's day.
//  - The appointment's sales order must be the Field Work's own, else it is flagged (High, Dispatch) and nothing is applied.
//  - Otherwise (and not already Completed or Failed): Completed, with the actual times added to the calendar summary.
//  - The team's other suggestions for that day (nothing confirmed yet) now start when this job really ended.
//  - Every confirmed job of that team and day whose planned start is before the real end is flagged "Schedule Drift".
// Writes are plain store writes: the appointment's own workflows do not run, so it gets the actual-time note but not the
// "[Completed]" tag of SA_Scheduling_Engine, as in Zoho. The mismatch and drift exceptions are not deduplicated, as in the script.
async function completionSchedule({ record: input, store, user }) {
  if (input.Installation_Status !== 'Complete' || blank(input.Schedule_End_Date_and_Time) || blank(input.Service_Appointment_ID)) return;
  const saId = String(input.Service_Appointment_ID).trim();
  const [appointment] = await store.find(SA, (r) => r.ID === saId);
  const mismatch = appointment && !blank(input.Sales_Order) && appointment.Sales_Order !== input.Sales_Order;
  if (mismatch) {
    const reason = "Field Work ID Mismatch — resolved Service_Appointment's SO doesn't match the Field Work's own SO, completion not applied";
    await store.updateRecord(SA, saId, { Exception_Status: 'Flagged', Exception_Reason: reason }, { byForm: true });
    await insertException(store, appointment, { Exception_Stage: 'Dispatch', Exception_Reason: reason, Severity: 'High', Raised_By: 'System' }, user);
  }
  if (!appointment || mismatch || appointment.Appointment_Status === 'Completed' || appointment.Appointment_Status === 'Failed') return;

  const start = parseDateTime(input.Schedule_Start_Date_and_Time);
  const end = parseDateTime(input.Schedule_End_Date_and_Time);
  const startText = start ? `${MONTHS[start.month - 1]} ${String(start.day).padStart(2, '0')}, ${start.year} ${clock12Padded(start.hour, start.minute)}` : '?';
  const endText = end ? clock12Padded(end.hour, end.minute) : '?';
  await store.updateRecord(SA, saId, {
    Appointment_Status: 'Completed',
    Calendar_Event_Summary: `${appointment.Calendar_Event_Summary ?? ''} | Actual: ${startText} - ${endText}`,
  }, { byForm: true });

  const team = appointment.Installer;
  const teamDate = day(appointment.Confirmed_Schedule_Date);
  if (blank(team) || teamDate === '' || !end) return;
  const endMinutes = end.hour * 60 + end.minute;
  const endText12 = clock12(end.hour, end.minute);
  const others = (await store.find(SA)).filter((r) => r.Installer === team && r.ID !== appointment.ID);
  // Pending suggestions that day (nothing confirmed): they start when this job really ended.
  for (const p of others.filter((r) => day(r.Suggested_Schedule_Date) === teamDate && blank(r.Confirmed_Schedule_Date) && r.Appointment_Status !== 'Failed')) {
    await store.updateRecord(SA, p.ID, { Suggested_Time_Slot: storedClock(endText12) }, { byForm: true });
  }
  // Confirmed jobs that day that were planned to start before this one really ended.
  for (const c of others.filter((r) => day(r.Confirmed_Schedule_Date) === teamDate && r.Appointment_Status !== 'Completed' && r.Appointment_Status !== 'Failed')) {
    const plannedStart = minutesOf(c.Confirmed_Time_Slot);
    if (plannedStart >= 0 && endMinutes > plannedStart) {
      const reason = 'Schedule Drift — Prior job finished later than planned';
      await store.updateRecord(SA, c.ID, { Exception_Status: 'Flagged', Exception_Reason: reason }, { byForm: true });
      await insertException(store, c, { Exception_Stage: 'Scheduling', Exception_Reason: reason, Severity: 'Medium', Raised_By: 'System' }, user);
    }
  }
}

register('Field_Work', {
  beforeAdd: rescheduleReason,
  beforeUpdate: rescheduleReason,
  afterAdd: [rescheduleToException, completionSchedule],
  afterUpdate: [rescheduleToException, completionSchedule],
});
