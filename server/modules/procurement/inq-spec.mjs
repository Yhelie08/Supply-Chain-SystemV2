// Inquiry of the HomeCartel spec v1.4 (02 Procurement / 01 Inquiry, 05 Shared Engines 04), on the Inquiry_Form.
//   INQ-R2   a line the supplier marks Unavailable or Cannot Produce has no price and no lead time (the server clears them: the
//            screens only disable the fields)
//   INQ-R3   the selected quote's lead time is the production-day count, as a NUMBER (text like "3 weeks" is read): Selected_Lead_Days
//   INQ-R6   a quote row is matched by its supplier ID; the name is used only for old rows that have no ID (see portalOf)
//   INQ-R7   when the sales agent gave a needed-by date, each quote gets a feasibility hint: "Lead 20 days + sea -> earliest about 18 Jan"
//   stamps   Sent_At, First_Quote_At, Selected_At, Estimate_Pushed_At (the first stamp stays) and the events inquiry.sent,
//            first_quote_received, supplier_selected, estimate_pushed in the event log
//   alerts   the buyer is told when every quote is in, and when a supplier has not quoted after inquiry_quote_days (daily job)
// Not here (needs the roles or Books): the sales agent's "My inquiries" without prices (C12), the Estimate becoming a Sales Order (INQ-R5).
import { register } from '../../workflows/index.mjs';
import { zohoNow } from '../../criteria.mjs';
import { blank, toNum, truthy, parseDate, ymd, dayDiff, todayDate } from '../../workflows/deluge.mjs';
import { loadSettings, feasibility, parseLeadDays } from './plan.mjs';
import { logEvent } from './events.mjs';
import { notify } from './decisions-core.mjs';

const FORM = 'Inquiry_Form';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const SERVER_ONLY = ['Sent_At', 'First_Quote_At', 'Selected_At', 'Estimate_Pushed_At', 'Selected_Lead_Days', 'Selected_Supplier_Id', 'Feasibility_Hints', 'Quotes_Alert_At'];
const NO_QUOTE = ['Unavailable', 'Cannot Produce'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (d) => { const x = d instanceof Date ? d : parseDate(d); return x ? `${x.getDate()} ${MONTHS[x.getMonth()]}` : ''; };
const unbr = (v) => text(v).replace(/^\[|\]$/g, '');

// a row counts as answered once the supplier gave an availability other than Pending, or any price
const rowAnswered = (q) => (!blank(q.Availability) && text(q.Availability) !== 'Pending') || toNum(q.Initial_Price) > 0 || toNum(q.Negotiated) > 0 || toNum(q.Final_Price) > 0;

// INQ-R2: the price and the lead time of a line that cannot be supplied are blanked
export function clearUnavailable(rows) {
  let changed = false;
  const out = (rows || []).map((q) => {
    if (!NO_QUOTE.includes(text(q.Availability))) return q;
    if (blank(q.Initial_Price) && blank(q.Negotiated) && blank(q.Final_Price) && blank(q.Lead_Time)) return q;
    changed = true;
    return { ...q, Initial_Price: '', Negotiated: '', Final_Price: '', Lead_Time: '' };
  });
  return { rows: out, changed };
}

function beforeSave({ input }) {
  for (const f of SERVER_ONLY) delete input[f];
  if (Array.isArray(input.Supplier_Quotes)) input.Supplier_Quotes = clearUnavailable(input.Supplier_Quotes).rows;
}

// INQ-R7: "Lead 20 days + sea -> earliest about 18 Jan (5 days after the date you need; by air about 4 Jan)"
export function hintsFor(settings, rec, today = todayDate()) {
  const target = parseDate(rec.target_date);
  if (!target) return '';
  const lines = [];
  for (const q of rec.Supplier_Quotes || []) {
    const lead = parseLeadDays(q.Lead_Time);
    if (NO_QUOTE.includes(text(q.Availability)) || lead <= 0) continue;
    const sea = feasibility(settings, { poDate: today, productionDays: lead, mode: 'LCL', target });
    if (!sea.feasible_by) continue;
    let line = `${text(q.Suppliers)}: Lead ${lead} days + sea -> earliest about ${nice(sea.feasible_by)}`;
    if (sea.feasibility === 'impossible') {
      line += ` (${sea.shortfall_days} days after the ${nice(target)} you need`;
      line += sea.air_feasible_by ? `; by air about ${nice(sea.air_feasible_by)}${sea.air_shortfall_days <= 0 ? ', in time' : `, still ${sea.air_shortfall_days} days late`})` : ')';
    } else line += ` (in time for ${nice(target)})`;
    lines.push(line);
  }
  return lines.join('\n');
}

async function afterSave({ id, record, previous, store }) {
  const rec = await store.getRecordById(FORM, id, { raw: true });
  const quotes = rec.Supplier_Quotes || [];
  const patch = {};
  const events = [];
  const now = zohoNow();
  const stamp = (col, ev, note = '') => { if (blank(rec[col])) { patch[col] = now; if (ev) events.push({ event: ev, note }); } };

  // sent: the inquiry went to its suppliers (a row for each one)
  if (quotes.length > 0) stamp('Sent_At', 'inquiry.sent', `${quotes.length} supplier(s)`);
  // the first quote that came back
  if (quotes.some(rowAnswered)) stamp('First_Quote_At', 'inquiry.first_quote_received');
  // the selected supplier (every change is an event; the stamp is the first)
  const sel = quotes.find((q) => truthy(q.Selected));
  const selId = sel ? unbr(sel.Supplier_ID) || text(sel.Suppliers) : '';
  if (selId !== text(rec.Selected_Supplier_Id)) {
    patch.Selected_Supplier_Id = selId;
    patch.Selected_Lead_Days = sel ? parseLeadDays(sel.Lead_Time) || '' : '';
    if (sel) { stamp('Selected_At', null); events.push({ event: 'inquiry.supplier_selected', note: text(sel.Suppliers) }); }
  } else if (sel && toNum(rec.Selected_Lead_Days) !== parseLeadDays(sel.Lead_Time)) {
    patch.Selected_Lead_Days = parseLeadDays(sel.Lead_Time) || ''; // the supplier changed the lead time of the selected quote
  }
  if (truthy(rec.Estimate_Created)) stamp('Estimate_Pushed_At', 'inquiry.estimate_pushed', text(rec.Books_Estimate_No));

  // INQ-R7
  const settings = await loadSettings(store);
  const hints = hintsFor(settings, rec);
  if (hints !== text(rec.Feasibility_Hints)) patch.Feasibility_Hints = hints;

  // the buyer is told once when every supplier has answered
  if (quotes.length > 0 && quotes.every(rowAnswered) && blank(rec.Quotes_Alert_At)) {
    patch.Quotes_Alert_At = now;
    await notify(store, settings, { ship: { Shipment_No: rec.INQ_No, ID: rec.ID }, type: 'Inquiry Quotes Complete', message: `${rec.INQ_No}: every supplier has quoted. You can select one.`, page: 'Inquiry' });
  }

  if (Object.keys(patch).length) await store.updateRecord(FORM, id, patch, { byForm: true });
  for (const e of events) await logEvent(store, { recordType: 'inquiry', recordId: id, recordNo: rec.INQ_No, event: e.event, occurredAt: now, source: 'system', note: e.note });
}

register(FORM, { beforeAdd: beforeSave, beforeUpdate: beforeSave, afterAdd: afterSave, afterUpdate: afterSave });

// A supplier's answer reaches the inquiry through the server's own write (no hooks), so the steps above would wait for the buyer's next save.
// This runs them at once: clear the price of a line that cannot be supplied (INQ-R2), then the stamps, events, hints and alerts.
export async function refreshInquirySpec(store, id) {
  const rec = await store.getRecordById(FORM, id, { raw: true });
  const { rows, changed } = clearUnavailable(rec.Supplier_Quotes || []);
  if (changed) await store.updateRecord(FORM, id, { Supplier_Quotes: rows }, { byForm: true });
  await afterSave({ id, store });
}

// Daily: a supplier that has not quoted after inquiry_quote_days (spec: Buyer notification, DEFAULT 2 days). One alert per inquiry.
export async function runInquiryDaily(store, { now = new Date() } = {}) {
  const settings = await loadSettings(store);
  const days = toNum(settings.inquiry_quote_days) || 2;
  const today = todayDate();
  let alerted = 0;
  for (const inq of await store.find(FORM)) {
    if (blank(inq.Sent_At) || truthy(inq.Estimate_Created)) continue;
    const quotes = inq.Supplier_Quotes || [];
    const waiting = quotes.filter((q) => !rowAnswered(q));
    if (!waiting.length) continue;
    const sent = parseDate(String(inq.Sent_At).slice(0, 10));
    if (!sent || dayDiff(today, sent) < days) continue;
    const done = await store.find('Stage_Events', (e) => e.Record_Type === 'inquiry' && String(e.Record_Id) === String(inq.ID) && e.Event === 'inquiry.no_quote_alert');
    if (done.length) continue;
    const names = waiting.map((q) => text(q.Suppliers)).join(', ');
    await notify(store, settings, { ship: { Shipment_No: inq.INQ_No, ID: inq.ID }, type: 'Inquiry No Quote', message: `${inq.INQ_No}: no quote from ${names} after ${days} days. Call them.`, page: 'Inquiry' });
    await logEvent(store, { recordType: 'inquiry', recordId: inq.ID, recordNo: inq.INQ_No, event: 'inquiry.no_quote_alert', occurredAt: zohoNow(now), source: 'system', note: names });
    alerted++;
  }
  return { alerted };
}
