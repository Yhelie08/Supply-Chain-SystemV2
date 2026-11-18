// Suggesting a schedule (spec v1.4, Delivery 02 §3): for a ranked job — drop-off or installation, find the
// earliest slot, a city tie-break among every team with room that day, "Book third party" for a drop-off whose
// own-team slot is too late, and a supervisor approval item when an installation cannot meet its target any
// other way.
//
// This sits ALONGSIDE the existing scheduling engine (scheduling-engine.mjs / scheduling.mjs, the ported Zoho
// `dmsScheduleSlot`), not instead of it: that engine still writes the Suggested_Schedule_Date a dispatcher
// approves today, and nothing here changes it. This is the new, read-mostly "what should the dispatcher see"
// layer the spec asks for — it only writes when it prepares an Approval_Queue item (steps 4 and 5).
import { zohoNow } from '../../criteria.mjs';
import { findEarliestSlot, teamsWithRoomOn } from './earliest-slot.mjs';
import { SA, day, policyReader, toLong } from './scheduling.mjs';
import { effectiveTarget } from './sorter.mjs';
import { blank, toNum, parseDate, ymd, addDays, todayDate } from '../../workflows/deluge.mjs';

const AQ = 'Approval_Queue';
const INSTALL_TYPES = new Set(['With Installation', 'Full-Day Install', 'Multi-Day Install']);
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// AQ-1/AQ-2: one pending item per (kind, job) — a second call while one is still pending does not duplicate it.
async function prepareApproval(store, { kind, sa, summary, options, payload }) {
  const existing = await store.find(AQ, (i) => i.Kind === kind && text(i.Record_Id) === String(sa.ID) && i.Status === 'pending');
  if (existing.length) return existing[0].ID;
  const policy = await policyReader(store);
  const slaHours = toLong(policy('approval_sla_hours'), 24);
  return store.addRecord(AQ, {
    Kind: kind, Record_Type: 'service_appointment', Record_Id: String(sa.ID), Record_No: text(sa.Sales_Order),
    Summary: summary, Options: JSON.stringify(options), Payload: JSON.stringify(payload),
    Prepared_By_Type: 'system', Status: 'pending', Due_At: zohoNow(new Date(Date.now() + slaHours * 3600000)),
  });
}

// Step 3: prefer, among every team with room that day, the one already going to the SAME city — not just
// findEarliestSlot's own single best-remaining-capacity pick.
async function pickTeamForCity(store, date, city, candidates) {
  if (!candidates.length) return null;
  if (blank(city) || candidates.length === 1) return candidates[0].installer;
  const thatDay = await store.find(SA, (r) => (day(r.Confirmed_Schedule_Date) === date || day(r.Suggested_Schedule_Date) === date) && r.Appointment_Status !== 'Failed');
  const sameCity = candidates.find((c) => thatDay.some((r) => r.Installer === c.installer && !blank(r.City) && String(r.City).trim().toLowerCase() === String(city).trim().toLowerCase()));
  return (sameCity ?? candidates[0]).installer;
}

export async function suggestSchedule(store, saId, { now = new Date(), fromDate } = {}) {
  const sa = await store.getRecordById(SA, saId, { raw: true });
  if (!sa) return { status: 'not_found' };
  const dType = sa.Type_of_Delivery ?? '';
  if (dType === 'Pick Up') return { status: 'no_team_needed', reason: 'Pick Up has no team to schedule.' };
  const isInstall = INSTALL_TYPES.has(dType);
  const policy = await policyReader(store);
  const estMinutes = toNum(sa.Estimated_Duration) ? toNum(sa.Estimated_Duration) * 60 : undefined;

  // Step 1/2: job_type decides the rules below; find_earliest_slot (Delivery 01) finds the date. No "ready
  // date" of its own is tracked on an appointment yet, so this defaults to today, same as findEarliestSlot itself.
  const slot = await findEarliestSlot(store, { jobType: dType, estMinutes, fromDate, now });
  if (!slot.found) {
    if (!isInstall) return { status: 'no_slot', reason: slot.reason };
    // Step 5: an installation with no slot before its target escalates — there is no third-party fallback for it.
    const id = await prepareApproval(store, {
      kind: 'schedule_shortfall', sa,
      summary: `${text(sa.Sales_Order)}: no team-day found within the scheduling window for an installation.`,
      options: ['Add a team-day (overtime, extra installer)', 'Tell the customer (proposed new date)'],
      payload: { reason: slot.reason },
    });
    return { status: 'escalated', approvalId: String(id), reason: slot.reason };
  }

  const candidates = await teamsWithRoomOn(store, slot.date, { jobType: dType, estMinutes, now });
  const installer = await pickTeamForCity(store, slot.date, sa.City, candidates.length ? candidates : [{ installer: slot.installer }]);
  const chosen = candidates.find((c) => c.installer === installer) ?? { driver: slot.driver, vehicle: slot.vehicle };

  // Step 4: a drop-off whose own-team slot is later than its target, or later than dropoff_max_wait_days from
  // today, gets a "Book third party" approval item instead of a committed team. Installations never go here.
  if (!isInstall) {
    const maxWaitDays = toLong(policy('dropoff_max_wait_days'), 2);
    const target = parseDate(effectiveTarget(sa, policy));
    const slotDate = parseDate(slot.date);
    const pastTarget = target && slotDate > target;
    const pastMaxWait = slotDate > addDays(todayDate(), maxWaitDays);
    if (pastTarget || pastMaxWait) {
      const id = await prepareApproval(store, {
        kind: 'third_party_booking', sa,
        summary: `${text(sa.Sales_Order)}: own-team slot is ${slot.date}${target ? ` (target ${ymd(target)})` : ''} — book a third party instead?`,
        options: ['Book third party', `Keep own team on ${slot.date}`],
        payload: { ownTeamDate: slot.date, installer, target: effectiveTarget(sa, policy) || '' },
      });
      return { status: 'third_party_suggested', approvalId: String(id), date: slot.date, installer, reason: slot.reason };
    }
  }

  return { status: 'suggested', date: slot.date, installer, driver: chosen.driver, vehicle: chosen.vehicle, reason: slot.reason };
}
