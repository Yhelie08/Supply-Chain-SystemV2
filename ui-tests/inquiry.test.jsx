// Real clicks and typing against the Inquiry components.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreProvider } from '../src/store.jsx';
import { Toasts } from '../src/ui/components.jsx';
import InquiryPage from '../src/pages/inquiry/InquiryPage.jsx';

const KEY = 'supply-chain-v2:db';
const saved = () => JSON.parse(localStorage.getItem(KEY));
const mount = (sub = '') => render(<StoreProvider><InquiryPage sub={sub} /><Toasts /></StoreProvider>);
const $ = (id) => document.getElementById(id);

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});
afterEach(cleanup);

describe('New Inquiry form', () => {
  it('highlights the first missing field and says what is wrong', async () => {
    const user = userEvent.setup();
    mount('new');
    await user.click(screen.getByRole('button', { name: 'Submit Inquiry' }));
    expect(await screen.findByText('Please enter an Item Name.')).toBeTruthy();
    expect($('fItems').getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses text that was typed but never picked from the list', async () => {
    const user = userEvent.setup();
    mount('new');
    await user.type($('fItems'), 'Not a real catalog item');
    await user.click(screen.getByRole('button', { name: 'Submit Inquiry' }));
    expect(await screen.findByText(/Please pick the Item from the suggestion list/)).toBeTruthy();
  });

  it('autofills from the picked item and customer, then saves an inquiry', async () => {
    const user = userEvent.setup();
    mount('new');

    await user.click($('fItems'));
    await user.type($('fItems'), 'Linear');
    await user.click(await screen.findByRole('option', { name: 'Linear Pendant' }));
    expect($('fSku').value).toMatch(/^SKU-/);
    expect($('fDescription').value).toMatch(/Linear Pendant/);
    expect($('fSrp').value).not.toBe('');

    await user.click($('fCustomer'));
    await user.type($('fCustomer'), 'Zed');
    await user.click(await screen.findByRole('option', { name: 'Zed Pineda' }));
    expect($('fCustomerType').value).toBe('Designer');

    await user.click($('fProject'));
    await user.click(await screen.findByRole('option', { name: 'Pineda Villa' }));
    expect($('fProjectName').value).toBe('Pineda Villa');

    await user.type($('fQuantity'), '4');
    fireEvent.change($('fTargetDate'), { target: { value: '2026-12-20' } });
    await user.selectOptions($('fSalesOwner'), 'HC Sales 3');
    await user.click(screen.getByRole('button', { name: 'Submit Inquiry' }));

    const db = saved();
    const q = db.inquiries.at(-1);
    expect(q.customer).toBe('Zed Pineda');
    expect(q.item).toBe('Linear Pendant');
    expect(q.qty).toBe(4);
    expect(q.salesOwner).toBe('HC Sales 3');
    expect(q.projectName).toBe('Pineda Villa');
    expect(q.suppliers.length).toBeGreaterThan(0);
    expect(window.location.hash).toBe('#/procurement/inquiry');
    expect(db.timeline.some((t) => t.inqNo === q.no && t.title === 'Inquiry created')).toBe(true);
  });

  it('clears the project when the customer changes', async () => {
    const user = userEvent.setup();
    mount('new');
    await user.click($('fCustomer'));
    await user.type($('fCustomer'), 'Zed');
    await user.click(await screen.findByRole('option', { name: 'Zed Pineda' }));
    await user.click($('fProject'));
    await user.click(await screen.findByRole('option', { name: 'Pineda Villa' }));
    expect($('fProject').value).toBe('Pineda Villa');
    await user.clear($('fCustomer'));
    await user.type($('fCustomer'), 'Ivy');
    await user.click(await screen.findByRole('option', { name: 'Ivy Cruz' }));
    expect($('fProject').value).toBe('');
  });

  it('keeps Negotiated locked until Initial has a value, and computes Final', async () => {
    const user = userEvent.setup();
    mount('new');
    await user.click(screen.getByRole('button', { name: '+ Add Quote' }));
    const negotiated = screen.getByLabelText('Negotiated price');
    const initial = screen.getByLabelText('Initial price');
    expect(negotiated.disabled).toBe(true);
    await user.type(initial, '200');
    expect(negotiated.disabled).toBe(false);
    expect(screen.getByLabelText('Final price').value).toBe('200');
    await user.type(negotiated, '150');
    expect(screen.getByLabelText('Final price').value).toBe('150');
    await user.clear(initial);
    expect(negotiated.disabled).toBe(true);
    expect(negotiated.value).toBe('');
  });

  it('lets only one supplier be Selected', async () => {
    const user = userEvent.setup();
    mount('new');
    await user.click(screen.getByRole('button', { name: '+ Add Quote' }));
    await user.click(screen.getByRole('button', { name: '+ Add Quote' }));
    const boxes = screen.getAllByLabelText('Selected');
    await user.click(boxes[0]);
    expect(boxes[0].checked).toBe(true);
    await user.click(boxes[1]);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
  });

  it('updates the readiness checklist live as the form changes', async () => {
    const user = userEvent.setup();
    mount('new');
    expect(screen.getByText('0 of 5 conditions passed')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '+ Add Quote' }));
    await user.selectOptions(screen.getByLabelText('Availability'), 'Confirmed');
    await user.type(screen.getByLabelText('Initial price'), '300');
    await user.click(screen.getByLabelText('Selected'));
    expect(screen.getByText('3 of 5 conditions passed')).toBeTruthy();
    await user.type($('fSrp'), '999');
    expect(screen.getByText('4 of 5 conditions passed')).toBeTruthy();
    for (const label of ['Product Sample', '3D Image', 'Technical Drawing', 'Specifications']) await user.selectOptions(screen.getByLabelText(label), 'Completed');
    expect(screen.getByText(/READY FOR ESTIMATE/)).toBeTruthy();
  });

  it('creates a new customer from the dropdown and selects it', async () => {
    const user = userEvent.setup();
    mount('new');
    await user.click($('fCustomer'));
    await user.type($('fCustomer'), 'Brand New Client');
    await user.click(await screen.findByText(/Create new customer "Brand New Client"/));
    const dialog = await screen.findByRole('dialog', { name: 'New Customer' });
    expect(within(dialog).getByLabelText(/Customer Name/).value).toBe('Brand New Client');
    await user.click(within(dialog).getByRole('button', { name: 'Save Customer' }));
    expect($('fCustomer').value).toBe('Brand New Client');
    expect(saved().customers.some((c) => c.name === 'Brand New Client')).toBe(true);
  });

  it('refuses a duplicate customer name with the rule that says why', async () => {
    const user = userEvent.setup();
    mount('new');
    await user.click($('fCustomer'));
    await user.type($('fCustomer'), 'Zed Pineda');
    await user.click(await screen.findByText(/Create new customer "Zed Pineda"/).catch(() => screen.findByRole('option', { name: 'Zed Pineda' })));
    // Picking the existing customer is fine; creating a clone is what is refused.
    await user.clear($('fCustomer'));
    await user.type($('fCustomer'), 'zed pineda ');
    await user.click(await screen.findByText(/Create new customer/));
    const dialog = await screen.findByRole('dialog', { name: 'New Customer' });
    await user.click(within(dialog).getByRole('button', { name: 'Save Customer' }));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(screen.getByText(/Rule INQ\.CUSTOMER_DUP/)).toBeTruthy();
  });
});

describe('Inquiry list and groups', () => {
  it('filters by readiness status and searches', async () => {
    const user = userEvent.setup();
    mount();
    const total = screen.getAllByRole('row').length - 1;
    await user.click(screen.getByRole('button', { name: /^Not Ready/ }));
    const notReady = screen.getAllByRole('row').length - 1;
    expect(notReady).toBeGreaterThan(0);
    expect(notReady).toBeLessThan(total);
    await user.click(screen.getByRole('button', { name: /^All/ }));
    await user.type(screen.getByLabelText('Search inquiries'), 'Pineda');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.length).toBe(2);
    rows.forEach((r) => expect(r.textContent).toContain('Zed Pineda'));
  });

  it('creates an estimate from the list after confirming, and shows Update afterwards', async () => {
    const user = userEvent.setup();
    mount();
    const row = screen.getAllByRole('row').find((r) => r.textContent.includes('Ivy Cruz'));
    await user.click(within(row).getByRole('button', { name: 'Create Estimate' }));
    expect(await screen.findByText(/Create the estimate for INQ-/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create estimate' }));
    expect(saved().inquiries.find((q) => q.customer === 'Ivy Cruz').status).toBe('Estimate Created');
    const again = screen.getAllByRole('row').find((r) => r.textContent.includes('Ivy Cruz'));
    expect(within(again).getByRole('button', { name: 'Update Estimate' })).toBeTruthy();
  });

  it('keeps Create Estimate disabled for a record that is not ready', () => {
    mount();
    const row = screen.getAllByRole('row').find((r) => r.textContent.includes('Paolo Diaz'));
    expect(within(row).getByRole('button', { name: 'Create Estimate' }).disabled).toBe(true);
  });

  it('shows quote groups and approves an SRP inline after confirming', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'Quote Groups' }));
    expect(screen.getByText('Pineda Villa')).toBeTruthy();
    const input = screen.getAllByLabelText(/SRP for INQ-/)[0];
    await user.type(input, '1500');
    await user.click(input.parentElement.querySelector('button.btn-primary'));
    expect(await screen.findByText(/Approve SRP amount of ₱1,500.00/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Approve SRP' }));
    expect(saved().inquiries.some((q) => q.srp === 1500)).toBe(true);
  });
});

describe('Inquiry detail', () => {
  const idOf = (no) => saved().inquiries.find((q) => q.no === no).id;
  const seeded = async () => {
    mount();
    return null;
  };

  it('shows readiness, next step, and approves SRP only after confirming', async () => {
    const user = userEvent.setup();
    await seeded();
    const id = idOf('INQ-00009');
    cleanup();
    mount(id);
    expect(screen.getByText('Readiness Checklist')).toBeTruthy();
    expect(screen.getByText(/You are here/)).toBeTruthy();
    await user.type($('dSrp'), '800');
    await user.click(screen.getByRole('button', { name: 'Approve SRP' }));
    expect(await screen.findByText(/Approve SRP amount of ₱800.00/)).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Approve SRP' }).at(-1));
    expect(saved().inquiries.find((q) => q.id === id).srp).toBe(800);
  });

  it('refuses to approve an SRP with no amount', async () => {
    const user = userEvent.setup();
    await seeded();
    const id = idOf('INQ-00009');
    cleanup();
    mount(id);
    await user.click(screen.getByRole('button', { name: 'Approve SRP' }));
    expect(await screen.findByText('Enter a valid SRP amount first.')).toBeTruthy();
  });

  it('converts an estimate to a Sales Order and locks the record', async () => {
    const user = userEvent.setup();
    await seeded();
    const id = idOf('INQ-00013');
    cleanup();
    mount(id);
    await user.click(screen.getByRole('button', { name: 'Convert to Sales Order' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Shipping mode'), 'LCL');
    await user.click(within(dialog).getByRole('button', { name: 'Create Sales Order' }));
    const q = saved().inquiries.find((x) => x.id === id);
    expect(q.status).toBe('Sales Order');
    expect(saved().prs.some((p) => p.soNo === q.soNo && p.mode === 'LCL')).toBe(true);
    expect(screen.getByText(/Locked/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('opens a supplier conversation from a quote row and sends a message', async () => {
    const user = userEvent.setup();
    await seeded();
    const id = idOf('INQ-00013');
    cleanup();
    mount(id);
    await user.click(screen.getByTitle('Open conversation with Tony'));
    expect(await screen.findByText('Conversation — Tony')).toBeTruthy();
    expect(screen.getByText('Confirmed. We can ship within two weeks.')).toBeTruthy();
    await user.type(screen.getByLabelText('Message'), 'Please ship early');
    const panel = screen.getByText('Conversation — Tony').closest('.chat-panel');
    await user.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(saved().messages.some((m) => m.message === 'Please ship early' && m.role === 'Buyer')).toBe(true);
  });

  it('deletes only after confirming, and goes back to the list', async () => {
    const user = userEvent.setup();
    await seeded();
    const id = idOf('INQ-00008');
    cleanup();
    mount(id);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Delete INQ-00008\? This cannot be undone\./)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(saved().inquiries.some((q) => q.id === id)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1));
    expect(saved().inquiries.some((q) => q.id === id)).toBe(false);
    expect(window.location.hash).toBe('#/procurement/inquiry');
  });

  it('edits a record and logs only the changed field in its timeline', async () => {
    const user = userEvent.setup();
    await seeded();
    const id = idOf('INQ-00008');
    cleanup();
    mount(`${id}/edit`);
    await user.type($('fVoltage'), '220-240V');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    const db = saved();
    expect(db.inquiries.find((q) => q.id === id).voltage).toBe('220-240V');
    const last = db.timeline.filter((t) => t.inqNo === 'INQ-00008').at(-1);
    expect(last.title).toBe('Added Voltage');
  });
});
