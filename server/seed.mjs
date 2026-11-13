// Mock data for the local SQLite backend (the app no longer talks to Zoho Creator).
//   npm run seed            fills the empty database
//   npm run seed -- --reset wipes every table first, then fills it
// Everything is dated relative to today, so aging, ETAs and delays always look current.
// Records are written through the same addRecord() the widgets' SDK calls end up in.
import * as store from './db.mjs';
import { seedOps } from './seed-ops.mjs';

const { addRecord, db, columns, tableCounts } = store;
const USER = 'mock-data';

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const iso = (n) => { const d = day(n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const stamp = (n, h = 9, m = 0) => `${iso(n)} ${pad(h)}:${pad(m)}:00`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const zdt = (n, h = 9, m = 0) => { const d = day(n); return `${pad(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()} ${pad(h)}:${pad(m)}:00`; };
const short = (n) => { const d = day(n); return `${MON[d.getMonth()]} ${d.getDate()}`; };
const seq = (prefix, n, w = 4) => `${prefix}-${String(n).padStart(w, '0')}`;
const CNY_PHP = 7.9;

const add = (form, data) => addRecord(form, { ...data });

// ---------- guard / reset ----------
export function seed({ reset = false } = {}) {
  if (reset) {
    for (const form of Object.keys(columns)) db.exec(`DELETE FROM "${form}"`);
    db.exec(`UPDATE sqlite_sequence SET seq = 4900000000000`);
  } else if (tableCounts().length) {
    // procurement data already there: still fill the operations tables if they are empty
    const ops = seedOps();
    return { skipped: !ops.seeded, tables: tableCounts() };
  }

  // ---------- masters ----------
  const supplierDefs = [
    { key: 'fenteng', id: 'SUP-001', name: 'Fenteng Lighting', cats: ['Chandeliers', 'Pendant Light', 'Wall Light', 'Ceiling Light', 'Semi Flush Mounted Lights', 'Painting & Bathroom Lights'], max: 20, active: 6, status: 'Normal' },
    { key: 'tony', id: 'SUP-002', name: 'Tony Fan', cats: ['Chandeliers', 'Pendant Light', 'Wall Light', 'Floor Lamp', 'Table Lamps', 'Ceiling Light', 'Cluster Chandelier', 'Mirrors'], all: true, max: 15, active: 13, status: 'Near Capacity' },
    { key: 'zhongshan', id: 'SUP-003', name: 'Zhongshan Lumina', cats: ['Floor Lamp', 'Table Lamps', 'Rechargeable Table Lamps'], max: 12, active: 3, status: 'Normal' },
    { key: 'guzhen', id: 'SUP-004', name: 'Guzhen Crystal Works', cats: ['Chandeliers', 'Cluster Chandelier', 'Semi Flush Mounted Lights'], max: 10, active: 9, status: 'Near Capacity' },
    { key: 'foshan', id: 'SUP-005', name: 'Foshan Mirror & Decor', cats: ['Mirrors', 'Furniture', 'Painting & Bathroom Lights'], max: 8, active: 2, status: 'Normal' },
  ];
  const SUP = {};
  for (const s of supplierDefs) {
    const id = add('Suppliers', {
      Supplier_ID: s.id, Supplier_Name: { first_name: s.name }, Supported_Categories: s.cats, Handles_All: !!s.all,
      Max_Capacity: s.max, Active_PO_Count: s.active, Utilization: Math.round((s.active / s.max) * 100), Status: s.status,
    });
    SUP[s.key] = { ...s, rid: id };
  }

  const customerDefs = [
    ['Alvarez Design Studio', 'Designer', 'studio@alvarezdesign.example', 'Makati'],
    ['Meridian Hospitality Group', 'Corporate', 'procurement@meridianhg.example', 'Taguig'],
    ['Santos Residence', 'Homeowner', 'm.santos@mail.example', 'Quezon City'],
    ['Pacific Coast Developers', 'Developer', 'fitout@pacificcoast.example', 'Pasig'],
    ['Cruz Boutique Hotel', 'Corporate', 'gm@cruzboutique.example', 'Tagaytay'],
    ['Reyes Interiors', 'Designer', 'hello@reyesinteriors.example', 'Mandaluyong'],
    ['Lim Residence', 'Homeowner', 'jlim@mail.example', 'San Juan'],
    ['Villanueva Home Retail', 'Corporate', 'buying@villanuevahome.example', 'Pasay'],
  ];
  const CUST = customerDefs.map(([name, type, email, city], i) => ({
    name, type, rid: add('Customer', {
      ID1: seq('CUST', i + 1, 3), customer_name: name, Customer_Type: type, Email: email, Phone_Number: `+63 917 55${pad(i)} 21${pad(i + 10)}`,
      Billing_Address: { address_line_1: `${10 + i} Sample Street`, district_city: city, state_province: 'Metro Manila', postal_code: `1${200 + i * 7}`, country: 'Philippines' },
    }),
  }));

  const itemDefs = [
    ['Crystal Orbit Chandelier 8-Light', 'LUM-CH-101', 'Chandeliers', 28500],
    ['Brass Dome Pendant 40cm', 'LUM-PD-205', 'Pendant Light', 6200],
    ['Linear Wall Sconce Matte Black', 'LUM-WL-310', 'Wall Light', 3400],
    ['Arc Floor Lamp Marble Base', 'LUM-FL-412', 'Floor Lamp', 9800],
    ['Ribbed Glass Table Lamp', 'LUM-TL-518', 'Table Lamps', 4100],
    ['Slim LED Ceiling Panel 60cm', 'LUM-CL-620', 'Ceiling Light', 2900],
    ['Opal Semi-Flush Mount 35cm', 'LUM-SF-714', 'Semi Flush Mounted Lights', 3800],
    ['Cascade Cluster Chandelier 12-Globe', 'LUM-CC-808', 'Cluster Chandelier', 41000],
    ['Arched Full-Length Mirror Gold', 'LUM-MR-903', 'Mirrors', 12500],
    ['Vanity Bar Light IP44', 'LUM-BL-115', 'Painting & Bathroom Lights', 2700],
    ['Rechargeable Touch Lamp Walnut', 'LUM-RT-222', 'Rechargeable Table Lamps', 3200],
    ['Travertine Coffee Table', 'FUR-CT-301', 'Furniture', 18900],
  ];
  const ITEM = itemDefs.map(([name, sku, category, srp], i) => ({
    name, sku, category, srp, cny: Math.round((srp * 0.45) / CNY_PHP / 10) * 10,
    rid: add('Items', {
      ID1: seq('ITM', i + 1, 3), item_name: name, SKU: sku, Item_ref: `REF-${sku}`, Description: `${name}. Mock catalogue entry.`, Unit: 'pcs',
      category, Rate: String(srp), Warehouse: 'Main Warehouse', Bin_location: `${'ABC'[i % 3]}-${pad(1 + (i % 9))}-0${1 + (i % 4)}`,
    }),
  }));
  // Which suppliers quote which item (first one is the preferred / selected)
  const QUOTERS = [['tony', 'guzhen'], ['fenteng', 'tony'], ['fenteng', 'tony'], ['tony', 'zhongshan'], ['zhongshan', 'tony'], ['fenteng', 'tony'],
    ['fenteng', 'guzhen'], ['guzhen', 'tony'], ['foshan', 'tony'], ['fenteng', 'foshan'], ['zhongshan', 'tony'], ['foshan', 'tony']];

  const projectDefs = [
    ['PRJ-001', 'Ayala Penthouse', 0, 5], ['PRJ-002', 'Meridian Lobby Refresh', 1, 8],
    ['PRJ-003', 'Azure Tower Units', 3, 12], ['PRJ-004', 'Cruz Boutique Hotel Phase 1', 4, 10],
  ];
  const PRJ = projectDefs.map(([code, name, c, pct]) => ({
    code, name, c, rid: add('Projects', { Project_Code: code, Project_Name: name, Customer: CUST[c].rid, Status: 'Active', Group_Discount_Pct: pct, All_SRP_Approved: false }),
  }));

  const salesOrders = [
    ['SO-24080', 5, 'Reyes Interiors', 'Designer'], ['SO-24087', 0, 'Alvarez Design Studio', 'Designer'], ['SO-24095', 1, 'Meridian Hospitality Group', 'Corporate'],
    ['SO-24101', 3, 'Pacific Coast Developers', 'Developer'], ['SO-24110', 2, 'Santos Residence', 'Homeowner'], ['SO-24112', 6, 'Lim Residence', 'Homeowner'],
    ['SO-24113', 7, 'Villanueva Home Retail', 'Corporate'], ['SO-24115', 4, 'Cruz Boutique Hotel', 'Corporate'],
  ];
  const SO = {};
  salesOrders.forEach(([no, c, name, type], i) => {
    SO[no] = { c, name, rid: add('Sales_Order', {
      Sales_Order_Record_Id: String(1100000000000 + i), Sales_Order_Number: no, Branch: 'Head Office', Customer_Name: name, Order_Status: 'Confirmed',
      Invoice_Status: i % 3 === 0 ? 'Paid' : 'Sent', Payment_Status: i % 3 === 0 ? 'Paid' : 'Partially Paid', Shipment_Status: 'Pending',
      Sales_Person: `HC Sales ${1 + (i % 4)}`, Customer_Type: type, Order_Type: 'Normal', Target_Delivery_Date: iso(20 + i * 3),
      Shipping_Street_1: `${10 + c} Sample Street`, Shipping_City: ['Makati', 'Taguig', 'Quezon City', 'Pasig', 'Tagaytay', 'Mandaluyong', 'San Juan', 'Pasay'][c], Shipping_Country: 'Philippines',
    }) };
  });

  // ---------- Inquiries ----------
  const quote = (item, kind) => {
    const it = ITEM[item], [a, b] = QUOTERS[item].map((k) => SUP[k]);
    const base = it.cny;
    const row = (s, extra) => ({ Supplier_ID: s.id, Suppliers: s.name, Availability: 'Pending', Initial_Price: 0, Negotiated: 0, Final_Price: 0, Lead_Time: '', Stage: 'Not Selected', Prev_Stage: '', Selected: false, ...extra });
    if (kind === 'final') return [
      row(a, { Availability: 'Confirmed', Initial_Price: Math.round(base * 1.15), Negotiated: Math.round(base * 1.05), Final_Price: base, Lead_Time: '3-4 weeks', Stage: 'Final', Selected: true }),
      row(b, { Availability: 'Confirmed', Initial_Price: Math.round(base * 1.3), Lead_Time: '5 weeks', Stage: 'Not Selected' }),
    ];
    if (kind === 'negotiating') return [
      row(a, { Availability: 'Confirmed', Initial_Price: Math.round(base * 1.2), Negotiated: Math.round(base * 1.1), Lead_Time: '4 weeks', Stage: 'Negotiating' }),
      row(b, { Availability: 'Pending', Initial_Price: Math.round(base * 1.25), Lead_Time: '6 weeks' }),
    ];
    if (kind === 'awaiting') return [row(a, { Lead_Time: '' }), row(b, {})];
    return [];
  };

  // [group, customer, project, item, qty, state, order type, owner, daysAgo, waitingOn]
  const inqDefs = [
    ['QG-0001', 0, 0, 0, 2, 'ready', 'Normal', 'HC Sales 1', 9, 'None'],
    ['QG-0001', 0, 0, 8, 1, 'ready', 'Normal', 'HC Sales 1', 9, 'None'],
    ['QG-0001', 0, 0, 3, 2, 'ready', 'Normal', 'HC Sales 1', 9, 'None'],
    ['QG-0002', 1, 1, 7, 1, 'ready', 'Pre Order', 'HC Sales 2', 7, 'None'],
    ['QG-0002', 1, 1, 1, 24, 'awaiting', 'Normal', 'HC Sales 2', 7, 'Supplier'],
    ['QG-0003', 2, null, 4, 4, 'negotiating', 'Normal', 'HC Sales 3', 5, 'Supplier'],
    ['QG-0003', 2, null, 2, 6, 'collateral', 'Normal', 'HC Sales 3', 5, 'Internal'],
    ['QG-0004', 3, 2, 5, 120, 'estimate', 'Normal', 'HC Sales 4', 26, 'None'],
    ['QG-0004', 3, 2, 9, 60, 'estimate', 'Normal', 'HC Sales 4', 26, 'None'],
    ['QG-0004', 3, 2, 6, 40, 'estimate', 'Normal', 'HC Sales 4', 26, 'None'],
    ['QG-0005', 4, 3, 10, 30, 'new', 'Normal', 'HC Sales 5', 1, 'Supplier'],
    ['QG-0005', 4, 3, 11, 4, 'new', 'Normal', 'HC Sales 5', 1, 'Internal'],
  ];
  const INQ = inqDefs.map(([qg, c, p, item, qty, state, orderType, owner, ago, waiting], i) => {
    const it = ITEM[item];
    const readyish = ['ready', 'estimate', 'collateral'].includes(state);
    const hasFinal = readyish;
    const quotes = quote(item, state === 'collateral' ? 'final' : readyish ? 'final' : state === 'new' ? 'none' : state);
    const srp = it.srp * qty;
    const cost = hasFinal ? it.cny : 0;
    const collateralDone = state !== 'collateral' && state !== 'new' && state !== 'awaiting' && state !== 'negotiating';
    const srpApproved = state === 'ready' || state === 'estimate';
    const no = seq('INQ', i + 1, 5);
    const rid = add('Inquiry_Form', {
      created_date: zdt(-ago, 9 + (i % 5), 10 * (i % 6)), INQ_No: no, Customer: CUST[c].rid, Sales_Owner: owner, Customer_Type: CUST[c].type,
      Projects: p == null ? '' : PRJ[p].rid, Project_Name: p == null ? '' : PRJ[p].name, Project_Type: CUST[c].type === 'Homeowner' ? 'Residential' : 'Commercial',
      Addtl_Disc_Needed1: 'No', quote_group: qg, Group_Discount_Pct: p == null ? 0 : projectDefs[p][3], Waiting_On: waiting, target_date: iso(30 - ago + i),
      Items: it.rid, sku: it.sku, unit: 'pcs', quantity: qty, description: it.name, Addtional_Description: `${it.category}, project spec as per drawings.`,
      Order_Type: orderType, Commission: '0', For_Bidding: 'False', Open_to_similar_design: i % 4 === 0,
      Suppliers: QUOTERS[item].map((k) => SUP[k].rid), Supplier_Quotes: quotes,
      Product_Sample: collateralDone ? 'Completed' : 'Pending', Technical_Drawing: collateralDone ? 'Completed' : state === 'collateral' ? 'Pending' : 'N/A',
      D_Image: collateralDone ? 'Completed' : 'Pending', Specification: collateralDone ? 'Completed' : 'Pending',
      Supplier_Selected: hasFinal, Availability: hasFinal, Final_Price_Exists: hasFinal, Collateral_Comple_NA: collateralDone, SRP_Approved: srpApproved,
      Ready_for_Estimates: state === 'ready' || state === 'estimate',
      Select_Final_Cost: cost, SRP_Approved1: srpApproved ? it.srp : 0, Margin: srpApproved ? Math.round((1 - (cost * CNY_PHP) / it.srp) * 1000) / 10 : 0,
      SRP_Status: srpApproved ? 'Approved' : 'Pending',
      Estimate_Created: state === 'estimate', Books_Estimate_No: state === 'estimate' ? seq('EST', 5100 + i, 5) : '', Books_Estimate_ID: state === 'estimate' ? `mock-est-${i}` : '',
      Deep_Link_Token: `mock${String(i).padStart(4, '0')}`,
      Dimension: ['60 x 60 x 90 cm', '40 x 40 x 25 cm', '12 x 8 x 30 cm', '45 x 45 x 160 cm'][i % 4], Color_Body: ['Brass', 'Matte Black', 'Gold', 'White'][i % 4],
      Voltage: '220-240V', Lumens: String(800 + (i % 4) * 400), Color_Temperature: ['2700K', '3000K', '4000K'][i % 3], Type_of_Bulb: ['G9', 'E14-Candle', 'A60 - E27', 'GU10'][i % 4],
    });
    return { rid, no, qg, c, p, item, qty, state, ago, owner, quotes };
  });

  // Supplier portal copies of the quote request (Supplier_1 = Fenteng Lighting, Supplier_2 = Tony Fan)
  const portal = (supplierKey, form, imgField) => {
    for (const inq of INQ) {
      const mine = inq.quotes.find((q) => q.Supplier_ID === SUP[supplierKey].id);
      if (!mine) continue;
      add(form, {
        INQ_No_Supplier: inq.no, Items_Supplier: ITEM[inq.item].rid, Description_Supplier: ITEM[inq.item].name, Date_Created_Supplier: iso(-inq.ago),
        Response_Status: mine.Stage === 'Final' ? 'Selected' : mine.Availability === 'Pending' ? 'Waiting' : 'Submit Response', SKU_Supplier: ITEM[inq.item].sku,
        Quantity_Supplier: inq.qty, Unit_Supplier: 'pcs', Target_Date_Supplier: iso(30 - inq.ago), Additional_Description_Supplier: ITEM[inq.item].category,
        Supplier_quotes: [{ SupplierName: mine.Suppliers, Availability_Supplier: mine.Availability, Initial_Price_Supplier: mine.Initial_Price, Negotiated_Supplier: mine.Negotiated,
          Final_Price_Supplier: mine.Final_Price, Lead_Time_Supplier: mine.Lead_Time, Stage_Supplier: mine.Stage, Selected_Supplier: mine.Selected }],
        edit_counter: 0,
      });
    }
  };
  portal('fenteng', 'Supplier_1');
  portal('tony', 'Supplier_2');

  // ---------- Purchase Requests ----------
  // [no, SO, customer, item, qty, supplier, mode, daysAgo, stage]
  //   stage: 'po' converted to a PO | 'ready' ready for PO | 'sourcing' no supplier yet | 'hold' | 'cancelled'
  const MODE_DAYS = { Airfreight: 9, LCL: 35, FCL: 45 };
  const prDefs = [
    ['PR-0001', 'SO-24101', 3, 5, 120, 'fenteng', 'LCL', 24, 'po', 'PO-0001'],
    ['PR-0002', 'SO-24101', 3, 9, 60, 'fenteng', 'LCL', 24, 'po', 'PO-0001'],
    ['PR-0003', 'SO-24101', 3, 6, 40, 'fenteng', 'LCL', 24, 'ready', ''],
    ['PR-0004', 'SO-24087', 0, 0, 2, 'tony', 'Airfreight', 30, 'po', 'PO-0002'],
    ['PR-0005', 'SO-24087', 0, 3, 2, 'tony', 'Airfreight', 30, 'po', 'PO-0002'],
    ['PR-0006', 'SO-24095', 1, 7, 1, 'guzhen', 'LCL', 4, 'po', 'PO-0003'],
    ['PR-0007', 'SO-24080', 5, 4, 6, 'zhongshan', 'FCL', 60, 'po', 'PO-0004'],
    ['PR-0008', 'SO-24110', 2, 2, 6, 'tony', 'Airfreight', 22, 'po', 'PO-0005'],
    ['PR-0009', 'SO-24112', 6, 8, 1, 'foshan', 'LCL', 6, 'hold', ''],
    ['PR-0010', 'SO-24113', 7, 11, 2, 'foshan', 'LCL', 8, 'cancelled', ''],
    ['PR-0011', 'SO-24115', 4, 10, 30, '', '', 2, 'sourcing', ''],
  ];
  const PR = {};
  prDefs.forEach(([no, so, c, item, qty, sup, mode, ago, stage, po], i) => {
    const it = ITEM[item], s = sup && SUP[sup];
    const lead = mode ? MODE_DAYS[mode] : 0;
    const hasSupplier = !!s;
    const targetDelivery = iso(60 - ago + (stage === 'po' ? 0 : 20));
    const production = iso(-ago + 5), supplierTarget = iso(-ago + 5 + lead);
    const remaining = Math.round((new Date(supplierTarget) - new Date(iso(0))) / 86400000);
    const ready = stage === 'ready' || stage === 'po';
    const delay = remaining < 0 ? 'Delayed' : remaining < 7 ? 'At Risk' : 'On Track';
    const priority = ['HIGH', 'MEDIUM', 'LOW'][i % 3];
    const id = add('Purchase_Request1', {
      PR_No: no, Customer: CUST[c].rid, Items: it.rid, Description1: it.name, inquiry_reference: INQ[Math.min(i, INQ.length - 1)].no,
      PR_Status: stage === 'po' ? 'Converted to PO' : 'Open', SRP_Approved_PR: it.srp * qty, PR_Date: iso(-ago), Customer_Type: CUST[c].type, sku: it.sku, unit: 'pcs',
      Target_Delivery: targetDelivery, Link_PO_No: po, Sales_Order: so, Sales_Owner: `HC Sales ${1 + (i % 4)}`, quantity: qty, category: it.category,
      description: it.name, Order_Type: 'Normal', Priority: priority, Priority_Score: [82, 55, 30][i % 3], Order_Value: it.srp * qty, Aging: ago,
      Additional_Details: `${it.category} for ${salesOrders.find((x) => x[0] === so)[2]}.`, Similar_Item: false,
      Supplier_Load_Balancing: supplierDefs.filter((d) => d.cats.includes(it.category) || d.all).map((d) => ({
        Suppliers: { ID: SUP[d.key].rid, display_value: d.name, zc_display_value: d.name }, Match_Category: 'Match', Active_POs: d.active, Percent: Math.round((d.active / d.max) * 100),
        Load_Status: d.status === 'Near Capacity' ? 'Near Capacity' : 'Normal', Eligible_Supplier: d.key === sup ? 'Recommended' : 'Available (Higher load)',
      })),
      Supplier_Selected: hasSupplier ? [{ Supplier_ID: s.id, Suppliers: s.name, Availability: 'Confirmed', Initial_Price: Math.round(it.cny * 1.15), Negotiated: Math.round(it.cny * 1.05), Final_Price: it.cny, Lead_Time: `${Math.round(lead / 7)} weeks`, Status: 'Active', Selected: true }] : [],
      Selected_Supplier: hasSupplier ? s.name : '', Selcted_Final_Cost: hasSupplier ? it.cny : 0, SRP_Rate_PR: it.srp, Followed_Recommendation: 'Yes',
      Shipment_Mode: mode, Shipment_Days: lead, Required_Days_Lead: lead, Production_Date: hasSupplier ? production : '', supplier_target_date: hasSupplier ? supplierTarget : '',
      Remaining_Days: hasSupplier ? remaining : '', Delay_Status: hasSupplier ? delay : '', Selected_Supplier1: hasSupplier, Final_price_confirmed: hasSupplier,
      Shipping_mode_selected: !!mode, Target_date_exists: stage !== 'hold', PR_READY_FOR_PO: ready, PR_Approved: ready, Last_Update: stamp(-Math.max(ago - 2, 0), 14, 30),
      Source: 'Inquiry', Dedup_Key: `${so}|${it.sku}`, Sourcing_Type: 'Import',
      Hold_Status: stage === 'hold' ? 'On Hold' : stage === 'cancelled' ? 'Cancelled' : 'Active',
      Hold_Reason: stage === 'hold' ? 'Client payment issue' : stage === 'cancelled' ? 'Client confirmed cancel,' : '',
      Hold_Notes: stage === 'hold' ? 'Waiting for down payment before ordering.' : stage === 'cancelled' ? 'Client cancelled the order.' : '',
      Hold_Date: stage === 'hold' || stage === 'cancelled' ? iso(-2) : '', Held_By: stage === 'hold' || stage === 'cancelled' ? 'HC Sales Coordinator' : '',
      Hold_Follow_Up_Date: stage === 'hold' ? iso(5) : '',
      Dimension: it.category.includes('Chandelier') ? '80 x 80 x 100 cm' : '40 x 40 x 30 cm', Color_Body: 'Brass', Voltage: '220-240V', Lumens: '1200', Color_Temperature: '3000K', Type_of_Bulb: 'G9',
      Forecast_Delivery: hasSupplier ? iso(remaining + 10) : '', Forecast_Window: hasSupplier ? `${short(remaining + 8)} – ${short(remaining + 12)}` : '',
      Forecast_Status: hasSupplier ? (delay === 'Delayed' ? 'Delayed' : delay === 'At Risk' ? 'At Risk' : 'On Track') : '',
    });
    PR[no] = { id, no, so, c, item, qty, sup, mode, ago, stage, po, supplierTarget, targetDelivery, production, lead, remaining, delay };
  });

  // Supplier-portal copies of the PRs
  const prPortal = (key, form, sfx) => {
    for (const p of Object.values(PR)) {
      if (p.sup !== key) continue;
      const it = ITEM[p.item];
      const data = {
        [`PR_No_${sfx}`]: p.no, [`Items_${sfx}`]: it.rid, [`Description1_${sfx}`]: it.name, [`PR_Date_${sfx}`]: iso(-p.ago), [`sku_${sfx}`]: it.sku, [`unit_${sfx}`]: 'pcs',
        [`Target_Delivery_${sfx}`]: p.targetDelivery, [`quantity_${sfx}`]: p.qty, [`category_${sfx}`]: it.category, [`description_${sfx}`]: it.name, [`SRP_Rate_PR_${sfx}`]: it.srp,
        [`Priority_PR_${sfx}`]: 'MEDIUM', [`Selected_Supplier_${sfx}`]: SUP[key].name, [`Selcted_Final_Cost_${sfx}`]: it.cny, [`Shipment_Mode_${sfx}`]: p.mode,
        [`Required_Days_Lead_${sfx}`]: p.lead, [`supplier_target_date_${sfx}`]: p.supplierTarget, [`Remaining_Days_${sfx}`]: p.remaining, [`Delay_Status_${sfx}`]: p.delay,
        [`Final_price_confirmed_${sfx}`]: true, [`PR_READY_FOR_PO_${sfx}`]: p.stage !== 'hold', [`PR_Approved_${sfx}`]: p.stage !== 'hold', edit_counter: 0,
        Response_Status: p.stage === 'po' ? 'Selected' : 'Waiting',
        [`Supplier_Selected_${sfx}`]: [{ [`Suppliers_${sfx}`]: SUP[key].name, [`Availability_${sfx}`]: 'Confirmed', [`Final_Price_${sfx}`]: it.cny, [`Lead_Time_${sfx}`]: `${Math.round(p.lead / 7)} weeks`, [`Status_${sfx}`]: 'Active', [`Selected_${sfx}`]: true }],
      };
      add(form, data);
    }
  };
  prPortal('tony', 'Tony_Fan_Purchase_Request', 'Supplier2');
  prPortal('fenteng', 'Fenteng_Lighting_Purchase_Request', 'Supplier1');

  // ---------- Purchase Orders ----------
  // [no, supplier, status, daysAgoSent]
  const poDefs = [
    ['PO-0001', 'fenteng', 'Confirmed by Supplier', 12], ['PO-0002', 'tony', 'Confirmed by Supplier', 28], ['PO-0003', 'guzhen', 'Draft', null],
    ['PO-0004', 'zhongshan', 'Confirmed by Supplier', 58], ['PO-0005', 'tony', 'Confirmed by Supplier', 20],
  ];
  const PO = {};
  for (const [no, sup, status, sent] of poDefs) {
    const lines = Object.values(PR).filter((p) => p.po === no);
    const first = lines[0], s = SUP[sup];
    const total = lines.reduce((a, p) => a + ITEM[p.item].cny * p.qty, 0);
    const mixed = new Set(lines.map((p) => p.mode)).size > 1;
    const poLines = lines.map((p) => {
      const it = ITEM[p.item];
      return { Supplier: s.name, PR_No: p.no, Item: it.name, Production_Date: p.production, SKU: it.sku, QTY: p.qty, Unit: 'pcs', Final_Price: it.cny, SRP_Rate_PO: it.srp,
        Line_Total: it.cny * p.qty, Target_Delivery: p.targetDelivery, supplier_target_date: p.supplierTarget, Shipping_Mode: p.mode, Delay_Status: p.delay,
        Required_Days_Lead: p.lead, Remaining_Days: p.remaining, Priority: 'MEDIUM', Followed_Recommendation: 'Yes', Override_Reason: '' };
    });
    const id = add('Purchase_Order', {
      Books_PO_ID: status === 'Draft' ? '' : `mock-po-${no}`, PO_No: no, SO_No: SO[first.so].rid, Total_PO_Value: total, Total_Lines: lines.length, Supplier_Load_At_PO: Math.round((s.active / s.max) * 100) / 100,
      Mixed_Shipping: mixed, Is_Locked: status !== 'Draft', Books_PO_No: status === 'Draft' ? '' : `BPO-${no.slice(3)}`, PO_Date: iso(-(sent ?? 3) - 1), Customer: CUST[first.c].name,
      Customer_Type: CUST[first.c].type, Sales_Owner: 'HC Sales 1', Notes: '', SRP_Rate: ITEM[first.item].srp, PO_Status: status,
      Sent_On: sent == null ? '' : stamp(-sent, 10, 15), Acknowledge_On: status === 'Confirmed by Supplier' ? stamp(-sent + 1, 16, 40) : '', Completed_On: '',
      PO_Line_Items: poLines,
    });
    PO[no] = { id, no, sup, lines, total, sent, status };
  }
  // Supplier portal copies (Tony Fan = Supplier2, Fenteng = Supplier1)
  for (const po of Object.values(PO)) {
    if (po.status === 'Draft') continue;
    if (po.sup === 'tony') add('Tony_Fan_Purchase_Order', {
      PO_No_Supplier2: po.no, PO_Date_Supplier2: iso(-po.sent), Total_PO_Value_Supplier2: po.total, Total_Lines_Supplier2: po.lines.length, PO_Status_Supplier2: 'Confirmed',
      Sent_On_Supplier2: stamp(-po.sent, 10, 15), Acknowledge_On_Supplier2: stamp(-po.sent + 1, 16, 40),
      PO_Line_Items_Supplier2: po.lines.map((p) => ({ Supplier_Supplier2: 'Tony Fan', PR_No_Supplier2: p.no, Item_Supplier2: ITEM[p.item].name, SKU_Supplier2: ITEM[p.item].sku, QTY_Supplier2: p.qty,
        Unit_Supplier2: 'pcs', Final_Price_Supplier2: ITEM[p.item].cny, Line_Total_Supplier2: ITEM[p.item].cny * p.qty, Target_Delivery_Supplier2: p.targetDelivery, Shipping_Mode_Supplier2: p.mode })),
    });
    if (po.sup === 'fenteng') add('Fenteng_Lighting_Purchase_Order', {
      PO_No_Supplier1: po.no, PO_Date_Supplier1: iso(-po.sent), Total_PO_Value_Supplier1: po.total, Total_Lines_Supplier1: po.lines.length, PO_Status_Supplier1: 'Confirmed',
      Sent_On_Supplier1: stamp(-po.sent, 10, 15), Acknowledge_On_Supplier1: stamp(-po.sent + 1, 16, 40),
      PO_Line_Items_Supplier1: po.lines.map((p) => ({ Supplier_Supplier1: 'Fenteng Lighting', PR_No_Supplier1: p.no, Item_Supplier1: ITEM[p.item].name, SKU_Supplier1: ITEM[p.item].sku, QTY_Supplier1: p.qty,
        Unit_Supplier1: 'pcs', Final_Price_Supplier1: ITEM[p.item].cny, Line_Total_Supplier1: ITEM[p.item].cny * p.qty, Target_Delivery_Supplier1: p.targetDelivery, Shipping_Mode_Supplier1: p.mode })),
    });
  }

  // ---------- Shipments ----------
  // [no, PO, status, risk, etdDaysAgo, etaFromToday, arrivalFromToday|null]
  const shipDefs = [
    ['SHP-0001', 'PO-0001', 'In Transit', 'On Track', 9, 16, null],
    ['SHP-0002', 'PO-0002', 'Delivered', 'On Track', 14, -6, -6],
    ['SHP-0003', 'PO-0004', 'Delivered', 'On Track', 52, -17, -16],
    ['SHP-0004', 'PO-0005', 'Delayed', 'Delayed', 12, -2, null],
  ];
  const SHIP = {};
  for (const [no, poNo, status, risk, etdAgo, eta, arrival] of shipDefs) {
    const po = PO[poNo], first = po.lines[0];
    const delivered = status === 'Delivered', done = delivered;
    const lines = po.lines.map((p) => ({ PR_No: p.no, SKU: ITEM[p.item].sku, Item_Name: ITEM[p.item].name, Ordered_QTY: p.qty, Shipment_QTY: p.qty, Remaining_QTY: 0,
      Shipping_Mode: p.mode, Shipment_Mode_When_Received: done ? p.mode : '', Line_Status: done ? 'Received' : 'In Transit', Fully_Shipped: true }));
    const id = add('Shipments', {
      Shipment_No: no, Customer: CUST[first.c].name, Target_Date: first.targetDelivery, ETD: iso(-etdAgo), Risk_Status: risk, Shipment_Days: first.lead, Sales_Owner: 'HC Sales 1',
      Need_Attention1: status === 'Delayed', Source_Module: 'Shipments', PO_No: po.id, Supplier: SUP[po.sup].name, Production_Date: first.production, Required_Days_Lead: first.lead,
      ETA: iso(eta), Receiving_Record_Created: delivered, Need_Attention: status === 'Delayed', Estimated_Warehouse_Arrival: iso(eta + 4), Sales_Order: first.so,
      Shipment_Status: status, Remaining_Days: Math.max(eta, 0), Arrival_Date: arrival == null ? '' : iso(arrival), Notes: status === 'Delayed' ? 'Vessel rolled over at origin port; new ETA pending from supplier.' : '',
      Supplier_Target_Date: first.supplierTarget, Ship_Out_Date: iso(-etdAgo), PO_Shipments: lines,
      Supplier_Shipment_Details: po.lines.map((p) => ({ Shipment_ID: no, SO_No: p.so, PR_No: p.no, RR_No: '', SKU: ITEM[p.item].sku, Item_Name: ITEM[p.item].name, Date_Shipped: iso(-etdAgo), Shipment_Mode: p.mode, Status: delivered ? 'Arrived' : 'In Transit' })),
      Forecast_Delivery: iso(eta + 8), Forecast_Window: `${short(eta + 6)} – ${short(eta + 10)}`, Forecast_Status: status === 'Delayed' ? 'Delayed' : delivered ? 'Delivered' : 'On Track',
    });
    SHIP[no] = { id, no, po, status, lines: po.lines, arrival, etdAgo };
    const portalForm = po.sup === 'tony' ? 'Tony_Shipment' : po.sup === 'fenteng' ? 'Fenteng_Shipment' : null;
    if (portalForm) add(portalForm, {
      Shipment_No: no, Added_User1: SUP[po.sup].name, Parent_Shipment_ID: id,
      [po.sup === 'tony' ? 'Supplier2_Shipment_Details' : 'Supplier1_Shipment_Details']: po.lines.map((p) => ({
        Select_To_Ship: true, SKU: ITEM[p.item].sku, Item_Name: ITEM[p.item].name, PR_No: p.no, RR_No: '', Date_Shipped: iso(-etdAgo), Shipment_Mode: p.mode, Synced: true, Status: delivered ? 'Arrived' : 'In Transit' })),
    });
  }

  // ---------- Receiving ----------
  const rcvDefs = [
    ['RCV-0001', 'SHP-0002', 'Partial Received', { 'PR-0004': { acc: 1, dmg: 1 }, 'PR-0005': { acc: 2 } }],
    ['RCV-0002', 'SHP-0003', 'Received', { 'PR-0007': { acc: 6 } }],
  ];
  const RCV = {};
  for (const [no, shipNo, status, result] of rcvDefs) {
    const sh = SHIP[shipNo], po = sh.po, first = po.lines[0];
    let exp = 0, acc = 0, dmg = 0, missing = 0, incomplete = 0;
    const lines = po.lines.map((p) => {
      const r = result[p.no] || {};
      const a = r.acc ?? 0, d = r.dmg ?? 0, m = r.miss ?? 0, complete = a === p.qty && !d && !m;
      exp += p.qty; acc += a; dmg += d; missing += m; if (!complete) incomplete++;
      return { PR_No: p.no, RR_No: '', SKU: ITEM[p.item].sku, Single_Line: `${p.no}|${ITEM[p.item].sku}`, Item_Name: ITEM[p.item].name, Expected_Qty: p.qty, Accepted_Qty: a, Damage_Qty: d, Missing_Qty: m,
        Bin_location: 'Receiving Area', Shipment_Mode_When_Received: p.mode, Line_Result: complete ? 'Complete' : 'Incomplete', Has_Exceptions: !!(d || m), Ready_for_Fulfillment: complete,
        Label_Ready: complete, Label_Printed: complete };
    });
    const damaged = lines.filter((l) => l.Damage_Qty);
    const id = add('Receiving', {
      Receive_No1: no, SO_No: first.so, PO_No: po.no, Sales_Owner: 'HC Sales 1', Shipments: sh.id, Customer_Name: CUST[first.c].name, Supplier: SUP[po.sup].name,
      Books_Receive_No: `BRC-${no.slice(4)}`, Receive_Status: status, Received_Date: iso(sh.arrival + 1), Warehouse: 'Main Warehouse', Books_Receive_ID: `mock-rcv-${no}`, Source_Module: 'Receiving',
      Exception_Number: damaged.length ? 'EXC-0001' : '', Total_Expected_Qty: exp, Total_Missing_Qty: missing, Total_Lines: lines.length, Total_Accepted_Qty: acc, Total_Damage_Qty: dmg,
      Incomplete_Lines: incomplete, Ready_for_Fulfillment1: lines.filter((l) => l.Ready_for_Fulfillment).reduce((s, l) => s + l.Accepted_Qty, 0), Exception_Count: damaged.length,
      Receiving_Line_Items: lines,
      SKU_Receive_History: lines.map((l) => ({ Item: l.Item_Name, SKU: l.SKU, Item_QTY: l.Accepted_Qty, Receive_Count: 1, Books_Receive_No: `BRC-${no.slice(4)}`, Books_Receive_ID: `mock-rcv-${no}` })),
      Damage_Missing_Details: damaged.map((l) => ({ PR_No: l.PR_No, SKU: l.SKU, Qty: l.Damage_Qty, Type_field: 'Damage', Damage_Missing_Category: 'Whole Fixture', Root_Cause_Category: 'Shipping Damage',
        Description: 'Two crystal arms snapped inside the carton; outer box crushed at one corner.', Action_Required: 'Replace Whole Unit', Repairable: 'No' })),
      Receiving_Notes: damaged.length ? 'Photos taken at the dock. 1 of 2 chandeliers damaged.' : 'All cartons intact.', Create_Exception_Requested: damaged.length > 0,
      Forecast_Delivery: iso(sh.arrival + 4), Forecast_Window: `${short(sh.arrival + 2)} – ${short(sh.arrival + 6)}`, Forecast_Status: 'Received',
    });
    RCV[no] = { id, no, sh, po, first };
  }

  // ---------- Exceptions and replacement requests ----------

  add('Exceptions', {
    Exception_No: 'EXC-0001', Exception_Status: 'Open', Priority: 'High', Source_Module: 'Receiving', Due_Date: iso(4), Sales_Order: 'SO-24087', PO_No: 'PO-0002', Shipment_No: 'SHP-0002',
    Receive_No: 'RCV-0001', Receiving_Line_ID: 'PR-0004|LUM-CH-101',
    Product_Context1: [{ PR_No: 'PR-0004', Supplier: 'Tony Fan', SKU: 'LUM-CH-101', Item: ITEM[0].name, Category: ITEM[0].category, Qty: 1, Type_field: 'Damage', Damage_Missing_Category: 'Whole Fixture',
      Root_Cause_Category: 'Shipping Damage', Description: 'Two crystal arms snapped inside the carton.', Action_Required: 'Replace Whole Unit', Repairable: 'No', Repair_Outcome: 'Pending' }],
    Exception_Title: 'Damaged chandelier on arrival (SHP-0002)', Exception_Description: 'Crystal Orbit Chandelier arrived with broken arms. Client install date is at risk.',
    Resolution_Action: '', Impact_Type: 'Damage + Delay', Delay_Impact: true, Fulfillment_Impact: true, Assigned_Department: 'Procurement', Assigned_To: 'HC Purchasing', Opened_On: iso(-5), Waiting_On: 'Supplier',
    Exception_Line_Key: 'RCV-0001|PR-0004|LUM-CH-101',
  });
  add('Exceptions', {
    Exception_No: 'EXC-0002', Exception_Status: 'Waiting', Priority: 'Medium', Source_Module: 'Fulfillment EXC', Due_Date: iso(7), Sales_Order: 'SO-24080', PO_No: 'PO-0004', Shipment_No: 'SHP-0003',
    Receive_No: 'RCV-0002', Product_Context1: [{ PR_No: 'PR-0007', Supplier: 'Zhongshan Lumina', SKU: 'LUM-TL-518', Item: ITEM[4].name, Category: ITEM[4].category, Qty: 1, Type_field: 'Missing', Damage_Missing_Category: 'Sparepart',
      Root_Cause_Category: 'Missing from Shipment', Description: 'One glass shade missing at pack stage.', Action_Required: 'Replace Spare Part', Repairable: 'No', Spare_Part_Type: ['Shade'] }],
    Exception_Title: 'Missing glass shade found at packing', Exception_Description: 'Packer reported 1 shade short for SO-24080. Supplier to send replacement shade.', Impact_Type: 'Delay Only',
    Delay_Impact: true, Fulfillment_Impact: true, Assigned_Department: 'Fulfillment', Assigned_To: 'HC Pack & Fulfill', Opened_On: iso(-3), Waiting_On: 'Supplier', Exception_Line_Key: 'RCV-0002|PR-0007|LUM-TL-518',
  });
  add('Exceptions', {
    Exception_No: 'EXC-0003', Exception_Status: 'Resolved', Priority: 'Low', Source_Module: 'Receiving', Due_Date: iso(-10), Sales_Order: 'SO-24080', PO_No: 'PO-0004', Shipment_No: 'SHP-0003', Receive_No: 'RCV-0002',
    Exception_Title: 'Carton label mismatch', Exception_Description: 'Box label showed a different SKU; contents verified correct by the receiver.', Resolution_Action: 'Verified contents against PO, relabelled.',
    Impact_Type: 'No Impact', Assigned_Department: 'Procurement', Assigned_To: 'HC Purchasing', Opened_On: iso(-16), Waiting_On: 'Purchasing',
  });
  const rrDef = {
    RR_No: 'RR-0001', Source_Type: 'Receiving Damage', RR_Status: 'Acknowledged', RR_Supplier: 'Tony Fan', RR_Item_Name: ITEM[0].name, Source_Module: 'Receiving', RR_Date: iso(-4), Source_Exception_No: 'EXC-0001',
    RR_Reason: 'Chandelier arms broken in transit; replace the whole unit.', RR_SKU: 'LUM-CH-101', RR_Qty_Value: 1, RR_PR_No: 'PR-0004', Shipment_Mode: 'Airfreight',
    Replacement_Summary: [{ Supplier: 'Tony Fan', RR_Reason: 'Shipping damage', SKU: 'LUM-CH-101', Item: ITEM[0].name, SO_No: 'SO-24087', PR_No: 'PR-0004', Original_PO_No: 'PO-0002', RR_Qty: 1, Priority: 'High', Delay_Status: 'On Track' }],
    Supplier_Acknowledgement1: true, Supplier_Acknowledge_Date: iso(-3), Expected_Ship_Date: iso(4), ETA: iso(13), Last_Updated: iso(-3), RR_SO: 'SO-24087', RR_Item_to_Replace: ITEM[0].name, RR_Damage_Qty: 1,
    RR_Remarks: 'Supplier will repack with extra foam.',
  };
  add('Replacement_Request', rrDef);
  add('Tony_Fan_Replacement_Request', rrDef);
  add('Replacement_Request', {
    RR_No: 'RR-0002', Source_Type: 'Receiving Missing', RR_Status: 'Open', RR_Supplier: 'Zhongshan Lumina', RR_Item_Name: ITEM[4].name, Source_Module: 'Fulfillment EXC', RR_Date: iso(-2), Source_Exception_No: 'EXC-0002',
    RR_Reason: 'One glass shade missing.', RR_SKU: 'LUM-TL-518', RR_Qty_Value: 1, RR_PR_No: 'PR-0007', Last_Updated: iso(-2), RR_SO: 'SO-24080', RR_Item_to_Replace: 'Glass shade', RR_Damage_Qty: 1, RR_Spare_Parts: '1 x shade',
    Replacement_Summary: [{ Supplier: 'Zhongshan Lumina', RR_Reason: 'Missing from shipment', SKU: 'LUM-TL-518', Item: ITEM[4].name, SO_No: 'SO-24080', PR_No: 'PR-0007', Original_PO_No: 'PO-0004', RR_Qty: 1, Priority: 'Medium', Delay_Status: 'At Risk' }],
  });

  // ---------- Forecast settings ----------
  add('Forecast_Settings', {
    Air_Transit_Min: 5, Air_Transit_Max: 10, Air_Customs_to_WH_Min: 2, Air_Customs_to_WH_Max: 4,
    LCL_Transit_Min: 20, LCL_Transit_Max: 30, LCL_Customs_to_WH_Min: 3, LCL_Customs_to_WH_Max: 5,
    FCL_Transit_Min: 25, FCL_Transit_Max: 35, FCL_Customs_to_WH_Min: 3, FCL_Customs_to_WH_Max: 5,
    Prep_Days_Thru_QC: 3, Delivery_Days: 3, Local_Transit_Days: 2, Local_Customs_Days: 1,
    Re_anchor_on_Latest_Real_Event: true, Include_Supplier_Lead_Time: true, Horizon_Weeks: 12,
  });

  // ---------- timelines and messages ----------
  const timeline = (form, noField, no, rows, actionField = 'Action_Type') => rows.forEach(([ago, type, title, changes, actor = 'HC Purchasing']) =>
    add(form, { [noField]: no, Action_Title: title, [actionField]: type, Changes: changes, Actor: actor, Logged_On: stamp(-ago, 9 + (ago % 6), 15) }));
  INQ.forEach((inq) => {
    timeline('Inquiry_Timeline', 'INQ_No', inq.no, [[inq.ago, 'Created', 'Inquiry created', `Item: ${ITEM[inq.item].name}\nCustomer: ${CUST[inq.c].name}\nQuantity: ${inq.qty} pcs`, inq.owner]]);
    if (inq.quotes.length) timeline('Inquiry_Timeline', 'INQ_No', inq.no, [[Math.max(inq.ago - 2, 0), 'Updated', 'Supplier quote updated', `${inq.quotes[0].Suppliers} · Initial price: ${inq.quotes[0].Initial_Price} CNY`]]);
    if (inq.state === 'estimate') timeline('Inquiry_Timeline', 'INQ_No', inq.no, [[Math.max(inq.ago - 5, 0), 'Estimate', 'Estimate created', 'Books estimate pushed (mock).']]);
  });
  add('Inquiry_Messages', { INQ_No: INQ[4].no, Supplier: 'Fenteng Lighting', Sender_Role: 'Buyer', Sender_Name: 'HC Purchasing', Message: 'Can you confirm stock and price for 24 pcs?', Sent_On: stamp(-6, 11, 20) });
  add('Inquiry_Messages', { INQ_No: INQ[4].no, Supplier: 'Fenteng Lighting', Sender_Role: 'Supplier', Sender_Name: 'Fenteng Sales', Message: 'We will revert tomorrow with the factory quote.', Sent_On: stamp(-6, 15, 2) });
  add('Inquiry_Internal_Messages', { INQ_No: INQ[5].no, Sender_Email: 'purchasing@homecartel.example', Sender_Role: 'HC Purchasing', Message: 'Negotiating for 5% off on 4 pcs; supplier asked for a firm order.', Sent_On: stamp(-3, 10, 5) });
  Object.values(PR).forEach((p) => timeline('PR_Timeline', 'PR_No', p.no, [[p.ago, 'Created', 'Purchase request created', `Item: ${ITEM[p.item].name}\nQuantity: ${p.qty}\nSales Order: ${p.so}`]], 'Action_Type2'));
  add('PR_Messages', { PR_No: 'PR-0004', Supplier: 'Tony Fan', Sender_Role: 'Buyer', Sender_Name: 'HC Purchasing', Message: 'Please confirm the production date for the 2 chandeliers.', Sent_On: stamp(-27, 10, 0) });
  Object.values(SHIP).forEach((s) => timeline('Shipment_Timeline', 'Shipment_No', s.no, [
    [s.etdAgo, 'Created', 'Shipment created', `PO: ${s.po.no}\nSupplier: ${SUP[s.po.sup].name}`],
    ...(s.status === 'Delivered' ? [[Math.max(-s.arrival, 0), 'Delivered', 'Shipment arrived', 'Marked as arrived at the warehouse.']] : []),
    ...(s.status === 'Delayed' ? [[2, 'Delayed', 'Shipment delayed', 'Vessel rolled over; ETA past due.']] : []),
  ]));
  Object.values(RCV).forEach((r) => timeline('Receiving_Timeline', 'Receive_No1', r.no, [[Math.max(-r.sh.arrival - 1, 0), 'Created', 'Receiving record created', `Shipment: ${r.sh.no}\nPO: ${r.po.no}`]]));
  timeline('Exception_Timeline', 'Exception_No', 'EXC-0001', [[5, 'Created', 'Exception opened', 'Damage found during receiving.'], [3, 'Updated', 'Replacement requested', 'RR-0001 created for Tony Fan.']]);
  timeline('Exception_Timeline', 'Exception_No', 'EXC-0002', [[3, 'Created', 'Exception opened', 'Shade missing at packing.']]);

  seedOps();

  return { skipped: false, tables: tableCounts() };
}

// CLI: node server/seed.mjs [--reset]
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const out = seed({ reset: process.argv.includes('--reset') });
  if (out.skipped) {
    console.log('Database already has data; nothing seeded. Run with --reset to wipe and reseed.');
  } else {
    console.log('Mock data loaded:');
    for (const t of out.tables) console.log(`  ${String(t.rows).padStart(3)}  ${t.form}`);
  }
}
