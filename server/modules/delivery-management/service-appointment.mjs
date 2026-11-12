// Service_Appointment_Form workflows, ported from zoho-export/parsed/workflows/form/Service_Appointment_Form/*.dg.
// Only the events that run on API writes are here (on validate = before, on success = after).
//
// Ported here: SA_Site_Confirmation_Vali, SA_Scheduling_Override_Va, SA_Sync_Sales_Order_Displ (and its twin ...Displ1).
// Skipped on purpose: SA_Site_Confirmation_Init (inactive in Zoho).
// NOT ported yet: SA_Scheduling_Engine and SA_Geocode_Address (D2/D3 of the plan), SA_Instant_Forecast (forecast engine).
//
// The two "on validate" scripts run in the order of the workflows in Zoho's export (.ds lines 41467 and 41813): the site
// confirmation check first, then the schedule override check, so the same message wins when both would refuse.
import { register } from '../../workflows/index.mjs';
import { ZohoError } from '../../criteria.mjs';
import { truthy, blank, sameValue } from '../../workflows/deluge.mjs';

const FORM = 'Service_Appointment_Form';
// "cancel submit" after an alert: Zoho's API answers with the alert text; here it is a refused write.
const refuse = (message) => { throw new ZohoError(2001, message); };

// SA_Site_Confirmation_Validate: a confirmed site needs to say how and what was said.
function siteConfirmation(rec) {
  if (rec.Site_Confirmation_Status !== 'Confirmed') return;
  if (blank(rec.Confirmation_Method)) refuse('Confirmation Method is required when confirming site readiness.');
  if (blank(rec.Site_Confirmation_Notes)) refuse('Site Confirmation Notes is required when confirming site readiness.');
}

// SA_Scheduling_Override_Validate: confirming a date or slot other than the one the system suggested needs a name and a
// reason, unless a calendar entry was already created. Pick Up and 3rd Party fleet are exempt.
// Blank is "" here and null in Zoho, so two blanks count as equal (the script's first clause, "confirmed date set and
// suggested date empty", is already covered by "the dates differ").
// Rule: nothing to check while nothing is confirmed (it differs from a literal reading of the Deluge). Read literally, `Confirmed != Suggested` is also
// true for an appointment that only has a suggestion (confirmed date empty), so every ordinary edit of a queued
// appointment would be refused for Override By. The script's own intent ("when confirming a schedule that differs")
// is only about a confirmation. Confirmed by the owner: Zoho does not refuse such an edit, so this is the rule.
function schedulingOverride(rec) {
  if (rec.Type_of_Delivery === 'Pick Up') return;
  if (rec.Fleet_Decision === '3rd Party') return;
  if (blank(rec.Confirmed_Schedule_Date) && blank(rec.Confirmed_Time_Slot)) return;
  const mismatch = !sameValue(rec.Confirmed_Schedule_Date, rec.Suggested_Schedule_Date)
    || !sameValue(rec.Confirmed_Time_Slot, rec.Suggested_Time_Slot);
  if (mismatch && !truthy(rec.Calendar_Entry_Created)) {
    if (blank(rec.Override_By)) refuse('Override By is required when confirming a schedule that differs from the system suggestion.');
    if (blank(rec.Override_Reason)) refuse('Override Reason is required when confirming a schedule that differs from the system suggestion.');
  }
}

// On a save the widget sends only the changed fields, while Zoho's `input` is the whole record.
function validate({ input, previous }) {
  const rec = { ...(previous || {}), ...input };
  siteConfirmation(rec);
  schedulingOverride(rec);
}

// SA_Sync_Sales_Order_Display (two identical scripts in Zoho, so running it once gives the same result): keep the
// display copy of the sales order number equal to the sales order field.
async function syncSalesOrderDisplay({ id, record, store }) {
  if (blank(record.Sales_Order) || sameValue(record.Sales_Order, record.Sales_Order_Display)) return;
  await store.updateRecord(FORM, id, { Sales_Order_Display: record.Sales_Order }, { byForm: true });
}

register(FORM, {
  beforeAdd: validate,
  beforeUpdate: validate,
  afterAdd: syncSalesOrderDisplay,
  afterUpdate: syncSalesOrderDisplay,
});
