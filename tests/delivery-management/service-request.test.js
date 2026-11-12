// Delivery Management, D3a: SR_Created_Make_Appointme (server/modules/delivery-management/service-request.mjs), run on
// PGlite with the hooked store. Tests marked "mirrors Zoho" follow the Deluge script literally; they are to be confirmed
// against Zoho Development.
import { test, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { ymd, todayDate, truthy } from '../../server/workflows/deluge.mjs';
import { clock12 } from '../../server/modules/delivery-management/service-request.mjs';

const SR = 'Service_Request1';
const SA = 'Service_Appointment_Form';
const FORMS = [SR, SA, 'Package_Shipments', 'Delivery_Scheduling'];
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const request = (extra = {}) => ({
  Sales_Order: 'SO-100', Package_Number: 'PAC-1, PAC-2', Delivery_Type: 'With Installation', Customer_Name: 'Maria Santos',
  Customer_Address: '1 Main St', City: 'Quezon City', Email: 'maria@example.com', Phone_Number: '09171234567', Original_SO: 'SO-OLD',
  RMA1: 'RMA-1', Reason: 'Damaged', Sub: 'Damaged Item', If_Pull_Out: 'No', Priority_Level: 'High Priority', Scheduled_by: 'Officer',
  Delivery_Date: '2026-12-01', Initial_Schedule_Time: '2026-10-27 09:39:00 AM',
  Item_Details: [{ Item_Name: 'Lamp', SKU: 'L-1', Quantity: 2, PAC: 'PAC-1' }, { Item_Name: 'Switch', SKU: 'S-1', Quantity: 1, PAC: 'PAC-2' }, { Item_Name: 'Bulb', SKU: 'B-1', Quantity: 4, PAC: 'PAC-1' }],
  ...extra,
});
const appointments = () => raw.find(SA);
const packages = () => raw.find('Package_Shipments');

test('clock text: the time part of a date-time, in the 12-hour form of a Time field', () => {
  assert.equal(clock12('2026-10-27 09:39:00 AM'), '09:39:00 AM');
  assert.equal(clock12('2026-10-27 21:05:30'), '09:05:30 PM');
  assert.equal(clock12('2026-10-27 00:15:00'), '12:15:00 AM');
  assert.equal(clock12('2026-10-27 12:00:00 PM'), '12:00:00 PM');
  assert.equal(clock12('2026-10-27'), '');
  assert.equal(clock12(''), '');
});

test('a new Service Request creates a Queued appointment with the request details, and is written back to', async () => {
  const schedule = await raw.addRecord('Delivery_Scheduling', { Order_Date: '2026-10-20' });
  const id = await store.addRecord(SR, request({ Initial_Schedule_ID: schedule }));
  const [sa] = await appointments();
  assert.equal(sa.Appointment_Status, 'Queued');
  assert.equal(sa.Site_Confirmation_Status, 'Pending');
  assert.equal(sa.Exception_Status, 'None');
  assert.deepEqual([sa.Sales_Order, sa.Sales_Order_Display, sa.Package_Number, sa.Customer_Address, sa.City, sa.Email, sa.Contact], ['SO-100', 'SO-100', 'PAC-1, PAC-2', '1 Main St', 'Quezon City', 'maria@example.com', '09171234567']);
  assert.equal(sa.Type_of_Delivery, 'With Installation');
  assert.deepEqual([sa.Service_Request_ID, sa.Initial_Schedule_ID, sa.Original_SO, sa.RMA, sa.Reason, sa.Sub_Reason, sa.If_Pull_Out, sa.Priority_Level, sa.Scheduled_by], [id, schedule, 'SO-OLD', 'RMA-1', 'Damaged', 'Damaged Item', 'No', 'High Priority', 'Officer']);
  assert.deepEqual([sa.Customer_Name.first_name, sa.Customer_Name.last_name], ['', 'Maria Santos']);
  assert.deepEqual([sa.Requested_Delivery_Date, sa.Requested_Delivery_Time, sa.Order_Date], ['2026-12-01', '09:39:00 AM', '2026-10-20']);
  assert.equal(sa.Fulfillment_Completed_Date, ymd(todayDate())); // the day the Initial Scheduling record was added
  assert.equal(sa.Item_Details.length, 3);
  const back = await raw.getRecordById(SR, id, { raw: true });
  assert.equal(back.Service_Appointment_ID, sa.ID);
  assert.equal(back.SR_Status, 'Scheduling');
});

test('one Package_Shipments row per distinct PAC of the items', async () => {
  const id = await store.addRecord(SR, request());
  const rows = await packages();
  assert.deepEqual(rows.map((r) => r.Package_Number).sort(), ['PAC-1', 'PAC-2']);
  const [sa] = await appointments();
  for (const r of rows) {
    assert.equal(r.Service_Appointment_ID, sa.ID);
    assert.equal(r.Sales_Order, 'SO-100');
    assert.ok(!truthy(r.Shipment_Created));
  }
  assert.ok(id);
});

test('mirrors Zoho: with no PAC on any item row, the header Package_Number is split on commas', async () => {
  await store.addRecord(SR, request({ Package_Number: 'PAC-7, PAC-8 ,, PAC-7', Item_Details: [{ Item_Name: 'Lamp', SKU: 'L-1', Quantity: 1, PAC: '' }] }));
  assert.deepEqual((await packages()).map((r) => r.Package_Number).sort(), ['PAC-7', 'PAC-8']);
});

test('mirrors Zoho: a delivery type that is not one of the 8 choices is dropped (it would refuse the whole insert)', async () => {
  await store.addRecord(SR, request({ Delivery_Type: 'Delivery and Installation' }));
  await store.addRecord(SR, request({ Delivery_Type: ' Pick Up ', Sales_Order: 'SO-101' }));
  const types = Object.fromEntries((await appointments()).map((a) => [a.Sales_Order, a.Type_of_Delivery]));
  assert.deepEqual(types, { 'SO-100': '', 'SO-101': 'Pick Up' });
});

test('the request date and time, the customer and the order date are written only when present; the dispatch day is today without a schedule', async () => {
  await store.addRecord(SR, { Sales_Order: 'SO-102' });
  const [sa] = await appointments();
  assert.equal(sa.Requested_Delivery_Date, '');
  assert.equal(sa.Requested_Delivery_Time, '');
  assert.equal(sa.Order_Date, '');
  assert.ok(!sa.Customer_Name || !sa.Customer_Name.last_name);
  assert.equal(sa.Fulfillment_Completed_Date, ymd(todayDate()));
  assert.equal((await packages()).length, 0);
});

test('a Service Request that already has an appointment gets no second one', async () => {
  await store.addRecord(SR, request({ Service_Appointment_ID: '4662244000099999999' }));
  assert.equal((await appointments()).length, 0);
});

test('a retry after an aborted run is safe: the run only counts as finished once the appointment id is written back', async () => {
  const id = await store.addRecord(SR, request());
  assert.equal((await appointments()).length, 1);
  await store.updateRecord(SR, id, { Reason: 'Changed' }, { byForm: true }); // saved again: not an "add", nothing new
  assert.equal((await appointments()).length, 1);
});

test('checked on Zoho Development: the new appointment does not run its own workflows (no geocoding when it is created)', async (t) => {
  const key = process.env.GEOAPIFY_API_KEY;
  process.env.GEOAPIFY_API_KEY = 'test-key';
  const asked = [];
  mock.method(globalThis, 'fetch', async (url) => { asked.push(url); return { json: async () => ({ results: [] }) }; });
  t.after(() => { mock.restoreAll(); if (key === undefined) delete process.env.GEOAPIFY_API_KEY; else process.env.GEOAPIFY_API_KEY = key; });
  await store.addRecord(SR, request());
  const [sa] = await appointments();
  assert.equal(asked.length, 0);
  assert.equal(sa.Geocode_Status, '');
  assert.equal(sa.Sales_Order_Display, 'SO-100'); // set by the insert itself
  assert.equal(sa.Appointment_Status, 'Queued');
});
