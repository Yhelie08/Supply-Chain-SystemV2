// "Create PO" of the Purchase Request page, ported from zoho-export/parsed/functions:
//   approvePOMain      (custom API approve_po_main)    the approved PRs of one sales order become lines of the PURCHASE ORDER
//   approvePOTony / approvePOFenteng (approve_po_tony / approve_po_fenteng)
//                      the same lines go to the supplier's own copy of the PO, the shipment is made, and the Receiving record
// Not ported: the second half of the Tony / Fenteng functions, which books the PO in Zoho Books (on hold). Everything before it is here.
// The handlers write with the raw store (no workflow hooks), as the Deluge functions do, so the totals, numbers and dates are worked
// out here, in the same order as the scripts.
//
// "Once only": a PR that is already approved is not picked up again, a line (PR_No) is never added twice to a PO, to the supplier copy,
// to a shipment or to a Receiving record, and a supplier copy / shipment / Receiving record is found again, never duplicated.
import { ok, fail } from '../../custom-api-helpers.mjs';
import { blank, idOf, truthy, toNum, todayDate, ymd } from '../../workflows/deluge.mjs';
import { zohoNow } from '../../criteria.mjs';
import { nextNumber } from './purchase-order.mjs';

const PO = 'Purchase_Order';
const PR = 'Purchase_Request1';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const today = () => ymd(todayDate());
const crit = (field, value) => `(${field} == "${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
const round0 = (v) => Math.round(toNum(v));
const sameSupplier = (a, b) => a === b || (a !== '' && b !== '' && (a.includes(b) || b.includes(a)));

async function byId(store, form, ref) {
  const id = idOf(ref);
  if (id === '') return null;
  try { return await store.getRecordById(form, id, { raw: true }); } catch { return null; }
}
// A Name-type field comes back as a text or as { first_name, last_name }.
const nameOf = (v) => (v && typeof v === 'object' ? text(v.first_name) || text(v.zc_display_value) || text(v.display_value) : text(v));

// The sales order's number for a PO (SO_No is a lookup to Sales_Order).
async function soNumberOf(store, po) { return text((await byId(store, 'Sales_Order', po.SO_No))?.Sales_Order_Number); }

// ---------------- approvePOMain ----------------
export async function approvePOMain({ soNo }, store, ctx = {}) {
  soNo = text(soNo);
  if (soNo === '') return fail('soNo is required.');
  const prs = await store.find(PR, (p) => text(p.Sales_Order) === soNo && !truthy(p.PR_Approved) && truthy(p.PR_READY_FOR_PO), { criteria: crit('Sales_Order', soNo) });
  let approved = '', skipped = '';
  for (const pr of prs) {
    if (text(pr.Hold_Status) === 'On Hold' || text(pr.Hold_Status) === 'Cancelled') { skipped += `${pr.PR_No} (${pr.Hold_Status}), `; continue; }
    if (text(pr.Followed_Recommendation) === 'No' && text(pr.Override_Reason) === '') { skipped += `${pr.PR_No}, `; continue; }
    const supplier = text(pr.Selected_Supplier);
    const customer = await byId(store, 'Customer', pr.Customer);
    const item = await byId(store, 'Items', pr.Items);

    // the open PO of this sales order that already has a line for this supplier, else a new Draft PO
    let target = null;
    for (const po of await store.find(PO, (p) => text(p.PO_Status) !== 'Completed')) {
      if ((await soNumberOf(store, po)) !== text(pr.Sales_Order)) continue;
      if ((po.PO_Line_Items || []).some((ln) => sameSupplier(text(ln.Supplier), supplier))) target = po;
    }
    const patch = {};
    if (!target) {
      const [so] = await store.find('Sales_Order', (s) => text(s.Sales_Order_Number) === text(pr.Sales_Order), { criteria: crit('Sales_Order_Number', pr.Sales_Order) });
      const soId = so ? so.ID : await store.addRecord('Sales_Order', { Sales_Order_Number: pr.Sales_Order }, ctx.user);
      const id = await store.addRecord(PO, {
        PO_No: await nextNumber(store, PO, 'PO_No', 'PO'), Customer: text(customer?.customer_name), Customer_Type: pr.Customer_Type, Sales_Owner: pr.Sales_Owner,
        PO_Date: today(), PO_Status: 'Draft', SO_No: soId,
      }, ctx.user);
      target = await store.getRecordById(PO, id, { raw: true });
    }
    if ((target.PO_Line_Items || []).some((ln) => text(ln.PR_No) === text(pr.PR_No))) {
      await store.updateRecord(PR, pr.ID, { PR_Status: 'Converted to PO', Link_PO_No: target.PO_No, PR_Approved: true }, { byForm: true });
      approved += `${pr.PR_No} -> ${target.PO_No}; `;
      continue;
    }
    patch.Sales_Owner = pr.Sales_Owner;
    const rate = blank(pr.Selcted_Final_Cost) ? 0 : toNum(pr.Selcted_Final_Cost);
    const qty = round0(pr.quantity);
    const line = {
      PR_No: pr.PR_No, Supplier: supplier, Item: text(item?.item_name), SKU: pr.sku, QTY: qty, Unit: pr.unit, Final_Price: rate, Line_Total: qty * round0(rate),
      Shipping_Mode: pr.Shipment_Mode, Target_Delivery: pr.Target_Delivery, supplier_target_date: pr.supplier_target_date, Delay_Status: pr.Delay_Status,
      Required_Days_Lead: pr.Required_Days_Lead, Remaining_Days: pr.Remaining_Days, Followed_Recommendation: pr.Followed_Recommendation,
      Override_Reason: pr.Override_Reason, Priority: pr.Priority, Production_Date: today(),
    };
    if (item && toNum(item.Rate) !== 0) { line.SRP_Rate_PO = round0(item.Rate); patch.SRP_Rate = round0(item.Rate); }
    if (item && !blank(item.Image)) line.Item_Image = item.Image;
    const lines = [...(target.PO_Line_Items || []), line];
    patch.PO_Line_Items = lines;
    patch.Total_PO_Value = lines.reduce((s, l) => s + (blank(l.Line_Total) ? 0 : toNum(l.Line_Total)), 0);
    patch.Total_Lines = lines.length;
    patch.Sent_On = zohoNow();
    patch.Is_Locked = true;

    // the supplier's load: how many open PO lines it has now
    const suppliers = await store.find('Suppliers');
    const mine = suppliers.find((s) => { const n = nameOf(s.Supplier_Name); return n === supplier || n.includes(supplier) || supplier.includes(n); });
    patch.Supplier_Load_At_PO = mine ? toNum(mine.Active_PO_Count) : 0;
    await store.updateRecord(PO, target.ID, patch, { byForm: true });
    await store.updateRecord(PR, pr.ID, { PR_Status: 'Converted to PO', Link_PO_No: target.PO_No, Production_Date: today() }, { byForm: true });
    if (mine) {
      let active = 0;
      for (const po of await store.find(PO, (p) => text(p.PO_Status) !== 'Completed' && text(p.PO_Status) !== 'Cancelled')) {
        for (const ln of po.PO_Line_Items || []) { const s = text(ln.Supplier); if (s === supplier || s.includes(supplier) || supplier.includes(s)) active++; }
      }
      await store.updateRecord('Suppliers', mine.ID, { Active_PO_Count: active }, { byForm: true });
    }
    await store.updateRecord(PR, pr.ID, { Last_Update: zohoNow(), PR_Approved: true }, { byForm: true });
    approved += `${pr.PR_No} -> ${target.PO_No}; `;
  }
  if (approved === '' && skipped === '') return { status: 'empty', message: `No eligible PRs found for SO ${soNo}` };
  return ok(`Approved: ${approved}` + (skipped !== '' ? ` | Skipped (needs Override Reason, or On Hold/Cancelled): ${skipped}` : ''));
}

// ---------------- approvePOTony / approvePOFenteng ----------------
export const SUPPLIER = {
  Tony: { name: 'Tony', copy: 'Tony_Fan_Purchase_Order', sfx: '_Supplier2', ship: 'Tony_Shipment', grid: 'Supplier2_Shipment_Details' },
  Fenteng: { name: 'Fenteng', copy: 'Fenteng_Lighting_Purchase_Order', sfx: '_Supplier1', ship: 'Fenteng_Shipment', grid: 'Supplier1_Shipment_Details' },
};

// Totals / status of a Receiving record from its lines (Receiving_Compute_Totals + Set_Line_Result + Set_Receive_Status).
export function receivingTotals(lines) {
  const n = (v) => (blank(v) ? 0 : toNum(v));
  const out = lines.map((l) => ({ ...l }));
  let exp = 0, acc = 0, dmg = 0, mis = 0, incomplete = 0, ready = 0;
  for (const l of out) {
    exp += n(l.Expected_Qty); acc += n(l.Accepted_Qty); dmg += n(l.Damage_Qty); mis += n(l.Missing_Qty);
    const complete = n(l.Accepted_Qty) + n(l.Damage_Qty) + n(l.Missing_Qty) === n(l.Expected_Qty) && n(l.Accepted_Qty) === n(l.Expected_Qty);
    l.Line_Result = complete ? 'Complete' : 'Incomplete'; l.Ready_for_Fulfillment = complete;
    if (complete) ready++; else incomplete++;
  }
  const status = out.length === 0 || (acc === 0 && dmg === 0 && mis === 0) ? 'Pending' : incomplete === 0 ? 'Received' : 'Partial Received';
  return { lines: out, totals: { Total_Expected_Qty: exp, Total_Accepted_Qty: acc, Total_Damage_Qty: dmg, Total_Missing_Qty: mis, Total_Lines: out.length, Incomplete_Lines: incomplete, Ready_for_Fulfillment1: ready, Receive_Status: status } };
}

export async function approveSupplierPO(key, { soNo }, store, ctx = {}) {
  const S = SUPPLIER[key];
  const f = (n) => `${n}${S.sfx}`;
  soNo = text(soNo);
  if (soNo === '') return fail('soNo is required.');
  let processed = 0;
  const touched = [];
  const prs = await store.find(PR, (p) => text(p.Sales_Order) === soNo && truthy(p.PR_Approved) && text(p.Link_PO_No) !== '', { criteria: crit('Sales_Order', soNo) });
  for (const pr of prs) {
    const supplier = text(pr.Selected_Supplier);
    if (!supplier.includes(S.name)) continue;
    const item = await byId(store, 'Items', pr.Items);
    const poNo = text(pr.Link_PO_No);
    let [copy] = await store.find(S.copy, (c) => text(c[f('PO_No')]) === poNo, { criteria: crit(f('PO_No'), poNo) });
    if (!copy) {
      const id = await store.addRecord(S.copy, { [f('PO_No')]: poNo, [f('PO_Date')]: today(), [f('PO_Status')]: 'Draft' }, ctx.user);
      copy = await store.getRecordById(S.copy, id, { raw: true });
    }
    const note = () => { if (!touched.includes(copy[f('PO_No')])) touched.push(copy[f('PO_No')]); };
    if ((copy[f('PO_Line_Items')] || []).some((ln) => text(ln[f('PR_No')]) === text(pr.PR_No))) { note(); continue; }
    const rate = blank(pr.Selcted_Final_Cost) ? 0 : toNum(pr.Selcted_Final_Cost);
    let itemPrice = 0;
    if (!blank(pr.SRP_Approved_PR) && toNum(pr.SRP_Approved_PR) !== 0) itemPrice = toNum(pr.SRP_Approved_PR);
    else if (!blank(pr.SRP_Rate_PR) && toNum(pr.SRP_Rate_PR) !== 0) itemPrice = toNum(pr.SRP_Rate_PR);
    else if (item && toNum(item.Rate) !== 0) itemPrice = toNum(item.Rate);
    const qty = round0(pr.quantity);
    const line = {
      [f('PR_No')]: pr.PR_No, [f('Supplier')]: supplier, [f('Item')]: text(item?.item_name), [f('SKU')]: pr.sku, [f('QTY')]: qty, [f('Unit')]: pr.unit,
      [f('Final_Price')]: rate, [f('Item_Price')]: String(itemPrice), [f('Line_Total')]: qty * round0(rate), [f('Shipping_Mode')]: pr.Shipment_Mode,
      [f('Target_Delivery')]: pr.Target_Delivery, [f('supplier_target_date')]: pr.supplier_target_date, [f('Delay_Status')]: pr.Delay_Status,
      [f('Followed_Recommendation')]: pr.Followed_Recommendation, [f('Override_Reason')]: pr.Override_Reason,
    };
    const lines = [...(copy[f('PO_Line_Items')] || []), line];
    await store.updateRecord(S.copy, copy.ID, {
      [f('PO_Line_Items')]: lines, [f('Total_PO_Value')]: lines.reduce((s, l) => s + (blank(l[f('Line_Total')]) ? 0 : toNum(l[f('Line_Total')])), 0),
      [f('Total_Lines')]: lines.length, [f('Sent_On')]: zohoNow(), [f('Is_Locked')]: true,
    }, { byForm: true });
    copy = await store.getRecordById(S.copy, copy.ID, { raw: true });
    processed++;
    note();
  }

  // for each supplier PO touched: its shipment (a Pending one of the PO is re-used) and the Receiving record, lines added once
  for (const poNo of touched) await shipmentAndReceivingFor(store, ctx, S, poNo);
  return { status: 'success', processed, message: `${processed} ${S.name} line(s) synced` };
}


// The shipment of a supplier PO (a Pending one is re-used, else a new one + the supplier's copy of it) and its Receiving record, with the lines
// that are not there yet. Safe to run again: nothing is added twice. `shipExtra` = fields to put on the shipment (ETD / ETA).
export async function shipmentAndReceivingFor(store, ctx, S, poNo, shipExtra = {}) {
  const [apo] = await store.find(PO, (p) => text(p.PO_No) === poNo, { criteria: crit('PO_No', poNo) });
  if (!apo) return;
  const soText = await soNumberOf(store, apo);
  let [ship] = await store.find('Shipments', (s) => idOf(s.PO_No) === String(apo.ID) && text(s.Shipment_Status) === 'Pending', { criteria: crit('Shipment_Status', 'Pending') });
  let isNewShipment = false;
  if (!ship) {
    const id = await store.addRecord('Shipments', {
      Shipment_No: await nextNumber(store, 'Shipments', 'Shipment_No', 'SHP'), PO_No: apo.ID, Sales_Order: soText, Customer: apo.Customer, Supplier: S.name, Shipment_Status: 'Pending',
    }, ctx.user);
    ship = await store.getRecordById('Shipments', id, { raw: true });
    isNewShipment = true;
  }
  const shipPatch = { ...shipExtra };
  const shipLines = (ship.PO_Shipments || []).map((l) => ({ ...l }));
  for (const ln of apo.PO_Line_Items || []) {
    shipPatch.Required_Days_Lead = ln.Required_Days_Lead; shipPatch.Remaining_Days = ln.Remaining_Days; shipPatch.Target_Date = ln.Target_Delivery;
    shipPatch.Supplier_Target_Date = ln.supplier_target_date; shipPatch.Production_Date = ln.Production_Date;
    if (text(ln.PR_No) !== '') {
      const [prLine] = await store.find(PR, (p) => text(p.PR_No) === text(ln.PR_No), { criteria: crit('PR_No', ln.PR_No) });
      if (prLine) { shipPatch.Shipment_Days = prLine.Shipment_Days; shipPatch.Sales_Owner = prLine.Sales_Owner; }
    } else shipPatch.Sales_Owner = apo.Sales_Owner;
    if (!shipLines.some((l) => text(l.PR_No) === text(ln.PR_No))) {
      shipLines.push({ PR_No: ln.PR_No, SKU: ln.SKU, Item_Name: ln.Item, Ordered_QTY: ln.QTY, Shipment_QTY: ln.QTY, Remaining_QTY: ln.QTY, Shipping_Mode: ln.Shipping_Mode });
    }
  }
  await store.updateRecord('Shipments', ship.ID, { ...shipPatch, PO_Shipments: shipLines }, { byForm: true });
  if (isNewShipment) {
    await store.addRecord(S.ship, {
      Shipment_No: ship.Shipment_No, Parent_Shipment_ID: String(ship.ID),
      [S.grid]: shipLines.map((l) => ({ SKU: l.SKU, Item_Name: l.Item_Name, PR_No: l.PR_No, RR_No: '' })),
    }, ctx.user);
  }

  let [rcv] = await store.find('Receiving', (r) => idOf(r.Shipments) === String(ship.ID));
  if (!rcv) {
    const id = await store.addRecord('Receiving', {
      Receive_No1: await nextNumber(store, 'Receiving', 'Receive_No1', 'RCV'), Shipments: ship.ID, SO_No: soText, PO_No: apo.PO_No, Customer_Name: apo.Customer, Supplier: S.name,
    }, ctx.user);
    rcv = await store.getRecordById('Receiving', id, { raw: true });
  }
  const rcvLines = (rcv.Receiving_Line_Items || []).map((l) => ({ ...l }));
  const rcvPatch = {};
  for (const ln of apo.PO_Line_Items || []) {
    if (text(ln.PR_No) !== '') {
      const [prLine] = await store.find(PR, (p) => text(p.PR_No) === text(ln.PR_No), { criteria: crit('PR_No', ln.PR_No) });
      if (prLine) rcvPatch.Sales_Owner = prLine.Sales_Owner;
    } else rcvPatch.Sales_Owner = apo.Sales_Owner;
    if (!rcvLines.some((l) => text(l.PR_No) === text(ln.PR_No))) rcvLines.push({ PR_No: ln.PR_No, SKU: ln.SKU, Item_Name: ln.Item, Expected_Qty: ln.QTY });
  }
  const { lines, totals } = receivingTotals(rcvLines);
  await store.updateRecord('Receiving', rcv.ID, { ...rcvPatch, ...totals, Receiving_Line_Items: lines }, { byForm: true });
}

export const approve_po_main = (payload, store, ctx) => approvePOMain(payload || {}, store, ctx);
export const approve_po_tony = (payload, store, ctx) => approveSupplierPO('Tony', payload || {}, store, ctx);
export const approve_po_fenteng = (payload, store, ctx) => approveSupplierPO('Fenteng', payload || {}, store, ctx);
