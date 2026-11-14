// Tony Fan / Fenteng portal workflows (server/modules/procurement/supplier-portal-workflows.mjs), run on PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const FORMS = ['Shipments', 'Tony_Shipment', 'Fenteng_Shipment', 'Shipment_ID_Counter', 'Tony_Fan_Purchase_Request', 'Fenteng_Lighting_Purchase_Request', 'Purchase_Request1', 'Suppliers', 'Items'];
let db, raw, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

// ---------- the supplier's shipment ----------
async function shipments() {
  const parent = await raw.addRecord('Shipments', { Shipment_No: 'SHP-00001', Sales_Order: 'SO-1', Supplier: 'Tony', PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp' }, { PR_No: 'PR-2', SKU: 'S-1', Item_Name: 'Shade' }] });
  const sup = await raw.addRecord('Tony_Shipment', { Shipment_No: 'SHP-00001', Parent_Shipment_ID: String(parent), Supplier2_Shipment_Details: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', RR_No: '' }, { PR_No: 'PR-2', SKU: 'S-1', Item_Name: 'Shade', RR_No: '' }] });
  return { parent, sup };
}

test('ticked lines get a shipment id, go to the parent shipment In Transit, dates and mode are set, and nothing is added twice', async () => {
  const { parent, sup } = await shipments();
  await store.updateRecord('Tony_Shipment', sup, { Supplier2_Shipment_Details: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', RR_No: '', Select_To_Ship: true, Shipment_Mode: 'Airfreight', Date_Shipped: '2026-12-01' }, { PR_No: 'PR-2', SKU: 'S-1', Item_Name: 'Shade', RR_No: '', Select_To_Ship: false }] });
  let p = await raw.getRecordById('Shipments', parent, { raw: true });
  assert.deepEqual(p.Supplier_Shipment_Details.map((r) => [r.Shipment_ID, r.PR_No, r.Status, r.Shipment_Mode]), [['SHP-AIR-00001', 'PR-1', 'In Transit', 'Airfreight']]);
  assert.equal(p.Ship_Out_Date, '2026-12-01');
  assert.equal(p.Estimated_Warehouse_Arrival, '2026-12-13', 'airfreight: +12 days');
  assert.equal(p.PO_Shipments.find((l) => l.SKU === 'L-1').Shipment_Mode_When_Received, 'Airfreight');
  const s = await raw.getRecordById('Tony_Shipment', sup, { raw: true });
  assert.equal(s.Supplier2_Shipment_Details.find((r) => r.SKU === 'L-1').Synced === true || s.Supplier2_Shipment_Details.find((r) => r.SKU === 'L-1').Synced === 'true', true);
  // saving again changes nothing
  await store.updateRecord('Tony_Shipment', sup, { Added_User1: 'someone' });
  p = await raw.getRecordById('Shipments', parent, { raw: true });
  assert.equal(p.Supplier_Shipment_Details.length, 1);
  // the other line, by sea: the next number of ITS mode
  const rows = s.Supplier2_Shipment_Details.map((r) => (r.SKU === 'S-1' ? { ...r, Select_To_Ship: true, Shipment_Mode: 'LCL', Date_Shipped: '2026-12-02' } : r));
  await store.updateRecord('Tony_Shipment', sup, { Supplier2_Shipment_Details: rows });
  p = await raw.getRecordById('Shipments', parent, { raw: true });
  assert.deepEqual(p.Supplier_Shipment_Details.map((r) => r.Shipment_ID), ['SHP-AIR-00001', 'SHP-LCL-00001']);
  assert.equal(p.Estimated_Warehouse_Arrival, '2027-02-07', 'LCL: +67 days');
  const [counter] = await raw.find('Shipment_ID_Counter');
  assert.deepEqual([counter.Air_Counter, counter.LCL_Counter, counter.FCL_Counter].map(Number), [2, 2, 1]);
});

// ---------- the supplier's Purchase Request ----------
const answer = (extra = {}) => ({ Availability_Supplier2: 'Available', Initial_Price_Supplier2: 90, Negotiated_Supplier2: 85, Final_Price_Supplier2: 80, Lead_Time_Supplier2: 14, ...extra });

test('Tony PR: the response needs its fields, then it is copied onto Tony\'s row of the buyer\'s PR', async () => {
  const tony = await raw.addRecord('Suppliers', { Supplier_Name: { first_name: 'Tony Fan', last_name: '' } });
  const other = await raw.addRecord('Suppliers', { Supplier_Name: { first_name: 'Fenteng Lighting', last_name: '' } });
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-1', Supplier_Selected: [{ Suppliers: other, Final_Price: 1 }, { Suppliers: tony, Final_Price: 0 }] });
  const id = await raw.addRecord('Tony_Fan_Purchase_Request', { PR_No_Supplier2: 'PR-1', Supplier_Selected_Supplier2: [answer()] });

  await assert.rejects(() => store.updateRecord('Tony_Fan_Purchase_Request', id, { Supplier_Selected_Supplier2: [answer({ Availability_Supplier2: '' })] }), /Required fields missing: Availability/);
  await assert.rejects(() => store.updateRecord('Tony_Fan_Purchase_Request', id, { Supplier_Selected_Supplier2: [answer({ Final_Price_Supplier2: 0, Lead_Time_Supplier2: 0 })] }), /Final Price, Lead Time/);
  await assert.rejects(() => store.updateRecord('Tony_Fan_Purchase_Request', id, { edit_counter: 0, Supplier_Selected_Supplier2: [answer()] }), /Editing is locked/);
  // cannot produce needs no prices or lead time
  await store.updateRecord('Tony_Fan_Purchase_Request', id, { Supplier_Selected_Supplier2: [answer({ Availability_Supplier2: 'Cannot Produce', Initial_Price_Supplier2: 0, Final_Price_Supplier2: 0, Lead_Time_Supplier2: 0 })] });

  await store.updateRecord('Tony_Fan_Purchase_Request', id, { Supplier_Selected_Supplier2: [answer()] });
  const [pr] = await raw.find('Purchase_Request1');
  const tonyRow = pr.Supplier_Selected.find((r) => String(r.Suppliers?.ID ?? r.Suppliers) === String(tony));
  assert.deepEqual([tonyRow.Availability, Number(tonyRow.Initial_Price), Number(tonyRow.Final_Price), Number(tonyRow.Lead_Time)], ['Available', 90, 80, 14]);
  const otherRow = pr.Supplier_Selected.find((r) => String(r.Suppliers?.ID ?? r.Suppliers) === String(other));
  assert.equal(Number(otherRow.Final_Price), 1, 'the other supplier\'s row is untouched');
});

test('portal PR: the product image of the item is copied', async () => {
  const item = await raw.addRecord('Items', { item_name: 'Lamp', SKU: 'L-1', Image: '/uploads/lamp.png' });
  const id = await store.addRecord('Fenteng_Lighting_Purchase_Request', { PR_No_Supplier1: 'PR-1', Items_Supplier1: item });
  assert.equal((await raw.getRecordById('Fenteng_Lighting_Purchase_Request', id, { raw: true })).Product_Image_Supplier1_PR, '/uploads/lamp.png');
});
