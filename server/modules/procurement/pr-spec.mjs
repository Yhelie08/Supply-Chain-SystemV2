// Purchase Request, from the HomeCartel spec v1.4 (02 Procurement / 02 Purchase Request and Pricing, 05 Shared Engines 01, 03, 04).
// Added on top of the ported Zoho workflows (purchase-request.mjs), after them:
//   PR-R4  the supplier recommendation looks at price AND lead time against the target, and says why in words
//   PR-R5  pricing status: needs_pricing / auto_priced / needs_manual_quote (the buyer is told when a manual quote is needed)
//   PR-R6  feasibility on every PR: feasible / at_risk / impossible, the shortfall, the earliest date, the air option
//   PR-R7  hold / resume / cancel need a reason and are stamped (Stage_Events); a PR is never deleted (cancel it)
//   PR-R2  a Sales Order that Books voids puts its open PRs on hold at once
//   one state (Pr_State), Order Date (DT-1), and the sorting engine's category / rank / reason / action on every open PR (SE-1..5)
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, idOf, truthy, toNum, parseDate, ymd, addDays, dayDiff, todayDate } from '../../workflows/deluge.mjs';
import { supplierIndex } from '../../workflows/suppliers.mjs';
import { loadSettings, feasibility, supplierDaysFrom, normMode, parseLeadDays } from './plan.mjs';
import { rank } from './sorting.mjs';
import { logEvent, parseWhen } from './events.mjs';
import { notify } from './decisions-core.mjs';

const PR = 'Purchase_Request1';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const toDay = (v) => { const w = parseWhen(v); return w ? new Date(w.date.getFullYear(), w.date.getMonth(), w.date.getDate()) : parseDate(v); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (d) => `${d.getDate()} ${MON[d.getMonth()]}`;

// What only the server may write.
export const PR_SERVER_ONLY = ['Order_Date', 'Pr_State', 'Pricing_Status', 'Feasibility', 'Shortfall_Days', 'Earliest_Feasible_Date', 'Air_Option', 'Recommended_Supplier_Id',
  'Recommendation_Reason', 'Recommended_Supplier', 'Selected_Supplier_Id', 'Pr_Category', 'Blocked_Reason', 'Queue_Rank', 'Priority_Reason', 'Suggested_Action', 'Scored_At', 'Pr_Forecast_Pickable'];

export const prState = (r) => (text(r.Hold_Status) === 'Cancelled' ? 'cancelled' : text(r.PR_Status) === 'Converted to PO' ? 'converted' : text(r.Hold_Status) === 'On Hold' ? 'on_hold' : truthy(r.PR_READY_FOR_PO) ? 'ready_for_po' : 'open');

async function orderDateOf(store, pr) {
  const so = text(pr.Sales_Order);
  if (so === '') return toDay(pr.Added_Time) || todayDate(); // a manual PR (stock, no customer order): its creation date is the Order Date (spec, review #19)
  let best = null;
  for (const r of await store.find('Sales_Order_Fulfillment', (x) => text(x.SO_No) === so, { criteria: `(SO_No == "${so.replace(/["\\]/g, '')}")` })) {
    const d = toDay(r.SO_Created_Date);
    if (d && (!best || d < best)) best = d;
  }
  return best || toDay(pr.Added_Time) || todayDate();
}

// ---------- the supplier recommendation (PR-R4) ----------
const priceOf = (q) => (toNum(q.Negotiated) > 0 ? toNum(q.Negotiated) : toNum(q.Initial_Price) > 0 ? toNum(q.Initial_Price) : null);

// rows = the Supplier_Selected quotes, lb = the eligible suppliers. Returns { winnerId, reason, ok[] }.
export function recommend({ lb, sel, names, settings, supplierRows, target, mode, today }) {
  const cands = [];
  for (const r of lb) {
    if (r.Match_Category !== 'Match') continue;
    const id = idOf(r.Suppliers);
    const q = sel.find((x) => text(x.Supplier_ID) === id && !['Unavailable', 'Cannot Produce'].includes(text(x.Availability)));
    const price = q ? priceOf(q) : null;
    const lead = q && parseLeadDays(q.Lead_Time) > 0 ? parseLeadDays(q.Lead_Time) : null;
    if (price == null) continue;
    const name = names.get(id) ?? id;
    const f = target ? feasibility({ ...settings, ...supplierDaysFrom(supplierRows, name) }, { poDate: today, productionDays: lead, mode, target }) : { feasibility: null };
    cands.push({ id, name, price, lead, f });
  }
  if (!cands.length) return { winnerId: '', reason: 'No supplier has quoted a price yet.', cands };
  const known = cands.filter((c) => c.f.feasibility);
  const inTime = known.filter((c) => c.f.shortfall_days <= 0);
  const cheapest = (list) => [...list].sort((a, b) => a.price - b.price || (a.lead ?? 1e9) - (b.lead ?? 1e9))[0];
  if (!known.length) { const w = cheapest(cands); return { winnerId: w.id, reason: `${w.name}: CNY ${w.price}${w.lead ? `, lead ${w.lead} days` : ''}. There is no target date to compare with, so it is chosen on price and lead time.`, cands }; }
  if (inTime.length) {
    const w = cheapest(inTime);
    const late = known.filter((c) => c.f.shortfall_days > 0 && c.price < w.price).map((c) => `${c.name} is cheaper (CNY ${c.price}) but would be ${c.f.shortfall_days} days late`);
    return { winnerId: w.id, reason: `${w.name}: CNY ${w.price}, lead ${w.lead ?? 'not quoted'} days, arrives in time (${w.f.slack_days} days of slack).${late.length ? ' ' + late.join('; ') + '.' : ''}`, cands };
  }
  const w = [...known].sort((a, b) => a.f.shortfall_days - b.f.shortfall_days || a.price - b.price)[0];
  return { winnerId: w.id, reason: `No supplier can make the date. ${w.name} is the closest: ${w.f.shortfall_days} days late (earliest ${w.f.earliest_feasible_date}), CNY ${w.price}, lead ${w.lead ?? 'not quoted'} days.${w.f.air_option ? ' ' + w.f.air_option + '.' : ''}`, cands };
}

// ---------- before the save ----------
async function beforeSave({ input, previous, store, user }) {
  for (const f of PR_SERVER_ONLY) delete input[f];
  const rec = { ...(previous || {}), ...input };
  // PR-R7: hold / cancel need a reason; a held PR cannot be grouped, a cancelled one is closed
  const was = text(previous?.Hold_Status), now = text(rec.Hold_Status);
  if (now !== was && ['On Hold', 'Cancelled'].includes(now) && text(rec.Hold_Reason).trim() === '') throw new ZohoError(2001, `A reason is required to ${now === 'Cancelled' ? 'cancel' : 'put on hold'} this PR.`);
  if (was === 'Cancelled' && now !== 'Cancelled') throw new ZohoError(2001, 'A cancelled PR stays cancelled. Raise a new PR.');
  if (now !== was && ['On Hold', 'Cancelled'].includes(now)) { if (blank(input.Hold_Date)) input.Hold_Date = ymd(todayDate()); if (blank(input.Held_By)) input.Held_By = user || ''; }

  const settings = await loadSettings(store);
  const today = todayDate();
  const suppliers = await supplierIndex(store);
  const supplierRows = await store.find('Suppliers');
  const names = new Map([...suppliers.values()].map((s) => [s.id, s.displayName]));
  const mode = normMode(rec.Shipment_Mode);
  const target = toDay(rec.Target_Delivery);

  // the recommendation, in words (the winner of the ported rule is replaced: it chose the cheapest whatever the date)
  const lb = (rec.Supplier_Load_Balancing || []).map((r) => ({ ...r }));
  const sel = rec.Supplier_Selected || [];
  const r = recommend({ lb, sel, names, settings, supplierRows, target, mode, today });
  for (const row of lb) if (row.Match_Category === 'Match') row.Eligible_Supplier = idOf(row.Suppliers) === r.winnerId ? 'Recommended' : 'Available';
  if (lb.length) input.Supplier_Load_Balancing = lb;
  input.Recommended_Supplier_Id = r.winnerId;
  input.Recommended_Supplier = r.winnerId ? (names.get(r.winnerId) ?? '') : '';
  input.Recommendation_Reason = r.reason;

  // the selected supplier by ID, never by name (spec INQ-R6)
  const chosen = sel.filter((q) => truthy(q.Selected)).at(-1);
  input.Selected_Supplier_Id = chosen ? text(chosen.Supplier_ID) : '';

  // feasibility on every PR (PR-R6): the selected supplier's lead time, else the recommended one's
  const leadSel = toNum(rec.Required_Days_Lead) > 0 ? toNum(rec.Required_Days_Lead) : (r.cands.find((c) => c.id === r.winnerId)?.lead ?? 0);
  const supplierName = text(rec.Selected_Supplier) || names.get(r.winnerId) || '';
  const poDate = text(rec.PR_Status) === 'Converted to PO' && toDay(rec.Production_Date) ? addDays(toDay(rec.Production_Date), -1) : today;
  const f = feasibility({ ...settings, ...supplierDaysFrom(supplierRows, supplierName) }, { poDate, productionDays: leadSel || null, mode, target });
  Object.assign(input, f.feasibility
    ? { Feasibility: f.feasibility, Shortfall_Days: f.shortfall_days, Earliest_Feasible_Date: f.earliest_feasible_date ?? '', Air_Option: f.air_option ?? '' }
    : { Feasibility: '', Shortfall_Days: '', Earliest_Feasible_Date: '', Air_Option: '' });

  // pricing status (PR-R5): the pricing tool is outside this system; a price from an SRP / final cost / inquiry counts as priced
  const priced = truthy(rec.Final_price_confirmed) || toNum(rec.SRP_Approved_PR) > 0 || toNum(rec.Selcted_Final_Cost) > 0 || !blank(rec.inquiry_reference);
  input.Pricing_Status = priced ? 'auto_priced' : r.cands.length ? 'needs_pricing' : 'needs_manual_quote';

  const orderDate = await orderDateOf(store, rec);
  input.Order_Date = orderDate ? ymd(orderDate) : '';
  input.Pr_State = prState({ ...rec, ...input });
}

// ---------- after the save ----------
const EVENT_OF = { held: 'pr.held', resumed: 'pr.resumed', cancelled: 'pr.cancelled', converted: 'pr.converted', ready_for_po: 'pr.ready_for_po' };
async function afterSave({ id, record, previous, store, user }) {
  const log = (event, note = '') => logEvent(store, { recordType: 'pr', recordId: id, recordNo: record.PR_No, event, occurredAt: zohoNow(), source: 'user', actor: user || '', note });
  if (!previous) await logEvent(store, { recordType: 'pr', recordId: id, recordNo: record.PR_No, event: 'pr.created', occurredAt: text(record.Added_Time) || zohoNow(), source: 'user', actor: user || '' });
  const before = previous ? prState(previous) : null, after = prState(record);
  if (before !== after) {
    if (after === 'on_hold') await log(EVENT_OF.held, text(record.Hold_Reason));
    else if (after === 'cancelled') await log(EVENT_OF.cancelled, text(record.Hold_Reason));
    else if (before === 'on_hold') await log(EVENT_OF.resumed);
    if (after === 'ready_for_po' && before !== 'ready_for_po') await log(EVENT_OF.ready_for_po);
    if (after === 'converted') await log(EVENT_OF.converted, text(record.Link_PO_No));
  }
  if (text(record.Pricing_Status) === 'needs_manual_quote' && text(previous?.Pricing_Status) !== 'needs_manual_quote') {
    await notify(store, await loadSettings(store), { ship: { Shipment_No: record.PR_No, ID: id }, type: 'PR Needs Manual Quote', message: `${record.PR_No} has no price: it needs a manual quote.` });
  }
  await rescorePrs(store);
}

// The supplier's answer reaches the buyer's PR through the server's own write (no hooks): work out the spec fields (recommendation in words,
// feasibility, pricing status, state) at once, not at the buyer's next save.
export async function refreshPrSpec(store, id) {
  const previous = await store.getRecordById(PR, id, { raw: true });
  const input = {};
  await beforeSave({ input, previous, id, store, user: '' });
  const diff = Object.fromEntries(Object.entries(input).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(previous[k])));
  if (Object.keys(diff).length) await store.updateRecord(PR, id, diff, { byForm: true });
  await rescorePrs(store);
}

register(PR, {
  beforeAdd: beforeSave,
  beforeUpdate: beforeSave,
  afterAdd: afterSave,
  afterUpdate: afterSave,
  beforeDelete: () => { throw new ZohoError(2001, 'A PR is never deleted: cancel it with a reason (Hold Status = Cancelled).'); },
});

// PR-R2: Books voids or cancels the Sales Order -> its open PRs go on hold at once, with the reason.
async function holdForVoidedSo({ record, previous, store }) {
  const status = (v) => text(v).toLowerCase();
  const isVoid = (v) => ['void', 'voided', 'cancelled', 'canceled'].includes(status(v));
  if (!isVoid(record.Order_Status) || isVoid(previous?.Order_Status)) return;
  const so = text(record.Sales_Order_Number);
  if (so === '') return;
  let held = 0;
  for (const pr of await store.find(PR, (p) => text(p.Sales_Order) === so && prState(p) !== 'converted' && prState(p) !== 'cancelled' && prState(p) !== 'on_hold')) {
    await store.updateRecord(PR, pr.ID, { Hold_Status: 'On Hold', Hold_Reason: 'SO voided in Books', Hold_Date: ymd(todayDate()), Held_By: 'books_sync', Pr_State: 'on_hold' }, { byForm: true });
    await logEvent(store, { recordType: 'pr', recordId: pr.ID, recordNo: pr.PR_No, event: 'pr.held', occurredAt: zohoNow(), source: 'sync', note: 'SO voided in Books' });
    held++;
  }
  if (held) await rescorePrs(store);
}
register('Sales_Order', { afterUpdate: holdForVoidedSo });

// ---------- the sorting engine for PRs ----------
function categorisePr(pr, settings, today) {
  const orderDate = toDay(pr.Order_Date) || toDay(pr.Added_Time);
  const target = toDay(pr.Target_Delivery);
  const out = { category: 'on_track', blocked_reason: '', priority_reason: '', suggested_action: '' };
  const parts = [orderDate ? `SO dated ${dm(orderDate)} (${dayDiff(today, orderDate)} days)` : 'no order date'];
  const state = prState(pr);
  const reasons = [];
  if (state === 'on_hold') reasons.push(`on hold: ${text(pr.Hold_Reason) || 'no reason'}`);
  else {
    if (!truthy(pr.Selected_Supplier1)) reasons.push('no supplier selected');
    if (!truthy(pr.Final_price_confirmed)) reasons.push('no price');
    if (!truthy(pr.Shipping_mode_selected)) reasons.push('no shipment mode');
    if (!truthy(pr.Target_date_exists)) reasons.push('no target date');
  }
  const f = text(pr.Feasibility);
  if (state === 'on_hold') { out.category = 'blocked'; out.blocked_reason = reasons.join(', '); out.suggested_action = 'Resume or cancel it'; }
  else if (f === 'impossible') { out.category = 'act_now'; out.suggested_action = pr.Air_Option ? `${pr.Air_Option}; or move the target to ${text(pr.Earliest_Feasible_Date)}` : `Choose a faster supplier or move the target to ${text(pr.Earliest_Feasible_Date)}`; }
  else if (reasons.length) { out.category = 'blocked'; out.blocked_reason = reasons.join(', '); out.suggested_action = text(pr.Pricing_Status) === 'needs_manual_quote' ? 'Get a manual quote' : `Complete it: ${reasons.join(', ')}`; }
  else if (f === 'at_risk') { out.category = 'watch'; out.suggested_action = 'Raise the PO soon: little slack'; }
  else if (state === 'ready_for_po') out.suggested_action = 'Ready: add it to a PO';
  if (f) parts.push(f === 'impossible' ? `${text(pr.Shortfall_Days)} days late if raised today` : f === 'at_risk' ? 'little slack' : 'feasible');
  if (out.blocked_reason) parts.push(`blocked: ${out.blocked_reason}`);
  out.priority_reason = parts.join(' · ');
  return { ...out, orderDate, target };
}

// Re-scores every open PR (the whole list, SE-3) and writes only what changed.
export async function rescorePrs(store, { today = todayDate() } = {}) {
  const settings = await loadSettings(store);
  const open = await store.find(PR, (p) => !['converted', 'cancelled'].includes(prState(p)), { criteria: '(PR_Status != "Converted to PO" && Hold_Status != "Cancelled")' });
  const scored = open.map((p) => ({ p, c: categorisePr(p, settings, today) }));
  const ranks = rank(scored.map(({ p, c }) => ({ id: String(p.ID), no: p.PR_No, category: c.category, orderDate: c.orderDate, target: c.target })));
  let changed = 0;
  for (const { p, c } of scored) {
    const want = { Pr_Category: c.category, Blocked_Reason: c.blocked_reason, Queue_Rank: ranks.get(String(p.ID)) ?? '', Priority_Reason: c.priority_reason, Suggested_Action: c.suggested_action };
    const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => text(v) !== text(p[k])));
    if (!Object.keys(diff).length) continue;
    await store.updateRecord(PR, p.ID, { ...diff, Scored_At: zohoNow() }, { byForm: true });
    changed++;
  }
  return { scored: scored.length, changed };
}

// An arrival/ladder update on a shipment re-forecasts the whole shipment, but a shipment can carry lines of several
// Sales Orders (several PRs grouped onto one PO, PO-R4). Spec 05 Shared Engines 03: the forecast must reach every
// Sales Order behind the shipment, not just the shipment record, so it also lands on each PR named in the shipment's
// PO_Shipments lines (PR_No). When a PR's lines are split across more than one shipment, the latest pickable date wins
// (the same "worst case shown" rule rollupPoCategories already uses for a PO's own shipments).
export async function rollupPrForecast(store, ships) {
  const byPr = new Map();
  for (const s of ships) {
    const forecast = text(s.Forecast_Pickable).slice(0, 10);
    if (!forecast) continue;
    for (const l of s.PO_Shipments || []) {
      const prNo = text(l.PR_No);
      if (!prNo) continue;
      if (!byPr.has(prNo) || byPr.get(prNo) < forecast) byPr.set(prNo, forecast);
    }
  }
  if (!byPr.size) return 0;
  let changed = 0;
  for (const p of await store.find(PR, (x) => byPr.has(text(x.PR_No)), { criteria: `(${[...byPr.keys()].map((k) => `PR_No == ${JSON.stringify(k)}`).join(' || ')})` })) {
    const forecast = byPr.get(text(p.PR_No)) ?? '';
    if (text(p.Pr_Forecast_Pickable) === forecast) continue;
    await store.updateRecord(PR, p.ID, { Pr_Forecast_Pickable: forecast }, { byForm: true });
    changed++;
  }
  return changed;
}
