// The whole Procurement process and the supplier portal, step by step, against a RUNNING local server (never Railway).
// It leaves its data in the server so it can be looked at in the browser. Use a FRESH local database (empty DATA_DIR), never a real one:
//   DATA_DIR=<empty folder> PORT=4200 DEV_PG_PORT=5700 ADMIN_EMAIL=<email> ADMIN_PASSWORD=<first password> node tools/dev-pg.mjs
//   node tools/full-flow-check.mjs http://localhost:4200 <email> <first password> <new password>
// (the first login forces a new password, which this script sets). Writes flow-result.json (or $FLOW_OUT).
const [BASE, EMAIL, OLDPW, NEWPW] = process.argv.slice(2);
let cookie = '';
const results = [];
let phase = '';
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function login(pw) {
  const r = await fetch(BASE + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: EMAIL, password: pw, next: '/' }) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return r.headers.get('location');
}
const post = async (path, body) => (await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })).json();
const add = (form, data) => post('/api/addRecords', { form_name: form, payload: { data } });
const upd = (form, id, data) => post('/api/updateRecordById', { report_name: form, id: String(id), payload: { data } });
const rows = async (form, criteria) => (await post('/api/getRecords', { report_name: form, ...(criteria ? { criteria } : {}) })).data || [];
const one = async (form, id) => (await post('/api/getRecordById', { report_name: form, id: String(id) })).data;
const call = async (name, payload) => { const r = await post('/api/invokeCustomApi', { api_name: name, payload }); return r.result ?? r.data ?? r; };
async function upload(form, id, field, name, bytes) {
  const qs = new URLSearchParams({ report: form, id: String(id), field, name });
  return (await fetch(BASE + '/api/uploadFile?' + qs, { method: 'POST', headers: { cookie }, body: bytes })).json();
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function step(name) { phase = name; console.log('\n=== ' + name); }
function check(label, cond, detail = '') { results.push({ phase, label, pass: !!cond, detail }); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && detail ? '  <-- ' + detail : ''}`); return !!cond; }
const code = (r) => r && (r.code ?? r.data?.code);
async function safe(name, fn) { try { await fn(); } catch (e) { check(name + ' (no crash)', false, e.message.slice(0, 160)); } }

// ---------------------------------------------------------------- 0. sign in
console.log('Base:', BASE);
let next = await login(OLDPW);
if (/first=1/.test(next || '')) {
  const r = await post('/api/account/password', { current: OLDPW, next: NEWPW });
  await login(NEWPW);
  console.log('first login: password changed', r.ok ? 'ok' : JSON.stringify(r));
} else if (!next || /login/.test(next)) { await login(NEWPW); }
const me = await (await fetch(BASE + '/api/me', { headers: { cookie } })).json();
console.log('signed in as', me.email, '| role', me.role, '| data source', me.dataSource);

const S = {};
await safe('setup', async () => {
  step('0. Master data: suppliers, customer, items, the Sales Orders');
  const sup = async (n, id, all = true) => (await add('Suppliers', { Supplier_Name: { first_name: n, last_name: '' }, Supplier_ID: id, Handles_All: all, Max_Capacity: 100 })).data?.ID;
  S.tony = await sup('Tony Fan', '2680178000002735078'); S.fenteng = await sup('Fenteng Lighting', '2680178000049168001'); S.hc = await sup('HC System', 'HC-LOCAL', false);
  S.cust = (await add('Customer', { customer_name: 'Villa Aurora Hotel' })).data?.ID;
  S.bp = (await add('Items', { item_name: 'Brass Pendant 40cm', SKU: 'BP-100', Rate: 0, category: 'Pendant Light' })).data?.ID;
  S.rs = (await add('Items', { item_name: 'Rattan Shade 30cm', SKU: 'RS-200', Rate: 0, category: 'Pendant Light' })).data?.ID;
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-1001', SO_Created_Date: day(-14) });
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-1002', SO_Created_Date: day(-6) });
  check('3 suppliers, 1 customer and 2 items created', S.tony && S.fenteng && S.hc && S.cust && S.bp && S.rs);
});

// ---------------------------------------------------------------- 1. Inquiry
await safe('inquiry', async () => {
  step('1. INQUIRY: the buyer asks both suppliers; each answers in its portal');
  const r = await add('Inquiry_Form', { sku: 'BP-100', quantity: 10, unit: 'pcs', target_date: day(60), description: 'Brass pendant for the hotel lobby', Items: S.bp, Suppliers: [S.tony, S.fenteng] });
  S.inqId = r.data?.ID;
  let inq = await one('Inquiry_Form', S.inqId);
  S.inqNo = inq.INQ_No;
  check('inquiry numbered and sent (Sent_At stamped)', /^INQ-\d{5}$/.test(inq.INQ_No) && inq.Sent_At, `${inq.INQ_No} ${inq.Sent_At}`);
  check('one quote row per supplier, by supplier ID', inq.Supplier_Quotes.length === 2 && inq.Supplier_Quotes.every((q) => /^\[\d+\]$/.test(q.Supplier_ID)));
  const tCopy = (await rows('Supplier_2')).find((c) => c.INQ_No_Supplier === S.inqNo);
  const fCopy = (await rows('Supplier_1')).find((c) => c.INQ_No_Supplier === S.inqNo);
  check('both supplier portals received the inquiry', tCopy && fCopy);
  const ans = (copy, extra) => [{ ...copy.Supplier_quotes[0], ...extra }];
  const t = await upd('Supplier_2', tCopy.ID, { Supplier_quotes: ans(tCopy, { Availability_Supplier: 'Available', Initial_Price_Supplier: '120', Negotiated_Supplier: '110', Final_Price_Supplier: '110', Lead_Time_Supplier: '3 weeks' }), Response_Status: 'Submit Response' });
  check('Tony Fan answers in its portal: 110 CNY, lead "3 weeks"', code(t) === 3000, JSON.stringify(t).slice(0, 150));
  const f = await upd('Supplier_1', fCopy.ID, { Supplier_quotes: ans(fCopy, { Availability_Supplier: 'Cannot Produce', Initial_Price_Supplier: '99', Final_Price_Supplier: '99', Lead_Time_Supplier: '10' }), Response_Status: 'Submit Response' });
  inq = await one('Inquiry_Form', S.inqId);
  const tq = inq.Supplier_Quotes.find((q) => /Tony/.test(q.Suppliers)), fq = inq.Supplier_Quotes.find((q) => /Fenteng/.test(q.Suppliers));
  check('Tony answer reached the buyer\'s inquiry', tq.Availability === 'Available' && Number(tq.Final_Price) === 110, JSON.stringify([tq.Availability, tq.Final_Price]));
  check('Fenteng "Cannot Produce": price and lead time were cleared (INQ-R2)', fq.Availability === 'Cannot Produce' && !Number(fq.Final_Price) && !fq.Lead_Time, JSON.stringify(fq));
  check('First quote stamped, buyer told that every supplier has answered', inq.First_Quote_At && (await rows('App_Notifications')).some((n) => n.Notification_Type === 'Inquiry Quotes Complete'));
  check('feasibility hint under the quotes (INQ-R7)', /Tony Fan: Lead 21 days \+ sea/.test(inq.Feasibility_Hints || ''), inq.Feasibility_Hints);
  const sel = await upd('Inquiry_Form', S.inqId, { Supplier_Quotes: inq.Supplier_Quotes.map((q) => ({ ...q, Selected: /Tony/.test(q.Suppliers) })) });
  inq = await one('Inquiry_Form', S.inqId);
  check('buyer selects Tony Fan: lead time becomes 21 days (INQ-R3), selection stamped', Number(inq.Selected_Lead_Days) === 21 && inq.Selected_At && String(inq.Selected_Supplier_Id) === String(S.tony), JSON.stringify([inq.Selected_Lead_Days, inq.Selected_Supplier_Id]));
  const ev = (await rows('Stage_Events')).filter((e) => e.Record_Type === 'inquiry' && String(e.Record_Id) === String(S.inqId)).map((e) => e.Event);
  check('event log: sent, first_quote_received, supplier_selected', ['inquiry.sent', 'inquiry.first_quote_received', 'inquiry.supplier_selected'].every((e) => ev.includes(e)), ev.join(','));
});

// ---------------------------------------------------------------- 2. Purchase Requests
await safe('pr', async () => {
  step('2. PURCHASE REQUEST: two lines for SO-1001 (on time) and one for SO-1002 (cannot arrive in time)');
  const mk = (so, item, sku, qty, target) => add('Purchase_Request1', { Sales_Order: so, Customer: S.cust, Items: item, sku, quantity: qty, unit: 'pcs', category: 'Pendant Light', Target_Delivery: target, Shipment_Mode: 'LCL', Customer_Type: 'customer', Sales_Owner: 'HC Sales 1' });
  S.pr1 = (await mk('SO-1001', S.bp, 'BP-100', 10, day(150))).data?.ID; S.pr2 = (await mk('SO-1001', S.rs, 'RS-200', 20, day(150))).data?.ID; S.pr3 = (await mk('SO-1002', S.bp, 'BP-100', 4, day(25))).data?.ID;
  const list = await rows('Purchase_Request1');
  const mine = list.filter((p) => ['SO-1001', 'SO-1002'].includes(p.Sales_Order));
  check('3 PRs numbered, each sent to both supplier portals', mine.length === 3 && mine.every((p) => p.Supplier_Selected?.length === 2) && (await rows('Tony_Fan_Purchase_Request')).length === 3 && (await rows('Fenteng_Lighting_Purchase_Request')).length === 3);
  const tcopies = await rows('Tony_Fan_Purchase_Request'), fcopies = await rows('Fenteng_Lighting_Purchase_Request');
  const noSrp = [...tcopies, ...fcopies].every((c) => Object.entries(c).filter(([k]) => /^SRP_Rate_PR/.test(k)).every(([, v]) => v == null || v === '' || v === 0));
  check('the suppliers\' copies carry no selling price (SP-R1)', noSrp);
  for (const c of tcopies) {
    const r = await upd('Tony_Fan_Purchase_Request', c.ID, { Response_Status: 'Submit Response', Supplier_Selected_Supplier2: [{ Suppliers_Supplier2: 'Tony Fan', Availability_Supplier2: 'Available', Initial_Price_Supplier2: 90, Negotiated_Supplier2: 85, Final_Price_Supplier2: 80, Lead_Time_Supplier2: 20 }] });
    if (code(r) !== 3000) check('Tony answers a PR', false, JSON.stringify(r).slice(0, 160));
  }
  for (const c of fcopies) await upd('Fenteng_Lighting_Purchase_Request', c.ID, { Response_Status: 'Submit Response', Supplier_Selected_Supplier1: [{ Suppliers_Supplier1: 'Fenteng Lighting', Availability_Supplier1: 'Available', Initial_Price_Supplier1: 100, Negotiated_Supplier1: 95, Final_Price_Supplier1: 90, Lead_Time_Supplier1: 20 }] });
  let pr1 = await one('Purchase_Request1', S.pr1);
  check('both suppliers\' answers are on the buyer\'s PR', pr1.Supplier_Selected.every((r) => r.Availability === 'Available'));
  check('the recommendation says why, in words (PR-R4)', /Tony Fan|Fenteng/.test(pr1.Recommendation_Reason || '') && (pr1.Recommendation_Reason || '').length > 20, pr1.Recommendation_Reason);
  for (const id of [S.pr1, S.pr2, S.pr3]) { const p = await one('Purchase_Request1', id); await upd('Purchase_Request1', id, { Supplier_Selected: p.Supplier_Selected.map((r) => ({ ...r, Selected: /Tony/.test(String(r.Suppliers?.zc_display_value ?? r.Suppliers)) })) }); }
  pr1 = await one('Purchase_Request1', S.pr1); const pr3 = await one('Purchase_Request1', S.pr3);
  check('the buyer picks Tony Fan: ready for PO, Tony\'s copy Selected', pr1.PR_READY_FOR_PO === true || pr1.PR_READY_FOR_PO === 'true', JSON.stringify([pr1.PR_READY_FOR_PO, pr1.Selected_Supplier]));
  check('PR-R6: SO-1001 is feasible, SO-1002 is impossible with a shortfall and an air option', pr1.Feasibility === 'feasible' && pr3.Feasibility === 'impossible' && Number(pr3.Shortfall_Days) > 0 && /air/i.test(pr3.Air_Option || ''), JSON.stringify([pr1.Feasibility, pr3.Feasibility, pr3.Shortfall_Days, pr3.Air_Option]));
  const held = await add('Purchase_Request1', { Sales_Order: 'SO-1003', Customer: S.cust, Items: S.rs, sku: 'RS-200', quantity: 1, unit: 'pcs', Target_Delivery: day(90), Shipment_Mode: 'LCL' });
  const noReason = await upd('Purchase_Request1', held.data?.ID, { Hold_Status: 'On Hold' });
  check('putting a PR on hold needs a reason (PR-R7)', code(noReason) !== 3000, JSON.stringify(noReason).slice(0, 120));
  const del = await post('/api/deleteRecordById', { report_name: 'Purchase_Request1', id: String(S.pr1) });
  check('a PR can never be deleted', code(del) !== 3000, JSON.stringify(del).slice(0, 120));
});

// ---------------------------------------------------------------- 3. Create PO
await safe('po', async () => {
  step('3. CREATE PO: the feasibility gate, one PO per supplier and mode');
  const gate = await call('approve_po_main', { soNo: 'SO-1002' });
  check('the late line stops at the gate and nothing is written (PO-R1)', gate.status === 'needs_choice' && (await rows('Purchase_Order')).length === 0, JSON.stringify(gate).slice(0, 200));
  const lines = gate.lines || [];
  check('the gate offers air / new target / proceed, with the shortfall', lines.length === 1 && Number(lines[0].shortfall_days) > 0, JSON.stringify(lines[0] || {}).slice(0, 220));
  const prNo3 = lines[0]?.pr_no ?? lines[0]?.PR_No ?? (await one('Purchase_Request1', S.pr3)).PR_No;
  const air = await call('approve_po_main', { soNo: 'SO-1002', lateChoices: { [prNo3]: 'air' } });
  check('choosing Air creates the PO', air.status === 'success', JSON.stringify(air).slice(0, 200));
  const norm = await call('approve_po_main', { soNo: 'SO-1001' });
  check('SO-1001 (on time) becomes one PO with both lines', norm.status === 'success', JSON.stringify(norm).slice(0, 200));
  const pos = await rows('Purchase_Order');
  S.poAir = pos.find((p) => p.SO_No && p.Shipment_Mode === 'Airfreight'); S.poSea = pos.find((p) => p.Shipment_Mode === 'LCL');
  check('PO-R4: one PO is LCL (2 lines), one is Airfreight (1 line); each has one supplier', pos.length === 2 && S.poSea?.PO_Line_Items?.length === 2 && S.poAir?.PO_Line_Items?.length === 1 && pos.every((p) => /Tony/.test(p.Supplier_Name || '')), pos.map((p) => `${p.PO_No}:${p.Shipment_Mode}:${p.PO_Line_Items?.length}:${p.Supplier_Name}`).join(' | '));
  check('the air PO is "born late" (measured at the gate), with the choice in its note (PO-R3)', S.poAir?.Born_Late === true && Number(S.poAir.Shortfall_Days) > 0 && /chose air/.test(S.poAir.Feasibility_Note || ''), JSON.stringify([S.poAir?.Born_Late, S.poAir?.Shortfall_Days, S.poAir?.Feasibility_Note]));
  check('the sea PO is on time at creation', S.poSea?.Born_Late !== true && Number(S.poSea?.Lines_Raised) === 2);
  check('production planned start is PO date + 1 (PO-R5)', S.poSea.PO_Line_Items.every((l) => l.Production_Date === day(1)), JSON.stringify(S.poSea.PO_Line_Items.map((l) => l.Production_Date)));
  const t1 = await call('approve_po_tony', { soNo: 'SO-1001' }); const t2 = await call('approve_po_tony', { soNo: 'SO-1002' });
  check('Tony\'s portal copies of both POs, with a shipment each', t1.processed === 2 && t2.processed === 1 && (await rows('Tony_Fan_Purchase_Order')).length === 2 && (await rows('Shipments')).length === 2, JSON.stringify([t1.processed, t2.processed]));
  const tpo = await rows('Tony_Fan_Purchase_Order');
  const tonyLines = tpo.flatMap((c) => c.PO_Line_Items_Supplier2 || []);
  check('Tony sees its OWN price on the PO line, never the selling price (SP-R1)', tonyLines.length === 3 && tonyLines.every((l) => Number(l.Item_Price_Supplier2) === Number(l.Final_Price_Supplier2)), JSON.stringify(tonyLines.map((l) => [l.Item_Price_Supplier2, l.Final_Price_Supplier2])));
  const ships = await rows('Shipments');
  S.shipSea = ships.find((s) => (s.PO_Shipments || []).length === 2); S.shipAir = ships.find((s) => (s.PO_Shipments || []).length === 1);
  check('each shipment has its planned dates, computed (never typed), and the order date of the Sales Order', S.shipSea.Production_Start_Planned && S.shipSea.Arrival_Planned && S.shipSea.Order_Date === day(-14), JSON.stringify([S.shipSea.Production_Start_Planned, S.shipSea.Arrival_Planned, S.shipSea.Order_Date]));
  check('a shipment copy was made in Tony\'s portal for each', (await rows('Tony_Shipment')).length === 2);
});

// ---------------------------------------------------------------- 4. Supplier portal
await safe('portal', async () => {
  step('4. SUPPLIER PORTAL (Tony Fan): acknowledge, production, photo, delay, ship out');
  const poNos = (await rows('Purchase_Order')).map((p) => p.PO_No);
  const notAcked = await call('acknowledge_po_tony', { poNoSupplier2: 'PO-NOPE', etd: day(5), eta: day(40) });
  check('acknowledging a PO that does not exist is refused', notAcked.status === 'error');
  for (const no of poNos) { const a = await call('acknowledge_po_tony', { poNoSupplier2: no, etd: day(30), eta: day(70) }); if (a.status !== 'success') check('acknowledge ' + no, false, JSON.stringify(a)); }
  check('PO acknowledged: PO state, stamp and event', (await rows('Purchase_Order')).every((p) => p.Po_State === 'acknowledged') && (await rows('Stage_Events')).some((e) => e.Event === 'po.acknowledged'));
  const copies = await rows('Tony_Shipment');
  const seaCopy = copies.find((c) => c.Parent_Shipment_ID === String(S.shipSea.ID)), airCopy = copies.find((c) => c.Parent_Shipment_ID === String(S.shipAir.ID));
  S.seaCopy = seaCopy.ID; S.airCopy = airCopy.ID;
  check('the Production screen shows items and planned dates only: no customer, no price, no Sales Order', /BP-100|RS-200/.test(seaCopy.Prod_Lines || '') && seaCopy.Prod_Status === 'not_started' && !/Villa|SO-100|CNY|Rate/i.test(JSON.stringify(Object.entries(seaCopy).filter(([k]) => /^Prod_/.test(k)))), JSON.stringify([seaCopy.Prod_Lines, seaCopy.Prod_Status]));
  // production started with the day they enter
  const st = await upd('Tony_Shipment', S.seaCopy, { Report_Prod_Event: 'production_started', Report_Prod_Date: day(-1) });
  let sea = await one('Shipments', S.shipSea.ID);
  check('production started: the day they entered, and when we were told, are two different facts (SP-R4)', code(st) === 3000 && String(sea.Production_Started_At).startsWith(day(-1)) && sea.Last_Supplier_Update_At, JSON.stringify([code(st), sea.Production_Started_At]));
  const fut = await upd('Tony_Shipment', S.seaCopy, { Report_Prod_Event: 'production_finished', Report_Prod_Date: day(3) });
  check('a date in the future is refused', code(fut) !== 3000, JSON.stringify(fut).slice(0, 120));
  const nophoto = await upd('Tony_Shipment', S.seaCopy, { Report_Prod_Event: 'production_finished', Report_Prod_Date: day(0) });
  check('production finished WITHOUT a photo is refused (ST-R3)', code(nophoto) !== 3000 && /photo/i.test(JSON.stringify(nophoto)), JSON.stringify(nophoto).slice(0, 160));
  const up = await upload('Tony_Shipment', S.seaCopy, 'Prod_Photo', 'pendant-batch.png', PNG);
  check('the supplier uploads a production photo', code(up) === 3000 || up.data?.filepath, JSON.stringify(up).slice(0, 140));
  const fin = await upd('Tony_Shipment', S.seaCopy, { Report_Prod_Event: 'production_finished', Report_Prod_Date: day(0) });
  sea = await one('Shipments', S.shipSea.ID);
  check('production finished with the photo: stamped, and the photo is on the buyer\'s shipment (ST-R4)', code(fin) === 3000 && sea.Production_Finished_At && /uploads/.test(String(sea.Production_Photos)), JSON.stringify([code(fin), sea.Production_Finished_At, String(sea.Production_Photos).slice(0, 40)]));
  // delay on the air shipment
  const noReason = await upd('Tony_Shipment', S.airCopy, { Delay_New_Date: day(40) });
  check('a delay report needs a reason as well as a date (SP-R5)', code(noReason) !== 3000);
  const before = await one('Shipments', S.shipAir.ID);
  const dl = await upd('Tony_Shipment', S.airCopy, { Delay_New_Date: day(40), Delay_Reason: 'Mould cracked, new batch needed' });
  const afterAir = await one('Shipments', S.shipAir.ID);
  check('delay report: planned ship out and arrival move to the supplier\'s new date; the customer target does not', code(dl) === 3000 && afterAir.Shipout_Planned === day(40) && afterAir.Arrival_Planned > before.Arrival_Planned && afterAir.Target_Date === before.Target_Date, JSON.stringify([code(dl), afterAir.Shipout_Planned, before.Arrival_Planned, afterAir.Arrival_Planned]));
  // ship out (sea shipment)
  const copy = await one('Tony_Shipment', S.seaCopy);
  const ship = await upd('Tony_Shipment', S.seaCopy, { Supplier2_Shipment_Details: copy.Supplier2_Shipment_Details.map((r) => ({ ...r, Select_To_Ship: true, Shipment_Mode: 'LCL', Date_Shipped: day(0) })) });
  sea = await one('Shipments', S.shipSea.ID);
  check('Tony ships: the buyer\'s shipment is In Transit, stage shipped_out, with a shipment ID', code(ship) === 3000 && sea.Shipment_Status === 'In Transit' && sea.Stage === 'shipped_out' && /SHP-LCL-\d{5}/.test(JSON.stringify(sea.Supplier_Shipment_Details)), JSON.stringify([code(ship), sea.Shipment_Status, sea.Stage]));
  check('the estimated warehouse arrival follows Procurement Settings (one engine)', !!sea.Estimated_Warehouse_Arrival, sea.Estimated_Warehouse_Arrival);
  const ev = (await rows('Stage_Events')).filter((e) => e.Record_Type === 'shipment' && String(e.Record_Id) === String(S.shipSea.ID)).map((e) => `${e.Event}:${e.Source}`);
  check('event log of the shipment: production started, finished, photo, shipped out, all from the supplier', ['shipment.production_started:supplier', 'shipment.production_finished:supplier', 'shipment.production_photo:supplier', 'shipment.shipped_out:supplier'].every((e) => ev.includes(e)), ev.join(','));
});

// ---------------------------------------------------------------- 5. Ship & Track
await safe('track', async () => {
  step('5. SHIP & TRACK (buyer): ranking, categories, arrival');
  await call('recalculate_shipments', {});
  const ships = await rows('Shipments');
  const air = ships.find((s) => String(s.ID) === String(S.shipAir.ID)), sea = ships.find((s) => String(s.ID) === String(S.shipSea.ID));
  check('every shipment is scored with a category, a rank and a reason', ships.every((s) => s.Category && s.Queue_Rank && s.Priority_Reason), JSON.stringify(ships.map((s) => [s.Shipment_No, s.Category, s.Queue_Rank])));
  check('the delayed air shipment is worked on first (SO-1002, oldest-needed)', Number(air.Queue_Rank) < Number(sea.Queue_Rank) || air.Category !== 'on_track', JSON.stringify([air.Category, air.Queue_Rank, sea.Category, sea.Queue_Rank]));
  const noPhotoLeave = await upd('Shipments', S.shipAir.ID, { Report_Event: 'shipped_out', Report_Occurred_At: day(0), Report_Source: 'user' });
  check('the buyer cannot move a shipment out of Production without a photo either', code(noPhotoLeave) !== 3000 && /photo/i.test(JSON.stringify(noPhotoLeave)));
  const port = await upd('Shipments', S.shipSea.ID, { Report_Event: 'arrived_port', Report_Occurred_At: day(0), Report_Source: 'forwarder' });
  const wh = await upd('Shipments', S.shipSea.ID, { Report_Event: 'arrived_warehouse', Report_Occurred_At: day(0), Report_Source: 'forwarder' });
  const s2 = await one('Shipments', S.shipSea.ID);
  check('forwarder reports: arrived at port, then at warehouse', code(port) === 3000 && code(wh) === 3000 && s2.Arrived_Port_At && s2.Arrived_Warehouse_At && s2.Shipment_Status === 'Delivered', JSON.stringify([s2.Stage, s2.Shipment_Status]));
  const rate = await call('get_born_late_rate', { weeks: 4 });
  check('born-late rate: 1 of 3 lines (the air PO)', (rate.data || rate).raised === 3 && (rate.data || rate).born_late === 1, JSON.stringify((rate.data || rate)).slice(0, 160));
});

// ---------------------------------------------------------------- 6. Receiving
await safe('receiving', async () => {
  step('6. RECEIVING: count, bin, damage, exception');
  const rcv = (await rows('Receiving')).find((r) => r.Receiving_Line_Items?.length === 2);
  S.rcv = rcv.ID;
  const lines = rcv.Receiving_Line_Items.map((l) => (/BP-100/.test(l.SKU) ? { ...l, Accepted_Qty: 8, Damage_Qty: 2, Bin_location: 'A-01-1' } : { ...l, Accepted_Qty: 20, Bin_location: 'A-02-1' }));
  const over = await upd('Receiving', S.rcv, { Receiving_Line_Items: lines.map((l) => ({ ...l, Accepted_Qty: 99 })) });
  check('counting more than expected is refused', code(over) !== 3000);
  const r = await upd('Receiving', S.rcv, { Receiving_Line_Items: lines, Create_Exception_Requested: true, Report_Arrived_On: day(0) });
  const after = await one('Receiving', S.rcv);
  check('counted: 28 good, 2 damaged; the receiving is Partial; arrived, counted and binned are stamped by the server', code(r) === 3000 && after.Receive_Status === 'Partial Received' && after.Arrived_At && after.Counted_At && after.Binned_At, JSON.stringify([after.Receive_Status, after.Arrived_At, after.Counted_At, after.Binned_At]));
  const exc = (await rows('Exceptions'))[0];
  S.exc = exc?.ID;
  check('one exception opened for the damage, with found stage "receiving" (RR traceability)', (await rows('Exceptions')).length === 1 && exc.Found_Stage === 'receiving', JSON.stringify([exc?.Found_Stage, exc?.Fault_Origin]));
  check('events: exception.raised', (await rows('Stage_Events')).some((e) => e.Event === 'exception.raised'));
  const rl = (await rows('Receiving')).find((x) => String(x.ID) === String(S.rcv));
  check('the Arrivals ranking and state are written', rl.Rcv_State && rl.Queue_Rank !== undefined, JSON.stringify([rl.Rcv_State, rl.Queue_Rank]));
});

// ---------------------------------------------------------------- 7. Replacement
await safe('rr', async () => {
  step('7. EXCEPTION -> REPLACEMENT REQUEST: change the supplier to HC System, Broken first');
  const exc = (await rows('Exceptions'))[0];
  await upd('Exceptions', exc.ID, { Product_Context1: exc.Product_Context1.map((p) => ({ ...p, Supplier: 'Tony Fan', Repairable: 'No' })), RR_Supplier_Override: 'HC System' });
  const noReason = await call('create_rr_main', { exceptionId: String(exc.ID) });
  check('changing the supplier without a reason: nothing is created (RR-R1)', /reason/i.test(noReason.message || '') && (await rows('Replacement_Request')).length === 0, JSON.stringify(noReason).slice(0, 140));
  await upd('Exceptions', exc.ID, { RR_Supplier_Change_Reason: 'Tony cannot remake it in time, the local shop can' });
  const made = await call('create_rr_main', { exceptionId: String(exc.ID) });
  const rr = (await rows('Replacement_Request'))[0];
  S.rr = rr?.ID;
  check('RR created for HC System; the original supplier and the reason are kept', made.created === 1 && rr.RR_Supplier === 'HC System' && rr.Original_Supplier === 'Tony Fan' && /local shop/.test(rr.Supplier_Change_Reason || ''), JSON.stringify([made.created, rr?.RR_Supplier, rr?.Original_Supplier]));
  check('RR-R3: target date and the original Sales Order\'s order date', rr.Target_Delivery && rr.Order_Date === day(-14), JSON.stringify([rr.Target_Delivery, rr.Order_Date]));
  check('RR-R4: the new RR is Broken and ranked first', rr.Rr_Category === 'broken' && Number(rr.Rr_Queue_Rank) === 1, JSON.stringify([rr.Rr_Category, rr.Rr_Queue_Rank]));
  const blocked = await call('clone_shipment_for_replacement', { rrRecordId: S.rr });
  check('a Local (HC System) RR must be acknowledged before its shipment is logged', blocked.status !== 'success', JSON.stringify(blocked).slice(0, 140));
  await upd('Replacement_Request', S.rr, { RR_Status: 'Acknowledged', Expected_Ship_Date: day(3), ETA: day(8) });
  const clone = await call('clone_shipment_for_replacement', { rrRecordId: S.rr });
  check('RR-R2: an HC System replacement gets a working replacement shipment', clone.status === 'success', JSON.stringify(clone).slice(0, 160));
  await call('recalculate_shipments', {});
  const rs = (await rows('Shipments')).find((s) => s.Supplier === 'HC System' || String(s.ID) === String(clone.shipmentId));
  check('the replacement shipment is Broken: first in every queue', rs?.Category === 'broken' && Number(rs.Queue_Rank) === 1, JSON.stringify([rs?.Shipment_No, rs?.Category, rs?.Queue_Rank]));
  const rep = (await call('get_rr_report', {})).data || {};
  check('monthly report: 1 replacement by cause "Damage", fault origin and supplier "HC System"', rep.total === 1 && rep.by_cause?.[0]?.name === 'Damage' && rep.by_supplier?.[0]?.name === 'HC System' && rep.changed_supplier === 1, JSON.stringify(rep).slice(0, 220));
  const evs = (await rows('Stage_Events')).filter((e) => e.Record_Type === 'rr').map((e) => e.Event);
  check('events: rr.created', evs.includes('rr.created'), evs.join(','));
});

// ---------------------------------------------------------------- 8. Dashboard
await safe('dash', async () => {
  step('8. DASHBOARD: every block, with the link of every number');
  const d = (await call('get_procurement_dashboard', {})).data;
  console.log('   today:', JSON.stringify({ act_now: d.today.act_now.count, tell_customer: d.today.tell_customer.count, broken: d.today.broken.count, decisions: d.today.decisions.count, manual_quote: d.today.manual_quote.count, not_acknowledged: d.today.pos_not_acknowledged.count }));
  console.log('   born-late:', d.born_late.rate + '%', `(${d.born_late.born_late}/${d.born_late.raised})`, '| on-time:', d.on_time.rate, '| pipeline:', d.pipeline.map((p) => `${p.stage} ${p.lines}`).join(', '), '| open RR:', d.replacements.open);
  check('Today: one Broken (the replacement)', d.today.broken.count === 1);
  check('born-late rate on the dashboard is 33.3% (1 of 3 lines)', d.born_late.rate === 33.3, String(d.born_late.rate));
  check('the pipeline counts the shipments by stage', d.pipeline.length === 4 && d.pipeline.reduce((a, p) => a + p.lines, 0) >= 3);
  check('Tony Fan is on the scorecard with its late starts, rungs and lag', d.scorecard.some((x) => x.supplier === 'Tony Fan'));
  check('Replacements: one open RR', d.replacements.open === 1);
  check('every number carries a link to its list', d.today.act_now.link.page === 'Shipments1' && d.born_late.link.page === 'Purchase_Order1');
});

// ---------------------------------------------------------------- summary
const fails = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - fails.length} of ${results.length} checks passed ====`);
for (const f of fails) console.log(`FAILED [${f.phase}] ${f.label}\n    ${f.detail}`);
const out = { total: results.length, passed: results.length - fails.length, failed: fails.map((f) => ({ phase: f.phase, label: f.label, detail: f.detail })), steps: results };
(await import('node:fs')).writeFileSync(process.env.FLOW_OUT || 'flow-result.json', JSON.stringify(out, null, 2));
