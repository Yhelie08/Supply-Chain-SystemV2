// The two daily forecast schedules, ported from zoho-export/parsed/workflows/schedule/_/:
//   Forecast_Stamp_Daily          (1,546 lines, 01:00 Asia/Manila)  runForecastStampDaily
//   Backfill_PreOrder_Forecas     (68 lines, 01:00 Asia/Manila)     runBackfillPreOrder
//
// Forecast_Stamp_Daily does what fcStampBySoNo does on save, for EVERY order, but differently in two ways that are on purpose
// in Zoho and are kept here (the ladder itself, computeForecast, is the same function):
//  - It is PER ITEM. One Sales_Order_Fulfillment row is one item; the row is identified by PR + SKU (the SKU comes from
//    SO_SKU_Key, "<SO>_<SKU>", normalised: trimmed, upper case, a "SKU:" prefix removed). An item is stock on hand when it has
//    no PR (so_to_pr only makes a PR when there is no stock). The stage rows (Gate, Pick, QC, Crate) are matched to the item by
//    SKU when any row of that form carries it, else by PR number as before.
//  - The forms with no SKU (Receiving, Order Aggregation, Service Request, Service Appointment) get the ROLL-UP of the order: the
//    LATEST date of all its items and the WORST status (No Start Date < No Client Date < On Track < At Risk < Will Miss < Overdue),
//    with "| item <SKU>" in the window naming the item that decided the date.
//  - The shipment of a PR is the one with the EARLIEST Date_Shipped (the shipment index is built in one pass).
// A second pass stamps the PRs that have no SOF yet (always "No Client Date"; "No Start Date" when the PR has no Added_Time).
// The settings form Schedule_Test_Settings can set a test "today" (Test_Current_Date).
//
// Differences from Zoho, on purpose: all the tables are read once into memory and indexed (Zoho re-queries per row, which is
// why its schedule is slow); the stamps are written only where a value differs (as in Zoho). "Today" is the server's date.
import { computeForecast, settingsFrom, bucketOf, finish } from './engine.mjs';
import { toDate, txt } from './stamp.mjs';
import { todayDate } from '../workflows/deluge.mjs';

const blank = (v) => v == null || v === '';
const dayStr = (v) => { const d = blank(v) ? null : toDate(v); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; };
const RANK = { 'No Start Date': 1, 'No Client Date': 2, 'On Track': 3, 'At Risk': 4, 'Will Miss': 5, 'Overdue': 6 };

// `(x + "").trim().toUpperCase()` and the "SKU:" prefix, as the script normalises a SKU; blank and "NULL" are no SKU.
const normSku = (v) => {
  let s = txt(v).trim().toUpperCase();
  if (s === 'NULL') s = '';
  if (s.startsWith('SKU:')) s = s.replace('SKU:', '').trim();
  return s;
};
const group = (rows, key) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };

// Writes the three fields to a row only where a value differs, and keeps the in-memory row in step (the same row can be stamped
// by several items of one order, each seeing what the one before wrote).
async function put(store, form, rows, f) {
  for (const row of rows) {
    const changes = {};
    const want = f.delivery ?? '';
    if (dayStr(row.Forecast_Delivery) !== want) changes.Forecast_Delivery = want;
    if ((row.Forecast_Window ?? '') !== f.window) changes.Forecast_Window = f.window;
    if ((row.Forecast_Status ?? '') !== f.status) changes.Forecast_Status = f.status;
    if (Object.keys(changes).length) { await store.updateRecord(form, row.ID, changes, { byForm: true }); Object.assign(row, changes); }
  }
}

export async function runForecastStampDaily(store, { today: given, log = () => {} } = {}) {
  const settings = settingsFrom((await store.find('Forecast_Settings'))[0] ?? null);
  let today = given ?? todayDate();
  for (const s of await store.find('Schedule_Test_Settings')) if (!blank(s.Test_Current_Date)) today = toDate(s.Test_Current_Date) ?? today;

  // 2. the shipment index: per PR the earliest Date_Shipped wins (the first row when none has a date)
  const ships = await store.find('Shipments');
  const shipById = new Map(ships.map((s) => [s.ID, s]));
  const shipByPr = new Map();
  for (const sh of ships) {
    for (const row of sh.Supplier_Shipment_Details || []) {
      if (blank(row.PR_No)) continue;
      const pk = txt(row.PR_No);
      const ds = blank(row.Date_Shipped) ? null : toDate(row.Date_Shipped);
      const cur = shipByPr.get(pk);
      if (!cur || (ds && (!cur.date || ds < cur.date))) shipByPr.set(pk, { id: sh.ID, date: ds, status: txt(sh.Shipment_Status), mode: blank(row.Shipment_Mode) ? '' : String(row.Shipment_Mode) });
    }
  }

  // everything else is read once and indexed
  const [sofs, prs, gates, picks, qcs, oas, crates, receivings, srs, sas] = await Promise.all(['Sales_Order_Fulfillment', 'Purchase_Request1', 'Sales_Order_Readiness_Gate', 'Pick1', 'Checker_Checklist', 'Order_Aggregation1', 'Crate_Checklist', 'Receiving', 'Service_Request1', 'Service_Appointment_Form'].map((f) => store.find(f)));
  const prByNo = group(prs, 'PR_No');
  const gateBySo = group(gates, 'sales_order_number'); const pickBySo = group(picks, 'SO'); const qcBySo = group(qcs, 'SO');
  const oaBySo = group(oas, 'SO'); const crateBySo = group(crates, 'SO'); const rcvBySo = group(receivings, 'SO_No');
  const srBySo = group(srs, 'Sales_Order'); const saBySo = group(sas, 'Sales_Order');

  // 3. the main pass: every Sales_Order_Fulfillment row (one item)
  let sofCount = 0; let stampCount = 0; let noDateCount = 0;
  const touched = new Set(); const best = new Map(); const bestWin = new Map(); const worst = new Map(); const worstRank = new Map();
  for (const sof of sofs) {
    sofCount += 1;
    const soNo = txt(sof.SO_No);
    let prNo = txt(sof.PR_No).trim();
    if (prNo === 'null') prNo = '';
    const hasPr = prNo !== '';
    let sofSku = '';
    let key = txt(sof.SO_SKU_Key).trim();
    if (key === 'null') key = '';
    if (key !== '') {
      sofSku = soNo !== '' ? key.replace(`${soNo}_`, '') : key;
      sofSku = sofSku.trim().toUpperCase();
      if (sofSku.startsWith('SKU:')) sofSku = sofSku.replace('SKU:', '').trim();
    }
    const clientTarget = blank(sof.target_delivery_date) ? null : toDate(sof.target_delivery_date);

    // 3a. the PR: start of the chain, sourcing, supplier lead, mode
    let prAdded = null; let sourcing = ''; let supLead = 0; let modeVal = txt(sof.Shipment_Mode);
    if (hasPr) {
      const pr = (prByNo.get(prNo) || [])[0];
      if (pr) {
        if (!blank(pr.Added_Time)) prAdded = toDate(pr.Added_Time);
        sourcing = txt(pr.Sourcing_Type);
        if (!blank(pr.Required_Days_Lead)) supLead = Math.trunc(Number(pr.Required_Days_Lead)) || 0;
        if (blank(modeVal)) modeVal = txt(pr.Shipment_Mode);
      }
    }
    if (!prAdded && !blank(sof.SO_Created_Date)) prAdded = toDate(sof.SO_Created_Date);
    // 3b. the shipment of the PR
    let dateShipped = null; let shipStatus = ''; let shipId = null;
    const ship = hasPr ? shipByPr.get(prNo) : null;
    if (ship) {
      shipId = ship.id; dateShipped = ship.date; shipStatus = ship.status;
      if (blank(modeVal)) modeVal = ship.mode;
    }
    // 3c. the stage rows of this SO, and whether a form has this item's SKU
    const gateRecs = gateBySo.get(soNo) || []; const pickRecs = pickBySo.get(soNo) || []; const qcRecs = qcBySo.get(soNo) || [];
    const oaRecs = oaBySo.get(soNo) || []; const crateRecs = crateBySo.get(soNo) || [];
    const hit = (rows) => sofSku !== '' && rows.some((r) => normSku(r.SKU) === sofSku);
    const skuHit = { gate: hit(gateRecs), pick: hit(pickRecs), qc: hit(qcRecs), crate: hit(crateRecs) };
    const matches = (row, which, prField) => (skuHit[which] ? normSku(row.SKU) === sofSku : !(hasPr && !blank(row[prField]) && row[prField] !== prNo));
    const mGate = gateRecs.filter((r) => matches(r, 'gate', 'pr_number'));
    const mPick = pickRecs.filter((r) => matches(r, 'pick', 'PR_if_any'));
    const mQc = qcRecs.filter((r) => matches(r, 'qc', 'PR'));
    const mCrate = crateRecs.filter((r) => matches(r, 'crate', 'PR_if_any'));
    let prepStart = null;
    for (const r of [...mGate, ...mPick, ...mQc, ...mCrate]) { const d = blank(r.Added_Time) ? null : toDate(r.Added_Time); if (d && (!prepStart || d < prepStart)) prepStart = d; }

    // 3d. the ladder (the same function as on save)
    const c = computeForecast({ today, settings, stage: txt(sof.Fulfillment_Stage), stockOnHand: !hasPr, modeVal, sourcing, supLead, prAdded, prepStart, prepFound: !!prepStart, dateShipped, shipStatus, clientTarget });
    const f = c.skip ? { delivery: null, window: 'Walang panimulang petsa', status: 'No Start Date' } : { delivery: c.delivery, window: c.window, status: c.status };
    if (c.skip) noDateCount += 1; else stampCount += 1;

    // 3d-bis. the roll-up of the order, for the forms with no SKU
    const rank = RANK[f.status] ?? 0;
    const rowWin = sofSku !== '' ? `${f.window} | item ${sofSku}` : f.window;
    const fresh = !touched.has(soNo);
    let rollChanged = fresh;
    if (fresh) {
      touched.add(soNo); bestWin.set(soNo, rowWin); worst.set(soNo, f.status); worstRank.set(soNo, rank);
      if (f.delivery != null) best.set(soNo, f.delivery);
    } else {
      if (f.delivery != null) {
        if (!best.has(soNo)) { best.set(soNo, f.delivery); bestWin.set(soNo, rowWin); rollChanged = true; }
        else if (f.delivery > best.get(soNo)) { best.set(soNo, f.delivery); bestWin.set(soNo, rowWin); rollChanged = true; }
      }
      if (rank > worstRank.get(soNo)) { worstRank.set(soNo, rank); worst.set(soNo, f.status); rollChanged = true; }
    }
    const roll = { delivery: best.has(soNo) ? best.get(soNo) : f.delivery, window: bestWin.get(soNo), status: worst.get(soNo) };

    // 3e. stamp: per item on the SOF, the PR, the shipment and the stage rows; the roll-up on the order-level forms
    await put(store, 'Sales_Order_Fulfillment', [sof], f);
    if (hasPr) await put(store, 'Purchase_Request1', prByNo.get(prNo) || [], f);
    if (shipId != null) await put(store, 'Shipments', shipById.has(shipId) ? [shipById.get(shipId)] : [], f);
    if (rollChanged && soNo !== '') await put(store, 'Receiving', rcvBySo.get(soNo) || [], roll);
    await put(store, 'Sales_Order_Readiness_Gate', mGate, f);
    await put(store, 'Pick1', mPick, f);
    await put(store, 'Checker_Checklist', mQc, f);
    if (rollChanged) await put(store, 'Order_Aggregation1', oaRecs, roll);
    await put(store, 'Crate_Checklist', mCrate, f);
    if (rollChanged && soNo !== '') {
      await put(store, 'Service_Request1', srBySo.get(soNo) || [], roll);
      await put(store, 'Service_Appointment_Form', saBySo.get(soNo) || [], roll);
    }
  }

  // 4. second pass: the PRs that have no SOF yet (always "No Client Date")
  const sofPrs = new Set(sofs.map((s) => s.PR_No));
  let prOnlyCount = 0;
  for (const pr of prs) {
    const prNo = txt(pr.PR_No);
    if (sofPrs.has(prNo)) continue;
    prOnlyCount += 1;
    const { tMin, tMax, cMin, cMax, bucket } = bucketOf(settings, txt(pr.Sourcing_Type), txt(pr.Shipment_Mode));
    let anchor = today; let found = false;
    if (!blank(pr.Added_Time) && toDate(pr.Added_Time)) { anchor = toDate(pr.Added_Time); found = true; }
    let position = 'Procurement';
    let sMin = tMin + cMin + settings.prepMin + settings.delMin; let sMax = tMax + cMax + settings.prepMax + settings.delMax;
    const sh = shipByPr.get(prNo);
    if (settings.reAnchor && sh) {
      if (sh.status === 'Delivered') { anchor = today; found = true; sMin = settings.prepMin + settings.delMin; sMax = settings.prepMax + settings.delMax; position = 'At WH'; }
      else if (sh.date) { anchor = sh.date; found = true; position = 'In transit'; }
    } else if (settings.addSupLead && !blank(pr.Required_Days_Lead)) {
      const lead = Math.trunc(Number(pr.Required_Days_Lead)) || 0; sMin += lead; sMax += lead;
    }
    const f = found
      ? (({ delivery, window, status }) => ({ delivery, window, status }))(finish({ today, anchor, sumMin: sMin, sumMax: sMax, bucket, position, clientTarget: null, variance: false }))
      : { delivery: null, window: 'Walang panimulang petsa', status: 'No Start Date' };
    await put(store, 'Purchase_Request1', [pr], f);
    if (sh && shipById.has(sh.id)) await put(store, 'Shipments', [shipById.get(sh.id)], f);
  }

  const summary = { sofCount, stampCount, noDateCount, prOnlyCount, today: dayStr(today) };
  log(`FORECAST STAMP — ${summary.today} | SOF: ${sofCount} | stamped: ${stampCount} | no start date: ${noDateCount} | PR without SOF: ${prOnlyCount}`);
  return summary;
}

// Backfill_PreOrder_Forecast: copy the forecast of each PR that has one onto the Pre_Order_FF rows of that PR.
export async function runBackfillPreOrder(store, { log = () => {} } = {}) {
  const forecastByPr = new Map();
  for (const pr of await store.find('Purchase_Request1')) {
    const prNo = txt(pr.PR_No);
    // a PR with no date is left out: writing a blank would wipe what the Pre Order row already has
    if (prNo !== '' && !blank(pr.Forecast_Delivery)) forecastByPr.set(prNo, { delivery: dayStr(pr.Forecast_Delivery), window: txt(pr.Forecast_Window), status: txt(pr.Forecast_Status) });
  }
  let filled = 0; let noPr = 0; let noForecast = 0;
  for (const po of await store.find('Pre_Order_FF')) {
    const prNo = txt(po.PR);
    if (prNo === '') noPr += 1;
    else if (!forecastByPr.has(prNo)) noForecast += 1;
    else { await put(store, 'Pre_Order_FF', [po], forecastByPr.get(prNo)); filled += 1; }
  }
  const summary = { prSeen: forecastByPr.size, filled, noPr, noForecast };
  log(`FORECAST PRE-ORDER BACKFILL — ${summary.prSeen} PR with a forecast | ${filled} pre-order rows stamped | ${noPr} without PR | ${noForecast} PR without a forecast`);
  return summary;
}
