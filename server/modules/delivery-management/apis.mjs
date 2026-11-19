// Delivery Management custom APIs: the ported ones, and a "not ported yet" placeholder for the rest.
import { ok, fail, withPlaceholders } from '../../custom-api-helpers.mjs';
import { SA, scheduleSlot } from './scheduling.mjs';
import { create_shipment_order, create_sales_return_books } from './inventory-apis.mjs';
import { pushDmsStatusToCms, pushDmsMessageToCms } from './cms-sync.mjs';
import { withLock } from './locks.mjs';
import { get_broken_sales_orders } from './exception-queue.mjs';
import { rescoreAll } from './sorter.mjs';
import { generateRotation } from './rotation.mjs';
import { findEarliestSlot, quoteAndHold, releaseHold } from './earliest-slot.mjs';
import { findDayPlan, reorderDayPlan, confirmStopLoading } from './day-plans.mjs';
import { buildLoadSheet } from './load-sheet.mjs';
import { runPreDeliveryGate, dispatchDay } from './dispatch.mjs';
import { suggestSchedule } from './suggest-schedule.mjs';
import { recordThirdPartyBooking, recordThirdPartyResult } from './third-party.mjs';
import { createRedeliveryJob, forceCloseJob, getDeliveryExceptionQueue, failureReasonCodes } from './failure-redelivery.mjs';
import { getDeliveryBacklog, getBacklogTrend } from './backlog-calculator.mjs';
import { getShipToSrGap } from './ship-to-sr-gap.mjs';
import { getDamageByCategory } from './damage-by-category.mjs';
import { getSettings, previewSetting, getRoster, seedRoster } from './settings.mjs';
import { createPulloutFromRefusal, confirmReturnReceived } from './sales-returns.mjs';
import { recordMaintenance, markVehicleDown, markVehicleFixed } from './truck-maintenance.mjs';

// functions/pushDmsStatusToCms.dg / pushDmsMessageToCms.dg: the CMS is a separate Zoho app; the push is in cms-sync.mjs and
// is skipped ("CMS sync is off") until CMS_STATUS_URL / CMS_MESSAGE_URL are set.

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  confirm_dms_schedule_request: 'confirmDmsScheduleRequest',
  decline_dms_schedule_request: 'declineDmsScheduleRequest',
  push_dms_message_to_cms: 'pushDmsMessageToCms',
  dms_reschedule: 'dmsScheduleSlot',
  create_shipment_order: 'createShipmentOrder',
  create_sales_return_books: 'createSalesReturnBooks',
  get_broken_sales_orders: 'SpecV14_GetBrokenSalesOrders',
};

// functions/confirmDmsScheduleRequest.dg
// Once only (a deliberate difference from Zoho, decided by the owner: a double click used to make two appointments). A request
// that is already confirmed, or already has its appointment, is refused; and calls for the same request are queued (locks.mjs),
// so two clicks at the same moment cannot both pass the check.
async function confirmRequest(recId, data, ctx = {}) {
  const [rec] = await data.find('DMS_Schedule_Request', (r) => r.ID === recId);
  if (!rec) return fail('DMS Schedule Request not found.');
  const existing = rec.Service_Appointment_Record_ID ?? '';
  if (rec.Status === 'Confirmed' || existing !== '') {
    return fail(`Already confirmed${existing !== '' ? ` — Service Appointment ${existing} was already created` : ''}.`);
  }

  // Zoho Books enrichment (confirmDmsScheduleRequest.dg lines 41–96):
  // Pulls customer email, shipping address, contact phone, and SO line items into Item_Details.
  // If Books is unconfigured or unreachable, safely falls back to 'skipped_books_offline' without failing appointment creation.
  let addressVal = '';
  let cityVal = '';
  let contactVal = '';
  let emailVal = '';
  let itemRows = [];
  let itemPatchStatus = rec.Books_Sales_Order_ID ? 'skipped_books_offline' : 'skipped';

  const booksClient = ctx?.books?.books || ctx?.books;
  const isConfigured = typeof ctx?.books?.isConfigured === 'function' ? ctx.books.isConfigured() : !!booksClient;

  if (rec.Books_Sales_Order_ID && isConfigured && booksClient && typeof booksClient.get === 'function') {
    try {
      const soResp = await booksClient.get(`/salesorders/${rec.Books_Sales_Order_ID}`);
      const soDetail = soResp?.salesorder;
      if (soDetail) {
        emailVal = soDetail.email || '';
        const shippingAddr = soDetail.shipping_address;
        if (shippingAddr) {
          const street1 = shippingAddr.address || '';
          const street2 = shippingAddr.street2 || '';
          addressVal = street2 ? `${street1}, ${street2}` : street1;
          cityVal = shippingAddr.city || '';
          contactVal = shippingAddr.phone || '';
        }
        if (Array.isArray(soDetail.line_items) && soDetail.line_items.length > 0) {
          itemRows = soDetail.line_items.map((li) => ({
            Item_Name: li.name || '',
            SKU: li.sku || '',
            Quantity: li.quantity,
          }));
        }
        itemPatchStatus = itemRows.length > 0 ? 'included_in_create' : 'skipped';
      }
    } catch {
      // Gracefully decouple: external failure falls back to offline status
      itemPatchStatus = 'skipped_books_offline';
    }
  }

  const sa = {
    Sales_Order: rec.Sales_Order_Number,
    Customer_Name: { last_name: rec.Customer_Name },
    Customer_Address: addressVal,
    City: cityVal,
    Contact: contactVal,
    Email: emailVal,
    Type_of_Delivery: rec.Type_of_Delivery || '',
  };
  if (itemRows.length > 0) sa.Item_Details = itemRows;
  if (rec.Requested_Date) sa.Requested_Delivery_Date = String(rec.Requested_Date).slice(0, 10);
  if (rec.Requested_Time) sa.Requested_Delivery_Time = String(rec.Requested_Time);
  const newSaId = await data.addRecord('Service_Appointment_Form', sa);
  await data.updateRecord('DMS_Schedule_Request', recId, { Status: 'Confirmed', Service_Appointment_Record_ID: newSaId }, { byForm: true });
  const push = await pushDmsStatusToCms(rec.CMS_Schedule_Request_ID, 'Confirmed');
  return ok('Confirmed — Service Appointment created.', {
    serviceAppointmentId: newSaId, cmsPushStatus: push.status,
    itemPatchStatus, dateFormatError: '',
  });
}

const implemented = {
  async confirm_dms_schedule_request({ dmsRecordId }, data, ctx = {}) {
    const recId = String(dmsRecordId || '').trim();
    if (!recId) return fail('dmsRecordId is required.');
    return withLock(`confirm:${recId}`, () => confirmRequest(recId, data, ctx));
  },

  // functions/declineDmsScheduleRequest.dg
  async decline_dms_schedule_request({ dmsRecordId }, data) {
    const recId = String(dmsRecordId || '').trim();
    if (!recId) return fail('dmsRecordId is required.');
    const [rec] = await data.find('DMS_Schedule_Request', (r) => r.ID === recId);
    if (!rec) return fail('DMS Schedule Request not found.');
    await data.updateRecord('DMS_Schedule_Request', recId, { Status: 'Declined' }, { byForm: true });
    const push = await pushDmsStatusToCms(rec.CMS_Schedule_Request_ID, 'Declined');
    return ok('Declined.', { cmsPushStatus: push.status });
  },

  // functions/dmsScheduleSlot.dg: the Re-Schedule button of the widgets (reScheduleDelivery runs it with isRerun = true).
  async dms_reschedule({ recordId }, data, ctx = {}) {
    return scheduleSlot(data, recordId, true, { user: ctx.user });
  },

  // functions/createShipmentOrder.dg and createSalesReturnBooks.dg: Zoho Inventory, in inventory-apis.mjs.
  create_shipment_order,
  create_sales_return_books,

  // functions/addDmsScheduleRequestMessage.dg is the CMS -> DMS direction; this is DMS -> CMS.
  push_dms_message_to_cms: (p) => pushDmsMessageToCms(p),

  get_broken_sales_orders,

  // Manual "Recalculate" trigger for the Sorting Engine (spec §05/01 §6). Not a Deluge port, like Fulfillment's own
  // recalculate_fulfillment_queue, so it goes straight into `implemented`, not the `functions` placeholder list.
  async recalculate_delivery_queue(_payload, data) {
    const result = await rescoreAll(data);
    return { status: 'success', ...result };
  },

  // Manual "Generate Month"-equivalent trigger for Team Rotation (Delivery 02 §1, TM-R1), so a dispatcher is not
  // only waiting on the 04:00 job — same rotation.mjs the nightly job calls. Not a Deluge port.
  async generate_team_rotation(_payload, data) {
    const result = await generateRotation(data);
    return { status: 'success', ...result };
  },

  // Earliest available date, with a reason (Delivery 01, "Earliest available date"). Read-only: shows the New SR
  // screen's live answer while the sales agent is still typing, without committing to anything. Not a Deluge port.
  async get_earliest_slot({ jobType, estMinutes, fromDate } = {}, data) {
    const result = await findEarliestSlot(data, { jobType, estMinutes, fromDate });
    return { status: 'success', ...result };
  },

  // Same answer, but holds the slot for soft_hold_minutes (spec default 20) so a second agent quoting in the
  // meantime cannot be told the same last slot is free. Call release_schedule_hold once the SR is actually saved
  // (or not at all — an unreleased hold stops counting on its own once Expires_At passes). Not a Deluge port.
  async quote_and_hold_slot({ jobType, estMinutes, fromDate, quotedBy, srNo } = {}, data, ctx = {}) {
    const result = await quoteAndHold(data, { jobType, estMinutes, fromDate, quotedBy: quotedBy || ctx.user || '', srNo });
    return { status: 'success', ...result };
  },

  async release_schedule_hold({ holdId } = {}, data) {
    await releaseHold(data, holdId);
    return { status: 'success' };
  },

  // Day plans (Delivery 02 §4, DP-R1-R6). Not a Deluge port — this concept did not exist before this session.
  async get_day_plan({ date, installer } = {}, data) {
    const plan = await findDayPlan(data, date, installer);
    return { status: 'success', plan };
  },

  async reorder_day_plan({ date, installer, version, order } = {}, data, ctx = {}) {
    const result = await reorderDayPlan(data, { date, installer, version, order, user: ctx.user });
    return { status: 'success', ...result };
  },

  // Load sheet (Delivery 03 §2, LS-R1-R3). Not a Deluge port.
  async get_load_sheet({ date, installer } = {}, data) {
    const sheet = await buildLoadSheet(data, date, installer);
    return { status: 'success', sheet };
  },

  async confirm_stop_loading({ date, installer, saId, loadedBoxCount } = {}, data, ctx = {}) {
    await confirmStopLoading(data, date, installer, saId, loadedBoxCount, { user: ctx.user });
    return { status: 'success' };
  },

  // Dispatch / the pre-delivery gate (Delivery 03 §3, DS-R1-R5). Not a Deluge port.
  async get_pre_delivery_gate({ date, installer } = {}, data, ctx = {}) {
    const result = await runPreDeliveryGate(data, date, installer, { books: ctx.books });
    return { status: 'success', ...result };
  },

  async dispatch_day({ date, installer, driverSignature, dispatcherSignature } = {}, data, ctx = {}) {
    const result = await dispatchDay(data, date, installer, { user: ctx.user, driverSignature, dispatcherSignature, books: ctx.books });
    return { status: result.ok ? 'success' : 'partial', ...result };
  },

  // Suggesting a schedule (Delivery 02 §3). Not a Deluge port.
  async suggest_schedule({ saId, fromDate } = {}, data) {
    const result = await suggestSchedule(data, saId, { fromDate });
    return { status: 'success', ...result };
  },

  // Third-party bookings (Delivery 02 §5, TP-R1/TP-R4). Not a Deluge port.
  async record_third_party_booking({ saId, provider, bookingRef, fee, pickupTime, driverName, plate, date } = {}, data, ctx = {}) {
    const result = await recordThirdPartyBooking(data, saId, { provider, bookingRef, fee, pickupTime, driverName, plate, date, user: ctx.user });
    return { status: 'success', ...result };
  },

  async record_third_party_result({ saId, resultQty, photo, leftAt, doneAt, customerConfirmed } = {}, data, ctx = {}) {
    const result = await recordThirdPartyResult(data, saId, { resultQty, photo, leftAt, doneAt, customerConfirmed, user: ctx.user });
    return { status: 'success', ...result };
  },

  // Job status chain + event log (Delivery 03 "Job statuses"; 05/04 Timestamps and Event Log). Not a Deluge port.
  async get_job_timeline({ saId } = {}, data) {
    const sa = await data.getRecordById(SA, saId, { raw: true });
    if (!sa) return fail('Service Appointment not found.');
    const events = await data.find('Stage_Events', (e) => String(e.Record_Id) === String(saId) && e.Record_Type === 'service_appointment');
    return { status: 'success', jobStatus: sa.Job_Status || '', events: events.sort((a, b) => String(a.Occurred_At).localeCompare(String(b.Occurred_At))) };
  },

  // Failure, Redelivery and the Delivery Exception Queue (Delivery 05, FR-R1-R5). Not a Deluge port.
  async create_redelivery_job({ saId, reasonCode, notes } = {}, data, ctx = {}) {
    const result = await createRedeliveryJob(data, saId, { reasonCode, notes, user: ctx.user });
    return { status: 'success', ...result };
  },

  async force_close_job({ saId, outcome, reason } = {}, data, ctx = {}) {
    const result = await forceCloseJob(data, saId, { outcome, reason, user: ctx.user });
    return { status: 'success', ...result };
  },

  async get_delivery_exception_queue(_payload, data) {
    const items = await getDeliveryExceptionQueue(data);
    return { status: 'success', items };
  },

  async get_failure_reason_codes(_payload, data) {
    const codes = await failureReasonCodes(data);
    return { status: 'success', codes };
  },

  // Delivery backlog calculator (05 Shared Engines / 02 Calculators §2). Not a Deluge port.
  async get_delivery_backlog({ daysAvailable } = {}, data) {
    const result = await getDeliveryBacklog(data, daysAvailable ? { daysAvailable } : {});
    return { status: 'success', ...result };
  },

  // Control Panel, Delivery group (spec 05/08) and the team roster (Delivery 02, TM-R4). Not Deluge ports.
  async get_delivery_settings(_payload, data) {
    return ok('Delivery settings.', await getSettings(data));
  },
  async preview_delivery_setting({ key, value } = {}, data) {
    return previewSetting(data, key, value);
  },
  async get_delivery_roster(_payload, data) {
    return ok('Delivery roster.', await getRoster(data));
  },
  async seed_delivery_roster(_payload, data, ctx = {}) {
    const r = await seedRoster(data, ctx.user);
    return ok(r.seeded ? `The roster is now editable (${r.seeded} rows).` : 'The roster is already editable.', r);
  },

  async get_delivery_backlog_trend({ weeks } = {}, data) {
    const result = await getBacklogTrend(data, weeks ? { weeks } : {});
    return { status: 'success', ...result };
  },

  // Delivery Analytics key number #3, damage rate by item category (Delivery 09). Not a Deluge port.
  async get_damage_by_category({ days } = {}, data) {
    const result = await getDamageByCategory(data, days ? { days } : {});
    return { status: 'success', ...result };
  },

  // Delivery Analytics key number #7, Ship -> Service Request gap (Delivery 09). Not a Deluge port.
  async get_ship_to_sr_gap(_payload, data) {
    const result = await getShipToSrGap(data);
    return { status: 'success', ...result };
  },

  // Sales Returns (Delivery 07 §1, RT-R1/R3). Not a Deluge port.
  async create_pullout_from_refusal({ saId, reason, subReason } = {}, data, ctx = {}) {
    const result = await createPulloutFromRefusal(data, saId, { reason, subReason, user: ctx.user });
    return { status: 'success', ...result };
  },

  async confirm_return_received({ returnId, condition, notes } = {}, data, ctx = {}) {
    await confirmReturnReceived(data, returnId, { condition, notes, user: ctx.user });
    return { status: 'success' };
  },

  // Truck Maintenance (Delivery 08 §2, TK-R2-R4). Not a Deluge port.
  async record_vehicle_maintenance({ vehicle, type, date, km, shop, cost, receipts } = {}, data, ctx = {}) {
    await recordMaintenance(data, { vehicle, type, date, km, shop, cost, receipts, user: ctx.user });
    return { status: 'success' };
  },

  async mark_vehicle_down({ vehicle, reason } = {}, data, ctx = {}) {
    const result = await markVehicleDown(data, vehicle, { reason, user: ctx.user });
    return { status: 'success', ...result };
  },

  async mark_vehicle_fixed({ vehicle } = {}, data, ctx = {}) {
    const result = await markVehicleFixed(data, vehicle, { user: ctx.user });
    return { status: 'success', ...result };
  },
};

export const apis = withPlaceholders(functions, implemented);
