// Connection to Postgres. DATABASE_URL comes from Railway (private address inside Railway, the public
// TCP proxy address from a PC). SSL is skipped for local and Railway-private addresses.
import pg from 'pg';

// One pool per process and URL: sign-in (server/auth.mjs) and the data layer (server/pg/api.mjs) share it.
// Two pools would open two connections, and `npm run dev:pg` serves PGlite through a socket that takes one
// connection (PG_POOL_MAX=1), so the second one was reset (ECONNRESET) at start-up.
const pools = new Map();

export function createPool(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set (BACKEND=pg needs a Postgres connection string).');
  const existing = pools.get(url);
  if (existing && !existing.ended) return existing;
  const host = new URL(url).hostname;
  const plain = /^(localhost|127\.0\.0\.1)$/.test(host) || host.endsWith('.railway.internal');
  const ssl = process.env.PGSSL === 'disable' || plain ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: url, ssl, max: Number(process.env.PG_POOL_MAX || 10) });
  pools.set(url, pool);
  return pool;
}

export const getPool = createPool;
