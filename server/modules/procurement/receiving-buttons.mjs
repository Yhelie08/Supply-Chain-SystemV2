// create_receiving_from_shipment, ported from zoho-export/parsed/functions/createReceivingFromShipmentWidget.dg.
// The "Create Receiving" button on a Shipment: builds the Receiving record (header + lines) by hand. Like every
// script-added Receiving in Zoho, this does NOT run the Receiving form workflows — it sets the header and the lines
// only (no totals / status computation), exactly as the Deluge does. Writes go through rawStore, so nothing re-fires.
import { fail } from '../../custom-api-helpers.mjs';
import { idOf, blank } from '../../workflows/deluge.mjs';
import { nextNumber } from '../../workflows/numbering.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

export async function create_receiving_from_shipment({ shipmentId }, data, ctx = {}) {
  const id = idOf(shipmentId);
  const ship = id === '' ? null : await data.getRecordById('Shipments', id, { raw: true }).catch(() => null);
  if (!ship) return fail(`Shipment not found: ${shipmentId}`);
  const shipId = text(ship.ID);

  // One Receiving per shipment: a second click answers "already" with the existing record (mirrors Zoho).
  const already = await data.find('Receiving', (r) => idOf(r.Shipments) === shipId);
  if (already.length) return { status: 'already', message: 'Receiving already exists for this Shipment.', receivingId: already[already.length - 1].ID };

  const po = await (idOf(ship.PO_No) === '' ? Promise.resolve(null) : data.getRecordById('Purchase_Order', idOf(ship.PO_No), { raw: true }).catch(() => null));
  const lines = [];
  let salesOwner = '';
  for (const li of ship.PO_Shipments || []) {
    lines.push({ PR_No: li.PR_No, SKU: li.SKU, Item_Name: li.Item_Name, Expected_Qty: li.Shipment_QTY, Bin_location: 'Receiving Area' });
    // Sales_Owner: the line's PR owner when it has a PR, else the shipment's; the last line wins (mirrors Zoho).
    if (text(li.PR_No) !== '') {
      const pr = (await data.find('Purchase_Request1', (p) => text(p.PR_No) === text(li.PR_No)))[0];
      if (pr) salesOwner = text(pr.Sales_Owner);
    } else {
      salesOwner = text(ship.Sales_Owner);
    }
  }

  const receiveNo = await nextNumber(data, 'Receiving', 'Receive_No1', 'RCV');
  const receivingId = await data.addRecord('Receiving', {
    Receive_No1: receiveNo, Shipments: shipId, SO_No: ship.Sales_Order, PO_No: text(po?.PO_No),
    Customer_Name: ship.Customer, Supplier: ship.Supplier, Sales_Owner: salesOwner, Receiving_Line_Items: lines,
  }, ctx.user);
  await data.updateRecord('Shipments', shipId, { Receiving_Record_Created: true }, { byForm: true });
  return { status: 'success', receivingId, receiveNo };
}