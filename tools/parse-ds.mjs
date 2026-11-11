// Parse a Zoho Creator .ds export into JSON specs + one file per Deluge script,
// so every form, report, workflow and function can be ported outside Zoho.
//
//   node tools/parse-ds.mjs [in.ds] [outDir]
//   defaults: zoho-export/Supply_Chain_App.ds -> zoho-export/parsed
import fs from 'node:fs';
import path from 'node:path';

const [, , inFile = 'zoho-export/Supply_Chain_App.ds', outDir = 'zoho-export/parsed'] = process.argv;
const src = fs.readFileSync(inFile, 'utf8').replace(/\r\n/g, '\n');
const BS = '\\';

// ---------- line numbers ----------
const nl = [];
for (let i = 0; i < src.length; i++) if (src[i] === '\n') nl.push(i);
const lineOf = (idx) => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < idx) lo = m + 1; else hi = m; } return lo + 1; };

// ---------- lexer helpers (skip strings and comments) ----------
// Returns index just past a string/comment starting at i, or -1 if none starts there.
function skipOpaque(s, i) {
  const ch = s[i], nx = s[i + 1];
  if (ch === '"') { i++; while (i < s.length && s[i] !== '"') i += s[i] === BS ? 2 : 1; return i + 1; }
  if (ch === '/' && nx === '/') { while (i < s.length && s[i] !== '\n') i++; return i; }
  if (ch === '/' && nx === '*') { const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2; }
  return -1;
}
const lastLine = (t) => (t.split('\n').map((x) => x.trim()).filter(Boolean).pop() || '');

// ---------- structural tree: { blocks } only, braces inside ( ) are not structure ----------
function buildTree(s, base = 0) {
  const root = { head: '(root)', open: -1, close: s.length, children: [] };
  const stack = [root];
  let paren = 0, segStart = 0;
  for (let i = 0; i < s.length;) {
    const j = skipOpaque(s, i);
    if (j >= 0) { i = j; continue; }
    const ch = s[i];
    if (ch === '(') paren++;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    else if (paren === 0 && ch === '{') {
      const node = { head: lastLine(s.slice(segStart, i)), open: i, line: lineOf(base + i), children: [] };
      stack[stack.length - 1].children.push(node); stack.push(node); segStart = i + 1;
    } else if (paren === 0 && ch === '}') {
      const node = stack.pop(); node.close = i; node.endLine = lineOf(base + i); segStart = i + 1;
    } else if (paren === 0 && ch === ';') segStart = i + 1;
    i++;
  }
  return root;
}
const body = (n) => src.slice(n.open + 1, n.close);

// Top-level "( ... )" groups of a text: [{ header, inner }]. Header = last line before '('.
function parenGroups(t) {
  const out = []; let brace = 0, segStart = 0;
  for (let i = 0; i < t.length;) {
    const j = skipOpaque(t, i);
    if (j >= 0) { i = j; continue; }
    const ch = t[i];
    if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (ch === ')') segStart = i + 1;
    else if (ch === '(' && brace === 0) {
      let d = 1, k = i + 1;
      while (k < t.length && d > 0) { const q = skipOpaque(t, k); if (q >= 0) { k = q; continue; } if (t[k] === '(') d++; else if (t[k] === ')') d--; k++; }
      out.push({ header: lastLine(t.slice(segStart, i)), inner: t.slice(i + 1, k - 1), at: i });
      i = k; segStart = k; continue;
    }
    i++;
  }
  return out;
}

// Text with all nested (...) and {...} removed -> only this level's "key = value" lines.
function topLevel(t) {
  let out = '', d = 0;
  for (let i = 0; i < t.length;) {
    const j = skipOpaque(t, i);
    if (j >= 0) { if (d === 0) out += t.slice(i, j); i = j; continue; }
    const ch = t[i];
    if (ch === '(' || ch === '{') { if (d === 0 && ch === '{') { /* keep inline {..} values below */ } d++; }
    if (d === 0) out += ch;
    if (ch === ')' || ch === '}') d--;
    i++;
  }
  return out;
}
function props(t) {
  const p = {};
  // inline brace values like  values = {"a","b"}  live at this level too
  const re = /^[ \t]*([A-Za-z_][\w ]*?)\s*=\s*(.+)$/gm;
  // "description [ type = help_text  message = ... ]" is a tooltip, not the field's own props
  let help;
  const flat = t.replace(/^[ \t]*description\s*\[([^\]]*)\]/m, (_, inner) => { help = (inner.match(/message\s*=\s*"((?:[^"\\]|\\.)*)"/) || [])[1]; return ''; })
    .replace(/\{[^{}]*\}/g, (m) => m.replace(/\n/g, ' '));
  if (help) p.helpText = help;
  for (const m of topLevel(flat).matchAll(re)) p[m[1].trim()] = unq(m[2].trim());
  for (const m of flat.matchAll(/^[ \t]*(values)\s*=\s*(\{[^{}]*\})/gm)) p.values = parseList(m[2]);
  return p;
}
const unq = (v) => (/^".*"$/s.test(v) ? v.slice(1, -1).replace(/\\"/g, '"') : v);
const parseList = (v) => [...v.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));

// ---------- locate sections ----------
const tree = buildTree(src);
const app = tree.children.find((n) => n.head.startsWith('application'));
const sec = Object.fromEntries(app.children.map((n) => [n.head.trim(), n]));
const out = {};
const write = (rel, data) => {
  const f = path.join(outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};
fs.rmSync(outDir, { recursive: true, force: true });
const safe = (s) => s.replace(/[^\w.-]+/g, '_');
const dedent = (code) => {
  const lines = code.replace(/^\n+|\s+$/g, '').split('\n');
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length));
  return lines.map((l) => l.replace(/\t/g, '    ').slice(ind)).join('\n') + '\n';
};

// ---------- forms ----------
function fields(t) {
  return parenGroups(t).filter((g) => /^((must have|unique|private)\s+)*\w+$/.test(g.header)).map((g) => {
    const mods = g.header.split(/\s+/).slice(0, -1).join(' ');
    const required = mods.includes('must have');
    const name = g.header.split(/\s+/).pop();
    const p = props(g.inner);
    const f = { name, label: p.displayname || name.replace(/_/g, ' '), type: p.type, required };
    if (Array.isArray(p.values)) f.options = p.values;
    else if (typeof p.values === 'string') {
      const m = p.values.match(/^(\w+)(\[(.*)\])?\.(\w+)$/);
      f.lookup = m ? { form: m[1], criteria: m[3] || null, field: m[4] } : p.values;
    }
    for (const k of ['helpText', 'initial value', 'maxchar', 'format', 'visibility', 'personal data', 'file count', 'alloweddays', 'displayformat'])
      if (p[k] !== undefined) f[k.replace(/ (\w)/g, (_, c) => c.toUpperCase())] = p[k];
    if (mods.includes('unique')) f.unique = true;
    const sub = fields(g.inner); // grid (subform) columns, or parts of name/address fields
    if (sub.length) f.fields = sub;
    return f;
  });
}
out.forms = sec.forms.children.filter((n) => /^form\s+\w+/.test(n.head)).map((n) => {
  const b = body(n), p = props(b);
  return { name: n.head.split(/\s+/)[1], label: p.displayname || n.head.split(/\s+/)[1].replace(/_/g, ' '), successMessage: p['success message'], line: n.line, fields: fields(b) };
});
for (const f of out.forms) write(`forms/${f.name}.json`, f);

// ---------- reports ----------
out.reports = sec.reports.children.map((n) => {
  const b = body(n);
  const m = n.head.match(/^(default\s+)?(\w+)\s+(\w+)/) || [];
  const from = b.match(/show all rows from\s+(\w+)\s*(\[([^\n]*)\])?/);
  const g = parenGroups(b).find((x) => /show all rows from/.test(x.header));
  const columns = g ? g.inner.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.match(/^([\w.]+)(?:\s+as\s+"(.*)")?$/); return c ? { field: c[1], label: c[2] || c[1].replace(/_/g, ' ') } : { raw: l };
  }) : [];
  const sub = buildTree(b).children.map((c) => c.head);
  const rep = { name: m[3], type: m[2], isDefault: !!m[1], label: props(b).displayName || props(b).displayname, form: from?.[1], criteria: from?.[3] || null, columns, blocks: sub, line: n.line };
  write(`reports/${rep.name}.ds`, b);
  return rep;
});

// ---------- pages ----------
out.pages = sec.pages.children.map((n) => {
  const m = n.head.match(/^page\s+(\w+)\s*(\((.*)\))?/);
  const b = body(n), p = props(b);
  const content = (b.match(/Content\s*=\s*("(?:[^"\\]|\\.)*")/s) || [])[1];
  const zml = content ? JSON.parse(content) : '';
  return { name: m[1], params: m[3] || '', label: p.displayname, widgets: [...zml.matchAll(/<widgets[^>]*>/g)].map((w) => w[0]), zml, line: n.line };
});

// ---------- functions (Deluge namespaces) ----------
out.functions = [];
for (const ns of sec.functions.children) for (const fn of ns.children) {
  const m = fn.head.match(/^(\w+)\s+(\w+)\s*\((.*)\)\s*$/);
  if (!m) continue;
  const code = body(fn);
  const rec = { namespace: ns.head, returns: m[1], name: m[2], params: m[3], line: fn.line, endLine: fn.endLine, file: `functions/${m[2]}.dg` };
  write(rec.file, `// ${m[1]} ${m[2]}(${m[3]})   [.ds lines ${fn.line}-${fn.endLine}]\n` + dedent(code));
  out.functions.push(rec);
}

// ---------- workflows: form workflows, schedules, action-button functions ----------
out.workflows = [];
for (const kind of sec.workflow.children) for (const wf of kind.children) {
  const hm = wf.head.match(/^(\w+)(?:\s+as\s+"(.*)")?/);
  const b = body(wf), p = props(b);
  const events = [];
  const visit = (node, trail) => {
    const tb = body(node);
    const label = (extra) => [...trail, extra].filter((x) => x && x !== 'actions' && x !== 'custom deluge script').join(' > ');
    const groups = parenGroups(topLevelBraces(tb)).filter((g) => g.inner.trim() && !(/^\w+$/.test(g.header) && !/^on\b/.test(g.header)));
    for (const g of groups) events.push({ event: label(g.header), code: dedent(g.inner) });
    // Declarative actions with no script, e.g. field rules: "disable A,B;" / "hide C;"
    if (!groups.length && !node.children.length && tb.trim()) events.push({ event: label(''), code: dedent(tb) });
    for (const c of node.children) visit(c, [...trail, c.head]);
  };
  for (const c of wf.children) visit(c, [c.head]);
  const rec = {
    kind: kind.head.trim(), name: hm[1], label: hm[2] || hm[1], form: p.form || null, recordEvent: p['record event'] || null,
    type: p.type, status: p.status || 'active', schedule: p.frequency ? { start: p.start, frequency: p.frequency, timeZone: p['time zone'] } : undefined,
    executionType: p['execution type'], line: wf.line, events: events.map((e, i) => ({ event: e.event, file: `workflows/${safe(kind.head.trim())}/${safe(p.form || '_')}/${hm[1]}${events.length > 1 ? '__' + (i + 1) : ''}.dg` })),
  };
  events.forEach((e, i) => write(rec.events[i].file, `// ${rec.kind}: ${rec.label}  form=${rec.form} event=${rec.recordEvent || ''} ${e.event}  [.ds line ${wf.line}]\n` + e.code));
  out.workflows.push(rec);
}
// Code groups sit directly in an event block's body, but structural {} children are visited separately.
function topLevelBraces(t) {
  let out = '', d = 0;
  for (let i = 0; i < t.length;) {
    const j = skipOpaque(t, i);
    if (j >= 0) { if (d === 0) out += t.slice(i, j); i = j; continue; }
    const ch = t[i];
    if (ch === '(') { // copy whole paren group verbatim
      let pd = 1, k = i + 1;
      while (k < t.length && pd > 0) { const q = skipOpaque(t, k); if (q >= 0) { k = q; continue; } if (t[k] === '(') pd++; else if (t[k] === ')') pd--; k++; }
      if (d === 0) out += t.slice(i, k); i = k; continue;
    }
    if (ch === '{') d++;
    if (d === 0) out += ch;
    if (ch === '}') d--;
    i++;
  }
  return out;
}

// ---------- navigation menu (sections -> tabs) + raw dumps ----------
const toTree = (n, depth = 0) => ({ head: n.head, ...(depth < 6 && n.children.length ? { children: n.children.map((c) => toTree(c, depth + 1)) } : {}) });
const web = sec.web;
const menu = web?.children.find((c) => c.head === 'menu');
if (menu) write('menu.json', toTree(menu));
for (const k of ['share_settings', 'connections', 'web', 'phone', 'tablet', 'translation']) if (sec[k]) write(`raw/${k}.ds`, body(sec[k]));

// ---------- cross references ----------
const reportsByForm = {}, wfByForm = {};
for (const r of out.reports) (reportsByForm[r.form] ||= []).push(r.name);
for (const w of out.workflows) (wfByForm[w.form || '(none)'] ||= []).push(w.name);
const fnRefs = {};
for (const f of out.functions) {
  const code = fs.readFileSync(path.join(outDir, f.file), 'utf8');
  f.formsUsed = out.forms.map((x) => x.name).filter((n) => new RegExp(`\\b${n}\\s*\\[|insert into\\s+${n}\\b`).test(code));
  f.calls = [...new Set([...code.matchAll(/thisapp\.(\w+)\s*\(/g)].map((m) => m[1]))];
  for (const n of f.formsUsed) (fnRefs[n] ||= []).push(f.name);
}
out.forms.forEach((f) => Object.assign(f, { reports: reportsByForm[f.name] || [], workflows: wfByForm[f.name] || [], usedByFunctions: fnRefs[f.name] || [] }));

// Which widgets (already extracted UI) touch which forms/reports/functions.
const names = new Set([...out.forms, ...out.reports, ...out.functions].map((x) => x.name));
const widgetMap = {};
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
for (const file of walk('modules').filter((f) => /\.(js|html)$/.test(f))) {
  const code = fs.readFileSync(file, 'utf8');
  const hits = [...new Set([...code.matchAll(/["'`](\w+)["'`]/g)].map((m) => m[1]).filter((n) => names.has(n)))];
  const apis = [...code.matchAll(/ZOHO\.CREATOR\.(?:DATA|API)\.(\w+)/g)].reduce((a, m) => ((a[m[1]] = (a[m[1]] || 0) + 1), a), {});
  if (hits.length || Object.keys(apis).length) widgetMap[file.replace(/\\/g, '/')] = { references: hits.sort(), apiCalls: apis };
}

write('forms.json', out.forms.map(({ fields: fs_, ...f }) => ({ ...f, fieldCount: fs_.length })));
write('reports.json', out.reports);
write('pages.json', out.pages);
write('functions.json', out.functions);
write('workflows.json', out.workflows);
write('widget-map.json', widgetMap);

// ---------- human index ----------
const wfKinds = out.workflows.reduce((a, w) => ((a[w.kind] = (a[w.kind] || 0) + 1), a), {});
let md = `# ${app.head.replace(/^application\s+/, '').replace(/"/g, '')} — parsed from ${path.basename(inFile)}\n\n`;
md += `| Part | Count |\n|---|---|\n| Forms | ${out.forms.length} |\n| Fields | ${out.forms.reduce((a, f) => a + f.fields.length, 0)} |\n| Reports | ${out.reports.length} |\n| Pages | ${out.pages.length} |\n| Deluge functions | ${out.functions.length} |\n`;
for (const [k, v] of Object.entries(wfKinds)) md += `| Workflows: ${k} | ${v} |\n`;
md += `| Widget files mapped | ${Object.keys(widgetMap).length} |\n\n## Forms\n\n| Form | Fields | Reports | Workflows | Used by functions |\n|---|---|---|---|---|\n`;
for (const f of out.forms) md += `| ${f.name} | ${f.fields.length} | ${f.reports.length} | ${f.workflows.length} | ${f.usedByFunctions.length} |\n`;
md += `\n## Functions\n\n| Function | Returns | Params | Forms used |\n|---|---|---|---|\n`;
for (const f of out.functions) md += `| [${f.name}](${f.file}) | ${f.returns} | ${f.params.replace(/\|/g, '/')} | ${f.formsUsed.join(', ')} |\n`;
md += `\n## Workflows\n\n| Kind | Name | Form | Trigger | Status | Scripts |\n|---|---|---|---|---|---|\n`;
for (const w of out.workflows) md += `| ${w.kind} | ${w.label} | ${w.form || ''} | ${w.recordEvent || w.schedule?.frequency || w.executionType || ''} | ${w.status} | ${w.events.map((e) => `[${e.event || 'script'}](${e.file})`).join('<br>')} |\n`;
write('INDEX.md', md);

console.log(`forms ${out.forms.length}, reports ${out.reports.length}, pages ${out.pages.length}, functions ${out.functions.length}, workflows ${out.workflows.length} (${JSON.stringify(wfKinds)}), widget files ${Object.keys(widgetMap).length}`);
console.log(`scripts written: ${out.workflows.reduce((a, w) => a + w.events.length, 0)} workflow + ${out.functions.length} function -> ${outDir}`);
