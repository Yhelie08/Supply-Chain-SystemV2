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
// "Delivered" is a Zoho-era status still on one Production job; for Analytics it counts as done, like Completed
// (owner's call, 2026-11-19). Only these Analytics numbers change; scheduling treats statuses as before.
const OPEN_STATUS = (status) => !['Completed', 'Delivered', 'Failed'].includes(text(status));
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

// Weekly trend (the spec's "weekly trend" line, Delivery 09). Nothing is stored: the backlog at the end of an
// earlier day is rebuilt from the jobs themselves -- a job was open then if it was created on or before that day
// (Added_Time) and not finished by the end of it (finish day = Job_Done_At, or Actual_Delivery_Date carried over
// from Zoho; NOT Modified_Time, which on migrated jobs is the migration time). Today's point is simply every job
// that is open right now, so it always equals the live calculator. teams_per_day is that day's
// Daily_Team_Availability. Honest limits, all reported back, never guessed: third-party is judged by the job's
// CURRENT Fleet_Decision; a day with no availability rows has no teams number so its backlog is null; jobs
// migrated from Zoho have no Added_Time (`noCreatedDate`) and finished jobs may have no finish date
// (`noDoneDate`), so EARLIER weeks undercount by about that many jobs.
const parseDay = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(v)); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
const finishDay = (r) => parseDay(r.Job_Done_At) || parseDay(r.Actual_Delivery_Date);

export async function getBacklogTrend(store, { now = new Date(), weeks = 8 } = {}) {
  const policy = await policyReader(store);
  const sitesPerTeamPerDay = Number(policy('delivery_sites_per_team_per_day')) || 3;
  const jobs = await store.find(SA, (r) => SITE_TYPES.has(text(r.Type_of_Delivery)) && text(r.Fleet_Decision) !== '3rd Party');
  const noCreatedDate = jobs.filter((r) => !parseDay(r.Added_Time)).length;
  const noDoneDate = jobs.filter((r) => !OPEN_STATUS(r.Appointment_Status) && !finishDay(r)).length;
  const points = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
    const date = ymd(d);
    const open = i === 0
      ? jobs.filter((r) => OPEN_STATUS(r.Appointment_Status)).length
      : jobs.filter((r) => {
        const created = parseDay(r.Added_Time);
        if (!created || created > date) return false;
        if (OPEN_STATUS(r.Appointment_Status)) return true;
        const finished = finishDay(r);
        return !!finished && finished > date; // finished with no date: cannot be placed, counted in noDoneDate
      }).length;
    const rows = await store.find('Daily_Team_Availability', (r) => day(r.Availability_Date) === date);
    const teams = rows.length ? await teamsPerDayFor(store, date, policy) : null;
    const bd = teams == null ? null : backlogDays(open, teams, sitesPerTeamPerDay);
    points.push({ date, openJobs: open, teamsPerDay: teams, backlogDays: bd === Infinity ? null : bd }); // open jobs but no team = no number, not "infinite"
  }
  return { weeks, sitesPerTeamPerDay, points, noCreatedDate, noDoneDate };
}

// Read-only. `now`/`daysAvailable` let a test fix "today" and the crew-sizing window without faking the clock.
export async function getDeliveryBacklog(store, { now = new Date(), daysAvailable = 3, overrides = {} } = {}) {
  const policy = await policyReader(store, overrides); // overrides: previews only (Control Panel)
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
