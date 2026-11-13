// Mock data for the operations side: Fulfillment (pre-order -> readiness -> pick -> pack -> QC -> crate -> to ship),
// Delivery Management (scheduling -> service request -> appointment -> dispatch -> field work -> archive), the
// warehouse/truck/policy forms, notifications, and the chat/timeline tables of the Procurement pages.
//   node server/seed-ops.mjs      fills these tables when they are empty (safe to run on an existing database)
// `npm run seed` runs it as well, after the procurement data. Everything is dated relative to today.
import fs from 'node:fs';
import path from 'node:path';
import * as store from './db.mjs';

const { addRecord, db, forms, DATA_DIR } = store;
const USER = 'mock-data';

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const iso = (n) => { const d = day(n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const stamp = (n, h = 9, m = 0) => `${iso(n)} ${pad(h)}:${pad(m)}:00`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (n) => { const d = day(n); return `${MON[d.getMonth()]} ${d.getDate()}`; };
const slot = (h, m = 0) => `${pad(h % 12 || 12)}:${pad(m)}:00 ${h < 12 ? 'AM' : 'PM'}`;
const zohoStamp = (n) => { const d = day(n); const h = d.getHours() % 12 || 12; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`; };
const add = (form, data, ago = 0) => {
  const id = addRecord(form, { ...data }, USER);
  if (ago > 0) db.prepare(`UPDATE "${form}" SET Added_Time = ?, Modified_Time = ? WHERE ID = ?`).run(zohoStamp(-ago), zohoStamp(-Math.max(ago - 1, 0)), Number(id));
  return id;
};
const opts = (form, field) => (forms[form].fields.find((f) => f.name === field)?.options || forms[form].fields.find((f) => f.name === field)?.choices || []);
const count = (form) => db.prepare(`SELECT COUNT(*) AS n FROM "${form}"`).get().n;
const one = (arr, i) => arr[i % arr.length];

// A tiny labelled placeholder picture, saved next to the real uploads, so photo fields have something to show.
function photo(name, label, hue = 28) {
  const dir = path.join(DATA_DIR, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 32%)"/><stop offset="1" stop-color="hsl(${hue + 150} 45% 16%)"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><circle cx="320" cy="170" r="54" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="6"/><path d="M296 170h48M320 146v48" stroke="#fff" stroke-opacity=".55" stroke-width="6" stroke-linecap="round"/><text x="320" y="300" fill="#fff" fill-opacity=".85" font-family="Segoe UI,Arial,sans-serif" font-size="26" text-anchor="middle">${label}</text><text x="320" y="334" fill="#fff" fill-opacity=".5" font-family="Segoe UI,Arial,sans-serif" font-size="16" text-anchor="middle">Sample photo</text></svg>`;
  fs.writeFileSync(path.join(dir, name), svg);
  return `/uploads/${name}`;
}

export function seedOps() {
  if (count('Pick1') || count('Sales_Order_Fulfillment') || count('Service_Appointment_Form')) return { seeded: false };

  // ---------- read the masters written by seed.mjs ----------
  const rows = (t) => db.prepare(`SELECT * FROM "${t}" ORDER BY ID`).all();
  const ITEMS = rows('Items').map((r) => ({ name: r.item_name, sku: r.SKU, cat: r.category, bin: r.Bin_location, rate: Number(r.Rate) }));
  if (ITEMS.length < 12) throw new Error('Run the procurement seed first (npm run seed -- --reset): Items are missing.');
  const CUSTS = Object.fromEntries(rows('Customer').map((r) => {
    const a = r.Billing_Address ? JSON.parse(r.Billing_Address) : {};
    return [r.customer_name, { rid: String(r.ID), name: r.customer_name, type: r.Customer_Type, email: r.Email, phone: r.Phone_Number, city: a.district_city || 'Makati', street: a.address_line_1 || '', addr: [a.address_line_1, a.district_city, a.state_province].filter(Boolean).join(', ') }];
  }));
  const SOS = Object.fromEntries(rows('Sales_Order').map((r) => [r.Sales_Order_Number, { no: r.Sales_Order_Number, cust: CUSTS[r.Customer_Name], target: r.Target_Delivery_Date }]));
  const prOf = Object.fromEntries(rows('Purchase_Request1').filter((r) => r.Sales_Order).map((r) => [r.Sales_Order, r.PR_No]));
  const userEmail = db.prepare('SELECT email FROM _users ORDER BY ROWID LIMIT 1').get()?.email || 'user@example.com';
  const PICKERS = opts('Sales_Order_Readiness_Gate', 'Assign_Picker'), PACKERS = opts('Pack', 'Assign_Packer');
  const CRATE_STEPS = opts('Crate_Checklist', 'Crating_Checklist');
  const stageNames = opts('Sales_Order_Fulfillment', 'Fulfillment_Stage');

  // ---------- the packages ----------
  // [pac, so, stage, [[item, qty]...], options]    stage: index into Fulfillment_Stage
  //   dms (stage 6 only): oa | new | ready | siteconfirm | flagged | searching | suggested | scheduled | dispatched | transit | delivered | completed | failed
  const PK = [
    ['PAC-1001', 'SO-24095', 0, [[7, 1]], { type: 'Pre Order', pre: 'Pending', ago: 12, dt: 'Delivery and Installation' }],
    ['PAC-1002', 'SO-24080', 0, [[4, 6]], { type: 'Pre Order', pre: 'Received', ago: 30, dt: 'Delivery Only' }],
    ['PAC-1003', 'SO-24087', 1, [[0, 2], [8, 1]], { pay: 'Partial', ago: 6, dt: 'Delivery and Installation' }],
    ['PAC-1004', 'SO-24110', 1, [[2, 6]], { pay: 'No', ago: 4, dt: 'Delivery Only' }],
    ['PAC-1005', 'SO-24101', 2, [[5, 40], [9, 20]], { picker: 'Hendel', ago: 8, marked: [true, false], dt: 'Full-Day Install' }],
    ['PAC-1006', 'SO-24113', 2, [[9, 20]], { picker: 'Jayvon', ago: 3, dt: 'Delivery Only' }],
    ['PAC-1007', 'SO-24112', 3, [[10, 2]], { packer: 'Kurt', ago: 5, dt: 'Delivery Only' }],
    ['PAC-1008', 'SO-24080', 3, [[4, 4]], { packer: '', ago: 6, dt: 'Delivery Only' }],
    ['PAC-1009', 'SO-24115', 4, [[6, 12]], { qc: 'Pending', ago: 7, dt: 'With Installation' }],
    ['PAC-1010', 'SO-24101', 4, [[6, 40]], { qc: 'Rejected', ago: 9, dt: 'Full-Day Install' }],
    ['PAC-1011', 'SO-24112', 5, [[8, 1]], { crate: true, ago: 10, dt: 'Delivery Only' }],
    ['PAC-1012', 'SO-24087', 6, [[3, 2]], { dms: 'oa', ago: 11, dt: 'With Installation' }],
    ['PAC-1013', 'SO-24095', 6, [[1, 24]], { dms: 'new', ago: 12, dt: 'Delivery and Installation' }],
    ['PAC-1014', 'SO-24110', 6, [[4, 4]], { dms: 'ready', ago: 13, dt: 'Delivery Only' }],
    ['PAC-1015', 'SO-24113', 6, [[9, 20]], { dms: 'siteconfirm', ago: 14, dt: 'Delivery Only' }],
    ['PAC-1016', 'SO-24115', 6, [[6, 12]], { dms: 'flagged', ago: 15, dt: 'With Installation' }],
    ['PAC-1017', 'SO-24112', 6, [[10, 2]], { dms: 'searching', ago: 16, dt: 'Delivery Only' }],
    ['PAC-1018', 'SO-24101', 6, [[5, 40]], { dms: 'suggested', ago: 17, dt: 'Full-Day Install' }],
    ['PAC-1019', 'SO-24080', 6, [[4, 2]], { dms: 'scheduled', when: 3, ago: 18, dt: 'Delivery Only' }],
    ['PAC-1020', 'SO-24087', 6, [[0, 2], [8, 1]], { dms: 'scheduled', when: 0, ago: 19, dt: 'Delivery and Installation', crate: true }],
    ['PAC-1021', 'SO-24095', 6, [[7, 1]], { dms: 'dispatched', when: 0, ago: 20, dt: 'Delivery and Installation', crate: true }],
    ['PAC-1022', 'SO-24110', 6, [[2, 6]], { dms: 'transit', when: 0, ago: 21, dt: 'Delivery Only' }],
    ['PAC-1023', 'SO-24113', 6, [[1, 6]], { dms: 'delivered', when: -1, ago: 22, dt: 'With Installation' }],
    ['PAC-1024', 'SO-24115', 6, [[9, 8]], { dms: 'completed', when: -3, ago: 24, dt: 'With Installation' }],
    ['PAC-1025', 'SO-24101', 6, [[6, 20]], { dms: 'completed', when: -6, ago: 28, dt: 'Delivery Only' }],
    ['PAC-1026', 'SO-24112', 6, [[11, 1]], { dms: 'failed', when: -2, ago: 25, dt: 'Delivery Only', crate: true }],
  ];

  const P = PK.map(([pac, soNo, stage, lines, o], i) => {
    const so = SOS[soNo], c = so.cust;
    const items = lines.map(([k, qty]) => ({ ...ITEMS[k], qty }));
    const isCrate = !!o.crate || (stage === 5);
    return {
      i, pac, soNo, stage, o, c, so, items, isCrate,
      type: o.type || 'Normal', pr: prOf[soNo] || '', pay: o.pay || 'Yes', dt: o.dt || 'Delivery Only', ago: o.ago || 5,
      target: so.target || iso(14), created: iso(-(o.ago || 5)), dms: o.dms || '',
      custType: { Designer: 'Design Partner', Corporate: 'Corporate', Homeowner: 'End User', Developer: 'Corporate' }[c.type] || 'End User',
    };
  });
  const lineCommon = (p) => ({ SO: p.soNo, Target_Delivery_Date: p.target, Delivery_Type: p.dt, Order_Type: p.type, For_Crate: p.isCrate });

  // ---------- Sales_Order_Fulfillment: one row per package ----------
  P.forEach((p) => {
    const fc = p.stage === 6 ? 6 + (p.i % 5) : 16 + (p.i % 9);
    const late = p.stage === 1 && p.pay === 'No';
    p.sofId = add('Sales_Order_Fulfillment', {
      Fulfillment_Stage: stageNames[p.stage], SO_Status: p.stage === 6 ? 'For Delivery' : 'Preparing', Package: p.pac, order_type: p.type, Delivery_Type: p.dt, Status: p.pay, For_Crate: p.isCrate,
      SO_No: p.soNo, SO_Created_Date: p.created, Package_Date: p.stage >= 1 ? iso(-(p.ago - 1)) : '', Shipment_Mode: p.type === 'Pre Order' ? 'LCL' : 'Local', PR_No: p.pr, RR_No: '',
      target_delivery_date: p.target, Customer: p.c.rid, Customer_Type: p.c.type, Contact_No: p.c.phone, Billing_Address: p.c.addr, Shipping_Address: p.c.addr,
      Item_Details1: p.items.map((it) => ({ Item: it.name, SKU: it.sku, Quantity: String(it.qty), Bin_Location: it.bin })), SO_SKU_Key: `${p.soNo}|${p.items[0].sku}`,
      Forecast_Delivery: iso(fc), Forecast_Window: `${short(fc - 2)} – ${short(fc + 2)}`, Forecast_Status: late ? 'At Risk' : 'On Track',
    }, p.ago);
  });

  // ---------- Pre-order lines ----------
  P.filter((p) => p.type === 'Pre Order' && p.stage === 0).forEach((p) => p.items.forEach((it) => add('Pre_Order_FF', {
    Pre_Order_Status: p.o.pre, SO: p.soNo, Package_Number: '', Target_Delivery: p.target, Status: 'Yes', Select_To_Package: false, SO_Creation_Date: p.created, RR: '', Order_Type: 'Pre Order',
    For_Crate: p.isCrate, Packaged_Out: false, PR: p.pr, Delivery_Type: p.dt, PR_Date_Received: p.o.pre === 'Received' ? stamp(-2, 14, 10) : '',
    Customer_Name: p.c.name, Customer_Type: p.c.type, Customer_Address: p.c.addr, City: p.c.city, Email: p.c.email, Contact: p.c.phone,
    Item_Name: it.name, SKU: it.sku, Qty: String(it.qty), Bin_Location: it.bin, SO_SKU_Key: `${p.soNo}|${it.sku}`,
    Forecast_Delivery: iso(p.o.pre === 'Received' ? 8 : 24), Forecast_Window: `${short(p.o.pre === 'Received' ? 6 : 22)} – ${short(p.o.pre === 'Received' ? 10 : 26)}`, Forecast_Status: p.o.pre === 'Received' ? 'On Track' : 'At Risk',
  }, p.ago)));
  // a pre-order line that has already gone out into a package (hidden from the open list, kept for history)
  add('Pre_Order_FF', { Pre_Order_Status: 'Received', SO: 'SO-24095', Package_Number: 'PAC-1013', Target_Delivery: SOS['SO-24095'].target, Status: 'Yes', Select_To_Package: true, SO_Creation_Date: iso(-40), Order_Type: 'Pre Order',
    Packaged_Out: true, PR: prOf['SO-24095'] || '', Delivery_Type: 'Delivery Only', PR_Date_Received: stamp(-14, 11, 0), Customer_Name: CUSTS['Meridian Hospitality Group'].name, Customer_Type: 'Corporate',
    Customer_Address: CUSTS['Meridian Hospitality Group'].addr, City: CUSTS['Meridian Hospitality Group'].city, Item_Name: ITEMS[1].name, SKU: ITEMS[1].sku, Qty: '24', Bin_Location: ITEMS[1].bin }, 18);

  // ---------- Readiness gate -> Pick -> Pack -> QC -> Crate (one row per item line) ----------
  P.filter((p) => p.stage >= 1).forEach((p) => p.items.forEach((it, li) => {
    const released = p.stage >= 2;
    const picker = released ? p.o.picker || one(PICKERS, p.i) : '';
    const priority = p.i % 7 === 0 ? 'Air' : 'Normal';
    add('Sales_Order_Readiness_Gate', {
      sales_order_number: p.soNo, Demo: '', rr_number: '', pr_number: p.pr, Order_Type: p.type, Package_Order: p.pac, Delivery_Type: p.dt, For_Crate: p.isCrate, payment_status: p.pay, Target_Delivery_Date: p.target,
      customer_name: p.c.name, customer_type: p.custType, customer_address: p.c.addr, priority, Item_Name: it.name, SKU: it.sku, Quantity: String(it.qty), Bin_Location: it.bin,
      Assign_Picker: picker, Release: released, Release_Log: released ? `Released by HC Pack & Fulfill on ${iso(-(p.ago - 2))}` : '', Override_Approved: false, Has_Credit_Terms: p.c.type === 'Corporate',
      Forecast_Delivery: iso(14 + p.i % 6), Forecast_Window: `${short(12 + p.i % 6)} – ${short(16 + p.i % 6)}`, Forecast_Status: p.pay === 'No' ? 'At Risk' : 'On Track',
    }, p.ago);
    if (p.stage >= 2) add('Pick1', {
      Picker: picker, Package_Order: p.pac, PR_if_any: p.pr, RR: '', Demo: '', ...lineCommon(p), Item_Name: it.name, Bin_Location: it.bin, SKU: it.sku, Quantity_to_Pick: String(it.qty),
      Customer_Name: p.c.name, Customer_Address: p.c.addr, Customer_Type: p.c.type, Marked: p.stage >= 3 || !!(p.o.marked && p.o.marked[li]),
      Forecast_Delivery: iso(12 + p.i % 6), Forecast_Window: `${short(10 + p.i % 6)} – ${short(14 + p.i % 6)}`, Forecast_Status: 'On Track',
    }, p.ago - 1);
    if (p.stage >= 3) add('Pack', {
      Assign_Packer: p.stage === 3 ? (p.o.packer ?? one(PACKERS, p.i)) : one(PACKERS, p.i), PR: p.pr, RR: '', PAC: p.pac, Demo: '', ...lineCommon(p),
      Customer_Name: p.c.name, Customer_Type: p.c.type, Customer_Address: p.c.addr, Item_Name: it.name, SKU: it.sku, Quantity: String(it.qty), Bin_Location: it.bin, Send_to_QC: p.stage >= 4,
    }, p.ago - 2);
    if (p.stage >= 4) {
      const status = p.stage === 4 ? p.o.qc : 'Approved';
      const bad = status === 'Rejected';
      const excNo = bad ? 'EXC-F-0001' : '';
      add('Checker_Checklist', {
        PAC: p.pac, PR: p.pr, Demo: '', RR: '', ...lineCommon(p), Customer_Name: p.c.name, Customer_Address: p.c.addr, Customer_Type: p.c.type, City: p.c.city, Email: p.c.email, Contact: p.c.phone,
        Item_Name: it.name, Quantity: String(it.qty), SKU: it.sku, Bin_Location: it.bin, Date_Checked: status === 'Pending' ? '' : iso(-(p.ago - 4)), Quality_Checker: status === 'Pending' ? '' : one(['Rio', 'Jonard', 'Petz'], p.i),
        Fixture_Body_Checklist: status === 'Pending' ? [] : bad ? opts('Checker_Checklist', 'Fixture_Body_Checklist').slice(0, 2) : opts('Checker_Checklist', 'Fixture_Body_Checklist'),
        LED_Checklist: status === 'Pending' ? [] : opts('Checker_Checklist', 'LED_Checklist').slice(0, 5), Type_of_Bulb: status === 'Pending' ? [] : ['G9'], Kelvin: status === 'Pending' ? [] : ['3000K'],
        Color_Temperature: status === 'Pending' ? [] : ['Warm'], Uniformity: status === 'Pending' ? [] : opts('Checker_Checklist', 'Uniformity').slice(0, 2),
        Item_to_Replace: bad ? 'Spare Parts' : 'No damage', Quantity_of_Damage_Items: bad ? '3' : '0', Location: 'WH Banawe',
        Remarks: bad ? 'Three shades cracked at the rim; sent back for rework.' : status === 'Approved' ? 'All checks passed.' : '', QC_Status: status === 'Pending' ? 'Pending / none' : status, Exception_Number: excNo,
        Forecast_Delivery: iso(10 + p.i % 6), Forecast_Window: `${short(8 + p.i % 6)} – ${short(12 + p.i % 6)}`, Forecast_Status: bad ? 'At Risk' : 'On Track',
      }, p.ago - 3);
    }
    if (p.stage >= 5 && p.isCrate) {
      const done = p.stage >= 6;
      add('Crate_Checklist', {
        Assign_Crater: 'Lito', Assigned_Checker: 'Rio', Package_Order: p.pac, PR_if_any: p.pr, Dem_if_any: '', RR_if_any: '', ...lineCommon(p), Customer_Name: p.c.name, Customer_Address: p.c.addr, Customer_Type: p.c.type,
        Item_Name: it.name, SKU: it.sku, Quantity: String(it.qty), Crating_Checklist: done ? CRATE_STEPS : CRATE_STEPS.slice(0, 2), Crating_Status1: done ? 'Done' : 'Pending',
        Forecast_Delivery: iso(9 + p.i % 6), Forecast_Window: `${short(7 + p.i % 6)} – ${short(11 + p.i % 6)}`, Forecast_Status: 'On Track',
      }, p.ago - 4);
    }
  }));

  // ---------- Fulfillment exceptions (QC rejection + a packing shortage) ----------
  const pQc = P.find((p) => p.pac === 'PAC-1010'), pPk = P.find((p) => p.pac === 'PAC-1008');
  add('Exception_Control1', {
    Exception_Number: 'EXC-F-0001', Sales_Order: pQc.soNo, RR_No: '', Source_Module: 'QC', PR: pQc.pr, Demo1: '', Order_Type: pQc.type, PAC: pQc.pac, Rework_Status: 'In Rework', DELIVERY_TYPE: pQc.dt,
    Checker: 'Jonard', Remarks: 'Three shades cracked at the rim.', Customer_Name: pQc.c.name, Customer_Type: pQc.c.type, Customer_Address: pQc.c.addr, Item_to_Replace3: 'Spare Parts', Quantity: '3',
    Item_to_Replace1: ['Shade'], Quantity_of_damage_spare_s: '3', Supplier: 'Guzhen Crystal Works', Rework: 'Repair', Status: 'In Rework', Item_Name: pQc.items[0].name, SKU: pQc.items[0].sku, Qty: 40, Affected_Qty: 3,
    Rework_Type: 'Repair',
  }, 9);
  add('Exception_Control1', {
    Exception_Number: 'EXC-F-0002', Sales_Order: pPk.soNo, RR_No: 'RR-0002', Source_Module: 'Pack', PR: pPk.pr, Demo1: '', Order_Type: pPk.type, PAC: pPk.pac, Rework_Status: 'Pending Assessment', DELIVERY_TYPE: pPk.dt,
    Checker: '', Remarks: 'One glass shade missing at packing.', Customer_Name: pPk.c.name, Customer_Type: pPk.c.type, Customer_Address: pPk.c.addr, Item_to_Replace3: 'Spare Parts', Quantity: '1',
    Item_to_Replace1: ['Glass'], Quantity_of_damage_spare_s: '1', Supplier: 'Zhongshan Lumina', Rework: 'Select', Status: 'Pending', Item_Name: pPk.items[0].name, SKU: pPk.items[0].sku, Qty: 4, Affected_Qty: 1,
  }, 6);
  [['EXC-F-0001', 'cracked-shade-1.svg', 'Cracked shade rim', 18], ['EXC-F-0001', 'cracked-shade-2.svg', 'Shade, close-up', 28], ['EXC-F-0002', 'missing-shade.svg', 'Missing glass shade', 200]].forEach(([no, file, label, hue], i) =>
    add('Exception_Control_Media', { Record_ID: no, Exception_Number: no, File_Type: 'Image', File_Name: file, Media: photo(`mock-${file}`, label, hue), Uploaded_On: stamp(-(8 - i), 10, 20) }));

  // ---------- Order aggregation (To Ship) + Delivery_Scheduling (Initial Scheduling) ----------
  const DELIVERY = P.filter((p) => p.stage === 6);
  const INSTALLERS = opts('Service_Appointment_Form', 'Installer'), DRIVERS = ['Judy', 'Norman', 'Petz', 'Zaldy'], VEHICLES = opts('Daily_Team_Availability', 'Vehicle').slice(0, 4);
  DELIVERY.forEach((p) => {
    const dispatched = p.dms !== 'oa';
    p.oaId = add('Order_Aggregation1', {
      SO: p.soNo, PAC: p.pac, ORDER_TYPE: p.type, Target_Date: p.target, PR: p.pr, DEMO: '', DELIVERY_TYPE: p.dt, For_Crate: p.isCrate, Customer_Name: p.c.name, Customer_Address: p.c.addr, Customer_Type: p.c.type,
      City: p.c.city, Email: p.c.email, Contact: p.c.phone,
      Item_Details: p.items.map((it) => ({ Item_Name: it.name, SKU: it.sku, QTY: it.qty, Bin_Location: it.bin, Select1: dispatched, Dispatched: dispatched, PAC: p.pac })),
      Dispatch_Selected: dispatched, Archived: false, SO_Created_Date: p.created, Forecast_Delivery: iso(5 + p.i % 5), Forecast_Window: `${short(3 + p.i % 5)} – ${short(7 + p.i % 5)}`, Forecast_Status: 'On Track',
    }, p.ago - 5);
    if (!dispatched) return;
    const handed = !['new', 'ready'].includes(p.dms);
    const hasDate = p.dms !== 'new';
    const when = p.o.when ?? (3 + (p.i % 4));
    p.dsId = add('Delivery_Scheduling', {
      Date_field: hasDate ? iso(when) : '', Time: hasDate ? slot(9 + (p.i % 4)) : '', SO: p.soNo, Package_Number: p.pac, Demo: '', Order_Aggregation_ID: p.oaId, Type_of_Delivery: p.dt, Service_Request_ID: '',
      Item_Detail: p.items.map((it) => it.name).join(', '), Customer_Name: p.c.name, Customer_Type: p.c.type, Customer_Address: p.c.addr, Delivery_City: p.c.city, Email: p.c.email, Contact: p.c.phone,
      Target_Delivery_Date: p.target, Order_Date: p.created, Schedule_Status: handed ? 'Handed Off' : 'New', For_Crate: p.isCrate, Qty: p.items.map((it) => String(it.qty)).join(', '),
      Item_Details: p.items.map((it) => ({ PAC: p.pac, Item_Name: it.name, Qty: String(it.qty), SKU: it.sku })), City: opts('Delivery_Scheduling', 'City').includes(p.c.city) ? p.c.city : 'Other',
      Installer: handed && /Install/.test(p.dt) ? [one(INSTALLERS, p.i)] : [], Vehicle_Name: hasDate ? one(VEHICLES, p.i) : '', Driver: hasDate ? one(DRIVERS, p.i) : '', Notes: p.dms === 'new' ? 'Waiting for the scheduler to pick a date.' : '',
      Completed: ['completed'].includes(p.dms) ? 'Yes' : 'Not Yet', Rescheduled: 'No', Forecast_Delivery: iso(when), Forecast_Window: `${short(when - 1)} – ${short(when + 1)}`, Forecast_Status: 'On Track',
    }, p.ago - 6);
  });

  // ---------- Service Request -> Service Appointment -> Dispatch -> Field Work -> Package Shipments ----------
  const SA_STATUS = { siteconfirm: 'Queued', flagged: 'Queued', searching: 'Queued', suggested: 'Queued', scheduled: 'Scheduled', dispatched: 'Dispatched', transit: 'In Transit', delivered: 'Delivered', completed: 'Completed', failed: 'Failed' };
  const PRIORITY = ['High Priority', 'Medium Priority', 'Low Priority'];
  const GEO = { Makati: [14.5547, 121.0244], Taguig: [14.5176, 121.0509], 'Quezon City': [14.676, 121.0437], Pasig: [14.5764, 121.0851], Tagaytay: [14.1153, 120.9621], Mandaluyong: [14.5794, 121.0359], 'San Juan': [14.6019, 121.0355], Pasay: [14.5378, 121.0014] };
  let srSeq = 1, drSeq = 1;
  const scheduleOf = (p) => { const when = p.o.when ?? (3 + (p.i % 4)); return { date: iso(when), hour: 9 + (p.i % 5), when }; };
  DELIVERY.filter((p) => SA_STATUS[p.dms]).forEach((p) => {
    const st = SA_STATUS[p.dms], { date, hour, when } = scheduleOf(p);
    const locked = ['scheduled', 'dispatched', 'transit', 'delivered', 'completed', 'failed'].includes(p.dms);
    const siteOk = !['siteconfirm', 'flagged'].includes(p.dms);
    const fleet = p.i % 5 === 0 ? '3rd Party' : 'Own Fleet';
    const installer = one(INSTALLERS, p.i), driver = one(DRIVERS, p.i), dispatcher = one(['Jhi', 'Flor', 'Andrea'], p.i);
    const geo = GEO[p.c.city] || GEO.Makati;
    const nameParts = p.c.name.split(' ');
    const common = {
      Sales_Order: p.soNo, Sales_Order_Display: p.soNo, Package_Number: p.pac, Type_of_Delivery: p.dt === 'Delivery and Installation' ? 'With Installation' : p.dt, Customer_Address: p.c.addr, City: p.c.city, Email: p.c.email, Contact: p.c.phone,
      Item_Details: p.items.map((it) => ({ Item_Name: it.name, SKU: it.sku, Quantity: it.qty, PAC: p.pac })), Priority_Level: one(PRIORITY, p.i), Scheduled_by: one(['Jhi', 'Flor'], p.i), If_Pull_Out: 'No',
    };
    const srNo = `SR-${String(srSeq++).padStart(4, '0')}`;
    p.srId = add('Service_Request1', {
      Service_Request1: srNo, ...common, Sales_Order: p.soNo, Delivery_Date: date, Delivery_Type: p.dt, Item_Name: p.items[0].name, SKU: p.items[0].sku, Quantity: p.items[0].qty, Order_Aggregation_ID: p.oaId, Initial_Schedule_ID: p.dsId,
      Phone_Number: p.c.phone, Initial_Schedule_Time: locked ? `${date} ${pad(hour)}:00:00` : '', SR_Status: locked ? 'Scheduled' : p.dms === 'siteconfirm' ? 'New' : 'Scheduling', Customer_Name: p.c.name,
      Address: { address_line_1: p.c.street, district_city: p.c.city, state_province: 'Metro Manila', postal_Code: '1200', country: 'Philippines', latitude: String(geo[0]), longitude: String(geo[1]) },
      Forecast_Delivery: date, Forecast_Window: `${short(when - 1)} – ${short(when + 1)}`, Forecast_Status: 'On Track',
    }, p.ago - 7);
    const sa = {
      Scheduled_Date_and_Time: locked ? `${date} ${pad(hour)}:00:00` : '', Initial_Schedule_ID: p.dsId, Service_Request_ID: p.srId, Installer: /Install/.test(common.Type_of_Delivery) ? installer : '', Assistant_Installers: '',
      Assigned_to_Driver: locked ? driver : '', Assigned_to_Dispatcher: dispatcher, Logistic_Notes: locked ? `Call the client 30 minutes before arrival. ${p.isCrate ? 'Crated item: bring 2 helpers.' : ''}`.trim() : '',
      Appointment_Status: st, Service_Request: srNo, ...common, Customer_Name: { first_name: nameParts[0], last_name: nameParts.slice(1).join(' ') },
      Address: { address_line_1: p.c.street, district_city: p.c.city, state_province: 'Metro Manila', postal_Code: '1200', country: 'Philippines', latitude: String(geo[0]), longitude: String(geo[1]) },
      Assigned_Status: locked ? 'Assigned' : 'Not Assigned', Order_Date: p.created, Fulfillment_Completed_Date: iso(-(p.ago - 9)), Fleet_Assignment: fleet, Installation_Required: /Install/.test(common.Type_of_Delivery), Estimated_Duration: /Full-Day/.test(p.dt) ? 8 : /Install/.test(common.Type_of_Delivery) ? 4 : 2,
      Location_Route: `${p.c.city} route`, Dispatch_Date: ['dispatched', 'transit', 'delivered', 'completed', 'failed'].includes(p.dms) ? date : '', Actual_Delivery_Date: ['delivered', 'completed'].includes(p.dms) ? date : '',
      Geocode_Status: 'OK', Delivery_Latitude: String(geo[0]), Delivery_Longitude: String(geo[1]),
      Site_Confirmation_Status: siteOk ? 'Confirmed' : p.dms === 'flagged' ? 'Unreachable' : 'Pending', Date_Confirmed: siteOk ? iso(-(p.ago - 10)) : '', Confirmation_Method: siteOk ? one(['Call', 'SMS', 'Email'], p.i) : '',
      Site_Confirmation_Notes: siteOk ? 'Client confirmed access and elevator booking.' : '', Outreach_Sent_Date: iso(-2), Followup_Count: p.dms === 'flagged' ? 3 : siteOk ? 1 : 0,
      Suggested_Schedule_Date: p.dms === 'suggested' ? iso(4) : '', Suggested_Time_Slot: p.dms === 'suggested' ? slot(9) : '', Confirmed_Schedule_Date: locked ? date : '', Confirmed_Time_Slot: locked ? slot(hour) : '',
      Third_Party_Provider: fleet === '3rd Party' ? 'Lalamove' : '', Calendar_Entry_Created: locked, Calendar_Event_Summary: locked ? `${p.soNo} · ${p.c.name} · ${p.c.city}` : '',
      Exception_Status: p.dms === 'flagged' ? 'Flagged' : 'None', Exception_Reason: p.dms === 'flagged' ? 'Client unreachable after 3 follow-ups' : '', Override_Applied: false, Shipment_Order_No: ['completed'].includes(p.dms) ? `SO-SHP-${p.i}` : '',
      Needs_Site_Visit: /Full-Day/.test(p.dt), Priority: p.i % 6 === 0, Requested_Delivery_Date: p.target, Requested_Delivery_Time: slot(10), Fleet_Decision: fleet,
      Forecast_Delivery: date, Forecast_Window: `${short(when - 1)} – ${short(when + 1)}`, Forecast_Status: p.dms === 'failed' ? 'Delayed' : 'On Track',
    };
    p.saId = add('Service_Appointment_Form', sa, p.ago - 8);
    db.prepare('UPDATE "Service_Request1" SET Service_Appointment_ID = ?, Appointment_Record_ID = ? WHERE ID = ?').run(p.saId, p.saId, Number(p.srId));
    db.prepare('UPDATE "Delivery_Scheduling" SET Service_Request_ID = ? WHERE ID = ?').run(p.srId, Number(p.dsId));

    if (['dispatched', 'transit', 'delivered', 'completed', 'failed'].includes(p.dms)) add('Dispatch_Checklist', {
      Service_Appointment_ID: p.saId, Sales_Order: p.soNo, Package_Number: p.pac, Dispatch_Status: 'Dispatched', Dispatch_By: one(['Jhi', 'Flor', 'Queen'], p.i), Dispatched_At2: `${date} 07:${pad(30 + p.i % 20)}:00`,
      Check_Items_Complete: true, Check_Contact_Details: true, Check_Payment: true, Check_No_Exception: true, DR_No: `DR-${String(4100 + drSeq++)}`, Check_SO_Number: true, Check_SKU_Match: true, Check_Box_Quality: true, Check_Box_Count: true,
    }, p.ago - 9);
    if (['delivered', 'completed'].includes(p.dms)) {
      const done = p.dms === 'completed';
      p.fwId = add('Field_Work', {
        Status: done ? 'Archived' : 'Started', Logistic_Notes: 'Installed per layout; client walked through the switches.', Service_Request: srNo, Sales_Order: p.soNo, Package_Number: p.pac, Type_of_Delivery: common.Type_of_Delivery,
        Customer_Name: p.c.name, Customer_Address: p.c.addr, City: p.c.city, Email: p.c.email, Contact: p.c.phone, If_Pull_Out: 'No', Scheduled_Date_and_Time: `${date} ${pad(hour)}:00:00`, Assigned_to_Installer: installer, Assigned_to_Dispatcher: dispatcher,
        Schedule_Start_Date_and_Time: `${date} ${pad(hour)}:00:00`, Schedule_End_Date_and_Time: done ? `${date} ${pad(hour + 3)}:30:00` : '', Item_Details: common.Item_Details,
        Customer_Rating: done ? (p.i % 2 ? '⭐⭐⭐⭐⭐' : '⭐⭐⭐⭐') : '', Receiver_s_Name: { first_name: nameParts[0], last_name: nameParts.slice(-1)[0] }, Installation_Status: done ? 'Complete' : 'Incomplete',
        Sales_Return_Status: 'SR Pending', Service_Appointment_ID: p.saId, Appointment_Record_ID: p.saId, Forecast_Delivery: date, Forecast_Window: `${short(when - 1)} – ${short(when + 1)}`, Forecast_Status: 'On Track',
      }, p.ago - 10);
      if (done) {
        add('Package_Shipments', { Service_Appointment_ID: p.saId, Sales_Order: p.soNo, Package_Number: p.pac, Shipment_Created: true, Shipment_Order_No: `SO-SHP-${p.i}`, Shipment_Order_ID: String(7700000000 + p.i), Created_Time: `${date} 16:20:00` });
        add('Shipment_Order_Form', { Customer_Name: p.c.name, Package_Number: p.pac, Service_Request_Number: srNo, Shipped_Date: date, Shipping_Charges_if_any: 0, Delivery_Date: date, Site_Wiring_Ready: 'Yes', Type_of_Delivery: common.Type_of_Delivery,
          Prepared_by: one(['Hendel', 'Jayvon', 'Jazz', 'Kurt'], p.i), Sales_Order: p.soNo, Shipment_Number: `SHP-F-${1000 + p.i}`, Carrier: 'Delivery', Ceiling_Material: 'Concrete', Delivery_Team: 'Field Team', Ceiling_Height: 'Standard: 2.4 M - 2.7 M' });
        [['evidence-sig', 'Receiver signature'], ['evidence-site', 'Finished installation']].forEach(([f, label], k) => add('Evidence_Photos', {
          Source_Form: 'Field_Work', Record_ID: p.fwId, Row_Key: `${p.fwId}-${k}`, File_Name: `${f}-${p.pac}.svg`, Photo: photo(`mock-${f}-${p.pac}.svg`, `${label} · ${p.pac}`, 140 + k * 40), Uploaded_On: `${date} 1${5 + k}:05:00` }));
      }
    }
  });
  // DS rows for new/ready come before SA: nothing more to do. Timelines for the delivery chain follow in the tail.

  // ---------- Exception queue (links to appointments) ----------
  const saOf = (pac) => P.find((p) => p.pac === pac)?.saId;
  [['PAC-1016', 'Site Confirmation', 'Client unreachable after 3 follow-ups', 'High', 'Open', 'Delivery Officer', 2],
   ['PAC-1018', 'Scheduling', 'No team free inside the 14-day window for a full-day install', 'Medium', 'In Progress', 'Delivery Manager', 4],
   ['PAC-1026', 'Dispatch', 'Delivery failed: building refused entry after 5 PM', 'High', 'Resolved', 'Dispatch Staff', 2],
   ['PAC-1017', 'Calendar', 'Calendar entry could not be created (driver unavailable)', 'Low', 'Dismissed', 'System Admin', 6]].forEach(([pac, stage, reason, sev, status, to, ago], i) => {
    const p = P.find((x) => x.pac === pac);
    add('DMS_Exception_Queue', {
      Sales_Order_Reference: saOf(pac), Customer_Name: p.c.name, Exception_Stage: stage, Exception_Reason: reason, Severity: sev, Raised_By: i === 1 ? 'System' : 'Officer', Date_Raised: stamp(-ago, 10, 5), Assigned_To: to, Status: status,
      Resolution_Action: ['Resolved', 'Dismissed'].includes(status) ? (status === 'Resolved' ? 'Rebooked for the next morning slot with building admin approval.' : 'Driver reassigned; calendar entry created manually.') : '',
      Resolution_Date: ['Resolved', 'Dismissed'].includes(status) ? stamp(-(ago - 1), 15, 40) : '', Revert_to_System: false, Requeue_Processed: false,
    }, ago);
  });

  // ---------- Returns, pick-ups, replacement service requests ----------
  const retP = P.find((p) => p.pac === 'PAC-1025'), failP = P.find((p) => p.pac === 'PAC-1026');
  const retSr = add('Service_Request1', {
    Service_Request1: 'SR-R-0001', RMA1: 'RMA-0001', Original_SO: retP.soNo, Reason: 'Two units arrived with scratched glass.', Sub: 'Damaged Item', Sales_Order: retP.soNo, Package_Number: retP.pac, Delivery_Date: iso(-2), If_Pull_Out: 'Yes',
    Delivery_Type: 'Pullout', Item_Name: retP.items[0].name, SKU: retP.items[0].sku, Quantity: 2, Priority_Level: 'High Priority', Scheduled_by: 'Jhi', SR_Status: 'Scheduling', Customer_Name: retP.c.name, Customer_Address: retP.c.addr, City: retP.c.city,
    Email: retP.c.email, Phone_Number: retP.c.phone, Item_Details: [{ PAC: retP.pac, Item_Name: retP.items[0].name, SKU: retP.items[0].sku, Quantity: 2 }],
  }, 3);
  add('Service_Request1', {
    Service_Request1: 'SR-R-0002', RMA1: '', Original_SO: failP.soNo, Reason: 'Client postponed the renovation.', Sub: 'Change of Mind', Sales_Order: failP.soNo, Package_Number: failP.pac, Delivery_Date: iso(5), If_Pull_Out: 'No', Delivery_Type: 'Delivery Only',
    Item_Name: failP.items[0].name, SKU: failP.items[0].sku, Quantity: 1, Priority_Level: 'Low Priority', Scheduled_by: 'Flor', SR_Status: 'Cancelled', Customer_Name: failP.c.name, Customer_Address: failP.c.addr, City: failP.c.city,
    Email: failP.c.email, Phone_Number: failP.c.phone, Item_Details: [{ PAC: failP.pac, Item_Name: failP.items[0].name, SKU: failP.items[0].sku, Quantity: 1 }],
  }, 4);
  [[retP, 'RMA-0001', retSr, 'Damaged Item', 'Two units arrived with scratched glass.', 'CREATED', -1, 2], [failP, 'RMA-0002', '', 'Change of Mind', 'Client postponed the renovation; item returned to stock.', 'PENDING', -3, 1]].forEach(([p, rma, sr, sub, reason, srStatus, ago, qty]) =>
    add('Sales_Returns_Form', {
      RMA: rma, Service_Request: sr ? 'SR-R-0001' : 'SR-R-0002', Sales_Order: p.soNo, Package_Number: p.pac, Customer_Name: p.c.name, Customer_Address: p.c.addr, City: p.c.city, Email: p.c.email, Contact: p.c.phone, Date_field: iso(ago),
      Warehouse_Name: srStatus === 'CREATED' ? 'WH4 HC-Damage Repairable' : 'WH1 BANAWE', Reason: reason, Sub_Reason: sub, Returned_by: one(['Norman', 'Edmon', 'CJ'], p.i), SR_CREATION_STATUS: srStatus,
      Items: [{ Item_Name: p.items[0].name, SKU: p.items[0].sku, Qty_Shipped_Fulfilled: p.items[0].qty, Return_Quantity: qty }], Image: photo(`mock-return-${rma}.svg`, `Returned item · ${rma}`, 8),
    }, -ago + 1));
  add('Pick_Up_Request_Form', {
    Pickup_Status: 'Scheduled', Pickup_Date_Time: `${iso(2)} 14:00:00`, Receiver_s_Name: 'Reyes Interiors Showroom', Dispatcher_s_Name: 'Choice 1', Service_Request: 'SR-P-0001', Sales_Order: 'SO-24080', Package_Number: 'PAC-1019',
    Delivery_Type: 'Pick Up', Customer_Name: CUSTS['Reyes Interiors'].name, Email: CUSTS['Reyes Interiors'].email, Customer_Address: CUSTS['Reyes Interiors'].addr, City: CUSTS['Reyes Interiors'].city, Contact_Number: CUSTS['Reyes Interiors'].phone,
    For_Automation_Not_to_Edit: [{ Item_Name: ITEMS[4].name, SKU: ITEMS[4].sku, Quantity: '2' }],
  }, 2);

  // ---------- Schedule requests from the sales side ----------
  [['REQ-0001', 'SO-24110', 'Santos Residence', 5, 10, 'Client prefers a morning slot, building allows deliveries before noon.', 'Pending Review', 'With Installation', 'm.santos@mail.example'],
   ['REQ-0002', 'SO-24095', 'Meridian Hospitality Group', 9, 14, 'Needs to be before the lobby soft-opening.', 'Confirmed', 'Delivery and Installation', 'procurement@meridianhg.example'],
   ['REQ-0003', 'SO-24113', 'Villanueva Home Retail', 3, 9, 'Deliver to the back dock only.', 'Declined', 'Delivery Only', 'buying@villanuevahome.example'],
   ['REQ-0004', 'SO-24115', 'Cruz Boutique Hotel', 12, 11, 'Rooms 201–210, after housekeeping.', 'Pending Review', 'Full-Day Install', 'gm@cruzboutique.example']].forEach(([no, so, cust, days, hour, notes, status, type, who], i) => {
    const id = add('DMS_Schedule_Request', { CMS_Schedule_Request_ID: no, Sales_Order_Number: so, Customer_Name: cust, Requested_Date: iso(days), Requested_Time: slot(hour), Requested_By: 'HC Sales ' + (1 + i), Notes: notes, Status: status,
      Books_Sales_Order_ID: String(1100000000000 + i), Type_of_Delivery: type }, i + 1);
    add('DMS_Schedule_Request_Messages', { DMS_Schedule_Request_ID: no, Sender_Email: 'sales@homecartel.example', Sender_Name: 'HC Sales ' + (1 + i), Message: `Requesting ${short(days)} for ${cust}.`, Sent_On: stamp(-(i + 1), 10, 0), Synced_To_CMS: true });
    if (status !== 'Pending Review') add('DMS_Schedule_Request_Messages', { DMS_Schedule_Request_ID: no, Sender_Email: 'delivery@homecartel.example', Sender_Name: 'Delivery Officer', Message: status === 'Confirmed' ? 'Confirmed. The team is booked for that day.' : 'Cannot do that day, the dock is closed. Please propose another date.', Sent_On: stamp(-i, 9, 30), Synced_To_CMS: false });
    return id;
  });

  // ---------- Team availability, policies, trucks, site visits ----------
  const AV = [['Full Day', 8, 3], ['Full Day', 8, 3], ['Half Day', 4, 2], ['Full Day', 8, 3], ['Not Available', 0, 0]];
  for (let d = -1; d <= 6; d++) {
    if (day(d).getDay() === 0) continue;
    INSTALLERS.forEach((inst, k) => {
      const [status, hours, cap] = AV[(k + d + 8) % AV.length];
      add('Daily_Team_Availability', { Availability_Date: iso(d), Installer: inst, Driver: status === 'Not Available' ? 'Other' : one(DRIVERS, k + d + 8), Vehicle: one(VEHICLES, k), Availability_Status: status, Max_Capacity_Hours: hours, Max_SO_Capacity: cap,
        Notes: status === 'Not Available' ? 'Day off' : status === 'Half Day' ? 'Afternoon only' : '', Added_By: 'Delivery Manager', Start_Time1: slot(8) });
    });
  }
  [['traffic_buffer_percent', 'Extra travel time added to every job (percent of the job).', '15', 'Percentage'], ['max_days_scheduling_window', 'How many days ahead the engine may book.', '14', 'Number'],
   ['workday_start_time', 'Standard workday start.', '8:00 AM', 'Time'], ['workday_end_time', 'Standard workday end.', '5:00 PM', 'Time']].forEach(([k, d, v, t]) =>
    add('Policy_Settings', { Policy_Key: k, Description: d, Value: v, Type_field: t, Last_Updated_By: 'Delivery Manager', Last_Updated_Date: stamp(-9, 9, 0) }));
  const VEH = opts('Daily_Checklist_for_Vehicle', 'Vehicle_Name').slice(0, 2);
  const CHECK = opts('Daily_Checklist_for_Vehicle', 'Vehicle_Checklist');
  for (let k = 0; k < 6; k++) {
    const issue = k === 2;
    add('Daily_Checklist_for_Vehicle', { Date_Time: stamp(-k, 7, 20), Vehicle_Name: one(VEH, k), ODO_Number: 48200 + k * 63 + (k % 2) * 4300, Gas_Number: 60 - k * 6, Vehicle_Checker: one(['Zaldy', 'Rash', 'Norman', 'Judy'], k), Vehicle_Driver: one(['Zaldy', 'Marlon', 'Rash', 'Judy'], k + 1),
      Vehicle_Checklist: issue ? CHECK.slice(0, CHECK.length - 3) : CHECK, Issue_Found: issue ? 'Yes' : 'No', Issue_Description: issue ? 'Left brake light is out; replace before the next run.' : '', Odometer_Photo_Upload: photo(`mock-odo-${k}.svg`, 'Odometer', 36 + k * 20) }, k);
  }
  const FVEH = opts('Fuel_Entries', 'Vehicle');
  [[0, 'Petron', 62], [1, 'Shell', 58], [2, 'Caltex', 60], [3, 'Petron', 63], [1, 'Shell', 59], [0, 'Phoenix', 57]].forEach(([v, vendor, price], k) =>
    add('Fuel_Entries', { Vehicle: one(FVEH, v), Date_field: iso(-k * 3), Gas_Bar: 60 + k * 4, Odometer: 48000 + k * 220, Price_Unit: price, Vendor: vendor, Invoice_No: `INV-${7710 + k}`, Remarks: k === 3 ? 'Full tank before the Tagaytay run' : '' }));
  [[0, ['Change Oil', 'Oil Filter'], 1800, 650], [1, ['Fixing Break'], 2400, 3100], [2, ['Inflating Tire', 'Car Lights Repair'], 300, 900]].forEach(([v, svc, labor, parts], k) =>
    add('Service_Entries', { Vehicle: one(FVEH, v), Service: svc, Remarks: 'Done at the shop on Edsa.', Labor: labor, Parts: parts, Tax: '12%', Total: Math.round((labor + parts) * 1.12), Invoice_Number: `SVC-${220 + k}`, Submitted_by: 'Rash' }));
  const SV = forms.Field_Service_Site_Visit_Form.fields;
  const optsOf = (n) => SV.find((f) => f.name === n)?.options || SV.find((f) => f.name === n)?.choices || [];
  [['Norman', 'Zaldy', -2, 'Installation Assessment', 'SO-24115', '2.9 m', 'Junction Box', 'Gypsum'], ['Edmon', 'Rash', 3, 'Repair Assessment', 'SO-24101', '3.4 m', 'Outlet', 'Concrete']].forEach(([tech, drv, d, purpose, so, ceil, power, surface], k) => {
    const id = add('Field_Service_Site_Visit_Form', {
      Technician_Name: tech, Driver_Name: drv, Date_of_Site_Visit: iso(d), Purpose_of_Visit: purpose, SO: so, Plan_the_Layout: optsOf('Plan_the_Layout').slice(0, 3), Ceiling_Height: ceil, Mount_Height_from_Floor: '2.2 m', Power_Source_Type: power,
      Remarks: 'Layout agreed with the designer.', Layout_Photo: photo(`mock-layout-${k}.svg`, 'Layout markings', 200 + k * 30), Prepare_the_Mounting_Surface: optsOf('Prepare_the_Mounting_Surface').slice(0, 2), Surface_Type: surface,
      Electrical_Check: optsOf('Electrical_Check').slice(0, 4), Voltage: '230V', Breaker_Size_if_known: '16A', Ceiling_Structure_Check: optsOf('Ceiling_Structure_Check').slice(0, 3), Safety_Access_Check: optsOf('Safety_Access_Check').slice(0, 3),
      Site_Delivery_Check: optsOf('Site_Delivery_Check'), Client_Confirmation: optsOf('Client_Confirmation').slice(0, 2), Notes_Remarks: 'Client will clear the room before the install date.', Final_Check_Sign_off: optsOf('Final_Check_Sign_off').slice(0, 1),
      Name: { first_name: 'Site', last_name: 'Representative' },
    }, k * 4 + 1);
    add('Site_Visit_Photos', { Record_ID: id, Section1: 'Layout', File_Name: `layout-${k}.svg`, Photo: photo(`mock-sitevisit-${k}.svg`, `Site visit · ${so}`, 160 + k * 40), Uploaded_On: stamp(d, 11, 0) });
  });

  // ---------- Warehouse requests and transfers ----------
  [['Actual Photo', 'Please send an actual photo of the walnut touch lamps, client wants to see the grain.', 'Emily', 'Hendel', 'Done', 'Photo sent to sales.', 2], ['Stock Availability', 'How many Arc Floor Lamps are on the shelf right now?', 'Julia', '', 'Pending', '', 1],
   ['Measurement', 'Need the box dimensions for the Cascade Cluster Chandelier for the freight quote.', 'Vanessa', 'Jayvon', 'Pending', '', 0]].forEach(([type, req, by, picker, status, remarks, ago], k) =>
    add('Warehouse_Request', { Type_of_Request: type, Date_Requested: stamp(-ago, 10 + k, 15), Request_By: by, Request: req, Item: [{ Items: ITEMS[[10, 3, 7][k]].name, SKU: ITEMS[[10, 3, 7][k]].sku }], Picker: picker, Remarks: remarks, Request_Status: status }, ago));
  [['Edwin', 'HC WH1 BANAWE', 'HC WH3 BAESA', 'SO-24113', [[9, 20]], true, true, 4], ['Andrea', 'HC WH3 BAESA', 'HC WH1 BANAWE', '', [[5, 40], [6, 12]], true, false, 1], ['Edwin', 'HC WH1 BANAWE', 'HC WH3 BAESA', '', [[2, 12]], false, false, 0]].forEach(([by, from, to, so, lines, dispatch, received, ago]) =>
    add('Transfer_Warehouse', { Initiated_At1: stamp(-ago, 9, 40), Initiated_By: by, From_Warehouse: from, To_Warehouse: to, SO_Optional: so || 'Select',
      Item_to_transfer: lines.map(([k, q]) => ({ Items: ITEMS[k].name, SKU: ITEMS[k].sku, Quantity: String(q), PAC_Optional: '' })), Dispatch: dispatch, Received: received }, ago));

  // ---------- Timelines and internal conversations ----------
  const tl = (form, key, no, rows) => rows.forEach(([ago, type, title, changes, actor]) => add(form, { [key]: no, Action_Title: title, Action_Type: type, Changes: changes, Actor: actor || 'HC Pack & Fulfill', Logged_On: stamp(-ago, 9 + (ago % 7), 10) }));
  P.forEach((p) => {
    const rows = [[p.ago, 'Created', 'Package created', `Sales order ${p.soNo}\nCustomer: ${p.c.name}\n${p.items.length} line(s)`]];
    for (let s = 1; s <= p.stage; s++) rows.push([Math.max(p.ago - s, 0), 'Updated', `Moved to ${stageNames[s]}`, `${stageNames[s - 1]} → ${stageNames[s]}`]);
    rows.forEach(([ago, type, title, changes, actor]) => add('SOF_Timeline', { From: 'Sales Order', Package: p.pac, Action_Title: title, Action_Type: type, Changes: changes, Actor: actor || 'HC Pack & Fulfill', Logged_On: stamp(-ago, 9 + (ago % 7), 10) }));
  });
  [['PAC-1003', 'homecartelsales@gmail.com', 'HC Sales', 'Client sent the second payment slip; please recheck the gate.', 3], ['PAC-1003', 'homecartelff@gmail.com', 'HC Pack & Fulfill', 'Will release as soon as finance confirms.', 3],
   ['PAC-1010', 'homecartelff@gmail.com', 'HC Pack & Fulfill', 'Rework started on the three cracked shades.', 7], ['PAC-1016', 'hcinvanalyst@gmail.com', 'HC Systems', 'Flagged to the delivery manager; client unreachable.', 2]].forEach(([pac, email, role, msg, ago]) =>
    add('SOF_Internal_Messages', { From: 'Sales Order', Package: pac, Sender_Email: email, Sender_Role: role, Message: msg, Sent_On: stamp(-ago, 14, 25) }));
  // procurement-side chat/timeline tables that were still empty
  add('PO_Messages', { PO_No: 'PO-0002', Supplier: 'Tony Fan', Sender_Role: 'Buyer', Sender_Name: 'HC Purchasing', Message: 'Please share the packing list before the container closes.', Sent_On: stamp(-12, 10, 15) });
  add('PO_Messages', { PO_No: 'PO-0002', Supplier: 'Tony Fan', Sender_Role: 'Supplier', Sender_Name: 'Tony Fan Sales', Message: 'Packing list attached to the shipment record.', Sent_On: stamp(-12, 16, 40) });
  add('PO_Internal_Messages', { PO_No: 'PO-0002', Sender_Email: 'purchasing@homecartel.example', Sender_Role: 'HC Purchasing', Message: 'Supplier is slightly slow on paperwork; check again on Friday.', Sent_On: stamp(-11, 9, 5) });
  add('Shipment_Internal_Messages', { Shipment_No: 'SHP-0002', Sender_Email: 'purchasing@homecartel.example', Sender_Role: 'HC Purchasing', Message: 'Forwarder confirmed the arrival slot at the warehouse.', Sent_On: stamp(-6, 11, 0) });
  add('Receiving_Internal_Messages', { Receive_No1: 'RCV-0001', Sender_Email: 'receiving@homecartel.example', Sender_Role: 'HC Purchasing', Message: 'Counted 1 of 2 chandeliers intact; photos uploaded to the exception.', Sent_On: stamp(-5, 13, 30) });
  add('Exception_Internal_Messages', { Exception_No: 'EXC-0001', Sender_Email: 'purchasing@homecartel.example', Sender_Role: 'HC Purchasing', Message: 'Replacement requested from Tony Fan (RR-0001).', Sent_On: stamp(-4, 9, 45) });
  add('RR_Internal_Messages', { RR_No: 'RR-0001', Sender_Email: 'purchasing@homecartel.example', Sender_Role: 'HC Purchasing', Message: 'Ask the supplier to repack with extra foam this time.', Sent_On: stamp(-3, 10, 20) });
  tl('RR_Timeline', 'RR_No', 'RR-0001', [[4, 'Created', 'Replacement request created', 'Source: EXC-0001\nSupplier: Tony Fan', 'HC Purchasing'], [3, 'Updated', 'Supplier acknowledged', 'Expected ship date set.', 'Tony Fan']]);
  tl('RR_Timeline', 'RR_No', 'RR-0002', [[2, 'Created', 'Replacement request created', 'Source: EXC-0002\nSupplier: Zhongshan Lumina', 'HC Purchasing']]);

  add('PR_Internal_Messages', { PR_No: 'PR-0004', Sender_Email: 'purchasing@homecartel.example', Sender_Role: 'HC Purchasing', Message: 'Customer asked for a firm date, check the production update with Tony Fan.', Sent_On: stamp(-20, 9, 30) });
  add('PR_Internal_Messages', { PR_No: 'PR-0009', Sender_Email: 'sales@homecartel.example', Sender_Role: 'HC Sales', Message: 'Client promised the down payment by Friday; keep the PR on hold until then.', Sent_On: stamp(-2, 16, 10) });
  // a Fenteng replacement (the Fenteng portal had none), mirrored into the shared Replacement_Request report
  const fenRr = {
    RR_No: 'RR-0003', Source_Type: 'Receiving Damage', RR_Status: 'Open', RR_Supplier: 'Fenteng Lighting', RR_Item_Name: ITEMS[9].name, Source_Module: 'Receiving', RR_Date: iso(-1), Source_Exception_No: '',
    RR_Reason: 'Three vanity bars arrived with cracked diffusers.', RR_SKU: ITEMS[9].sku, RR_Qty_Value: 3, RR_PR_No: 'PR-0002', Shipment_Mode: 'LCL', Last_Updated: iso(-1), RR_SO: 'SO-24101', RR_Item_to_Replace: ITEMS[9].name, RR_Damage_Qty: 3,
    Replacement_Summary: [{ Supplier: 'Fenteng Lighting', RR_Reason: 'Cracked diffuser', SKU: ITEMS[9].sku, Item: ITEMS[9].name, SO_No: 'SO-24101', PR_No: 'PR-0002', Original_PO_No: 'PO-0001', RR_Qty: 3, Priority: 'Medium', Delay_Status: 'On Track' }],
  };
  add('Replacement_Request', fenRr, 1);
  add('Fenteng_Lighting_Replacement_Request', fenRr, 1);
  tl('RR_Timeline', 'RR_No', 'RR-0003', [[1, 'Created', 'Replacement request created', 'Source: Receiving\nSupplier: Fenteng Lighting', 'HC Purchasing']]);

  // ---------- Notifications (one stream per widget) ----------
  const notes = {
    App_Notifications: [['Purchase Request added', 'PR-0011 was added for INQ-0012.', 'PR-0011'], ['Shipment', 'Shipment SHP-0004 has 6 days left on its timeline.', 'SHP-0004'], ['Receiving', 'Received quantity for PO-0002 does not match the expected quantity.', 'PO-0002'], ['Inquiry', 'A supplier responded to INQ-0005.', 'INQ-0005']],
    Tony_Notifications: [['Purchase Order', 'PO-0002 was updated by HC Purchasing.', 'PO-0002'], ['Replacement Request', 'RR-0001 needs your acknowledgement.', 'RR-0001']],
    Fenteng_Notifications: [['Purchase Request', 'PR-0002 is waiting for your response.', 'PR-0002'], ['Message', 'HC Purchasing sent you a message on INQ-0005.', 'INQ-0005']],
    SO_Notifications: [['Sales Order', 'SO-24095 now has 2 packages in the pipeline.', 'SO-24095'], ['Stage', 'PAC-1005 moved to Picking.', 'PAC-1005']],
    PreOrder_Notifications: [['Pre-order received', 'The Ribbed Glass Table Lamps for SO-24080 arrived. Select them to package.', 'SO-24080']],
    ReadinessGate_Notifications: [['Payment', 'PAC-1003 is waiting for the second payment.', 'PAC-1003'], ['Payment', 'PAC-1004 is unpaid; the gate is closed.', 'PAC-1004']],
    Pick_Notifications: [['Pick', 'PAC-1005 was released to Hendel.', 'PAC-1005'], ['Pick', 'PAC-1006 was released to Jayvon.', 'PAC-1006']],
    Pack_Notifications: [['Pack', 'PAC-1008 has no packer assigned yet.', 'PAC-1008'], ['Pack', 'PAC-1007 is ready for packing (Kurt).', 'PAC-1007']],
    QC_Notifications: [['QC rejected', 'PAC-1010 failed QC: 3 cracked shades.', 'PAC-1010'], ['QC waiting', 'PAC-1009 is waiting for a checker.', 'PAC-1009']],
    OrderAgg_Notifications: [['To ship', 'PAC-1013 was dispatched to Initial Scheduling.', 'PAC-1013'], ['To ship', 'PAC-1012 is waiting to be dispatched.', 'PAC-1012']],
    ExceptionControl_Notifications: [['Exception', 'EXC-F-0001 is in rework.', 'EXC-F-0001'], ['Exception', 'EXC-F-0002 needs an assessment.', 'EXC-F-0002']],
  };
  for (const [form, list] of Object.entries(notes)) list.forEach(([type, message, no], k) =>
    add(form, { Recipient_Email: userEmail, Notification_Type: type, Message: message, Created_On: stamp(-k, 15 - k, 5), Read: k >= 2, Target_URL: '', Source_Record_No: no, Source_Record_ID: '' }));

  return { seeded: true };
}

// CLI: node server/seed-ops.mjs
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const out = seedOps();
  console.log(out.seeded ? 'Operations mock data loaded (Fulfillment, Delivery, notifications).' : 'Operations tables already have data; nothing added.');
}
