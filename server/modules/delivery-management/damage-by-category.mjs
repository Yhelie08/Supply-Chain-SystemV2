// Delivery Analytics key number #3 (spec v1.4, Delivery 09): damage rate by item category, in QUANTITY.
// Read-only, no new fields.
//
//   damage rate = damaged quantity / quantity handled, per Items.category
//
// quantity handled = the Item_Details quantities of every finished delivery job (Completed or Failed) in the
//   window, by its done date. Pick Up / Pull Out / Site Visit jobs are not deliveries and are left out.
// damaged quantity, two sources, never counted twice for the same job:
//   (a) a job that Failed with Failure_Reason_Code "damaged_in_transit": ALL its lines count as damaged. This is
//       an approximation (the app records the reason for the whole job, not per line), shown as such on screen.
//   (b) a Sales_Returns_Form row received as "Damaged" in the window: its Return_Quantity per line counts, unless
//       the return came from a job already counted in (a) (Source_SA_ID).
// A SKU with no category in Items is counted under "Uncategorized".
import { blank } from '../../workflows/deluge.mjs';
import { SA } from './scheduling.mjs';

const RETURNS = 'Sales_Returns_Form';
const ITEMS = 'Items';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const DELIVERY_TYPES = new Set(['With Installation', 'Delivery Only']);
const DONE = new Set(['Completed', 'Delivered', 'Failed']); // "Delivered" = Zoho-era Completed (owner's call, 2026-11-19)
const UNCATEGORIZED = 'Uncategorized';

// "2026-11-18 03:45:00 PM" or "2026-11-18" -> Date (local). Same small per-file parser the other Delivery files use.
function parseZoho(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(text(v));
  if (!m) return null;
  let h = m[4] == null ? 0 : Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
}
const qty = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const round1 = (n) => Math.round(n * 10) / 10;

// A job counts on the day it finished: Job_Done_At, or Actual_Delivery_Date (a real date carried over from
// Zoho for jobs finished before the Job status chain existed). Modified_Time is NOT used: on migrated jobs it is
// the migration time, not the delivery (found on the Production backup, 2026-11-19). A finished job with
// neither date is left out and counted in `undated`.
const doneAt = (sa) => parseZoho(sa.Job_Done_At) || parseZoho(sa.Actual_Delivery_Date);

export function damageRate(damaged, handled) {
  return handled > 0 ? round1((damaged / handled) * 100) : null;
}

export async function getDamageByCategory(store, { now = new Date(), days = 90 } = {}) {
  const since = new Date(now.getTime() - days * 86400000);
  const [jobs, returns, items] = await Promise.all([
    store.find(SA, (r) => DONE.has(text(r.Appointment_Status)) && DELIVERY_TYPES.has(text(r.Type_of_Delivery)) && text(r.If_Pull_Out) !== 'Yes'),
    store.find(RETURNS, (r) => text(r.Received_Condition) === 'Damaged'),
    store.find(ITEMS, (r) => !blank(r.SKU)),
  ]);
  const categoryOf = new Map(items.map((i) => [text(i.SKU), text(i.category) || UNCATEGORIZED]));
  const cat = (sku) => categoryOf.get(text(sku)) || UNCATEGORIZED;

  const rows = new Map(); // category -> { handled, damaged }
  const row = (c) => { if (!rows.has(c)) rows.set(c, { handled: 0, damaged: 0 }); return rows.get(c); };
  const countedJobs = new Set(); // job IDs whose lines are already counted as damaged, source (a)

  let undated = 0;
  for (const j of jobs) {
    const at = doneAt(j);
    if (!at) { undated++; continue; }
    if (at < since || at > now) continue;
    const damagedJob = text(j.Appointment_Status) === 'Failed' && text(j.Failure_Reason_Code) === 'damaged_in_transit';
    if (damagedJob) countedJobs.add(text(j.ID));
    for (const line of j.Item_Details || []) {
      const n = qty(line?.Quantity);
      if (!n) continue;
      row(cat(line.SKU)).handled += n;
      if (damagedJob) row(cat(line.SKU)).damaged += n;
    }
  }

  let returnsCounted = 0;
  for (const r of returns) {
    const at = parseZoho(r.Received_At);
    if (!at || at < since || at > now) continue;
    if (!blank(r.Source_SA_ID) && countedJobs.has(text(r.Source_SA_ID))) continue; // already counted as damaged via (a)
    for (const line of r.Items || []) {
      const n = qty(line?.Return_Quantity);
      if (!n) continue;
      row(cat(line.SKU)).damaged += n;
      returnsCounted += n;
    }
  }

  const categories = [...rows.entries()]
    .map(([category, v]) => ({ category, handled: v.handled, damaged: v.damaged, ratePct: damageRate(v.damaged, v.handled) }))
    .sort((a, b) => (b.ratePct ?? -1) - (a.ratePct ?? -1) || a.category.localeCompare(b.category));
  const handled = categories.reduce((s, c) => s + c.handled, 0);
  const damaged = categories.reduce((s, c) => s + c.damaged, 0);
  return { days, categories, handled, damaged, overallPct: damageRate(damaged, handled), returnsCounted, undated };
}
