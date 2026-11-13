// Inquiry_Form workflows ported from Zoho (server/modules/procurement/inquiry.mjs), run on PGlite.
// Tests marked "mirrors Zoho" follow the Deluge script literally, including its quirks; they are to be
// confirmed against Zoho Development (see the oracle comparison in the migration plan).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { SUPPLIERS } from '../../server/workflows/suppliers.mjs';

const TONY_BOOKS = SUPPLIERS[0].booksId;
const FENTENG_BOOKS = SUPPLIERS[1].booksId;
let db, raw, store, tony, fenteng, project, item;

const FORMS = ['Inquiry_Form', 'Supplier_1', 'Supplier_2', 'Tony_Notifications', 'Fenteng_Notifications', 'Suppliers', 'Projects', 'Items'];
const inquiry = async (id) => raw.getRecordById('Inquiry_Form', id, { raw: true });
const copiesOf = (form, no) => raw.find(form, (r) => r.INQ_No_Supplier === no);
const base = (extra = {}) => ({ sku: 'LAMP-1', quantity: 3, unit: 'pcs', target_date: '2026-12-01', description: 'A lamp', Items: item, Projects: project, Suppliers: [tony, fenteng], ...extra });

before(async () => {
  process.env.TONY_PORTAL_EMAIL = 'tony@example.test';
  process.env.FENTENG_PORTAL_EMAIL = 'fenteng@example.test';
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});

beforeEach(async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
  tony = await raw.addRecord('Suppliers', { Supplier_ID: TONY_BOOKS, Supplier_Name: { first_name: 'Tony', last_name: 'Fan' } });
  fenteng = await raw.addRecord('Suppliers', { Supplier_ID: FENTENG_BOOKS, Supplier_Name: { first_name: 'Fenteng' } });
  project = await raw.addRecord('Projects', { Project_Code: 'PRJ-1', Project_Name: 'Mall' });
  item = await raw.addRecord('Items', { SKU: 'LAMP-1', item_name: 'Lamp', Image: '/api/v2.1/lamp.png' });
});

test('a new inquiry gets its number, project group, quote rows and product image', async () => {
  const id = await store.addRecord('Inquiry_Form', base(), 'staff@example.test');
  const rec = await inquiry(id);
  assert.match(rec.INQ_No, /^INQ-\d{5}$/);
  assert.equal(rec.INQ_No, `INQ-${String(rec.INQ_Seq).padStart(5, '0')}`);
  assert.equal(rec.quote_group, 'PRJ-1');
  assert.deepEqual(rec.Supplier_Quotes.map((q) => [q.Suppliers, q.Supplier_ID, q.Stage]),
    [['Tony', `[${tony}]`, 'Not Selected'], ['Fenteng', `[${fenteng}]`, 'Not Selected']]);
  assert.deepEqual(rec.Supplier_Quotes_Last_Edited.map((q) => q.Suppliers_Last_Edited), ['Tony', 'Fenteng']);
  assert.equal(rec.Product_Image, '/api/v2.1/lamp.png');
});

test('each asked supplier gets a copy of the inquiry and a notification', async () => {
  const id = await store.addRecord('Inquiry_Form', base(), 'staff@example.test');
  const { INQ_No } = await inquiry(id);
  for (const [s, supplierName, email, page] of [[SUPPLIERS[0], 'Tony', 'tony@example.test', 'Tony_Fan_Inquiries'], [SUPPLIERS[1], 'Fenteng', 'fenteng@example.test', 'Fenteng_Lighting_Inquiries']]) {
    const [copy] = await copiesOf(s.form, INQ_No);
    assert.ok(copy, `${s.form} has a copy`);
    assert.equal(copy.Response_Status, 'Waiting');
    assert.equal(copy.edit_counter, '1');
    assert.equal(copy.SKU_Supplier, 'LAMP-1');
    assert.equal(copy.Quantity_Supplier, '3');
    assert.equal(copy.Added_User, 'staff@example.test');
    assert.equal(copy[s.imageField], '/api/v2.1/lamp.png');
    assert.deepEqual(copy.Supplier_quotes.map((q) => q.SupplierName), [supplierName], 'only that supplier\'s quote row');
    const [note] = await raw.find(s.notifications);
    assert.equal(note.Recipient_Email, email);
    assert.equal(note.Message, `A new inquiry ${INQ_No} was added.`);
    assert.equal(note.Source_Record_ID, copy.ID);
    assert.match(note.Target_URL, new RegExp(`#Page:${page}\\?${s.param}=INQ-${copy.ID}-\\d{14}$`));
    assert.equal(note.Read, false);
  }
});

test('only the suppliers that were asked get a copy', async () => {
  const id = await store.addRecord('Inquiry_Form', base({ Suppliers: [tony] }));
  const { INQ_No } = await inquiry(id);
  assert.equal((await copiesOf('Supplier_2', INQ_No)).length, 1);
  assert.equal((await copiesOf('Supplier_1', INQ_No)).length, 0);
  assert.equal((await raw.find('Fenteng_Notifications')).length, 0);
});

test('prices: a quote with both negotiated and final price is Final, with one it is Negotiating', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  const rec = await inquiry(id);
  const [t, f] = rec.Supplier_Quotes;
  await store.updateRecord('Inquiry_Form', id, { Supplier_Quotes: [{ ...t, Negotiated: '100', Final_Price: '90' }, { ...f, Negotiated: '120' }] }, { byForm: true });
  const after = await inquiry(id);
  assert.deepEqual(after.Supplier_Quotes.map((q) => q.Stage), ['Final', 'Negotiating']);
});

test('a change in the quotes moves the supplier copy to "Submit Response" and copies the prices', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  const { INQ_No, Supplier_Quotes: [t, f] } = await inquiry(id);
  await store.updateRecord('Inquiry_Form', id, { Supplier_Quotes: [{ ...t, Initial_Price: '95' }, f] }, { byForm: true });
  const [tonyCopy] = await copiesOf('Supplier_2', INQ_No);
  const [fentengCopy] = await copiesOf('Supplier_1', INQ_No);
  assert.equal(tonyCopy.Response_Status, 'Submit Response');
  assert.equal(tonyCopy.Supplier_quotes[0].Initial_Price_Supplier, '95');
  assert.equal(fentengCopy.Response_Status, 'Waiting', 'the other supplier is untouched');
});

test('selecting a supplier: that copy is "Selected", the other "Not Selected"; the checklist follows', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  const { INQ_No, Supplier_Quotes: [t, f] } = await inquiry(id);
  await store.updateRecord('Inquiry_Form', id, { Supplier_Quotes: [{ ...t, Final_Price: '600', Availability: 'Confirmed', Selected: true }, f] }, { byForm: true });
  const rec = await inquiry(id);
  assert.equal(rec.Supplier_Selected, true);
  assert.equal(rec.Availability, true);
  assert.equal(rec.Final_Price_Exists, true);
  assert.equal(rec.Select_Final_Cost, '600');
  assert.equal((await copiesOf('Supplier_2', INQ_No))[0].Response_Status, 'Selected');
  assert.equal((await copiesOf('Supplier_1', INQ_No))[0].Response_Status, 'Not Selected');
});

test('margin = (SRP - final cost) / SRP * 100, and 0 without an SRP', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  const { Supplier_Quotes: [t, f] } = await inquiry(id);
  await store.updateRecord('Inquiry_Form', id, { Supplier_Quotes: [{ ...t, Final_Price: '600', Selected: true }, f], SRP_Approved1: 1000 }, { byForm: true });
  assert.equal((await inquiry(id)).Margin, '40');
  await store.updateRecord('Inquiry_Form', id, { SRP_Approved1: 0 }, { byForm: true });
  assert.equal((await inquiry(id)).Margin, '0');
});

test('mirrors Zoho: "ready for estimate" reads the collateral flag from before this save, so it lags one save', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  const { Supplier_Quotes: [t, f] } = await inquiry(id);
  const everything = { Supplier_Quotes: [{ ...t, Final_Price: '600', Availability: 'Confirmed', Selected: true }, f], SRP_Approved1: 1000, SRP_Status: 'Approved',
    Product_Sample: 'Completed', D_Image: 'N/A', Specification: 'Completed', Technical_Drawing: 'Completed' };
  await store.updateRecord('Inquiry_Form', id, everything, { byForm: true });
  let rec = await inquiry(id);
  assert.equal(rec.Collateral_Comple_NA, true);
  assert.equal(rec.SRP_Approved, true);
  assert.equal(rec.Ready_for_Estimates, false, 'first save: collateral was not complete yet');
  await store.updateRecord('Inquiry_Form', id, { description: 'touched' }, { byForm: true });
  rec = await inquiry(id);
  assert.equal(rec.Ready_for_Estimates, true, 'second save sees the collateral flag');
});

test('mirrors Zoho: the project roll-up reads the inquiries as saved before this one, so it also lags', async () => {
  const a = await store.addRecord('Inquiry_Form', base());
  assert.equal((await raw.getRecordById('Projects', project, { raw: true })).All_SRP_Approved, true, 'a new inquiry is not in the database yet, so nothing disagrees');
  await store.updateRecord('Inquiry_Form', a, { SRP_Status: 'Approved' }, { byForm: true });
  assert.equal((await raw.getRecordById('Projects', project, { raw: true })).All_SRP_Approved, false, 'still the old status of this inquiry');
  await store.updateRecord('Inquiry_Form', a, { description: 'touched' }, { byForm: true });
  assert.equal((await raw.getRecordById('Projects', project, { raw: true })).All_SRP_Approved, true);
});

test('deleting an inquiry removes the suppliers\' copies', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  const { INQ_No } = await inquiry(id);
  assert.equal((await copiesOf('Supplier_2', INQ_No)).length + (await copiesOf('Supplier_1', INQ_No)).length, 2);
  await store.deleteRecord('Inquiry_Form', id);
  assert.equal((await copiesOf('Supplier_2', INQ_No)).length + (await copiesOf('Supplier_1', INQ_No)).length, 0);
});

test('a second inquiry gets the next number and its own supplier copies', async () => {
  const first = await store.addRecord('Inquiry_Form', base());
  const second = await store.addRecord('Inquiry_Form', base());
  const [a, b] = [await inquiry(first), await inquiry(second)];
  assert.equal(Number(b.INQ_Seq), Number(a.INQ_Seq) + 1);
  assert.notEqual(a.INQ_No, b.INQ_No);
  assert.equal((await copiesOf('Supplier_2', b.INQ_No)).length, 1);
});
