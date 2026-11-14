// Tests for the inbound CMS integration router (server/integrations/cms.mjs).
// Verifies API key authentication, route dispatching, and integration with the data store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { handleCmsIntegration } from '../../server/integrations/cms.mjs';

const TEST_KEY = 'secret-test-cms-key-12345';
let db, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});

beforeEach(async () => {
  process.env.CMS_API_KEY = TEST_KEY;
  for (const table of ['DMS_Schedule_Request', 'DMS_Schedule_Request_Messages']) {
    await db.query(`DELETE FROM "${table}"`);
  }
});

// Mock helpers for HTTP req, res, readJson, and send
function makeCall({ method = 'POST', path = '/api/integrations/cms/schedule-request', headers = {}, body = null }) {
  const req = {
    method,
    headers: { ...headers },
  };
  let sent = null;
  const res = {
    writeHead: (status, h) => { sent = { status, headers: h }; },
    end: (content) => { if (sent) sent.body = content; },
  };
  const readJson = async () => body;
  const send = (responseObj, statusCode, payload) => {
    return { statusCode, payload };
  };
  return { req, res, readJson, send, path };
}

test('auth: rejected with 503 if CMS_API_KEY is not configured on server', async () => {
  delete process.env.CMS_API_KEY;
  const { req, res, readJson, send, path } = makeCall({ headers: { 'x-api-key': TEST_KEY } });
  const out = await handleCmsIntegration(req, res, path, store, readJson, send);
  assert.equal(out.statusCode, 503);
  assert.match(out.payload.message, /not configured/);
});

test('auth: rejected with 401 if API key header is missing or incorrect', async () => {
  // Missing key
  const { req: req1, res: res1, readJson: rj1, send: s1, path: p1 } = makeCall({ headers: {} });
  const out1 = await handleCmsIntegration(req1, res1, p1, store, rj1, s1);
  assert.equal(out1.statusCode, 401);
  assert.match(out1.payload.message, /Unauthorized/);

  // Wrong key
  const { req: req2, res: res2, readJson: rj2, send: s2, path: p2 } = makeCall({ headers: { 'x-api-key': 'wrong-key' } });
  const out2 = await handleCmsIntegration(req2, res2, p2, store, rj2, s2);
  assert.equal(out2.statusCode, 401);
  assert.match(out2.payload.message, /Unauthorized/);
});

test('auth: accepts valid key in x-api-key or Authorization Bearer header', async () => {
  // x-api-key
  const { req: req1, res: res1, readJson: rj1, send: s1 } = makeCall({
    method: 'GET',
    path: '/api/integrations/cms/health',
    headers: { 'x-api-key': TEST_KEY },
  });
  const out1 = await handleCmsIntegration(req1, res1, '/api/integrations/cms/health', store, rj1, s1);
  assert.equal(out1.statusCode, 200);
  assert.deepEqual(out1.payload, { status: 'ok', service: 'cms-integration' });

  // Authorization: Bearer
  const { req: req2, res: res2, readJson: rj2, send: s2 } = makeCall({
    method: 'GET',
    path: '/api/integrations/cms/health',
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  const out2 = await handleCmsIntegration(req2, res2, '/api/integrations/cms/health', store, rj2, s2);
  assert.equal(out2.statusCode, 200);
});

test('schedule-request: successfully inserts and updates DMS_Schedule_Request in database', async () => {
  const payload = {
    cmsRecordId: 'CMS-REC-100',
    salesOrderNumber: 'SO-100',
    customerName: 'Maria Cruz',
    requestedDate: '2026-12-05',
    requestedTime: '10:00:00 AM',
    requestedBy: 'Support Agent Jane',
    notes: 'Gate code 4321',
    typeOfDelivery: 'Delivery Only',
    booksSalesOrderId: 'BOOKS-SO-100',
  };

  // 1. First insert
  const { req, res, readJson, send, path } = makeCall({
    headers: { 'x-api-key': TEST_KEY },
    body: payload,
  });
  const out = await handleCmsIntegration(req, res, path, store, readJson, send);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(out.payload, { status: 'success', message: 'Synced.' });

  const rows = await store.find('DMS_Schedule_Request');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].CMS_Schedule_Request_ID, 'CMS-REC-100');
  assert.equal(rows[0].Customer_Name, 'Maria Cruz');
  assert.equal(rows[0].Status, 'Pending Review');
  assert.equal(rows[0].Added_User, 'cms_integration');

  // 2. Subsequent update with updated notes and time
  const updatePayload = {
    ...payload,
    requestedTime: '02:00:00 PM',
    notes: 'Updated: call 30 mins before arrival',
  };
  const { req: req2, res: res2, readJson: rj2, send: s2, path: p2 } = makeCall({
    headers: { 'x-api-key': TEST_KEY },
    body: updatePayload,
  });
  const out2 = await handleCmsIntegration(req2, res2, p2, store, rj2, s2);
  assert.equal(out2.statusCode, 200);

  const updatedRows = await store.find('DMS_Schedule_Request');
  assert.equal(updatedRows.length, 1);
  assert.equal(updatedRows[0].Requested_Time, '02:00:00 PM');
  assert.equal(updatedRows[0].Notes, 'Updated: call 30 mins before arrival');
});

test('schedule-request: returns 400 when cmsRecordId is missing', async () => {
  const { req, res, readJson, send, path } = makeCall({
    headers: { 'x-api-key': TEST_KEY },
    body: { salesOrderNumber: 'SO-100' }, // missing cmsRecordId
  });
  const out = await handleCmsIntegration(req, res, path, store, readJson, send);
  assert.equal(out.statusCode, 400);
  assert.equal(out.payload.status, 'error');
  assert.match(out.payload.message, /cmsRecordId is required/);
});

test('message: adds chat note to matching schedule request', async () => {
  // Pre-seed a schedule request
  await handleCmsIntegration(
    makeCall({
      headers: { 'x-api-key': TEST_KEY },
      body: { cmsRecordId: 'CMS-CHAT-1', customerName: 'John Doe' },
    }).req,
    {},
    '/api/integrations/cms/schedule-request',
    store,
    async () => ({ cmsRecordId: 'CMS-CHAT-1', customerName: 'John Doe' }),
    (res, status, payload) => ({ status, payload }),
  );

  // Send message
  const messagePayload = {
    cmsRecordId: 'CMS-CHAT-1',
    senderEmail: 'agent@homecartel.com',
    senderName: 'Agent Alice',
    message: 'Customer requested afternoon delivery slot',
    sentOn: '2026-11-13 14:00:00',
  };

  const { req, res, readJson, send } = makeCall({
    path: '/api/integrations/cms/message',
    headers: { 'x-api-key': TEST_KEY },
    body: messagePayload,
  });
  const out = await handleCmsIntegration(req, res, '/api/integrations/cms/message', store, readJson, send);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(out.payload, { status: 'success', message: 'Synced.' });

  const messages = await store.find('DMS_Schedule_Request_Messages');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].Sender_Name, 'Agent Alice');
  assert.equal(messages[0].Message, 'Customer requested afternoon delivery slot');
  assert.equal(messages[0].Added_User, 'cms_integration');
});

test('message: returns 400 if target CMS request does not exist', async () => {
  const { req, res, readJson, send } = makeCall({
    path: '/api/integrations/cms/message',
    headers: { 'x-api-key': TEST_KEY },
    body: { cmsRecordId: 'NON-EXISTENT', message: 'Hello' },
  });
  const out = await handleCmsIntegration(req, res, '/api/integrations/cms/message', store, readJson, send);
  assert.equal(out.statusCode, 400);
  assert.match(out.payload.message, /No matching DMS_Schedule_Request found/);
});

test('unknown route: returns 404', async () => {
  const { req, res, readJson, send } = makeCall({
    path: '/api/integrations/cms/invalid-action',
    headers: { 'x-api-key': TEST_KEY },
  });
  const out = await handleCmsIntegration(req, res, '/api/integrations/cms/invalid-action', store, readJson, send);
  assert.equal(out.statusCode, 404);
  assert.match(out.payload.message, /Unknown CMS endpoint/);
});
