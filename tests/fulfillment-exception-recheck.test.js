// Exception Control -> back to Pack & QC (server/modules/fulfillment/exception-recheck.mjs) and the QC that follows, with no duplicates.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const SOF = 'Sales_Order_Fulfillment', QC = 'Checker_Checklist', AGG = 'Order_Aggregation1', EXC = 'Exception_Control1';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SOF, QC, AGG, EXC, 'Crate_Checklist', 'ExceptionControl_Notifications']) await db.query(`DELETE FROM "${f}"`); });

const addPackage = () => raw.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage: 'Pack & QC', Package: 'PAC-1', Item_Details1: [{ Item: 'Lamp', SKU: 'L-1', Quantity: '3' }] });
const addQc = (extra = {}) => store.addRecord(QC, {
  SO: 'SO-1', PAC: 'PAC-1', SKU: 'L-1', Item_Name: 'Lamp', Quantity: '3', Bin_Location: 'A-01', Customer_Name: 'Sample Customer', Customer_Address: '1 Main St',
  Order_Type: 'Normal', Delivery_Type: 'Delivery Only', ...extra,
});
const decide = (id, QC_Status, Quantity, extra = {}) => store.updateRecord(QC, id, { QC_Status, Quantity: String(Quantity), ...extra });
const excs = () => raw.find(EXC);
const qcs = () => raw.find(QC);

// 3 units: 2 pass, 1 fails (the way the Pack & QC page writes it: Rejected first, then Approved on the same record)
async function splitTwoOne() {
  await addPackage();
  const id = await addQc();
  await decide(id, 'Rejected', 1, { Quantity_of_Damage_Items: '1' });
  await decide(id, 'Approved', 2);
  return id;
}

test('a repaired unit goes back to QC with ONLY the repaired quantity, once, even if it is saved or completed again', async () => {
  await splitTwoOne();
  const [e1] = await excs();
  assert.equal(e1.Status === 'Completed', false);
  await store.updateRecord(EXC, e1.ID, { Status: 'Completed' });
  let all = await qcs();
  const recheck = all.filter((c) => Array.isArray(c.Recheck_Exceptions));
  assert.equal(all.length, 2, 'the original QC record plus ONE re-check');
  assert.equal(recheck.length, 1);
  assert.equal(String(recheck[0].Quantity), '1');
  assert.equal(recheck[0].QC_Status || '', '');
  assert.equal(recheck[0].SO, 'SO-1');
  assert.equal(recheck[0].Item_Name, 'Lamp');
  assert.equal(recheck[0].Bin_Location, 'A-01');
  assert.equal((await excs())[0].Sent_To_QC === true || (await excs())[0].Sent_To_QC === 'true', true);

  await store.updateRecord(EXC, e1.ID, { Remarks: 'saved again' });
  await store.updateRecord(EXC, e1.ID, { Status: 'Completed' });
  assert.equal((await qcs()).length, 2, 'nothing new');
});

test('two repaired units share ONE pending QC record with Quantity 2', async () => {
  await addPackage();
  const id = await addQc();
  await decide(id, 'Rejected', 2, { Quantity_of_Damage_Items: '2' });
  await decide(id, 'Approved', 1);
  const list = await excs();
  assert.equal(list.length, 2);
  await store.updateRecord(EXC, list[0].ID, { Status: 'Completed' });
  await store.updateRecord(EXC, list[1].ID, { Status: 'Completed' });
  const recheck = (await qcs()).filter((c) => Array.isArray(c.Recheck_Exceptions));
  assert.equal(recheck.length, 1);
  assert.equal(String(recheck[0].Quantity), '2');
  assert.equal(recheck[0].Recheck_Exceptions.length, 2);
});

test('the re-check approved: the repaired unit joins the others in To Ship (2 + 1 = 3), no second To Ship record', async () => {
  await splitTwoOne();
  const [e1] = await excs();
  await store.updateRecord(EXC, e1.ID, { Status: 'Completed' });
  const recheck = (await qcs()).find((c) => Array.isArray(c.Recheck_Exceptions));
  await decide(recheck.ID, 'Approved', 1);
  const agg = await raw.find(AGG);
  assert.equal(agg.length, 1);
  assert.deepEqual(agg[0].Item_Details.map((r) => [r.SKU, String(r.QTY)]), [['L-1', '3']]);
  assert.equal((await excs()).length, 1, 'still the one exception');
});

test('the re-check rejected again: the SAME exception reopens (same EXC number), no new one; saving again adds nothing', async () => {
  await splitTwoOne();
  const [e1] = await excs();
  await store.updateRecord(EXC, e1.ID, { Status: 'Completed' });
  const recheck = (await qcs()).find((c) => Array.isArray(c.Recheck_Exceptions));
  await decide(recheck.ID, 'Rejected', 1, { Quantity_of_Damage_Items: '1' });
  let list = await excs();
  assert.equal(list.length, 1);
  assert.equal(list[0].Exception_Number, e1.Exception_Number);
  assert.equal(list[0].Status, 'Pending');
  assert.equal(list[0].Sent_To_QC === true || list[0].Sent_To_QC === 'true', false);
  await decide(recheck.ID, 'Rejected', 1, { Quantity_of_Damage_Items: '1' });
  assert.equal((await excs()).length, 1);
  // and it can be repaired and re-checked again: a NEW re-check record (the old one was decided), still no duplicate exception
  await store.updateRecord(EXC, list[0].ID, { Status: 'Completed' });
  assert.equal((await qcs()).filter((c) => Array.isArray(c.Recheck_Exceptions)).length, 2);
  assert.equal((await excs()).length, 1);
});

test('a rejected unit of ANOTHER QC record of the same item gets its own exception (not swallowed by the repaired one)', async () => {
  await splitTwoOne();
  const [e1] = await excs();
  await store.updateRecord(EXC, e1.ID, { Status: 'Completed' });
  const second = await addQc({ Quantity: '1' });
  await decide(second, 'Rejected', 1, { Quantity_of_Damage_Items: '1' });
  const list = await excs();
  assert.equal(list.length, 2);
  assert.notEqual(list[0].Exception_Number, list[1].Exception_Number);
});

test('a pending re-check is not overwritten by a later Pick of the same item', async () => {
  await splitTwoOne();
  const [e1] = await excs();
  await store.updateRecord(EXC, e1.ID, { Status: 'Completed' });
  const before = (await qcs()).find((c) => Array.isArray(c.Recheck_Exceptions));
  await raw.addRecord('Pick1', { SO: 'SO-1', SKU: 'L-1', Item_Name: 'Lamp', Package_Order: 'PAC-1', Quantity_to_Pick: '5', Marked: false });
  const [pick] = await raw.find('Pick1');
  await store.updateRecord('Pick1', pick.ID, { Marked: true });
  const after = await qcs();
  assert.equal(String(after.find((c) => c.ID === before.ID).Quantity), '1');
  assert.equal(after.length, 3, 'the pick got its own QC record');
});

test('older exceptions with no QC_ID (made before the tag existed) are reopened too when their re-check is rejected, and can go back again', async () => {
  await addPackage();
  const e1 = await raw.addRecord(EXC, { Exception_Number: 'EXC-FF-00001', Sales_Order: 'SO-1', SKU: 'L-1', PAC: 'PAC-1', Qty: 1, Status: 'Completed', Sent_To_QC: true, Item_Name: 'Lamp' });
  const e2 = await raw.addRecord(EXC, { Exception_Number: 'EXC-FF-00002', Sales_Order: 'SO-1', SKU: 'L-1', PAC: 'PAC-1', Qty: 1, Status: 'Completed', Sent_To_QC: true, Item_Name: 'Lamp' });
  const re = await raw.addRecord(QC, { SO: 'SO-1', PAC: 'PAC-1', SKU: 'L-1', Item_Name: 'Lamp', Quantity: '2', Recheck_Exceptions: [e1, e2] });
  await store.updateRecord(QC, re, { QC_Status: 'Rejected', Quantity: '2' });
  let list = await excs();
  assert.equal(list.length, 2, 'no new exception');
  assert.deepEqual(list.map((e) => e.Status), ['Pending', 'Pending']);
  assert.ok(list.every((e) => e.Sent_To_QC === false || e.Sent_To_QC === 'false'));
  await store.updateRecord(QC, re, { Remarks: 'saved again' });
  assert.equal((await excs()).length, 2);
  // repair one of them: it goes back to QC again with Quantity 1
  await store.updateRecord(EXC, e2, { Status: 'Completed' });
  const rechecks = (await qcs()).filter((c) => Array.isArray(c.Recheck_Exceptions) && !c.QC_Status);
  assert.equal(rechecks.length, 1);
  assert.equal(String(rechecks[0].Quantity), '1');
});
