// Every server/modules/<module>/ported.json must only name workflows that exist, once each (across all modules),
// and every ported form must have hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workflows } from '../../server/workflows/all.mjs';
import { modules } from '../../server/modules/index.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const zoho = JSON.parse(fs.readFileSync(path.join(ROOT, 'zoho-export', 'parsed', 'workflows.json'), 'utf8'));
const ports = modules.flatMap((m) => {
  const file = path.join(ROOT, 'server', 'modules', m.id, 'ported.json');
  return fs.existsSync(file) ? Object.entries(JSON.parse(fs.readFileSync(file, 'utf8'))).filter(([k]) => !k.startsWith('_')) : [];
});

test('every workflow named in ported.json exists for that form, and is listed only once', () => {
  const seen = new Set();
  for (const [form, entry] of ports) {
    const known = new Set(zoho.filter((w) => w.kind === 'form' && w.form === form).map((w) => w.name));
    const names = [...entry.ported, ...entry.nativeFormOnly, ...Object.keys(entry.notNeeded)];
    for (const name of names) {
      assert.ok(known.has(name), `${form}: "${name}" is not a workflow in the Zoho export`);
      assert.ok(!seen.has(`${form}/${name}`), `${form}: "${name}" is listed twice`);
      seen.add(`${form}/${name}`);
    }
  }
});

test('a form with ported workflows has hooks registered, and the inactive or script-less ones are what Zoho says', () => {
  for (const [form, entry] of ports) {
    assert.ok(entry.ported.length === 0 || Object.keys(workflows[form] || {}).length > 0, `${form} has ported workflows but no hooks`);
    for (const name of Object.keys(entry.notNeeded)) {
      const w = zoho.find((x) => x.kind === 'form' && x.form === form && x.name === name);
      assert.ok(w.status === 'inactive' || !(w.events || []).length, `${name} is neither inactive nor script-less`);
    }
    for (const name of entry.nativeFormOnly) {
      const w = zoho.find((x) => x.kind === 'form' && x.form === form && x.name === name);
      assert.ok((w.events || []).every((e) => /^(on load|field rules|on user input)/.test(e.event)), `${name} has an event that runs on API writes`);
    }
  }
});
