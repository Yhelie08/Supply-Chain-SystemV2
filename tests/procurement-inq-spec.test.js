// Inquiry of the spec v1.4 (server/modules/procurement/inq-spec.mjs): stamps and events, numeric lead time, price clearing for a line that
// cannot be supplied, feasibility hints, the buyer's alerts. On PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { SUPPLIERS } from '../server/workflows/suppliers.mjs';
import { parseLeadDays } from '../server/modules/procurement/plan.mjs';
import { runInquiryDaily, clearUnavailable } from '../server/modules/procurement/inq-spec.mjs';
import { addDays, ymd, todayDate } from '../server/workflows/deluge.mjs';

const [TONY, FENTENG] = SUPPLIERS;
let db, raw, store, tony, fenteng, item;
const FORMS = ['Inquiry_Form', 'Supplier_1', 'Supplier_2', 'Tony_Notifications', 'Fenteng_Notifications', 'Suppliers', 'Projects', 'Items', 'Stage_Events', 'App_Notifications', 'Procurement_Settings'];
const day = (n) => ymd(addDays(todayDate(), n));
const inq = (id) => raw.getRecordById('Inquiry_Form', id, { raw: true });
const events = async (id) => (await raw.find('Stage_Events', (e) => e.Record_Type === 'inquiry' && String(e.Record_Id) === String(id))).sort((a, b) => Number(a.ID) - Number(b.ID));
const notes = (type) => raw.find('App_Notifications', (n) => n.Notification_Type === type);
const base = (extra = {}) => ({ sku: 'LAMP-1', quantity: 3, unit: 'pcs', target_date: day(60), description: 'A lamp', Items: item, Suppliers: [tony, fenteng], ...extra });
const quote = async (id, who, patch) => { // who: 'tony' | 'fenteng' (the row of that supplier)
  const rec = await inq(id);
  const rows = rec.Supplier_Quotes.map((q) => ((q.Supplier_ID === `[${who === 'tony' ? tony : fenteng}]`) ? { ...q, ...patch } : q));
  await store.updateRecord('Inquiry_Form', id, { Supplier_Quotes: rows });
};

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
  tony = await raw.addRecord('Suppliers', { Supplier_ID: TONY.booksId, Supplier_Name: { first_name: 'Tony Fan' } });
  fenteng = await raw.addRecord('Suppliers', { Supplier_ID: FENTENG.booksId, Supplier_Name: { first_name: 'Fenteng Lighting' } });
  item = await raw.addRecord('Items', { SKU: 'LAMP-1', item_name: 'Lamp' });
});

test('INQ-R3: a lead time typed as text is read as days (a range takes the larger number)', () => {
  const cases = [['20', 20], ['20 days', 20], ['3 weeks', 21], ['2-3 weeks', 21], ['1 month', 30], ['20天', 20], ['2周', 14], ['', 0], ['soon', 0], [null, 0], ['12.5 days', 13]];
  for (const [text, days] of cases) assert.equal(parseLeadDays(text), days, String(text));
});

test('inquiry.sent: the stamp and the event are made when the inquiry goes to its suppliers; the stamps cannot be typed', async () => {
  const id = await store.addRecord('Inquiry_Form', base({ Sent_At: '2000-01-01 01:00:00 AM', Selected_Lead_Days: 99 }));
  const rec = await inq(id);
  assert.ok(rec.Sent_At && !rec.Sent_At.startsWith('2000'));
  assert.ok(!rec.Selected_Lead_Days);
  const ev = await events(id);
  assert.deepEqual(ev.map((e) => e.Event), ['inquiry.sent']);
  assert.equal(ev[0].Note, '2 supplier(s)');
  await store.updateRecord('Inquiry_Form', id, { description: 'edited' });
  assert.equal((await events(id)).length, 1, 'a plain edit does not log it again');
});

test('first quote: stamped once; the buyer is told once when every supplier has quoted', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  await quote(id, 'tony', { Availability: 'Confirmed', Initial_Price: 100, Lead_Time: '20' });
  let rec = await inq(id);
  assert.ok(rec.First_Quote_At);
  const first = rec.First_Quote_At;
  assert.equal((await notes('Inquiry Quotes Complete')).length, 0, 'one supplier is still missing');
  await quote(id, 'fenteng', { Availability: 'Confirmed', Initial_Price: 90, Lead_Time: '3 weeks' });
  rec = await inq(id);
  assert.equal(rec.First_Quote_At, first, 'the first stamp stays');
  const n = await notes('Inquiry Quotes Complete');
  assert.equal(n.length, 1);
  assert.match(n[0].Message, /INQ-\d+: every supplier has quoted/);
  await quote(id, 'fenteng', { Initial_Price: 95 });
  assert.equal((await notes('Inquiry Quotes Complete')).length, 1, 'not again');
  assert.equal((await events(id)).filter((e) => e.Event === 'inquiry.first_quote_received').length, 1);
});

test('INQ-R3 / INQ-R6: the selected quote gives the lead days as a number and the supplier ID; every change of the choice is an event', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  await quote(id, 'tony', { Availability: 'Confirmed', Initial_Price: 100, Lead_Time: '20 days' });
  await quote(id, 'fenteng', { Availability: 'Confirmed', Initial_Price: 90, Lead_Time: '3 weeks' });
  await quote(id, 'fenteng', { Selected: true });
  let rec = await inq(id);
  assert.equal(rec.Selected_Supplier_Id, String(fenteng));
  assert.equal(Number(rec.Selected_Lead_Days), 21);
  const at = rec.Selected_At;
  assert.ok(at);
  await quote(id, 'fenteng', { Selected: false });
  await quote(id, 'tony', { Selected: true });
  rec = await inq(id);
  assert.equal(rec.Selected_Supplier_Id, String(tony));
  assert.equal(Number(rec.Selected_Lead_Days), 20);
  assert.equal(rec.Selected_At, at, 'the first stamp stays');
  const sel = (await events(id)).filter((e) => e.Event === 'inquiry.supplier_selected');
  assert.deepEqual(sel.map((e) => [e.Note, Number(e.Visit_No)]), [['Fenteng Lighting', 1], ['Tony Fan', 2]]);
});

test('INQ-R2: a line the supplier cannot supply has no price and no lead time', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  await quote(id, 'tony', { Availability: 'Cannot Produce', Initial_Price: 100, Negotiated: 90, Final_Price: 90, Lead_Time: '20' });
  const row = (await inq(id)).Supplier_Quotes.find((q) => q.Supplier_ID === `[${tony}]`);
  assert.deepEqual([row.Availability, row.Initial_Price, row.Negotiated, row.Final_Price, row.Lead_Time].map((v) => v ?? ''), ['Cannot Produce', '', '', '', '']);
  assert.equal(clearUnavailable([{ Availability: 'Confirmed', Initial_Price: 5 }]).changed, false);
});

test('INQ-R7: with a needed-by date each quote gets a hint ("Lead 20 days + sea -> earliest about ..."); without one there is none', async () => {
  const id = await store.addRecord('Inquiry_Form', base({ target_date: day(30) }));
  await quote(id, 'tony', { Availability: 'Confirmed', Initial_Price: 100, Lead_Time: '20' });
  let rec = await inq(id);
  assert.match(rec.Feasibility_Hints, /^Tony Fan: Lead 20 days \+ sea -> earliest about \d+ [A-Z][a-z]{2}/);
  assert.match(rec.Feasibility_Hints, /days after the \d+ [A-Z][a-z]{2} you need; by air about/, 'a sea quote that misses the date says what air would do');
  await quote(id, 'fenteng', { Availability: 'Unavailable' });
  rec = await inq(id);
  assert.equal(rec.Feasibility_Hints.split('\n').length, 1, 'a line that cannot be supplied has no hint');
  const far = await store.addRecord('Inquiry_Form', base({ target_date: day(300) }));
  await quote(far, 'tony', { Availability: 'Confirmed', Initial_Price: 100, Lead_Time: '20' });
  assert.match((await inq(far)).Feasibility_Hints, /in time for/);
  const none = await store.addRecord('Inquiry_Form', base({ target_date: '' }));
  await quote(none, 'tony', { Availability: 'Confirmed', Initial_Price: 100, Lead_Time: '20' });
  assert.equal((await inq(none)).Feasibility_Hints ?? '', '');
});

test('inquiry.estimate_pushed is stamped once when the Estimate is made', async () => {
  const id = await store.addRecord('Inquiry_Form', base());
  await store.updateRecord('Inquiry_Form', id, { Estimate_Created: true, Books_Estimate_No: 'EST-9' });
  const rec = await inq(id);
  assert.ok(rec.Estimate_Pushed_At);
  const ev = (await events(id)).filter((e) => e.Event === 'inquiry.estimate_pushed');
  assert.deepEqual(ev.map((e) => e.Note), ['EST-9']);
});

test('no quote after inquiry_quote_days (2): the buyer gets one alert naming the supplier that has not answered; none when all answered', async () => {
  const late = await store.addRecord('Inquiry_Form', base());
  const fresh = await store.addRecord('Inquiry_Form', base());
  const done = await store.addRecord('Inquiry_Form', base());
  await quote(late, 'tony', { Availability: 'Confirmed', Initial_Price: 100, Lead_Time: '20' });
  await quote(done, 'tony', { Availability: 'Confirmed', Initial_Price: 100, Lead_Time: '20' });
  await quote(done, 'fenteng', { Availability: 'Unavailable' });
  const old = `${day(-3)} 09:00:00 AM`;
  await raw.updateRecord('Inquiry_Form', late, { Sent_At: old }, { byForm: true });
  await raw.updateRecord('Inquiry_Form', done, { Sent_At: old }, { byForm: true });
  await raw.updateRecord('Inquiry_Form', fresh, { Sent_At: `${day(-1)} 09:00:00 AM` }, { byForm: true });
  const r = await runInquiryDaily(raw);
  assert.equal(r.alerted, 1);
  const n = await notes('Inquiry No Quote');
  assert.equal(n.length, 1);
  assert.match(n[0].Message, /no quote from Fenteng Lighting after 2 days/);
  assert.equal((await runInquiryDaily(raw)).alerted, 0, 'once per inquiry');
});
