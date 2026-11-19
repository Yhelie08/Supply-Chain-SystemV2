// Field Service Site Visits (spec v1.4, Delivery 08 §1, SV-R1-R3). SV-R1 (scheduled like any job, a team-day
// slot) needs nothing new: "Site Visit" is already a real Type_of_Delivery this app schedules through the same
// engine as everything else. This file only covers SV-R2/SV-R3 — the legacy `Field_Service_Site_Visit_Form`
// widget (a different, older Zoho object with its own checklist shape) is untouched; in this app's v1.4 model a
// site visit IS a Service_Appointment_Form row, so it already has the same `Site_Checklist` 12-line grid every
// other appointment has (built earlier this session for Delivery 01).
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { SA } from './scheduling.mjs';
import { wiringBlocksInstall } from './site-checklist.mjs';

const INSTALL_TYPES = new Set(['With Installation', 'Full-Day Install', 'Multi-Day Install']);
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// SV-R2: an installation appointment for the same Sales Order as an earlier site visit inherits that visit's
// checklist automatically, so the install team is not re-asked the same 12 lines at the door. Only on CREATE,
// and only when the new appointment has no checklist answers of its own yet — never overwrites a real answer.
async function carryOverFromSiteVisit({ id, record, store }) {
  if (!INSTALL_TYPES.has(text(record.Type_of_Delivery)) || blank(record.Sales_Order)) return;
  if ((record.Site_Checklist || []).length) return;
  const visits = await store.find(SA, (r) => r.Sales_Order === record.Sales_Order && r.Type_of_Delivery === 'Site Visit' && r.ID !== id && (r.Site_Checklist || []).length > 0);
  if (!visits.length) return;
  // BigInt, not Number: these IDs come from a shared sequence that outgrows safe integer precision quickly.
  const visit = visits.reduce((latest, v) => (BigInt(v.ID) > BigInt(latest.ID) ? v : latest));
  const changes = { Site_Checklist: visit.Site_Checklist };
  // SV-R3: a finding that would block installation is named here, for the sales agent — the nearest visible
  // place to "listed on the SO" this app has (no separate SO screen of its own for this).
  if (wiringBlocksInstall(visit.Site_Checklist, record.Type_of_Delivery)) {
    changes.Site_Visit_Blocking_Findings = 'Wiring not ready at the mounting points, found at the site visit — confirm before scheduling.';
  }
  await store.updateRecord(SA, id, changes, { byForm: true });
}
register(SA, { afterAdd: carryOverFromSiteVisit });
