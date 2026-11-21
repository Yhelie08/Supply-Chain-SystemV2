// Daily supplier digest (spec 05 Shared Engines / 03 Notifications, in-app half): "One digest per supplier per
// day listing every overdue line and what is asked... Never one email per event." / "A supplier with 5 overdue
// lines gets one digest email, not five."
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { SUPPLIERS } from '../server/workflows/suppliers.mjs';
import { runSupplierDigestDaily } from '../server/modules/procurement/supplier-digest.mjs';
import { ymd, todayDate } from '../server/workflows/deluge.mjs';

const [TONY, FENTENG] = SUPPLIERS;
const FORMS = ['Supplier_1', 'Supplier_2', 'Tony_Fan_Purchase_Order', 'Tony_Fan_Purchase_Request', 'Tony_Fan_Replacement_Request', 'Tony_Shipment',
  'Fenteng_Lighting_Purchase_Order', 'Fenteng_Lighting_Purchase_Request', 'Fenteng_Lighting_Replacement_Request', 'Fenteng_Shipment', 'Tony_Notifications', 'Fenteng_Notifications'];
let db, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
});

const digestsOf = (s) => store.find(s.notifications, (r) => r.Notification_Type === 'Daily Digest');

test('nothing overdue: no digest for anyone', async () => {
  const { sent } = await runSupplierDigestDaily(store);
  assert.equal(sent, 0);
  assert.equal((await digestsOf(TONY)).length, 0);
  assert.equal((await digestsOf(FENTENG)).length, 0);
});

test('a supplier with 5 overdue lines gets one digest row, not five', async () => {
  await store.addRecord('Tony_Fan_Purchase_Request', { PR_No_Supplier2: 'PR-1', Response_Status: 'Waiting' });
  await store.addRecord('Tony_Fan_Purchase_Request', { PR_No_Supplier2: 'PR-2', Response_Status: 'Waiting' });
  await store.addRecord('Tony_Fan_Replacement_Request', { RR_No: 'RR-1', RR_Status: 'Open' });
  await store.addRecord('Tony_Fan_Purchase_Order', { PO_No_Supplier2: 'PO-1', PO_Status_Supplier2: 'Sent', Sent_On_Supplier2: '2026-11-01' });
  await store.addRecord('Supplier_2', { INQ_No_Supplier: 'INQ-1', Response_Status: 'Waiting' });

  const { sent } = await runSupplierDigestDaily(store);
  assert.equal(sent, 1);
  const rows = await digestsOf(TONY);
  assert.equal(rows.length, 1);
  assert.match(rows[0].Message, /5 item\(s\) waiting/);
  assert.match(rows[0].Message, /2 purchase request\(s\) need a quote/);
  assert.match(rows[0].Message, /1 replacement request\(s\) await your approval/);
  assert.match(rows[0].Message, /1 purchase order\(s\) need acknowledgement/);
  assert.match(rows[0].Message, /1 inquiry\/inquiries need a quote/);
  assert.equal((await digestsOf(FENTENG)).length, 0, 'the other supplier has nothing waiting');
});

test('a PO that is only a Draft (never sent) is not counted as overdue', async () => {
  await store.addRecord('Tony_Fan_Purchase_Order', { PO_No_Supplier2: 'PO-1', PO_Status_Supplier2: 'Draft' });
  const { sent } = await runSupplierDigestDaily(store);
  assert.equal(sent, 0);
});

test('running the job again the same day does not duplicate the digest', async () => {
  await store.addRecord('Fenteng_Lighting_Replacement_Request', { RR_No: 'RR-9', RR_Status: 'Open' });
  await runSupplierDigestDaily(store);
  await runSupplierDigestDaily(store);
  const rows = await digestsOf(FENTENG);
  assert.equal(rows.length, 1);
});

test('the digest row carries the supplier\'s portal email so a future mailer can use it without a schema change', async () => {
  process.env.TONY_PORTAL_EMAIL = 'tony@example.com';
  try {
    await store.addRecord('Tony_Fan_Replacement_Request', { RR_No: 'RR-1', RR_Status: 'Open' });
    await runSupplierDigestDaily(store);
    const rows = await digestsOf(TONY);
    assert.equal(rows[0].Recipient_Email, 'tony@example.com');
  } finally { delete process.env.TONY_PORTAL_EMAIL; }
});

test('a closed RR / confirmed PO / answered PR / answered inquiry are not overdue', async () => {
  await store.addRecord('Tony_Fan_Replacement_Request', { RR_No: 'RR-1', RR_Status: 'Closed' });
  await store.addRecord('Tony_Fan_Purchase_Order', { PO_No_Supplier2: 'PO-1', PO_Status_Supplier2: 'Confirmed', Sent_On_Supplier2: '2026-11-01' });
  await store.addRecord('Tony_Fan_Purchase_Request', { PR_No_Supplier2: 'PR-1', Response_Status: 'Confirmed' });
  await store.addRecord('Supplier_2', { INQ_No_Supplier: 'INQ-1', Response_Status: 'Confirmed' });
  const { sent } = await runSupplierDigestDaily(store);
  assert.equal(sent, 0);
});
