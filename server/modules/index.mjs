// Finds every module in server/modules/<name>/ and loads it, so nobody has to edit a shared list when a module grows.
// A module is a folder with an index.mjs whose default export is:
//   { label, forms, functions, apis }
//     label      the section's name in the app's dropdown
//     forms      the Zoho forms that belong to it (used by Port Status and the Port Checklist)
//     functions  custom API name -> the Deluge function it runs
//     apis       custom API name -> handler (payload, data, ctx); built with withPlaceholders()
// Importing a module also registers its workflow hooks (see server/workflows/index.mjs).
// A folder whose name starts with "_" is skipped. The same custom API name in two modules is an error.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = import.meta.dirname;
export const modules = [];
export const customApis = {};

for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory() || entry.name.startsWith('_') || !fs.existsSync(path.join(dir, entry.name, 'index.mjs'))) continue;
  const { default: mod } = await import(pathToFileURL(path.join(dir, entry.name, 'index.mjs')).href);
  modules.push({ id: entry.name, ...mod });
  for (const [name, handler] of Object.entries(mod.apis || {})) {
    if (name in customApis) throw new Error(`Custom API "${name}" is defined by two modules (second one: ${entry.name}).`);
    customApis[name] = handler;
  }
}
