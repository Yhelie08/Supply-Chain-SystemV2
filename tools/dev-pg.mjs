// Runs the whole app on this PC against a local Postgres, no install needed:
//   npm run dev:pg        ->  http://localhost:4000
// Starts PGlite (Postgres in WebAssembly) kept in DATA_DIR/pglite, loads the newest backup from
// data/zoho-backup the first time (when the database is empty), then starts the server with BACKEND=pg.
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { DATA_DIR } from '../server/db.mjs';
import { ensureSchema } from '../server/pg/schema.mjs';
import { importBackup } from '../server/pg/import.mjs';

const PG_PORT = Number(process.env.DEV_PG_PORT || 5544);
const db = await PGlite.create({ dataDir: path.join(DATA_DIR, 'pglite') });
await ensureSchema(db);

const { rows } = await db.query('SELECT (SELECT count(*) FROM "Items") + (SELECT count(*) FROM "Service_Request1") + (SELECT count(*) FROM "Customer") AS n');
const root = path.join(DATA_DIR, 'zoho-backup');
const backups = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'manifest.json'))).sort() : [];
if (Number(rows[0].n) === 0 && backups.length) {
  const dir = path.join(root, backups.at(-1));
  console.log(`[dev:pg] database is empty, loading ${dir}`);
  await importBackup(db, dir, { log: () => {} });
} else if (Number(rows[0].n) === 0) {
  console.log('[dev:pg] database is empty and there is no backup in data/zoho-backup (run tools/export-zoho-data.mjs first)');
}

await new PGLiteSocketServer({ db, port: PG_PORT, host: '127.0.0.1' }).start();
process.env.BACKEND = 'pg';
process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`;
process.env.PGSSL = 'disable';
process.env.PG_POOL_MAX = '1'; // the local socket server serves one connection at a time
console.log(`[dev:pg] local Postgres on ${PG_PORT}, data in ${path.join(DATA_DIR, 'pglite')}`);
await import('../server/index.mjs');
