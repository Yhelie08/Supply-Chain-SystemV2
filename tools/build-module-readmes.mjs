// Writes modules/README.md and modules/<Section>/README.md: for each section of the app's dropdown,
// its tabs (widget folders) and the Zoho forms, reports, Deluge functions and workflows those tabs use.
//
//   node tools/build-module-readmes.mjs        (run after tools/parse-ds.mjs and tools/import-widgets.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const P = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'zoho-export', 'parsed', f), 'utf8'));
const sections = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'pages.json'), 'utf8'));
const forms = Object.fromEntries(P('forms.json').map((f) => [f.name, f]));
const reports = Object.fromEntries(P('reports.json').map((r) => [r.name, r]));
const functions = Object.fromEntries(P('functions.json').map((f) => [f.name, f]));
const workflows = P('workflows.json');
const widgetMap = P('widget-map.json');

// Custom API name (what widgets call) -> Deluge function, and which ones are ported, from the modules
// (server/modules/<module>/apis.mjs): a handler made by notPorted() is a placeholder, any other is ported.
const { modules } = await import(pathToFileURL(path.join(ROOT, 'server', 'modules', 'index.mjs')).href);
const apiToFn = {};
const ported = new Set();
for (const m of modules) {
  for (const [api, handler] of Object.entries(m.apis)) {
    apiToFn[api] = m.functions[api];
    if (!handler.notPorted) ported.add(api);
  }
}

const link = (fromDir, target, text) => `[${text}](${encodeURI(path.relative(fromDir, path.join(ROOT, target)).replace(/\\/g, '/'))})`;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

let top = '# Modules\n\nOne folder per section of the app\'s section dropdown, in the same order as the app menu. Each tab folder is the widget\'s source as uploaded to Zoho Creator (`app/` + `plugin-manifest.json`).\n\n| Section | Tabs | Forms | Deluge functions | Workflows |\n|---|---|---|---|---|\n';

const fnSections = {};
for (const sec of sections) {
  const dir = path.join(ROOT, 'modules', sec.label);
  const used = new Set(), apis = new Set();
  for (const t of sec.tabs) {
    const tabDir = path.join(dir, t.widget.split('/')[1]);
    for (const file of walk(tabDir).filter((f) => /\.(html|js)$/.test(f))) {
      const key = path.relative(ROOT, file).replace(/\\/g, '/');
      (widgetMap[key]?.references || []).forEach((r) => used.add(r));
      const code = fs.readFileSync(file, 'utf8');
      for (const api of Object.keys(apiToFn)) if (code.includes(`'${api}'`) || code.includes(`"${api}"`)) apis.add(api);
    }
  }
  const secForms = new Set([...used].filter((n) => forms[n]));
  for (const n of used) if (reports[n]?.form && forms[reports[n].form]) secForms.add(reports[n].form);
  const secReports = [...used].filter((n) => reports[n]).sort();
  // Functions: the ones behind custom APIs, plus everything they call through thisapp.*
  const fnSet = new Set([...apis].map((a) => apiToFn[a]).filter((f) => functions[f]));
  for (const wf of workflows) if (secForms.has(wf.form)) {
    for (const e of wf.events) {
      const code = fs.readFileSync(path.join(ROOT, 'zoho-export', 'parsed', e.file), 'utf8');
      for (const m of code.matchAll(/thisapp\.(\w+)\s*\(/g)) if (functions[m[1]]) fnSet.add(m[1]);
    }
  }
  for (let grew = true; grew;) { grew = false; for (const f of [...fnSet]) for (const c of functions[f].calls || []) if (functions[c] && !fnSet.has(c)) { fnSet.add(c); grew = true; } }
  const secWorkflows = workflows.filter((w) => secForms.has(w.form));
  for (const fn of fnSet) (fnSections[fn] ||= []).push(sec.label);
  const obsidian = path.join('vault', 'Deluge Scripts (Obsidian)', sec.label);

  let md = `# ${sec.label}\n\nTabs, in app menu order. Each folder is the Zoho widget source (\`app/\` + \`plugin-manifest.json\`).\n\n| Tab | Zoho page | Widget folder | Source zip |\n|---|---|---|---|\n`;
  for (const t of sec.tabs) {
    const folder = t.widget.split('/')[1];
    md += `| ${t.label}${t.hidden ? ' (opened from other tabs)' : ''}${t.guess ? ' (widget matched by name, check against Zoho)' : ''} | \`${t.page}\` | ${link(dir, `modules/${t.widget}/app/${t.entry}`, folder)} | ${t.zip ? `\`${t.zip}\`` : '—'} |\n`;
  }
  md += `\n## Custom APIs the tabs call\n\n`;
  md += apis.size ? `| Custom API | Deluge function | Local app |\n|---|---|---|\n${[...apis].sort().map((a) => `| \`${a}\` | ${functions[apiToFn[a]] ? link(dir, `zoho-export/parsed/${functions[apiToFn[a]].file}`, apiToFn[a]) : apiToFn[a]} | ${ported.has(a) ? 'Ported' : 'Not ported yet'} |`).join('\n')}\n` : 'None.\n';
  md += `\n## Forms (database tables)\n\n| Form | Fields | Spec |\n|---|---|---|\n${[...secForms].sort().map((f) => `| ${forms[f].label} | ${forms[f].fieldCount} | ${link(dir, `zoho-export/parsed/forms/${f}.json`, `${f}.json`)} |`).join('\n')}\n`;
  md += `\n## Reports\n\n${secReports.map((r) => `- \`${r}\` (form \`${reports[r].form}\`)`).join('\n') || 'None.'}\n`;
  md += `\n## Deluge functions\n\n${[...fnSet].sort().map((f) => `- ${link(dir, `zoho-export/parsed/${functions[f].file}`, f)}(${functions[f].params})`).join('\n') || 'None.'}\n`;
  md += `\n## Workflows on these forms\n\n| Form | Workflow | Trigger | Script |\n|---|---|---|---|\n${secWorkflows.map((w) => `| ${w.form} | ${w.label} | ${w.recordEvent || w.executionType || w.schedule?.frequency || ''} | ${w.events.map((e) => link(dir, `zoho-export/parsed/${e.file}`, e.event || 'script')).join('<br>')} |`).join('\n')}\n`;
  if (fs.existsSync(path.join(ROOT, obsidian))) md += `\n## Obsidian notes\n\n${link(dir, obsidian, `Deluge Scripts (Obsidian)/${sec.label}`)}\n`;
  fs.writeFileSync(path.join(dir, 'README.md'), md);

  top += `| ${link(path.join(ROOT, 'modules'), `modules/${sec.label}/README.md`, sec.label)} | ${sec.tabs.filter((t) => !t.hidden).length} | ${secForms.size} | ${fnSet.size} | ${secWorkflows.length} |\n`;
  console.log(`${sec.label.padEnd(20)} forms ${secForms.size}, reports ${secReports.length}, functions ${fnSet.size}, workflows ${secWorkflows.length}, custom APIs ${apis.size}`);
}
top += '\nRegenerate after a new `.ds` export or widget import:\n\n```\nnode tools/parse-ds.mjs\nnode tools/import-widgets.mjs\nnode tools/build-module-readmes.mjs\n```\n';
fs.writeFileSync(path.join(ROOT, 'modules', 'README.md'), top);

// ---------- Obsidian: vault/Deluge Scripts (Obsidian)/00 - Port Status.md ----------
const apiOfFn = Object.fromEntries(Object.entries(apiToFn).map(([api, fn]) => [fn, api]));
const statusOf = (fn) => {
  const api = apiOfFn[fn];
  if (!api || !ported.has(api)) return 'Not ported yet';
  return fn === 'pushDmsMessageToCms' ? 'Skipped locally (CMS sync is off)' : 'Ported';
};
const fnRows = Object.values(functions).sort((a, b) => a.name.localeCompare(b.name));
const nPorted = fnRows.filter((r) => statusOf(r.name) === 'Ported').length;
// Form workflows that are ported or need no port: server/modules/<module>/ported.json, merged
const wfPorts = {};
for (const m of modules) {
  const file = path.join(ROOT, 'server', 'modules', m.id, 'ported.json');
  if (fs.existsSync(file)) Object.assign(wfPorts, JSON.parse(fs.readFileSync(file, 'utf8')));
}
const wfCount = (key) => Object.values(wfPorts).filter((v) => typeof v === 'object' && v[key]).reduce((n, v) => n + (Array.isArray(v[key]) ? v[key].length : Object.keys(v[key]).length), 0);
const wfPorted = wfCount('ported'), wfNoPortNeeded = wfCount('nativeFormOnly') + wfCount('notNeeded');
const wfByKind = workflows.reduce((a, w) => ((a[w.kind] = (a[w.kind] || 0) + 1), a), {});
const tick = (s) => '`' + s + '`';
const lines = [
  '---', 'title: "Port Status"', 'tags:', '  - status', '  - deluge', '  - migration', '---', '',
  '# Port status: Zoho Deluge → local app', '',
  `Generated by ${tick('node tools/build-module-readmes.mjs')} from ${tick('zoho-export/parsed/')}. Do not edit by hand.`,
  'See [[00 - Current System]] for how the local app runs and [[00 - Change Log]] for what changed when.', '',
  '| Part | Total | Ported |', '|---|---:|---:|',
  `| Deluge functions | ${fnRows.length} | ${nPorted} |`,
  `| Custom APIs called by widgets | ${Object.keys(apiToFn).length} | ${ported.size} |`,
  `| Form workflows (on validate, on success, field rules) | ${wfByKind.form || 0} | ${wfPorted} |`,
  `| Scheduled workflows | ${wfByKind.schedule || 0} | 0 |`,
  `| Report-button functions | ${wfByKind.functions || 0} | 0 |`, '',
  '> [!INFO] What "Ported" means',
  `> The function's logic runs in its module, ${tick('server/modules/<module>/apis.mjs')}, against the app's database. Zoho Books calls need the Books client configured (see ${tick('.env.example')}); CMS calls are not connected, so those parts are skipped.`, '',
  '## Deluge functions', '',
  '| Function | Custom API | Used by | Status | Source |', '|---|---|---|---|---|',
  ...fnRows.map((r) => `| ${tick(r.name)} | ${apiOfFn[r.name] ? tick(apiOfFn[r.name]) : '—'} | ${(fnSections[r.name] || []).join(', ') || '—'} | ${statusOf(r.name)} | ${tick('zoho-export/parsed/' + r.file)} |`), '',
  '## Custom APIs the widgets call', '',
  '| Custom API | Deluge function | Status |', '|---|---|---|',
  ...Object.entries(apiToFn).sort().map(([api, fn]) => `| ${tick(api)} | ${tick(fn)} | ${ported.has(api) ? 'Ported' : 'Not ported yet'} |`), '',
  '## Workflows', '',
  `${wfPorted} of the ${wfByKind.form || 0} form workflows run in the app (the ported ones are listed in ${tick('server/modules/<module>/ported.json')}); another ${wfNoPortNeeded} need no port (they only drive Zoho's own forms, are inactive, or have no script). Schedules and report-button functions are not ported yet. All are listed per form in ${tick('zoho-export/parsed/workflows.json')} and per section in ${tick('modules/<Section>/README.md')}.`, '',
];
const obsidianDir = path.join(ROOT, 'vault', 'Deluge Scripts (Obsidian)');
if (fs.existsSync(obsidianDir)) fs.writeFileSync(path.join(obsidianDir, '00 - Port Status.md'), lines.join('\n'));
