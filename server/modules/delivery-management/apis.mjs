// Delivery Management custom APIs: the ported ones, and a "not ported yet" placeholder for the rest.
import { ok, fail, withPlaceholders } from '../../custom-api-helpers.mjs';
import { scheduleSlot } from './scheduling.mjs';

// functions/pushDmsStatusToCms.dg / pushDmsMessageToCms.dg: CMS is a separate Zoho app, so it is skipped here.
const cmsSkipped = () => ({ status: 'skipped', message: 'CMS sync is off in the local app.' });

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  confirm_dms_schedule_request: 'confirmDmsScheduleRequest',
  decline_dms_schedule_request: 'declineDmsScheduleRequest',
  push_dms_message_to_cms: 'pushDmsMessageToCms',
  dms_reschedule: 'dmsScheduleSlot',
  create_shipment_order: 'createShipmentOrder',
  create_sales_return_books: 'createSalesReturnBooks',
};

const implemented = {
  // functions/confirmDmsScheduleRequest.dg
  async confirm_dms_schedule_request({ dmsRecordId }, data) {
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
  async decline_dms_schedule_request({ dmsRecordId }, data) {
    const recId = String(dmsRecordId || '').trim();
    if (!recId) return fail('dmsRecordId is required.');
    const [rec] = await data.find('DMS_Schedule_Request', (r) => r.ID === recId);
    if (!rec) return fail('DMS Schedule Request not found.');
    await data.updateRecord('DMS_Schedule_Request', recId, { Status: 'Declined' }, { byForm: true });
    return ok('Declined.', { cmsPushStatus: cmsSkipped().status });
  },

  // functions/dmsScheduleSlot.dg: the Re-Schedule button of the widgets (reScheduleDelivery runs it with isRerun = true).
  async dms_reschedule({ recordId }, data, ctx = {}) {
    return scheduleSlot(data, recordId, true, { user: ctx.user });
  },

  // functions/addDmsScheduleRequestMessage.dg is the CMS -> DMS direction; this is DMS -> CMS.
  push_dms_message_to_cms: cmsSkipped,
};

export const apis = withPlaceholders(functions, implemented);
