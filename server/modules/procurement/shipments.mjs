// Shipments workflows, ported from zoho-export/parsed/workflows/form/Shipments/*.dg.
//   before the save (on validate):
//     Shipment_Generate_Number   (add)   the next SHP-nnnnn
//     Shipment_Autofill_From_PO1 (add or edit)  Sales_Order, Customer from the PO; Supplier when all the PO lines have the same supplier
//     Shipment_Track_Previous_S  (edit)  Previous_Status = the status the shipment had before this save
//   after the save (on success):
//     Shipment_Populate_Receiving     (add)   the Receiving record of the shipment (see below)
//     Shipment_Edited_Sync_Receiving  (edit)  the Receiving records follow the shipment's SO / PO / customer / supplier and get new lines
//     Shipments_Sync_Shipment_Mode    (edit)  Shipment_Mode_When_Received on the shipment lines -> the Receiving lines
//     Shipment_Status_Back_Sync       (edit)  the Line_Status of each shipment line -> the supplier's copy of the shipment (Fenteng / Tony)
// Skipped on purpose (they only run in the form while a person is typing): Shipment_Autofill_From_PO2, Shipment_Refresh_PR_Detai
// (user input of PO_No: fill the PO_Shipments rows), Shipment_Lock_PO_Fields (on load).
// Not ported: the Shipment_Line_Items list of Shipment_Autofill_From_PO1 (Zoho assigned it to a plain variable, so it never stored
// anything).
//
// "Same RCV" rule (2026-07-20 in Zoho): a second shipment for a PO that already has a Receiving record (the replacement shipment)
// does NOT make a second Receiving record: the existing one is pointed at the new shipment. Its lines and Expected_Qty are left
// alone, so Accepted + Damage + Missing = Expected still holds. In the same way an edit of a shipment never changes the Expected_Qty
// of a Receiving line that already exists, only NEW lines (no line with that PR_No + SKU) get their Expected_Qty from Shipment_QTY.
import { register } from '../../workflows/index.mjs';
import { blank, idOf } from '../../workflows/deluge.mjs';
import { nextNumber } from './purchase-order.mjs';

const SHIP = 'Shipments';
const RCV = 'Receiving';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

async function purchaseOrder(store, ref) {
  const id = idOf(ref);
  if (id === '') return null;
  try { return await store.getRecordById('Purchase_Order', id, { raw: true }); } catch { return null; }
}
async function salesOrderNumber(store, ref) {
  const id = idOf(ref);
  if (id === '') return '';
  try { return text((await store.getRecordById('Sales_Order', id, { raw: true })).Sales_Order_Number); } catch { return ''; }
}

// ---------- before the save ----------
async function beforeSave({ input, previous, store }) {
  const rec = { ...(previous || {}), ...input };
  if (!previous) input.Shipment_No = await nextNumber(store, SHIP, 'Shipment_No', 'SHP');

  // Shipment_Autofill_From_PO1
  const po = await purchaseOrder(store, rec.PO_No);
  if (po) {
    input.Sales_Order = await salesOrderNumber(store, po.SO_No);
    input.Customer = po.Customer;
    const suppliers = [];
    for (const line of po.PO_Line_Items || []) if (!suppliers.includes(text(line.Supplier))) suppliers.push(text(line.Supplier));
    if (suppliers.length === 1) input.Supplier = suppliers[0];
  }

  // Shipment_Track_Previous_Status
  if (previous && text(previous.Shipment_Status) !== text(rec.Shipment_Status)) input.Previous_Status = previous.Shipment_Status;
}

// ---------- after the save ----------
async function populateReceiving({ record: ship, id, store, user }) {
  const shipId = text(ship.ID || id);
  const po = await purchaseOrder(store, ship.PO_No);
  const poNo = text(po?.PO_No);
  const existing = poNo === '' ? [] : await store.find(RCV, (r) => text(r.PO_No) === poNo);
  if (existing.length) {
    for (const r of existing) await store.updateRecord(RCV, r.ID, { Shipments: shipId }, { byForm: true });
  } else {
    // (a record added by a script does not run the Receiving workflows, in Zoho either: its number comes from the form's own numbering)
    await store.addRecord(RCV, {
      Receive_No1: await nextNumber(store, RCV, 'Receive_No1', 'RCV'), Shipments: shipId, SO_No: ship.Sales_Order, PO_No: poNo, Customer_Name: ship.Customer, Supplier: ship.Supplier,
      Receiving_Line_Items: (ship.PO_Shipments || []).map((li) => ({ PR_No: li.PR_No, SKU: li.SKU, Item_Name: li.Item_Name, Expected_Qty: li.Shipment_QTY })),
    }, user);
  }
  await store.updateRecord(SHIP, shipId, { Receiving_Record_Created: true }, { byForm: true });
}

async function syncAfterEdit({ record: ship, id, store }) {
  const shipId = text(ship.ID || id);
  const po = await purchaseOrder(store, ship.PO_No);
  const rows = await store.find(RCV, (r) => idOf(r.Shipments) === shipId);
  for (const r of rows) {
    const patch = { SO_No: ship.Sales_Order, PO_No: text(po?.PO_No), Customer_Name: ship.Customer, Supplier: ship.Supplier };
    // Shipments_Sync_Shipment_Mode_To_Receiving + new lines (existing lines keep their Expected_Qty)
    const lines = (r.Receiving_Line_Items || []).map((l) => ({ ...l }));
    for (const li of ship.PO_Shipments || []) {
      if (!lines.some((l) => text(l.PR_No) === text(li.PR_No) && text(l.SKU) === text(li.SKU))) {
        lines.push({ PR_No: li.PR_No, SKU: li.SKU, Item_Name: li.Item_Name, Expected_Qty: li.Shipment_QTY });
      }
      const mode = text(li.Shipment_Mode_When_Received);
      if (text(li.PR_No) !== '' && mode !== '') for (const l of lines) if (text(l.PR_No) === text(li.PR_No) && text(l.Shipment_Mode_When_Received) !== mode) l.Shipment_Mode_When_Received = mode;
    }
    await store.updateRecord(RCV, r.ID, { ...patch, Receiving_Line_Items: lines }, { byForm: true });
  }

  // Shipment_Status_Back_Sync: the line status the buyer sets -> the supplier's own copy (matched by PR_No + SKU)
  const statusByLine = new Map();
  for (const sr of ship.PO_Shipments || []) if (text(sr.Line_Status) !== '') statusByLine.set(`${text(sr.PR_No)}|${text(sr.SKU)}`, sr.Line_Status);
  if (statusByLine.size === 0) return;
  const supplier = text(ship.Supplier);
  const copies = supplier.includes('Fenteng') ? ['Fenteng_Shipment', 'Supplier1_Shipment_Details'] : supplier.includes('Tony') ? ['Tony_Shipment', 'Supplier2_Shipment_Details'] : null;
  if (!copies) return;
  const [form, grid] = copies;
  for (const copy of await store.find(form, (c) => text(c.Parent_Shipment_ID) === shipId)) {
    let changed = false;
    const details = (copy[grid] || []).map((row) => {
      const status = statusByLine.get(`${text(row.PR_No)}|${text(row.SKU)}`);
      if (status !== undefined && text(row.Status) !== text(status)) { changed = true; return { ...row, Status: status }; }
      return row;
    });
    if (changed) await store.updateRecord(form, copy.ID, { [grid]: details }, { byForm: true });
  }
}

register(SHIP, { beforeAdd: beforeSave, beforeUpdate: beforeSave, afterAdd: populateReceiving, afterUpdate: syncAfterEdit });
