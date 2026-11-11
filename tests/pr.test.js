// The Purchase Request module, ported from the live PR widget and the PR_Check_Readiness workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/domain/actions.js';
import { seedDb } from '../src/domain/seed.js';
import { RuleError } from '../src/domain/rules.js';
import {
  HOLD_REASONS, holdDays, leadDays, loadBalancing, nextStep, portfolioLoad, priceInfo, readiness, recommendedSupplier, supplierKeyMatch,
} from '../src/domain/pr.js';

const TODAY = '2026-11-11';
const ctx = { today: TODAY, now: '2026-11-11T09:30:00.000Z' };
const refused = (fn, id) => assert.throws(fn, (e) => e instanceof RuleError && e.ruleId === id, `expected refusal ${id}`);
const go = (db, name, payload) => run(db, name, payload, ctx).db;
const prOf = (db, no) => db.prs.find((p) => p.no === no);
const product = (db, pr) => db.products.find((x) => x.sku === pr.sku);

test('supplier names match loosely, because "Tony" and "Tony Fan" are one supplier', () => {
  assert.ok(supplierKeyMatch('Tony', 'Tony Fan'));
  assert.ok(supplierKeyMatch('Fenteng Lighting', 'fenteng'));
  assert.ok(!supplierKeyMatch('Tony Fan', 'Fenteng'));
  assert.ok(!supplierKeyMatch('', 'Tony'));
});

test('lead time text becomes days, for breaking price ties', () => {
  assert.equal(leadDays('2 weeks'), 14);
  assert.equal(leadDays('10 days'), 10);
  assert.equal(leadDays('1 month'), 30);
  assert.equal(leadDays('7'), 7);
  assert.equal(leadDays('soon'), null);
});

test('a PR is Ready for PO by itself when all four conditions pass, and falls back when one stops', () => {
  const db = seedDb(TODAY);
  const needsMode = prOf(db, 'PR-00004');
  assert.equal(needsMode.status, 'For Sourcing');
  const r = readiness(needsMode, product(db, needsMode));
  assert.deepEqual(r.missing, ['Shipping mode selected']);
  assert.equal(nextStep(needsMode, product(db, needsMode)).action, 'Set the shipment mode');

  const d2 = go(db, 'prEdit', { id: needsMode.id, data: { mode: 'LCL' } });
  assert.equal(prOf(d2, 'PR-00004').status, 'Ready for PO', 'no manual step: setting the mode makes it ready');
  const d3 = go(d2, 'prEdit', { id: needsMode.id, data: { mode: '' } });
  assert.equal(prOf(d3, 'PR-00004').status, 'For Sourcing', 'and removing it puts it back');
});

test('a Local PR needs no shipping mode', () => {
  const db = seedDb(TODAY);
  const local = db.prs.find((p) => p.sourcingType === 'Local');
  assert.equal(local.mode, '');
  assert.equal(local.status, 'Ready for PO');
  assert.equal(readiness(local, product(db, local)).checks[2].sub, 'Local sourcing needs no freight');
});

test('the final price follows the widget\'s priority: approved SRP, then quote, then SO rate, then catalog rate', () => {
  assert.equal(priceInfo({ srpApproved: 900, price: 100, srpRate: 50 }, { rate: 10 }).source, 'srp_approved');
  assert.equal(priceInfo({ price: 100, srpRate: 50 }, { rate: 10 }).source, 'quote');
  assert.equal(priceInfo({ price: 0, srpRate: 50 }, { rate: 10 }).source, 'srp');
  assert.equal(priceInfo({ price: 0, srpRate: 0 }, { rate: 10 }).source, 'catalog');
  assert.equal(priceInfo({ price: 0 }, { rate: 0 }).source, 'none');
  // Confirmed on its own: from an inquiry, or an item with a catalog rate. Otherwise it needs a real quote.
  assert.equal(priceInfo({ price: 0, inquiryNo: 'INQ-1' }, { rate: 0 }).approved, true);
  assert.equal(priceInfo({ price: 0 }, { rate: 25 }).approved, true);
  assert.equal(priceInfo({ price: 0 }, { rate: 0 }).approved, false);
  assert.equal(priceInfo({ price: 40 }, { rate: 0 }).approved, true);
});

test('a manual PR needs the widget\'s required fields and names what is missing', () => {
  const db = seedDb(TODAY);
  const cust = db.customers[0];
  const base = { itemId: db.products[0].id, customerId: cust.id, customerType: 'Designer', salesOwner: 'HC Sales 1', targetDate: '2026-12-20', qty: 5, sourcingType: 'Local' };
  const miss = (over) => () => go(db, 'prCreate', { data: { ...base, ...over } });
  refused(miss({ itemId: '' }), 'PR.NEW');
  refused(miss({ targetDate: '' }), 'PR.NEW');
  refused(miss({ qty: 0 }), 'PR.NEW');
  refused(miss({ customerId: '' }), 'PR.NEW');
  refused(miss({ salesOwner: '' }), 'PR.NEW');
  assert.throws(miss({ itemId: '', targetDate: '', qty: 0 }), /Missing: Item \/ SKU, Target Date, Quantity/);
  const d2 = go(db, 'prCreate', { data: base });
  const pr = d2.prs.at(-1);
  assert.equal(pr.supplier, 'HC System', 'Local sourcing forces HC System');
  assert.equal(pr.followedRecommendation, 'Yes');
  assert.equal(pr.status, 'Ready for PO', 'the item has a catalog rate, which confirms the price on its own');

  // A zero-rate item with no quote has nothing to confirm the price, so it waits for a supplier.
  const zero = go(db, 'productCreate', { bookId: 'ZERO-1', name: 'Zero Rate Lamp', sku: 'Z-1', rate: 0 });
  const d3 = go(zero, 'prCreate', { data: { ...base, itemId: zero.products.at(-1).id } });
  assert.equal(d3.prs.at(-1).status, 'For Sourcing');
  assert.deepEqual(readiness(d3.prs.at(-1), zero.products.at(-1)).missing, ['Final price confirmed']);
  const d4 = go(d3, 'prEdit', { id: d3.prs.at(-1).id, data: { price: 120 } });
  assert.equal(d4.prs.at(-1).status, 'Ready for PO', 'a real supplier quote confirms it');
});

test('choosing a supplier that is not the recommended one needs an override reason', () => {
  const db = seedDb(TODAY);
  const base = { itemId: db.products[0].id, customerId: db.customers[0].id, customerType: 'Designer', salesOwner: 'HC Sales 1', targetDate: '2026-12-20', qty: 5, supplier: 'Tony Fan', mode: 'LCL' };
  // No supplier has quoted a brand-new PR, so no recommendation exists and any choice counts as not following it.
  refused(() => go(db, 'prCreate', { data: base }), 'PR.OVERRIDE');
  const ok = go(db, 'prCreate', { data: { ...base, overrideReason: 'Client prefers Tony Fan' } });
  assert.equal(ok.prs.at(-1).followedRecommendation, 'No');
  assert.equal(ok.prs.at(-1).overrideReason, 'Client prefers Tony Fan');
});

test('approving the SRP needs an amount, confirms the price, and locks once converted', () => {
  const db = seedDb(TODAY);
  const pr = prOf(db, 'PR-00004');
  refused(() => go(db, 'prSetSrp', { id: pr.id, amount: 0 }), 'PR.SRP');
  const d2 = go(db, 'prSetSrp', { id: pr.id, amount: 5000 });
  assert.equal(priceInfo(prOf(d2, 'PR-00004'), product(d2, pr)).source, 'srp_approved');
  const converted = prOf(db, 'PR-00001');
  refused(() => go(db, 'prSetSrp', { id: converted.id, amount: 1 }), 'PR.LOCKED');
  refused(() => go(db, 'prEdit', { id: converted.id, data: { mode: 'FCL' } }), 'PR.LOCKED');
});

test('holding a PR records the date and follow-up, uses the live reasons, and resume or restore puts it back', () => {
  const db = seedDb(TODAY);
  const pr = prOf(db, 'PR-00003');
  refused(() => go(db, 'prHold', { id: pr.id, reason: 'Client undecided' }), 'PR.HOLD_REASON');
  refused(() => go(db, 'prHold', { id: pr.id, reason: 'Other', notes: '' }), 'PR.HOLD_REASON');
  assert.deepEqual(HOLD_REASONS, ['Client stopped order', 'Client payment issue', 'Client changing specs', 'Client confirmed cancel', 'Other']);
  const held = go(db, 'prHold', { id: pr.id, reason: 'Client payment issue', followUp: '2026-11-18' });
  const h = prOf(held, 'PR-00003');
  assert.equal(h.hold, 'On Hold');
  assert.equal(h.holdDate, TODAY);
  assert.equal(h.holdFollowUp, '2026-11-18');
  assert.equal(h.status, 'Ready for PO', 'the real status is never overwritten');
  assert.match(nextStep(h).action, /follow up by 2026-11-18/);
  assert.equal(holdDays({ holdDate: '2026-11-08' }, TODAY), 3);

  const cancelled = go(db, 'prHold', { id: pr.id, reason: 'Client confirmed cancel', cancel: true, followUp: '2026-11-18' });
  assert.equal(prOf(cancelled, 'PR-00003').hold, 'Cancelled');
  assert.equal(prOf(cancelled, 'PR-00003').holdFollowUp, '', 'a cancelled PR has no follow-up');
  assert.match(go(cancelled, 'prResume', { id: pr.id }).audit.at(-1).msg, /restored/);
  assert.match(go(held, 'prResume', { id: pr.id }).audit.at(-1).msg, /resumed/);
  assert.equal(prOf(go(held, 'prResume', { id: pr.id }), 'PR-00003').hold, '');
});

test('Create PO on a Sales Order group: one supplier, all ready, none already converted, held ones left out', () => {
  const db = seedDb(TODAY);
  const ready = prOf(db, 'PR-00003');
  const group = { soNo: ready.soNo, customer: ready.customer };
  const d2 = go(db, 'prGroupCreatePO', group);
  assert.equal(prOf(d2, 'PR-00003').status, 'Converted to PO');
  refused(() => go(d2, 'prGroupCreatePO', group), 'PR.GROUP_CONVERTED');

  const notReady = prOf(db, 'PR-00004');
  refused(() => go(db, 'prGroupCreatePO', { soNo: notReady.soNo, customer: notReady.customer }), 'PR.GROUP_NOT_READY');

  const mixed = structuredClone(db);
  const sibling = structuredClone(prOf(mixed, 'PR-00003'));
  Object.assign(sibling, { id: 'prX', no: 'PR-09999', supplier: 'Tony Fan' });
  mixed.prs.push(sibling);
  refused(() => go(mixed, 'prGroupCreatePO', group), 'PR.GROUP_MIXED');
  const tolerant = structuredClone(mixed);
  tolerant.prs.at(-1).supplier = 'Fenteng';
  assert.equal(go(tolerant, 'prGroupCreatePO', group).pos.at(-1).prIds.length, 2, '"Fenteng" and "Fenteng Lighting" are one supplier');

  const withHeld = structuredClone(db);
  const extra = structuredClone(prOf(withHeld, 'PR-00003'));
  Object.assign(extra, { id: 'prY', no: 'PR-09998', hold: 'On Hold', holdReason: 'Client stopped order' });
  withHeld.prs.push(extra);
  const out = go(withHeld, 'prGroupCreatePO', group);
  assert.equal(out.pos.at(-1).prIds.length, 1);
  assert.equal(out.prs.find((p) => p.id === 'prY').status, 'Ready for PO', 'the held PR was left out');
  assert.match(out.audit.at(-1).msg, /1 held or cancelled PR\(s\) were left out/);
});

test('recommendation: lowest price among eligible suppliers, lead time breaks a tie, no quote means no recommendation', () => {
  const db = seedDb(TODAY);
  const { suppliers } = db;
  const q = (supplier, initial, negotiated = 0, leadTime = '') => ({ supplier, initial, negotiated, leadTime });
  assert.equal(recommendedSupplier(suppliers, [], 'Lighting', []), '', 'nobody has quoted');
  assert.equal(recommendedSupplier(suppliers, [], 'Lighting', [q('Fenteng Lighting', 100), q('Tony Fan', 90)]), 'Tony Fan');
  assert.equal(recommendedSupplier(suppliers, [], 'Lighting', [q('Fenteng Lighting', 100, 80), q('Tony Fan', 90)]), 'Fenteng Lighting', 'a negotiated price wins over the initial price');
  assert.equal(recommendedSupplier(suppliers, [], 'Lighting', [q('Fenteng Lighting', 100, 0, '3 weeks'), q('Tony Fan', 100, 0, '2 weeks')]), 'Tony Fan', 'equal price: shorter lead time');
  assert.equal(recommendedSupplier(suppliers, [], 'Lighting', [q('Tony', 50)]), 'Tony Fan', 'loose name match');
  // Fenteng only handles Lighting and Fixtures, so it is not eligible for another category.
  const rows = loadBalancing(suppliers, [], 'Electrical', [q('Fenteng Lighting', 10), q('Tony Fan', 90)]);
  assert.equal(rows.find((r) => r.name === 'Fenteng Lighting').eligible, 'Removed');
  assert.equal(rows.find((r) => r.name === 'Tony Fan').eligible, 'Recommended');
  assert.ok(!rows.some((r) => r.name === 'Warehouse Stock'), 'stock is not a supplier to choose from');
});

test('load is counted in PO lines against capacity, with the live thresholds', () => {
  const suppliers = [{ name: 'A', handlesAll: true, categories: [], maxCapacity: 10 }, { name: 'B', handlesAll: true, categories: [], maxCapacity: 0 }];
  const po = (supplier, lines, status = 'Sent') => ({ supplier, status, prIds: Array.from({ length: lines }) });
  const status = (n) => portfolioLoad(suppliers, [po('A', n)])[0].status;
  assert.equal(status(7), 'Normal');
  assert.equal(status(8), 'Near Capacity');
  assert.equal(status(10), 'Overloaded');
  assert.equal(portfolioLoad(suppliers, [po('A', 5, 'Completed')])[0].active, 0, 'finished POs do not count');
  assert.equal(portfolioLoad(suppliers, [po('B', 99)])[1].status, 'Normal', 'no capacity set stays Normal');
  const row = loadBalancing(suppliers, [po('A', 8)], 'Lighting', [])[0];
  assert.equal(row.percent, 80);
  assert.equal(row.activePOs, 8);
});

test('converting from an inquiry carries the inquiry through to the PR', () => {
  const db = seedDb(TODAY);
  const pr = prOf(db, 'PR-00001');
  assert.match(pr.inquiryNo, /^INQ-/);
  assert.ok(pr.quotes.length > 0, 'the supplier quotes travel with the PR, so the recommendation can use them');
  assert.ok(pr.srpRate > 0);
  assert.equal(pr.category, 'Lighting');
  assert.equal(pr.currency, 'CNY');
});
