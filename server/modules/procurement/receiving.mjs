// Receiving workflows, ported from zoho-export/parsed/workflows/form/Receiving/*.dg.
// Nothing here calls Zoho Books or Zoho Inventory (Create_Bin_Receiving, the button that books the receipt, is not ported).
//
//   before the save (on validate, in Zoho's order; each step sees what the one before it wrote):
//     Receiving_Compute_Totals     Total_Expected / Accepted / Damage / Missing_Qty, Total_Lines, Incomplete_Lines, Ready_for_Fulfillment1
//                                  (counted from the lines as they came in: Line_Result is only worked out by the next step, as in Zoho)
//     Receiving_Set_Line_Result    each line: Complete + Ready_for_Fulfillment when Accepted = Expected and Accepted + Damage + Missing = Expected
//     Receiving_Validate_Qty       Accepted + Damaged + Missing cannot be more than Expected (refused otherwise)
//     Receiving_Auto_Exception     "Create Exception" ticked: one Exceptions record per line with damage or missing units, found again by
//                                  Receive_No + SKU (never a second one), Has_Exceptions on the line, Exception_Count; the request is cleared
//     Receiving_Set_Receive_Sta    Receive_Status Pending / Partial Received / Received; the shipment becomes Delivered (Previous_Status kept)
//                                  and Need_Attention1 when a line has damage or missing units
//   after the save (on success):
//     Damage_Missing_Details       one row per damaged / missing unit, up to the line's quantity (never more than are needed)
//     Receiving_Sync_Product_Context  the exception's Product_Context1 rows follow the damage / missing details (Repair_Outcome kept by
//                                  position), and an empty exception title / description is filled
//     Receiving_Sync_Shipment_Mode_To_Shipment   Shipment_Mode_When_Received of the lines -> the shipment's lines (by PR_No)
//     Receiving_Sync_Shipment_Arrived  lines with no missing units -> the supplier's copy of the shipment (Fenteng / Tony), status Arrived
//     Notify_on_Receiving_Quantity_Mismatch  Accepted total different from Expected total: an App_Notifications record
// Not ported: Receiving_Populate_From_S (user input of Shipments, fills the form while a person types), Notify_on_Receiving_Complete
// (inactive in Zoho), Create_Bin_Receiving (Books / Inventory).
// Differences on purpose: Damage_Missing_Details matches a line by PR_No AND SKU (Zoho used PR_No only, so two lines with the same or no
// PR_No shared each other's rows); a new Receiving record with no number gets the next RCV-nnnnn (Zoho's form numbers it by itself).
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, idOf, truthy, toNum, todayDate } from '../../workflows/deluge.mjs';
import { nextNumber } from './purchase-order.mjs';

const SHIP = 'Shipments';
const EXC = 'Exceptions';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const n = (v) => (blank(v) ? 0 : toNum(v));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dMmmYyyy = (d) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const damaged = (l) => n(l.Damage_Qty);
const missing = (l) => n(l.Missing_Qty);
const isComplete = (l) => n(l.Accepted_Qty) + n(l.Damage_Qty) + n(l.Missing_Qty) === n(l.Expected_Qty) && n(l.Accepted_Qty) === n(l.Expected_Qty);

// The Exceptions record of a receiving line: by Receive_No + SKU, else (older ones) by PR_No + Receive_No, which then gets the key.
async function exceptionOfLine(store, receiveNo, line, { stamp = false } = {}) {
  const key = `${receiveNo}||${text(line.SKU)}`;
  const byKey = await store.find(EXC, (e) => text(e.Exception_Line_Key) === key, { criteria: `(Exception_Line_Key == ${q(key)})` });
  if (byKey.length) return { exc: byKey[byKey.length - 1], key };
  const pr = text(line.PR_No).trim();
  if (pr !== '') {
    const old = await store.find(EXC, (e) => text(e.Receiving_Line_ID) === pr && text(e.Receive_No) === receiveNo, { criteria: `(Receiving_Line_ID == ${q(pr)} && Receive_No == ${q(receiveNo)})` });
    if (old.length) {
      if (stamp) await store.updateRecord(EXC, old[old.length - 1].ID, { Exception_Line_Key: key }, { byForm: true });
      return { exc: old[old.length - 1], key };
    }
  }
  return { exc: null, key };
}

// ---------- before the save ----------
async function beforeSave({ input, previous, store }) {
  const rec = { ...(previous || {}), ...input };
  if (!previous && text(rec.Receive_No1) === '') { input.Receive_No1 = await nextNumber(store, 'Receiving', 'Receive_No1', 'RCV'); rec.Receive_No1 = input.Receive_No1; }
  const lines = (rec.Receiving_Line_Items || []).map((l) => ({ ...l }));

  // Receiving_Compute_Totals
  input.Total_Expected_Qty = lines.reduce((s, l) => s + n(l.Expected_Qty), 0);
  input.Total_Accepted_Qty = lines.reduce((s, l) => s + n(l.Accepted_Qty), 0);
  input.Total_Damage_Qty = lines.reduce((s, l) => s + damaged(l), 0);
  input.Total_Missing_Qty = lines.reduce((s, l) => s + missing(l), 0);
  input.Total_Lines = lines.length;
  input.Incomplete_Lines = lines.filter((l) => text(l.Line_Result) === 'Incomplete').length;
  input.Ready_for_Fulfillment1 = lines.filter((l) => truthy(l.Ready_for_Fulfillment)).length;

  // Receiving_Set_Line_Result
  for (const l of lines) { l.Line_Result = isComplete(l) ? 'Complete' : 'Incomplete'; l.Ready_for_Fulfillment = isComplete(l); }

  // Receiving_Validate_Qty
  for (const l of lines) {
    const total = n(l.Accepted_Qty) + damaged(l) + missing(l);
    if (n(l.Expected_Qty) > 0 && total > n(l.Expected_Qty)) {
      throw new ZohoError(2001, `Quantity mismatch on line ${text(l.PR_No)} — Accepted + Damaged + Missing (${total}) cannot exceed Expected Qty (${n(l.Expected_Qty)}). Please correct before saving.`);
    }
  }

  // Receiving_Auto_Exception
  if (truthy(rec.Create_Exception_Requested)) {
    const ship = idOf(rec.Shipments) !== '' ? await store.getRecordById(SHIP, idOf(rec.Shipments), { raw: true }).catch(() => null) : null;
    for (const l of lines) {
      if (damaged(l) > 0 || missing(l) > 0) {
        const { exc, key } = await exceptionOfLine(store, text(rec.Receive_No1), l, { stamp: true });
        if (!exc) {
          await store.addRecord(EXC, {
            Exception_No: await nextNumber(store, EXC, 'Exception_No', 'EXC'), Source_Module: 'Receiving', Exception_Status: 'Open',
            Sales_Order: rec.SO_No, PO_No: rec.PO_No, Shipment_No: text(ship?.Shipment_No), Receive_No: rec.Receive_No1,
            Receiving_Line_ID: l.PR_No, Exception_Line_Key: key, Opened_On: dMmmYyyy(todayDate()),
          });
        }
        l.Has_Exceptions = true;
      }
    }
    input.Create_Exception_Requested = false; // one-shot: the next plain save does not create again
  }
  input.Exception_Count = lines.filter((l) => truthy(l.Has_Exceptions)).length;

  // Receiving_Set_Receive_Status
  const total = { acc: 0, dmg: 0, mis: 0 };
  let incomplete = 0;
  let hasException = false;
  for (const l of lines) {
    total.acc += n(l.Accepted_Qty); total.dmg += damaged(l); total.mis += missing(l);
    if (!isComplete(l)) incomplete++;
    if (damaged(l) > 0 || missing(l) > 0) hasException = true;
  }
  const status = lines.length === 0 || (total.acc === 0 && total.dmg === 0 && total.mis === 0) ? 'Pending' : incomplete === 0 ? 'Received' : 'Partial Received';
  input.Receive_Status = status;
  const shipId = idOf(rec.Shipments);
  if (status !== 'Pending' && shipId !== '') {
    const ship = await store.getRecordById(SHIP, shipId, { raw: true }).catch(() => null);
    if (ship) {
      const patch = {};
      if (text(ship.Shipment_Status) !== 'Delivered') { patch.Previous_Status = ship.Shipment_Status; patch.Shipment_Status = 'Delivered'; }
      if (hasException && !truthy(ship.Need_Attention1)) patch.Need_Attention1 = true;
      if (Object.keys(patch).length) await store.updateRecord(SHIP, shipId, patch, { byForm: true });
    }
  }
  input.Receiving_Line_Items = lines;
}

// ---------- after the save ----------
async function afterSave({ record: r, id, store, user }) {
  const rcvId = text(r.ID || id);
  const lines = r.Receiving_Line_Items || [];

  // Damage_Missing_Details: one row per damaged / missing unit, never more than the line has
  const details = (r.Damage_Missing_Details || []).map((d) => ({ ...d }));
  let added = false;
  for (const l of lines) {
    if (damaged(l) <= 0 && missing(l) <= 0) continue;
    for (const [type, want] of [['Damage', damaged(l)], ['Missing', missing(l)]]) {
      const have = details.filter((d) => text(d.PR_No) === text(l.PR_No) && text(d.SKU) === text(l.SKU) && text(d.Type_field) === type).length;
      for (let i = have; i < Math.min(want, 10); i++) { details.push({ PR_No: l.PR_No, SKU: l.SKU, Type_field: type, Qty: 1 }); added = true; }
    }
  }
  if (added) await store.updateRecord('Receiving', rcvId, { Damage_Missing_Details: details }, { byForm: true });

  // Receiving_Sync_Product_Context
  for (const l of lines) {
    const dmg = damaged(l), mis = missing(l);
    if (dmg <= 0 && mis <= 0) continue;
    const { exc } = await exceptionOfLine(store, text(r.Receive_No1), l);
    if (!exc) continue;
    let category = '';
    const [item] = await store.find('Items', (i) => text(i.SKU) === text(l.SKU), { criteria: `(SKU == ${q(text(l.SKU))})` });
    if (item) category = text(item.category);
    const mine = (type) => details.filter((d) => text(d.PR_No) === text(l.PR_No) && text(d.SKU) === text(l.SKU) && text(d.Type_field) === type);
    const oldOutcomes = (exc.Product_Context1 || []).filter((p) => text(p.PR_No) === text(l.PR_No)).map((p) => p.Repair_Outcome);
    const rows = [];
    const descParts = [];
    if (dmg > 0) {
      mine('Damage').forEach((d, i) => {
        rows.push({
          PR_No: l.PR_No, SKU: d.SKU, Item: l.Item_Name, Category: category, Qty: d.Qty, Type_field: 'Damage', Supplier: r.Supplier,
          Affected_Missing_Part: d.Affected_Missing_Part, Damage_Missing_Category: d.Damage_Missing_Category, Root_Cause_Category: d.Root_Cause_Category,
          Description: d.Description, Action_Required: d.Action_Required, Repairable: d.Repairable, Spare_Part_Type: d.Spare_Part_Type,
          Quantity_of_damage_spare_s: d.Quantity_of_damage_spare_s, Spare_Part_Type_Other: d.Spare_Part_Type_Other,
          Repair_Outcome: text(oldOutcomes[i]) === '' ? 'Pending' : oldOutcomes[i],
        });
        if (text(d.Description) !== '') descParts.push(d.Description);
      });
    }
    if (mis > 0) {
      const m = mine('Missing').pop() || {};
      rows.push({
        PR_No: l.PR_No, SKU: l.SKU, Item: l.Item_Name, Category: category, Qty: mis, Type_field: 'Missing', Supplier: r.Supplier,
        Affected_Missing_Part: m.Affected_Missing_Part, Damage_Missing_Category: m.Damage_Missing_Category, Root_Cause_Category: m.Root_Cause_Category,
        Description: m.Description, Action_Required: m.Action_Required,
      });
      if (text(m.Description) !== '') descParts.push(m.Description);
    }
    const patch = { Product_Context1: rows };
    if (text(exc.Exception_Title) === '') patch.Exception_Title = `${dmg > 0 && mis > 0 ? 'Damage + Missing' : dmg > 0 ? 'Damage' : 'Missing'} — ${text(l.Item_Name)}`;
    if (text(exc.Exception_Description) === '' && descParts.length) patch.Exception_Description = descParts.join('; ');
    await store.updateRecord(EXC, exc.ID, patch, { byForm: true });
  }

  // Receiving_Sync_Shipment_Mode_To_Shipment
  const shipId = idOf(r.Shipments);
  const ship = shipId !== '' ? await store.getRecordById(SHIP, shipId, { raw: true }).catch(() => null) : null;
  if (ship) {
    const modeByPr = new Map();
    for (const l of lines) if (text(l.PR_No) !== '' && text(l.Shipment_Mode_When_Received) !== '') modeByPr.set(text(l.PR_No), l.Shipment_Mode_When_Received);
    if (modeByPr.size) {
      let changed = false;
      const rows = (ship.PO_Shipments || []).map((s) => {
        const mode = modeByPr.get(text(s.PR_No));
        if (mode !== undefined && text(s.Shipment_Mode_When_Received) !== text(mode)) { changed = true; return { ...s, Shipment_Mode_When_Received: mode }; }
        return s;
      });
      if (changed) await store.updateRecord(SHIP, shipId, { PO_Shipments: rows }, { byForm: true });
    }

    // Receiving_Sync_Shipment_Arrived: lines with nothing missing -> Arrived on the supplier's copy of the shipment
    const arrived = new Set();
    for (const l of lines) if (text(l.PR_No) !== '' && n(l.Expected_Qty) > 0 && missing(l) === 0) arrived.add(`${text(l.PR_No)}|${text(l.RR_No)}|${text(l.SKU)}`);
    const supplier = text(ship.Supplier);
    const copy = supplier.includes('Fenteng') ? ['Fenteng_Shipment', 'Supplier1_Shipment_Details'] : supplier.includes('Tony') ? ['Tony_Shipment', 'Supplier2_Shipment_Details'] : null;
    if (arrived.size && copy) {
      const [form, grid] = copy;
      for (const c of await store.find(form, (x) => text(x.Parent_Shipment_ID) === text(ship.ID))) {
        let changed = false;
        const rows = (c[grid] || []).map((row) => {
          if (arrived.has(`${text(row.PR_No)}|${text(row.RR_No)}|${text(row.SKU)}`) && text(row.Status) !== 'Arrived') { changed = true; return { ...row, Status: 'Arrived' }; }
          return row;
        });
        if (changed) await store.updateRecord(form, c.ID, { [grid]: rows }, { byForm: true });
      }
    }
  }

  // Notify_on_Receiving_Quantity_Mismatch
  // (one notification per receiving record: a later save while it still does not match does not send it again)
  const already = await store.find('App_Notifications', (a) => text(a.Source_Record_ID) === rcvId && text(a.Notification_Type) === 'Receiving Quantity Mismatch', { criteria: `(Source_Record_ID == ${q(rcvId)})` });
  if (n(r.Total_Accepted_Qty) !== n(r.Total_Expected_Qty) && already.length === 0) {
    await store.addRecord('App_Notifications', {
      Recipient_Email: 'homecartelpacker@gmail.com', Notification_Type: 'Receiving Quantity Mismatch',
      Message: `Received quantity for ${text(r.Receive_No1)} does not match expected quantity.`, Created_On: zohoNow(), Read: false,
      Source_Record_No: r.Receive_No1, Source_Record_ID: rcvId,
    }, user);
  }
}

register('Receiving', { beforeAdd: beforeSave, beforeUpdate: beforeSave, afterAdd: afterSave, afterUpdate: afterSave });
