// The Inquiry module, ported from the live widget. Each test names the widget behaviour it checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/domain/actions.js';
import { seedDb } from '../src/domain/seed.js';
import { RuleError } from '../src/domain/rules.js';
import {
  blankInquiryData, chatKey, collateralDone, diffInquiry, margin, nextStep, quoteFinal, readiness, signalNext, titleFor,
} from '../src/domain/inquiry.js';

const TODAY = '2026-11-11';
const ctx = { today: TODAY, now: '2026-11-11T09:30:00.000Z' };

const refused = (fn, ruleId) => assert.throws(fn, (e) => e instanceof RuleError && e.ruleId === ruleId, `expected refusal ${ruleId}`);
const go = (db, name, payload) => run(db, name, payload, ctx).db;
const byNo = (db, no) => db.inquiries.find((q) => q.no === no);
const open = (db) => db.inquiries.filter((q) => q.status !== 'Sales Order');

const COMPLETE = { sample: 'Completed', dImage: 'Completed', drawing: 'Completed', spec: 'Completed' };

function baseData(db, over = {}) {
  const cust = db.customers.find((c) => c.name === 'Ed Navarro');
  const proj = db.projects.find((p) => p.customerId === cust.id);
  return { ...blankInquiryData(), customerId: cust.id, projectId: proj.id, itemId: db.products[0].id, qty: 5, targetDate: '2026-12-15', salesOwner: 'HC Sales 2', ...over };
}

test('readiness is five derived conditions, and status follows the count', () => {
  const db = seedDb(TODAY);
  const notReady = open(db).find((q) => readiness(q).passed === 0);
  assert.equal(readiness(notReady).status, 'Not Ready');
  const progress = open(db).find((q) => readiness(q).status === 'In Progress');
  assert.ok(readiness(progress).passed >= 1 && readiness(progress).passed <= 4);
  const ready = open(db).find((q) => readiness(q).status === 'Ready');
  assert.equal(readiness(ready).passed, 5);
  assert.equal(readiness(ready).checks.length, 5);
});

test('collateral only counts as done when every item is Completed or N/A', () => {
  const q = { collateral: { sample: 'Completed', dImage: 'N/A', drawing: 'Required', spec: 'Completed' } };
  assert.equal(collateralDone(q), false, 'Required is not done');
  q.collateral.drawing = 'HideToSupplier';
  assert.equal(collateralDone(q), false, 'HideToSupplier is not done either');
  q.collateral.drawing = 'N/A';
  assert.equal(collateralDone(q), true);
});

test('final price is the negotiated price when entered, otherwise the initial price', () => {
  assert.equal(quoteFinal({ initial: 100, negotiated: 0 }), 100);
  assert.equal(quoteFinal({ initial: 100, negotiated: 80 }), 80);
  assert.equal(quoteFinal({ initial: 0, negotiated: 0 }), 0);
  const db = seedDb(TODAY);
  const d2 = go(db, 'inquiryCreate', { data: baseData(db, { quotes: [{ supplier: 'Tony Fan', initial: 200, negotiated: 150 }] }) });
  assert.equal(d2.inquiries.at(-1).quotes[0].final, 150, 'the stored final is computed, never typed');
});

test('a negotiated price needs an initial price first', () => {
  const db = seedDb(TODAY);
  refused(() => go(db, 'inquiryCreate', { data: baseData(db, { quotes: [{ supplier: 'Tony Fan', initial: 0, negotiated: 90 }] }) }), 'INQ.PRICE');
});

test('only one supplier can be Selected, and a supplier can only have one row', () => {
  const db = seedDb(TODAY);
  const two = [{ supplier: 'Tony Fan', initial: 10, selected: true }, { supplier: 'Fenteng Lighting', initial: 12, selected: true }];
  refused(() => go(db, 'inquiryCreate', { data: baseData(db, { quotes: two }) }), 'INQ.ONE_SELECTED');
  const dup = [{ supplier: 'Tony Fan', initial: 10 }, { supplier: 'Tony Fan', initial: 12 }];
  refused(() => go(db, 'inquiryCreate', { data: baseData(db, { quotes: dup }) }), 'INQ.QUOTE_DUP');
  refused(() => go(db, 'inquiryCreate', { data: baseData(db, { quotes: [{ supplier: 'Nobody Ltd', initial: 1 }] }) }), 'GEN.FIELD');
});

test('creating an inquiry enforces the widget\'s required fields', () => {
  const db = seedDb(TODAY);
  const missing = (over) => () => go(db, 'inquiryCreate', { data: baseData(db, over) });
  refused(missing({ itemId: 'typed-text-not-an-id' }), 'INQ.NEW');
  refused(missing({ customerId: '' }), 'INQ.NEW');
  refused(missing({ salesOwner: '' }), 'INQ.NEW');
  refused(missing({ targetDate: '' }), 'INQ.NEW');
  refused(missing({ qty: 0 }), 'INQ.NEW');
  refused(missing({ qty: 1.5 }), 'INQ.NEW');
  const typeless = structuredClone(db);
  typeless.customers.find((c) => c.name === 'Ed Navarro').type = '';
  refused(() => go(typeless, 'inquiryCreate', { data: baseData(typeless) }), 'INQ.NEW');
});

test('a new inquiry takes its customer type from the customer, tags every supplier and logs its first timeline entry', () => {
  const db = seedDb(TODAY);
  const d2 = go(db, 'inquiryCreate', { data: baseData(db) });
  const q = d2.inquiries.at(-1);
  assert.equal(q.customerType, 'Designer');
  assert.deepEqual(q.suppliers.sort(), ['Fenteng Lighting', 'HC System', 'Tony Fan']);
  assert.match(q.no, /^INQ-\d{5}$/);
  const first = d2.timeline.filter((t) => t.inqNo === q.no);
  assert.equal(first.length, 1);
  assert.equal(first[0].title, 'Inquiry created');
  assert.ok(first[0].changes.some((c) => c.label === 'Item'));
});

test('a project must belong to the inquiry\'s customer', () => {
  const db = seedDb(TODAY);
  const other = db.projects.find((p) => p.customerId !== db.customers.find((c) => c.name === 'Ed Navarro').id);
  refused(() => go(db, 'inquiryCreate', { data: baseData(db, { projectId: other.id }) }), 'INQ.PROJECT_CUSTOMER');
});

test('inquiries with the same project and discount share a quote group; no project means no group', () => {
  const db = seedDb(TODAY);
  const pineda = open(db).filter((q) => q.customer === 'Zed Pineda');
  assert.equal(pineda.length, 2);
  assert.ok(pineda[0].quoteGroup);
  assert.equal(pineda[0].quoteGroup, pineda[1].quoteGroup);
  assert.equal(byNo(db, 'INQ-00008').quoteGroup, '', 'the inquiry with no project has no group');
  const d2 = go(db, 'inquiryCreate', { data: baseData(db, { groupDiscountPct: 12 }) });
  const fresh = d2.inquiries.at(-1);
  assert.notEqual(fresh.quoteGroup, byNo(d2, 'INQ-00013').quoteGroup, 'a different discount is a different group');
});

test('next step follows the widget\'s order of questions', () => {
  const q = { status: 'Open', quotes: [], collateral: {}, srp: 0 };
  assert.equal(nextStep(q).action, 'Supplier to confirm availability');
  assert.equal(nextStep(q).tone, 'wait');
  q.quotes = [{ supplier: 'Tony Fan', availability: 'Confirmed', initial: 0, negotiated: 0 }];
  assert.equal(nextStep(q).action, 'Get the final price');
  q.quotes[0].initial = 10;
  assert.equal(nextStep(q).action, 'Select a supplier');
  q.quotes[0].selected = true;
  assert.equal(nextStep(q).action, 'Supplier to complete collateral (photos / docs)');
  q.collateral = COMPLETE;
  assert.equal(nextStep(q).action, 'Approve the SRP');
  q.srp = 100;
  assert.equal(nextStep(q).action, 'Create the Estimate');
  q.status = 'Estimate Created';
  assert.equal(nextStep(q).action, 'Convert the Estimate to a Sales Order');
  q.status = 'Sales Order';
  assert.equal(nextStep(q).tone, 'done');
  assert.equal(signalNext({ ...q, quotes: [], collateral: {}, srp: 0, status: 'Open' }), 'Add at least one supplier quote');
});

test('Approve SRP needs an amount, makes the SRP condition pass, and is logged', () => {
  const db = seedDb(TODAY);
  const q = open(db).find((x) => !readiness(x).checks[4].passed && readiness(x).passed >= 1);
  refused(() => go(db, 'inquiryApproveSrp', { id: q.id, amount: 0 }), 'INQ.SRP');
  const d2 = go(db, 'inquiryApproveSrp', { id: q.id, amount: 1500 });
  assert.equal(readiness(d2.inquiries.find((x) => x.id === q.id)).checks[4].passed, true);
  const last = d2.timeline.filter((t) => t.inqNo === q.no).at(-1);
  assert.equal(last.title, 'SRP approved');
  assert.equal(last.changes[0].label, 'SRP Amount');
});

test('an estimate needs all five conditions and a project', () => {
  const db = seedDb(TODAY);
  const notReady = open(db).find((q) => readiness(q).status === 'Not Ready');
  refused(() => go(db, 'inquiryEstimate', { id: notReady.id }), 'INQ.READY');
  const ready = open(db).find((q) => readiness(q).status === 'Ready' && q.status === 'Open' && q.customer === 'Ivy Cruz');
  const noProject = structuredClone(db);
  const target = noProject.inquiries.find((q) => q.id === ready.id);
  target.projectId = '';
  target.projectName = '';
  refused(() => go(noProject, 'inquiryEstimate', { id: ready.id }), 'INQ.PROJECT');
  const d2 = go(db, 'inquiryEstimate', { id: ready.id });
  const done = d2.inquiries.find((q) => q.id === ready.id);
  assert.equal(done.status, 'Estimate Created');
  assert.match(done.estimateNo, /^EST-\d{5}$/);
});

test('an estimate also covers the other Ready inquiries of the same project, with one shared number, but never Not Ready ones', () => {
  const db = seedDb(TODAY);
  const pinedaReady = open(db).find((q) => q.customer === 'Zed Pineda' && readiness(q).status === 'Ready');
  const pinedaNot = open(db).find((q) => q.customer === 'Zed Pineda' && readiness(q).status === 'Not Ready');
  // Make a second Pineda inquiry Ready too, then estimate one of them.
  let d2 = go(db, 'inquiryUpdate', {
    id: pinedaNot.id,
    data: { ...pinedaNot, quotes: [{ supplier: 'Tony Fan', availability: 'Confirmed', initial: 800, selected: true, stage: 'Final' }], collateral: COMPLETE, srp: 1400 },
  });
  d2 = go(d2, 'inquiryEstimate', { id: pinedaReady.id });
  const a = d2.inquiries.find((q) => q.id === pinedaReady.id);
  const b = d2.inquiries.find((q) => q.id === pinedaNot.id);
  assert.equal(a.status, 'Estimate Created');
  assert.equal(b.status, 'Estimate Created');
  assert.equal(a.estimateNo, b.estimateNo);

  // A sibling that is still Not Ready is not swept along.
  const d3 = go(db, 'inquiryEstimate', { id: pinedaReady.id });
  assert.equal(d3.inquiries.find((q) => q.id === pinedaNot.id).status, 'Open');
});

test('converting to a Sales Order raises a PR for a real supplier, but not for Warehouse Stock', () => {
  const db = seedDb(TODAY);
  const est = byNo(db, 'INQ-00013');
  assert.equal(est.status, 'Estimate Created');
  const prsBefore = db.prs.length;
  const d2 = go(db, 'inquiryApprove', { id: est.id, mode: 'LCL', payment: 'Paid', forCrate: true });
  const so = d2.inquiries.find((q) => q.id === est.id);
  assert.equal(so.status, 'Sales Order');
  assert.equal(d2.prs.length, prsBefore + 1);
  const newPr = d2.prs.at(-1);
  assert.equal(newPr.supplier, 'Tony Fan');
  assert.equal(newPr.currency, 'CNY');
  assert.equal(newPr.price, 1100);
  const item = d2.items.find((i) => i.soNo === so.soNo);
  assert.equal(item.forCrate, true);
  assert.equal(item.payment, 'Paid');
  assert.equal(item.received, false);
  const stockOrder = d2.items.find((i) => i.prNo === '' && i.received);
  assert.ok(stockOrder, 'a Warehouse Stock order has no PR and is already received');
});

test('a Sales Order locks its inquiry: no edit, no delete, no SRP change', () => {
  const db = seedDb(TODAY);
  const so = db.inquiries.find((q) => q.status === 'Sales Order');
  refused(() => go(db, 'inquiryUpdate', { id: so.id, data: { ...so, qty: 99 } }), 'INQ.LOCKED');
  refused(() => go(db, 'inquiryDelete', { id: so.id }), 'INQ.LOCKED');
  refused(() => go(db, 'inquiryApproveSrp', { id: so.id, amount: 5 }), 'INQ.LOCKED');
});

test('delete removes the inquiry but its timeline keeps a trail', () => {
  const db = seedDb(TODAY);
  const q = byNo(db, 'INQ-00008');
  const d2 = go(db, 'inquiryDelete', { id: q.id });
  assert.equal(byNo(d2, 'INQ-00008'), undefined);
  const trail = d2.timeline.filter((t) => t.inqNo === 'INQ-00008');
  assert.deepEqual(trail.map((t) => t.type), ['Created', 'Deleted']);
});

test('saving an edit logs only what changed, with a readable title; saving nothing logs nothing', () => {
  const db = seedDb(TODAY);
  const q = byNo(db, 'INQ-00008');
  const noChange = go(db, 'inquiryUpdate', { id: q.id, data: { ...q } });
  assert.equal(noChange.timeline.length, db.timeline.length, 'no entry for a no-op save');

  const one = go(db, 'inquiryUpdate', { id: q.id, data: { ...q, voltage: '220-240V' } });
  const entry = one.timeline.filter((t) => t.inqNo === q.no).at(-1);
  assert.equal(entry.title, 'Added Voltage');
  assert.deepEqual(entry.changes, [{ label: 'Voltage', from: '', to: '220-240V' }]);

  const many = go(db, 'inquiryUpdate', { id: q.id, data: { ...q, voltage: '12V', lumens: '900', waitingOn: 'Supplier' } });
  assert.equal(many.timeline.filter((t) => t.inqNo === q.no).at(-1).title, 'Updated 3 fields');
});

test('timeline diffs describe quote rows by supplier', () => {
  const a = { quotes: [{ supplier: 'Tony Fan', availability: 'Pending', initial: 100, negotiated: 0, leadTime: '', stage: 'Not Selected', selected: false }], collateral: {} };
  const b = { quotes: [{ supplier: 'Tony Fan', availability: 'Confirmed', initial: 100, negotiated: 90, leadTime: '', stage: 'Final', selected: true }, { supplier: 'Fenteng Lighting', availability: 'Pending', initial: 0, negotiated: 0, leadTime: '', stage: 'Not Selected', selected: false }], collateral: {} };
  const labels = diffInquiry(a, b).map((c) => c.label);
  assert.ok(labels.includes('Tony Fan · Availability'));
  assert.ok(labels.includes('Tony Fan · Negotiated'));
  assert.ok(labels.includes('Tony Fan · Final price'));
  assert.ok(labels.includes('Tony Fan · Selected'));
  assert.ok(labels.includes('Quote added'));
  assert.equal(titleFor([{ label: 'Quote added', to: 'Fenteng Lighting' }]), 'Quote added — Fenteng Lighting');
});

test('margin is computed as the widget does, with no exchange rate', () => {
  const q = { srp: 2000, quotes: [{ supplier: 'Tony Fan', initial: 500, negotiated: 0, selected: true }] };
  assert.equal(margin(q), 75);
  assert.equal(margin({ srp: 0, quotes: q.quotes }), null);
  assert.equal(margin({ srp: 2000, quotes: [] }), null);
});

test('customers: unique by name; projects get the next PRJ code and belong to a customer', () => {
  const db = seedDb(TODAY);
  refused(() => go(db, 'customerCreate', { name: '  ed navarro ' }), 'INQ.CUSTOMER_DUP');
  refused(() => go(db, 'customerCreate', { name: '   ' }), 'GEN.FIELD');
  const same = go(db, 'customerCreate', { name: 'Shipping Test', type: 'Corporate', billing: { line1: '1 Main', city: 'Pasig' } });
  const c = same.customers.at(-1);
  assert.deepEqual(c.shipping, c.billing, 'shipping defaults to the billing address');
  const diff = go(db, 'customerCreate', { name: 'Split Address', sameAsBilling: false, billing: { line1: 'A' }, shipping: { line1: 'B' } });
  assert.equal(diff.customers.at(-1).shipping.line1, 'B');

  refused(() => go(db, 'projectCreate', { name: 'Orphan', customerId: '' }), 'INQ.PROJECT_CUSTOMER');
  refused(() => go(db, 'projectCreate', { name: '', customerId: c.id }), 'GEN.FIELD');
  const maxBefore = Math.max(...db.projects.map((p) => parseInt(p.code.slice(4), 10)));
  const withProject = go(same, 'projectCreate', { name: 'New Tower', customerId: c.id, groupDiscountPct: 7 });
  const prj = withProject.projects.at(-1);
  assert.equal(prj.code, `PRJ-${String(maxBefore + 1).padStart(5, '0')}`);
  assert.equal(prj.status, 'Active');
  assert.equal(prj.groupDiscountPct, 7);
});

test('catalog: an item needs an ID and a name, and the same ID updates instead of duplicating', () => {
  const db = seedDb(TODAY);
  refused(() => go(db, 'productCreate', { bookId: '', name: 'X' }), 'INQ.ITEM_ID');
  refused(() => go(db, 'productCreate', { bookId: '9', name: '' }), 'INQ.ITEM_ID');
  const d2 = go(db, 'productCreate', { bookId: '777', name: 'Test Lamp', sku: 'T-1', rate: 500 });
  const d3 = go(d2, 'productCreate', { bookId: '777', name: 'Test Lamp v2', sku: 'T-1', rate: 650 });
  assert.equal(d3.products.length, d2.products.length, 'no duplicate');
  assert.equal(d3.products.find((p) => p.bookId === '777').rate, 650);
});

test('conversation: only Fenteng and Tony have threads, only if quoted; empty messages are refused', () => {
  const db = seedDb(TODAY);
  const ed = byNo(db, 'INQ-00013');
  assert.equal(chatKey('Tony Fan'), 'Tony');
  assert.equal(chatKey('Fenteng Lighting'), 'Fenteng');
  assert.equal(chatKey('HC System'), '');
  refused(() => go(db, 'chatSend', { id: ed.id, supplier: 'Tony Fan', role: 'Buyer', message: '   ' }), 'INQ.CHAT');
  refused(() => go(db, 'chatSend', { id: ed.id, supplier: 'Fenteng Lighting', role: 'Buyer', message: 'hi' }), 'INQ.CHAT');
  refused(() => go(db, 'chatSend', { id: ed.id, supplier: 'HC System', role: 'Buyer', message: 'hi' }), 'INQ.CHAT');
  const thread = db.messages.filter((m) => m.inqNo === ed.no && m.supplier === 'Tony');
  assert.deepEqual(thread.map((m) => m.role), ['Buyer', 'Supplier']);
  const before = db.timeline.length;
  const d2 = go(db, 'chatSend', { id: ed.id, supplier: 'Tony Fan', role: 'Supplier', message: 'ok' });
  assert.equal(d2.timeline.length, before, 'a supplier reply is not a timeline entry');
  const d3 = go(db, 'chatSend', { id: ed.id, supplier: 'Tony Fan', role: 'Buyer', message: 'thanks' });
  assert.equal(d3.timeline.at(-1).title, 'Message sent to Tony');
});

test('internal notes need text and keep their author role', () => {
  const db = seedDb(TODAY);
  const ed = byNo(db, 'INQ-00013');
  refused(() => go(db, 'noteSend', { id: ed.id, role: 'HC Sales', message: ' ' }), 'GEN.FIELD');
  const d2 = go(db, 'noteSend', { id: ed.id, role: 'HC Purchasing', message: 'Checked.' });
  assert.equal(d2.notes.at(-1).role, 'HC Purchasing');
});
