// Event-triggered scoring (spec §05/01 §6: "any material event ... re-score that Sales Order's records immediately"),
// for direct widget saves of the appointment. Mirrors server/modules/fulfillment/sorter-hooks.mjs.
//
// Not yet wired: exception-queue.mjs's EXC_Resolve_Sync and scheduling-engine.mjs both write Exception_Status
// through the raw store (a hook's own writes do not re-fire hooks), so a resolved exception does not re-score
// immediately yet — only on the next save of the appointment itself, or the nightly run. Next step of the Delivery
// v1.4 sorting-engine work, not done here on purpose (kept small and testable first).
import { register } from '../../workflows/index.mjs';
import { rescoreAll } from './sorter.mjs';

async function onSaSave({ store }) {
  await rescoreAll(store);
}
register('Service_Appointment_Form', { afterAdd: onSaSave, afterUpdate: onSaSave });
