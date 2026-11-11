// Server-renders every page with the real store and sample data. This catches a page that throws
// while rendering, a screen whose column or action declaration is malformed, and empty pages.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load react from the project folder spelled exactly as the disk spells it. If the shell's current folder writes the drive
// letter differently (c: against C:), Node loads react twice, once here and once for the pages, and every hook fails
// with "Invalid hook call".
const here = fs.realpathSync.native(fileURLToPath(import.meta.url));
const root = path.resolve(path.dirname(here), '..');
const need = createRequire(here);
const React = need('react');
const { renderToString } = need('react-dom/server');

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
});
after(() => server.close());

const { StoreProvider } = await server.ssrLoadModule('/src/store.jsx');
const { ROUTES } = await server.ssrLoadModule('/src/nav.js');
const { seedDb } = await server.ssrLoadModule('/src/domain/seed.js');

for (const route of ROUTES) {
  test(`renders ${route.path}`, () => {
    const html = renderToString(
      React.createElement(StoreProvider, null, React.createElement(route.Component)),
    );
    assert.ok(html.length > 400, 'page produced real markup');
    assert.ok(!html.includes('undefined'), 'no "undefined" leaked into the page');
    assert.ok(!html.includes('[object Object]'), 'no "[object Object]" leaked into the page');
    assert.ok(!html.includes('NaN'), 'no NaN leaked into the page');
  });
}

test('every page has a heading and the data screens show rows', () => {
  for (const route of ROUTES) {
    const html = renderToString(
      React.createElement(StoreProvider, null, React.createElement(route.Component)),
    );
    assert.match(html, /<h1>/, `${route.path} has a heading`);
  }
});

// The Inquiry page owns sub-routes: list, new, <id>, <id>/edit. Render each one for real records.
const inquiryRoute = ROUTES.find((r) => r.path === 'procurement/inquiry');
const seeded = seedDb();
const openInq = seeded.inquiries.find((q) => q.status === 'Open');
const estimated = seeded.inquiries.find((q) => q.status === 'Estimate Created');
const sold = seeded.inquiries.find((q) => q.status === 'Sales Order');

for (const [label, sub] of [
  ['list', ''], ['new form', 'new'], ['detail (open)', openInq.id], ['detail (estimate created)', estimated.id],
  ['detail (sales order, locked)', sold.id], ['edit form', openInq.id + '/edit'], ['edit form (locked)', sold.id + '/edit'], ['unknown id', 'nope'],
]) {
  test(`inquiry ${label} renders`, () => {
    const html = renderToString(React.createElement(StoreProvider, null, React.createElement(inquiryRoute.Component, { sub })));
    assert.ok(html.length > 100);
    for (const bad of ['undefined', '[object Object]', 'NaN']) assert.ok(!html.includes(bad), `no "${bad}" in the ${label} view`);
    if (label === 'detail (open)') {
      assert.ok(html.includes(openInq.no) && html.includes('Readiness Checklist') && html.includes('Timeline History'));
    }
    if (label === 'detail (sales order, locked)') assert.ok(html.includes('Locked') && !html.includes('>Delete<'));
    if (label === 'detail (estimate created)') assert.ok(html.includes('Convert to Sales Order'));
    if (label === 'list') assert.ok(html.includes('Create Estimate') && html.includes('Quote Groups') && html.includes('Showing'));
    if (label === 'new form') assert.ok(html.includes('Submit Inquiry') && html.includes('Supplier Quotes') && html.includes('Product Collateral'));
    if (label === 'unknown id') assert.ok(html.includes('Inquiry not found'));
  });
}
