// Appointment confirmation and the unconfirmed-by-cutoff alert (spec v1.4, Delivery 03 §1, AP-R2/AP-R4).
//
// AP-R2's own trigger ("SMS with window and tracking link, Delivery 06") is not built — no SMS integration exists
// in this app yet (see "Delivery vs Spec v1.4 - para sa review.md" §4.6). This still ports the part that does not
// need SMS: "the customer's reply, OR A DISPATCHER CALL, sets confirmed" — a dispatcher can mark an appointment
// confirmed by hand (by phone), the same fallback path the spec itself names.
import { register } from '../../workflows/index.mjs';
import { zohoNow } from '../../criteria.mjs';
import { blank, truthy, parseDate, ymd, addDays, todayDate } from '../../workflows/deluge.mjs';
import { SA, raiseException } from './scheduling.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const DONE_STATUSES = new Set(['Completed', 'Failed', 'Archived']);

// AP-R2: "Confirm_Appointment" is a transient trigger (like Report_Event elsewhere in this app) — the widget sets
// it true, the server stamps the real field once and clears the trigger back, so a second click is a no-op.
function stampConfirmation({ input, previous }) {
  if (!truthy(input.Confirm_Appointment)) { delete input.Confirm_Appointment; return; }
  input.Confirm_Appointment = false;
  if (blank(previous?.Appointment_Confirmed_At)) input.Appointment_Confirmed_At = zohoNow();
}
register(SA, { beforeAdd: stampConfirmation, beforeUpdate: stampConfirmation });

// AP-R4: unconfirmed by confirm_cutoff (spec default: 5pm the day before) -> one dispatcher alert. Run as its own
// job at 17:00 (see index.mjs); "the day before" means every appointment confirmed-scheduled for TOMORROW.
export async function runConfirmCutoffCheck(store, { now = new Date() } = {}) {
  const tomorrow = ymd(addDays(todayDate(), 1));
  const all = await store.find(SA, (r) => {
    const d = parseDate(r.Confirmed_Schedule_Date);
    return d != null && ymd(d) === tomorrow;
  });
  let alerted = 0;
  for (const rec of all) {
    if (DONE_STATUSES.has(text(rec.Appointment_Status))) continue;
    if (!blank(rec.Appointment_Confirmed_At)) continue;
    const raised = await raiseException(store, rec, { stage: 'Confirmation', reason: 'Unconfirmed by cutoff', severity: 'Medium' });
    if (raised) alerted++;
  }
  return { checked: all.length, alerted };
}
