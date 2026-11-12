// create_estimate (server/modules/procurement/estimates.mjs) on PGlite with a stand-in for Zoho Books: nothing reaches Books.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { invokeCustomApi } from '../../server/custom-apis.mjs';
import { BooksError } from '../../server/books/client.mjs';
import { today } from '../../server/criteria.mjs';

let db, data, customer, project, item;
const FORMS = ['Inquiry_Form', 'Projects', 'Customer', 'Items'];

function fakeBooks(routes) {
  const calls = [];
  const run = (method) => async (path, a, b) => {
    const opts = method === 'POST' || method === 'PUT' ? { body: a } : (a || {});
    calls.push({ method, path, ...opts });
    const r = routes[`${method} ${path}`];
    if (r === undefined) throw new BooksError(`no route ${method} ${path}`, { status: 404, code: 1002 });
    if (r instanceof Error) throw r;
    return r;
  };
  return { calls, books: { books: { get: run('GET'), post: run('POST'), put: run('PUT') } } };
}
const estimate = (id, no, extra = {}) => ({ code: 0, estimate: { estimate_id: id, estimate_number: no, ...extra } });
const call = (inqNo, ctx) => invokeCustomApi('create_estimate', { inqNo }, data, ctx);
const inquiry = (extra = {}) => data.addRecord('Inquiry_Form', {
  INQ_No: 'INQ-00001', Projects: project, Customer: customer, Items: item, sku: 'LAMP-1', quantity: '3', SRP_Approved1: 1000, description: 'A lamp', Dimension: '10x10',
  quote_group: 'PRJ-1', Sales_Owner: 'HC Sales 7', Customer_Type: 'Enduser', target_date: '2026-12-01', Supplier_Selected: true, Availability: true, Final_Price_Exists: true,
  SRP_Approved: true, Product_Sample: 'Completed', D_Image: 'N/A', Specification: 'Completed', Technical_Drawing: 'Completed', Ready_for_Estimates: true, ...extra,
});
const read = (form, id) => data.getRecordById(form, id, { raw: true });

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  data = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
  customer = await data.addRecord('Customer', { customer_name: 'ACME', ID1: 'C100' });
  project = await data.addRecord('Projects', { Project_Name: 'Mall', Customer: customer });
  item = await data.addRecord('Items', { ID1: 'B1', item_name: 'Lamp', SKU: 'LAMP-1' });
});

test('first estimate for a project: created in Books from the ready inquiries, ids saved on inquiry and project', async () => {
  const id = await inquiry();
  const zoho = fakeBooks({ 'POST /estimates': estimate('E1', 'EST-0001') });
  const out = await call('INQ-00001', zoho);
  assert.deepEqual(out, { status: 'success', estimateId: 'E1', estimateNo: 'EST-0001', message: 'Estimate EST-0001 created with 1 items' });

  const body = zoho.calls[0].body;
  assert.equal(body.customer_id, 'C100');
  assert.equal(body.date, today());
  assert.equal(body.expiry_date, '2026-12-01');
  assert.deepEqual(body.line_items, [{ item_id: 'B1', name: 'Lamp', description: 'A lamp\nDimension: 10x10', quantity: 3, rate: 1000 }]);
  assert.deepEqual(body.custom_fields.map((f) => f.label), ['Sales Agent', 'Project Name', 'Design Company', 'Designer/ Architect', 'Design Partner', 'Commission ',
    'Customer Type', 'Order Type', 'Project Type:', 'For Bidding? (✓ if yes)', 'Additional discount needed', 'Target Delivery Date', 'INQ No']);
  const field = (label) => body.custom_fields.find((f) => f.label === label).value;
  assert.deepEqual([field('Sales Agent'), field('Project Name'), field('Customer Type'), field('INQ No')], ['HC Sales 7', 'Mall', 'End User', 'INQ-00001']);

  const rec = await read('Inquiry_Form', id);
  assert.deepEqual([rec.Books_Estimate_ID, rec.Books_Estimate_No, rec.Estimate_Created], ['E1', 'EST-0001', true]);
  const proj = await read('Projects', project);
  assert.deepEqual([proj.Books_Estimate_ID, proj.Books_Estimate_No], ['E1', 'EST-0001']);
});

test('later estimate for the same project: the existing estimate is updated, keeping its line item ids', async () => {
  await inquiry();
  await data.updateRecord('Projects', project, { Books_Estimate_ID: 'E1', Books_Estimate_No: 'EST-0001' }, { byForm: true });
  const zoho = fakeBooks({
    'GET /estimates/E1': estimate('E1', 'EST-0001', { line_items: [{ item_id: 'B1', line_item_id: 'L1' }, { item_id: 'OTHER', line_item_id: 'L2' }] }),
    'PUT /estimates/E1': estimate('E1', 'EST-0001'),
  });
  const out = await call('INQ-00001', zoho);
  assert.deepEqual(out, { status: 'success', estimateId: 'E1', estimateNo: 'EST-0001', message: 'Estimate EST-0001 updated in Zoho Books' });
  const put = zoho.calls.find((c) => c.method === 'PUT').body;
  assert.equal(put.line_items[0].line_item_id, 'L1');
  assert.equal('customer_id' in put, false);
  assert.equal(zoho.calls.some((c) => c.method === 'POST'), false);
});

test('only ready inquiries of the project are in the estimate; an unrelated inquiry with an empty group is left out', async () => {
  await inquiry();
  await inquiry({ INQ_No: 'INQ-00002', quantity: '0', sku: 'OTHER', Items: '' });                           // same project, ready: quantity falls back to 1
  await inquiry({ INQ_No: 'INQ-00003', Ready_for_Estimates: false, Supplier_Selected: false });             // same project, not ready
  const otherProject = await data.addRecord('Projects', { Project_Name: 'Other' });
  await inquiry({ INQ_No: 'INQ-00004', Projects: otherProject, quote_group: '' });                          // other project
  const zoho = fakeBooks({ 'POST /estimates': estimate('E1', 'EST-0001') });
  const out = await call('INQ-00001', zoho);
  assert.equal(out.message, 'Estimate EST-0001 created with 2 items');
  assert.equal(zoho.calls[0].body.custom_fields.find((f) => f.label === 'INQ No').value, 'INQ-00001, INQ-00002');
  assert.equal(zoho.calls[0].body.line_items[1].quantity, 1);
  assert.equal(zoho.calls[0].body.line_items[1].name, 'OTHER', 'no matching item: the SKU is the name');
  assert.equal('item_id' in zoho.calls[0].body.line_items[1], false);
});

test('refuses when the inquiry is missing, not ready, or has no project', async () => {
  const none = fakeBooks({});
  assert.deepEqual(await call('INQ-99999', none), { status: 'error', message: 'Inquiry INQ-99999 not found' });
  await inquiry({ Ready_for_Estimates: false, Supplier_Selected: false });
  assert.match((await call('INQ-00001', none)).message, /not yet ready for estimate/);
  await db.query('DELETE FROM "Inquiry_Form"');
  await inquiry({ Projects: '' });
  assert.equal((await call('INQ-00001', none)).message, 'No project assigned. Please assign a project first.');
  assert.equal(none.calls.length, 0);
});

test('a stale "ready" flag is healed when the fields say it is ready', async () => {
  const id = await inquiry({ Ready_for_Estimates: false });
  const out = await call('INQ-00001', fakeBooks({ 'POST /estimates': estimate('E1', 'EST-0001') }));
  assert.equal(out.status, 'success');
  assert.equal((await read('Inquiry_Form', id)).Ready_for_Estimates, true);
});

test('customer: falls back to the project customer, then looks it up in Books by name', async () => {
  const id = await inquiry({ Customer: '' });
  const zoho = fakeBooks({ 'POST /estimates': estimate('E1', 'EST-0001') });
  assert.equal((await call('INQ-00001', zoho)).status, 'success');
  assert.equal(zoho.calls[0].body.customer_id, 'C100');
  assert.equal((await read('Inquiry_Form', id)).Customer, customer, 'the inquiry now has the project\'s customer');

  await db.query('DELETE FROM "Inquiry_Form"');
  await data.updateRecord('Customer', customer, { ID1: '' }, { byForm: true });
  await data.updateRecord('Projects', project, { Books_Estimate_ID: '' }, { byForm: true });
  await inquiry();
  const byName = fakeBooks({ 'GET /contacts': { code: 0, contacts: [{ contact_id: 'C200' }] }, 'POST /estimates': estimate('E2', 'EST-0002') });
  assert.equal((await call('INQ-00001', byName)).status, 'success');
  assert.deepEqual(byName.calls[0].query, { contact_name: 'ACME' });
  assert.equal(byName.calls.find((c) => c.method === 'POST').body.customer_id, 'C200');
  assert.equal((await read('Customer', customer)).ID1, 'C200', 'the Books id is remembered');
});

test('customer not in Books: a clear error and nothing is created', async () => {
  await inquiry();
  await data.updateRecord('Customer', customer, { ID1: '' }, { byForm: true });
  const zoho = fakeBooks({ 'GET /contacts': { code: 0, contacts: [] } });
  assert.equal((await call('INQ-00001', zoho)).message, "Customer 'ACME' is not linked to Zoho Books (missing contact ID).");
  assert.equal(zoho.calls.some((c) => c.method === 'POST'), false);
});

test('an estimate Books no longer has is forgotten and a new one is created; a Books outage is not mistaken for that', async () => {
  await inquiry();
  await data.updateRecord('Projects', project, { Books_Estimate_ID: 'GONE', Books_Estimate_No: 'EST-0009' }, { byForm: true });
  const gone = fakeBooks({ 'GET /estimates/GONE': new BooksError('The estimate does not exist.', { status: 404, code: 1002 }), 'POST /estimates': estimate('E3', 'EST-0010') });
  assert.equal((await call('INQ-00001', gone)).message, 'Estimate EST-0010 created with 1 items');
  assert.equal((await read('Projects', project)).Books_Estimate_ID, 'E3');

  await data.updateRecord('Projects', project, { Books_Estimate_ID: 'E3', Books_Estimate_No: 'EST-0010' }, { byForm: true });
  const down = fakeBooks({ 'GET /estimates/E3': new BooksError('Service unavailable', { status: 503 }) });
  const out = await call('INQ-00001', down);
  assert.equal(out.status, 'error');
  assert.match(out.message, /Could not check the existing estimate in Books: Service unavailable/);
  assert.equal(down.calls.some((c) => c.method === 'POST'), false, 'no duplicate estimate');
  assert.equal((await read('Projects', project)).Books_Estimate_ID, 'E3', 'the stored id is kept');
});

test('Books rejecting the estimate is reported with its message and nothing is saved', async () => {
  const id = await inquiry();
  const out = await call('INQ-00001', fakeBooks({ 'POST /estimates': new BooksError('Invalid value passed for expiry_date.', { status: 400, code: 4 }) }));
  assert.deepEqual(out, { status: 'error', message: 'Books CREATE failed: Invalid value passed for expiry_date.' });
  assert.equal((await read('Inquiry_Form', id)).Estimate_Created, false);
  assert.equal((await read('Projects', project)).Books_Estimate_ID, '');
});
