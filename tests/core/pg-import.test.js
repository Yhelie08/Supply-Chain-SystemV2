// Imports the real Development backup (data/zoho-backup, not in git) into PGlite and checks it end to end.
// Skipped when no backup exists on this machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { reports } from '../../server/model.mjs';
import { importBackup } from '../../server/pg/import.mjs';
import { createStore } from '../../server/pg/store.mjs';

const root = path.resolve(import.meta.dirname, '..', '..', 'data', 'zoho-backup');
const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'manifest.json'))).sort() : [];
const backup = dirs.length ? path.join(root, dirs.at(-1)) : null;

test('import a real backup: counts match, IDs are exact, every report reads', { skip: !backup && 'no backup in data/zoho-backup', timeout: 240000 }, async () => {
  const db = new PGlite();
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
  const summary = await importBackup(db, backup, { log: () => {} });
  assert.deepEqual(summary.filter((s) => s.status.startsWith('FAILED')), [], 'no form fails to import');

  // Row counts equal the export, and a second run changes nothing (tables already have rows).
  for (const e of manifest.forms.filter((f) => f.rows)) {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "${e.form}"`);
    assert.equal(rows[0].n, e.rows, e.form);
  }
  const again = await importBackup(db, backup, { log: () => {} });
  assert.ok(again.filter((s) => s.rows).every((s) => s.status.startsWith('skipped')), 're-run skips forms that already have rows');

  // Every Zoho ID comes back unchanged, as the same string.
  const items = JSON.parse(fs.readFileSync(path.join(backup, 'Items.json'), 'utf8'));
  const { rows: stored } = await db.query('SELECT "ID"::text AS id FROM "Items" ORDER BY "ID"');
  assert.deepEqual(stored.map((r) => r.id), items.map((r) => r.ID).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)));

  // Every report a widget can open answers without an error.
  const store = createStore(db);
  for (const name of Object.keys(reports)) await store.getRecords(name, {});
});
