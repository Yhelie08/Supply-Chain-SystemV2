// Applying a decision on Delivery's own Approval_Queue items: server/modules/delivery-management/approval-decisions.mjs.
// Also covers the decisions.mjs fix (Record_Type guard) that made this possible — before it, deciding a Delivery
// item wrongly stamped "The shipment no longer exists." (procurement/decisions.mjs assumed every non-'pr' item
// was a shipment).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';

const AQ = 'Approval_Queue';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { await db.query(`DELETE FROM "${AQ}"`); });

const prepared = (extra = {}) => raw.addRecord(AQ, {
  Kind: 'schedule_shortfall', Record_Type: 'service_appointment', Record_Id: '123', Record_No: 'SO-1',
  Summary: 'No slot', Options: JSON.stringify(['Add a team-day (overtime, extra installer)', 'Tell the customer (proposed new date)']),
  Status: 'pending', ...extra,
});

test('schedule_shortfall: deciding either option stamps a record-only Result, not a shipment lookup', async () => {
  const id = await prepared();
  await store.updateRecord(AQ, id, { Decision: 'Add a team-day (overtime, extra installer)' }, { byForm: true });
  const row = await raw.getRecordById(AQ, id, { raw: true });
  assert.equal(row.Status, 'decided');
  assert.match(row.Result, /Add the extra capacity yourself/);
  assert.doesNotMatch(row.Result, /shipment/i);
});

test('third_party_booking: "Book third party" and "Keep own team" each get their own Result', async () => {
  const book = await prepared({ Kind: 'third_party_booking', Options: JSON.stringify(['Book third party', 'Keep own team on 2027-01-05']) });
  await store.updateRecord(AQ, book, { Decision: 'Book third party' }, { byForm: true });
  assert.match((await raw.getRecordById(AQ, book, { raw: true })).Result, /Record a third-party booking/);

  const keep = await prepared({ Kind: 'third_party_booking', Record_Id: '456', Options: JSON.stringify(['Book third party', 'Keep own team on 2027-01-05']) });
  await store.updateRecord(AQ, keep, { Decision: 'Keep own team on 2027-01-05' }, { byForm: true });
  assert.match((await raw.getRecordById(AQ, keep, { raw: true })).Result, /Kept with the own team/);
});

test('an unrecognised Kind under service_appointment (e.g. force_close) is left alone, not guessed at', async () => {
  const id = await prepared({ Kind: 'force_close', Options: JSON.stringify(['Confirm', 'Reopen']) });
  await store.updateRecord(AQ, id, { Decision: 'Confirm' }, { byForm: true });
  const row = await raw.getRecordById(AQ, id, { raw: true });
  assert.equal(row.Status, 'decided');
  assert.equal(row.Result, '', 'no Result stamped — not the wrong "shipment no longer exists" either');
});

test('a Procurement (shipment) item is untouched by the Delivery hook', async () => {
  const sId = await raw.addRecord('Shipments', { Shipment_No: 'SHP-1', Shipment_Mode: 'Sea' });
  const id = await raw.addRecord(AQ, { Kind: 'air_upgrade', Record_Type: 'shipment', Record_Id: String(sId), Record_No: 'SHP-1', Summary: 'x', Options: JSON.stringify(['upgrade_air', 'move_target', 'tell_customer']), Status: 'pending' });
  await store.updateRecord(AQ, id, { Decision: 'upgrade_air' }, { byForm: true });
  const row = await raw.getRecordById(AQ, id, { raw: true });
  assert.match(row.Result, /air/);
});
