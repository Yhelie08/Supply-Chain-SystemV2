// Field_Work workflows, ported from zoho-export/parsed/workflows/form/Field_Work/*.dg.
// Only the events that run on API writes are here (on validate = before, on success = after).
//
// Ported here: FW_Validate_Reschedule_Re.
// NOT ported yet: FW_Completion_Schedule_Sy and FW_Reschedule_To_Exceptio (D3 of the plan), FW_Instant_Forecast (forecast engine).
import { register } from '../../workflows/index.mjs';
import { ZohoError } from '../../criteria.mjs';
import { blank } from '../../workflows/deluge.mjs';

// FW_Validate_Reschedule_Reason. The Deluge condition is
//   Status == "Reschedule Requested" && Reschedule_Reason == null || Reschedule_Reason == ""
// By precedence the second part would refuse ANY save with an empty reason. In Zoho a blank text is null, so that part
// never fires and the real rule is only the first one. Here a blank text is "" (the import and the widgets store it so),
// so porting the condition literally would refuse every Field_Work save that has no reason, which is most of them.
// Deliberate difference: only the real rule is ported.
function rescheduleReason({ input, previous }) {
  const rec = { ...(previous || {}), ...input };
  if (rec.Status === 'Reschedule Requested' && blank(rec.Reschedule_Reason)) {
    throw new ZohoError(2001, 'Reschedule Reason is required when Status is set to Reschedule Requested.');
  }
}

register('Field_Work', { beforeAdd: rescheduleReason, beforeUpdate: rescheduleReason });
