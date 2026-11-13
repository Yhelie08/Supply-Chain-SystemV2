// Accounts and sign-in on Postgres (BACKEND=pg) against PGlite behind a socket, like `npm run dev:pg`.
// Guards the bug where every pg INSERT got "RETURNING id", so sign-in failed on _sessions (it has no id column).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

let db, server, auth, tmp;

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-auth-'));
  db = await PGlite.create();
  const port = await freePort();
  server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  process.env.DATA_DIR = tmp; // server/db.mjs (imported for zohoNow) creates a SQLite file here, not in ./data
  process.env.BACKEND = 'pg';
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.PGSSL = 'disable';
  process.env.PG_POOL_MAX = '1'; // the PGlite socket serves one connection at a time
  auth = await import('../../server/auth.mjs');
});

after(async () => {
  const { createPool } = await import('../../server/pg/pool.mjs');
  await createPool().end();
  await server.stop();
  await db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows keeps the SQLite file from server/db.mjs open until the process ends */ }
});

test('a user can be created, signs in with a plain username, and the session finds them again', async () => {
  const user = await auth.createUser({ email: 'Dispatcher_1', name: 'Dis', password: 'a-long-password', mustChange: false });
  assert.equal(user.email, 'dispatcher_1');
  assert.equal(typeof user.id, 'number');

  const s = await auth.signIn('DISPATCHER_1', 'a-long-password', '1.1.1.1');
  assert.ok(s?.token, 'sign-in must return a session token (it failed with "column id does not exist" before)');
  const me = await auth.userForToken(s.token);
  assert.equal(me.email, 'dispatcher_1');
  assert.ok(me.lastLogin);
});

test('wrong password and unknown user do not sign in', async () => {
  assert.equal(await auth.signIn('dispatcher_1', 'not-the-password', '2.2.2.2'), null);
  assert.equal(await auth.signIn('nobody_here', 'a-long-password', '2.2.2.2'), null);
});

test('sign-out ends the session', async () => {
  const { token } = await auth.signIn('dispatcher_1', 'a-long-password', '3.3.3.3');
  assert.ok(await auth.userForToken(token));
  await auth.signOut(token);
  assert.ok(!(await auth.userForToken(token)));
});

test('a duplicate user, and a name that is neither an email nor a valid username, are refused', async () => {
  await assert.rejects(() => auth.createUser({ email: 'dispatcher_1', password: 'a-long-password' }), /already has an account/);
  await assert.rejects(() => auth.createUser({ email: 'no spaces!', password: 'a-long-password' }), /email or username/);
});

test('admin rules: keeps one active admin; reset and deactivate end the sessions', async () => {
  const admin = await auth.createUser({ email: 'boss', role: 'admin', password: 'a-long-password', mustChange: false });
  await assert.rejects(() => auth.updateUser(admin.id, { role: 'user' }), /at least one active admin/);
  await assert.rejects(() => auth.deleteUser(admin.id), /at least one active admin/);

  const { token } = await auth.signIn('dispatcher_1', 'a-long-password', '4.4.4.4');
  const dis = (await auth.listUsers()).find((u) => u.email === 'dispatcher_1');
  await auth.setPassword(dis.id, 'another-long-password', { mustChange: true });
  assert.ok(!(await auth.userForToken(token)), 'a password reset ends every session of that user');
  const again = await auth.signIn('dispatcher_1', 'another-long-password', '4.4.4.4');
  assert.equal(again.user.mustChangePassword, true);

  await auth.updateUser(dis.id, { active: false });
  assert.ok(!(await auth.userForToken(again.token)));
  assert.equal(await auth.signIn('dispatcher_1', 'another-long-password', '4.4.4.4'), null, 'an inactive user cannot sign in');

  await auth.deleteUser(dis.id);
  assert.equal((await auth.listUsers()).some((u) => u.email === 'dispatcher_1'), false);
});
