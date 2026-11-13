// Accounts and sign-in. BACKEND=local keeps users/sessions in the same SQLite database as the app
// data; BACKEND=pg keeps them in the shared Postgres so everyone sees the same user list.
// Passwords are scrypt hashes; the session cookie holds a random token whose SHA-256 is stored.
import crypto from 'node:crypto';
import { zohoNow } from './db.mjs';

const BACKEND = process.env.BACKEND === 'pg' ? 'pg' : 'local';

export const COOKIE = 'hc_session';
const SESSION_DAYS = 14;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
// Accepts an email OR a plain username (3-32 chars: letters, digits, dot, underscore, hyphen).
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$|^[a-z0-9._-]{3,32}$/.test(normEmail(e));

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}
export const newPassword = () => crypto.randomBytes(12).toString('base64url');
export const passwordProblem = (p) => (String(p || '').length < 10 ? 'Use at least 10 characters.' : null);

const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active, mustChangePassword: !!u.must_change_password, createdAt: u.created_at, lastLogin: u.last_login };

// ---------- storage: local (SQLite, sync) or pg (Postgres, async) behind one async-shaped interface ----------
let store;
if (BACKEND === 'pg') {
  const { createPool } = await import('./pg/pool.mjs');
  const pool = createPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT, last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS _sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES _users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
  `);
  store = {
    get: async (sql, params) => (await pool.query(toPg(sql), params)).rows[0],
    all: async (sql, params) => (await pool.query(toPg(sql), params)).rows,
    run: async (sql, params) => { const r = await pool.query(toPg(sql) + (/^INSERT/i.test(sql) ? ' RETURNING id' : ''), params); return { lastInsertRowid: r.rows[0]?.id }; },
  };
} else {
  const { db } = await import('./db.mjs');
  db.exec(`
    CREATE TABLE IF NOT EXISTS _users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT, last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS _sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES _users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
  `);
  store = {
    get: async (sql, params = []) => db.prepare(sql).get(...params),
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    run: async (sql, params = []) => db.prepare(sql).run(...params),
  };
}
// SQLite uses `?` placeholders; Postgres uses `$1, $2, …`.
function toPg(sql) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }

export async function createUser({ email, name = '', role = 'user', password, mustChange = true }) {
  email = normEmail(email);
  if (!isEmail(email)) throw new Error('Enter a valid email address.');
  if (await store.get('SELECT 1 FROM _users WHERE email = ?', [email])) throw new Error(`${email} already has an account.`);
  const r = await store.run('INSERT INTO _users (email, name, password_hash, role, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [email, String(name).trim(), hashPassword(password), role === 'admin' ? 'admin' : 'user', mustChange ? 1 : 0, zohoNow()]);
  return publicUser(await store.get('SELECT * FROM _users WHERE id = ?', [r.lastInsertRowid]));
}
export const listUsers = async () => (await store.all('SELECT * FROM _users ORDER BY email')).map(publicUser);
export const getUser = async (id) => publicUser(await store.get('SELECT * FROM _users WHERE id = ?', [Number(id)]));

export async function updateUser(id, { name, role, active }) {
  const u = await store.get('SELECT * FROM _users WHERE id = ?', [Number(id)]);
  if (!u) throw new Error('User not found.');
  const next = { name: name ?? u.name, role: role ?? u.role, active: active === undefined ? u.active : active ? 1 : 0 };
  if (u.role === 'admin' && (next.role !== 'admin' || !next.active) && (await adminCount()) <= 1) throw new Error('Keep at least one active admin.');
  await store.run('UPDATE _users SET name = ?, role = ?, active = ? WHERE id = ?', [String(next.name).trim(), next.role === 'admin' ? 'admin' : 'user', next.active, u.id]);
  if (!next.active) await store.run('DELETE FROM _sessions WHERE user_id = ?', [u.id]);
  return getUser(u.id);
}
export async function deleteUser(id) {
  const u = await store.get('SELECT * FROM _users WHERE id = ?', [Number(id)]);
  if (!u) throw new Error('User not found.');
  if (u.role === 'admin' && u.active && (await adminCount()) <= 1) throw new Error('Keep at least one active admin.');
  await store.run('DELETE FROM _sessions WHERE user_id = ?', [u.id]);
  await store.run('DELETE FROM _users WHERE id = ?', [u.id]);
}
const adminCount = async () => Number((await store.get("SELECT COUNT(*) AS n FROM _users WHERE role = 'admin' AND active = 1")).n);

export async function setPassword(id, password, { mustChange = false } = {}) {
  await store.run('UPDATE _users SET password_hash = ?, must_change_password = ? WHERE id = ?', [hashPassword(password), mustChange ? 1 : 0, Number(id)]);
  await store.run('DELETE FROM _sessions WHERE user_id = ?', [Number(id)]);
}
export async function changeOwnPassword(id, current, next) {
  const u = await store.get('SELECT * FROM _users WHERE id = ?', [Number(id)]);
  if (!u || !verifyPassword(current, u.password_hash)) throw new Error('Your current password is not correct.');
  const problem = passwordProblem(next);
  if (problem) throw new Error(problem);
  await setPassword(u.id, next);
}

// ---------- sign-in ----------
const failures = new Map(); // ip -> { n, until }
export function tooManyAttempts(ip) {
  const f = failures.get(ip);
  return !!f && f.n >= 8 && f.until > Date.now();
}
function noteFailure(ip) {
  const f = failures.get(ip);
  const n = f && f.until > Date.now() ? f.n + 1 : 1;
  failures.set(ip, { n, until: Date.now() + 15 * 60 * 1000 });
}

/** Returns { token, user } on success, or null. */
export async function signIn(email, password, ip) {
  const u = await store.get('SELECT * FROM _users WHERE email = ?', [normEmail(email)]);
  // Hash even when the user does not exist so the response time does not reveal which emails have accounts.
  const ok = u ? verifyPassword(password, u.password_hash) : (verifyPassword(password, hashPassword('x')), false);
  if (!ok || !u.active) { noteFailure(ip); return null; }
  failures.delete(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  await store.run('DELETE FROM _sessions WHERE expires_at < ?', [Date.now()]);
  await store.run('INSERT INTO _sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [sha256(token), u.id, Date.now() + SESSION_DAYS * 864e5]);
  await store.run('UPDATE _users SET last_login = ? WHERE id = ?', [zohoNow(), u.id]);
  return { token, user: publicUser(u) };
}
export async function userForToken(token) {
  if (!token) return null;
  const row = await store.get('SELECT u.* FROM _sessions s JOIN _users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1', [sha256(token), Date.now()]);
  return publicUser(row);
}
export const signOut = (token) => token && store.run('DELETE FROM _sessions WHERE token_hash = ?', [sha256(token)]);
export const cookieMaxAge = SESSION_DAYS * 86400;

/** First start on a fresh database: create the admin from ADMIN_EMAIL / ADMIN_PASSWORD. */
export async function bootstrapAdmin(env = process.env) {
  if (Number((await store.get('SELECT COUNT(*) AS n FROM _users')).n)) return null;
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return 'No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create the first admin.';
  await createUser({ email: env.ADMIN_EMAIL, name: env.ADMIN_NAME || 'Admin', role: 'admin', password: env.ADMIN_PASSWORD, mustChange: true });
  return `Created admin account ${normEmail(env.ADMIN_EMAIL)}.`;
}
