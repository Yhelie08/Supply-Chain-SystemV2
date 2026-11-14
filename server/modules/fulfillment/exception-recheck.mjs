// Fulfillment pipeline, Exception Control -> back to Pack & QC. Ported from the Exception Control widget's "Completed -> Quality Check"
// hand-off (it now happens on the server, so the widget no longer creates the QC record itself: two writers would make duplicates).
//
// An exception unit (Exception_Control1 record, Qty 1) whose Status becomes "Completed" (repaired) goes back to Pack & QC:
//   - ONLY the repaired units go back: the QC quantity is the number of repaired units, not the order quantity.
//   - ONE pending QC record per item and package collects them: the first repaired unit creates it (Quantity 1), the next one adds to
//     its Quantity while it is still pending (QC_Status blank). Once it has been decided (Approved / Rejected) a later repair gets a
//     new QC record. The record carries the exceptions it re-checks (Recheck_Exceptions) so a second rejection reopens the SAME
//     exception (see qc-routing.mjs) instead of creating another one.
//   - Each exception is sent once (Sent_To_QC). Saving it again, or setting Completed again, creates nothing.
// The QC record copies the header (PR, RR, demo, order / delivery type, target date, For_Crate, bin, customer, forecast...) from the QC
// record that rejected the unit; the checker is the exception's "Checked By".
//
// Then QC again: Approved -> To Ship / Crate (qty = every approved unit of the item, see qc-routing.mjs), Rejected -> the exception reopens.
import { register } from '../../workflows/index.mjs';
import { blank, truthy } from '../../workflows/deluge.mjs';
import { advanceStage } from './pipeline.mjs';

const EXC = 'Exception_Control1';
const QC = 'Checker_Checklist';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const count = (v) => { const n = parseInt(text(v), 10); return Number.isFinite(n) && n > 0 ? n : 0; };

export async function repairedToQc({ record: exc, previous, store, user, id }) {
  if (text(exc.Status) !== 'Completed' || text(previous?.Status) === 'Completed' || truthy(exc.Sent_To_QC)) return; // only the save that completes it
  const so = text(exc.Sales_Order), sku = text(exc.SKU), pac = text(exc.PAC), rr = text(exc.RR_No);
  if (so === '' || sku === '') return;
  const excId = text(exc.ID || id);

  // Where it came from: the QC record that rejected it (QC_ID), else the latest QC record of this item and package.
  let origin = null;
  if (text(exc.QC_ID) !== '') { try { origin = await store.getRecordById(QC, text(exc.QC_ID), { raw: true }); } catch { origin = null; } }
  if (!origin) {
    const all = await store.find(QC, (c) => text(c.SO) === so && text(c.SKU) === sku && text(c.PAC) === pac);
    origin = all[all.length - 1] || {};
  }
  const header = {
    PR: origin.PR, Demo: origin.Demo, RR: origin.RR ?? exc.RR_No, Order_Type: origin.Order_Type, Delivery_Type: origin.Delivery_Type,
    Target_Delivery_Date: origin.Target_Delivery_Date, For_Crate: origin.For_Crate, Bin_Location: origin.Bin_Location,
    Customer_Name: origin.Customer_Name || exc.Customer_Name, Customer_Type: origin.Customer_Type || exc.Customer_Type, Customer_Address: origin.Customer_Address || exc.Customer_Address,
    Item_Name: origin.Item_Name || exc.Item_Name, City: origin.City, Email: origin.Email, Contact: origin.Contact,
    Forecast_Delivery: origin.Forecast_Delivery, Forecast_Window: origin.Forecast_Window, Forecast_Status: origin.Forecast_Status,
  };
  const units = count(exc.Qty) || 1;

  // A re-check that is still pending takes this unit too; otherwise a new one.
  const pending = (await store.find(QC, (c) => text(c.SO) === so && text(c.SKU) === sku && text(c.PAC) === pac && text(c.RR) === text(header.RR) && text(c.QC_Status) === '' && Array.isArray(c.Recheck_Exceptions)))[0];
  let qcId;
  if (pending) {
    qcId = pending.ID;
    const linked = pending.Recheck_Exceptions.map(String);
    if (!linked.includes(excId)) {
      await store.updateRecord(QC, pending.ID, { Quantity: String(count(pending.Quantity) + units), Recheck_Exceptions: [...linked, excId] }, { byForm: true });
    }
  } else {
    qcId = await store.addRecord(QC, { SO: so, PAC: pac, SKU: sku, ...header, Quantity: String(units), Quality_Checker: text(exc.Checker), Recheck_Exceptions: [excId] }, user);
  }
  await store.updateRecord(EXC, excId, { Sent_To_QC: true, QC_Record: String(qcId) }, { byForm: true });
  await advanceStage(store, so, header.Item_Name, sku, 'Pack & QC');
}
register(EXC, { afterAdd: repairedToQc, afterUpdate: repairedToQc });
