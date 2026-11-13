// Service_Request1 workflows, ported from zoho-export/parsed/workflows/form/Service_Request1/*.dg.
// Only the events that run on API writes are here (on success).
//
// Ported here: SR_Created_Make_Appointme.
// Ported elsewhere: SR_Instant_Forecast (forecast-stamp.mjs; the engine fcStampBySoNo lives on feature/forecast-engine).
//
// SR_Created_Make_Appointment is the bridge from Fulfillment: the "To Ship" widget writes a Service Request, and this turns
// it into a Service Appointment in the delivery queue, with its items and one Package_Shipments row per package.
// Only when the Service Request has no appointment yet; the appointment id is written back last, so an aborted run can be
// retried without doubling anything.
//
// Quirks kept ("mirrors Zoho"): the delivery type is kept only when it is exactly one of the 8 types of the appointment's
// picklist; the customer name goes whole into `last_name` (there is no reliable split); the contact is the phone number
// as it is; the packages come from the distinct PAC of the item rows, and only when no row has a PAC from the header
// Package_Number split on commas.
// The appointment is created with the raw store, which runs no hooks. Checked on Zoho Development: a record inserted by a
// script does NOT run its form's workflows there either (a Service Request's new appointment got no Geocode_Status), so
// the appointment is geocoded at its next save, not when it is created.
import { register } from '../../workflows/index.mjs';
import { blank, ymd, todayDate } from '../../workflows/deluge.mjs';
import { SA, day } from './scheduling.mjs';

const VALID_TYPES = ['Delivery Only', 'With Installation', 'Full-Day Install', 'Multi-Day Install', 'Replacement', 'Site Visit', 'Pullout', 'Pick Up'];
const text = (v) => (blank(v) ? '' : String(v));
const trimmed = (v) => text(v).trim();

// "2026-10-27 09:39:00 AM" or "2026-10-27 21:39:00" -> "09:39:00 AM" (the 12-hour form of a Time field), "" when there is no clock.
export function clock12(value) {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(String(value ?? ''));
  if (!m) return '';
  let hour = Number(m[1]);
  const pm = m[4] ? m[4].toUpperCase() === 'PM' : hour >= 12;
  if (m[4]) { if (pm && hour !== 12) hour += 12; if (!pm && hour === 12) hour = 0; }
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(shown).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'} ${hour >= 12 ? 'PM' : 'AM'}`;
}

async function makeAppointment({ id, record: input, store, user }) {
  if (!blank(input.Service_Appointment_ID)) return;

  // 1. The Initial Scheduling record gives the order date and the day the order was dispatched.
  let orderDate = '';
  let dispatchDate = '';
  if (!blank(input.Initial_Schedule_ID)) {
    const scheduleId = trimmed(input.Initial_Schedule_ID);
    const [schedule] = await store.find('Delivery_Scheduling', (r) => r.ID === scheduleId);
    if (schedule) { orderDate = text(schedule.Order_Date); dispatchDate = day(schedule.Added_Time); }
  }
  if (dispatchDate === '') dispatchDate = ymd(todayDate());

  // 2. Type_of_Delivery is a picklist there and plain text here: a value that is not on the list would refuse the insert.
  const rawType = trimmed(input.Delivery_Type);
  const type = VALID_TYPES.includes(rawType) ? rawType : '';

  // 3. The appointment: Queued, site confirmation pending. The date and time of the request are written only when present.
  const customer = trimmed(input.Customer_Name);
  const appointment = {
    Appointment_Status: 'Queued', Sales_Order: text(input.Sales_Order), Sales_Order_Display: text(input.Sales_Order),
    Package_Number: text(input.Package_Number), Customer_Address: text(input.Customer_Address), City: text(input.City),
    Email: text(input.Email), Contact: input.Phone_Number ?? '', Type_of_Delivery: type, Initial_Schedule_ID: text(input.Initial_Schedule_ID),
    Service_Request_ID: String(id), Service_Request: text(input.SR_No), Original_SO: text(input.Original_SO), RMA: text(input.RMA1),
    Reason: text(input.Reason), Sub_Reason: text(input.Sub), If_Pull_Out: text(input.If_Pull_Out), Priority_Level: text(input.Priority_Level),
    Scheduled_by: text(input.Scheduled_by), Fulfillment_Completed_Date: dispatchDate, Site_Confirmation_Status: 'Pending', Exception_Status: 'None',
  };
  if (customer !== '') appointment.Customer_Name = { first_name: '', last_name: customer };
  if (!blank(input.Delivery_Date)) appointment.Requested_Delivery_Date = input.Delivery_Date;
  if (!blank(input.Initial_Schedule_Time)) appointment.Requested_Delivery_Time = clock12(input.Initial_Schedule_Time);
  if (orderDate !== '') appointment.Order_Date = orderDate;
  // 4. The item rows, with the PAC (the package identity that has to reach the end of the chain).
  const items = input.Item_Details || [];
  appointment.Item_Details = items.map((it) => ({ Item_Name: it.Item_Name, SKU: it.SKU, Quantity: it.Quantity, PAC: it.PAC }));
  const saId = await store.addRecord(SA, appointment, user);

  // 5. One Package_Shipments row per package.
  const pacs = [];
  for (const it of items) { const p = trimmed(it.PAC); if (p !== '' && !pacs.includes(p)) pacs.push(p); }
  if (pacs.length === 0) for (const part of trimmed(input.Package_Number).split(',')) { const p = part.trim(); if (p !== '' && !pacs.includes(p)) pacs.push(p); }
  for (const pac of pacs) {
    await store.addRecord('Package_Shipments', { Service_Appointment_ID: String(saId), Sales_Order: text(input.Sales_Order), Package_Number: pac, Shipment_Created: false }, user);
  }

  // 6. Last: the write-back. While the appointment id is blank, the guard above knows the run did not finish.
  await store.updateRecord('Service_Request1', id, { Service_Appointment_ID: String(saId), SR_Status: 'Scheduling' }, { byForm: true });
}

register('Service_Request1', { afterAdd: makeAppointment });
