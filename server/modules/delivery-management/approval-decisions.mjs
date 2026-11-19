// Applying a decision on Delivery's own Approval_Queue items (Record_Type 'service_appointment'):
// schedule_shortfall and third_party_booking, both prepared in suggest-schedule.mjs. The generic
// validation (options check, Decided_By/At stamp, one decision only) is procurement/decisions.mjs's
// afterUpdate hook on the same shared form — this only stamps a Result, same "exactly what the option
// says and nothing more" rule procurement's own apply() follows (no automatic booking, no automatic
// capacity change).
//
// force_close (failure-redelivery.mjs) is NOT handled here: it is not part of getDeliveryExceptionQueue's
// own merge (its "Confirm"/"Reopen" review is a supervisor's after-the-fact check, not a queue item), and
// nothing decides one yet. Deciding one today stamps no Result (same as any other Record_Type procurement's
// own hook now ignores) rather than the wrong "shipment no longer exists" it used to get.
import { register } from '../../workflows/index.mjs';

async function applyDeliveryDecision({ id, record, previous, store }) {
  if (record.Record_Type !== 'service_appointment') return; // not ours
  if (previous?.Status !== 'pending' || record.Status !== 'decided') return;
  let result = '';
  if (record.Kind === 'schedule_shortfall') {
    result = record.Decision === 'Add a team-day (overtime, extra installer)'
      ? 'Recorded. Add the extra capacity yourself (Daily Team Availability) — nothing is added by the system.'
      : 'Recorded. Tell the customer the proposed new date yourself — no automatic message is sent.';
  } else if (record.Kind === 'third_party_booking') {
    result = String(record.Decision).startsWith('Book third party')
      ? 'Recorded. Use "Record a third-party booking" to enter the provider and booking reference.'
      : 'Kept with the own team. No third-party booking.';
  } else {
    return; // an unrecognised Kind under this Record_Type: leave it alone rather than guess
  }
  await store.updateRecord('Approval_Queue', id, { Result: result }, { byForm: true });
}

register('Approval_Queue', { afterUpdate: applyDeliveryDecision });
