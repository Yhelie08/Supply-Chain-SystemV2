// Connection to Postgres. DATABASE_URL comes from Railway (private address inside Railway, the public
// TCP proxy address from a PC). SSL is skipped for local and Railway-private addresses.
import pg from 'pg';

export function createPool(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set (BACKEND=pg needs a Postgres connection string).');
  const host = new URL(url).hostname;
  const plain = /^(localhost|127\.0\.0\.1)$/.test(host) || host.endsWith('.railway.internal');
  const ssl = process.env.PGSSL === 'disable' || plain ? false : { rejectUnauthorized: false };
  return new pg.Pool({ connectionString: url, ssl, max: Number(process.env.PG_POOL_MAX || 10) });
}
