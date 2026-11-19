// Job status chain + event log (spec v1.4, Delivery 03's "Job statuses" line, and 05/04 Timestamps and Event
// Log, whose own "What fires each stamp" table names this exact chain under "Job"). A single derived
// `Job_Status` (requested/scheduled/confirmed/dispatched/on_site/done/archived), computed from fields this app
// already stamps — it never replaces `Appointment_Status`, the same way `Category`/`Queue_Rank` sit alongside
// it rather than instead of it. Each time it moves forward, one `job.<status>` row is logged to the shared
// `Stage_Events` form (05/04; already used by Fulfillment's `stage-events.mjs` for the identical spec section),
// never duplicated for the same stage (T-6).
//
// Four of the six transitions are read straight off fields this session already built: scheduled
// (Confirmed_Schedule_Date), confirmed (Appointment_Confirmed_At, AP-R2), dispatched (Dispatched_At, DS-R3),
// done (Appointment_Status Completed/Failed). Two are genuinely new:
//   - on_site: fired from Field_Work's own "Status: Started" save (see the hook at the bottom) — the closest
//     existing "first action at the site" this app has, since there is no field app yet to fire FA-R3's real
//     trigger (first photo / item results / failed-visit screen). No new button, per T-4.
//   - archived: there is no real "archive" ACTION in this app today — the Archived tab is a filtered view of
//     Completed/Failed jobs, not a step anyone takes (confirmed again reading the widget: it has no archive
//     button) — so T-4 rules out a manual stamp here too. A new nightly job (Archive_Delivery_Jobs_Daily, see
//     index.mjs) stamps it after `archive_after_days` (closes the matching ❌ in the Delivery review doc §4.7).
//
// Many of the writes that move a job between these stages happen through a custom API or another form's hook
// (dispatch.mjs, field-work.mjs, exception-queue.mjs), which write through the RAW store — the same store this
// file's own afterAdd/afterUpdate hook never sees (custom API / cross-form writes do not re-fire form hooks;
// confirmed against server/pg/api.mjs's own comment). Those call sites call `stampJobStatus` directly instead.
import { register } from '../../workflows/index.mjs';
import { zohoNow } from '../../criteria.mjs';
import { blank, toNum } from '../../workflows/deluge.mjs';
import { SA, policyReader } from './scheduling.mjs';

const EVENTS = 'Stage_Events';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const DONE_STATUSES = new Set(['Completed', 'Failed']);

// "2026-11-18 03:45:00 PM" -> Date. Local to this file (same reasoning as earliest-slot.mjs's own parseZoho:
// a small parser kept per-file rather than a cross-module import for one line of use).
function parseZoho(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(text(v));
  if (!m) return null;
  let h = m[4] == null ? 0 : Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
}

export function computeJobStatus(sa) {
  if (!blank(sa.Job_Archived_At)) return 'archived';
  if (DONE_STATUSES.has(text(sa.Appointment_Status)) || !blank(sa.Job_Done_At)) return 'done';
  if (!blank(sa.Job_Arrived_At)) return 'on_site';
  if (!blank(sa.Dispatched_At) || sa.Appointment_Status === 'Dispatched') return 'dispatched';
  if (!blank(sa.Appointment_Confirmed_At)) return 'confirmed';
  if (!blank(sa.Confirmed_Schedule_Date)) return 'scheduled';
  return 'requested';
}

async function logJobEvent(store, sa, status) {
  const stamp = zohoNow();
  await store.addRecord(EVENTS, {
    Record_Type: 'service_appointment', Record_Id: text(sa.ID), Record_No: text(sa.Sales_Order),
    Event: `job.${status}`, Occurred_At: stamp, Reported_At: stamp, Source: 'system',
  });
}

// Recomputes and, if it moved, saves Job_Status and logs exactly one event row. Idempotent: calling this twice
// with nothing changed logs nothing a second time (T-6). Safe to call from anywhere holding the raw store.
export async function stampJobStatus(store, saId) {
  const sa = await store.getRecordById(SA, saId, { raw: true });
  if (!sa) return null;
  const status = computeJobStatus(sa);
  if (text(sa.Job_Status) === status) return status;
  const changes = { Job_Status: status };
  if (status === 'done' && blank(sa.Job_Done_At)) changes.Job_Done_At = zohoNow(); // first write wins, like every other stage stamp here.
  await store.updateRecord(SA, saId, changes, { byForm: true });
  await logJobEvent(store, sa, status);
  return status;
}

async function onSave({ id, store }) {
  await stampJobStatus(store, id);
}
register(SA, { afterAdd: onSave, afterUpdate: onSave });

// on_site: Field_Work's own Status field going to "Started" (the widget already stamps its own Schedule_Start
// on this save) is the nearest real signal this app has for "first action at the site." First write wins.
async function arrivedFromFieldWork({ record, store }) {
  if (record.Status !== 'Started' || blank(record.Service_Appointment_ID)) return;
  const saId = String(record.Service_Appointment_ID).trim();
  const sa = await store.getRecordById(SA, saId, { raw: true });
  if (!sa || !blank(sa.Job_Arrived_At)) return;
  await store.updateRecord(SA, saId, { Job_Arrived_At: zohoNow() }, { byForm: true });
  await stampJobStatus(store, saId);
}
register('Field_Work', { afterAdd: arrivedFromFieldWork, afterUpdate: arrivedFromFieldWork });

// archived: no real archive action exists (see the file header) — a nightly sweep, `archive_after_days`
// [DEFAULT 7] after the job's own Job_Done_At (the Job status chain's own "first time it became done" stamp;
// Modified_Time is only a fallback for a legacy record that reached Completed/Failed before this chain existed,
// so it never got a Job_Done_At of its own). Raw store: called by the nightly job (index.mjs).
//
// AR-R1: no open exception. AR-R3: a job this app knows was itself a failure (Failure_Reason_Code is set, from
// failure-redelivery.mjs) archives only once ITS OWN redelivery is also done — found via Rescheduled_From_SA,
// reused as this app's source_job_id; no redelivery at all means it is not ready to archive either. Books
// write-back is NOT checked (no reliable "write-back succeeded" signal exists for an appointment — Books OAuth
// isn't configured; see "Checklist - Delivery Missing Functions.md" item 2), documented rather than faked.
export async function archiveOldJobs(store, { now = new Date() } = {}) {
  const policy = await policyReader(store);
  const days = toNum(policy('archive_after_days')) || 7;
  const cutoff = new Date(now.getTime() - days * 86400000);
  const all = await store.find(SA, (r) => DONE_STATUSES.has(text(r.Appointment_Status)) && blank(r.Job_Archived_At));
  let archived = 0;
  for (const sa of all) {
    const doneAt = parseZoho(sa.Job_Done_At) || parseZoho(sa.Modified_Time);
    if (!doneAt || doneAt > cutoff) continue;
    if (text(sa.Exception_Status) === 'Flagged') continue; // AR-R1: no open exception.
    if (!blank(sa.Failure_Reason_Code)) { // AR-R3: a failure archives only after its redelivery is also done.
      const [redone] = await store.find(SA, (r) => String(r.Rescheduled_From_SA) === String(sa.ID));
      if (!redone || !DONE_STATUSES.has(text(redone.Appointment_Status))) continue;
    }
    await store.updateRecord(SA, sa.ID, { Job_Archived_At: zohoNow() }, { byForm: true });
    await stampJobStatus(store, sa.ID);
    archived++;
  }
  return { checked: all.length, archived };
}
