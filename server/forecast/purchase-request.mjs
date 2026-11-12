// The purchase-request side of the forecast, ported from zoho-export/parsed/functions/fcStampPurchaseRequest.dg (458 lines) and
// fcPrToPreOrder.dg (61 lines), called by the workflow PR1_Forecast_Stamp ("on add or edit, on success" of Purchase_Request1).
//
// fcStampPurchaseRequest(prId) works out the forecast of one PR and stamps the PR and its Sales_Order_Fulfillment row;
// fcPrToPreOrder(prId) runs it and then copies the PR's forecast onto the Pre_Order_FF rows of that PR.
//
// It is a SECOND version of the ladder, not a copy of fcStampBySoNo, and the two differ (kept as written, "mirrors Zoho"):
//  - Nothing is stamped until the PR has a shipment mode (Local sourcing is exempt): a blank mode answers "wala pang
//    Shipment Mode ..." (see NULL_TEXT in stamp.mjs: whether a blank mode counts as blank is to be confirmed (?)).
//  - The window text has no "+Nd vs client" part; only the status uses the client date.
//  - The supplier lead time is added only when the shipment branch is NOT taken, that is when re-anchoring is off or the PR has
//    no number (the `else if` hangs on the shipment `if`); the order engine adds it in the plain Procurement position.
//  - The shipment branch loops all shipment rows with this PR and each row overrides the one before: a Delivered shipment
//    sets "At WH" (today, prep and delivery days), a shipment with a date shipped sets "In transit" (from that day, with the
//    full procurement day counts), so a later "In transit" row after a Delivered one keeps the Delivered day counts.
//  - With no Sales_Order_Fulfillment row the PR is never stock on hand; the prep start is read from the Gate, Pick, QC and Crate
//    rows of the SO without looking at the PR number, and with no prep start nothing counts as used.
//  - It always writes the PR and the SOF row (here only a value that differs, which gives the same result).
import { settingsFrom, bucketOf, finish } from './engine.mjs';
import { toDate, txt } from './stamp.mjs';
import { todayDate } from '../workflows/deluge.mjs';

const blank = (v) => v == null || v === '';
const dayOf = (v) => { const d = toDate(v); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso) => { const [y, m, d] = iso.split('-'); return `${MON[Number(m) - 1]} ${d}, ${y}`; };
const PREP = ['Picking', 'Pack', 'Quality Checking', 'Crate'];

async function stampIfDifferent(store, form, row, f) {
  const changes = {};
  if (dayOf(row.Forecast_Delivery) !== f.delivery) changes.Forecast_Delivery = f.delivery;
  if (row.Forecast_Window !== f.window) changes.Forecast_Window = f.window;
  if (row.Forecast_Status !== f.status) changes.Forecast_Status = f.status;
  if (Object.keys(changes).length) await store.updateRecord(form, row.ID, changes, { byForm: true });
}

export async function fcStampPurchaseRequest(store, prId, { today = todayDate() } = {}) {
  const settings = settingsFrom((await store.find('Forecast_Settings'))[0] ?? null);
  const id = String(prId ?? '');
  const [pr] = await store.find('Purchase_Request1', (r) => r.ID === id);

  // the PR: number, mode, sourcing, supplier lead time, and the day it was added (the anchor)
  const prNo = pr ? txt(pr.PR_No) : '';
  const modeVal = pr ? txt(pr.Shipment_Mode) : '';
  const srcVal = pr ? txt(pr.Sourcing_Type).toUpperCase() : '';
  const supLead = pr && !blank(pr.Required_Days_Lead) ? Math.trunc(Number(pr.Required_Days_Lead)) || 0 : 0;
  if (!pr || blank(pr.Added_Time) || !toDate(pr.Added_Time)) return `walang PR o walang Added_Time: ${id}`;
  let anchor = toDate(pr.Added_Time);

  // the order of this PR (the first Sales_Order_Fulfillment row)
  let sof = null; let soNo = ''; let stage = ''; let stockOnHand = false; let clientTarget = null;
  if (prNo !== '') {
    [sof] = await store.find('Sales_Order_Fulfillment', (r) => r.PR_No === prNo);
    if (sof) {
      soNo = txt(sof.SO_No); stage = txt(sof.Fulfillment_Stage);
      stockOnHand = !txt(sof.order_type).toUpperCase().includes('PRE ORDER');
      clientTarget = blank(sof.target_delivery_date) ? null : toDate(sof.target_delivery_date);
    }
  }

  // when did prep start (no PR filter here)
  let prepStart = null;
  if (soNo !== '') {
    const rows = [
      ...(await store.find('Sales_Order_Readiness_Gate', (r) => r.sales_order_number === soNo)),
      ...(await store.find('Pick1', (r) => r.SO === soNo)),
      ...(await store.find('Checker_Checklist', (r) => r.SO === soNo)),
      ...(await store.find('Crate_Checklist', (r) => r.SO === soNo)),
    ];
    for (const r of rows) { const d = blank(r.Added_Time) ? null : toDate(r.Added_Time); if (d && (!prepStart || d < prepStart)) prepStart = d; }
  }

  // no stamp until the mode is known (Local has none by design)
  if (modeVal.toUpperCase() === '' && srcVal !== 'LOCAL') return `wala pang Shipment Mode ang ${prNo} — hindi muna nagtatatak`;
  const { tMin, tMax, cMin, cMax, bucket } = bucketOf(settings, srcVal, modeVal);

  let position = 'Procurement';
  let sMin = tMin + cMin + settings.prepMin + settings.delMin;
  let sMax = tMax + cMax + settings.prepMax + settings.delMax;
  let laddered = false;
  if (settings.reAnchor && stage === 'For Delivery') {
    anchor = today; sMin = settings.delMin; sMax = settings.delMax; position = 'Ready'; laddered = true;
  } else if ((settings.reAnchor && stage === 'Order Readiness') || PREP.includes(stage)) {
    anchor = today;
    const used = prepStart ? Math.abs(Math.round((today - prepStart) / 86400000)) : 0;
    sMin = Math.max(0, settings.prepMin - used) + settings.delMin; sMax = Math.max(0, settings.prepMax - used) + settings.delMax;
    position = stage; laddered = true;
  }
  if (!laddered && stockOnHand) {
    anchor = today; sMin = settings.prepMin + settings.delMin; sMax = settings.prepMax + settings.delMax; position = 'Stock on hand'; laddered = true;
  }
  if (!laddered && settings.reAnchor && prNo !== '') {
    for (const sh of await store.find('Shipments')) {
      for (const row of sh.Supplier_Shipment_Details || []) {
        if (txt(row.PR_No) !== prNo) continue;
        const shipped = blank(row.Date_Shipped) ? null : toDate(row.Date_Shipped);
        if (txt(sh.Shipment_Status) === 'Delivered') {
          anchor = today; sMin = settings.prepMin + settings.delMin; sMax = settings.prepMax + settings.delMax; position = 'At WH';
        } else if (shipped) {
          anchor = shipped; position = 'In transit';
        }
      }
    }
  } else if (!laddered && settings.addSupLead) {
    sMin += supLead; sMax += supLead;
  }

  const f = finish({ today, anchor, sumMin: sMin, sumMax: sMax, bucket, position, clientTarget, variance: false });
  await stampIfDifferent(store, 'Purchase_Request1', pr, f);
  if (sof) await stampIfDifferent(store, 'Sales_Order_Fulfillment', sof, f);
  return `${prNo} -> ${longDate(f.delivery)} | ${f.window} | ${f.status}`;
}

export async function fcPrToPreOrder(store, prId, opts = {}) {
  const engineSaid = await fcStampPurchaseRequest(store, prId, opts);
  // read the PR back: the stamp has just written to it
  const [pr] = await store.find('Purchase_Request1', (r) => r.ID === String(prId ?? ''));
  const prNo = pr ? txt(pr.PR_No) : '';
  if (!pr || prNo === '') return `walang PR na ${prId}`;
  const fcDate = blank(pr.Forecast_Delivery) ? null : dayOf(pr.Forecast_Delivery);
  const fcWindow = pr.Forecast_Window ?? ''; const fcStatus = pr.Forecast_Status ?? '';
  // an empty PR forecast must not wipe the date already on the Pre Order row
  if (fcDate == null && fcStatus === '') return `${prNo} — wala pang forecast ang PR mismo. ${engineSaid}`;
  let hit = 0;
  for (const po of await store.find('Pre_Order_FF', (r) => r.PR === prNo)) {
    const changes = {};
    if (dayOf(po.Forecast_Delivery) !== (fcDate ?? '')) changes.Forecast_Delivery = fcDate ?? '';
    if (po.Forecast_Window !== fcWindow) changes.Forecast_Window = fcWindow;
    if (po.Forecast_Status !== fcStatus) changes.Forecast_Status = fcStatus;
    if (Object.keys(changes).length) await store.updateRecord('Pre_Order_FF', po.ID, changes, { byForm: true });
    hit += 1;
  }
  return `${prNo} -> ${hit} pre-order row | ${fcWindow} | ${fcStatus}`;
}
