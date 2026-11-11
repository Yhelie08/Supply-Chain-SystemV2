// Sample data. Built by running the real workflow actions, so every record sits in a
// state the rules would actually allow, and the seed can never drift from the engine.

import { run } from './actions.js';
import { addDays, todayISO } from './util.js';

export function emptyDb() {
  return {
    version: 4,
    seq: 0,
    counters: {},
    suppliers: [
      { name: 'Fenteng Lighting', local: false, stock: false, handlesAll: false, categories: ['Lighting', 'Fixtures'], maxCapacity: 20, status: 'Active' },
      { name: 'Tony Fan', local: false, stock: false, handlesAll: true, categories: [], maxCapacity: 15, status: 'Active' },
      { name: 'HC System', local: true, stock: false, handlesAll: true, categories: [], maxCapacity: 10, status: 'Active' },
      { name: 'Warehouse Stock', local: false, stock: true, handlesAll: false, categories: [], maxCapacity: 0, status: 'Active' },
    ],
    teams: [
      { id: 'tA', name: 'Team Alpha', capacity: 3, off: [] },
      { id: 'tB', name: 'Team Bravo', capacity: 2, off: [] },
      { id: 'tC', name: 'Team Charlie', capacity: 2, off: [] },
    ],
    settings: { forecast: {} },
    transfers: [],
    salesReturns: [],
    siteVisits: [],
    truckChecks: [],
    truckEntries: [],
    scheduleRequests: [],
    customers: [],
    projects: [],
    products: [],
    inquiries: [],
    timeline: [],
    messages: [],
    notes: [],
    prs: [],
    pos: [],
    shipments: [],
    receivings: [],
    exceptions: [],
    rrs: [],
    items: [],
    serviceRequests: [],
    audit: [],
  };
}

const ALL_COMPLETE = { sample: 'Completed', dImage: 'Completed', drawing: 'Completed', spec: 'Completed' };

export function seedDb(today = todayISO()) {
  let db = emptyDb();
  const ctx = { today, now: today + 'T08:00:00.000Z' };
  const go = (name, payload = {}) => {
    db = run(db, name, payload, ctx).db;
    return db;
  };

  // ── Masters: created on first use, through the same steps the New Inquiry form uses ──
  const ensureCustomer = (name, type = 'Designer') => {
    const found = db.customers.find((c) => c.name === name);
    if (found) return found.id;
    go('customerCreate', {
      name, type, email: `${name.toLowerCase().replace(/[^a-z]/g, '.')}@example.com`, mobile: '0917 000 0000',
      billing: { line1: '12 Sample St', city: 'Quezon City', state: 'Metro Manila', zip: '1100', country: 'Philippines' },
    });
    return db.customers.at(-1).id;
  };
  const ensureProject = (customerId, name, groupDiscountPct = 0) => {
    const found = db.projects.find((p) => p.customerId === customerId && p.name === name);
    if (found) return found.id;
    go('projectCreate', { name, customerId, type: 'Residential', groupDiscountPct });
    return db.projects.at(-1).id;
  };
  const ensureProduct = (name, price = 1000) => {
    const found = db.products.find((p) => p.name === name);
    if (found) return found.id;
    const n = db.products.length + 1;
    go('productCreate', {
      bookId: `46622440000${String(10000 + n)}`, name, sku: `SKU-${String(n).padStart(4, '0')}`,
      description: `${name} (sample catalog item)`, unit: 'pcs', rate: Math.round(price * 1.7), category: 'Lighting',
    });
    return db.products.at(-1).id;
  };

  const surname = (name) => name.split(' ').slice(1).join(' ') || name;
  const baseData = (o) => {
    const customerId = ensureCustomer(o.customer, o.type);
    const projectId = o.noProject ? '' : ensureProject(customerId, o.project || `${surname(o.customer)} Project`, o.discount || 0);
    return {
      customerId, projectId, itemId: ensureProduct(o.item, o.price), qty: o.qty || 2, targetDate: addDays(today, 30),
      salesOwner: o.owner || 'HC Sales 1', groupDiscountPct: o.discount ?? '', orderType: 'Normal',
    };
  };
  const quote = (supplier, price, extra = {}) => ({
    supplier, availability: 'Confirmed', initial: price, negotiated: 0, leadTime: '2 weeks', stage: 'Final', selected: true, ...extra,
  });
  const newInquiry = (data) => {
    go('inquiryCreate', { data });
    return db.inquiries.at(-1).id;
  };

  // A fully ready inquiry taken all the way to a Sales Order. Returns the SO number.
  const order = (o) => {
    const id = newInquiry({
      ...baseData(o), qty: o.qty, quotes: [quote(o.supplier, o.price)], collateral: ALL_COMPLETE, srp: Math.round(o.price * 1.7), ...(o.orderType ? { orderType: o.orderType } : {}),
    });
    go('inquiryEstimate', { id });
    go('inquiryApprove', { id, mode: o.mode, payment: o.payment, forCrate: o.forCrate });
    return db.inquiries.find((q) => q.id === id).soNo;
  };
  const pr = (so) => db.prs.find((x) => x.soNo === so);
  const item = (so) => db.items.find((x) => x.soNo === so);
  const po = (no) => db.pos.find((x) => x.no === no);

  // Takes a PR through PO, shipment and arrival, ready to receive.
  const toArrival = (so) => {
    const p = pr(so);
    go('prConvert', { ids: [p.id] });
    const o = po(pr(so).poNo);
    go('poSend', { id: o.id });
    go('poAcknowledge', { id: o.id, etd: addDays(today, -20), eta: addDays(today, -2) });
    const ship = db.shipments.find((s) => s.poId === o.id);
    go('shipmentTransit', { id: ship.id });
    go('shipmentArrive', { id: ship.id });
    return db.receivings.find((r) => r.shipmentId === ship.id);
  };

  // Takes an in-stock or received item through the Fulfillment stages up to a chosen stage.
  const advance = (so, upTo, opts = {}) => {
    const it = () => item(so);
    go('createPackage', { id: it().id });
    if (upTo === 'gate') return;
    go('assignPicker', { id: it().id, picker: opts.picker || 'Ben Santos' });
    go('setPayment', { id: it().id, payment: opts.payment || 'Paid' });
    go('gateRelease', { id: it().id });
    if (upTo === 'pick') return;
    go('pickDone', { id: it().id });
    if (upTo === 'pack') return;
    go('qcAssign', { id: it().id, packer: opts.packer || 'Carlo Reyes' });
    if (upTo === 'qc') return;
    go('qcApprove', { id: it().id });
    if (upTo === 'crate') return;
    if (it().stage === 'Crate') {
      go('crateSet', { id: it().id, status: 'Done' });
      go('crateComplete', { id: it().id });
    }
  };

  const dispatchTo = (so, o = {}) => {
    advance(so, 'aggregation', o);
    go('dispatch', { id: item(so).id, type: o.type || 'Delivery', requestedDate: o.requestedDate || '' });
    return db.serviceRequests.find((s) => s.soNo === so);
  };

  // ── Procurement: inquiries that became Sales Orders, then moved down the chain ──
  const soA = order({ customer: 'Marco Villa', item: 'LED Panel 60W', qty: 20, supplier: 'Fenteng Lighting', price: 850, mode: 'Airfreight' });
  const rcvA = toArrival(soA);
  go('receive', { id: rcvA.id, accepted: 20 });
  advance(soA, 'pick');

  const soB = order({ customer: 'Ana Reyes', item: 'Chandelier 8-arm', qty: 5, supplier: 'Tony Fan', price: 12500, mode: 'LCL' });
  {
    const p = pr(soB);
    go('prConvert', { ids: [p.id] });
    const o = po(pr(soB).poNo);
    go('poSend', { id: o.id });
    go('poAcknowledge', { id: o.id, etd: addDays(today, -6), eta: addDays(today, 40) });
    go('shipmentTransit', { id: db.shipments.find((s) => s.poId === o.id).id });
  }

  const soC = order({ customer: 'Tito Cruz', item: 'Track Light 12W', qty: 40, supplier: 'Fenteng Lighting', price: 640, mode: 'Airfreight' });

  order({ customer: 'Lina Ong', item: 'Pendant Lamp', qty: 8, supplier: 'Tony Fan', price: 3200, mode: '' });

  const soE = order({ customer: 'Ramon Tan', item: 'Wall Sconce', qty: 12, supplier: 'Fenteng Lighting', price: 980, mode: 'FCL' });
  go('prHold', { id: pr(soE).id, reason: 'Client stopped order', notes: '' });

  const soF = order({ customer: 'Grace Lim', item: 'Outdoor Bollard', qty: 10, supplier: 'Tony Fan', price: 4100, mode: 'LCL' });
  const rcvF = toArrival(soF);
  go('receive', { id: rcvF.id, accepted: 7, damaged: 2, missing: 1 });

  order({ customer: 'Local Buyer', item: 'Desk Lamp', qty: 6, supplier: 'HC System', price: 450 });

  // ── Inquiry: records at every readiness level, left open on purpose ──
  // Not Ready (0 of 5): nothing quoted yet, no project.
  newInquiry({ ...baseData({ customer: 'Paolo Diaz', item: 'Ceiling Fan Light', price: 2400, noProject: true }), qty: 4 });

  // In Progress (2 of 5): one supplier has confirmed stock and quoted, nothing chosen yet.
  const miaId = newInquiry({
    ...baseData({ customer: 'Mia Soriano', item: 'Rail Spotlight', price: 720, project: 'Soriano Residence' }), qty: 18,
    quotes: [quote('Fenteng Lighting', 720, { selected: false, stage: 'Negotiating' }), { supplier: 'Tony Fan', availability: 'Pending', initial: 0, negotiated: 0, leadTime: '', stage: 'Not Selected', selected: false }],
  });

  // A quote group with two inquiries: one Ready, one Not Ready, so the group reads "In Progress".
  const pinedaA = newInquiry({
    ...baseData({ customer: 'Zed Pineda', item: 'Linear Pendant', price: 1900, project: 'Pineda Villa', discount: 5 }), qty: 6,
    quotes: [quote('Tony Fan', 1900)], collateral: ALL_COMPLETE, srp: 3230,
  });
  newInquiry({ ...baseData({ customer: 'Zed Pineda', item: 'Wall Washer 18W', price: 800, project: 'Pineda Villa', discount: 5 }), qty: 10 });

  // Ready (5 of 5), estimate not created yet.
  newInquiry({
    ...baseData({ customer: 'Ivy Cruz', item: 'Garden Spike Light', price: 560, project: 'Cruz Garden' }), qty: 24,
    quotes: [quote('Fenteng Lighting', 560, { negotiated: 520 })], collateral: { sample: 'Completed', dImage: 'N/A', drawing: 'N/A', spec: 'Completed' }, srp: 950,
  });

  // Estimate created, waiting to become a Sales Order.
  const edId = newInquiry({
    ...baseData({ customer: 'Ed Navarro', item: 'Garden Light', price: 1100, project: 'Navarro Garden' }), qty: 30,
    quotes: [quote('Tony Fan', 1100)], collateral: ALL_COMPLETE, srp: 1870, orderType: 'Pre Order',
  });
  go('inquiryEstimate', { id: edId });

  // Conversations on the Ed Navarro inquiry.
  go('chatSend', { id: edId, supplier: 'Tony Fan', role: 'Buyer', message: 'Can you confirm stock for 30 pcs before Friday?' });
  go('chatSend', { id: edId, supplier: 'Tony Fan', role: 'Supplier', message: 'Confirmed. We can ship within two weeks.' });
  go('noteSend', { id: edId, role: 'HC Sales', message: 'Client wants the delivery before the site turnover. Please prioritise.' });
  go('noteSend', { id: edId, role: 'HC Purchasing', message: 'Noted. Tony Fan has stock, so this should not slip.' });
  go('chatSend', { id: miaId, supplier: 'Fenteng Lighting', role: 'Buyer', message: 'Please send the technical drawing for the rail spotlight.' });
  void pinedaA;

  // ── Fulfillment: in-stock orders at each stage ──
  const stock = { supplier: 'Warehouse Stock' };
  const soG = order({ customer: 'Joy Lim', item: 'Bulb E27 (box)', qty: 60, price: 90, ...stock, payment: 'Unpaid' });
  advance(soG, 'gate', {});
  go('assignPicker', { id: item(soG).id, picker: 'Dina Cruz' });

  advance(order({ customer: 'Kim Uy', item: 'Floor Lamp', qty: 3, price: 5600, ...stock }), 'qc');
  advance(order({ customer: 'Lou Pena', item: 'Display Cabinet Light', qty: 2, price: 8800, ...stock, forCrate: true }), 'crate');
  advance(order({ customer: 'Nick Go', item: 'Magnetic Track', qty: 15, price: 1300, ...stock }), 'aggregation');
  advance(order({ customer: 'Opal Chua', item: 'Smart Switch', qty: 9, price: 1750, ...stock, payment: 'Credit' }), 'aggregation', { payment: 'Credit' });

  const soS = order({ customer: 'Pia Ramos', item: 'Glass Pendant', qty: 4, price: 3900, ...stock });
  advance(soS, 'qc');
  go('qcReject', { id: item(soS).id, reason: 'Cracked shade', type: 'Damaged' });

  // ── Delivery Management: one job at every status ──
  const sr = (customer, name, o) => dispatchTo(order({ customer, item: name, qty: 2, price: 2000, ...stock }), o);

  sr('Quin Abad', 'Wall Washer', {});
  sr('Rita Bello', 'Strip Light', { requestedDate: addDays(today, 2) });
  const srM = sr('Sam Cortez', 'Dimmer Kit', { requestedDate: addDays(today, 1) });
  go('srConfirmSite', { id: srM.id, method: 'Phone call', notes: 'Guard will let the team in' });
  go('srHandOff', { id: srM.id });
  const srN = sr('Tess Dela', 'Table Lamp', { requestedDate: addDays(today, 1) });
  go('srConfirmSite', { id: srN.id, method: 'SMS', notes: 'Customer replied YES' });
  go('srHandOff', { id: srN.id });
  go('srSchedule', { id: srN.id });
  const srO = sr('Uma Eco', 'Fan Light', { requestedDate: addDays(today, 1) });
  go('srConfirmSite', { id: srO.id, method: 'Phone call', notes: 'Condo admin notified' });
  go('srHandOff', { id: srO.id });
  go('srSchedule', { id: srO.id });
  go('srStart', { id: srO.id });
  const srP = sr('Vic Fox', 'Garden Spike', { requestedDate: addDays(today, 1) });
  go('srConfirmSite', { id: srP.id, method: 'Phone call', notes: 'Confirmed' });
  go('srHandOff', { id: srP.id });
  go('srSchedule', { id: srP.id });
  go('srStart', { id: srP.id });
  go('srFail', { id: srP.id, reason: 'Nobody home at the site' });
  const srQ = sr('Wes Gil', 'Night Light', { requestedDate: addDays(today, 1) });
  go('srConfirmSite', { id: srQ.id, method: 'Phone call', notes: 'Confirmed' });
  go('srHandOff', { id: srQ.id });
  go('srSchedule', { id: srQ.id });
  go('srStart', { id: srQ.id });
  go('srComplete', { id: srQ.id });
  const srR = sr('Xena Ho', 'Reading Lamp', { type: 'Pick Up', requestedDate: addDays(today, 1) });
  go('srHandOff', { id: srR.id });
  go('srSchedule', { id: srR.id });

  // ── Supplier portals: Tony Fan and Fenteng Lighting each get lines at every status ──
  // Added last so the numbers above (INQ-00009, PR-00003 ...) stay where they were.
  const THEM = { 'Tony Fan': 'Fenteng Lighting', 'Fenteng Lighting': 'Tony Fan' };
  const names = { 'Tony Fan': ['Brass Bracket', 'Glass Globe', 'Rattan Shade', 'Copper Pendant', 'Marble Base'], 'Fenteng Lighting': ['Panel Driver', 'Floodlight 50W', 'Strip Kit', 'Smart Bulb', 'Linear Batten'] };
  const manualPR = (supplier, itemName, price) => {
    const base = baseData({ customer: 'Abe Lopez', item: itemName, price: 1500, noProject: true });
    go('prCreate', { data: { itemId: base.itemId, customerId: base.customerId, qty: 4, targetDate: addDays(today, 45), salesOwner: 'HC Sales 1', supplier, mode: supplier === 'Tony Fan' ? 'LCL' : 'Airfreight', price, overrideReason: 'Best price for this item' } });
  };
  for (const [name, price] of [['Tony Fan', 2100], ['Fenteng Lighting', 780]]) {
    const [selectedItem, lostItem, waitingItem, respondedItem, poItem] = names[name];
    // Selected: the buyer chose this supplier. Pricing is locked, the collateral checklist is open.
    newInquiry({
      ...baseData({ customer: 'Abe Lopez', item: selectedItem, price, project: 'Lopez Loft' }), qty: 6,
      quotes: [quote(name, price)], collateral: { sample: 'Completed', dImage: 'Pending', drawing: 'Pending', spec: 'Pending' }, srp: Math.round(price * 1.7),
    });
    // Not Selected: the other supplier won this line.
    newInquiry({
      ...baseData({ customer: 'Abe Lopez', item: lostItem, price, project: 'Lopez Loft' }), qty: 3,
      quotes: [quote(THEM[name], price), quote(name, Math.round(price * 1.2), { selected: false, stage: 'Not Selected' })], collateral: ALL_COMPLETE, srp: Math.round(price * 1.7),
    });
    // Waiting: not answered yet.
    newInquiry({
      ...baseData({ customer: 'Bea Ocampo', item: waitingItem, price, project: 'Ocampo Cafe' }), qty: 12,
      quotes: [{ supplier: name, availability: 'Pending', initial: 0, negotiated: 0, leadTime: '', stage: 'Not Selected', selected: false }],
    });
    // Submit Response: answered, still open.
    newInquiry({
      ...baseData({ customer: 'Bea Ocampo', item: respondedItem, price, project: 'Ocampo Cafe' }), qty: 8,
      quotes: [quote(name, price, { selected: false, stage: 'Negotiating' })],
    });
    // Purchase requests raised by hand (they are quoted in the portal, not on an inquiry).
    manualPR(name, `${waitingItem} (spare)`, 0);
    manualPR(name, `${respondedItem} (spare)`, price);
    // A PO that has been sent and waits for the supplier to acknowledge.
    const soSent = order({ customer: 'Cy Dizon', item: poItem, qty: 5, supplier: name, price, mode: name === 'Tony Fan' ? 'LCL' : 'Airfreight' });
    go('prConvert', { ids: [pr(soSent).id] });
    go('poSend', { id: po(pr(soSent).poNo).id });
    // A PO that is acknowledged, so its shipment is waiting to be shipped.
    const soAck = order({ customer: 'Di Eng', item: `${poItem} Mk2`, qty: 7, supplier: name, price, mode: name === 'Tony Fan' ? 'LCL' : 'Airfreight' });
    go('prConvert', { ids: [pr(soAck).id] });
    const poAck = po(pr(soAck).poNo);
    go('poSend', { id: poAck.id });
    go('poAcknowledge', { id: poAck.id, etd: addDays(today, 4), eta: addDays(today, 25) });
  }
  // Replacement requests: one waiting for approval, one in production, one on its way.
  {
    const mode = 'LCL';
    // The exception on Grace Lim's order stays open, as the sample data always had it. Tony Fan gets two more.
    const tonyReplacement = (customer, itemName) => {
      const so = order({ customer, item: itemName, qty: 6, supplier: 'Tony Fan', price: 1800, mode });
      go('receive', { id: toArrival(so).id, accepted: 5, damaged: 1 });
      const exc = db.exceptions.find((e) => e.supplier === 'Tony Fan' && e.status === 'Open' && e.prNos.includes(pr(so).no));
      go('exceptionCreateRR', { id: exc.id, supplier: 'Tony Fan' });
      return db.rrs.find((r) => r.excId === exc.id);
    };
    tonyReplacement('Fay Go', 'Opal Shade');
    const rrTony = tonyReplacement('Gus Hao', 'Onyx Shade');
    go('supplierApproveRR', { id: rrTony.id, supplier: 'Tony Fan', mode, expShip: addDays(today, 3), eta: addDays(today, 18) });
    go('supplierRRProgress', { id: rrTony.id, supplier: 'Tony Fan', status: 'In Production' });

    // Fenteng Lighting: one replacement left waiting for approval, one already on its way.
    const soG2 = order({ customer: 'Hal Ito', item: 'Dome Cover', qty: 9, supplier: 'Fenteng Lighting', price: 260, mode: 'Airfreight' });
    go('receive', { id: toArrival(soG2).id, accepted: 8, damaged: 1 });
    go('exceptionCreateRR', { id: db.exceptions.find((e) => e.supplier === 'Fenteng Lighting' && e.status === 'Open' && e.prNos.includes(pr(soG2).no)).id, supplier: 'Fenteng Lighting' });
    const soH = order({ customer: 'Eli Fong', item: 'Ceiling Rose', qty: 10, supplier: 'Fenteng Lighting', price: 300, mode: 'Airfreight' });
    const rcvH = toArrival(soH);
    go('receive', { id: rcvH.id, accepted: 8, damaged: 2 });
    const excH = db.exceptions.find((e) => e.supplier === 'Fenteng Lighting' && e.status === 'Open' && e.prNos.includes(pr(soH).no));
    go('exceptionCreateRR', { id: excH.id, supplier: 'Fenteng Lighting' });
    const rrFen = db.rrs.find((r) => r.excId === excH.id);
    go('supplierApproveRR', { id: rrFen.id, supplier: 'Fenteng Lighting', mode: 'Airfreight', expShip: addDays(today, 2), eta: addDays(today, 12) });
    go('supplierRRProgress', { id: rrFen.id, supplier: 'Fenteng Lighting', status: 'In Production' });
    go('supplierRRProgress', { id: rrFen.id, supplier: 'Fenteng Lighting', status: 'Shipped' });
  }

  // ── Sales Order Report / Pre-Order: received orders still waiting for a package ──
  order({ customer: 'Ula Mendoza', item: 'Wall Bracket Set', qty: 12, price: 700, ...stock });
  order({ customer: 'Vin Soto', item: 'Pre-order Chandelier', qty: 2, price: 9800, ...stock, orderType: 'Pre Order' });

  // ── Exception Control: QC rejects at each stage of the rework flow ──
  {
    const reject = (customer, name, reason) => {
      const so = order({ customer, item: name, qty: 2, price: 2400, ...stock });
      advance(so, 'qc');
      go('qcReject', { id: item(so).id, reason, type: 'Damaged' });
      return db.exceptions.find((e) => e.itemId === item(so).id);
    };
    go('ecRework', { id: reject('Yan Co', 'Ceramic Base', 'Chipped glaze').id });
    const exU = reject('Zoe Ang', 'Brass Stem', 'Bent beyond repair');
    go('ecUnrepairable', { id: exU.id });
  }

  // ── Transfer Item ──
  go('transferCreate', { kind: 'Warehouse Request', item: 'Bulb E27 (box)', qty: 30, from: 'Showroom', to: 'Main Warehouse' });
  go('transferCreate', { kind: 'Warehouse Request', item: 'Track Light 12W', qty: 10, from: 'Bodega 2', to: 'Showroom' });
  go('transferAdvance', { id: db.transfers.at(-1).id });
  go('transferCreate', { kind: 'Transfer Warehouse', item: 'Floor Lamp', qty: 4, from: 'Main Warehouse', to: 'Bodega 2' });
  go('transferCreate', { kind: 'Transfer Warehouse', item: 'Magnetic Track', qty: 12, from: 'Bodega 2', to: 'Main Warehouse' });
  go('transferAdvance', { id: db.transfers.at(-1).id });

  // ── Delivery Management: returns, site visits, trucks, schedule requests ──
  go('salesReturnCreate', { id: srQ.id, warehouse: 'Main Warehouse' });
  go('salesReturnSendToBooks', { id: db.salesReturns.at(-1).id, rma: 'RMA-2026-0001', reason: 'Customer changed the order', qty: 1, signature: 'Wes Gil' });
  go('salesReturnCreate', { id: srP.id, warehouse: 'Showroom' });
  go('siteVisitCreate', { id: srM.id, kind: 'Installation Assessment', visitDate: addDays(today, 1) });
  go('siteVisitUpdate', { id: db.siteVisits.at(-1).id, siteReady: true, notes: 'Ceiling is open and the power is on.' });
  go('siteVisitCreate', { id: srN.id, kind: 'Repair Assessment', visitDate: addDays(today, 2) });
  go('siteVisitCreate', { id: srO.id, kind: 'Other', visitDate: today });
  go('truckChecklistCreate', { truck: 'Truck 1', date: today, issues: 0, notes: 'Tires and lights fine' });
  go('truckChecklistAdvance', { id: db.truckChecks.at(-1).id });
  go('truckChecklistAdvance', { id: db.truckChecks.at(-1).id, signature: 'Driver A' });
  go('truckChecklistCreate', { truck: 'Truck 2', date: today, issues: 2, notes: 'Brake light out, wiper worn' });
  go('truckChecklistAdvance', { id: db.truckChecks.at(-1).id });
  go('truckChecklistCreate', { truck: 'Truck 3', date: addDays(today, 1), issues: 0, notes: '' });
  go('truckEntryAdd', { kind: 'fuel', truck: 'Truck 1', date: today, cost: 3200, liters: 52, note: 'Full tank' });
  go('truckEntryAdd', { kind: 'service', truck: 'Truck 2', date: addDays(today, -3), cost: 8500, note: 'Oil change and brake pads' });
  go('scheduleRequestCreate', { id: srM.id, newDate: addDays(today, 5), reason: 'The client will be abroad until then.' });
  go('scheduleRequestCreate', { id: srN.id, newDate: addDays(today, 3), reason: 'Site is not ready yet.' });
  go('scheduleRequestDecide', { id: db.scheduleRequests.at(-1).id, decision: 'Decline', note: 'Already booked with a team' });

  db.audit = db.audit.slice(-40);
  return db;
}
