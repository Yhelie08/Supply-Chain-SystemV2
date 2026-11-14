// Replacement_Request and Exceptions workflows (all "on validate", before the save), ported from
//   zoho-export/parsed/workflows/form/Replacement_Request/*.dg and .../Exceptions/*.dg
// The Tony Fan and Fenteng Lighting copies of Replacement_Request (same field names) have the same four scripts, with two differences
// that are kept: they write Last_Updated for real (`input.Last_Updated`, the main form's script does not), and their number script
// reads the MAIN Replacement_Request table, so their numbers continue the main sequence.
//
//   Replacement_Request
//     RR_Generate_Number   (add)          the next RR-nnnnn
//     RR_Set_Defaults      (add)          RR_Status "Open", RR_Date today
//     RR_Status_Timestamps (add or edit)  Supplier_Acknowledge_Date when the status BECOMES Acknowledged, Closed_At when it BECOMES Closed
//     RR_Validate_Status   (add or edit)  cannot be Closed without Closure_Notes and RR_Reason
//   Exceptions
//     EXC_Generate_Number   (add)         the next EXC-nnnnn
//     EXC_Set_Defaults      (add)         Exception_Status "Open", Opened_On now
//     EXC_Validate_Status   (add or edit) cannot be Resolved without Resolution_Action; cannot be Closed unless it was Resolved first
//     EXC_Status_Timestamps (add or edit) (Zoho's script sets Resolved_At / Closed_At in plain variables, which never stored anything,
//                                          and the form has no such fields: nothing to port)
// Quirks kept: RR_Status_Timestamps also "fills" Last_Updated and Supplier_Acknowledged in plain variables, so those are never stored.
// An alert + "cancel submit" in Zoho is an error here (the save is refused with the same message).
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, todayDate, ymd } from '../../workflows/deluge.mjs';
import { nextNumber } from './purchase-order.mjs';

const text = (v) => (blank(v) ? '' : String(v));
const today = () => ymd(todayDate());

// ---------- Replacement_Request (and the two supplier copies) ----------
async function rrBeforeSave(form, { input, previous, store }) {
  const rec = { ...(previous || {}), ...input };
  const isCopy = form !== 'Replacement_Request';
  if (isCopy) input.Last_Updated = today();
  if (!previous) {
    input.RR_No = await nextNumber(store, 'Replacement_Request', 'RR_No', 'RR');
    input.RR_Status = 'Open';
    input.RR_Date = today();
    rec.RR_Status = 'Open';
  }
  const status = text(rec.RR_Status);
  const before = text(previous?.RR_Status);
  if (status === 'Acknowledged' && before !== 'Acknowledged') input.Supplier_Acknowledge_Date = today();
  if (status === 'Closed' && before !== 'Closed') input.Closed_At = today();
  if (status === 'Closed') {
    if (text(rec.Closure_Notes) === '') throw new ZohoError(2001, 'Cannot close this RR — Closure Notes are required before closing a Replacement Request. Please fill in the Closure Notes field.');
    if (text(rec.RR_Reason) === '') throw new ZohoError(2001, 'Cannot close this RR — RR Reason is required before closing a Replacement Request. Please fill in the RR Reason field.');
  }
}
for (const form of ['Replacement_Request', 'Tony_Fan_Replacement_Request', 'Fenteng_Lighting_Replacement_Request']) {
  register(form, { beforeAdd: (ctx) => rrBeforeSave(form, ctx), beforeUpdate: (ctx) => rrBeforeSave(form, ctx) });
}

// ---------- Exceptions ----------
async function excBeforeSave({ input, previous, store }) {
  const rec = { ...(previous || {}), ...input };
  if (!previous) {
    input.Exception_No = await nextNumber(store, 'Exceptions', 'Exception_No', 'EXC');
    input.Exception_Status = 'Open';
    input.Opened_On = zohoNow();
    rec.Exception_Status = 'Open';
  }
  const status = text(rec.Exception_Status);
  if (status === 'Resolved' && text(rec.Resolution_Action) === '') throw new ZohoError(2001, 'Cannot set status to Resolved — Resolution Action is required before resolving an exception. Please fill in the Resolution Action field.');
  if (status === 'Closed' && text(previous?.Exception_Status) !== 'Resolved') throw new ZohoError(2001, 'Cannot set status to Closed — the exception must be Resolved first before it can be Closed.');
}
register('Exceptions', { beforeAdd: excBeforeSave, beforeUpdate: excBeforeSave });
