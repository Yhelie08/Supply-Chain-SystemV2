// Loads a Zoho backup (made by tools/export-zoho-data.mjs) into the Postgres database in DATABASE_URL.
//
//   node --env-file-if-exists=.env tools/import-zoho-backup.mjs <backup-dir> [--dry-run] [--replace] [--only=Form_A,Form_B]
//
// --dry-run   check the files and count rows, touch nothing
// --replace   reload forms that already have rows (default: skip them, so new-app records are never wiped)
import { createPool } from '../server/pg/pool.mjs';
import { importBackup } from '../server/pg/import.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) { console.error('Usage: node tools/import-zoho-backup.mjs <backup-dir> [--dry-run] [--replace] [--only=Form_A,Form_B]'); process.exit(2); }
const flag = (n) => args.includes(`--${n}`);
const onlyArg = args.find((a) => a.startsWith('--only='));

const dryRun = flag('dry-run');
const pool = dryRun ? null : createPool();
try {
  const summary = await importBackup(pool, dir, { dryRun, replace: flag('replace'), only: onlyArg ? new Set(onlyArg.slice(7).split(',')) : null });
  const failed = summary.filter((s) => s.status.startsWith('FAILED')).length;
  console.log(`\n${summary.filter((s) => /^(imported|ok)/.test(s.status)).length} loaded, ${failed} failed, ${summary.length} forms in the backup.`);
  process.exitCode = failed ? 1 : 0;
} finally {
  await pool?.end();
}
