// Zoho Custom APIs (called from widgets via ZOHO.CREATOR.DATA.invokeCustomApi), ported from the
// Deluge functions in zoho-export/parsed/functions/. Each handler returns the Deluge "response" map.
//
// Calls to Zoho Books and the CMS app are external integrations; they are skipped locally and the
// response says so, instead of pretending they ran.
// The data layer is the SQLite store by default; the Postgres backend passes its own store as `data`.
// Both offer find / addRecord / updateRecord, and every call is awaited so either one works.
import * as sqlite from './db.mjs';

const ok = (message, extra = {}) => ({ status: 'success', message, ...extra });
const fail = (message) => ({ status: 'error', message });
const notPorted = (fn) => () => fail(`"${fn}" is not ported yet — it still only runs inside Zoho. See zoho-export/parsed/functions/${fn}.dg`);

// functions/pushDmsStatusToCms.dg / pushDmsMessageToCms.dg — CMS is a separate Zoho app.
const cmsSkipped = () => ({ status: 'skipped', message: 'CMS sync is off in the local app.' });

export const customApis = {
  // functions/confirmDmsScheduleRequest.dg
  async confirm_dms_schedule_request({ dmsRecordId }, data = sqlite) {
    const recId = String(dmsRecordId || '').trim();
    if (!recId) return fail('dmsRecordId is required.');
    const [rec] = await data.find('DMS_Schedule_Request', (r) => r.ID === recId);
    if (!rec) return fail('DMS Schedule Request not found.');
    // Zoho also pulls the shipping address and line items from the Books sales order
    // (Books_Sales_Order_ID). Books is not connected locally, so those stay blank.
    const sa = {
      Sales_Order: rec.Sales_Order_Number,
      Customer_Name: { last_name: rec.Customer_Name },
      Customer_Address: '', City: '', Contact: '', Email: '',
      Type_of_Delivery: rec.Type_of_Delivery || '',
    };
    if (rec.Requested_Date) sa.Requested_Delivery_Date = String(rec.Requested_Date).slice(0, 10);
    if (rec.Requested_Time) sa.Requested_Delivery_Time = String(rec.Requested_Time);
    const newSaId = await data.addRecord('Service_Appointment_Form', sa);
    await data.updateRecord('DMS_Schedule_Request', recId, { Status: 'Confirmed', Service_Appointment_Record_ID: newSaId }, { byForm: true });
    return ok('Confirmed — Service Appointment created.', {
      serviceAppointmentId: newSaId, cmsPushStatus: cmsSkipped().status,
      itemPatchStatus: rec.Books_Sales_Order_ID ? 'skipped_books_offline' : 'skipped', dateFormatError: '',
    });
  },

  // functions/declineDmsScheduleRequest.dg
  async decline_dms_schedule_request({ dmsRecordId }, data = sqlite) {
    const recId = String(dmsRecordId || '').trim();
    if (!recId) return fail('dmsRecordId is required.');
    const [rec] = await data.find('DMS_Schedule_Request', (r) => r.ID === recId);
    if (!rec) return fail('DMS Schedule Request not found.');
    await data.updateRecord('DMS_Schedule_Request', recId, { Status: 'Declined' }, { byForm: true });
    return ok('Declined.', { cmsPushStatus: cmsSkipped().status });
  },

  // functions/addDmsScheduleRequestMessage.dg is the CMS -> DMS direction; this is DMS -> CMS.
  push_dms_message_to_cms: cmsSkipped,

  // Still to port. Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
  dms_reschedule: notPorted('dmsScheduleSlot'),
  create_shipment_order: notPorted('createShipmentOrder'),
  create_sales_return_books: notPorted('createSalesReturnBooks'),
  acknowledge_po_fenteng: notPorted('acknowledgePOFenteng'),
  acknowledge_po_tony: notPorted('acknowledgePOTony'),
  approve_rr_fenteng: notPorted('approveRRFenteng'),
  approve_rr_tony: notPorted('approveRRTony'),
  clone_shipment_for_replacement: notPorted('cloneShipmentForReplacement'),
  create_bin_receiving: notPorted('createBinReceivingWidget'),
  create_receiving_from_shipment: notPorted('createReceivingFromShipmentWidget'),
  create_package_ff: notPorted('createPackageFF'),
  create_rr_main: notPorted('createRRMain'),
  create_rr_tony: notPorted('createRRTony'),
  create_rr_fenteng: notPorted('createRRFenteng'),
  check_payment_status: notPorted('checkPaymentStatus'),
  // Zoho Books integrations
  add_item_by_id: notPorted('addItemByIdBooks'),
  create_books_contact: notPorted('createBooksContact'),
  create_estimate: notPorted('createEstimateForInquiry'),
};

export async function invokeCustomApi(name, payload, data = sqlite) {
  const fn = customApis[name];
  if (!fn) return fail(`Unknown custom API "${name}".`);
  return fn(payload || {}, data);
}


