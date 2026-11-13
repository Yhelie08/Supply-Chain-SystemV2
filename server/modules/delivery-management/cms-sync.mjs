// The link with the CMS, a separate Zoho app where customer service staff raise DMS schedule requests. Ported from
// zoho-export/parsed/functions/: upsertDmsScheduleRequest.dg, addDmsScheduleRequestMessage.dg (the CMS -> DMS direction),
// pushDmsStatusToCms.dg and pushDmsMessageToCms.dg (DMS -> CMS).
//
// CMS -> DMS: `upsertDmsScheduleRequest` and `addDmsScheduleRequestMessage` have no caller inside Creator; the CMS app
// calls them. They are plain functions here, listed as `integrations` of the module (not as custom APIs: no widget calls
// them, and they must not be open to every signed-in user). Whether the CMS stays, and how it reaches this app (a route
// with an API key, a core change), is a decision for the team; until then nothing calls them but the tests.
//
// DMS -> CMS: the two Deluge functions post to public Creator URLs with a public key typed into the script (public in git;
// not copied). Here the URLs are CMS_STATUS_URL and CMS_MESSAGE_URL in .env (key included in the URL). Unset means the
// push is skipped, which is how the app answers today ("CMS sync is off"), and the widgets show their "use Resync" notice.
import { blank } from '../../workflows/deluge.mjs';
import { parseDateTime } from './field-work.mjs';

const text = (v) => (v == null ? '' : String(v));
const skipped = () => ({ status: 'skipped', message: 'CMS sync is off in the local app.' });

// A Zoho date as "YYYY-MM-DD", whatever form the CMS sent it in ("2026-12-01", "01-Dec-2026"); anything else as it came.
function isoDate(value) {
  const d = parseDateTime(value);
  return d ? `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : text(value);
}

// ---------- CMS -> DMS ----------
// Creates the request, or updates it when the CMS record id is already there (the last one, as the script's loop does).
export async function upsertDmsScheduleRequest(store, p, { user = '' } = {}) {
  const cmsId = text(p.cmsRecordId).trim();
  if (cmsId === '') return { status: 'error', message: 'cmsRecordId is required.' };
  const same = await store.find('DMS_Schedule_Request', (r) => r.CMS_Schedule_Request_ID === cmsId);
  const fields = {
    Sales_Order_Number: text(p.salesOrderNumber), Customer_Name: text(p.customerName), Requested_Date: isoDate(p.requestedDate),
    Requested_Time: text(p.requestedTime), Requested_By: text(p.requestedBy), Notes: text(p.notes), Type_of_Delivery: text(p.typeOfDelivery),
  };
  if (same.length) {
    const id = same.at(-1).ID;
    await store.updateRecord('DMS_Schedule_Request', id, fields, { byForm: true });
    if (text(p.booksSalesOrderId) !== '') await store.updateRecord('DMS_Schedule_Request', id, { Books_Sales_Order_ID: text(p.booksSalesOrderId) }, { byForm: true });
  } else {
    await store.addRecord('DMS_Schedule_Request', { CMS_Schedule_Request_ID: cmsId, ...fields, Status: 'Pending Review', Books_Sales_Order_ID: text(p.booksSalesOrderId) }, user);
  }
  return { status: 'success', message: 'Synced.' };
}

// Adds a message to the request that has this CMS id.
export async function addDmsScheduleRequestMessage(store, p, { user = '' } = {}) {
  const cmsId = text(p.cmsRecordId).trim();
  const same = await store.find('DMS_Schedule_Request', (r) => r.CMS_Schedule_Request_ID === cmsId);
  if (!same.length) return { status: 'error', message: `No matching DMS_Schedule_Request found for CMS record ${cmsId}.` };
  await store.addRecord('DMS_Schedule_Request_Messages', {
    DMS_Schedule_Request_ID: same.at(-1).ID, Sender_Email: text(p.senderEmail), Sender_Name: text(p.senderName), Message: text(p.message),
    Sent_On: text(p.sentOn), Synced_To_CMS: true,
  }, user);
  return { status: 'success', message: 'Synced.' };
}

// ---------- DMS -> CMS ----------
async function postToCms(url, body) {
  if (blank(url)) return skipped();
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    return json?.result ?? { status: 'error', message: 'The CMS did not answer with a result.' };
  } catch (e) {
    return { status: 'error', message: `The CMS could not be reached: ${e.message}` };
  }
}
// What the confirm and decline APIs report as `cmsPushStatus` (the Deluge reads `.get("status")` of this answer).
export const pushDmsStatusToCms = (cmsRecordId, newStatus, env = process.env) => postToCms(env.CMS_STATUS_URL, { cmsRecordId, newStatus });
// The `push_dms_message_to_cms` custom API: the widget reads `resp.result.status` and retries until it is "success".
export const pushDmsMessageToCms = (p, env = process.env) => postToCms(env.CMS_MESSAGE_URL, {
  cmsRecordId: p.cmsRecordId, senderEmail: p.senderEmail, senderName: p.senderName, message: p.message, sentOn: p.sentOn,
});
