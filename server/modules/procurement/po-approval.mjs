// "Create PO" of the Purchase Request page, ported from zoho-export/parsed/functions:
//   approvePOMain      (custom API approve_po_main)    the approved PRs of one sales order become lines of the PURCHASE ORDER
//   approvePOTony / approvePOFenteng (approve_po_tony / approve_po_fenteng)
//                      the same lines go to the supplier's own copy of the PO, the shipment is made, and the Receiving record
//   approvePOHC        (Approve_P_O_H_C)               the local (HC System) POs: shipment + Receiving, PO Confirmed
// Not ported: the second half of the Tony / Fenteng functions, which books the PO in Zoho Books (on hold). Everything before it is here.
// The handlers write with the raw store (no workflow hooks), as the Deluge functions do, so the totals, numbers and dates are worked
// out here, in the same order as the scripts.
//
// "Once only": a PR that is already approved is not picked up again, a line (PR_No) is never added twice to a PO, to the supplier copy,
// to a shipment or to a Receiving record, and a supplier copy / shipment / Receiving record is found again, never duplicated.
import { portalOf } from '../../workflows/suppliers.mjs';
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
// Moved to po-create.mjs (spec v1.4: the feasibility gate, one PO = one supplier + one mode).
import { approvePOMain } from './po-create.mjs';
export { approvePOMain };

// ---------------- approvePOTony / approvePOFenteng ----------------
export const SUPPLIER = {
  Tony: { name: 'Tony Fan', copy: 'Tony_Fan_Purchase_Order', sfx: '_Supplier2', ship: 'Tony_Shipment', grid: 'Supplier2_Shipment_Details' },
  Fenteng: { name: 'Fenteng Lighting', copy: 'Fenteng_Lighting_Purchase_Order', sfx: '_Supplier1', ship: 'Fenteng_Shipment', grid: 'Supplier1_Shipment_Details' },
};

// Totals / status of a Receiving record from its lines (Receiving_Compute_Totals + Set_Line_Result + Set_Receive_Status).
export function receivingTotals(lines) {
  const n = (v) => (blank(v) ? 0 : toNum(v));
  const out = lines.map((l) => ({ ...l }));
  let exp = 0, acc = 0, dmg = 0, mis = 0, incomplete = 0, ready = 0;
  for (const l of out) {
    exp += n(l.Expected_Qty); acc += n(l.Accepted_Qty); dmg += n(l.Damage_Qty); mis += n(l.Missing_Qty);
    const complete = n(l.Accepted_Qty) + n(l.Damage_Qty) + n(l.Missing_Qty) === n(l.Expected_Qty) && n(l.Accepted_Qty) === n(l.Expected_Qty);
    const binned = text(l.Bin_location).trim() !== '' && text(l.Bin_location).trim() !== 'Receiving Area'; // spec D12: ready = counted AND binned
    l.Line_Result = complete ? 'Complete' : 'Incomplete'; l.Ready_for_Fulfillment = complete && binned;
    if (complete && binned) ready++; else incomplete++;
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
    if (portalOf(supplier)?.name !== S.name) continue;
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
    // spec SP-R1: the supplier sees "our PO price to them", never a customer price. Item_Price used to be our SRP, then the catalog rate;
    // it is now the supplier's own price of the line (the same number as Final_Price). Nothing reads it back on the buyer's side.
    const itemPrice = rate;
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
    shipPatch.Required_Days_Lead = ln.Required_Days_Lead; shipPatch.Remaining_Days = ln.Remaining_Days;
    // a PO can carry several Sales Orders (spec PO-R4): the shipment takes the EARLIEST target
    if (!blank(ln.Target_Delivery) && (blank(shipPatch.Target_Date) || text(ln.Target_Delivery) < text(shipPatch.Target_Date))) shipPatch.Target_Date = ln.Target_Delivery;
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
  { // spec v1.4: the planned dates (PO date + 1 + production + ...), the order date and the rank are set now, not at the next scoring
    const st = await import('./ship-track.mjs'), pl = await import('./plan.mjs');
    const fresh = await store.getRecordById('Shipments', ship.ID, { raw: true });
    const plan = await st.planPatch(store, fresh, await pl.loadSettings(store));
    if (Object.keys(plan).length) await store.updateRecord('Shipments', ship.ID, plan, { byForm: true });
    await st.rescoreShipments(store);
  }
  if (isNewShipment && S.ship) { // HC System (local) has no supplier copy of the shipment
    await store.addRecord(S.ship, {
      Shipment_No: ship.Shipment_No, Parent_Shipment_ID: String(ship.ID),
      [S.grid]: shipLines.map((l) => ({ SKU: l.SKU, Item_Name: l.Item_Name, PR_No: l.PR_No, RR_No: '' })),
    }, ctx.user);
    await (await import('./ship-track.mjs')).refreshSupplierView(store, ship.ID); // the Production screen of the supplier portal
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

// ---------------- approvePOHC (custom API Approve_P_O_H_C): the local (HC System) POs ----------------
// Every PO linked to an approved Local PR of the sales order gets its shipment (a Pending one is re-used) and its Receiving record,
// with the lines that are not there yet, and the PO becomes Confirmed. No supplier copy: HC System is our own sourcing.
export async function approvePOHC({ soNo }, store, ctx = {}) {
  soNo = text(soNo);
  if (soNo === '') return fail('soNo is required.');
  const prs = await store.find(PR, (p) => text(p.Sales_Order) === soNo && truthy(p.PR_Approved) && text(p.Link_PO_No) !== '' && text(p.Sourcing_Type) === 'Local', { criteria: crit('Sales_Order', soNo) });
  let processed = 0;
  for (const poNo of [...new Set(prs.map((p) => text(p.Link_PO_No)))]) {
    const [apo] = await store.find(PO, (p) => text(p.PO_No) === poNo, { criteria: crit('PO_No', poNo) });
    if (!apo) continue; // Zoho would stop with an error on a missing PO; here it is skipped
    await shipmentAndReceivingFor(store, ctx, { name: 'HC System' }, poNo);
    await store.updateRecord(PO, apo.ID, { PO_Status: 'Confirmed' }, { byForm: true });
    processed++;
  }
  return { status: 'success', processed, message: `${processed} HC System PO(s) synced` };
}

export const Approve_P_O_H_C = (payload, store, ctx) => approvePOHC(payload || {}, store, ctx);
export const approve_po_main = (payload, store, ctx) => approvePOMain(payload || {}, store, ctx);
export const approve_po_tony = (payload, store, ctx) => approveSupplierPO('Tony', payload || {}, store, ctx);
export const approve_po_fenteng = (payload, store, ctx) => approveSupplierPO('Fenteng', payload || {}, store, ctx);
