// SR-R1 (spec v1.4, Delivery 01): "An SR is created automatically when a package passes QC [DEFAULT]... or
// manually by a sales agent / dispatcher." This app's chain is already three stages — To Ship (Order
// Aggregation) -> Initial Scheduling (Delivery_Scheduling) -> Service Request (Service_Request1), the last step
// a manual "Hand off to Service Request" button in the Initial Scheduling widget (see its own header comment,
// "DMS_Chain_Build_2026-10-27"). Automating all the way back to the literal QC-pass event would skip the
// officer's review of the initial date/time in that widget, which this session's owner explicitly did not want
// (asked and answered, 2026-11-18: "i-automate lang ang huling Hand Off click"). So this automates ONLY that
// last click: the moment a Delivery_Scheduling record has a date, a time and an SO (exactly canHandOff()'s own
// condition in the widget) and has not already been handed off, this fires the hand-off itself.
//
// Simplifications versus the widget's own handOff() (deliberate, not oversights):
//   - Priority_Level and Scheduled_by are left blank. The widget asks for them in a modal; there is nobody to
//     ask here. Both are optional on Service_Request1 already (the widget itself omits them when left on
//     "Select...").
//   - No resolveMissingSku()/resolveMissingContact() external-lookup fallback. Those exist for OLD records
//     missing a field the current "To Ship" pipeline always fills in now; a record this hook fires on was
//     created by that same current pipeline, so the fallback has nothing to add.
//   - Item_Details is read straight off the Delivery_Scheduling grid (Item_Name/SKU/PAC/Quantity), not the
//     widget's elaborate comma-split-header reconciliation -- that exists for pre-chain records whose grid rows
//     were malformed; a freshly auto-handed-off record's grid is already correct by construction.
//   - No Address-composite patch (patchSrAddress): the widget's own comment calls it "fire-and-forget... the SR
//     already exists and is already complete without it." Customer_Address (plain text) is written directly.
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { makeAppointment } from './service-request.mjs';

const SCHED = 'Delivery_Scheduling';
const SR = 'Service_Request1';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// "08:00 AM" -> "08:00". Delivery_Scheduling.Time is the same 12-hour text Service_Request1's own
// Initial_Schedule_Time expects to be appended to a date, per the widget's own timeIn()/Initial_Schedule_Time line.
function to24h(value) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(text(value));
  if (!m) return '';
  let hour = Number(m[1]);
  if (m[3]) { const pm = m[3].toUpperCase() === 'PM'; if (pm && hour !== 12) hour += 12; if (!pm && hour === 12) hour = 0; }
  return `${String(hour).padStart(2, '0')}:${m[2]}`;
}

function itemsFrom(rec) {
  const rows = (rec.Item_Details || []).filter((it) => it && (it.Item_Name || it.SKU || it.PAC || it.Qty || it.QTY || it.Quantity));
  if (rows.length) {
    return rows.map((it) => ({
      Item_Name: text(it.Item_Name), SKU: text(it.SKU) || text(it.sku),
      PAC: text(it.PAC) || text(rec.Package_Number), Quantity: Number(it.Quantity ?? it.Qty ?? it.QTY) || 1,
    }));
  }
  if (text(rec.Item_Detail) || text(rec.Qty) || text(rec.Package_Number)) {
    return [{ Item_Name: text(rec.Item_Detail), SKU: '', PAC: text(rec.Package_Number), Quantity: Number(rec.Qty) || 1 }];
  }
  return [];
}

function reasonFrom(rec, id) {
  const bits = [`Auto handed off from Initial Scheduling (record ${id}) once the date and time were set.`];
  if (!blank(rec.Order_Aggregation_ID)) bits.push(`Order Aggregation ID: ${text(rec.Order_Aggregation_ID)}`);
  if (!blank(rec.Customer_Type)) bits.push(`Customer type: ${text(rec.Customer_Type)}`);
  if (!blank(rec.Demo) || !blank(rec.Demo_No)) bits.push(`DEMO#: ${text(rec.Demo) || text(rec.Demo_No)}`);
  return bits.join(' | ');
}

function subFrom(rec) {
  const demo = !blank(rec.Demo) || !blank(rec.Demo_No);
  const type = text(rec.Type_of_Delivery).toLowerCase();
  if (demo || type.includes('demo') || type.includes('site visit')) return 'Demo';
  if (type.includes('replacement')) return 'Replacement';
  return '';
}

// canHandOff()'s own condition, mirrored: not Cancelled, has a date/time/SO, and not already handed off.
function readyToHandOff(rec) {
  if (text(rec.Schedule_Status) === 'Cancelled') return false;
  if (!blank(rec.Service_Request_ID)) return false;
  return !blank(rec.Date_field) && !blank(rec.Time) && !blank(rec.SO);
}

async function autoHandOff({ id, record, store, user }) {
  if (!readyToHandOff(record)) return;
  // Race guard, same reasoning as the widget's own GUARD step: a Service_Request1 might already exist for this
  // Initial_Schedule_ID even though this record's own Service_Request_ID write-back has not landed yet.
  const [already] = await store.find(SR, (r) => text(r.Initial_Schedule_ID) === String(id));
  if (already) return;

  const items = itemsFrom(record);
  const totalQty = items.reduce((sum, it) => sum + (Number(it.Quantity) || 0), 0) || 1;
  const type = text(record.Type_of_Delivery);
  const srData = {
    Service_Request1: '', RMA1: '', Original_SO: text(record.SO), Reason: reasonFrom(record, id),
    Sales_Order: text(record.SO), Package_Number: text(record.Package_Number),
    If_Pull_Out: /pullout|pull out/i.test(type) ? 'Yes' : 'No', Delivery_Type: type,
    Item_Name: items.map((it) => it.Item_Name).filter(Boolean).join(', '),
    SKU: items.map((it) => it.SKU).filter(Boolean).join(', '), Quantity: totalQty,
    Order_Aggregation_ID: text(record.Order_Aggregation_ID), Initial_Schedule_ID: String(id),
    Service_Appointment_ID: '', SR_Status: 'New', Customer_Name: text(record.Customer_Name),
    Customer_Address: text(record.Customer_Address), City: text(record.Delivery_City) || text(record.City),
    Email: text(record.Email), Phone_Number: text(record.Contact), Item_Details: items,
    Complaint_Record_ID: '', Appointment_Record_ID: '', Delivery_Date: text(record.Date_field),
  };
  const sub = subFrom(record);
  if (sub) srData.Sub = sub;
  const t24 = to24h(record.Time);
  if (t24) srData.Initial_Schedule_Time = `${text(record.Date_field)} ${t24}:00`;

  const srId = await store.addRecord(SR, srData, user);
  await makeAppointment({ id: srId, record: srData, store, user });
  await store.updateRecord(SCHED, id, { Service_Request_ID: String(srId), Schedule_Status: 'Handed Off' }, { byForm: true, user });
}

register(SCHED, { afterAdd: autoHandOff, afterUpdate: autoHandOff });
