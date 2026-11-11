import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeVault } from '../tools/build-vault.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scs-vault-'));
const summary = await writeVault(out);

function notes(dir = out, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) notes(p, acc);
    else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}

const all = notes();
const names = new Map();
for (const f of all) {
  const n = path.basename(f, '.md');
  assert.ok(!names.has(n), `note name "${n}" is used twice (${names.get(n)} and ${f}), so links to it would be ambiguous`);
  names.set(n, f);
}

function linksOf(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].split('|')[0].split('#')[0].trim());
}

test('the vault builds with every part of the app in it', () => {
  assert.equal(summary.pages, 44);
  assert.ok(summary.actions >= 40);
  assert.ok(all.length >= 100);
});

test('every [[link]] points at a note that exists', () => {
  const broken = [];
  for (const f of all) for (const l of linksOf(f)) if (!names.has(l)) broken.push(`${path.relative(out, f)} -> [[${l}]]`);
  assert.deepEqual(broken, []);
});

test('no note is an orphan: every note is linked from somewhere', () => {
  const inbound = new Set();
  for (const f of all) for (const l of linksOf(f)) inbound.add(l);
  const orphans = [...names.keys()].filter((n) => n !== 'Home' && !inbound.has(n));
  assert.deepEqual(orphans, []);
});

test('every note has frontmatter with a title that matches its file name', () => {
  for (const f of all) {
    const text = fs.readFileSync(f, 'utf8');
    const m = text.match(/^---\ntitle: (.+)\n/);
    assert.ok(m, `${path.relative(out, f)} has a title`);
    assert.equal(m[1].replace(/^"|"$/g, ''), path.basename(f, '.md'));
  }
});

test('every mermaid block is closed and non-empty', () => {
  for (const f of all) {
    const text = fs.readFileSync(f, 'utf8');
    const opens = (text.match(/```mermaid/g) || []).length;
    const fences = (text.match(/```/g) || []).length;
    assert.equal(fences % 2, 0, `${path.relative(out, f)} has balanced code fences`);
    if (opens) assert.ok(/```mermaid\n(flowchart|graph) /.test(text), `${path.relative(out, f)} mermaid has a diagram type`);
  }
});
