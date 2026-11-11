// The Procurement menu, the Forecast Setting page and the Procurement Dashboard, with real clicks.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import { SECTIONS } from '../src/nav.js';
import Placeholder from '../src/pages/Placeholder.jsx';

const KEY = 'supply-chain-v2:db';
const saved = () => JSON.parse(localStorage.getItem(KEY));

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });
afterEach(cleanup);

const pages = () => within(screen.getByRole('navigation', { name: 'Pages' }));
const tabText = (p) => p.short || p.label;

describe('Top bar and section dropdown', () => {
  it('opens on the Analytic section, like the live app', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /Analytic/ })).toBeTruthy();
    expect(pages().getAllByRole('link').map((a) => a.textContent)).toEqual(['Supply Chain Analytic']);
  });

  it('the dropdown lists the six sections in the live order, all open', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Analytic/ }));
    const items = within(screen.getByRole('menu', { name: 'Sections' })).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Analytic', 'Procurement', 'Tony Fan', 'Fenteng Lighting', 'Fulfillment', 'Delivery Management']);
    expect(items.some((i) => i.getAttribute('aria-disabled') === 'true')).toBe(false);
    expect(items[0].className).toContain('on');
  });

  it('every section shows exactly the page tabs the live app has, in order', async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const section of SECTIONS) {
      await user.click(screen.getAllByRole('button').find((b) => b.classList.contains('section-btn')));
      await user.click(screen.getByRole('menuitem', { name: section.label }));
      expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
      expect(screen.getByRole('button', { name: new RegExp(section.label) })).toBeTruthy();
      expect(pages().getAllByRole('link').map((a) => a.textContent)).toEqual(section.pages.map(tabText));
      expect(screen.queryByRole('menu')).toBeNull();
    }
  });

  it('the live app has 42 page tabs across the six sections', () => {
    expect(SECTIONS.map((s) => s.pages.length)).toEqual([1, 9, 5, 5, 10, 12]);
    expect(SECTIONS.reduce((n, s) => n + s.pages.length, 0)).toBe(42);
  });

  it('closes with Escape and when clicking away', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Analytic/ }));
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Analytic/ }));
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a deep link lands on the right section, with its tab active', () => {
    window.location.hash = '#/procurement/inquiry';
    render(<App />);
    expect(screen.getByRole('button', { name: /Procurement/ })).toBeTruthy();
    const active = pages().getByRole('link', { name: 'Inquiry List' });
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(active.className).toContain('active');
  });

  it('Rules and Activity are one click away in the top bar, under Reference', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Reference' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Rules/ })).toBeTruthy();
    expect(pages().getAllByRole('link').map((a) => a.textContent)).toEqual(['Rules', 'Activity']);
  });
});

describe('Every tab opens its own page', () => {
  for (const section of SECTIONS) {
    it(`${section.label}: each tab opens, is marked active and shows a heading`, async () => {
      const user = userEvent.setup();
      window.location.hash = '#/' + section.pages[0].path;
      render(<App />);
      for (const p of section.pages) {
        await user.click(pages().getByRole('link', { name: tabText(p) }));
        expect(await screen.findByRole('heading', { level: 1, name: p.title || (p.status === 'placeholder' ? p.label : /./) })).toBeTruthy();
        expect(pages().getByRole('link', { name: tabText(p) }).getAttribute('aria-current')).toBe('page');
        expect(window.location.hash).toBe('#/' + p.path);
      }
    });
  }

  it('every tab of the live app is now built; the placeholder page still says so for any tab added later', () => {
    expect(SECTIONS.flatMap((s) => s.pages).filter((p) => p.status === 'placeholder')).toHaveLength(0);
    render(<Placeholder spec={{ label: 'Future Tab', blurb: 'Soon.', tabs: ['One'], stats: ['Two'], buttons: ['Three'] }} />);
    expect(screen.getByRole('note').textContent).toMatch(/Not built yet/);
    expect(screen.getByText('Two', { selector: 'li' })).toBeTruthy();
  });

  it('the live names are used: Order Readiness, Pack & QC, To Ship, Service Appointment', () => {
    const names = SECTIONS.flatMap((s) => s.pages.map(tabText));
    for (const n of ['Order Readiness', 'Pack & QC', 'To Ship', 'Service Appointment', 'DMS Exception Queue', 'Daily Team Availability']) expect(names).toContain(n);
    for (const old of ['Readiness Gate', 'Pack', 'QC Checklist', 'Order Aggregation', 'Appointments', 'Exception Queue', 'Teams & Capacity']) expect(names).not.toContain(old);
  });
});

describe('Notification bell', () => {
  it('counts what happened since it was last opened, and clears when opened', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/fulfillment/pick';
    render(<App />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    // taking a workflow step adds a line to the audit log, which the bell counts
    await user.click(screen.getAllByRole('button', { name: 'Mark as Picked' })[0]);
    expect(screen.getByRole('button', { name: 'Notifications, 1 new' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    const panel = screen.getByRole('region', { name: 'Notifications' });
    expect(within(panel).getAllByRole('listitem')[0].textContent).toMatch(/pick/i);
    expect(within(panel).getByRole('link', { name: 'See all activity' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });
});

describe('Forecast Setting', () => {
  const open = async (user) => {
    window.location.hash = '#/procurement/forecast';
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Procurement to Delivery Forecast' });
  };

  it('shows the tiles and the weekly volume chart by default', async () => {
    const user = userEvent.setup();
    await open(user);
    expect(screen.getByText('Open orders')).toBeTruthy();
    expect(screen.getAllByText('Will miss').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Orders arriving per week/ })).toBeTruthy();
  });

  it('lists each order with its window and explains how the date was built', async () => {
    const user = userEvent.setup();
    await open(user);
    await user.click(screen.getByRole('tab', { name: 'Forecast' }));
    for (const h of ['Earliest', 'Likely', 'Latest', 'Client expects', 'Early / late']) expect(screen.getByRole('columnheader', { name: h })).toBeTruthy();
    const row = screen.getAllByRole('row').find((r) => r.textContent.includes('PR-00002'));
    await user.click(row);
    expect(await screen.findByText('How this date was built')).toBeTruthy();
    expect(screen.getByText(/LCL transit/)).toBeTruthy();
  });

  it('filters by status and searches', async () => {
    const user = userEvent.setup();
    await open(user);
    await user.click(screen.getByRole('tab', { name: 'Forecast' }));
    const all = screen.getAllByRole('row').length - 1;
    await user.selectOptions(screen.getByLabelText('Status filter'), 'miss');
    const miss = screen.getAllByRole('row').length - 1;
    expect(miss).toBeGreaterThan(0);
    expect(miss).toBeLessThan(all);
    await user.selectOptions(screen.getByLabelText('Status filter'), 'all');
    await user.type(screen.getByLabelText('Search forecast'), 'PR-00004');
    expect(screen.getAllByRole('row').slice(1).every((r) => r.textContent.includes('PR-00004'))).toBe(true);
  });

  it('saves edited lead times, which change the forecast', async () => {
    const user = userEvent.setup();
    await open(user);
    await user.click(screen.getByRole('tab', { name: 'Forecast Settings' }));
    const min = screen.getByLabelText('LCL Transit: min');
    const max = screen.getByLabelText('LCL Transit: max');
    expect(min.value).toBe('35');
    await user.clear(min); await user.type(min, '20');
    await user.clear(max); await user.type(max, '30');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(saved().settings.forecast.fc_lcl_transit_min).toBe(20);
    expect(saved().settings.forecast.fc_lcl_transit_max).toBe(30);
    expect(screen.getByText(/These are your saved settings./)).toBeTruthy();
  });

  it('refuses a minimum above its maximum and keeps the old settings', async () => {
    const user = userEvent.setup();
    await open(user);
    await user.click(screen.getByRole('tab', { name: 'Forecast Settings' }));
    const min = screen.getByLabelText('Air Freight Transit: min');
    await user.clear(min); await user.type(min, '99');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText(/minimum cannot be above the maximum/)).toBeTruthy();
    expect(saved().settings.forecast).toEqual({});
  });

  it('resets to the defaults', async () => {
    const user = userEvent.setup();
    await open(user);
    await user.click(screen.getByRole('tab', { name: 'Forecast Settings' }));
    const prep = screen.getByLabelText('Warehouse Preparation thru QC: max');
    await user.clear(prep); await user.type(prep, '12');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(saved().settings.forecast.fc_prep_max).toBe(12);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(saved().settings.forecast).toEqual({});
    expect(screen.getByLabelText('Warehouse Preparation thru QC: max').value).toBe('7');
  });

  it('turning re-anchoring off is saved as a setting', async () => {
    const user = userEvent.setup();
    await open(user);
    await user.click(screen.getByRole('tab', { name: 'Forecast Settings' }));
    await user.click(screen.getByLabelText(/Re-anchor on the latest real event/));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(saved().settings.forecast.fc_reanchor).toBe(0);
  });
});

describe('Procurement Dashboard', () => {
  const open = async (user) => {
    window.location.hash = '#/procurement/dashboard';
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Procurement Overview' });
  };

  it('shows the eight KPI cards from the live widget', async () => {
    const user = userEvent.setup();
    await open(user);
    for (const label of ['Purchase Requests', 'Active Purchase Orders', 'Open Exceptions', 'Open Inquiries', 'Shipments In Transit', 'Pending Receiving', 'Open Replacement Requests', 'Total Suppliers']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('the Purchase Requests number matches the PR page', async () => {
    const user = userEvent.setup();
    await open(user);
    const card = screen.getAllByText('Purchase Requests').map((e) => e.closest('.kpi')).find(Boolean);
    expect(card.querySelector('.stat-value').textContent).toBe(String(saved().prs.length));
  });

  it('has Overview, Analytics and Suppliers sections', async () => {
    const user = userEvent.setup();
    await open(user);
    for (const name of ['Overview', 'Analytics', 'Suppliers']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Analytics' })).toBeTruthy();
    expect(screen.getByText('Top Suppliers by Spend')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Active lines' })).toBeTruthy();
  });

  it('searches the recent activity', async () => {
    const user = userEvent.setup();
    await open(user);
    const before = screen.getAllByRole('listitem').length;
    await user.type(screen.getByLabelText('Search activity'), 'zzz-no-such-thing');
    expect(await screen.findByText('No activity matches.')).toBeTruthy();
    expect(before).toBeGreaterThan(0);
  });
});
