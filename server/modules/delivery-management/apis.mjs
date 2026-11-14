// Delivery Management custom APIs: the ported ones, and a "not ported yet" placeholder for the rest.
import { ok, fail, withPlaceholders } from '../../custom-api-helpers.mjs';
import { scheduleSlot } from './scheduling.mjs';
import { create_shipment_order, create_sales_return_books } from './inventory-apis.mjs';
import { pushDmsStatusToCms, pushDmsMessageToCms } from './cms-sync.mjs';
import { withLock } from './locks.mjs';

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
};

export const apis = withPlaceholders(functions, implemented);
