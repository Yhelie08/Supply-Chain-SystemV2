// clone_shipment_for_replacement, ported from zoho-export/parsed/functions/cloneShipmentForReplacement.dg.
// The "Clone for Replacement" button on a Replacement_Request: logs a replacement shipment for an acknowledged RR.
// Writes go through rawStore (no workflow re-fire), so every number, line, total and date is set explicitly here,
// exactly as the Deluge does. The 2026-08-07 supplier contains() fix and the 2026-10-13 HC System (Local) branch are kept.
import { fail } from '../../custom-api-helpers.mjs';
import { idOf, blank } from '../../workflows/deluge.mjs';
import { nextNumber } from '../../workflows/numbering.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const SHIP = 'Shipments';
const RCV = 'Receiving';
const ACKNOWLEDGED = ['Acknowledged', 'In Production', 'Shipped', 'Completed'];

async function byId(data, form, ref) {
  const id = idOf(ref);
  if (id === '') return null;
  try { return await data.getRecordById(form, id, { raw: true }); } catch { return null; }
}

export async function clone_shipment_for_replacement({ rrRecordId }, data, ctx = {}) {
  const r = await byId(data, 'Replacement_Request', rrRecordId);
  if (!r) return fail('Replacement Request not found.');
  if (text(r.Cloned_Shipment_No) !== '') return fail(`A replacement shipment (${r.Cloned_Shipment_No}) was already logged for this RR.`);

  // The supplier's acknowledgement status + ship mode, read from its OWN copy of the RR (matched by RR_No).
  // contains() rather than == : RR_Supplier can be the short name or the full Suppliers-form name (2026-08-07 fix).
  const supplier = text(r.RR_Supplier);
  let supStatus = '';
  let supShipMode = '';
  if (supplier.includes('Fenteng')) {
    for (const sm of await data.find('Fenteng_Lighting_Replacement_Request', (c) => text(c.RR_No) === text(r.RR_No))) { supStatus = text(sm.RR_Status); supShipMode = text(sm.Shipment_Mode); }
  } else if (supplier.includes('Tony')) {
    for (const sm of await data.find('Tony_Fan_Replacement_Request', (c) => text(c.RR_No) === text(r.RR_No))) { supStatus = text(sm.RR_Status); supShipMode = text(sm.Shipment_Mode); }
  } else if (supplier.includes('HC System')) {
    supStatus = text(r.RR_Status); // local team acknowledges on the main record; no supplier portal, no ship mode (mirrors Zoho 2026-10-13)
  }
  if (!ACKNOWLEDGED.includes(supStatus)) {
    return fail(supplier.includes('HC System')
      ? 'This HC System (Local) RR must be Acknowledged first — open the Replacement Request widget, Local (HC System) tab, and click Acknowledge (ETA required).'
      : 'This RR must be Acknowledged by the supplier (Shipment Mode/Expected Ship Date/ETA filled on their own portal) before a replacement shipment can be logged.');
  }

  // Trace back to the original PO number: the linked Exception's PO_No, or (Fulfillment EXC) Exception_Control1 -> PR -> Link_PO_No.
  let origPONo = '';
  for (const em of await data.find('Exceptions', (e) => text(e.Exception_No) === text(r.Source_Exception_No))) origPONo = text(em.PO_No);
  if (origPONo === '' && text(r.Source_Module) === 'Fulfillment EXC') {
    let ecPrNo = '';
    for (const ecm of await data.find('Exception_Control1', (e) => text(e.Exception_Number) === text(r.Source_Exception_No))) ecPrNo = text(ecm.PR);
    if (ecPrNo !== '') for (const pr of await data.find('Purchase_Request1', (p) => text(p.PR_No) === ecPrNo)) origPONo = text(pr.Link_PO_No);
  }

  // Stock item (Fulfillment EXC, no PO ever raised): the customer comes from Sales_Order_Fulfillment, then Pre_Order_FF.
  let poFreeCustomerName = '';
  if (origPONo === '' && text(r.Source_Module) === 'Fulfillment EXC') {
    for (const sof of await data.find('Sales_Order_Fulfillment', (s) => text(s.SO_No) === text(r.RR_SO))) {
      const cust = await byId(data, 'Customer', sof.Customer); // Customer is a lookup -> its customer_name display text
      const cn = text(cust?.customer_name);
      if (cn !== '') poFreeCustomerName = cn;
    }
    if (poFreeCustomerName === '') {
      for (const pom of await data.find('Pre_Order_FF', (p) => text(p.SO) === text(r.RR_SO))) {
        const cn = text(pom.Customer_Name);
        if (cn !== '') poFreeCustomerName = cn;
      }
    }
  } else if (origPONo === '') {
    return fail('Could not trace back to the original PO — check Source_Exception_No on this RR and PO_No on the linked Exception (or PR on the linked Exception_Control1 item).');
  }

  // The original shipment to clone from: the highest-ID shipment of the original PO (IDs compared as BigInt, never Number).
  let origShip = null;
  if (origPONo !== '') {
    const origPO = (await data.find('Purchase_Order', (p) => text(p.PO_No) === origPONo)).pop();
    if (!origPO) return fail(`Could not resolve the original Purchase_Order record for ${origPONo}.`);
    for (const os of await data.find(SHIP, (s) => idOf(s.PO_No) === text(origPO.ID))) {
      if (origShip === null || BigInt(os.ID) > BigInt(origShip.ID)) origShip = os;
    }
    if (!origShip) return fail(`No existing Shipment found for PO ${origPONo} to clone from.`);
  }

  // The replacement shipment: clone the original's identity, or a fresh one for a stock item (no PO / Sales_Owner / target dates).
  const newShipFields = origShip ? {
    PO_No: origShip.PO_No, Sales_Order: origShip.Sales_Order, Customer: origShip.Customer, Supplier: r.RR_Supplier,
    Sales_Owner: origShip.Sales_Owner, Shipment_Status: 'Pending', Target_Date: origShip.Target_Date, Supplier_Target_Date: origShip.Supplier_Target_Date,
    ETD: r.Expected_Ship_Date, ETA: r.ETA, Source_Module: r.Source_Module, Exception_Number: r.Source_Exception_No,
  } : {
    Sales_Order: r.RR_SO, Customer: poFreeCustomerName, Supplier: r.RR_Supplier, Shipment_Status: 'Pending',
    ETD: r.Expected_Ship_Date, ETA: r.ETA, Source_Module: r.Source_Module, Exception_Number: r.Source_Exception_No,
  };
  const newShipID = await data.addRecord(SHIP, newShipFields, ctx.user);
  const shipmentNo = await nextNumber(data, SHIP, 'Shipment_No', 'SHP');

  // One replacement line for the RR's item; Shipping_Mode inherited from the original line (by PR_No, else the last line),
  // or the supplier's own RR-level pick for a stock item. Shipment_Mode_When_Received only for Fulfillment EXC.
  const qty = r.RR_Qty_Value;
  const newLine = { SKU: r.RR_SKU, Item_Name: r.RR_Item_Name, Shipment_QTY: qty, PR_No: r.RR_PR_No, Ordered_QTY: qty, Remaining_QTY: qty };
  if (origShip) {
    let mode = '';
    for (const ol of origShip.PO_Shipments || []) if (text(ol.PR_No) === text(r.RR_PR_No)) mode = text(ol.Shipping_Mode);
    if (mode === '') for (const ol of origShip.PO_Shipments || []) mode = text(ol.Shipping_Mode);
    if (mode !== '') newLine.Shipping_Mode = mode;
  } else if (supShipMode !== '') {
    newLine.Shipping_Mode = supShipMode;
  }
  if (text(r.Source_Module) === 'Fulfillment EXC' && supShipMode !== '') newLine.Shipment_Mode_When_Received = supShipMode;
  await data.updateRecord(SHIP, newShipID, { Shipment_No: shipmentNo, PO_Shipments: [newLine] }, { byForm: true });

  if (text(r.Source_Module) === 'Fulfillment EXC') {
    // A Fulfillment EXC replacement gets its OWN new Receiving, with the totals spelled out (a script-added record runs no workflows).
    let origRecvForIdentity = null;
    if (origPONo !== '') {
      const arr = await data.find(RCV, (x) => text(x.PO_No) === origPONo);
      if (arr.length) origRecvForIdentity = arr[arr.length - 1];
    }
    const fulfLine = { PR_No: r.RR_PR_No, SKU: r.RR_SKU, Item_Name: r.RR_Item_Name, Expected_Qty: qty };
    if (supShipMode !== '') fulfLine.Shipment_Mode_When_Received = supShipMode;
    const recvNo = await nextNumber(data, RCV, 'Receive_No1', 'RCV');
    await data.addRecord(RCV, {
      Receive_No1: recvNo, Shipments: newShipID, SO_No: text(newShipFields.Sales_Order), PO_No: origPONo,
      Customer_Name: origRecvForIdentity ? text(origRecvForIdentity.Customer_Name) : poFreeCustomerName,
      Supplier: r.RR_Supplier, Source_Module: 'Fulfillment EXC', Exception_Number: r.Source_Exception_No, Receiving_Line_Items: [fulfLine],
      Total_Expected_Qty: qty, Total_Accepted_Qty: 0, Total_Damage_Qty: 0, Total_Missing_Qty: 0,
      Total_Lines: 1, Incomplete_Lines: 1, Ready_for_Fulfillment1: 0, Receive_Status: 'Pending',
    }, ctx.user);
  } else if (origPONo !== '') {
    // Same-RCV rule: the PO's existing Receiving record is re-pointed at the replacement shipment; its lines / Expected_Qty stay put.
    for (const ex of await data.find(RCV, (x) => text(x.PO_No) === origPONo)) await data.updateRecord(RCV, ex.ID, { Shipments: newShipID }, { byForm: true });
  }
  await data.updateRecord(SHIP, newShipID, { Receiving_Record_Created: true }, { byForm: true });

  // The supplier's own copy of the replacement shipment (Fenteng / Tony), one detail row per shipment line, RR_No blank.
  const details = [newLine].map((l) => ({ SKU: l.SKU, Item_Name: l.Item_Name, PR_No: l.PR_No, RR_No: '' }));
  if (supplier.includes('Fenteng')) {
    const copyId = await data.addRecord('Fenteng_Shipment', { Shipment_No: shipmentNo, Parent_Shipment_ID: String(newShipID) }, ctx.user);
    await data.updateRecord('Fenteng_Shipment', copyId, { Supplier1_Shipment_Details: details }, { byForm: true });
  } else if (supplier.includes('Tony')) {
    const copyId = await data.addRecord('Tony_Shipment', { Shipment_No: shipmentNo, Parent_Shipment_ID: String(newShipID) }, ctx.user);
    await data.updateRecord('Tony_Shipment', copyId, { Supplier2_Shipment_Details: details }, { byForm: true });
  }

  await data.updateRecord('Replacement_Request', r.ID, { Cloned_Shipment_No: shipmentNo }, { byForm: true });
  return {
    status: 'success',
    message: origShip
      ? `Replacement Shipment ${shipmentNo} created for PO ${origPONo}.`
      : `Replacement Shipment ${shipmentNo} created (stock item — no original PO, PO_No/Sales_Owner left blank).`,
    shipmentId: String(newShipID),
  };
}