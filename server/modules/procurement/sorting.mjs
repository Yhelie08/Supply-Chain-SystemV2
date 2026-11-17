// The Sorting Engine for Procurement (spec 05 Shared Engines / 01): scan -> categorise -> sort -> suggest.
// Plain code, no AI: the same input always gives the same answer, so "why is this first?" has one reply.
//
// Categories (Procurement): act_now, tell_customer, watch, on_track, plus blocked (a separate list with a reason).
//   broken        a replacement for a damaged / missing item (an RR): first in every queue
//   act_now       the forecast pickable date misses the date needed AND something can still change it
//   tell_customer it will miss and nothing is left to change
//   watch         on track but the slack is <= proc_watch_slack_days
//   blocked       cannot be worked: a PR on hold or cancelled, no supplier
// Sort inside a category: manual urgency, then Order Date ascending (oldest first), then target, then record number (SE-1 .. SE-5).
// Pure functions: ship-track.mjs gathers the facts and writes the result.
import { addDays, dayDiff, ymd } from '../../workflows/deluge.mjs';
import { dateNeeded, normMode } from './plan.mjs';

export const CATEGORY_ORDER = ['broken', 'act_now', 'tell_customer', 'watch', 'on_track'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (d) => `${d.getDate()} ${MON[d.getMonth()]}`;

// row: { stage, orderDate, target, forecastPickable, mode, held (reason text | ''), noSupplier, ladderRung, daysLate, productionStarted,
//        productionFinished, arrivalPlanned, lastSupplierUpdate, stageSince }
// -> { category, blocked_reason, priority_reason, suggested_action, date_needed, slack_days, no_target }
export function categorise(row, settings, today) {
  const out = categoriseBase(row, settings, today);
  // spec 06 RR-R4: a replacement (the shipment carries an RR) is BROKEN: first in every queue, above Act now. A blocked one stays blocked.
  if (row.broken && out.category !== 'blocked' && row.stage !== 'received') {
    out.category = 'broken';
    out.priority_reason = [`Replacement ${row.broken}`, out.priority_reason].filter(Boolean).join(' · ');
  }
  return out;
}
function categoriseBase(row, settings, today) {
  const out = { category: 'on_track', blocked_reason: '', priority_reason: '', suggested_action: '', date_needed: null, slack_days: null, no_target: false };
  const parts = [];

  if (row.orderDate) parts.push(`SO dated ${dm(row.orderDate)} (${dayDiff(today, row.orderDate)} days)`);
  else parts.push('no order date');

  if (row.stage === 'received') { out.priority_reason = 'Received'; return out; }

  // Blocked is checked first (spec: a blocked record is not in the work list whatever its age)
  const reason = row.held ? row.held : row.noSupplier ? 'No supplier on the shipment' : '';
  if (reason) {
    return { ...out, category: 'blocked', blocked_reason: reason, priority_reason: [...parts, `Blocked: ${reason}`].join(' · '), suggested_action: `Clear the block: ${reason}` };
  }

  // A record with no Target Delivery uses order date + default_promise_days, and says so; it is never pushed to the bottom.
  let target = row.target;
  if (!target && row.orderDate) { target = addDays(row.orderDate, settings.default_promise_days); out.no_target = true; parts.push('no target set'); }
  if (!target) { out.priority_reason = [...parts, 'no target to compare'].join(' · '); return out; }

  const needed = dateNeeded(settings, target);
  out.date_needed = ymd(needed);
  const forecast = row.forecastPickable;
  if (!forecast) { out.priority_reason = [...parts, 'no forecast yet'].join(' · '); return out; }
  const slack = dayDiff(needed, forecast);
  out.slack_days = slack;
  const miss = slack < 0;

  const shippedOut = row.stage !== 'production';
  const air = normMode(row.mode) === 'Airfreight';
  const changeable = !shippedOut && (!air || !row.productionStarted || row.ladderRung > 0);

  if (miss && changeable) out.category = 'act_now';
  else if (miss) out.category = 'tell_customer';
  else if (slack <= settings.proc_watch_slack_days) out.category = 'watch';

  parts.push(miss ? `forecast ${-slack} days past the date needed` : `${slack} days of slack`);
  parts.push(row.stage.replace('_', ' '));
  if (row.stageSince != null && row.stageSince >= 1) parts.push(`${row.stageSince} days in this stage`);
  out.priority_reason = parts.join(' · ');

  out.suggested_action = suggestedAction(row, out, settings, today, air);
  return out;
}

// The lookup of suggested actions (spec: a table editable by Admin; fixed here until the Control Panel exists).
function suggestedAction(row, out, settings, today, air) {
  if (row.stage === 'production') {
    if (!row.productionStarted && row.daysLate >= 1) {
      return row.daysLate === 1 ? 'Call the supplier (ladder rung 1)' : row.daysLate === 2 ? 'Ask the supplier for a discount in writing (ladder rung 2)' : 'Decide: cancel and re-source, or hold (ladder rung 3)';
    }
    if (row.productionFinished) return 'Request booking';
    if (row.lastSupplierUpdate != null && row.lastSupplierUpdate >= 7) return 'Escalate: no supplier response for 7 days';
  } else if (row.stage === 'shipped_out' && row.arrivalPlanned && today > row.arrivalPlanned) {
    return 'Ask the forwarder for tracking';
  }
  if (out.category === 'act_now') return air ? 'Move the target date or tell the customer' : 'Upgrade to air (saves 16 days) or move the target';
  if (out.category === 'tell_customer') return 'Tell the sales agent and the customer';
  return '';
}

// Ranks the whole list (SE-3): category order first, then manual urgency, Order Date ascending, target ascending, record number.
// items: [{ id, no, category, orderDate, target, urgent }] -> Map(id -> rank). Blocked and on_track/received do not take part in the
// work-list rank: blocked records are ranked among themselves.
export function rank(items) {
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  const cmp = (a, b) => (Number(!!b.urgent) - Number(!!a.urgent))
    || ((a.orderDate?.getTime() ?? Infinity) - (b.orderDate?.getTime() ?? Infinity))
    || ((a.target?.getTime() ?? Infinity) - (b.target?.getTime() ?? Infinity))
    || natural(a.no, b.no);
  const ranks = new Map();
  let n = 0;
  for (const cat of [...CATEGORY_ORDER, 'blocked']) {
    const list = items.filter((i) => i.category === cat && !i.noRank).sort(cmp);
    if (cat === 'blocked') n = 0; // blocked is a separate list
    for (const i of list) ranks.set(i.id, ++n);
  }
  return ranks;
}
