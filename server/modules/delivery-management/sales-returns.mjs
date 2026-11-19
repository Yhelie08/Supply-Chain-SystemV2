// Sales Returns (spec v1.4, Delivery 07 §1, RT-R1/R3/R6). Additive, alongside the existing Sales_Returns_Form
// widget and `create_sales_return_books` (inventory-apis.mjs) — neither is changed.
//
// Not built here: RT-R2 (the pull-out job uses the field app — no field app exists yet, same gap noted
// throughout this session); RT-R4's "[DEFAULT: draft, not posted]" — `create_sales_return_books` already posts
// a real Books sales return and receives the stock immediately, and that live-Books behavior is not something
// to change without the owner's say (it is also not run against live Inventory yet at all, see "Checklist -
// Delivery Missing Functions.md" item 2); RT-R5 (a replacement owed creates an RR or new package) — that is
// Procurement's `Replacement_Request` form, and wiring Delivery into it is its own cross-module decision, not
// made here.
import { register } from '../../workflows/index.mjs';
import { zohoNow, ZohoError } from '../../criteria.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { SA, customerName, raiseException } from './scheduling.mjs';

const RETURNS = 'Sales_Returns_Form';
const EVENTS = 'Stage_Events';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const refuse = (message) => { throw new ZohoError(2001, message); };
const PICKED_UP_STATUSES = new Set(['Completed']);

// RT-R6. 'closed' follows 'credit_note_issued' at once (see the overlay's own helpText) — this app has no
// separate closing step for a return once the credit note exists.
export function computeReturnStatus(ret, pulloutSA) {
  if (!blank(ret.Books_SalesReturn_No)) return 'closed';
  if (!blank(ret.Received_At)) return 'received_back';
  if (pulloutSA && PICKED_UP_STATUSES.has(text(pulloutSA.Appointment_Status))) return 'picked_up';
  if (pulloutSA && !blank(pulloutSA.Confirmed_Schedule_Date)) return 'scheduled';
  if (!blank(ret.Pullout_Appointment_ID)) return 'scheduled';
  return 'requested';
}

async function logReturnEvent(store, ret, status) {
  const stamp = zohoNow();
  await store.addRecord(EVENTS, {
    Record_Type: 'sales_return', Record_Id: text(ret.ID), Record_No: text(ret.RMA) || text(ret.Sales_Order),
    Event: `return.${status}`, Occurred_At: stamp, Reported_At: stamp, Source: 'system',
  });
}

// Safe to call from anywhere holding the raw store — re-reads the return and its linked pullout appointment
// fresh, so it does not matter which side's save triggered the recompute.
export async function stampReturnStatus(store, returnId) {
  const ret = await store.getRecordById(RETURNS, returnId, { raw: true });
  if (!ret) return null;
  const pulloutSA = blank(ret.Pullout_Appointment_ID) ? null : await store.getRecordById(SA, ret.Pullout_Appointment_ID, { raw: true });
  const status = computeReturnStatus(ret, pulloutSA);
  if (text(ret.Return_Status) === status) return status;
  await store.updateRecord(RETURNS, returnId, { Return_Status: status }, { byForm: true });
  await logReturnEvent(store, ret, status);
  return status;
}

// RT-R1: a refused line at delivery becomes a pull-out, with the same lines pre-filled, plus a pull-out
// Service Appointment (Type_of_Delivery = Pullout, no team yet — the dispatcher schedules it like any other
// job) to actually collect the goods.
export async function createPulloutFromRefusal(store, failedSaId, { reason = '', subReason = '', user = '' } = {}) {
  const sa = await store.getRecordById(SA, failedSaId, { raw: true });
  if (!sa) refuse('Service Appointment not found.');
  const items = (sa.Item_Details || []).map((it) => ({ Item_Name: it.Item_Name, SKU: it.SKU, Quantity: it.Quantity, Return_Quantity: it.Quantity }));
  const pulloutId = await store.addRecord(SA, {
    Sales_Order: sa.Sales_Order, Customer_Name: sa.Customer_Name, Customer_Address: sa.Customer_Address, City: sa.City,
    Contact: sa.Contact, Email: sa.Email, Type_of_Delivery: 'Pullout', Appointment_Status: 'Queued',
  }, user);
  const returnId = await store.addRecord(RETURNS, {
    Sales_Order: sa.Sales_Order, Customer_Name: sa.Customer_Name, Customer_Address: sa.Customer_Address, City: sa.City,
    Contact: sa.Contact, Email: sa.Email, Item_Details: items, Reason: reason, Sub_Reason: subReason,
    Source_SA_ID: String(failedSaId), Pullout_Appointment_ID: String(pulloutId),
  }, user);
  await stampReturnStatus(store, returnId);
  return { returnId: String(returnId), pulloutAppointmentId: String(pulloutId) };
}

// RT-R3: the warehouse receiver confirms quantities and condition. Damaged creates an exception with a fault
// origin note (the spec's own wording).
export async function confirmReturnReceived(store, returnId, { condition, notes = '', user = '' } = {}) {
  if (!['Good', 'Damaged'].includes(condition)) refuse('Condition must be Good or Damaged.');
  const ret = await store.getRecordById(RETURNS, returnId, { raw: true });
  if (!ret) refuse('Sales Return not found.');
  if (blank(ret.Received_At)) {
    await store.updateRecord(RETURNS, returnId, { Received_Condition: condition, Received_At: zohoNow() }, { byForm: true, user });
  }
  await stampReturnStatus(store, returnId);
  if (condition === 'Damaged') {
    await store.addRecord('DMS_Exception_Queue', {
      Sales_Order_Reference: text(ret.Source_SA_ID) || text(ret.Pullout_Appointment_ID), Customer_Name: customerName(ret),
      Exception_Stage: 'Returns', Exception_Reason: `Damaged on receipt (fault origin: return/transit)${notes ? ` — ${notes}` : ''}`,
      Severity: 'Medium', Raised_By: 'System', Date_Raised: zohoNow(), Status: 'Open',
    }, user);
  }
}

// Keeps Return_Status in sync when the linked pull-out appointment itself changes (Scheduled, Completed) —
// a widget-driven SA save fires this through the normal hooked store, same as job-status.mjs's own hooks.
register(SA, {
  afterAdd: async ({ id, record, store }) => {
    if (record.Type_of_Delivery !== 'Pullout') return;
    const [ret] = await store.find(RETURNS, (r) => String(r.Pullout_Appointment_ID) === String(id));
    if (ret) await stampReturnStatus(store, ret.ID);
  },
  afterUpdate: async ({ id, record, store }) => {
    if (record.Type_of_Delivery !== 'Pullout') return;
    const [ret] = await store.find(RETURNS, (r) => String(r.Pullout_Appointment_ID) === String(id));
    if (ret) await stampReturnStatus(store, ret.ID);
  },
});
