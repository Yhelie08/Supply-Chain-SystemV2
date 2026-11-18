// Delivery backlog calculator (spec v1.4, 05 Shared Engines / 02 Calculators §2). Same shape as Fulfillment's
// own manpower calculator (fulfillment/sorter.mjs's backlogDays/peopleNeeded) -- plain arithmetic, every input
// a setting or a measured/counted number, nothing guessed.
//
//   backlog_days = open_jobs / (teams_per_day * sites_per_team_per_day)
//   teams_needed = open_jobs_due / (sites_per_team_per_day * days_available)
//
// "A site is one visit, whether drop-off or installation" -- so open_jobs only counts Type_of_Delivery
// "With Installation"/"Delivery Only" (not Pick Up/Pull Out/Site Visit, which are not "sites" in this sense),
// excluding third-party jobs (the own-team capacity is what this measures). "Due" reuses sorter.mjs's own
// late/at_risk categories -- the same signal Fulfillment's manpower calculator's own "Late and About-to-be-late"
// crew-sizing example uses.
import { blank, ymd } from '../../workflows/deluge.mjs';
import { SA, policyReader, day } from './scheduling.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const OPEN_STATUS = (status) => !['Completed', 'Failed'].includes(text(status));
const SITE_TYPES = new Set(['With Installation', 'Delivery Only']);
const DUE_CATEGORIES = new Set(['late', 'at_risk']);

export function backlogDays(openJobs, teamsPerDay, sitesPerTeamPerDay) {
  if (openJobs === 0) return 0;
  const capacity = teamsPerDay * sitesPerTeamPerDay;
  return capacity === 0 ? Infinity : openJobs / capacity;
}

export function teamsNeeded(openJobsDue, sitesPerTeamPerDay, daysAvailable) {
  if (openJobsDue === 0) return 0;
  const capacity = sitesPerTeamPerDay * daysAvailable;
  return capacity === 0 ? Infinity : openJobsDue / capacity;
}

// teams_per_day: active teams (Availability_Status != "Not Available") in Daily_Team_Availability for `date`,
// capped at delivery_max_teams [DEFAULT 3] -- "three field vehicles", the spec's own cap, not a bigger number
// even if more teams show availability than trucks.
export async function teamsPerDayFor(store, date, policy) {
  const rows = await store.find('Daily_Team_Availability', (r) => day(r.Availability_Date) === date);
  const active = new Set(rows.filter((r) => text(r.Availability_Status) !== 'Not Available').map((r) => text(r.Installer)));
  const maxTeams = Number(policy('delivery_max_teams')) || 3;
  return Math.min(active.size, maxTeams);
}

async function openJobsFor(store) {
  return store.find(SA, (r) => OPEN_STATUS(r.Appointment_Status) && SITE_TYPES.has(text(r.Type_of_Delivery)) && text(r.Fleet_Decision) !== '3rd Party');
}

// Read-only. `now`/`daysAvailable` let a test fix "today" and the crew-sizing window without faking the clock.
export async function getDeliveryBacklog(store, { now = new Date(), daysAvailable = 3 } = {}) {
  const policy = await policyReader(store);
  const sitesPerTeamPerDay = Number(policy('delivery_sites_per_team_per_day')) || 3;
  const jobs = await openJobsFor(store);
  const dropoffs = jobs.filter((r) => text(r.Type_of_Delivery) === 'Delivery Only');
  const due = jobs.filter((r) => DUE_CATEGORIES.has(text(r.Category)));
  const teamsPerDay = await teamsPerDayFor(store, ymd(now), policy);

  return {
    openJobs: jobs.length, openDropoffs: dropoffs.length, openJobsDue: due.length,
    teamsPerDay, sitesPerTeamPerDay, daysAvailable,
    backlogDays: backlogDays(jobs.length, teamsPerDay, sitesPerTeamPerDay),
    backlogDaysIfDropoffsOutsourced: backlogDays(jobs.length - dropoffs.length, teamsPerDay, sitesPerTeamPerDay),
    dropoffShare: jobs.length ? dropoffs.length / jobs.length : 0,
    teamsNeeded: teamsNeeded(due.length, sitesPerTeamPerDay, daysAvailable),
  };
}
