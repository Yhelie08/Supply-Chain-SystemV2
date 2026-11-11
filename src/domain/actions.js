// Every workflow step as a pure function: (draft db, payload, ctx) => message.
// `run()` clones the database first, so a refused step leaves the real data untouched.
// Steps throw RuleError (see rules.js) when a gate says no.

import { refuse } from './rules.js';
import { addDays, dayOfWeek, fmtPHP, todayISO } from './util.js';
import {
  AVAILABILITY, COLLATERAL_FIELDS, COLLATERAL_VALUES, QUOTE_STAGES,
  chatKey, diffInquiry, quoteFinal, readiness, selectedQuote, titleFor,
} from './inquiry.js';
import { ALL_KEYS, DEFAULTS, validateSettings } from './forecast.js';
import { EXCEPTION_TYPES } from './procurement.js';
import { DELIVERY_TYPES, TRUCKS } from './fulfillment.js';
import { SHIP_MODES, collateralEditable, inquiryStatus, prStatus, prViewOnly, quotesEditable, RR_FLOW } from './supplier.js';
import { HOLD_REASONS, PRIORITIES, isInactive, readiness as prReadiness, recommendedSupplier, supplierKeyMatch } from './pr.js';

const blank = (v) => v == null || String(v).trim() === '';

function need(ok, ruleId, detail) {
  if (!ok) refuse(ruleId, detail);
}

function get(d, coll, id) {
  const row = d[coll].find((r) => r.id === id);
  if (!row) throw new Error(`Record ${id} was not found in ${coll}.`);
  return row;
}

function nid(d, prefix) {
  d.seq += 1;
  return `${prefix}${d.seq}`;
}

function seqNo(d, key, prefix, start = 1) {
  d.counters[key] = (d.counters[key] == null ? start - 1 : d.counters[key]) + 1;
  return `${prefix}-${String(d.counters[key]).padStart(5, '0')}`;
}

const stamp = (ctx) => (ctx && ctx.now) || new Date().toISOString();

function logTimeline(d, inqNo, title, type, changes, ctx) {
  d.timeline.push({ id: nid(d, 'tl'), inqNo, title, type, actor: 'Buyer', at: stamp(ctx), changes: changes || [] });
}

export function addressOf(a) {
  if (!a) return '';
  return [a.line1, a.line2, a.city, a.state, a.zip, a.country].filter((x) => x && String(x).trim()).join(', ');
}

// Checks every quote row and returns them normalised: Final price is always computed, never typed.
function cleanQuotes(d, quotes) {
  const seen = new Set();
  let selected = 0;
  const out = (quotes || []).map((q) => {
    const supplier = String(q.supplier || '').trim();
    need(supplier, 'GEN.FIELD', 'Every quote row needs a supplier.');
    need(d.suppliers.some((s) => s.name === supplier), 'GEN.FIELD', `"${supplier}" is not a recognised supplier.`);
    need(!seen.has(supplier), 'INQ.QUOTE_DUP', `${supplier} already has a quote row on this inquiry.`);
    seen.add(supplier);
    const initial = Number(q.initial) || 0;
    const negotiated = Number(q.negotiated) || 0;
    need(initial >= 0 && negotiated >= 0, 'GEN.FIELD', 'Prices cannot be negative.');
    need(negotiated === 0 || initial > 0, 'INQ.PRICE', `${supplier}: enter the Initial price before a Negotiated price.`);
    const availability = q.availability || 'Pending';
    need(AVAILABILITY.includes(availability), 'GEN.FIELD', `"${availability}" is not a valid availability.`);
    const stage = q.stage || 'Not Selected';
    need(QUOTE_STAGES.includes(stage), 'GEN.FIELD', `"${stage}" is not a valid quote stage.`);
    if (q.selected) selected += 1;
    return { supplier, availability, initial, negotiated, final: quoteFinal({ initial, negotiated }), leadTime: String(q.leadTime || '').trim(), stage, selected: !!q.selected };
  });
  need(selected <= 1, 'INQ.ONE_SELECTED');
  return out;
}

// Inquiries of the same project and group discount share a quote group. No project, no group.
function assignQuoteGroup(d, inq) {
  if (!inq.projectId) {
    inq.quoteGroup = '';
    return;
  }
  const pct = String(inq.groupDiscountPct ?? '');
  const mate = d.inquiries.find((x) => x.id !== inq.id && x.projectId === inq.projectId && String(x.groupDiscountPct ?? '') === pct && x.quoteGroup);
  if (mate) {
    inq.quoteGroup = mate.quoteGroup;
    return;
  }
  d.counters.qg = (d.counters.qg || 0) + 1;
  inq.quoteGroup = `QG-${String(d.counters.qg).padStart(4, '0')}`;
}

// Validates the form's data the way the widget's Submit does, then writes it onto the inquiry.
function applyInquiryData(d, inq, data) {
  const m = { ...inq, ...data };
  const product = d.products.find((x) => x.id === m.itemId);
  need(!!product, 'INQ.NEW', 'Pick the Item from the catalog list. Typed text that matches no item cannot be saved.');
  const customer = d.customers.find((x) => x.id === m.customerId);
  need(!!customer, 'INQ.NEW', 'Pick the Customer from the list. Typed text that matches no customer cannot be saved.');
  const customerType = blank(m.customerType) ? customer.type : m.customerType;
  need(!blank(customerType), 'INQ.NEW', 'Please select a Customer Type.');
  need(!blank(m.salesOwner), 'INQ.NEW', 'Please select a Sales Owner.');
  need(!blank(m.targetDate), 'INQ.NEW', 'Please enter a Target Date.');
  const qty = Number(m.qty);
  need(Number.isInteger(qty) && qty > 0, 'INQ.NEW', 'Please enter a Quantity greater than 0.');
  let project = null;
  if (!blank(m.projectId)) {
    project = d.projects.find((x) => x.id === m.projectId);
    need(!!project, 'INQ.PROJECT_CUSTOMER', 'That project does not exist.');
    need(project.customerId === customer.id, 'INQ.PROJECT_CUSTOMER', `"${project.name}" belongs to a different customer.`);
  }
  const quotes = cleanQuotes(d, m.quotes);
  const srp = Number(m.srp) || 0;
  need(srp >= 0, 'GEN.FIELD', 'SRP cannot be negative.');
  const collateral = {};
  COLLATERAL_FIELDS.forEach(([k, label]) => {
    const v = (m.collateral || {})[k] || 'Pending';
    need(COLLATERAL_VALUES.includes(v), 'GEN.FIELD', `"${v}" is not a valid ${label} value.`);
    collateral[k] = v;
  });
  Object.assign(inq, {
    itemId: product.id, item: product.name, customerId: customer.id, customer: customer.name, customerType,
    projectId: project ? project.id : '', projectName: project ? project.name : '',
    projectType: blank(m.projectType) ? (project && project.type) || '' : m.projectType,
    qty, unit: blank(m.unit) ? product.unit || 'pcs' : m.unit,
    sku: blank(m.sku) ? product.sku : m.sku, description: blank(m.description) ? product.description : m.description,
    targetDate: m.targetDate, salesOwner: m.salesOwner, waitingOn: m.waitingOn || 'None', orderType: m.orderType || 'Normal',
    commission: Number(m.commission) || 0, forBidding: !!m.forBidding, designCompany: m.designCompany || '',
    designPartner: m.designPartner || 'No', designerArchitect: m.designerArchitect || '', addtlDiscNeeded: m.addtlDiscNeeded || 'No',
    groupDiscountPct: blank(m.groupDiscountPct) ? '' : Number(m.groupDiscountPct), openToSimilar: !!m.openToSimilar,
    additionalDescription: m.additionalDescription || '', specDetails: m.specDetails || '',
    dimension: m.dimension || '', colorBody: m.colorBody || '', colorTemperature: m.colorTemperature || '',
    bulbType: m.bulbType || '', voltage: m.voltage || '', lumens: m.lumens || '',
    attachments: m.attachments || [], similarPhotos: m.similarPhotos || [], collateral, quotes, srp,
  });
}

// The PR_Check_Readiness workflow: after any change, a PR that has not been converted is Ready for PO exactly
// when all four conditions pass, and goes back to For Sourcing when one stops passing.
function refreshPrStatus(d, pr) {
  if (pr.status === 'Converted to PO') return;
  const product = d.products.find((x) => x.sku === pr.sku);
  pr.status = prReadiness(pr, product).ready ? 'Ready for PO' : 'For Sourcing';
}

// One PO per supplier. The supplier names are matched loosely ("Tony" and "Tony Fan" are one supplier).
function convertPRs(d, prs) {
  const groups = [];
  for (const pr of prs) {
    const g = groups.find((x) => supplierKeyMatch(x.supplier, pr.supplier));
    if (g) g.rows.push(pr); else groups.push({ supplier: pr.supplier, rows: [pr] });
  }
  const made = [];
  for (const { supplier, rows } of groups) {
    const po = {
      id: nid(d, 'po'), no: seqNo(d, 'po', 'PO'), supplier, prIds: rows.map((g) => g.id), prNos: rows.map((g) => g.no), mode: rows[0].mode,
      qty: rows.reduce((t, g) => t + g.qty, 0), total: rows.reduce((t, g) => t + g.qty * (g.price || 0), 0), currency: rows[0].currency || 'PHP',
      status: 'Draft', etd: '', eta: '', ackAt: '',
    };
    d.pos.push(po);
    rows.forEach((g) => { g.status = 'Converted to PO'; g.poNo = po.no; });
    made.push(po.no);
  }
  return made;
}

// Payment is settled when paid, on credit terms, or covered by an override that has not expired.
export function paymentOK(item, today) {
  if (item.payment === 'Paid' || item.payment === 'Credit') return true;
  return !!(item.override && item.override.until >= today);
}

function findSlot(d, sr, today) {
  const start = sr.initialDate && sr.initialDate > today ? sr.initialDate : today;
  for (let i = 0; i < 14; i += 1) {
    const date = addDays(start, i);
    if (dayOfWeek(date) === 0) continue;
    let best = null;
    for (const team of d.teams) {
      if (team.off.includes(date)) continue;
      const load = d.serviceRequests.filter(
        (s) => s.team === team.id && s.scheduledDate === date && (s.status === 'Scheduled' || s.status === 'Ongoing'),
      ).length;
      if (load < team.capacity && (!best || load < best.load)) best = { team, load };
    }
    if (best) return { team: best.team, date };
  }
  return null;
}

// A PO is Completed once every one of its shipments has arrived and been received in full.
function completePO(d, rcv, notes) {
  const po = d.pos.find((x) => x.no === rcv.poNo);
  if (!po || po.status !== 'Confirmed') return;
  const ships = d.shipments.filter((s) => s.poId === po.id);
  const done = (s) => s.status === 'Arrived' && d.receivings.filter((x) => x.shipmentId === s.id).every((x) => x.status === 'Received');
  if (ships.length && ships.every(done)) {
    po.status = 'Completed';
    notes.push(`${po.no} is Completed.`);
  }
}

// Acknowledging a PO and approving a replacement are shared by the buyer-side steps and the supplier portal steps.
function acknowledgePO(d, p) {
  const po = get(d, 'pos', p.id);
  need(!po.ackAt, 'PO.ACK_ONCE');
  need(po.status === 'Sent', 'GEN.STATE', 'Send the PO before it can be acknowledged.');
  need(!blank(p.etd) && !blank(p.eta), 'PO.ACK_DATES');
  need(p.eta >= p.etd, 'PO.ACK_DATES', 'The ETA cannot be before the ETD.');
  po.etd = p.etd;
  po.eta = p.eta;
  po.ackAt = new Date().toISOString();
  po.status = 'Confirmed';
  const prs = d.prs.filter((x) => po.prIds.includes(x.id));
  const prNos = prs.map((x) => x.no);
  const itemName = prs.map((x) => x.item).join(', ');
  let ship = d.shipments.find((s) => s.poId === po.id);
  if (!ship) {
    ship = {
      id: nid(d, 'shp'), no: seqNo(d, 'shp', 'SHP'), poId: po.id, poNo: po.no, rrNo: '',
      supplier: po.supplier, mode: po.mode, item: itemName, qty: po.qty, prNos,
      etd: po.etd, eta: po.eta, dateShipped: '', status: 'Pending',
    };
    d.shipments.push(ship);
  }
  if (!d.receivings.find((r) => r.shipmentId === ship.id)) {
    d.receivings.push({
      id: nid(d, 'rcv'), no: seqNo(d, 'rcv', 'RCV'), shipmentId: ship.id, shipmentNo: ship.no,
      poNo: po.no, rrId: '', supplier: po.supplier, item: itemName, prNos, itemId: '',
      expected: po.qty, accepted: 0, damaged: 0, missing: 0, status: 'Open',
    });
  }
  return `${po.no} acknowledged. ${ship.no} and its Receiving are ready.`;
}

function approveRR(d, p) {
  const rr = get(d, 'rrs', p.id);
  need(rr.status === 'Open', 'RR.ONCE');
  need(!blank(p.expShip) && !blank(p.eta), 'RR.DATES');
  need(p.eta >= p.expShip, 'RR.DATES', 'The ETA cannot be before the Expected Ship Date.');
  rr.expShip = p.expShip;
  rr.eta = p.eta;
  rr.status = 'Acknowledged';
  const exc = d.exceptions.find((e) => e.id === rr.excId);
  const origin = exc && d.shipments.find((s) => s.no === exc.shipmentNo);
  const ship = {
    id: nid(d, 'shp'), no: seqNo(d, 'shp', 'SHP'), poId: '', poNo: '', rrNo: rr.no, supplier: rr.supplier,
    mode: p.mode || (origin ? origin.mode : 'Airfreight'), item: rr.item, qty: rr.qty, prNos: exc ? exc.prNos : [],
    etd: rr.expShip, eta: rr.eta, dateShipped: '', status: 'Pending',
  };
  d.shipments.push(ship);
  d.receivings.push({
    id: nid(d, 'rcv'), no: seqNo(d, 'rcv', 'RCV'), shipmentId: ship.id, shipmentNo: ship.no, poNo: '',
    rrId: rr.id, supplier: rr.supplier, item: rr.item, prNos: ship.prNos, itemId: exc ? exc.itemId : '',
    expected: rr.qty, accepted: 0, damaged: 0, missing: 0, status: 'Open',
  });
  return `${rr.no} approved. Replacement ${ship.no} created.`;
}

export const ACTIONS = {
  // ───────────────────────────── Inquiry ─────────────────────────────
  inquiryCreate(d, p, ctx) {
    const inq = {
      id: nid(d, 'inq'), no: seqNo(d, 'inq', 'INQ'), status: 'Open', estimateNo: '', soNo: '', quoteGroup: '',
      suppliers: d.suppliers.filter((s) => !s.stock).map((s) => s.name), createdAt: stamp(ctx),
    };
    applyInquiryData(d, inq, p.data || {});
    assignQuoteGroup(d, inq);
    d.inquiries.push(inq);
    d.last = inq.id;
    const files = inq.attachments.length + inq.similarPhotos.length;
    logTimeline(d, inq.no, 'Inquiry created', 'Created', [
      { label: 'Item', to: inq.item },
      { label: 'Customer', to: inq.customer },
      { label: 'Quantity', to: `${inq.qty} ${inq.unit}` },
      { label: 'Target Date', to: inq.targetDate },
      { label: 'Sales Owner', to: inq.salesOwner },
      ...(inq.projectName ? [{ label: 'Project', to: inq.projectName }] : []),
      ...(inq.quotes.length ? [{ label: 'Supplier quotes', to: `${inq.quotes.length} row(s)` }] : []),
      ...(files ? [{ label: 'Attachments', to: `${files} file(s)` }] : []),
    ], ctx);
    return `${inq.no} saved.`;
  },

  inquiryUpdate(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    need(inq.status !== 'Sales Order', 'INQ.LOCKED');
    const before = structuredClone(inq);
    applyInquiryData(d, inq, p.data || {});
    assignQuoteGroup(d, inq);
    const changes = diffInquiry(before, inq);
    if (!changes.length) return `${inq.no}: nothing was changed.`;
    logTimeline(d, inq.no, titleFor(changes, 'Updated inquiry'), 'Updated', changes, ctx);
    return `${inq.no} updated.`;
  },

  inquiryDelete(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    need(inq.status !== 'Sales Order', 'INQ.LOCKED');
    d.inquiries = d.inquiries.filter((x) => x.id !== inq.id);
    // The timeline keeps its rows, so INQ_No still has a trail of what happened to a deleted inquiry.
    logTimeline(d, inq.no, 'Inquiry deleted', 'Deleted', [{ label: 'Item', to: inq.item }, { label: 'Customer', to: inq.customer }], ctx);
    return `${inq.no} deleted.`;
  },

  inquiryApproveSrp(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    need(inq.status !== 'Sales Order', 'INQ.LOCKED');
    const amount = Number(p.amount);
    need(amount > 0, 'INQ.SRP');
    const previous = Number(inq.srp) || 0;
    inq.srp = amount;
    logTimeline(d, inq.no, 'SRP approved', 'Approval', [
      { label: 'SRP Amount', from: previous > 0 ? fmtPHP(previous) : '', to: fmtPHP(amount) },
      { label: 'SRP Status', from: 'Pending', to: 'Approved' },
    ], ctx);
    return `SRP of ${fmtPHP(amount)} approved for ${inq.no}.`;
  },

  inquiryEstimate(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    need(inq.status !== 'Sales Order', 'INQ.LOCKED');
    const r = readiness(inq);
    need(r.status === 'Ready', 'INQ.READY', `${inq.no} is not ready for an estimate. Still missing: ${r.missing.join(', ')}.`);
    need(!blank(inq.projectId), 'INQ.PROJECT', 'No project assigned. Link a project to this inquiry first.');
    const isUpdate = inq.status === 'Estimate Created';
    const group = d.inquiries.filter(
      (x) => x.id === inq.id || (x.status !== 'Sales Order' && ((inq.quoteGroup && x.quoteGroup === inq.quoteGroup) || x.projectId === inq.projectId)),
    );
    const targets = group.filter((x) => readiness(x).status === 'Ready');
    const estimateNo = inq.estimateNo || (group.find((x) => x.estimateNo) || {}).estimateNo || seqNo(d, 'est', 'EST');
    targets.forEach((x) => {
      x.estimateNo = estimateNo;
      x.status = 'Estimate Created';
      logTimeline(d, x.no, isUpdate && x.id === inq.id ? 'Estimate updated' : 'Estimate created', 'Estimate', [
        { label: 'Quote group', to: x.quoteGroup },
        { label: 'Estimate No', to: estimateNo },
      ].filter((c) => !blank(c.to)), ctx);
    });
    const others = targets.length - 1;
    return `${estimateNo} ${isUpdate ? 'updated' : 'created'} for ${inq.no}${others > 0 ? ` and ${others} other ready inquir${others === 1 ? 'y' : 'ies'}` : ''}.`;
  },

  inquiryApprove(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    need(inq.status === 'Estimate Created', 'GEN.STATE', 'Only an inquiry with an estimate can become a Sales Order.');
    const sel = selectedQuote(inq);
    const sup = d.suppliers.find((s) => s.name === sel.supplier);
    const stock = !!(sup && sup.stock);
    const local = !!(sup && sup.local);
    const customer = get(d, 'customers', inq.customerId);
    const soNo = seqNo(d, 'so', 'SO', 16601);
    let prNo = '';
    if (!stock) {
      prNo = seqNo(d, 'pr', 'PR');
      const product = d.products.find((x) => x.id === inq.itemId) || {};
      const pr = {
        id: nid(d, 'pr'), no: prNo, soNo, customer: inq.customer, customerType: inq.customerType, salesOwner: inq.salesOwner,
        item: inq.item, sku: inq.sku, description: inq.description, category: product.category || '', qty: inq.qty, unit: inq.unit,
        supplier: sel.supplier, mode: local ? '' : p.mode || '', sourcingType: local ? 'Local' : 'Import', priority: 'MEDIUM',
        targetDate: inq.targetDate, price: quoteFinal(sel), currency: local ? 'PHP' : 'CNY', lead: sel.leadTime, srpRate: Number(inq.srp) || 0,
        srpApproved: 0, inquiryNo: inq.no, quotes: structuredClone(inq.quotes), followedRecommendation: '', overrideReason: '',
        similarItem: !!inq.openToSimilar, attachments: [], status: 'For Sourcing', hold: '', holdReason: '', holdNotes: '',
        holdDate: '', holdFollowUp: '', heldBy: '', poNo: '', createdAt: stamp(ctx),
      };
      refreshPrStatus(d, pr);
      d.prs.push(pr);
    }
    d.items.push({
      id: nid(d, 'it'), soNo, customer: inq.customer, address: addressOf(customer.shipping), name: inq.item, qty: inq.qty,
      prNo, supplier: sel.supplier, pac: '', payment: p.payment || 'Unpaid', override: null, picker: '', packer: '',
      checker: '', forCrate: !!p.forCrate, crateStatus: '', qcStatus: '', stage: 'Readiness Gate', received: stock, srNo: '', createdOn: ctx.today, gateOn: '',
    });
    inq.status = 'Sales Order';
    inq.soNo = soNo;
    logTimeline(d, inq.no, 'Sales Order created', 'Approval', [
      { label: 'Sales Order', to: soNo },
      ...(prNo ? [{ label: 'Purchase Request', to: prNo }] : [{ label: 'Source', to: 'Warehouse stock' }]),
    ], ctx);
    return prNo ? `${soNo} created. ${prNo} raised for ${sel.supplier}.` : `${soNo} created. The item is in stock, so it goes straight to the Readiness Gate.`;
  },

  // ───────────────────── Inquiry: customers, projects, catalog ─────────────────────
  customerCreate(d, p) {
    const name = String(p.name || '').trim();
    need(name, 'GEN.FIELD', 'Customer Name is required.');
    need(!d.customers.some((c) => c.name.toLowerCase() === name.toLowerCase()), 'INQ.CUSTOMER_DUP', `A customer named "${name}" already exists.`);
    const blankAddr = { line1: '', line2: '', city: '', state: '', zip: '', country: '' };
    const billing = { ...blankAddr, ...(p.billing || {}) };
    const shipping = p.sameAsBilling === false ? { ...blankAddr, ...(p.shipping || {}) } : { ...billing };
    const row = {
      id: nid(d, 'cus'), name, type: p.type || '', companyName: p.companyName || '', email: p.email || '',
      phone: p.phone || '', mobile: p.mobile || '', billing, shipping,
    };
    d.customers.push(row);
    d.last = row.id;
    return `Customer "${name}" created.`;
  },

  projectCreate(d, p) {
    const name = String(p.name || '').trim();
    need(name, 'GEN.FIELD', 'Project Name is required.');
    need(d.customers.some((c) => c.id === p.customerId), 'INQ.PROJECT_CUSTOMER', 'Select a customer first. A project cannot exist without one.');
    let max = 0;
    d.projects.forEach((x) => {
      const m = /PRJ-(\d+)/.exec(x.code);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    const row = {
      id: nid(d, 'prj'), code: `PRJ-${String(max + 1).padStart(5, '0')}`, name, customerId: p.customerId,
      type: p.type || '', groupDiscountPct: Number(p.groupDiscountPct) || 0, status: 'Active',
    };
    d.projects.push(row);
    d.last = row.id;
    return `Project ${row.code} "${name}" created.`;
  },

  productCreate(d, p) {
    const bookId = String(p.bookId || '').trim();
    const name = String(p.name || '').trim();
    need(bookId && name, 'INQ.ITEM_ID');
    const fields = { bookId, name, sku: p.sku || '', description: p.description || '', unit: p.unit || 'pcs', rate: Number(p.rate) || 0, category: p.category || 'Lighting' };
    const existing = d.products.find((x) => x.bookId === bookId);
    if (existing) {
      Object.assign(existing, fields);
      d.last = existing.id;
      return `Item ${bookId} updated in the catalog.`;
    }
    const row = { id: nid(d, 'prd'), ...fields };
    d.products.push(row);
    d.last = row.id;
    return `Item "${name}" added to the catalog.`;
  },

  // ───────────────────── Inquiry: conversations ─────────────────────
  chatSend(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    const supplier = chatKey(p.supplier);
    need(supplier && inq.quotes.some((q) => chatKey(q.supplier) === supplier), 'INQ.CHAT', `${p.supplier || 'That supplier'} has no quote on ${inq.no}, so there is no conversation to join.`);
    const message = String(p.message || '').trim();
    need(message, 'INQ.CHAT');
    const role = p.role === 'Supplier' ? 'Supplier' : 'Buyer';
    d.messages.push({ id: nid(d, 'msg'), inqNo: inq.no, supplier, role, sender: role === 'Buyer' ? 'Buyer' : supplier, message, at: stamp(ctx) });
    if (role === 'Buyer') logTimeline(d, inq.no, `Message sent to ${supplier}`, 'Message', [{ label: 'Message', to: message }], ctx);
    return role === 'Buyer' ? `Message sent to ${supplier}.` : `${supplier} replied.`;
  },

  noteSend(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    const message = String(p.message || '').trim();
    need(message, 'GEN.FIELD', 'Type a message first.');
    const role = p.role === 'HC Purchasing' ? 'HC Purchasing' : 'HC Sales';
    d.notes.push({ id: nid(d, 'note'), inqNo: inq.no, role, message, at: stamp(ctx) });
    return `Note added as ${role}.`;
  },

  // ───────────────────────── Purchase Request ─────────────────────────
  // A PR becomes "Ready for PO" by itself when its four conditions pass (the PR_Check_Readiness workflow),
  // so there is no manual "mark ready" step. Every step below that can change a condition recomputes it.
  prCreate(d, p, ctx) {
    const x = p.data || {};
    const product = d.products.find((i) => i.id === x.itemId);
    const customer = d.customers.find((c) => c.id === x.customerId);
    const missing = [];
    if (!product) missing.push('Item / SKU');
    if (blank(x.targetDate)) missing.push('Target Date');
    if (!(Number(x.qty) > 0)) missing.push('Quantity');
    if (!customer) missing.push('Customer');
    if (blank(x.customerType) && !(customer && customer.type)) missing.push('Customer Type');
    if (blank(x.salesOwner)) missing.push('Sales Owner');
    need(missing.length === 0, 'PR.NEW', `Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' (+more)' : ''}`);
    const local = x.sourcingType === 'Local';
    const supplier = local ? 'HC System' : x.supplier || '';
    if (supplier) need(d.suppliers.some((s) => s.name === supplier && !s.stock), 'GEN.FIELD', `"${supplier}" is not a recognised supplier.`);
    const recommended = recommendedSupplier(d.suppliers, d.pos, product.category, []);
    const followed = local ? 'Yes' : supplier ? (supplierKeyMatch(supplier, recommended) ? 'Yes' : 'No') : '';
    need(!(followed === 'No' && blank(x.overrideReason)), 'PR.OVERRIDE');
    const pr = {
      id: nid(d, 'pr'), no: seqNo(d, 'pr', 'PR'), soNo: x.soNo || '', customer: customer.name, customerType: x.customerType || customer.type,
      salesOwner: x.salesOwner, item: product.name, sku: product.sku, description: product.description, category: product.category || '',
      qty: Number(x.qty), unit: x.unit || product.unit || 'pcs', supplier, mode: local ? '' : x.mode || '', sourcingType: local ? 'Local' : 'Import',
      priority: x.priority || 'MEDIUM', targetDate: x.targetDate, price: Number(x.price) || 0, currency: local ? 'PHP' : 'CNY', lead: '',
      srpRate: 0, srpApproved: 0, inquiryNo: '', quotes: [], followedRecommendation: followed, overrideReason: followed === 'No' ? x.overrideReason : '',
      similarItem: !!x.similarItem, attachments: x.attachments || [], status: 'For Sourcing', hold: '', holdReason: '', holdNotes: '',
      holdDate: '', holdFollowUp: '', heldBy: '', poNo: '', createdAt: stamp(ctx),
    };
    refreshPrStatus(d, pr);
    d.prs.push(pr);
    d.last = pr.id;
    return `${pr.no} created${pr.status === 'Ready for PO' ? ' and is Ready for PO' : ''}.`;
  },

  prEdit(d, p) {
    const pr = get(d, 'prs', p.id);
    need(pr.status !== 'Converted to PO', 'PR.LOCKED');
    const x = p.data || {};
    if (x.supplier !== undefined && x.supplier !== pr.supplier && !blank(x.supplier)) {
      need(pr.sourcingType !== 'Local', 'GEN.STATE', 'A Local PR is always sourced from HC System.');
      need(d.suppliers.some((s) => s.name === x.supplier && !s.stock), 'GEN.FIELD', `"${x.supplier}" is not a recognised supplier.`);
      pr.supplier = x.supplier;
      if (pr.sourcingType !== 'Local') {
        const recommended = recommendedSupplier(d.suppliers, d.pos, pr.category, pr.quotes);
        const followed = supplierKeyMatch(x.supplier, recommended) ? 'Yes' : 'No';
        const reason = blank(x.overrideReason) ? pr.overrideReason : x.overrideReason;
        need(!(followed === 'No' && recommended && blank(reason)), 'PR.OVERRIDE', `${x.supplier} is not the recommended supplier (${recommended}). Give a reason for overriding it.`);
        pr.followedRecommendation = followed;
        pr.overrideReason = followed === 'No' ? reason || '' : '';
      }
    }
    if (x.mode !== undefined) pr.mode = pr.sourcingType === 'Local' ? '' : x.mode;
    if (x.priority !== undefined) { need(PRIORITIES.includes(x.priority), 'GEN.FIELD', 'Priority must be HIGH, MEDIUM or LOW.'); pr.priority = x.priority; }
    if (x.price !== undefined) pr.price = Math.max(0, Number(x.price) || 0);
    if (x.targetDate !== undefined) pr.targetDate = x.targetDate;
    if (x.qty !== undefined) { need(Number(x.qty) > 0, 'GEN.FIELD', 'Quantity must be above zero.'); pr.qty = Number(x.qty); }
    refreshPrStatus(d, pr);
    return `${pr.no} updated${pr.status === 'Ready for PO' ? ' and is Ready for PO' : ''}.`;
  },

  prSetSrp(d, p) {
    const pr = get(d, 'prs', p.id);
    need(pr.status !== 'Converted to PO', 'PR.LOCKED');
    const amount = Number(p.amount);
    need(amount > 0, 'PR.SRP');
    pr.srpApproved = amount;
    refreshPrStatus(d, pr);
    return `SRP of ${fmtPHP(amount)} approved for ${pr.no}.`;
  },

  prHold(d, p, { today }) {
    const pr = get(d, 'prs', p.id);
    need(pr.status !== 'Converted to PO', 'PR.LOCKED');
    need(!blank(p.reason) && HOLD_REASONS.includes(p.reason), 'PR.HOLD_REASON');
    need(p.reason !== 'Other' || !blank(p.notes), 'PR.HOLD_REASON', 'The reason "Other" needs notes.');
    pr.hold = p.cancel ? 'Cancelled' : 'On Hold';
    pr.holdReason = p.reason;
    pr.holdNotes = p.notes || '';
    pr.holdDate = today;
    pr.holdFollowUp = p.cancel ? '' : p.followUp || '';
    pr.heldBy = 'Buyer';
    return `${pr.no} ${pr.hold === 'Cancelled' ? 'cancelled' : 'put on hold'}.`;
  },

  prResume(d, p) {
    const pr = get(d, 'prs', p.id);
    need(!!pr.hold, 'GEN.STATE', 'This PR is not on hold or cancelled.');
    const was = pr.hold;
    Object.assign(pr, { hold: '', holdReason: '', holdNotes: '', holdDate: '', holdFollowUp: '', heldBy: '' });
    refreshPrStatus(d, pr);
    return `${pr.no} ${was === 'Cancelled' ? 'restored' : 'resumed'}.`;
  },

  prConvert(d, p) {
    const ids = p.ids || (p.id ? [p.id] : []);
    need(ids.length > 0, 'GEN.FIELD', 'Select at least one PR.');
    const prs = ids.map((id) => get(d, 'prs', id));
    for (const pr of prs) {
      need(!pr.hold, 'PR.HELD', `${pr.no} is ${pr.hold}, so it cannot be converted.`);
      need(pr.status === 'Ready for PO', 'PR.NOT_READY', `${pr.no} is ${pr.status}. It must be Ready for PO first.`);
    }
    return `Created ${convertPRs(d, prs).join(', ')}. The PRs are now locked.`;
  },

  // "Create PO" on a Sales Order group: every active PR of that order, to one supplier, in one go.
  prGroupCreatePO(d, p) {
    const rows = d.prs.filter((x) => x.soNo === p.soNo && x.customer === p.customer);
    need(rows.length > 0, 'GEN.FIELD', 'No PRs in this group.');
    const active = rows.filter((x) => !isInactive(x));
    need(active.length > 0, 'PR.HELD', 'Every PR in this group is on hold or cancelled.');
    const suppliers = [];
    active.forEach((x) => { if (!suppliers.some((s) => supplierKeyMatch(s, x.supplier))) suppliers.push(x.supplier); });
    need(suppliers.length === 1, 'PR.GROUP_MIXED', `Mixed suppliers in this group (${suppliers.join(', ')}). A PO can only go to one supplier.`);
    need(active.every((x) => x.status !== 'Converted to PO'), 'PR.GROUP_CONVERTED');
    need(active.every((x) => x.status === 'Ready for PO'), 'PR.GROUP_NOT_READY', `Not all PRs in this group are Ready for PO (${active.filter((x) => x.status !== 'Ready for PO').map((x) => x.no).join(', ')}).`);
    const made = convertPRs(d, active);
    const skipped = rows.length - active.length;
    return `${made.join(', ')} created for ${p.soNo}.${skipped ? ` ${skipped} held or cancelled PR(s) were left out.` : ''}`;
  },

  // ───────────────────────────── Purchase Order ─────────────────────────────
  poSend(d, p) {
    const po = get(d, 'pos', p.id);
    need(po.status === 'Draft', 'GEN.STATE', 'Only a Draft PO can be sent.');
    const sup = d.suppliers.find((s) => s.name === po.supplier);
    need(!!sup && !sup.stock, 'PO.SUPPLIER', `"${po.supplier}" is not a recognised supplier, so ${po.no} cannot be sent.`);
    po.status = 'Sent';
    return sup.local ? `${po.no} issued. It is a Local PO, so it never reaches accounting.` : `${po.no} sent to ${po.supplier}.`;
  },

  poAcknowledge(d, p) {
    return acknowledgePO(d, p);
  },

  poCancel(d, p, { today }) {
    const po = get(d, 'pos', p.id);
    need(['Draft', 'Sent', 'Confirmed'].includes(po.status), 'PO.CANCEL', `${po.no} is ${po.status}, so it cannot be cancelled.`);
    need(!blank(p.reason), 'PO.CANCEL', 'Give a reason for cancelling the PO.');
    const ships = d.shipments.filter((s) => s.poId === po.id);
    need(ships.every((s) => s.status === 'Pending'), 'PO.CANCEL', 'Goods have already shipped, so the PO cannot be cancelled.');
    po.status = 'Cancelled';
    po.cancelReason = String(p.reason).trim();
    po.cancelledOn = today;
    const shipIds = ships.map((s) => s.id);
    d.shipments = d.shipments.filter((s) => !shipIds.includes(s.id));
    d.receivings = d.receivings.filter((r) => !shipIds.includes(r.shipmentId));
    d.prs.filter((x) => po.prIds.includes(x.id)).forEach((x) => {
      x.poNo = '';
      x.status = 'For Sourcing';
      refreshPrStatus(d, x);
    });
    return `${po.no} cancelled. Its PRs are back in the queue.`;
  },

  // ───────────────────────────── Shipments ─────────────────────────────
  shipmentTransit(d, p, { today }) {
    const s = get(d, 'shipments', p.id);
    need(s.status === 'Pending', 'GEN.STATE', 'Only a Pending shipment can be put In Transit.');
    s.status = 'In Transit';
    s.dateShipped = today;
    return `${s.no} is in transit.`;
  },

  shipmentArrive(d, p) {
    const s = get(d, 'shipments', p.id);
    need(s.status === 'In Transit', 'SHP.TRANSIT');
    s.status = 'Arrived';
    const rcv = d.receivings.find((r) => r.shipmentId === s.id);
    return `${s.no} arrived. ${rcv ? rcv.no : 'Its Receiving'} is open.`;
  },

  // ───────────────────────────── Receiving ─────────────────────────────
  receive(d, p, { today }) {
    const r = get(d, 'receivings', p.id);
    const ship = get(d, 'shipments', r.shipmentId);
    need(ship.status === 'Arrived', 'RCV.ARRIVED');
    need(r.status === 'Open' || r.status === 'Partial', 'GEN.STATE', 'This receiving is already closed.');
    const a = Number(p.accepted || 0);
    const dm = Number(p.damaged || 0);
    const m = Number(p.missing || 0);
    need([a, dm, m].every((x) => Number.isInteger(x) && x >= 0) && a + dm + m > 0, 'RCV.NUMBERS');
    const acc = r.accepted + a;
    const dmg = r.damaged + dm;
    const mis = r.missing + m;
    need(
      acc + dmg + mis <= r.expected,
      'RCV.TOTAL',
      `Accepted ${acc} + Damaged ${dmg} + Missing ${mis} = ${acc + dmg + mis}, which is more than the ${r.expected} expected.`,
    );
    Object.assign(r, { accepted: acc, damaged: dmg, missing: mis, lastReceived: today });
    const sum = acc + dmg + mis;
    r.status = acc === r.expected ? 'Received' : sum === r.expected ? 'Closed – Exceptions' : 'Partial';
    const notes = [];
    if (dm + m > 0) {
      const type = dm && m ? 'Damaged + Missing' : dm ? 'Damaged' : 'Missing';
      const exc = {
        id: nid(d, 'exc'), no: seqNo(d, 'exc', 'EXC'), source: 'Procurement', receivingNo: r.no,
        shipmentNo: ship.no, poNo: r.poNo, supplier: r.supplier, item: r.item, type, qty: dm + m,
        prNos: r.prNos, itemId: '', status: 'Open', rrNo: '', raisedOn: today,
      };
      d.exceptions.push(exc);
      notes.push(`${exc.no} raised (${type}, ${dm + m}).`);
    }
    if (r.status === 'Received') {
      completePO(d, r, notes);
      d.items.forEach((it) => {
        if (it.prNo && r.prNos.includes(it.prNo)) it.received = true;
      });
      if (r.rrId) {
        const rr = get(d, 'rrs', r.rrId);
        rr.status = 'Received';
        const exc = d.exceptions.find((e) => e.no === rr.excNo);
        if (exc) exc.status = 'Closed';
        if (r.itemId) {
          const it = d.items.find((x) => x.id === r.itemId);
          if (it) it.qcStatus = 'Replacement received';
        }
      }
      notes.push('Items are now available to Fulfillment.');
    }
    return `${r.no}: ${r.status}. ${notes.join(' ')}`.trim();
  },

  // ───────────────────── Exceptions and replacements ─────────────────────
  exceptionCreateRR(d, p, { today }) {
    const exc = get(d, 'exceptions', p.id);
    need(exc.source !== 'Fulfillment' || exc.fcStatus === 'Unrepairable', 'EC.RR', `${exc.no} is a QC reject. Mark it Unrepairable in Exception Control before asking for a replacement.`);
    need((exc.status === 'Open' || exc.status === 'Under Review') && blank(exc.rrNo), 'EXC.DUP', `${exc.no} already has ${exc.rrNo || 'a Replacement Request'}.`);
    const supplier = p.supplier || exc.supplier;
    need(!blank(supplier), 'EXC.SUPPLIER');
    const rr = {
      id: nid(d, 'rr'), no: seqNo(d, 'rr', 'RR'), excNo: exc.no, excId: exc.id, source: exc.source,
      supplier, item: exc.item, qty: exc.qty, status: 'Open', expShip: '', eta: '', raisedOn: today,
    };
    d.rrs.push(rr);
    exc.rrNo = rr.no;
    exc.status = 'RR Created';
    return `${rr.no} created for ${exc.no}, sourced from ${supplier}.`;
  },

  rrApprove(d, p) {
    return approveRR(d, p);
  },

  rrCancel(d, p) {
    const rr = get(d, 'rrs', p.id);
    need(['Open', 'Acknowledged', 'In Production'].includes(rr.status), 'RR.CANCEL', `${rr.no} is ${rr.status}, so it cannot be cancelled.`);
    need(!blank(p.reason), 'RR.CANCEL', 'Give a reason for cancelling the replacement.');
    rr.status = 'Cancelled';
    rr.cancelReason = String(p.reason).trim();
    const ships = d.shipments.filter((s) => s.rrNo === rr.no);
    const shipIds = ships.map((s) => s.id);
    d.shipments = d.shipments.filter((s) => !shipIds.includes(s.id));
    d.receivings = d.receivings.filter((r) => !shipIds.includes(r.shipmentId));
    const exc = d.exceptions.find((e) => e.id === rr.excId);
    if (exc) {
      exc.status = 'Open';
      exc.rrNo = '';
    }
    return `${rr.no} cancelled. ${exc ? `${exc.no} is open again.` : ''}`.trim();
  },

  rrClose(d, p) {
    const rr = get(d, 'rrs', p.id);
    need(rr.status === 'Received', 'RR.CLOSE');
    rr.status = 'Closed';
    return `${rr.no} closed.`;
  },

  // ───────────────────── Exceptions: raised by hand, reviewed, resolved ─────────────────────
  exceptionRaise(d, p, { today }) {
    need(['Procurement', 'Fulfillment'].includes(p.source), 'GEN.FIELD', 'Choose where the exception came from.');
    need(!blank(p.item), 'EXC.RAISE', 'Say which item the exception is about.');
    need(Number(p.qty) > 0, 'EXC.RAISE', 'Quantity must be above zero.');
    need(EXCEPTION_TYPES.includes(p.type), 'EXC.RAISE', 'Choose the type of problem.');
    if (!blank(p.supplier)) need(d.suppliers.some((s) => s.name === p.supplier && !s.stock), 'GEN.FIELD', `"${p.supplier}" is not a recognised supplier.`);
    const fulfillment = p.source === 'Fulfillment';
    const exc = {
      id: nid(d, 'exc'), no: seqNo(d, fulfillment ? 'excff' : 'exc', fulfillment ? 'EXC-FF' : 'EXC'), source: p.source, receivingNo: '', shipmentNo: '', poNo: '',
      supplier: p.supplier || '', item: String(p.item).trim(), type: p.type, qty: Number(p.qty), prNos: [], itemId: '', status: 'Open', rrNo: '', raisedOn: today,
      notes: String(p.notes || '').trim(), manual: true,
    };
    d.exceptions.push(exc);
    return `${exc.no} raised (${exc.type}, ${exc.qty}).`;
  },

  exceptionReview(d, p) {
    const exc = get(d, 'exceptions', p.id);
    need(exc.status === 'Open' || exc.status === 'Under Review', 'GEN.STATE', `${exc.no} is ${exc.status}, so it cannot be assigned.`);
    need(!blank(p.assignee) && !blank(p.dueDate), 'EXC.REVIEW');
    exc.assignee = String(p.assignee).trim();
    exc.dueDate = p.dueDate;
    exc.dept = p.dept || exc.dept || 'Procurement';
    exc.status = 'Under Review';
    return `${exc.no} is under review by ${exc.assignee}, due ${exc.dueDate}.`;
  },

  exceptionResolve(d, p) {
    const exc = get(d, 'exceptions', p.id);
    need(exc.status === 'Open' || exc.status === 'Under Review', 'EXC.RESOLVE', `${exc.no} is ${exc.status}. A replacement under way closes by itself when it is received.`);
    need(!blank(p.note), 'EXC.RESOLVE', 'Write how it was resolved.');
    exc.status = 'Resolved';
    exc.resolution = String(p.note).trim();
    return `${exc.no} resolved.`;
  },

  // ───────────────────── Receiving: books, and receiving without a shipment ─────────────────────
  receivingSendToBooks(d, p, { today }) {
    const r = get(d, 'receivings', p.id);
    need(r.status === 'Received', 'RCV.BOOKS', `${r.no} is ${r.status}. Only a receiving counted in full can go to Books.`);
    need(!r.sentToBooks, 'RCV.BOOKS', `${r.no} was already sent to Books.`);
    r.sentToBooks = today;
    return `${r.no} sent to Books.`;
  },

  receivingCreate(d, p) {
    need(!blank(p.supplier) && d.suppliers.some((s) => s.name === p.supplier), 'RCV.SCRATCH', 'Choose the supplier the goods came from.');
    need(!blank(p.item), 'RCV.SCRATCH', 'Say what was received.');
    need(Number(p.qty) > 0, 'RCV.SCRATCH', 'Quantity must be above zero.');
    const ship = {
      id: nid(d, 'shp'), no: seqNo(d, 'shp', 'SHP'), poId: '', poNo: '', rrNo: '', supplier: p.supplier, mode: 'Local', item: String(p.item).trim(), qty: Number(p.qty),
      prNos: [], etd: '', eta: '', dateShipped: '', status: 'Arrived', scratch: true,
    };
    d.shipments.push(ship);
    const rcv = {
      id: nid(d, 'rcv'), no: seqNo(d, 'rcv', 'RCV'), shipmentId: ship.id, shipmentNo: ship.no, poNo: '', rrId: '', supplier: p.supplier, item: ship.item, prNos: [], itemId: '',
      expected: ship.qty, accepted: 0, damaged: 0, missing: 0, status: 'Open', scratch: true,
    };
    d.receivings.push(rcv);
    return `${rcv.no} created from scratch for ${ship.item}.`;
  },

  // ───────────────────────────── Fulfillment: packages, Exception Control, Transfer Item ─────────────────────────────
  packageCreateOrder(d, p, { today }) {
    need(DELIVERY_TYPES.includes(p.deliveryType), 'SOR.TYPE');
    const items = d.items.filter((i) => i.soNo === p.soNo);
    need(items.length > 0, 'GEN.FIELD', `No Sales Order ${p.soNo}.`);
    need(items.every((i) => blank(i.pac)), 'SOR.ONE_PACKAGE', `${p.soNo} already has a package.`);
    const ready = items.filter((i) => i.received && i.stage === 'Readiness Gate');
    need(ready.length > 0, 'SOR.READY', `Nothing on ${p.soNo} is received yet, so there is nothing to package.`);
    need(ready.length === items.length, 'SOR.READY', `Only ${ready.length} of ${items.length} item(s) on ${p.soNo} are received. A package covers the whole order.`);
    const pac = seqNo(d, 'pac', 'PAC');
    ready.forEach((i) => { i.pac = pac; i.gateOn = today; i.deliveryType = p.deliveryType; });
    return `Package ${pac} created for ${p.soNo} (${p.deliveryType}).`;
  },

  ecRework(d, p) {
    const exc = get(d, 'exceptions', p.id);
    need(exc.source === 'Fulfillment', 'EC.STATE', 'Only a Fulfillment QC reject goes through Exception Control.');
    need((exc.fcStatus || 'Pending') === 'Pending', 'EC.STATE', `${exc.no} is ${exc.fcStatus}, so it cannot be sent to rework.`);
    exc.fcStatus = 'In Rework';
    return `${exc.no} is in rework.`;
  },

  ecUnrepairable(d, p) {
    const exc = get(d, 'exceptions', p.id);
    need(exc.source === 'Fulfillment', 'EC.STATE', 'Only a Fulfillment QC reject goes through Exception Control.');
    need(['Pending', 'In Rework'].includes(exc.fcStatus || 'Pending'), 'EC.STATE', `${exc.no} is ${exc.fcStatus}, so it cannot be marked unrepairable.`);
    exc.fcStatus = 'Unrepairable';
    return `${exc.no} is unrepairable. A replacement can now be requested.`;
  },

  ecComplete(d, p) {
    const exc = get(d, 'exceptions', p.id);
    need(exc.fcStatus === 'In Rework', 'EC.STATE', 'Only an item in rework can be completed.');
    exc.fcStatus = 'Completed';
    exc.status = 'Closed';
    const it = d.items.find((i) => i.id === exc.itemId);
    if (it) it.qcStatus = 'Replacement received';
    return `${exc.no} reworked and completed. The item can be rechecked.`;
  },

  transferCreate(d, p) {
    need(['Warehouse Request', 'Transfer Warehouse'].includes(p.kind), 'GEN.FIELD', 'Choose Warehouse Request or Transfer Warehouse.');
    need(!blank(p.item) && Number(p.qty) > 0, 'XFER.NEW');
    need(!blank(p.from) && !blank(p.to) && p.from !== p.to, 'XFER.NEW', 'Choose two different warehouses.');
    const t = { id: nid(d, 'xf'), no: seqNo(d, 'xf', 'XFER'), kind: p.kind, item: String(p.item).trim(), qty: Number(p.qty), from: p.from, to: p.to, status: p.kind === 'Warehouse Request' ? 'Pending' : 'Pending Dispatch' };
    d.transfers.push(t);
    return `${t.no} created (${t.kind}).`;
  },

  transferAdvance(d, p) {
    const t = get(d, 'transfers', p.id);
    const flow = t.kind === 'Warehouse Request' ? ['Pending', 'Done'] : ['Pending Dispatch', 'Dispatched', 'Received'];
    const at = flow.indexOf(t.status);
    need(at >= 0 && at < flow.length - 1, 'XFER.DONE', `${t.no} is already ${t.status}.`);
    t.status = flow[at + 1];
    return `${t.no} is now ${t.status}.`;
  },

  // ───────────────────────────── Delivery: returns, site visits, trucks, schedule requests ─────────────────────────────
  salesReturnCreate(d, p, { today }) {
    const sr = get(d, 'serviceRequests', p.id);
    need(['Completed', 'Exception'].includes(sr.status), 'RET.NEW', `${sr.no} is ${sr.status}. Only a completed or failed delivery can have a return.`);
    need(!d.salesReturns.some((r) => r.srNo === sr.no), 'RET.NEW', `${sr.no} already has a sales return.`);
    const r = { id: nid(d, 'ret'), no: seqNo(d, 'ret', 'SRT'), srNo: sr.no, soNo: sr.soNo, customer: sr.customer, warehouse: p.warehouse || 'Main Warehouse', rma: '', reason: '', qty: 0, status: 'Pending', createdOn: today };
    d.salesReturns.push(r);
    return `${r.no} opened for ${sr.no}.`;
  },

  salesReturnSendToBooks(d, p, { today }) {
    const r = get(d, 'salesReturns', p.id);
    need(r.status === 'Pending', 'GEN.STATE', `${r.no} was already sent to Books.`);
    need(!blank(p.rma) && !blank(p.reason) && Number(p.qty) > 0 && !blank(p.signature), 'RET.BOOKS');
    Object.assign(r, { rma: String(p.rma).trim(), reason: String(p.reason).trim(), qty: Number(p.qty), signature: String(p.signature).trim(), status: 'Created', sentOn: today });
    return `${r.no} sent to Books as ${r.rma}.`;
  },

  siteVisitCreate(d, p, { today }) {
    const sr = get(d, 'serviceRequests', p.id);
    need(['Installation Assessment', 'Repair Assessment', 'Other'].includes(p.kind), 'GEN.FIELD', 'Choose the type of visit.');
    const v = { id: nid(d, 'sv'), no: seqNo(d, 'sv', 'SV'), srNo: sr.no, soNo: sr.soNo, customer: sr.customer, kind: p.kind, siteReady: false, notes: '', visitDate: p.visitDate || today };
    d.siteVisits.push(v);
    return `${v.no} scheduled for ${sr.no}.`;
  },

  siteVisitUpdate(d, p) {
    const v = get(d, 'siteVisits', p.id);
    v.siteReady = !!p.siteReady;
    v.notes = String(p.notes || '').trim();
    return `${v.no} saved. Site ${v.siteReady ? 'is ready' : 'is not ready yet'}.`;
  },

  truckChecklistCreate(d, p) {
    need(TRUCKS.includes(p.truck) && !blank(p.date), 'TRUCK.NEW');
    const issues = Number(p.issues) || 0;
    need(issues >= 0, 'GEN.FIELD', 'Issues cannot be negative.');
    const c = { id: nid(d, 'tc'), no: seqNo(d, 'tc', 'CHK'), truck: p.truck, date: p.date, issues, notes: String(p.notes || '').trim(), status: 'Open', signature: '' };
    d.truckChecks.push(c);
    return `${c.no} opened for ${c.truck}.`;
  },

  truckChecklistAdvance(d, p) {
    const c = get(d, 'truckChecks', p.id);
    need(c.status !== 'Completed', 'GEN.STATE', `${c.no} is already completed.`);
    if (c.status === 'Open') {
      c.status = 'In Progress';
      return `${c.no} is in progress.`;
    }
    need(!blank(p.signature), 'TRUCK.SIGN');
    c.signature = String(p.signature).trim();
    c.status = 'Completed';
    return `${c.no} completed and signed.`;
  },

  truckEntryAdd(d, p) {
    need(['fuel', 'service'].includes(p.kind), 'GEN.FIELD', 'Choose a fuel or service entry.');
    need(TRUCKS.includes(p.truck) && !blank(p.date) && Number(p.cost) > 0, 'TRUCK.ENTRY');
    const e = { id: nid(d, 'te'), kind: p.kind, truck: p.truck, date: p.date, cost: Number(p.cost), liters: Number(p.liters) || 0, note: String(p.note || '').trim() };
    d.truckEntries.push(e);
    return `${p.kind === 'fuel' ? 'Fuel' : 'Service'} entry added for ${e.truck}.`;
  },

  scheduleRequestCreate(d, p, { today }) {
    const sr = get(d, 'serviceRequests', p.id);
    need(!blank(p.newDate) && !blank(p.reason), 'SCHED.NEW');
    need(!['Completed'].includes(sr.status), 'GEN.STATE', `${sr.no} is already completed.`);
    need(!d.scheduleRequests.some((r) => r.srNo === sr.no && r.status === 'Pending Review'), 'SCHED.NEW', `${sr.no} already has a request waiting for review.`);
    const r = { id: nid(d, 'sch'), no: seqNo(d, 'sch', 'SCH'), srNo: sr.no, soNo: sr.soNo, customer: sr.customer, currentDate: sr.scheduledDate || sr.initialDate || '', newDate: p.newDate, reason: String(p.reason).trim(), status: 'Pending Review', createdOn: today };
    d.scheduleRequests.push(r);
    return `${r.no}: ${sr.customer} asks to move ${sr.no} to ${p.newDate}.`;
  },

  scheduleRequestDecide(d, p) {
    const r = get(d, 'scheduleRequests', p.id);
    need(r.status === 'Pending Review', 'GEN.STATE', `${r.no} is already ${r.status}.`);
    need(['Confirm', 'Decline'].includes(p.decision), 'GEN.FIELD', 'Choose Confirm or Decline.');
    if (p.decision === 'Decline') {
      need(!blank(p.note), 'SCHED.DECIDE', 'Say why the request is declined.');
      r.status = 'Declined';
      r.note = String(p.note).trim();
      return `${r.no} declined.`;
    }
    const sr = d.serviceRequests.find((x) => x.no === r.srNo);
    need(sr && ['Initial Scheduling', 'Service Request'].includes(sr.status), 'SCHED.DECIDE', `${r.srNo} is already ${sr ? sr.status : 'gone'}, so its date can only be changed by rescheduling it.`);
    sr.initialDate = r.newDate;
    r.status = 'Confirmed';
    return `${r.no} confirmed. ${sr.no} now starts from ${r.newDate}.`;
  },

  // ───────────────────────────── Supplier portals (Tony Fan, Fenteng Lighting) ─────────────────────────────
  supplierRespondInquiry(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    const q = inq.quotes.find((x) => x.supplier === p.supplier);
    need(!!q && q.stage !== 'Declined', 'SUP.OWN', `${inq.no} is not assigned to ${p.supplier}.`);
    const status = inquiryStatus(inq, p.supplier);
    need(quotesEditable(status), 'SUP.LOCKED', status === 'Completed' ? 'This response is completed and locked. It cannot be submitted again.' : status === 'Not Selected' ? 'The buyer selected another supplier for this line, so the response is locked.' : 'You are the selected supplier, so pricing is locked. Complete the collateral checklist instead.');
    need(AVAILABILITY.includes(p.availability) && p.availability !== 'Pending', 'SUP.RESPONSE', 'Availability is required.');
    const decline = p.availability === 'Unavailable' || p.availability === 'Cannot Produce';
    const initial = decline ? 0 : Number(p.initial) || 0;
    const negotiated = decline ? 0 : Number(p.negotiated) || 0;
    need(decline || initial > 0, 'SUP.RESPONSE', 'Initial Price is required.');
    need(decline || !blank(p.leadTime), 'SUP.RESPONSE', 'Lead Time is required.');
    need(Number(p.negotiated || 0) >= 0, 'GEN.FIELD', 'Prices cannot be negative.');
    need(negotiated === 0 || initial > 0, 'INQ.PRICE', 'Enter the Initial price before a Negotiated price.');
    q.availability = p.availability;
    q.initial = initial;
    q.negotiated = negotiated;
    q.final = quoteFinal({ initial, negotiated });
    q.leadTime = decline ? '' : String(p.leadTime).trim();
    q.stage = decline ? 'Declined' : q.stage === 'Not Selected' ? 'Negotiating' : q.stage;
    d.timeline.push({ id: nid(d, 'tl'), inqNo: inq.no, title: `${p.supplier} responded: ${p.availability}`, type: 'Updated', actor: p.supplier, at: stamp(ctx), changes: decline ? [] : [{ label: 'Final price', to: String(q.final) }, { label: 'Lead time', to: q.leadTime }] });
    return decline ? `${inq.no} marked ${p.availability}. It is removed from ${p.supplier}'s queue.` : `Response submitted for ${inq.no}.`;
  },

  supplierCollateral(d, p, ctx) {
    const inq = get(d, 'inquiries', p.id);
    need(inq.quotes.some((x) => x.supplier === p.supplier), 'SUP.OWN', `${inq.no} is not assigned to ${p.supplier}.`);
    const status = inquiryStatus(inq, p.supplier);
    need(collateralEditable(status), 'SUP.LOCKED', status === 'Completed' ? 'All collateral is confirmed, so the response is locked for good.' : 'The collateral checklist opens once you are selected.');
    let n = 0;
    for (const [key] of COLLATERAL_FIELDS) {
      if (p[key] == null) continue;
      need(['Pending', 'N/A', 'Completed'].includes(p[key]), 'GEN.FIELD', `"${p[key]}" is not a valid collateral status.`);
      if (inq.collateral[key] === 'Required' && p[key] === 'Pending') continue;
      inq.collateral[key] = p[key];
      n += 1;
    }
    need(n > 0, 'GEN.FIELD', 'Choose a status for at least one collateral item.');
    d.timeline.push({ id: nid(d, 'tl'), inqNo: inq.no, title: `${p.supplier} updated the collateral`, type: 'Updated', actor: p.supplier, at: stamp(ctx), changes: [] });
    return inquiryStatus(inq, p.supplier) === 'Completed' ? `${inq.no}: every collateral item is confirmed. The response is completed and locked.` : `Collateral saved for ${inq.no}.`;
  },

  supplierRespondPR(d, p) {
    const pr = get(d, 'prs', p.id);
    const status = prStatus(pr, p.supplier);
    need(!!status, 'SUP.OWN', `${pr.no} is not assigned to ${p.supplier}.`);
    need(!prViewOnly(pr), 'SUP.PR_VIEW', `${pr.no} came from ${pr.inquiryNo}. Respond to it on the inquiry.`);
    need(!isInactive(pr), 'SUP.PR_VIEW', `${pr.no} is ${pr.hold}, so it cannot be quoted.`);
    need(status === 'Waiting' || status === 'Submit Response', 'SUP.LOCKED', 'This PR is already selected or closed, so the response is locked.');
    need(AVAILABILITY.includes(p.availability) && p.availability !== 'Pending', 'SUP.RESPONSE', 'Availability is required.');
    const decline = p.availability === 'Unavailable' || p.availability === 'Cannot Produce';
    const initial = decline ? 0 : Number(p.initial) || 0;
    need(decline || initial > 0, 'SUP.RESPONSE', 'Initial Price is required.');
    need(decline || !blank(p.leadTime), 'SUP.RESPONSE', 'Lead Time is required.');
    let q = pr.quotes.find((x) => x.supplier === p.supplier);
    if (!q) {
      q = { supplier: p.supplier, availability: 'Pending', initial: 0, negotiated: 0, final: 0, leadTime: '', stage: 'Not Selected', selected: false };
      pr.quotes.push(q);
    }
    q.availability = p.availability;
    q.initial = initial;
    q.final = quoteFinal({ initial, negotiated: 0 });
    q.leadTime = decline ? '' : String(p.leadTime).trim();
    q.stage = decline ? 'Declined' : 'Negotiating';
    if (!decline && pr.supplier === p.supplier) {
      pr.price = q.final;
      pr.lead = q.leadTime;
      refreshPrStatus(d, pr);
    }
    return decline ? `${pr.no} marked ${p.availability}. It is removed from ${p.supplier}'s queue.` : `Response submitted for ${pr.no}.`;
  },

  supplierAckPO(d, p) {
    const po = get(d, 'pos', p.id);
    need(po.supplier === p.supplier, 'SUP.OWN', `${po.no} belongs to ${po.supplier}.`);
    const lines = d.prs.filter((x) => po.prIds.includes(x.id));
    need(lines.length === 0 || !lines.every(isInactive), 'SUP.PO_HELD', `Every line on ${po.no} is on hold or cancelled, so it cannot be acknowledged.`);
    return acknowledgePO(d, p);
  },

  supplierShip(d, p, { today }) {
    const s = get(d, 'shipments', p.id);
    need(s.supplier === p.supplier, 'SUP.OWN', `${s.no} belongs to ${s.supplier}.`);
    need(s.status === 'Pending', 'GEN.STATE', 'Only a Pending shipment can be shipped.');
    need(!blank(p.dateShipped) && SHIP_MODES.includes(p.mode), 'SUP.SHIP', 'Fill Date Shipped and Mode before shipping.');
    need(p.dateShipped <= today, 'SUP.SHIP', 'Date Shipped cannot be in the future.');
    const lines = d.prs.filter((x) => (s.prNos || []).includes(x.no));
    need(lines.length === 0 || !lines.every(isInactive), 'SUP.PO_HELD', `Every line on ${s.no} is on hold or cancelled, so it cannot ship.`);
    s.mode = p.mode;
    s.dateShipped = p.dateShipped;
    s.status = 'In Transit';
    return `${s.no} shipped by ${s.supplier} (${p.mode}).`;
  },

  supplierApproveRR(d, p) {
    const rr = get(d, 'rrs', p.id);
    need(rr.supplier === p.supplier, 'SUP.OWN', `${rr.no} belongs to ${rr.supplier}.`);
    need(SHIP_MODES.includes(p.mode), 'RR.DATES', 'Fill Shipment Mode, Expected Ship Date and ETA before approving.');
    return approveRR(d, p);
  },

  supplierRRProgress(d, p, { today }) {
    const rr = get(d, 'rrs', p.id);
    need(rr.supplier === p.supplier, 'SUP.OWN', `${rr.no} belongs to ${rr.supplier}.`);
    need(rr.status !== 'Open', 'RR.PROGRESS', 'Approve the RR first.');
    need(RR_FLOW.indexOf(rr.status) >= 1 && RR_FLOW.indexOf(rr.status) < RR_FLOW.indexOf('Received'), 'RR.PROGRESS', `${rr.no} is ${rr.status}, so there is nothing left for the supplier to update.`);
    need(['In Production', 'Shipped'].includes(p.status), 'GEN.FIELD', 'Choose In Production or Shipped.');
    need(RR_FLOW.indexOf(p.status) > RR_FLOW.indexOf(rr.status), 'RR.PROGRESS', `A replacement cannot go back from ${rr.status} to ${p.status}.`);
    if (!blank(p.expShip)) rr.expShip = p.expShip;
    if (!blank(p.eta)) rr.eta = p.eta;
    need(rr.eta >= rr.expShip, 'RR.DATES', 'The ETA cannot be before the Expected Ship Date.');
    rr.status = p.status;
    if (p.status === 'Shipped') {
      const ship = d.shipments.find((x) => x.rrNo === rr.no);
      if (ship && ship.status === 'Pending') {
        ship.status = 'In Transit';
        ship.dateShipped = today;
        ship.eta = rr.eta;
      }
    }
    return `${rr.no} is now ${p.status}.`;
  },

  // ───────────────────────────── Readiness Gate ─────────────────────────────
  createPackage(d, p, { today }) {
    const it = get(d, 'items', p.id);
    need(it.received, 'GATE.RECEIVED', `${it.name} is still on order (${it.prNo}). It cannot be packaged until it is received.`);
    need(blank(it.pac), 'GEN.STATE', `${it.name} already has package ${it.pac}.`);
    it.pac = seqNo(d, 'pac', 'PAC');
    it.gateOn = today;
    return `Package ${it.pac} created for ${it.soNo}.`;
  },

  assignPicker(d, p) {
    const it = get(d, 'items', p.id);
    need(!blank(p.picker), 'GEN.FIELD', 'Choose a picker.');
    it.picker = p.picker;
    return `${p.picker} will pick ${it.soNo}.`;
  },

  setPayment(d, p) {
    const it = get(d, 'items', p.id);
    need(['Paid', 'Unpaid', 'Credit'].includes(p.payment), 'GEN.FIELD', 'Choose Paid, Unpaid or Credit.');
    it.payment = p.payment;
    return `${it.soNo} payment set to ${p.payment}.`;
  },

  approveOverride(d, p, { today }) {
    const it = get(d, 'items', p.id);
    need(!blank(p.reason) && !blank(p.until) && p.until > today, 'GATE.OVERRIDE');
    it.override = { reason: p.reason, until: p.until };
    return `Dispatch override approved for ${it.soNo} until ${p.until}.`;
  },

  gateRelease(d, p, { today }) {
    const it = get(d, 'items', p.id);
    need(it.stage === 'Readiness Gate', 'GEN.STATE');
    need(!blank(it.pac), 'GATE.PAC');
    need(!blank(it.picker), 'GATE.PICKER');
    need(paymentOK(it, today), 'GATE.PAYMENT');
    it.stage = 'Pick';
    return `${it.soNo} released to Pick.`;
  },

  // ───────────────────────────── Pick / Pack / QC / Crate ─────────────────────────────
  pickDone(d, p) {
    const it = get(d, 'items', p.id);
    need(it.stage === 'Pick', 'GEN.STATE');
    it.stage = 'QC';
    it.qcStatus = 'Pending';
    it.packer = '';
    it.checker = '';
    return `${it.soNo} picked and sent to Pack & QC.`;
  },

  qcAssign(d, p) {
    const it = get(d, 'items', p.id);
    need(it.stage === 'QC' && it.qcStatus === 'Pending', 'GEN.STATE');
    need(!blank(p.packer), 'PACK.PACKER');
    it.packer = p.packer;
    it.checker = p.packer;
    return `${p.packer} will pack and check ${it.soNo}.`;
  },

  qcApprove(d, p) {
    const it = get(d, 'items', p.id);
    need(it.stage === 'QC', 'GEN.STATE');
    need(it.qcStatus === 'Pending', 'GEN.STATE', 'Resolve the rejection before approving.');
    need(!blank(it.checker), 'PACK.PACKER');
    it.qcStatus = 'Approved';
    if (it.forCrate) {
      it.stage = 'Crate';
      it.crateStatus = 'Pending';
      return `${it.soNo} approved. It needs crating.`;
    }
    it.stage = 'Order Aggregation';
    return `${it.soNo} approved and sent to Order Aggregation.`;
  },

  qcReject(d, p, { today }) {
    const it = get(d, 'items', p.id);
    need(it.stage === 'QC' && it.qcStatus === 'Pending', 'GEN.STATE');
    need(!blank(it.checker), 'PACK.PACKER');
    need(!blank(p.reason), 'QC.REJECT');
    it.qcStatus = 'Rejected';
    const exc = {
      id: nid(d, 'exc'), no: seqNo(d, 'excff', 'EXC-FF'), source: 'Fulfillment', receivingNo: '', shipmentNo: '',
      poNo: '', supplier: it.supplier, item: it.name, type: p.type || 'Damaged', qty: it.qty,
      prNos: it.prNo ? [it.prNo] : [], itemId: it.id, status: 'Open', rrNo: '', raisedOn: today, notes: p.reason,
    };
    d.exceptions.push(exc);
    return `${it.soNo} rejected. ${exc.no} raised.`;
  },

  qcRecheck(d, p) {
    const it = get(d, 'items', p.id);
    need(it.stage === 'QC' && (it.qcStatus === 'Rejected' || it.qcStatus === 'Replacement received'), 'GEN.STATE');
    it.qcStatus = 'Pending';
    it.packer = '';
    it.checker = '';
    return `${it.soNo} is back in Pack & QC for a fresh check.`;
  },

  crateSet(d, p) {
    const it = get(d, 'items', p.id);
    need(it.stage === 'Crate', 'GEN.STATE');
    need(['Pending', 'In Progress', 'Done'].includes(p.status), 'GEN.FIELD');
    it.crateStatus = p.status;
    return `Crating for ${it.soNo}: ${p.status}.`;
  },

  crateComplete(d, p) {
    const it = get(d, 'items', p.id);
    need(it.stage === 'Crate', 'GEN.STATE');
    need(it.crateStatus === 'Done', 'CRATE.DONE');
    it.stage = 'Order Aggregation';
    return `${it.soNo} crated and sent to Order Aggregation.`;
  },

  dispatch(d, p, { today }) {
    const it = get(d, 'items', p.id);
    need(!it.srNo, 'OA.DEDUP', `${it.soNo} was already dispatched as ${it.srNo}.`);
    need(it.stage === 'Order Aggregation', 'GEN.STATE');
    need(paymentOK(it, today), 'OA.PAYMENT');
    const sr = {
      id: nid(d, 'sr'), no: seqNo(d, 'sr', 'SR'), soNo: it.soNo, customer: it.customer, address: it.address,
      itemId: it.id, item: it.name, qty: it.qty, pac: it.pac, type: p.type || 'Delivery',
      initialDate: p.requestedDate || '', confirmMethod: '', confirmNotes: '', siteConfirmed: false,
      status: 'Initial Scheduling', team: '', scheduledDate: '', priority: false, exceptionReason: '', resolution: '',
    };
    d.serviceRequests.push(sr);
    it.srNo = sr.no;
    it.stage = 'Dispatched';
    return `${it.soNo} dispatched. ${sr.no} is waiting at Initial Scheduling.`;
  },

  // ───────────────────────────── Forecast settings ─────────────────────────────
  forecastSettingsSave(d, p) {
    const values = { ...DEFAULTS, ...((d.settings && d.settings.forecast) || {}), ...(p.values || {}) };
    const errors = validateSettings(values);
    need(errors.length === 0, errors.some((e) => e.includes('minimum')) ? 'FC.RANGE' : 'FC.VALUES', errors.join(' '));
    const next = {};
    ALL_KEYS.forEach((k) => { next[k] = Number(values[k]); });
    d.settings = { ...(d.settings || {}), forecast: next };
    return 'Forecast settings saved. Every forecast date is recalculated from them.';
  },

  forecastSettingsReset(d, p) {
    d.settings = { ...(d.settings || {}), forecast: {} };
    return 'Forecast settings are back to the defaults.';
  },

  // ───────────────────────────── Delivery Management ─────────────────────────────
  srSetInitial(d, p) {
    const sr = get(d, 'serviceRequests', p.id);
    need(['Initial Scheduling', 'Service Request'].includes(sr.status), 'GEN.STATE');
    need(!blank(p.date), 'DMS.INITIAL');
    sr.initialDate = p.date;
    return `${sr.no} initial date set to ${p.date}.`;
  },

  srConfirmSite(d, p) {
    const sr = get(d, 'serviceRequests', p.id);
    need(['Initial Scheduling', 'Service Request'].includes(sr.status), 'GEN.STATE');
    need(!blank(p.method) && !blank(p.notes), 'DMS.CONFIRM');
    Object.assign(sr, { siteConfirmed: true, confirmMethod: p.method, confirmNotes: p.notes });
    return `Site confirmed for ${sr.no} by ${p.method}.`;
  },

  srHandOff(d, p) {
    const sr = get(d, 'serviceRequests', p.id);
    need(sr.status === 'Initial Scheduling', 'GEN.STATE');
    need(!blank(sr.initialDate), 'DMS.INITIAL');
    sr.status = 'Service Request';
    return `${sr.no} handed off to Service Request.`;
  },

  srSchedule(d, p, { today }) {
    const sr = get(d, 'serviceRequests', p.id);
    need(sr.status === 'Service Request', 'GEN.STATE', 'Only a job at Service Request can be scheduled.');
    if (sr.type === 'Pick Up') {
      sr.status = 'Scheduled';
      sr.team = 'Pick Up';
      sr.scheduledDate = sr.initialDate || today;
      return `${sr.no} is a Pick Up. Scheduled for ${sr.scheduledDate} with no team.`;
    }
    need(sr.siteConfirmed, 'DMS.SITE');
    const slot = findSlot(d, sr, today);
    need(!!slot, 'DMS.FULL');
    sr.team = slot.team.id;
    sr.scheduledDate = slot.date;
    sr.status = 'Scheduled';
    return `${sr.no} scheduled for ${slot.date} with ${slot.team.name}.`;
  },

  srStart(d, p, { today }) {
    const sr = get(d, 'serviceRequests', p.id);
    need(sr.status === 'Scheduled', 'GEN.STATE');
    sr.status = 'Ongoing';
    sr.startedOn = today;
    return `${sr.no} is under way.`;
  },

  srComplete(d, p, { today }) {
    const sr = get(d, 'serviceRequests', p.id);
    need(sr.status === 'Ongoing', 'GEN.STATE');
    sr.status = 'Completed';
    sr.completedOn = today;
    return `${sr.no} completed.`;
  },

  srFail(d, p) {
    const sr = get(d, 'serviceRequests', p.id);
    need(sr.status === 'Ongoing', 'GEN.STATE');
    need(!blank(p.reason), 'DMS.FAIL');
    sr.status = 'Exception';
    sr.exceptionReason = p.reason;
    return `${sr.no} sent to the Exception Queue.`;
  },

  srResolve(d, p) {
    const sr = get(d, 'serviceRequests', p.id);
    need(sr.status === 'Exception', 'GEN.STATE');
    need(!blank(p.action), 'DMS.RESOLVE');
    if (p.action === 'Reschedule') {
      need(!blank(p.newDate), 'DMS.RESOLVE', 'Reschedule needs a new date.');
      sr.initialDate = p.newDate;
      sr.priority = true;
    } else {
      sr.priority = false;
    }
    Object.assign(sr, { status: 'Service Request', team: '', scheduledDate: '', resolution: `${p.action}${p.notes ? ': ' + p.notes : ''}` });
    return `${sr.no} resolved (${p.action}) and returned to Service Request.`;
  },

  teamCapacity(d, p) {
    const t = get(d, 'teams', p.id);
    need(Number.isInteger(Number(p.capacity)) && Number(p.capacity) >= 0, 'GEN.FIELD', 'Capacity must be a whole number.');
    t.capacity = Number(p.capacity);
    return `${t.name} can now take ${t.capacity} jobs a day.`;
  },

  teamToggleOff(d, p) {
    const t = get(d, 'teams', p.id);
    need(!blank(p.date), 'GEN.FIELD', 'Pick a date.');
    t.off = t.off.includes(p.date) ? t.off.filter((x) => x !== p.date) : [...t.off, p.date].sort();
    return `${t.name} ${t.off.includes(p.date) ? 'is off on' : 'is back on'} ${p.date}.`;
  },
};

export function run(db, name, payload = {}, ctx = {}) {
  const fn = ACTIONS[name];
  if (!fn) throw new Error(`Unknown action "${name}".`);
  const d = structuredClone(db);
  const today = ctx.today || todayISO();
  const now = ctx.now || new Date().toISOString();
  const msg = fn(d, payload, { today, now });
  // Stamp the day a record first appeared, for the dashboard's weekly charts.
  for (const coll of ['pos', 'shipments', 'receivings', 'exceptions', 'rrs', 'serviceRequests']) d[coll].forEach((r) => { if (!r.createdOn) r.createdOn = today; });
  d.auditSeq = (d.auditSeq || d.audit.length) + 1; // steps ever taken; the audit list itself is capped, so the bell counts this instead
  d.audit.push({ at: now, action: name, ref: payload.id || (payload.ids && payload.ids[0]) || '', msg });
  if (d.audit.length > 300) d.audit.splice(0, d.audit.length - 300);
  return { db: d, msg };
}
