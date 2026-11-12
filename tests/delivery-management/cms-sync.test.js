// Delivery Management, D6: the link with the CMS (server/modules/delivery-management/cms-sync.mjs), run on PGlite. The CMS is
// never called: global fetch is replaced. Tests marked "mirrors Zoho" follow the Deluge functions literally.
import { test, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { customApis, modules } from '../../server/modules/index.mjs';
import { upsertDmsScheduleRequest, addDmsScheduleRequestMessage, pushDmsStatusToCms, pushDmsMessageToCms } from '../../server/modules/delivery-management/cms-sync.mjs';
import { truthy } from '../../server/workflows/deluge.mjs';

const REQ = 'DMS_Schedule_Request';
let db, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [REQ, 'DMS_Schedule_Request_Messages', 'Service_Appointment_Form']) await db.query(`DELETE FROM "${f}"`); });

const request = (extra = {}) => ({ cmsRecordId: 'CMS-1', salesOrderNumber: 'SO-1', customerName: 'Maria Santos', requestedDate: '2026-12-01', requestedTime: '09:00:00 AM', requestedBy: 'Agent', notes: 'Call first', booksSalesOrderId: 'b-1', typeOfDelivery: 'Delivery Only', ...extra });
const all = () => store.find(REQ);

test('upsert: a new request is created as Pending Review; an empty CMS id is refused', async () => {
  assert.deepEqual(await upsertDmsScheduleRequest(store, request({ cmsRecordId: '  ' })), { status: 'error', message: 'cmsRecordId is required.' });
  assert.deepEqual(await upsertDmsScheduleRequest(store, request()), { status: 'success', message: 'Synced.' });
  const [r] = await all();
  assert.deepEqual([r.CMS_Schedule_Request_ID, r.Status, r.Sales_Order_Number, r.Customer_Name, r.Requested_Date, r.Requested_Time, r.Requested_By, r.Notes, r.Type_of_Delivery, r.Books_Sales_Order_ID],
    ['CMS-1', 'Pending Review', 'SO-1', 'Maria Santos', '2026-12-01', '09:00:00 AM', 'Agent', 'Call first', 'Delivery Only', 'b-1']);
});

test('upsert: the same CMS id updates the request and keeps its status; the Books id is only replaced when one is sent', async () => {
  await upsertDmsScheduleRequest(store, request());
  const [first] = await all();
  await store.updateRecord(REQ, first.ID, { Status: 'Confirmed' }, { byForm: true });
  await upsertDmsScheduleRequest(store, request({ notes: 'Changed', booksSalesOrderId: '' }));
  const rows = await all();
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].Notes, rows[0].Status, rows[0].Books_Sales_Order_ID], ['Changed', 'Confirmed', 'b-1']);
  await upsertDmsScheduleRequest(store, request({ booksSalesOrderId: 'b-2' }));
  assert.equal((await all())[0].Books_Sales_Order_ID, 'b-2');
});

test('upsert: a date sent in another form is stored as a Zoho date', async () => {
  await upsertDmsScheduleRequest(store, request({ requestedDate: '01-Dec-2026' }));
  assert.equal((await all())[0].Requested_Date, '2026-12-01');
});

test('a message is added to the request with that CMS id, marked as already synced; an unknown id is answered', async () => {
  assert.equal((await addDmsScheduleRequestMessage(store, { cmsRecordId: 'CMS-404', message: 'x' })).message, 'No matching DMS_Schedule_Request found for CMS record CMS-404.');
  await upsertDmsScheduleRequest(store, request());
  const out = await addDmsScheduleRequestMessage(store, { cmsRecordId: 'CMS-1', senderEmail: 'a@example.com', senderName: 'Agent', message: 'Please move to 2pm', sentOn: '2026-11-12 10:00:00 AM' });
  assert.deepEqual(out, { status: 'success', message: 'Synced.' });
  const [m] = await store.find('DMS_Schedule_Request_Messages');
  assert.deepEqual([m.DMS_Schedule_Request_ID, m.Sender_Email, m.Sender_Name, m.Message, m.Sent_On], [(await all())[0].ID, 'a@example.com', 'Agent', 'Please move to 2pm', '2026-11-12 10:00:00 AM']);
  assert.ok(truthy(m.Synced_To_CMS));
});

test('pushing to the CMS: skipped when no URL is set, otherwise posted as JSON and the CMS\'s result is returned', async (t) => {
  t.after(() => mock.restoreAll());
  const asked = [];
  mock.method(globalThis, 'fetch', async (url, init) => { asked.push({ url, init }); return { json: async () => ({ result: { status: 'success' } }) }; });
  assert.deepEqual(await pushDmsStatusToCms('CMS-1', 'Confirmed', {}), { status: 'skipped', message: 'CMS sync is off in the local app.' });
  assert.equal(asked.length, 0);
  assert.deepEqual(await pushDmsStatusToCms('CMS-1', 'Confirmed', { CMS_STATUS_URL: 'https://cms.example/status?key=k' }), { status: 'success' });
  assert.equal(asked[0].url, 'https://cms.example/status?key=k');
  assert.deepEqual(JSON.parse(asked[0].init.body), { cmsRecordId: 'CMS-1', newStatus: 'Confirmed' });
  assert.equal(asked[0].init.headers['Content-Type'], 'application/json');
  await pushDmsMessageToCms({ cmsRecordId: 'CMS-1', senderEmail: 'a@example.com', senderName: 'A', message: 'hi', sentOn: 'now' }, { CMS_MESSAGE_URL: 'https://cms.example/message?key=k' });
  assert.deepEqual(JSON.parse(asked[1].init.body), { cmsRecordId: 'CMS-1', senderEmail: 'a@example.com', senderName: 'A', message: 'hi', sentOn: 'now' });
});

test('a CMS that cannot be reached, or answers without a result, is reported, not thrown', async (t) => {
  t.after(() => mock.restoreAll());
  const env = { CMS_STATUS_URL: 'https://cms.example/status' };
  mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  assert.deepEqual(await pushDmsStatusToCms('CMS-1', 'Declined', env), { status: 'error', message: 'The CMS could not be reached: offline' });
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => ({ json: async () => ({}) }));
  assert.equal((await pushDmsStatusToCms('CMS-1', 'Declined', env)).status, 'error');
});

test('confirm and decline report the CMS push status (skipped without a URL, success with one) and still do their work', async (t) => {
  t.after(() => { mock.restoreAll(); delete process.env.CMS_STATUS_URL; });
  await upsertDmsScheduleRequest(store, request());
  await upsertDmsScheduleRequest(store, request({ cmsRecordId: 'CMS-2', salesOrderNumber: 'SO-2' }));
  const [one, two] = await all();
  const confirmed = await customApis.confirm_dms_schedule_request({ dmsRecordId: one.ID }, store);
  assert.equal(confirmed.status, 'success');
  assert.equal(confirmed.cmsPushStatus, 'skipped');
  assert.equal((await store.getRecordById(REQ, one.ID, { raw: true })).Status, 'Confirmed');

  process.env.CMS_STATUS_URL = 'https://cms.example/status';
  const bodies = [];
  mock.method(globalThis, 'fetch', async (url, init) => { bodies.push(JSON.parse(init.body)); return { json: async () => ({ result: { status: 'success' } }) }; });
  const declined = await customApis.decline_dms_schedule_request({ dmsRecordId: two.ID }, store);
  assert.equal(declined.cmsPushStatus, 'success');
  assert.deepEqual(bodies, [{ cmsRecordId: 'CMS-2', newStatus: 'Declined' }]);
});

test('the push_dms_message_to_cms API answers like the CMS does (the widget reads result.status)', async (t) => {
  t.after(() => mock.restoreAll());
  assert.equal((await customApis.push_dms_message_to_cms({ cmsRecordId: 'CMS-1', message: 'hi' }, store)).status, 'skipped');
});

test('the CMS -> DMS functions are exposed as the module\'s integrations and are not custom APIs', () => {
  const dm = modules.find((m) => m.id === 'delivery-management');
  assert.equal(typeof dm.integrations.upsertDmsScheduleRequest, 'function');
  assert.equal(typeof dm.integrations.addDmsScheduleRequestMessage, 'function');
  assert.equal(customApis.upsertDmsScheduleRequest, undefined);
});
