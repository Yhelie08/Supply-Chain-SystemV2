// Applying a decision on Delivery's own Approval_Queue items (Record_Type 'service_appointment'):
// schedule_shortfall and third_party_booking, both prepared in suggest-schedule.mjs. The generic
// validation (options check, Decided_By/At stamp, one decision only) is procurement/decisions.mjs's
// afterUpdate hook on the same shared form — this only stamps a Result, same "exactly what the option
// says and nothing more" rule procurement's own apply() follows (no automatic booking, no automatic
// capacity change).
//
// force_close (failure-redelivery.mjs, FR-R5) is applied here too (2026-11-19): the job is already closed when the
// supervisor sees it, so "Confirm" only records that the close stands, and "Reopen" puts the job back to the status
// it had before the force-close (kept in the item's Payload as previousStatus) and clears the done stamps so the
// Job status chain moves it forward again. A job that has changed since the force-close is NOT reopened.
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { SA } from './scheduling.mjs';
import { stampJobStatus } from './job-status.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

async function applyForceClose({ record, store, user }) {
  let payload = {};
  try { payload = JSON.parse(record.Payload || '{}'); } catch { /* malformed Payload: Confirm still works, Reopen falls back below */ }
  if (record.Decision === 'Confirm') return 'Confirmed. The force-close stands.';
  if (record.Decision !== 'Reopen') return '';
  // getRecordById throws (Zoho's 9280) when the record is gone, rather than returning null.
  const sa = await store.getRecordById(SA, record.Record_Id, { raw: true }).catch(() => null);
  if (!sa) return 'Not reopened: the job no longer exists.';
  if (payload.outcome && text(sa.Appointment_Status) !== text(payload.outcome)) {
    return `Not reopened: the job has changed since it was force-closed (it is now ${text(sa.Appointment_Status) || 'blank'}).`;
  }
  const back = text(payload.previousStatus) || 'Scheduled';
  await store.updateRecord(SA, sa.ID, {
    Appointment_Status: back, Force_Closed: false, Force_Close_Reason: '', Job_Done_At: '', Job_Archived_At: '',
  }, { byForm: true, user });
  const stage = await stampJobStatus(store, sa.ID);
  return `Reopened. The job is back to ${back} (job status ${stage}).`;
}

async function applyDeliveryDecision({ id, record, previous, store, user }) {
  if (record.Record_Type !== 'service_appointment') return; // not ours
  if (previous?.Status !== 'pending' || record.Status !== 'decided') return;
  let result = '';
  if (record.Kind === 'schedule_shortfall') {
    result = record.Decision === 'Add a team-day (overtime, extra installer)'
      ? 'Recorded. Add the extra capacity yourself (Daily Team Availability) — nothing is added by the system.'
      : 'Recorded. Tell the customer the proposed new date yourself — no automatic message is sent.';
  } else if (record.Kind === 'third_party_booking') {
    if (String(record.Decision).startsWith('Book third party')) {
      // The Exception Queue's booking form saves the booking first, then decides: say so when it is already on the job.
      const sa = await store.getRecordById(SA, record.Record_Id, { raw: true }).catch(() => null);
      result = sa && !blank(sa.Third_Party_Booking_Ref)
        ? `Recorded. Booked with ${text(sa.Third_Party_Provider)} (reference ${text(sa.Third_Party_Booking_Ref)}).`
        : 'Recorded. Use "Record a third-party booking" to enter the provider and booking reference.';
    } else {
      result = 'Kept with the own team. No third-party booking.';
    }
  } else if (record.Kind === 'force_close') {
    result = await applyForceClose({ record, store, user });
    if (!result) return;
  } else {
    return; // an unrecognised Kind under this Record_Type: leave it alone rather than guess
  }
  await store.updateRecord('Approval_Queue', id, { Result: result }, { byForm: true });
}

register('Approval_Queue', { afterUpdate: applyDeliveryDecision });
