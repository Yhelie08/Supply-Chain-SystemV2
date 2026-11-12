// fcStampBySoNo, ported from zoho-export/parsed/functions/fcStampBySoNo.dg: works out the forecast of ONE sales order and
// stamps Forecast_Delivery, Forecast_Window and Forecast_Status on the rows that belong to it (up to 9 forms).
// The ladder itself is in engine.mjs (pure); this file gathers the facts and writes the result.
//
// What it reads: the first Forecast_Settings record; the SO's Sales_Order_Fulfillment row (stage, order type, mode, client
// date, created date); the stage rows (Gate, Pick, QC, Order Aggregation, Crate) and, when no SOF or Gate row exists, the
// Pre Order row; the PR (added day, sourcing, supplier lead time, mode); and, only when the ladder can reach it, the
// shipment of that PR (day shipped, status, mode). What it writes: only a value that differs (the write itself can fire the
// same workflow again, and the second pass finds nothing to change, which is what stops the loop).
//
// Quirks kept ("mirrors Zoho"; the ones marked (?) are to be confirmed against Zoho Development):
//  - Blank text and the word "null": the Deluge builds `prNo`, `stage`, `otype`, `modeVal` and `sourcing` as `field + ""`,
//    and a blank field joined to text gives the text "null" (seen on Zoho Development for blank fleet and driver). So a
//    blank PR number is "null", which no PR has, rows with another PR number are then left out of the stamping, and a blank
//    shipment mode is "null", which is not empty, so the PR's and the shipment's mode are not used as a fallback (?).
//    `NULL_TEXT` below turns this off in one place if Zoho Development says otherwise.
//  - Only the FIRST Sales_Order_Fulfillment row of the SO is read and stamped (Zoho's loop keeps the first and the rest are
//    not stamped); the PR, Gate, Pick, QC, Order Aggregation, Crate and Receiving rows are all stamped.
//  - When several shipments carry the PR, the last one in the loop sets the status; a later row without a date keeps the
//    earlier date. The loop is in ID order.
//  - Receiving, Pick, QC, Order Aggregation, Crate and Gate rows that name another PR than the order's are skipped.
import { computeForecast, settingsFrom } from './engine.mjs';
import { todayDate, parseDate } from '../workflows/deluge.mjs';

export const NULL_TEXT = true;
const blank = (v) => v == null || v === '';
// Deluge `field + ""`
const txt = (v) => (blank(v) ? (NULL_TEXT ? 'null' : '') : String(v));

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// "2026-11-12", "2026-11-12 09:00:00 AM" or "12-Nov-2026" -> a local Date, null when it is not a date.
export function toDate(v) {
  if (v instanceof Date) return v;
  const s = String(v ?? '').trim();
  const iso = parseDate(s);
  if (iso) return iso;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s);
  const mo = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return m && mo >= 0 ? new Date(Number(m[3]), mo, Number(m[1])) : null;
}
const day = (v) => { const d = toDate(v); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; };
const ATPREP = ['For Delivery', 'Order Readiness', 'Picking', 'Pack', 'Quality Checking', 'Crate'];

const sameDay = (a, b) => day(a) === day(b);
async function stampRow(store, form, row, f) {
  const changes = {};
  if (!sameDay(row.Forecast_Delivery, f.delivery)) changes.Forecast_Delivery = f.delivery;
  if (row.Forecast_Window !== f.window) changes.Forecast_Window = f.window;
  if (row.Forecast_Status !== f.status) changes.Forecast_Status = f.status;
  if (Object.keys(changes).length) await store.updateRecord(form, row.ID, changes, { byForm: true });
}

export async function fcStampBySoNo(store, soNo, { today = todayDate() } = {}) {
  if (blank(soNo) || String(soNo) === 'null') return 'walang SO number na ipinasa';
  soNo = String(soNo);

  // 1. settings
  const settings = settingsFrom((await store.find('Forecast_Settings'))[0] ?? null);

  // 2. the Sales_Order_Fulfillment row (the first one)
  const [sof] = await store.find('Sales_Order_Fulfillment', (r) => r.SO_No === soNo);
  let prNo = ''; let stage = ''; let otype = ''; let modeVal = '';
  let clientTarget = null; let sofCreated = null;
  if (sof) {
    prNo = txt(sof.PR_No); stage = txt(sof.Fulfillment_Stage); otype = txt(sof.order_type).toUpperCase(); modeVal = txt(sof.Shipment_Mode);
    clientTarget = blank(sof.target_delivery_date) ? null : toDate(sof.target_delivery_date);
    sofCreated = blank(sof.SO_Created_Date) ? null : toDate(sof.SO_Created_Date);
  }

  // 3. the stage rows of this SO
  const gateRecs = await store.find('Sales_Order_Readiness_Gate', (r) => r.sales_order_number === soNo);
  const pickRecs = await store.find('Pick1', (r) => r.SO === soNo);
  const qcRecs = await store.find('Checker_Checklist', (r) => r.SO === soNo);
  const oaRecs = await store.find('Order_Aggregation1', (r) => r.SO === soNo);
  const crateRecs = await store.find('Crate_Checklist', (r) => r.SO === soNo);

  // 3a. no SOF yet: the first Gate row gives the order type, the client date and the PR, and the order is at Order Readiness
  if (!sof && gateRecs.length) {
    const g0 = gateRecs[0];
    otype = txt(g0.Order_Type).toUpperCase();
    if (!blank(g0.Target_Delivery_Date)) clientTarget = toDate(g0.Target_Delivery_Date);
    prNo = txt(g0.pr_number);
    stage = 'Order Readiness';
  }
  // 3b. neither: the Pre Order row (the goods are still awaited, so the PR tells the trip)
  if (!sof && stage === '') {
    const [po0] = await store.find('Pre_Order_FF', (r) => r.SO === soNo);
    if (po0) {
      otype = txt(po0.Order_Type).toUpperCase();
      if (!blank(po0.Target_Delivery)) clientTarget = toDate(po0.Target_Delivery);
      prNo = txt(po0.PR);
    }
  }
  const stockOnHand = !otype.includes('PRE ORDER');

  // 4. the PR: start of the chain, sourcing, supplier lead time, mode
  let prAdded = null; let sourcing = ''; let supLead = 0;
  if (prNo !== '') {
    const [pr] = await store.find('Purchase_Request1', (r) => r.PR_No === prNo);
    if (pr) {
      if (!blank(pr.Added_Time)) prAdded = toDate(pr.Added_Time);
      sourcing = txt(pr.Sourcing_Type);
      if (!blank(pr.Required_Days_Lead)) supLead = Math.trunc(Number(pr.Required_Days_Lead)) || 0;
      if (blank(modeVal)) modeVal = txt(pr.Shipment_Mode);
    }
  }

  // 5a. when did prep start: the earliest Added_Time of the Gate, Pick, QC and Crate rows (Order Aggregation is not counted)
  const forPr = (r, field) => !(prNo !== '' && !blank(r[field]) && r[field] !== prNo);
  let prepStart = null; let rowAdded = null;
  const earlier = (cur, d) => (d && (!cur || d < cur) ? d : cur);
  for (const g of gateRecs) if (forPr(g, 'pr_number')) { const a = toDate(g.Added_Time); if (!blank(g.Added_Time) && a) { prepStart = earlier(prepStart, a); rowAdded = earlier(rowAdded, a); } }
  for (const p of pickRecs) if (forPr(p, 'PR_if_any') && !blank(p.Added_Time)) prepStart = earlier(prepStart, toDate(p.Added_Time));
  for (const q of qcRecs) if (forPr(q, 'PR') && !blank(q.Added_Time)) prepStart = earlier(prepStart, toDate(q.Added_Time));
  for (const c of crateRecs) if (forPr(c, 'PR_if_any') && !blank(c.Added_Time)) prepStart = earlier(prepStart, toDate(c.Added_Time));

  // 5b. the anchor when there is no PR date: SO created day, then the first row that came in, then today
  if (!prAdded) prAdded = sofCreated ?? rowAdded ?? today;

  // 5c. the shipment, only when the ladder can reach it
  let dateShipped = null; let shipStatus = '';
  const atPrepStage = ATPREP.includes(stage);
  const needShip = !(settings.reAnchor && atPrepStage) && !stockOnHand;
  if (prNo !== '' && needShip) {
    for (const sh of await store.find('Shipments')) {
      for (const row of sh.Supplier_Shipment_Details || []) {
        if (txt(row.PR_No) === prNo) {
          shipStatus = txt(sh.Shipment_Status);
          if (!blank(row.Date_Shipped)) dateShipped = toDate(row.Date_Shipped);
          if (blank(modeVal)) modeVal = txt(row.Shipment_Mode);
        }
      }
    }
  }
  // Date_Shipped keeps whatever an earlier shipment row gave when this one is empty, as in the script (one variable).

  const f = computeForecast({ today, settings, stage, stockOnHand, modeVal, sourcing, supLead, prAdded, prepStart, prepFound: !!prepStart, dateShipped, shipStatus, clientTarget });
  if (f.skip) return `${soNo} — walang mapagsimulang petsa, hindi nagtatak`;

  // 7. stamp
  let stamped = 0;
  const stamp = async (form, rows) => { for (const r of rows) { await stampRow(store, form, r, f); stamped += 1; } };
  if (sof) await stamp('Sales_Order_Fulfillment', [sof]);
  if (prNo !== '') await stamp('Purchase_Request1', await store.find('Purchase_Request1', (r) => r.PR_No === prNo));
  await stamp('Sales_Order_Readiness_Gate', gateRecs.filter((g) => forPr(g, 'pr_number')));
  await stamp('Pre_Order_FF', await store.find('Pre_Order_FF', (r) => r.SO === soNo));
  await stamp('Pick1', pickRecs.filter((p) => forPr(p, 'PR_if_any')));
  await stamp('Checker_Checklist', qcRecs.filter((q) => forPr(q, 'PR')));
  await stamp('Order_Aggregation1', oaRecs.filter((o) => forPr(o, 'PR')));
  await stamp('Crate_Checklist', crateRecs.filter((c) => forPr(c, 'PR_if_any')));
  await stamp('Receiving', await store.find('Receiving', (r) => r.SO_No === soNo));
  // The Shipments form is not stamped here (reading it is a full pass); the daily schedule does it.

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, dd] = f.delivery.split('-');
  return `${soNo} -> ${MON[Number(m) - 1]} ${dd}, ${y} | ${f.window} | ${f.status} | ${stamped} record`;
}
