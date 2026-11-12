// The module folders (server/modules/*) load, do not clash, and cover every custom API a widget calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { modules, customApis } from '../../server/modules/index.mjs';
import { invokeCustomApi } from '../../server/custom-apis.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test('the six sections of the app each have a module with a label, forms and APIs', () => {
  assert.deepEqual(modules.map((m) => m.label).sort(), ['Analytic', 'Delivery Management', 'Fenteng Lighting', 'Fulfillment', 'Procurement', 'Tony Fan']);
  for (const m of modules) {
    assert.ok(Array.isArray(m.forms), `${m.id}: forms`);
    assert.ok(m.functions && m.apis, `${m.id}: functions and apis`);
    assert.deepEqual(Object.keys(m.apis).sort(), Object.keys(m.functions).sort(), `${m.id}: every API has its Deluge function name and the other way round`);
  }
});

test('a form belongs to one module only', () => {
  const owner = new Map();
  for (const m of modules) for (const f of m.forms) {
    assert.ok(!owner.has(f), `form ${f} is listed by ${owner.get(f)} and ${m.id}`);
    owner.set(f, m.id);
  }
});

test('a custom API name is defined once, and an unported one says so', async () => {
  assert.equal(Object.keys(customApis).length, modules.reduce((n, m) => n + Object.keys(m.apis).length, 0));
  assert.equal((await invokeCustomApi('create_rr_main', {})).status, 'error');
  assert.match((await invokeCustomApi('create_rr_main', {})).message, /not ported yet/);
  assert.match((await invokeCustomApi('No_Such_Api', {})).message, /Unknown custom API/);
});

test('every custom API a widget calls has a handler or a "not ported yet" placeholder', () => {
  const NAME = /(?:api_name\s*:\s*|callApprovePOApi\(\s*|CUSTOM_API[A-Z_]*\s*=\s*)['"]([A-Za-z_]+)['"]/g;
  const called = new Map();
  for (const file of walk(path.join(ROOT, 'modules')).filter((f) => /\.(html|js)$/.test(f))) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(NAME)) {
      if (/^[A-Za-z]{24,}$/.test(m[1])) continue; // a public key, not a name
      if (!called.has(m[1])) called.set(m[1], path.relative(ROOT, file));
    }
  }
  const missing = [...called].filter(([name]) => !(name in customApis));
  assert.deepEqual(missing, [], 'a tab calls these but no module has them: add each to its module\'s functions map');
  assert.ok(called.size >= 20, `the scan should find the widgets' API names (found ${called.size})`);
});
