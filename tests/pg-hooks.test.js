// Workflow hooks: before/after add, update and delete around the Postgres store (PGlite).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ZohoError } from '../server/criteria.mjs';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore, register } from '../server/workflows/index.mjs';

let db, raw, queries;
const count = async (form) => Number((await db.query(`SELECT count(*)::int AS n FROM "${form}"`)).rows[0].n);
const fresh = (hooks, form = 'Projects') => {
  const registry = {};
  register(form, hooks, registry);
  return createHookedStore(raw, registry);
};

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  queries = [];
  raw = createStore({ query: (sql, params) => { queries.push(sql); return db.query(sql, params); }, transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { await db.query('DELETE FROM "Projects"'); await db.query('DELETE FROM "Customer"'); });

test('beforeAdd can change what is saved', async () => {
  const store = fresh({ beforeAdd: ({ input }) => { input.Status ||= 'Open'; input.Project_Name = input.Project_Name.trim(); } });
  const id = await store.addRecord('Projects', { Project_Name: '  Mall  ' });
  const rec = await raw.getRecordById('Projects', id);
  assert.equal(rec.Status, 'Open');
  assert.equal(rec.Project_Name, 'Mall');
});

test('beforeAdd can refuse the write: nothing is saved and the error reaches the caller', async () => {
  const store = fresh({ beforeAdd: ({ input }) => { if (!input.Project_Name) throw new ZohoError(1001, 'Project name is required.'); } });
  await assert.rejects(() => store.addRecord('Projects', { Status: 'Open' }), (e) => e.code === 1001 && /required/.test(e.message));
  assert.equal(await count('Projects'), 0);
});

test('afterAdd gets the saved record (raw IDs) and its writes do not fire hooks again', async () => {
  const seen = [];
  const store = fresh({
    afterAdd: async ({ id, record, store: s }) => { seen.push(record); await s.updateRecord('Projects', id, { Project_Code: `P-${id.slice(-3)}` }, { byForm: true }); },
    afterUpdate: () => seen.push('afterUpdate fired'),
  });
  const customer = await raw.addRecord('Customer', { customer_name: 'Alpha' });
  const id = await store.addRecord('Projects', { Project_Name: 'Mall', Customer: { ID: customer, display_value: 'Alpha' } }, 'a@b.c');
  assert.equal(seen.length, 1, 'the hook ran once and its own update did not trigger afterUpdate');
  assert.equal(seen[0].ID, id);
  assert.equal(seen[0].Customer, customer, 'a lookup is a plain ID, like Deluge input.Field');
  assert.equal((await raw.getRecordById('Projects', id)).Project_Code, `P-${id.slice(-3)}`);
});

test('an error in afterAdd is logged and does not undo the record', async () => {
  const store = fresh({ afterAdd: () => { throw new Error('boom'); } });
  const original = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  try {
    const id = await store.addRecord('Projects', { Project_Name: 'Kept' });
    assert.equal((await raw.getRecordById('Projects', id)).Project_Name, 'Kept');
  } finally { console.error = original; }
  assert.ok(logged.some((l) => l.includes('Projects.afterAdd')));
});

test('update hooks see the previous record, and afterUpdate the whole saved record', async () => {
  const log = [];
  const store = fresh({
    beforeUpdate: ({ id, input, previous }) => log.push(['before', id, input.Status, previous.Status]),
    afterUpdate: ({ record, previous }) => log.push(['after', record.Status, record.Project_Name, previous.Status]),
  });
  const id = await raw.addRecord('Projects', { Project_Name: 'Mall', Status: 'Open' });
  await store.updateRecord('Projects', id, { Status: 'Closed' }, { user: 'a@b.c' });
  assert.deepEqual(log, [['before', id, 'Closed', 'Open'], ['after', 'Closed', 'Mall', 'Open']]);
});

test('beforeUpdate can refuse the update', async () => {
  const store = fresh({ beforeUpdate: ({ input, previous }) => { if (previous.Status === 'Closed' && input.Status) throw new ZohoError(1002, 'Closed projects cannot change status.'); } });
  const id = await raw.addRecord('Projects', { Project_Name: 'Mall', Status: 'Closed' });
  await assert.rejects(() => store.updateRecord('Projects', id, { Status: 'Open' }), (e) => e.code === 1002);
  assert.equal((await raw.getRecordById('Projects', id)).Status, 'Closed');
});

test('delete hooks get the record that is gone; a missing record is a 9280 and runs nothing', async () => {
  const log = [];
  const store = fresh({ beforeDelete: ({ previous }) => log.push(['before', previous.Project_Name]), afterDelete: ({ id, previous }) => log.push(['after', id, previous.Project_Name]) });
  const id = await raw.addRecord('Projects', { Project_Name: 'Mall' });
  await store.deleteRecord('Projects', id);
  assert.deepEqual(log, [['before', 'Mall'], ['after', id, 'Mall']]);
  log.length = 0;
  await assert.rejects(() => store.deleteRecord('Projects', id), (e) => e.code === 9280);
  assert.deepEqual(log, []);
});

test('a form with no hooks costs no extra queries, and reads pass straight through', async () => {
  const store = fresh({ afterAdd: () => {} }, 'Customer');
  queries.length = 0;
  const id = await store.addRecord('Projects', { Project_Name: 'Plain' });
  const withHooks = queries.length;
  queries.length = 0;
  await raw.addRecord('Projects', { Project_Name: 'Plain too' });
  assert.equal(withHooks, queries.length);
  assert.equal((await store.getRecordById('Projects', id)).Project_Name, 'Plain');
  assert.equal((await store.getRecords('Projects', {})).length, 2);
});

test('registering for an unknown form or phase is refused', () => {
  assert.throws(() => register('No_Such_Form', { afterAdd: () => {} }, {}), (e) => e.code === 9220);
  assert.throws(() => register('Projects', { onSuccess: () => {} }, {}), /Unknown workflow phase/);
});
