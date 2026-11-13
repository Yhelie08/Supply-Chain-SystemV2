// DMS_Exception_Queue workflows, ported from zoho-export/parsed/workflows/form/DMS_Exception_Queue/EXC_Resolve_Sync.dg.
// Only the events that run on API writes are here (on success).
//
// EXC_Resolve_Sync, after an exception is saved as Resolved (or Dismissed with an appointment attached):
//   - stamps Resolution_Date on a Resolved one that has none;
//   - marks the appointment's Exception_Status Resolved;
//   - "Revert to System": clears the appointment's suggested and confirmed dates and runs the scheduling engine again
//     as a manual re-run, so the order gets a new slot at once;
//   - a Resolved exception of the Dispatch stage (a failed delivery in the field) is requeued once: a copy of the
//     appointment with its items goes back to the queue as a Priority order, and the failed one is marked Failed.
// The condition is `Status == "Resolved" || Status == "Dismissed" && ref != null`: a Resolved exception is handled
// even with no appointment attached (it only gets the stamp), a Dismissed one needs the appointment ("mirrors Zoho").
// Writes made here do not run the workflows again; checked on Zoho Development: a scripted `insert into` does not run the
// form's workflows there either.
import { register } from '../../workflows/index.mjs';
import { zohoNow } from '../../criteria.mjs';
import { idOf, truthy, blank } from '../../workflows/deluge.mjs';
import { SA, scheduleSlot } from './scheduling.mjs';

const EXC = 'DMS_Exception_Queue';

async function resolveSync({ id, record: input, store, user }) {
  const ref = idOf(input.Sales_Order_Reference);
  if (!(input.Status === 'Resolved' || (input.Status === 'Dismissed' && ref !== ''))) return;

  const fromException = {};
  if (input.Status === 'Resolved' && blank(input.Resolution_Date)) fromException.Resolution_Date = zohoNow();
  if (Object.keys(fromException).length) await store.updateRecord(EXC, id, fromException, { byForm: true });

  const [appointment] = ref === '' ? [] : await store.find(SA, (r) => r.ID === ref);
  if (appointment) {
    const changes = { Exception_Status: 'Resolved' };
    const revert = truthy(input.Revert_to_System);
    if (revert) Object.assign(changes, { Suggested_Schedule_Date: '', Suggested_Time_Slot: '', Confirmed_Schedule_Date: '', Confirmed_Time_Slot: '' });
    await store.updateRecord(SA, ref, changes, { byForm: true });
    if (revert) await scheduleSlot(store, ref, true, { user });
  }

  // Dispatch-stage requeue: only once per exception (Requeue_Processed).
  if (input.Exception_Stage === 'Dispatch' && input.Status === 'Resolved' && !truthy(input.Requeue_Processed)) {
    const [failed] = ref === '' ? [] : await store.find(SA, (r) => r.ID === ref);
    if (failed) {
      const copy = {
        Sales_Order: failed.Sales_Order, Sales_Order_Display: failed.Sales_Order, Customer_Address: failed.Customer_Address, City: failed.City,
        Contact: failed.Contact, Email: failed.Email, Type_of_Delivery: failed.Type_of_Delivery, Package_Number: failed.Package_Number,
        Appointment_Status: 'Queued', Rescheduled_From_SA: failed.ID, Rescheduled_Via_Exception: String(input.Exception_ID ?? ''), Priority: true,
        Initial_Schedule_ID: failed.Initial_Schedule_ID, Service_Request_ID: failed.Service_Request_ID, Service_Request: failed.Service_Request,
        Requested_Delivery_Date: failed.Requested_Delivery_Date, Requested_Delivery_Time: failed.Requested_Delivery_Time,
      };
      if (failed.Customer_Name != null && failed.Customer_Name !== '') copy.Customer_Name = failed.Customer_Name;
      copy.Item_Details = (failed.Item_Details || []).map((it) => ({ Item_Name: it.Item_Name, SKU: it.SKU, Quantity: it.Quantity, PAC: it.PAC }));
      await store.addRecord(SA, copy, user);
      // The original attempt is marked Failed so it is archived properly.
      await store.updateRecord(SA, ref, { Appointment_Status: 'Failed' }, { byForm: true });
    }
    await store.updateRecord(EXC, id, { Requeue_Processed: true }, { byForm: true });
  }
}

register(EXC, { afterAdd: resolveSync, afterUpdate: resolveSync });
