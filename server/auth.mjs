// Accounts and sign-in: users and sessions live in the same SQLite database as the app data.
// Passwords are scrypt hashes; the session cookie holds a random token whose SHA-256 is stored.
import crypto from 'node:crypto';
import { db, zohoNow } from './db.mjs';

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

export const COOKIE = 'hc_session';
const SESSION_DAYS = 14;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(e));

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

export function createUser({ email, name = '', role = 'user', password, mustChange = true }) {
  email = normEmail(email);
  if (!isEmail(email)) throw new Error('Enter a valid email address.');
  if (db.prepare('SELECT 1 FROM _users WHERE email = ?').get(email)) throw new Error(`${email} already has an account.`);
  const r = db.prepare('INSERT INTO _users (email, name, password_hash, role, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(email, String(name).trim(), hashPassword(password), role === 'admin' ? 'admin' : 'user', mustChange ? 1 : 0, zohoNow());
  return publicUser(db.prepare('SELECT * FROM _users WHERE id = ?').get(r.lastInsertRowid));
}
export const listUsers = () => db.prepare('SELECT * FROM _users ORDER BY email').all().map(publicUser);
export const getUser = (id) => publicUser(db.prepare('SELECT * FROM _users WHERE id = ?').get(Number(id)));

export function updateUser(id, { name, role, active }) {
  const u = db.prepare('SELECT * FROM _users WHERE id = ?').get(Number(id));
  if (!u) throw new Error('User not found.');
  const next = { name: name ?? u.name, role: role ?? u.role, active: active === undefined ? u.active : active ? 1 : 0 };
  if (u.role === 'admin' && (next.role !== 'admin' || !next.active) && adminCount() <= 1) throw new Error('Keep at least one active admin.');
  db.prepare('UPDATE _users SET name = ?, role = ?, active = ? WHERE id = ?').run(String(next.name).trim(), next.role === 'admin' ? 'admin' : 'user', next.active, u.id);
  if (!next.active) db.prepare('DELETE FROM _sessions WHERE user_id = ?').run(u.id);
  return getUser(u.id);
}
export function deleteUser(id) {
  const u = db.prepare('SELECT * FROM _users WHERE id = ?').get(Number(id));
  if (!u) throw new Error('User not found.');
  if (u.role === 'admin' && u.active && adminCount() <= 1) throw new Error('Keep at least one active admin.');
  db.prepare('DELETE FROM _sessions WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM _users WHERE id = ?').run(u.id);
}
const adminCount = () => db.prepare("SELECT COUNT(*) AS n FROM _users WHERE role = 'admin' AND active = 1").get().n;

export function setPassword(id, password, { mustChange = false } = {}) {
  db.prepare('UPDATE _users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(hashPassword(password), mustChange ? 1 : 0, Number(id));
  db.prepare('DELETE FROM _sessions WHERE user_id = ?').run(Number(id));
}
export function changeOwnPassword(id, current, next) {
  const u = db.prepare('SELECT * FROM _users WHERE id = ?').get(Number(id));
  if (!u || !verifyPassword(current, u.password_hash)) throw new Error('Your current password is not correct.');
  const problem = passwordProblem(next);
  if (problem) throw new Error(problem);
  setPassword(u.id, next);
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
export function signIn(email, password, ip) {
  const u = db.prepare('SELECT * FROM _users WHERE email = ?').get(normEmail(email));
  // Hash even when the user does not exist so the response time does not reveal which emails have accounts.
  const ok = u ? verifyPassword(password, u.password_hash) : (verifyPassword(password, hashPassword('x')), false);
  if (!ok || !u.active) { noteFailure(ip); return null; }
  failures.delete(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM _sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO _sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), u.id, Date.now() + SESSION_DAYS * 864e5);
  db.prepare('UPDATE _users SET last_login = ? WHERE id = ?').run(zohoNow(), u.id);
  return { token, user: publicUser(u) };
}
export function userForToken(token) {
  if (!token) return null;
  const row = db.prepare('SELECT u.* FROM _sessions s JOIN _users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1').get(sha256(token), Date.now());
  return publicUser(row);
}
export const signOut = (token) => token && db.prepare('DELETE FROM _sessions WHERE token_hash = ?').run(sha256(token));
export const cookieMaxAge = SESSION_DAYS * 86400;

/** First start on a fresh database: create the admin from ADMIN_EMAIL / ADMIN_PASSWORD. */
export function bootstrapAdmin(env = process.env) {
  if (db.prepare('SELECT COUNT(*) AS n FROM _users').get().n) return null;
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return 'No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create the first admin.';
  createUser({ email: env.ADMIN_EMAIL, name: env.ADMIN_NAME || 'Admin', role: 'admin', password: env.ADMIN_PASSWORD, mustChange: true });
  return `Created admin account ${normEmail(env.ADMIN_EMAIL)}.`;
}
