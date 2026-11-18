// Third-party bookings (spec v1.4, Delivery 02 §5, TP-R1-R4): a drop-off a sales agent/dispatcher decided to
// hand to a courier (Lalamove or similar) instead of an own team, after the "Book third party" approval item
// from suggest-schedule.mjs is decided.
//
// TP-R3 (Delivery Analytics reports own-team vs third-party separately) is NOT built here — it is a reporting
// change to the Delivery Analytics widget, not data this module owns; `Fleet_Decision === '3rd Party'` is already
// the field an analytics query would group by. TP-R2's "customer confirmation (link)" is recorded by hand
// (Third_Party_Proof_Confirmed) because no tracking page/token exists in this app yet (see the Delivery review
// doc §4.6) — this is a placeholder for when it does, not a real customer-facing flow.
import { zohoNow, ZohoError } from '../../criteria.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { SA, customerName } from './scheduling.mjs';
import { stampJobStatus } from './job-status.mjs';

const refuse = (message) => { throw new ZohoError(2001, message); };

// TP-R1: records the booking and, the first time, confirms the appointment the same way the own-team branch of
// scheduling-engine.mjs's confirmCalendarNow already does for Fleet_Decision === '3rd Party' — written directly
// here (not through that hook) since this runs as a custom API, whose writes do not fire form hooks.
export async function recordThirdPartyBooking(store, saId, { provider, bookingRef, fee, pickupTime, driverName, plate, date, user = '' } = {}) {
  if (blank(provider)) refuse('A provider is required for a third-party booking.');
  if (blank(bookingRef)) refuse('A booking reference is required for a third-party booking.');
  const sa = await store.getRecordById(SA, saId, { raw: true });
  if (!sa) refuse('Service Appointment not found.');

  const changes = {
    Fleet_Decision: '3rd Party', Fleet_Assignment: provider,
    Third_Party_Provider: provider, Third_Party_Booking_Ref: bookingRef,
    Third_Party_Fee: fee ?? sa.Third_Party_Fee ?? 0,
    Third_Party_Pickup_Time: pickupTime ?? sa.Third_Party_Pickup_Time ?? '',
    Third_Party_Driver_Name: driverName ?? sa.Third_Party_Driver_Name ?? '',
    Third_Party_Plate: plate ?? sa.Third_Party_Plate ?? '',
  };
  if (blank(sa.Confirmed_Schedule_Date) && !blank(date)) {
    changes.Confirmed_Schedule_Date = date;
    changes.Calendar_Entry_Created = true;
    changes.Appointment_Status = 'Scheduled';
    changes.Calendar_Event_Summary = `Title: ${sa.Sales_Order ?? ''} - ${customerName(sa)} | Date: ${date} | Fleet: ${provider} | Notes: Third-party booking ${bookingRef}`;
  }
  await store.updateRecord(SA, saId, changes, { byForm: true, user });
  await stampJobStatus(store, saId);
  return { status: 'success' };
}

// TP-R4: no field app for a third-party job — the dispatcher enters the result when the provider reports it.
// Left/done times are stamped with the time we were told (now), unless the provider's own time is given.
export async function recordThirdPartyResult(store, saId, { resultQty, photo, leftAt, doneAt, customerConfirmed, user = '' } = {}) {
  const sa = await store.getRecordById(SA, saId, { raw: true });
  if (!sa) refuse('Service Appointment not found.');
  const now = zohoNow();
  const changes = {};
  if (!blank(resultQty)) changes.Third_Party_Result_Qty = resultQty;
  if (!blank(photo)) changes.Third_Party_Photo = photo;
  if (leftAt !== undefined) changes.Third_Party_Left_At = leftAt || now;
  if (doneAt !== undefined) {
    changes.Third_Party_Done_At = doneAt || now;
    // The dispatcher's entry IS the "done" event for a third-party job (TP-R4: no field app of its own to
    // submit a close-out) — never overrides an already-Failed appointment.
    if (!['Completed', 'Failed'].includes(sa.Appointment_Status)) changes.Appointment_Status = 'Completed';
  }
  if (customerConfirmed) changes.Third_Party_Proof_Confirmed = true; // TP-R2: the customer confirmation completes the proof.
  if (Object.keys(changes).length) await store.updateRecord(SA, saId, changes, { byForm: true, user });
  await stampJobStatus(store, saId);
  return { status: 'success' };
}
