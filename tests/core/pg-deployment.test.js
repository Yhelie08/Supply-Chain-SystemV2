// tests/core/pg-deployment.test.js
// Automated verification for Railway PostgreSQL deployment setup (server/pg/pool.mjs, server/pg/schema.mjs).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createPool, getPool } from '../../server/pg/pool.mjs';
import { ensureSchema, syncSequence, SEQ, SEQ_START } from '../../server/pg/schema.mjs';
import { columns } from '../../server/model.mjs';

describe('Railway Connection Pooling (server/pg/pool.mjs)', () => {
  test('exports getPool as an alias to createPool', () => {
    assert.strictEqual(typeof getPool, 'function');
    assert.strictEqual(getPool, createPool);
  });

  test('returns the exact same pool instance for repeated calls with same URL', async () => {
    const url = 'postgres://postgres:pass@localhost:5432/test_singleton';
    const p1 = getPool(url);
    const p2 = getPool(url);
    assert.strictEqual(p1, p2, 'Multiple calls to getPool(url) must return the identical instance');
    await p1.end();
  });

  test('disables SSL for localhost, 127.0.0.1, and *.railway.internal', async () => {
    const pLocal = getPool('postgres://postgres:pass@localhost:5432/db_local');
    const pIp = getPool('postgres://postgres:pass@127.0.0.1:5432/db_ip');
    const pInternal = getPool('postgres://postgres:pass@postgres.railway.internal:5432/db_internal');
    const pSubInternal = getPool('postgres://postgres:pass@custom-service.railway.internal:5432/db_sub');

    assert.strictEqual(pLocal.options.ssl, false, 'localhost should have ssl: false');
    assert.strictEqual(pIp.options.ssl, false, '127.0.0.1 should have ssl: false');
    assert.strictEqual(pInternal.options.ssl, false, 'postgres.railway.internal should have ssl: false');
    assert.strictEqual(pSubInternal.options.ssl, false, '*.railway.internal should have ssl: false');

    await Promise.all([pLocal.end(), pIp.end(), pInternal.end(), pSubInternal.end()]);
  });

  test('enables SSL with rejectUnauthorized: false for external URLs', async () => {
    const pExternal = getPool('postgres://postgres:pass@roundhouse.proxy.rlwy.net:12345/db_ext');
    assert.deepEqual(pExternal.options.ssl, { rejectUnauthorized: false }, 'external URL should have rejectUnauthorized: false');
    await pExternal.end();
  });

  test('PGSSL=disable overrides external SSL configuration', async () => {
    const prev = process.env.PGSSL;
    process.env.PGSSL = 'disable';
    try {
      const pOverride = getPool('postgres://postgres:pass@roundhouse.proxy.rlwy.net:12345/db_override');
      assert.strictEqual(pOverride.options.ssl, false, 'PGSSL=disable must force ssl: false');
      await pOverride.end();
    } finally {
      if (prev !== undefined) process.env.PGSSL = prev;
      else delete process.env.PGSSL;
    }
  });

  test('respects PG_POOL_MAX configuration', async () => {
    const prev = process.env.PG_POOL_MAX;
    process.env.PG_POOL_MAX = '5';
    try {
      const pMax = getPool('postgres://postgres:pass@localhost:5432/db_max');
      assert.equal(pMax.options.max, 5);
      await pMax.end();
    } finally {
      if (prev !== undefined) process.env.PG_POOL_MAX = prev;
      else delete process.env.PG_POOL_MAX;
    }
  });

  test('throws descriptive error when DATABASE_URL is missing', () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      assert.throws(() => getPool(), /DATABASE_URL is not set/);
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });
});

describe('Railway Schema and Sequence Initialization (server/pg/schema.mjs)', () => {
  test('ensureSchema creates all 90 tables with record_id_seq starting at 4900000000000000000', async () => {
    const db = new PGlite();
    const stmts = await ensureSchema(db);
    assert.equal(stmts, Object.keys(columns).length, 'Should create tables for all 90 forms');

    const seqRes = await db.query("SELECT start_value FROM pg_sequences WHERE sequencename = 'record_id_seq'");
    assert.equal(String(seqRes.rows[0].start_value), SEQ_START);

    const tables = await db.query("SELECT count(table_name) AS cnt FROM information_schema.tables WHERE table_schema = 'public'");
    assert.equal(Number(tables.rows[0].cnt), Object.keys(columns).length);

    // Verify sequence progression
    const nextRes = await db.query("SELECT nextval('record_id_seq') AS id");
    assert.equal(String(nextRes.rows[0].id), SEQ_START);

    // Verify insert without explicit ID receives next sequence value
    const insertRes = await db.query('INSERT INTO "Customer" (customer_name) VALUES ($1) RETURNING "ID"', ['Acme Corp']);
    const insertedId = BigInt(insertRes.rows[0].ID);
    assert.ok(insertedId >= BigInt(SEQ_START), 'New record ID must be >= SEQ_START');

    // Verify second run is idempotent
    const secondStmts = await ensureSchema(db);
    assert.equal(secondStmts, 0, 'ensureSchema is idempotent: executes 0 statements on second run');
  });

  test('syncSequence updates sequence above maximum existing table ID', async () => {
    const db = new PGlite();
    await ensureSchema(db);

    const HIGHER_ID = '4950000000000000000';
    await db.query('INSERT INTO "Customer" ("ID", customer_name) VALUES ($1::bigint, $2)', [HIGHER_ID, 'Test Customer']);

    await syncSequence(db);

    const nextRes = await db.query("SELECT nextval('record_id_seq') AS id");
    assert.ok(BigInt(nextRes.rows[0].id) > BigInt(HIGHER_ID), 'Sequence must advance above highest existing record ID');
  });
});
