// Writes vault/Deluge Scripts (Obsidian)/00 - Port Checklist.md: everything still to port, by app section.
//   node tools/build-module-readmes.mjs && node tools/build-port-checklist.mjs
// Reads zoho-export/parsed (workflows, functions), the modules in server/modules (their forms, custom APIs and
// ported.json), and the generated 00 - Port Status.md (for the custom API and function tables), so the checklist
// never disagrees with them.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const PARSED = path.join(ROOT, 'zoho-export', 'parsed');
const NOTES = path.join(ROOT, 'vault', 'Deluge Scripts (Obsidian)');
const read = (p) => fs.readFileSync(p, 'utf8');
const workflows = JSON.parse(read(path.join(PARSED, 'workflows.json')));
const { modules } = await import(pathToFileURL(path.join(ROOT, 'server', 'modules', 'index.mjs')).href);
const ports = {};
for (const m of modules) {
  const file = path.join(ROOT, 'server', 'modules', m.id, 'ported.json');
  if (fs.existsSync(file)) Object.assign(ports, Object.fromEntries(Object.entries(JSON.parse(read(file))).filter(([k]) => !k.startsWith('_'))));
}
const statusFile = path.join(NOTES, '00 - Port Status.md');
if (!fs.existsSync(statusFile)) throw new Error('Run node tools/build-module-readmes.mjs first: it writes 00 - Port Status.md.');
const portStatus = read(statusFile);

// ----- which app section a form, or a custom API, belongs to: the module that lists it (server/modules/*) -----
const SECTIONS = ['Procurement', 'Tony Fan', 'Fenteng Lighting', 'Fulfillment', 'Delivery Management', 'Analytic'];
const sectionOfForm = (form) => modules.find((m) => m.forms.includes(form))?.label ?? 'Unassigned';
const ownerOfApi = Object.fromEntries(modules.flatMap((m) => Object.keys(m.apis).map((api) => [api, m.label])));

const APIRUN = /^(on validate|on success)/;
const dg = (rel) => { try { return read(path.join(PARSED, rel)); } catch { return ''; } };
const lineCount = (src) => (src ? src.split('\n').length : 0);
const needsOf = (src) => [/zohoapis\.com\/books|zoho\.books/.test(src) && 'Books', /zohoapis\.com\/inventory|zoho\.inventory/.test(src) && 'Inventory',
  /Cms|cms\./.test(src) && 'CMS', /geoapify/i.test(src) && 'Geoapify', /sendmail/i.test(src) && 'Email'].filter(Boolean).join(', ') || 'Creator data only';
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`), ''].join('\n') : '_none_\n';

// ----- tables from Port Status -----
const section = (title) => portStatus.split(`## ${title}`)[1]?.split('\n## ')[0] ?? '';
const functions = [...section('Deluge functions').matchAll(/^\| `([^`]+)` \| (?:`([^`]+)`|—) \| ([^|]*) \| ([^|]*) \|/gm)]
  .map((m) => ({ fn: m[1], api: m[2] || '', usedBy: m[3].trim(), status: m[4].trim() }));
const apis = [...section('Custom APIs the widgets call').matchAll(/^\| `([^`]+)` \| `([^`]+)` \| ([^|]*) \|/gm)].map((m) => ({ api: m[1], fn: m[2], status: m[3].trim() }));
const fnByName = Object.fromEntries(functions.map((f) => [f.fn, f]));
const isDone = (status) => /^Ported|^Skipped/.test(status);

// ----- form workflows that run on API writes -----
const rows = [];
for (const w of workflows.filter((x) => x.kind === 'form' && x.status === 'active')) {
  const events = (w.events || []).filter((e) => APIRUN.test(e.event));
  if (!events.length) continue;
  const p = ports[w.form];
  const src = events.map((e) => dg(e.file)).join('\n');
  rows.push({
    section: sectionOfForm(w.form), form: w.form, name: w.name, when: `${w.recordEvent}, ${[...new Set(events.map((e) => e.event))].join(' + ')}`,
    lines: lineCount(src), calls: [...new Set([...src.matchAll(/thisapp\.(\w+)\(/g)].map((m) => m[1]))].join(', '), needs: needsOf(src),
    done: !!p?.ported.includes(w.name),
  });
}
const stats = (sec) => { const r = rows.filter((x) => x.section === sec); return { total: r.length, done: r.filter((x) => x.done).length }; };

// ----- custom APIs -----
// An API several sections call is counted under the module that owns it (the one whose folder holds it).
const apiRows = apis.map((a) => {
  const f = fnByName[a.fn] || {};
  const src = dg(`functions/${a.fn}.dg`);
  const secs = (f.usedBy || '').split(',').map((s) => s.trim()).filter((s) => SECTIONS.includes(s));
  return { ...a, sections: secs.length ? secs.join(', ') : '—', lines: lineCount(src), needs: needsOf(src), done: isDone(a.status), first: ownerOfApi[a.api] ?? 'zz' };
}).sort((a, b) => Number(a.done) - Number(b.done) || SECTIONS.indexOf(a.first) - SECTIONS.indexOf(b.first) || a.api.localeCompare(b.api));

// ----- other functions (no custom API) that workflows call -----
const callers = {};
for (const w of workflows) for (const e of w.events || []) for (const m of dg(e.file).matchAll(/thisapp\.(\w+)\(/g)) (callers[m[1]] ||= new Set()).add(w.name);
const otherFns = functions.filter((f) => !f.api && !isDone(f.status)).map((f) => ({ ...f, lines: lineCount(dg(`functions/${f.fn}.dg`)), called: [...(callers[f.fn] || [])].slice(0, 4).join(', ') || '—', needs: needsOf(dg(`functions/${f.fn}.dg`)) }))
  .sort((a, b) => b.lines - a.lines);

// ----- build the note -----
const out = [];
const total = rows.length, doneAll = rows.filter((r) => r.done).length;
out.push(`---
title: "Port Checklist"
tags:
  - status
  - porting
  - checklist
---

# Port checklist: what is still to port, by app section

Generated by \`node tools/build-port-checklist.mjs\` (run \`node tools/build-module-readmes.mjs\` first). Counts: [[00 - Port Status]]. How to port one: [[00 - Porting a Workflow]]. Order and phases: [[Plan - Full Migration Off Zoho Creator]].

> [!INFO] What is counted
> **Workflows** are the active Zoho form workflows that run when a widget writes through the API ("on validate" and "on success"). Those that only drive Zoho's own forms (on load, field rules, on user input) or are inactive need no port and are not counted. Each workflow is placed in the section its **form** belongs to; the sections are the ones in the app's dropdown. **Custom APIs** are what the widgets call (\`invokeCustomApi\`). **Lines** is the size of the Deluge script, a rough measure of effort. **Needs** shows the outside systems the script calls.
`);
out.push('## Summary by section\n');
const apiLeft = (sec) => apiRows.filter((a) => !a.done && a.first === sec).length;
out.push(table(['Section', 'Workflows', 'Ported', 'Left', 'Custom APIs left'], [
  ...SECTIONS.map((s) => { const t = stats(s); return [s, t.total, t.done, t.total - t.done, apiLeft(s)]; }),
  ...(stats('Unassigned').total ? [['Unassigned (check the form list)', stats('Unassigned').total, stats('Unassigned').done, stats('Unassigned').total - stats('Unassigned').done, 0]] : []),
  ['**Total**', total, doneAll, total - doneAll, apiRows.filter((a) => !a.done).length],
]));
out.push(`Also not ported: ${workflows.filter((w) => w.kind === 'schedule').length} schedules, ${workflows.filter((w) => w.kind === 'functions').length} report-button functions, and ${functions.filter((f) => !/^Ported/.test(f.status)).length} of ${functions.length} Deluge functions (lists below).\n`);

out.push(`## Custom APIs (${apiRows.length}): ${apiRows.filter((a) => a.done).length} ported, ${apiRows.filter((a) => !a.done).length} to go\n`);
out.push('Not ported first, grouped by the section that uses them.\n');
out.push(table(['Custom API', 'Deluge function', 'Used by', 'Status', 'Needs', 'Lines'], apiRows.map((a) => [`\`${a.api}\``, `\`${a.fn}\``, a.sections, a.done ? 'Ported' : '**To port**', a.needs, a.lines])));

out.push('## Workflows still to port\n');
for (const sec of [...SECTIONS, 'Unassigned']) {
  const left = rows.filter((r) => r.section === sec && !r.done);
  if (!left.length && sec === 'Unassigned') continue;
  const t = stats(sec);
  out.push(`### ${sec}: ${t.done} of ${t.total} ported\n`);
  out.push(left.length ? table(['Form', 'Workflow', 'When', 'Lines', 'Calls function', 'Needs'], left.sort((a, b) => a.form.localeCompare(b.form) || b.lines - a.lines).map((r) => [r.form, `\`${r.name}\``, r.when, r.lines, r.calls || '—', r.needs])) : (t.total ? 'All ported.\n' : 'No workflows of its own: the page only reads data.\n'));
}

const schedules = workflows.filter((w) => w.kind === 'schedule');
// A module lists the schedules it ports in its index.mjs (`schedules: [{ name, at, run }]`); server/schedules.mjs runs them.
const portedSchedules = new Set(modules.flatMap((m) => (m.schedules || []).map((s) => s.name)));
out.push(`## Schedules (${schedules.length}), ${portedSchedules.size} ported\n`);
out.push(table(['Schedule', 'Active in Zoho', 'Lines', 'Needs', 'Status'], schedules.map((w) => { const src = (w.events || []).map((e) => dg(e.file)).join('\n'); return [`\`${w.name}\``, w.status === 'active' ? 'yes' : 'no (inactive)', lineCount(src), needsOf(src), portedSchedules.has(w.name) ? 'Ported' : '**To port**']; })));
out.push('The runner is `server/schedules.mjs`: a timer that runs each ported schedule once a day at its time in its time zone. It is off unless `SCHEDULES=on` is set on the server.\n');

const buttons = workflows.filter((w) => w.kind === 'functions');
out.push(`## Report-button functions (${buttons.length}), none ported\n`);
out.push('Buttons on Zoho\'s own report pages. The 42 widgets have their own buttons, so each one needs a check: does a widget button already do the same thing through a custom API above?\n');
out.push(table(['Button', 'Form', 'Section', 'Lines', 'Needs'], buttons.map((w) => { const src = (w.events || []).map((e) => dg(e.file)).join('\n'); return [`\`${w.name}\``, w.form || '—', sectionOfForm(w.form), lineCount(src), needsOf(src)]; })));

out.push(`## Deluge functions without a custom API, not yet ported (${otherFns.length})\n`);
out.push('Helpers that workflows or other functions call. Biggest first.\n');
out.push(table(['Function', 'Called by', 'Lines', 'Needs'], otherFns.map((f) => [`\`${f.fn}\``, f.called, f.lines, f.needs])));

fs.writeFileSync(path.join(NOTES, '00 - Port Checklist.md'), out.join('\n'));
console.log(`Port Checklist written: ${total - doneAll} of ${total} workflows to port, ${apiRows.filter((a) => !a.done).length} custom APIs to port.`);
