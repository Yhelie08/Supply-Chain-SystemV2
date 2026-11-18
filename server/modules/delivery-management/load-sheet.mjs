// Load sheet (spec v1.4, Delivery 03 §2, LS-R1/LS-R2): for a team-day's day plan, the printable loading list.
// Read-only — pure data assembly from the day plan and its stops' appointments. LS-R3 (confirming the loaded
// box count per stop) is day-plans.mjs's confirmStopLoading, not here.
import { findDayPlan, stopIds } from './day-plans.mjs';
import { SA, customerName } from './scheduling.mjs';
import { blank, toNum, truthy } from '../../workflows/deluge.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
function firstName(sa) {
  const c = sa?.Customer_Name;
  if (c && typeof c === 'object' && !blank(c.first_name)) return text(c.first_name);
  return customerName(sa || {}).split(' ')[0] || '';
}

// LS-R1: reverse drop order — the list is printed with the LAST stop first, so its boxes are loaded first and
// come off last, meaning the FIRST stop's boxes are the ones nearest the door and come off first.
// LS-R2: job, customer first name and city, box count, fragile/two-person flags, crate marks. No price, no
// payment data is read at all, so none can appear.
export async function buildLoadSheet(store, date, installer) {
  const plan = await findDayPlan(store, date, installer);
  if (!plan) return null;
  const ids = stopIds(plan);
  const stopRows = plan.Stops || [];
  const dropOrder = await Promise.all(ids.map(async (id, i) => {
    const sa = await store.getRecordById(SA, id, { raw: true });
    const stop = stopRows.find((r) => text(r.SA_ID) === id) || {};
    return {
      stop_number: i + 1,
      sa_id: id,
      sales_order: text(sa?.Sales_Order),
      customer_first_name: firstName(sa),
      city: text(sa?.City),
      box_count: toNum(sa?.Box_Count),
      fragile: truthy(sa?.Fragile),
      two_person: truthy(sa?.Two_Person),
      crate_marks: text(sa?.Crate_Marks),
      loaded_box_count: toNum(stop.Loaded_Box_Count),
      loading_confirmed: truthy(stop.Loading_Confirmed),
    };
  }));
  return { plan_date: date, installer, driver: text(plan.Driver), drop_order: dropOrder, load_order: dropOrder.slice().reverse() };
}
