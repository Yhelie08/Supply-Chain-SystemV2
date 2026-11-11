// Parity with the live Creator app. src/live-spec.js lists, page by page, the inner tabs, stat cards and buttons the
// live page has. This opens every page that has been built and checks each of those is on our page.
//
// What is missing today is recorded in ui-tests/parity-baseline.json, so the suite stays green while the pages are
// brought up to the live ones, and it is a ratchet in both directions:
//   - something that was present goes missing   -> the test fails (a regression)
//   - something missing is now present          -> the test fails until it is removed from the baseline
// To rewrite the baseline after fixing a page:  UPDATE_PARITY=1 npm run test:ui
// A page marked "placeholder" in the spec must render the "Not built yet" page, and a built one must not.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../src/App.jsx';
import { ALL_PAGES, SECTIONS } from '../src/live-spec.js';

const BASELINE_FILE = path.resolve(__dirname, 'parity-baseline.json');
const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
const update = !!process.env.UPDATE_PARITY;
const written = {};

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

const norm = (s) => s.replace(/^\+\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
const wanted = (p) => [
  ...p.tabs.map((t) => ['tab', t]),
  ...p.stats.map((t) => ['stat card', t]),
  ...p.buttons.map((t) => ['button', t]),
];

describe('live spec', () => {
  it('lists six sections and 42 page tabs', () => {
    expect(SECTIONS.length).toBe(6);
    expect(SECTIONS.reduce((n, s) => n + s.pages.length, 0)).toBe(42);
  });

  it('every page has a name, a path and a one-line description', () => {
    for (const p of ALL_PAGES) {
      expect(p.label && p.path && p.blurb, p.path).toBeTruthy();
      expect(['built', 'partial', 'placeholder']).toContain(p.status);
    }
    expect(new Set(ALL_PAGES.map((p) => p.path)).size).toBe(ALL_PAGES.length);
  });
});

describe('page parity', () => {
  const real = ALL_PAGES.filter((p) => p.status !== 'placeholder');
  const placeholders = ALL_PAGES.filter((p) => p.status === 'placeholder');

  for (const p of real) {
    it(`${p.section.label} / ${p.label}`, async () => {
      window.location.hash = '#/' + p.path;
      render(<App />);
      await screen.findByRole('heading', { level: 1 });
      const main = document.querySelector('main');
      expect(main.querySelector('[data-placeholder]'), 'built page must not be the Not built yet page').toBeNull();
      const text = norm(main.textContent);
      const missing = wanted(p).filter(([, t]) => !text.includes(norm(t))).map(([kind, t]) => `${kind}: ${t}`);
      written[p.path] = missing;
      if (update) return;
      expect(missing, `Missing from ${p.label} (see ui-tests/parity-baseline.json). Fixed something? Run UPDATE_PARITY=1 npm run test:ui`).toEqual(baseline[p.path] || []);
    });
  }

  for (const p of placeholders) {
    it(`${p.section.label} / ${p.label} is a labelled placeholder`, async () => {
      window.location.hash = '#/' + p.path;
      render(<App />);
      await screen.findByRole('heading', { level: 1 });
      const main = document.querySelector('main');
      expect(main.querySelector('[data-placeholder]'), 'placeholder page').not.toBeNull();
      expect(main.textContent).toMatch(/Not built yet/);
    });
  }

  it('summary', () => {
    if (update) {
      const ordered = Object.fromEntries(Object.entries(written).filter(([, v]) => v.length).sort(([a], [b]) => a.localeCompare(b)));
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(ordered, null, 2) + '\n');
    }
    const built = real.length;
    const open = Object.values(update ? written : baseline).reduce((n, v) => n + v.length, 0);
    // Printed so the size of the remaining work is visible in every run.
    console.log(`Parity: ${built} pages built or partial, ${placeholders.length} placeholders, ${open} live items still missing from built pages.`);
    expect(built + placeholders.length).toBe(ALL_PAGES.length);
  });
});
