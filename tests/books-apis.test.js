// create_books_contact and add_item_by_id (server/books/apis.mjs) on PGlite, with a stand-in for Zoho Books.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { invokeCustomApi } from '../server/custom-apis.mjs';
import { BooksError } from '../server/books/client.mjs';

let db, data;

// A stand-in for the Books client: `routes` maps "METHOD /path" to a response (or a function/Error to throw).
function fakeBooks(routes) {
  const calls = [];
  const run = (method) => async (path, opts = {}) => {
    calls.push({ method, path, ...opts });
    const key = `${method} ${path}`;
    if (!(key in routes)) throw new BooksError(`no route ${key}`, { status: 404, code: 1002 });
    const r = routes[key];
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r(opts) : r;
  };
  // Shaped like createZohoApi(): ctx.books.books is the Books service.
  return { calls, books: { books: { get: run('GET'), post: async (path, body) => run('POST')(path, { body }), download: run('DOWNLOAD') } } };
}
const call = (name, payload, ctx) => invokeCustomApi(name, payload, data, ctx);

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  data = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { await db.query('DELETE FROM "Customer"'); await db.query('DELETE FROM "Items"'); });

const CONTACT = { customerId: '', custName: 'ACME Corp', custType: 'Enduser', custEmail: 'a@acme.test', custPhone: '1', custMobile: '2', companyName: 'ACME', custSubType: 'business',
  salutation: 'Mr.', firstName: '', lastName: '', billAddress: '1 Main St', billCity: 'Manila', billCountry: 'PH', shipAddress: '2 Side St' };

test('create_books_contact: sends the contact to Books and links its id into Customer.ID1', async () => {
  const customerId = await data.addRecord('Customer', { customer_name: 'ACME Corp' });
  const zoho = fakeBooks({ 'POST /contacts': { code: 0, contact: { contact_id: '777' } } });
  const out = await call('create_books_contact', { ...CONTACT, customerId }, zoho);
  assert.equal(out.status, 'success');
  assert.equal(out.contactId, '777');
  assert.equal(out.message, 'Books contact created and linked (ID1=777)');
  assert.equal((await data.getRecordById('Customer', customerId, { raw: true })).ID1, '777');

  const sent = zoho.calls[0].body;
  assert.equal(sent.contact_name, 'ACME Corp');
  assert.equal(sent.customer_sub_type, 'business');
  assert.equal(sent.contact_type, 'customer');
  assert.deepEqual(sent.custom_fields, [{ label: 'Customer Type', value: 'End User' }], 'Enduser becomes Books\' "End User"');
  assert.deepEqual(sent.contact_persons[0], { salutation: 'Mr.', first_name: 'ACME Corp', last_name: '', email: 'a@acme.test', phone: '1', mobile: '2', is_primary_contact: true });
  assert.equal(sent.billing_address.address, '1 Main St');
});

test('create_books_contact: first/last name win when given; Designer maps to Design Partner; individual sub type', async () => {
  const customerId = await data.addRecord('Customer', { customer_name: 'Jo' });
  const zoho = fakeBooks({ 'POST /contacts': { code: 0, contact: { contact_id: '1' } } });
  await call('create_books_contact', { ...CONTACT, customerId, custType: 'Designer', custSubType: 'individual', firstName: 'Jo', lastName: 'Cruz' }, zoho);
  const sent = zoho.calls[0].body;
  assert.equal(sent.customer_sub_type, 'individual');
  assert.equal(sent.custom_fields[0].value, 'Design Partner');
  assert.deepEqual([sent.contact_persons[0].first_name, sent.contact_persons[0].last_name], ['Jo', 'Cruz']);
});

test('create_books_contact: no customer type means no custom field; a missing customerId or Books failure is an error answer', async () => {
  const customerId = await data.addRecord('Customer', { customer_name: 'X' });
  const zoho = fakeBooks({ 'POST /contacts': { code: 0, contact: { contact_id: '1' } } });
  await call('create_books_contact', { ...CONTACT, customerId, custType: '' }, zoho);
  assert.equal('custom_fields' in zoho.calls[0].body, false);

  assert.deepEqual(await call('create_books_contact', { ...CONTACT, customerId: '' }, zoho), { status: 'error', message: 'No customerId provided — cannot backfill ID1.' });
  const failing = fakeBooks({ 'POST /contacts': new BooksError('Contact name already exists.', { status: 400, code: 3062 }) });
  const out = await call('create_books_contact', { ...CONTACT, customerId }, failing);
  assert.deepEqual(out, { status: 'error', message: 'Books contact creation failed — Contact name already exists.' });
  assert.equal((await data.getRecordById('Customer', customerId, { raw: true })).ID1, '1', 'a failed call leaves ID1 as it was');
});

test('without a Books client the Books APIs say so instead of failing', async () => {
  for (const name of ['create_books_contact', 'add_item_by_id']) {
    const out = await call(name, { customerId: '1', itemBooksId: '1' }, {});
    assert.equal(out.status, 'error');
    assert.match(out.message, /Books is not available/);
  }
});

const ITEM = {
  name: 'Lamp', sku: 'LAMP-1', cf_oldsku: 'OLD-1', cf_description: 'A lamp', unit: 'pcs', rate: 250, category_name: 'Table Lamps', image_name: 'lamp.png',
  warehouses: [
    { warehouse_id: '2680178000042173149', warehouse_name: 'HC WH3 BAESA', warehouse_actual_available_stock: 5, is_storage_location_enabled: true },
    { warehouse_id: '2680178000055220196', warehouse_name: 'HC WH1 BANAWE', warehouse_actual_available_stock: 0, is_storage_location_enabled: true },
    { warehouse_id: '2680178000047672049', warehouse_name: 'INVENTORY', warehouse_actual_available_stock: 2, is_storage_location_enabled: false },
  ],
};
const itemRoutes = (extra = {}) => ({
  'GET /items/42': { code: 0, item: ITEM },
  'GET /settings/warehouses/2680178000042173149/storagelocations': { storage_locations: [{ name: 'A1', balance_quantity: 3 }, { name: 'A2', balance_quantity: 0 }, { name: 'B7', balance_quantity: 2 }] },
  'GET /settings/warehouses/2680178000055220196/storagelocations': { storage_locations: [{ name: 'Z9', balance_quantity: 0 }] },
  'DOWNLOAD /items/42/image': { buffer: Buffer.from('png-bytes'), contentType: 'image/png' },
  ...extra,
});

test('add_item_by_id: adds a new Items record with warehouses, bin locations and the image', async () => {
  const saved = [];
  const zoho = fakeBooks(itemRoutes());
  const out = await call('add_item_by_id', { itemBooksId: ' 42 ' }, { ...zoho, user: 'staff@example.test', saveUpload: async (name, buf) => { saved.push([name, buf.toString()]); return `/uploads/${name}`; } });
  assert.equal(out.status, 'success');
  assert.equal(out.wasUpdate, false);
  assert.equal(out.message, 'Added new item: Lamp');
  assert.equal(out.imageSynced, true);
  assert.equal(out.Warehouse, 'HC WH3 BAESA, INVENTORY', 'warehouses with physical stock');
  assert.equal(out.Bin_location, 'HC WH3 BAESA: A1, B7 | HC WH1 BANAWE: Map Bins', 'bins with stock; "Map Bins" when none; INVENTORY has no storage locations');
  const row = await data.getRecordById('Items', out.recordId, { raw: true });
  assert.deepEqual([row.ID1, row.item_name, row.SKU, row.Item_ref, row.Description, row.Unit, row.Rate, row.category, row.Image, row.Added_User],
    ['42', 'Lamp', 'LAMP-1', 'OLD-1', 'A lamp', 'pcs', '250', 'Table Lamps', '/uploads/42.png', 'staff@example.test']);
  assert.deepEqual(saved, [['42.png', 'png-bytes']]);
});

test('add_item_by_id: a second call updates the same record and does not fetch the image again', async () => {
  const saveUpload = async (name) => `/uploads/${name}`;
  const first = await call('add_item_by_id', { itemBooksId: '42' }, { ...fakeBooks(itemRoutes()), saveUpload });
  const zoho = fakeBooks(itemRoutes({ 'GET /items/42': { code: 0, item: { ...ITEM, name: 'Lamp v2', rate: 300 } } }));
  const again = await call('add_item_by_id', { itemBooksId: '42' }, { ...zoho, saveUpload });
  assert.equal(again.wasUpdate, true);
  assert.equal(again.recordId, first.recordId);
  assert.equal(again.message, 'Updated existing item: Lamp v2');
  assert.equal(again.imageSynced, false);
  assert.equal(zoho.calls.some((c) => c.method === 'DOWNLOAD'), false, 'the item already has a photo');
  assert.equal((await data.find('Items')).length, 1);
  const row = await data.getRecordById('Items', first.recordId, { raw: true });
  assert.deepEqual([row.item_name, row.Rate, row.Image], ['Lamp v2', '300', '/uploads/42.png']);
});

test('add_item_by_id: an image failure keeps the item and says so; an unknown item is an error', async () => {
  const zoho = fakeBooks(itemRoutes({ 'DOWNLOAD /items/42/image': new BooksError('boom') }));
  const out = await call('add_item_by_id', { itemBooksId: '42' }, { ...zoho, saveUpload: async (n) => n });
  assert.equal(out.status, 'success');
  assert.equal(out.message, 'Added new item: Lamp (image sync failed — item saved without photo)');
  assert.equal((await data.find('Items')).length, 1);

  assert.deepEqual(await call('add_item_by_id', { itemBooksId: '999' }, fakeBooks(itemRoutes())), { status: 'error', message: 'Item not found in Books for ID 999 — check the ID and try again.' });
  assert.deepEqual(await call('add_item_by_id', { itemBooksId: '  ' }, fakeBooks({})), { status: 'error', message: 'Item ID is required.' });
});
