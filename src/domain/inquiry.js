// Inquiry logic shared by the workflow engine and the screens. Ported from the live Inquiry widget
// (Procurement/Inquiry/Widget/app/index.html). Nothing here is stored: readiness, status, next step
// and margin are always computed from the record, because the widget itself learned that stored
// roll-ups go stale (see its computeCollateralComplete comment).

import { fmtCNY, fmtPHP } from './util.js';

export const CUSTOMER_TYPES = ['Designer', 'Enduser', 'Corporate', 'Business Partner'];
export const SALES_OWNERS = [...Array.from({ length: 9 }, (_, i) => `HC Sales ${i + 1}`), 'HC Sales Coordinator'];
export const ORDER_TYPES = ['Normal', 'Pre Order', '(Partly) Pre Order', 'Service'];
export const COMMISSIONS = [0, 5, 10, 15, 20, 25, 30];
export const UNITS = ['pcs', 'box', 'meter', 'cm'];
export const WAITING_ON = ['None', 'Supplier', 'Internal'];
export const PROJECT_TYPES = ['Commercial', 'Residential'];
export const COLOR_TEMPS = ['2700K', '3000K', '3500K', '4000K', '4500K', '5000K'];
export const BULB_TYPES = [
  'A60 - E27', 'LED Strip', 'A60 - E27 Dimmable', 'c35 - L E14', 'c35 - L E14 Dimmable', 'Corn type E14',
  'Corn type E14 Dimmable', 'Corn type E27', 'Corn type E27 Dimmable', 'E14-Candle', 'G4', 'G4 Dimmable', 'G4 Jelly',
  'G9', 'G-95', 'G9 Dimmable', 'G45 - E27', 'G45 - E27 Dimmable', 'G80 - E27', 'G125 - E27', 'GU10', 'GU10 Dimmable', 'ST64',
];
export const COLLATERAL_VALUES = ['Pending', 'Required', 'HideToSupplier', 'Completed', 'N/A'];
export const COLLATERAL_FIELDS = [
  ['sample', 'Product Sample'], ['dImage', '3D Image'], ['drawing', 'Technical Drawing'], ['spec', 'Specifications'],
];
export const AVAILABILITY = ['Pending', 'Confirmed', 'Unavailable', 'Cannot Produce'];
export const QUOTE_STAGES = ['Not Selected', 'Negotiating', 'Final', 'Declined'];

const norm = (v) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v).trim());
const normNum = (v) => String(Number(v) || 0);
const TL_BLANKS = ['', 'No', '0', 'None', 'Pending', 'Not Selected'];
const isBlank = (v) => TL_BLANKS.includes(v);
const changed = (from, to) => from !== to && !(isBlank(from) && isBlank(to));

// ───────────── quotes ─────────────

export function emptyQuote(supplier = '') {
  return { supplier, availability: 'Pending', initial: 0, negotiated: 0, final: 0, leadTime: '', stage: 'Not Selected', selected: false };
}

// Final price is never typed: Negotiated if entered, otherwise Initial.
export function quoteFinal(q) {
  const neg = Number(q.negotiated) || 0;
  const ini = Number(q.initial) || 0;
  return neg > 0 ? neg : ini > 0 ? ini : 0;
}

export const selectedQuote = (inq) => (inq.quotes || []).find((q) => q.selected);
const confirmed = (q) => String(q.availability || '').toLowerCase() === 'confirmed';
export const collateralDone = (inq) => COLLATERAL_FIELDS.every(([k]) => ['Completed', 'N/A'].includes((inq.collateral || {})[k]));
export const srpApproved = (inq) => Number(inq.srp) > 0;

// ───────────── readiness, status, next step ─────────────

export function readiness(inq) {
  const quotes = inq.quotes || [];
  const sel = selectedQuote(inq);
  const pending = COLLATERAL_FIELDS.filter(([k]) => !['Completed', 'N/A'].includes((inq.collateral || {})[k])).length;
  const finalCost = sel ? quoteFinal(sel) : 0;
  const checks = [
    { key: 'supplier', title: 'Supplier Selected', passed: !!sel, sub: sel ? sel.supplier || 'Supplier selected' : 'No supplier selected' },
    { key: 'avail', title: 'Availability Confirmed', passed: quotes.some(confirmed), sub: quotes.some(confirmed) ? 'Stock confirmed by supplier' : 'Awaiting confirmation' },
    { key: 'price', title: 'Final Price Exists', passed: quotes.some((q) => quoteFinal(q) > 0), sub: quotes.some((q) => quoteFinal(q) > 0) ? `${finalCost > 0 ? fmtCNY(finalCost) : 'Price'} — entered` : 'No final price yet' },
    { key: 'collateral', title: 'Collateral Complete / N/A', passed: pending === 0, sub: pending === 0 ? 'All items complete or N/A' : `${pending} item(s) still pending` },
    { key: 'srp', title: 'SRP Approved', passed: srpApproved(inq), sub: srpApproved(inq) ? `${fmtPHP(inq.srp)} — approved` : 'Not yet approved' },
  ];
  const passed = checks.filter((c) => c.passed).length;
  return { checks, passed, status: passed === 5 ? 'Ready' : passed > 0 ? 'In Progress' : 'Not Ready', missing: checks.filter((c) => !c.passed).map((c) => c.title) };
}

export const statusOf = (inq) => readiness(inq).status;

// Where a record is and what happens next. Display only; it never saves anything.
export function nextStep(inq) {
  if (inq.status === 'Sales Order') return { here: `Sales Order ${inq.soNo}`, action: 'Procurement and Fulfillment take it from here', who: 'Purchasing', tone: 'done' };
  if (inq.status === 'Estimate Created') return { here: 'Estimate created', action: 'Convert the Estimate to a Sales Order', who: 'Sales', tone: 'next' };
  const st = readiness(inq).status;
  if (st === 'Ready') return { here: 'Ready for Estimate', action: 'Create the Estimate', who: 'Sales', tone: 'next' };
  const here = st === 'In Progress' ? 'Sourcing in progress' : 'New inquiry';
  const quotes = inq.quotes || [];
  if (!quotes.some(confirmed)) return { here, action: 'Supplier to confirm availability', who: 'Tony / Fenteng', tone: 'wait' };
  if (!quotes.some((q) => quoteFinal(q) > 0)) return { here, action: 'Get the final price', who: 'Purchasing', tone: 'next' };
  if (!selectedQuote(inq)) return { here, action: 'Select a supplier', who: 'Purchasing', tone: 'next' };
  if (!collateralDone(inq)) return { here, action: 'Supplier to complete collateral (photos / docs)', who: 'Tony / Fenteng', tone: 'wait' };
  return { here, action: 'Approve the SRP', who: 'Purchasing', tone: 'next' };
}

// The detail view's own, slightly different wording and order.
export function signalNext(inq) {
  const r = readiness(inq);
  if (r.passed === 5) return `Create Draft Estimate from ${inq.quoteGroup || 'the group'}`;
  const [supplier, avail, price, collateral] = r.checks;
  if (!supplier.passed) return 'Add at least one supplier quote';
  if (!avail.passed) return 'Confirm supplier availability';
  if (!price.passed) return 'Enter final price for selected supplier';
  if (!collateral.passed) return 'Complete or mark collateral as N/A';
  return 'Enter and approve SRP';
}

// Margin as the widget computes it: (SRP - selected final cost) / SRP. The cost is CNY and the SRP is
// PHP and no exchange rate is applied. That is how the original behaves, so the port keeps it.
export function margin(inq) {
  const sel = selectedQuote(inq);
  const cost = sel ? quoteFinal(sel) : 0;
  const srp = Number(inq.srp) || 0;
  if (!(srp > 0 && cost > 0)) return null;
  return Math.round(((srp - cost) / srp) * 10000) / 100;
}

// ───────────── timeline diff ─────────────

const SIMPLE_FIELDS = [
  ['sku', 'SKU'], ['qty', 'Quantity', true], ['unit', 'Unit'], ['description', 'Description'], ['targetDate', 'Target Date'],
  ['openToSimilar', 'Open to Similar Design'], ['additionalDescription', 'Additional Description'], ['customerType', 'Customer Type'],
  ['salesOwner', 'Sales Owner'], ['waitingOn', 'Waiting On'], ['specDetails', 'Specification Details'], ['dimension', 'Dimension'],
  ['colorBody', 'Color Body'], ['colorTemperature', 'Color Temperature'], ['bulbType', 'Type of Bulb'], ['voltage', 'Voltage'],
  ['lumens', 'Lumens'], ['designerArchitect', 'Designer/Architect'], ['orderType', 'Order Type'], ['commission', 'Commission', true],
  ['forBidding', 'For Bidding'], ['designCompany', 'Design Company'], ['designPartner', 'Design Partner'],
  ['addtlDiscNeeded', 'Additional Discount Needed'], ['projectType', 'Project Type'], ['groupDiscountPct', 'Group Discount %', true],
  ['srp', 'SRP Amount', true],
];

export function diffQuotes(before, after) {
  const out = [];
  const key = (q) => norm(q.supplier) || 'Unnamed supplier';
  const COLS = [['availability', 'Availability'], ['initial', 'Initial price', true], ['negotiated', 'Negotiated', true], ['final', 'Final price', true], ['leadTime', 'Lead time'], ['stage', 'Stage']];
  const bmap = {};
  const seen = {};
  before.forEach((q) => { bmap[key(q)] = q; });
  after.forEach((q) => {
    const k = key(q);
    seen[k] = 1;
    const b = bmap[k];
    if (!b) { out.push({ label: 'Quote added', to: k }); return; }
    COLS.forEach(([f, label, numeric]) => {
      const from = numeric ? normNum(f === 'final' ? quoteFinal(b) : b[f]) : norm(b[f]);
      const to = numeric ? normNum(f === 'final' ? quoteFinal(q) : q[f]) : norm(q[f]);
      if (changed(from, to)) out.push({ label: `${k} · ${label}`, from, to });
    });
    if (!!b.selected !== !!q.selected) out.push({ label: `${k} · Selected`, from: b.selected ? 'Yes' : 'No', to: q.selected ? 'Yes' : 'No' });
  });
  before.forEach((q) => { if (!seen[key(q)]) out.push({ label: 'Quote removed', to: key(q) }); });
  return out;
}

export function diffInquiry(before, after) {
  const out = [];
  [['Item', before.item, after.item], ['Customer', before.customer, after.customer], ['Project', before.projectName, after.projectName]].forEach(([label, f, t]) => {
    const from = norm(f);
    const to = norm(t);
    if (changed(from, to)) out.push({ label, from, to });
  });
  SIMPLE_FIELDS.forEach(([k, label, numeric]) => {
    const from = numeric ? normNum(before[k]) : norm(before[k]);
    const to = numeric ? normNum(after[k]) : norm(after[k]);
    if (changed(from, to)) out.push({ label, from, to });
  });
  COLLATERAL_FIELDS.forEach(([k, label]) => {
    const from = norm((before.collateral || {})[k]);
    const to = norm((after.collateral || {})[k]);
    if (changed(from, to)) out.push({ label, from, to });
  });
  return out.concat(diffQuotes(before.quotes || [], after.quotes || []));
}

// "Added Project Type" / "Updated Project Type" / "Updated 4 fields"; a lone quote add/remove reads as its own headline.
export function titleFor(changes, fallback) {
  if (!changes || !changes.length) return fallback;
  if (changes.length === 1) {
    const c = changes[0];
    if (/^Quote (added|removed)$/.test(c.label)) return `${c.label} — ${c.to}`;
    return `${isBlank(norm(c.from)) ? 'Added' : 'Updated'} ${c.label}`;
  }
  return `Updated ${changes.length} fields`;
}

// "Fenteng" or "Tony" for the two suppliers that have a chat thread; '' for everyone else.
export function chatKey(supplierName) {
  const s = String(supplierName || '');
  if (s.includes('Fenteng')) return 'Fenteng';
  if (s.includes('Tony')) return 'Tony';
  return '';
}

export function blankInquiryData() {
  return {
    customerId: '', customerType: '', itemId: '', qty: '', unit: 'pcs', sku: '', description: '', targetDate: '', salesOwner: '',
    waitingOn: 'None', orderType: 'Normal', commission: 0, forBidding: false, designCompany: '', designPartner: 'No',
    designerArchitect: '', addtlDiscNeeded: 'No', projectId: '', projectType: '', groupDiscountPct: '', openToSimilar: false,
    additionalDescription: '', specDetails: '', dimension: '', colorBody: '', colorTemperature: '', bulbType: '', voltage: '', lumens: '',
    attachments: [], similarPhotos: [],
    collateral: { sample: 'Pending', dImage: 'Pending', drawing: 'Pending', spec: 'Pending' },
    quotes: [], srp: '',
  };
}
