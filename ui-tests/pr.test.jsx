// Real clicks and typing against the Purchase Request page.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreProvider } from '../src/store.jsx';
import { Toasts } from '../src/ui/components.jsx';
import PRPage from '../src/pages/pr/PRPage.jsx';

const KEY = 'supply-chain-v2:db';
const saved = () => JSON.parse(localStorage.getItem(KEY));
const mount = () => render(<StoreProvider><PRPage /><Toasts /></StoreProvider>);
const pr = (no) => saved().prs.find((p) => p.no === no);

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

const openDrawer = async (user, no) => {
  await user.click(screen.getByText(no));
  return screen.findByRole('dialog', { name: no });
};

describe('Purchase Request tabs', () => {
  it('has the seven views from the live widget', () => {
    mount();
    for (const name of ['All PRs', 'Ready for PO Queue', 'Converted to PO', 'On Hold', 'Cancelled', 'PR Groups', 'Supplier Load View']) {
      expect(screen.getByRole('tab', { name: new RegExp(name) })).toBeTruthy();
    }
  });

  it('the Ready for PO queue leaves out held PRs', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: /Ready for PO Queue/ }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => { expect(r.textContent).toContain('Ready for PO'); expect(r.textContent).not.toContain('ON HOLD'); });
  });

  it('shows held and cancelled PRs on their own tabs', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: /On Hold/ }));
    expect(screen.getAllByRole('row').slice(1).every((r) => r.textContent.includes('ON HOLD'))).toBe(true);
    await user.click(screen.getByRole('tab', { name: /Cancelled/ }));
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
  });

  it('the Supplier Load View shows capacity and load for each real supplier', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'Supplier Load View' }));
    expect(screen.getByText('Active PO lines')).toBeTruthy();
    expect(screen.getByText('Fenteng Lighting')).toBeTruthy();
    expect(screen.getByText('Tony Fan')).toBeTruthy();
    expect(screen.queryByText('Warehouse Stock')).toBeNull();
  });
});

describe('Purchase Request detail', () => {
  it('shows the four readiness conditions and the supplier recommendation table', async () => {
    const user = userEvent.setup();
    mount();
    const drawer = await openDrawer(user, 'PR-00004');
    expect(within(drawer).getByText(/Readiness for PO \(3 of 4\)/)).toBeTruthy();
    expect(within(drawer).getByText('Shipping mode selected')).toBeTruthy();
    expect(within(drawer).getByText(/Supplier recommendation/)).toBeTruthy();
    expect(within(drawer).getAllByText(/Awaiting Quote|Recommended|Available/).length).toBeGreaterThan(0);
  });

  it('becomes Ready for PO by itself when the missing shipping mode is set', async () => {
    const user = userEvent.setup();
    mount();
    expect(pr('PR-00004').status).toBe('For Sourcing');
    const drawer = await openDrawer(user, 'PR-00004');
    await user.click(within(drawer).getByRole('button', { name: 'Edit' }));
    const form = await screen.findByRole('dialog', { name: 'Edit PR' });
    await user.selectOptions(within(form).getByLabelText('Shipping mode'), 'LCL');
    await user.click(within(form).getByRole('button', { name: 'Edit' }));
    expect(pr('PR-00004').status).toBe('Ready for PO');
    expect(pr('PR-00004').mode).toBe('LCL');
  });

  it('puts a PR on hold with a reason and follow-up date, then resumes it', async () => {
    const user = userEvent.setup();
    mount();
    let drawer = await openDrawer(user, 'PR-00003');
    await user.click(within(drawer).getByRole('button', { name: 'Put on hold' }));
    const form = await screen.findByRole('dialog', { name: 'Put PR on hold' });
    await user.selectOptions(within(form).getByLabelText(/Reason/), 'Client payment issue');
    await user.type(within(form).getByLabelText('Follow up by'), '2026-12-01');
    await user.click(within(form).getByRole('button', { name: 'Put on hold' }));
    expect(pr('PR-00003').hold).toBe('On Hold');
    expect(pr('PR-00003').holdReason).toBe('Client payment issue');
    expect(pr('PR-00003').holdFollowUp).toBe('2026-12-01');
    expect(pr('PR-00003').status).toBe('Ready for PO');

    drawer = await screen.findByRole('dialog', { name: 'PR-00003' });
    await user.click(within(drawer).getByRole('button', { name: 'Resume' }));
    expect(pr('PR-00003').hold).toBe('');
  });

  it('refuses a hold with the reason Other and no notes', async () => {
    const user = userEvent.setup();
    mount();
    const drawer = await openDrawer(user, 'PR-00003');
    await user.click(within(drawer).getByRole('button', { name: 'Put on hold' }));
    const form = await screen.findByRole('dialog', { name: 'Put PR on hold' });
    await user.selectOptions(within(form).getByLabelText(/Reason/), 'Other');
    await user.click(within(form).getByRole('button', { name: 'Put on hold' }));
    expect(await screen.findByText('The reason "Other" needs notes.')).toBeTruthy();
    expect(pr('PR-00003').hold).toBe('');
  });

  it('approves an SRP, which confirms the price', async () => {
    const user = userEvent.setup();
    mount();
    const drawer = await openDrawer(user, 'PR-00004');
    await user.click(within(drawer).getByRole('button', { name: 'Approve SRP' }));
    const form = await screen.findByRole('dialog', { name: 'Approve SRP' });
    await user.type(within(form).getByLabelText(/SRP amount/), '4500');
    await user.click(within(form).getByRole('button', { name: 'Approve SRP' }));
    expect(pr('PR-00004').srpApproved).toBe(4500);
  });

  it('a converted PR offers no edit, hold or SRP steps', async () => {
    const user = userEvent.setup();
    mount();
    const drawer = await openDrawer(user, 'PR-00001');
    for (const name of ['Edit', 'Put on hold', 'Cancel PR', 'Approve SRP', 'Create PO']) {
      expect(within(drawer).queryByRole('button', { name })).toBeNull();
    }
  });
});

describe('PR Groups', () => {
  const group = (no) => screen.getByText(no).closest('.qg-card');

  it('creates a PO for a Sales Order group after confirming', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'PR Groups' }));
    await user.click(within(group('PR-00003')).getByRole('button', { name: 'Create PO →' }));
    expect(await screen.findByText(/convert to a Purchase Order\?/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create PO' }));
    expect(pr('PR-00003').status).toBe('Converted to PO');
    expect(pr('PR-00003').poNo).toMatch(/^PO-/);
  });

  it('refuses a group that is not ready, and names the rule', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'PR Groups' }));
    await user.click(within(group('PR-00004')).getByRole('button', { name: 'Create PO →' }));
    await user.click(await screen.findByRole('button', { name: 'Create PO' }));
    expect(await screen.findByText(/Not all PRs in this group are Ready for PO/)).toBeTruthy();
    expect(screen.getByText(/Rule PR\.GROUP_NOT_READY/)).toBeTruthy();
    expect(pr('PR-00004').status).toBe('For Sourcing');
  });

  it('shows a converted group as converted, with no Create PO button', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'PR Groups' }));
    expect(within(group('PR-00001')).queryByRole('button', { name: 'Create PO →' })).toBeNull();
    expect(within(group('PR-00001')).getAllByText('Converted to PO', { selector: '.pill' }).length).toBeGreaterThan(0);
  });

  it('edits an SRP inline, asking first', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'PR Groups' }));
    const card = group('PR-00004');
    await user.click(within(card).getByRole('button', { name: 'Edit' }));
    await user.type(within(card).getByLabelText('SRP for PR-00004'), '3000');
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Approve SRP of ₱3,000.00 for PR-00004\?/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Approve SRP' }));
    expect(pr('PR-00004').srpApproved).toBe(3000);
  });
});

describe('New PR', () => {
  it('names what is missing', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: '+ New PR' }));
    const form = await screen.findByRole('dialog', { name: 'New Purchase Request' });
    await user.click(within(form).getByRole('button', { name: /Submit PR/ }));
    expect(await screen.findByText(/Missing: Item \/ SKU, Target Date, Quantity \(\+more\)/)).toBeTruthy();
  });

  it('Local sourcing hides supplier and mode, and the PR goes to HC System', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: '+ New PR' }));
    const form = await screen.findByRole('dialog', { name: 'New Purchase Request' });
    expect(within(form).getByLabelText('Selected supplier')).toBeTruthy();
    await user.selectOptions(within(form).getByLabelText('Sourcing type'), 'Local');
    expect(within(form).queryByLabelText('Selected supplier')).toBeNull();
    expect(within(form).queryByLabelText('Shipping mode')).toBeNull();

    const db = saved();
    await user.selectOptions(within(form).getByLabelText(/Item \/ SKU/), db.products[0].id);
    await user.type(within(form).getByLabelText(/Quantity/), '3');
    await user.type(within(form).getByLabelText(/Target date/), '2026-12-30');
    await user.selectOptions(within(form).getByLabelText(/^Customer \*/), db.customers[0].id);
    await user.selectOptions(within(form).getByLabelText(/Sales owner/), 'HC Sales 2');
    await user.click(within(form).getByRole('button', { name: /Submit PR/ }));
    const made = saved().prs.at(-1);
    expect(made.supplier).toBe('HC System');
    expect(made.sourcingType).toBe('Local');
    expect(made.mode).toBe('');
  });

  it('asks for an override reason when a non-recommended supplier is chosen', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: '+ New PR' }));
    const form = await screen.findByRole('dialog', { name: 'New Purchase Request' });
    expect(within(form).queryByLabelText(/Override reason/)).toBeNull();
    await user.selectOptions(within(form).getByLabelText('Selected supplier'), 'Tony Fan');
    expect(within(form).getByLabelText(/Override reason/)).toBeTruthy();
  });
});
