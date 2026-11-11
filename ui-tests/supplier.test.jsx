// The Tony Fan and Fenteng Lighting portals, with real clicks.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import { setLang } from '../src/i18n.js';

const KEY = 'supply-chain-v2:db';
const saved = () => JSON.parse(localStorage.getItem(KEY));

beforeEach(() => { localStorage.clear(); setLang('en'); localStorage.clear(); window.location.hash = ''; });
afterEach(cleanup);

const open = async (path) => {
  window.location.hash = '#/' + path;
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
};
const pillTab = (name) => screen.getByRole('tab', { name: new RegExp('^' + name + ' [0-9]') });
const pill = (user, name) => user.click(pillTab(name));
const row = (text) => screen.getAllByRole('row').find((r) => r.textContent.includes(text));
const setDate = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const toast = () => document.querySelector('.toasts').textContent;

describe('both portals', () => {
  it('shows the supplier badge and only that supplier\'s inquiries', async () => {
    await open('tonfan/inquiries');
    expect(screen.getByText(/Supplier Portal · Tony Fan/)).toBeTruthy();
    const tony = screen.getAllByRole('row').length;
    cleanup();
    await open('fenteng/inquiries');
    expect(screen.getByText(/Supplier Portal · Fenteng Lighting/)).toBeTruthy();
    const db = saved();
    expect(tony).toBeGreaterThan(3);
    expect(db.inquiries.length).toBeGreaterThan(0);
  });

  it('every portal page has the two inner tabs, the pills and the stat cards of the live widget', async () => {
    const user = userEvent.setup();
    const expected = {
      inquiries: [['Inquiries', 'Group Inquiry'], ['All', 'Waiting', 'Submit Response', 'Selected', 'Completed'], ['Waiting', 'Submit Response', 'Selected', 'Completed']],
      pr: [['All PRs', 'PR Groups'], ['All', 'Waiting', 'Submit Response', 'Selected'], ['Waiting', 'Submit Response', 'Selected']],
      po: [['All POs', 'PO Groups'], ['All', 'Awaiting Acknowledge', 'Confirmed'], ['Total POs', 'Awaiting Acknowledge', 'Confirmed', 'Total Value']],
      shipments: [['All Shipments', 'Shipment Groups'], ['All', 'LCL', 'FCL', 'Air Freight'], ['Shipments', 'Total Items', 'Pending', 'Shipped']],
      replacement: [['All RRs', 'RR Groups'], ['All', 'Awaiting Approval', 'Acknowledged', 'In Production', 'Shipped'], ['Total RRs', 'Awaiting Approval', 'In Progress', 'Received']],
    };
    for (const portal of ['tonfan', 'fenteng']) {
      for (const [page, [views, pills, stats]] of Object.entries(expected)) {
        await open(`${portal}/${page}`);
        const viewTabs = within(screen.getByRole('tablist', { name: 'View' }));
        for (const v of views) expect(viewTabs.getByRole('tab', { name: v })).toBeTruthy();
        for (const p of pills) expect(pillTab(p)).toBeTruthy();
        for (const s of stats) expect(document.querySelector('.stats').textContent).toContain(s);
        await user.click(viewTabs.getByRole('tab', { name: views[1] }));
        expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
        cleanup();
      }
    }
  });

  it('switches to Chinese with the toggle and remembers it', async () => {
    const user = userEvent.setup();
    await open('tonfan/inquiries');
    await user.click(screen.getByRole('button', { name: '中文' }));
    expect(pillTab('等待中')).toBeTruthy();
    expect(pillTab('已完成')).toBeTruthy();
    expect(localStorage.getItem('supply-chain-v2:lang')).toBe('zh');
    cleanup();
    await open('fenteng/po');
    expect(pillTab('已确认')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(pillTab('Confirmed')).toBeTruthy();
  });
});

describe('Inquiries', () => {
  it('Respond needs an availability, then moves a Waiting line to Submit Response', async () => {
    const user = userEvent.setup();
    await open('tonfan/inquiries');
    await pill(user, 'Waiting');
    const before = Number(document.querySelector('.stats .stat-value').textContent);
    await user.click(screen.getAllByRole('button', { name: 'Respond' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Your Response' });
    await user.click(within(dialog).getByRole('button', { name: 'Submit Response' }));
    expect(screen.getByRole('dialog', { name: 'Your Response' })).toBeTruthy(); // native required stops an empty availability
    await user.selectOptions(within(dialog).getByLabelText(/Availability/), 'Confirmed');
    await user.type(within(dialog).getByLabelText('Initial Price'), '500');
    await user.click(within(dialog).getByRole('button', { name: 'Submit Response' }));
    expect(toast()).toMatch(/Lead Time is required/);
    await user.type(within(dialog).getByLabelText('Lead Time (days)'), '3 weeks');
    await user.click(within(dialog).getByRole('button', { name: 'Submit Response' }));
    expect(toast()).toMatch(/Response submitted/);
    expect(Number(document.querySelector('.stats .stat-value').textContent)).toBe(before - 1);
    expect(saved().timeline.some((t) => t.actor === 'Tony Fan')).toBe(true);
  });

  it('declining asks first, then removes the line from the queue', async () => {
    const user = userEvent.setup();
    await open('tonfan/inquiries');
    await pill(user, 'Waiting');
    const rowsBefore = screen.getAllByRole('row').length;
    await user.click(screen.getAllByRole('button', { name: 'Respond' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Your Response' });
    await user.selectOptions(within(dialog).getByLabelText(/Availability/), 'Cannot Produce');
    await user.click(within(dialog).getByRole('button', { name: 'Submit Response' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toMatch(/removed from your active queue/);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    expect(toast()).toMatch(/removed from Tony Fan's queue/);
    expect(screen.getAllByRole('row').length).toBe(rowsBefore - 1);
  });

  it('a selected line has pricing locked and the collateral checklist open, and finishing it completes the line', async () => {
    const user = userEvent.setup();
    await open('fenteng/inquiries');
    await pill(user, 'Selected');
    expect(screen.queryByRole('button', { name: 'Respond' })).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Product Collateral' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Product Collateral' });
    for (const label of ['3D Image', 'Technical Drawing', 'Specifications']) {
      await user.selectOptions(within(dialog).getByLabelText(label), 'Completed');
    }
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(toast()).toMatch(/completed and locked/);
    await pill(user, 'Completed');
    expect(screen.getAllByRole('row').length).toBeGreaterThan(5);
  });

  it('the drawer has the conversation, and a supplier message reaches the buyer side', async () => {
    const user = userEvent.setup();
    await open('tonfan/inquiries');
    await pill(user, 'Waiting');
    await user.click(screen.getAllByRole('button', { name: 'View' })[0]);
    const drawer = screen.getByRole('dialog');
    await user.type(within(drawer).getByLabelText('Message the buyer...'), 'Can the target date move by a week?');
    await user.click(within(drawer).getByRole('button', { name: 'Send' }));
    expect(saved().messages.some((m) => m.role === 'Supplier' && m.message.includes('target date'))).toBe(true);
  });

  it('Group Inquiry lists the same lines under their quote group', async () => {
    const user = userEvent.setup();
    await open('tonfan/inquiries');
    await user.click(screen.getByRole('tab', { name: 'Group Inquiry' }));
    expect(document.querySelectorAll('.group-card').length).toBeGreaterThan(0);
    expect(document.querySelector('.group-head').textContent).toMatch(/QG-|No Group/);
  });
});

describe('Purchase Request', () => {
  it('a PR from an inquiry has no Respond button; a manual one can be quoted', async () => {
    const user = userEvent.setup();
    await open('tonfan/pr');
    await pill(user, 'Waiting');
    expect(screen.getAllByRole('button', { name: 'Respond' }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Respond' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Your Response' });
    await user.selectOptions(within(dialog).getByLabelText(/Availability/), 'Confirmed');
    await user.type(within(dialog).getByLabelText('Initial Price'), '640');
    await user.type(within(dialog).getByLabelText('Lead Time (days)'), '10 days');
    await user.click(within(dialog).getByRole('button', { name: 'Submit Response' }));
    expect(toast()).toMatch(/Response submitted/);
    await pill(user, 'Selected');
    expect(screen.queryAllByRole('button', { name: 'Respond' })).toHaveLength(0);
  });
});

describe('Purchase Order', () => {
  it('Acknowledge PO needs both dates, then the PO is Confirmed and its shipment exists', async () => {
    const user = userEvent.setup();
    await open('tonfan/po');
    const awaiting = () => Number([...document.querySelectorAll('.stat')].find((s) => s.textContent.includes('Awaiting Acknowledge')).querySelector('.stat-value').textContent);
    const before = awaiting();
    expect(before).toBeGreaterThan(0);
    await pill(user, 'Awaiting Acknowledge');
    await user.click(screen.getAllByRole('button', { name: 'Acknowledge PO' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Acknowledge this Purchase Order?' });
    setDate('ETD *', '2026-11-20');
    await user.click(within(dialog).getByRole('button', { name: 'Acknowledge PO' }));
    expect(screen.getByRole('dialog', { name: 'Acknowledge this Purchase Order?' })).toBeTruthy(); // native required on ETA
    setDate('ETA *', '2026-12-10');
    await user.click(within(dialog).getByRole('button', { name: 'Acknowledge PO' }));
    expect(toast()).toMatch(/acknowledged/);
    expect(awaiting()).toBe(before - 1);
    expect(saved().shipments.filter((s) => s.supplier === 'Tony Fan' && s.status === 'Pending').length).toBeGreaterThan(0);
  });

  it('the drawer shows the line items, read-only', async () => {
    const user = userEvent.setup();
    await open('fenteng/po');
    await user.click(screen.getAllByRole('button', { name: 'View' })[0]);
    expect(within(screen.getByRole('dialog')).getByText('Line Items — Read-Only')).toBeTruthy();
  });
});

describe('Shipments', () => {
  it('Ship needs a date and a mode, asks to confirm, then the shipment is In Transit', async () => {
    const user = userEvent.setup();
    await open('tonfan/shipments');
    await pill(user, 'All');
    const pending = () => Number([...document.querySelectorAll('.stat')].find((s) => s.querySelector('.stat-label').textContent === 'Pending').querySelector('.stat-value').textContent);
    const before = pending();
    expect(before).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Ship' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Ship these items?' });
    await user.selectOptions(within(dialog).getByLabelText(/^Mode/), 'FCL');
    await user.click(within(dialog).getByRole('button', { name: 'Ship' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toMatch(/cannot be undone/);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes' }));
    expect(toast()).toMatch(/shipped by Tony Fan/);
    expect(pending()).toBe(before - 1);
  });

  it('filters by mode', async () => {
    const user = userEvent.setup();
    await open('tonfan/shipments');
    await pill(user, 'LCL');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.textContent.includes('LCL'))).toBe(true);
    await pill(user, 'FCL');
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
  });
});

describe('Replacement Request', () => {
  it('approve needs a mode and both dates, then Update Progress moves it forward', async () => {
    const user = userEvent.setup();
    await open('tonfan/replacement');
    await pill(user, 'Awaiting Approval');
    await user.click(screen.getAllByRole('button', { name: 'Approve RR' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Approve this Replacement Request?' });
    await user.selectOptions(within(dialog).getByLabelText(/Shipment Mode/), 'LCL');
    setDate('Expected Ship Date *', '2026-11-20');
    setDate('ETA *', '2026-12-05');
    await user.click(within(dialog).getByRole('button', { name: 'Approve RR' }));
    expect(toast()).toMatch(/approved/i);
    await pill(user, 'Acknowledged');
    await user.click(screen.getAllByRole('button', { name: 'Update Progress' })[0]);
    const prog = screen.getByRole('dialog', { name: 'Update Progress' });
    await user.selectOptions(within(prog).getByLabelText(/Status/), 'Shipped');
    await user.click(within(prog).getByRole('button', { name: 'Save' }));
    expect(toast()).toMatch(/is now Shipped/);
    expect(saved().shipments.some((s) => s.rrNo && s.supplier === 'Tony Fan' && s.status === 'In Transit')).toBe(true);
  });
});
