// Site Requirements Checklist (spec v1.4, Delivery 01 "Service Request, Site Checklist and Earliest Date").
// Registered after service-appointment.mjs on purpose (see workflows.mjs), so Site_Confirmation_Status has already
// passed that file's own validation by the time this gate runs on the same save.
//
// There is no separate `site_checklists` table yet (no `delivery_jobs` either, see "Delivery vs Spec v1.4 - para sa
// review.md" §1): the 12 lines live as a grid field on Service_Appointment_Form itself, one row per line,
// `{ Line, Status, Notes, Photo, Detail }`. SR-R3 ("answers are copied read-only to the job") is automatic here —
// the checklist already lives on the job record, there is nothing to copy.
//
// This app has no separate "hand-off" step the way the spec pictures a Service Request screen with its own button
// (there is no `service_requests` table either; Service_Request1 creates its appointment immediately on save, see
// service-request.mjs). The nearest existing moment that means "this site is ready to schedule" is
// Site_Confirmation_Status becoming 'Confirmed' (service-appointment.mjs and scheduling-engine.mjs already treat
// that as the signal to run the scheduler), so SR-R1b and SR-R2 gate THAT transition instead of a hand-off button.
import { register } from '../../workflows/index.mjs';
import { ZohoError } from '../../criteria.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { normalizeType, defaultDuration, clock, policyReader, toLong } from './scheduling.mjs';

const FORM = 'Service_Appointment_Form';
const refuse = (m) => { throw new ZohoError(2001, m); };
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const SERVER_ONLY = ['Checklist_Complete', 'Checklist_Missing_Lines', 'Site_Hours_Warning', 'Suggested_Crew_Size'];

const statusOk = (row) => ['Yes', 'No', 'N/A'].includes(text(row?.Status));

// Delivery 01 "Site Requirements Checklist": 12 lines. `answered` reads a line's own row shape — most lines are a
// plain Status (Yes/No/N/A); a few need a Detail field a Status alone cannot carry (permit validity, ceiling
// height, site hours...). Line 12 (boxes/lift) is excluded from the SR-R2 gate on purpose — the spec gates only
// "Lines 1-11".
export const CHECKLIST_LINES = [
  { id: 1, label: 'Electrical wiring ready at the mounting points', answered: statusOk },
  { id: 2, label: 'Support to mount fixtures on', answered: statusOk },
  {
    id: 3,
    label: 'Work permit / gate pass',
    answered: (row) => {
      const required = text(row?.Detail?.Required);
      if (required !== 'Yes' && required !== 'No') return false;
      return required === 'No' || !blank(row?.Detail?.ObtainedStatus);
    },
  },
  {
    id: 4,
    label: 'Noisy-work hours',
    answered: (row) => {
      const restricted = text(row?.Detail?.Restricted);
      if (restricted !== 'Yes' && restricted !== 'No') return false;
      return restricted === 'No' || (!blank(row?.Detail?.From) && !blank(row?.Detail?.To));
    },
  },
  { id: 5, label: 'Mirror involved at site', answered: statusOk },
  { id: 6, label: 'Ceiling height', answered: (row) => !blank(row?.Detail?.Meters) },
  { id: 7, label: 'Ceiling / wall material where mounted', answered: (row) => !blank(row?.Status) },
  { id: 8, label: 'Someone on site to assist', answered: statusOk },
  { id: 9, label: 'Plan / blueprint showing positions', answered: (row) => !blank(row?.Status) },
  { id: 10, label: 'Parking', answered: (row) => !blank(row?.Status) },
  { id: 11, label: 'Site working hours', answered: (row) => !blank(row?.Detail?.Start) && !blank(row?.Detail?.End) },
  { id: 12, label: 'Boxes to deliver and lift available', answered: (row) => !blank(row?.Detail?.BoxCount) },
];
const GATED_LINES = CHECKLIST_LINES.filter((l) => l.id <= 11); // SR-R2: lines 1-11 only

const rowFor = (rows, id) => (rows || []).find((r) => Number(r.Line) === id);

// SR-R2. Pure: takes the grid rows, returns what to show and what to refuse on.
export function checklistStatus(rows) {
  const missing = GATED_LINES.filter((l) => !l.answered(rowFor(rows, l.id)));
  return { complete: missing.length === 0, missing: missing.map((l) => `${l.id}. ${l.label}`) };
}

const INSTALL_TYPES = new Set(['With Installation', 'Full-Day Install', 'Multi-Day Install']);
// SR-R1b: wiring not ready blocks an INSTALLATION job only; a drop-off of the goods can still go ahead.
export function wiringBlocksInstall(rows, typeOfDelivery) {
  if (!INSTALL_TYPES.has(text(typeOfDelivery))) return false;
  return text(rowFor(rows, 1)?.Status) === 'No';
}

// SR-R4: a permit marked Required + still Pending warns on the SR/schedule/field app, and the pre-delivery
// gate (dispatch.mjs's G7) blocks dispatch on it — a SEPARATE condition from "checklist complete": line 3 is
// "answered" (checklistStatus above) the moment its ObtainedStatus is anything non-blank, Pending included, so
// a complete checklist can still have a permit sitting in Pending.
export function permitPending(rows) {
  const permit = rowFor(rows, 3)?.Detail;
  return text(permit?.Required) === 'Yes' && text(permit?.ObtainedStatus) === 'Pending';
}

// SR-R5 [DEFAULT: warning only]: line 11's site working hours vs. the job's own duration (the same
// defaultDuration() scheduling.mjs's scheduling engine already uses for this Type_of_Delivery, not the spec
// doc's own illustrative 1.5h/2.5h — one duration source, not two). Returns '' when there is nothing to warn
// about (line 11 unanswered, or the window fits), the message otherwise.
export function siteHoursWarning(rows, typeOfDelivery) {
  const hours11 = rowFor(rows, 11)?.Detail;
  const start = clock(hours11?.Start);
  const end = clock(hours11?.End);
  if (!start || !end) return '';
  const windowHours = (end.hour + end.minute / 60) - (start.hour + start.minute / 60);
  if (windowHours <= 0) return '';
  const needed = defaultDuration(normalizeType(typeOfDelivery));
  if (windowHours >= needed) return '';
  return `Site working hours (${hours11.Start}–${hours11.End}, ${windowHours.toFixed(1)}h) are shorter than this job's ${needed}h — may not fit in one day.`;
}

// SR-R6: lines 8 (someone on site to assist) and 12 (boxes + lift) decide the dispatcher's 2-/4-person hint.
// No formula is given in the spec beyond "decide" -- the rule here: extra installers when nobody is on site to
// help, or when there is no lift and the box count passes delivery_heavy_box_threshold [DEFAULT 10].
export function crewSizeHint(rows, policy) {
  const helpOnSite = text(rowFor(rows, 8)?.Status) === 'Yes';
  const boxDetail = rowFor(rows, 12)?.Detail;
  const lift = text(boxDetail?.Lift) === 'Yes';
  const boxCount = Number(boxDetail?.BoxCount) || 0;
  const threshold = toLong(policy('delivery_heavy_box_threshold'), 10);
  const needsExtra = !helpOnSite || (!lift && boxCount >= threshold);
  return needsExtra ? '4-person' : '2-person';
}

async function validate({ input, previous, store }) {
  for (const f of SERVER_ONLY) delete input[f];
  const rec = { ...(previous || {}), ...input };

  // Recomputed every save (cheap, pure over Site_Checklist) so a widget never has to guess when to refresh it.
  const { complete, missing } = checklistStatus(rec.Site_Checklist);
  input.Checklist_Complete = complete;
  input.Checklist_Missing_Lines = missing.join('; ');
  input.Site_Hours_Warning = siteHoursWarning(rec.Site_Checklist, rec.Type_of_Delivery);
  const policy = await policyReader(store);
  input.Suggested_Crew_Size = crewSizeHint(rec.Site_Checklist, policy);

  if (text(rec.Site_Confirmation_Status) !== 'Confirmed') return;
  if (wiringBlocksInstall(rec.Site_Checklist, rec.Type_of_Delivery)) {
    refuse('Wiring is not ready at the mounting points (checklist line 1): this installation cannot be confirmed yet. A drop-off of the goods can still be scheduled.');
  }
  if (!complete) refuse(`The site checklist is not complete yet: ${missing.join('; ')}.`);
  // SR-R4 is deliberately NOT a confirm-time refuse: a pending permit only "shows a warning" at this stage (the
  // spec's own wording) — site confirmation can proceed. Only the pre-delivery dispatch gate (dispatch.mjs's
  // G7) actually blocks on it.
}

register(FORM, { beforeAdd: validate, beforeUpdate: validate });
