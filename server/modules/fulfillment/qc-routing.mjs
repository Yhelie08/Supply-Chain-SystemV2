// Fulfillment pipeline, Pack & QC -> Crate / To Ship / Exception Control. Ported from
//   Checker_Checklist  "QC Approved sync to Crate or Order Aggregation"  (on add or edit, on success)
//   (zoho-export/parsed/workflows/form/Checker_Checklist/QC_Approved_sync_to_Crate.dg)
//
// What it does, per QC record saved with a QC_Status (Quantity is the number of units that status covers):
//   Rejected  -> Exception Control: one Exception_Control1 record per rejected unit (Qty 1 each, EXC-FF-nnnnn), tagged with the QC record
//                it came from (QC_ID). Grow-only per QC record: saving again with the same quantity adds nothing, the existing ones are
//                only refreshed. A re-check of repaired units that fails again REOPENS its exception instead of making a new one.
//   Approved  -> where it goes depends on the package's For_Crate flag:
//                  For_Crate   -> Crate_Checklist (one record per SO + SKU + package, updated if it is already there)
//                  not crated  -> Order_Aggregation1 = the To Ship page (ONE record per SO, one Item_Details row per SKU + package)
//                The package's Fulfillment_Stage moves forward to "Crate" or "Order Aggregation".
// A split (for example 3 units: 2 pass, 1 fails) is two writes from the Pack & QC page on the same QC record, one Rejected with
// Quantity 1 and one Approved with Quantity 2. Each write routes its own share, so the failed unit lands in Exception Control and the
// two that passed land in Crate or To Ship. The Approved row's quantity is always the SUM of every Approved QC record for that
// SO + SKU + package, so a later batch of the same item adds to the row instead of overwriting it.
// Split_Rejected_Qty / Split_Original_Qty stay on the QC record: To Ship and Crate use them to show what is still outstanding.
//
// Differences from Zoho, on purpose: the Readiness Gate quantity is NOT rewritten (values are copied unchanged between modules, rule
// from the user); the Zoho script rebuilt the whole To Ship record on a merge, here the matching row is updated in place.
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { zohoNow } from '../../criteria.mjs';
import { advanceStage } from './pipeline.mjs';
import { eq } from './where.mjs';

const QC = 'Checker_Checklist';
const EXC = 'Exception_Control1';
const CRATE = 'Crate_Checklist';
const AGG = 'Order_Aggregation1';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const count = (v) => { const n = parseInt(text(v), 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const isCrate = (v) => v === true || /^(true|yes|1)$/i.test(text(v));

// Spare parts the checker listed on a rejected record, as the two text fields Exception Control shows.
function spareParts(rows) {
  const types = [], pairs = [];
  for (const row of rows || []) {
    const type = text(row.Spare_Part_Type);
    if (type === '') continue;
    const other = text(row.Spare_Part_Type_Other);
    const name = type === 'Others' && other !== '' ? other : type;
    types.push(name);
    pairs.push(`${name}: ${text(row.Quantity_of_damage_spare_s) || '—'}`);
  }
  return { type: types.join(', '), qty: pairs.join(', ') };
}

async function supplierOf(store, pr) {
  if (pr === '') return '';
  try {
    const [rec] = await store.find('Purchase_Request1', (r) => text(r.PR_Number) === pr || text(r.PR_No) === pr, { criteria: `${eq('PR_Number', pr)} || ${eq('PR_No', pr)}` });
    return rec ? text(rec.Supplier) : '';
  } catch { return ''; }
}

// ---------- Rejected -> Exception Control ----------
async function rejectedToException({ record: qc, store, user, id }, so, sku, pac, units) {
  const spare = spareParts(qc.Spare_part_type);
  const shared = {
    RR_No: qc.RR, PR: qc.PR, Demo1: qc.Demo, Order_Type: qc.Order_Type, DELIVERY_TYPE: qc.Delivery_Type,
    Source_Module: 'Checker_Checklist (QC Rejected)', Checker: qc.Quality_Checker, Remarks: qc.Remarks,
    Customer_Name: qc.Customer_Name, Customer_Type: qc.Customer_Type, Customer_Address: qc.Customer_Address,
    Item_to_Replace3: qc.Item_to_Replace, Quantity: qc.Quantity_of_Damage_Items,
    Item_to_Replace1: spare.type, Quantity_of_damage_spare_s: spare.qty, Item_Name: qc.Item_Name,
  };
  // The units of THIS QC record: the exceptions it created (QC_ID), plus older ones with no QC_ID matched by SO + SKU + PAC. Saving the
  // same decision again therefore adds nothing, and a later QC record of the same item (another batch) gets its own.
  const qcId = text(qc.ID || id);
  // A QC re-check of repaired units (see exception-recheck.mjs) that fails again REOPENS the exceptions it came from: same records, same
  // EXC numbers, back to Pending. Nothing new is created for a unit that already has an exception. For such a re-check the units are
  // matched ONLY through Recheck_Exceptions (an old exception with no QC_ID must not be mistaken for "already an exception of this QC").
  const back = new Set((Array.isArray(qc.Recheck_Exceptions) ? qc.Recheck_Exceptions : []).map(String));
  const existing = await store.find(EXC, (e) => text(e.QC_ID) === qcId
    || (back.size === 0 && text(e.QC_ID) === '' && text(e.Sales_Order) === so && text(e.SKU) === sku && text(e.PAC) === pac));
  for (const e of existing) await store.updateRecord(EXC, e.ID, shared, { byForm: true });
  let need = units - existing.length;
  if (need < 1) return;

  if (back.size) {
    for (const e of await store.find(EXC, (x) => back.has(String(x.ID)) && text(x.QC_ID) !== qcId)) {
      if (need < 1) break;
      await store.updateRecord(EXC, e.ID, { ...shared, Status: 'Pending', Rework_Status: 'Pending Assessment', Sent_To_QC: false, QC_ID: qcId }, { byForm: true });
      need--;
    }
    if (need < 1) return;
  }

  const supplier = await supplierOf(store, text(qc.PR));
  let max = 0;
  for (const e of await store.find(EXC)) {
    const m = /^EXC-FF-(\d+)$/.exec(text(e.Exception_Number));
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (let i = 1; i <= need; i++) {
    const number = `EXC-FF-${String(max + i).padStart(5, '0')}`;
    const excId = await store.addRecord(EXC, { Sales_Order: so, SKU: sku, PAC: pac, Exception_Number: number, Supplier: supplier, Qty: 1, QC_ID: qcId, ...shared }, user);
    try {
      await store.addRecord('ExceptionControl_Notifications', {
        Recipient_Email: 'homecartelff@gmail.com', Notification_Type: 'Exception Record Created',
        Message: `New Exception Control record — ${so} (${text(qc.Item_Name)}) — ${number}.`,
        Created_On: zohoNow(), Read: false, Target_URL: '', Source_Record_No: so, Source_Record_ID: excId,
      }, user);
    } catch (e) { console.error('[qc-routing] exception notification:', e.message); }
  }
}

// ---------- Approved + For Crate -> Crate_Checklist ----------
async function approvedToCrate({ record: qc, store, user }, so, sku, pac, units) {
  const fields = {
    PR_if_any: qc.PR, RR_if_any: qc.RR, Order_Type: qc.Order_Type, Target_Delivery_Date: qc.Target_Delivery_Date, Delivery_Type: qc.Delivery_Type,
    Customer_Name: qc.Customer_Name, Customer_Address: qc.Customer_Address, Customer_Type: qc.Customer_Type,
    Item_Name: qc.Item_Name, Quantity: await approvedTotal(store, so, sku, pac, units), Assigned_Checker: qc.Quality_Checker,
    Forecast_Delivery: qc.Forecast_Delivery, Forecast_Window: qc.Forecast_Window, Forecast_Status: qc.Forecast_Status,
  };
  const existing = await store.find(CRATE, (c) => text(c.SO) === so && text(c.SKU) === sku && text(c.Package_Order) === pac, { criteria: eq('SO', so) });
  if (existing.length) for (const c of existing) await store.updateRecord(CRATE, c.ID, fields, { byForm: true });
  else await store.addRecord(CRATE, { SO: so, Package_Order: pac, SKU: sku, ...fields }, user);
}

// Every approved unit of this item in this package, across all of its QC records (a second batch adds to the first).
async function approvedTotal(store, so, sku, pac, fallback) {
  const rows = await store.find(QC, (c) => text(c.SO) === so && text(c.SKU) === sku && text(c.PAC) === pac && text(c.QC_Status) === 'Approved', { criteria: eq('SO', so) });
  const sum = rows.reduce((n, c) => n + count(c.Quantity), 0);
  return sum > 0 ? sum : fallback;
}

// ---------- Approved + not crated -> Order_Aggregation1 (To Ship) ----------
// The To Ship record of a sales order: ONE per SO, one Item_Details row per SKU + package. `header` is the SO-level values (used when
// the record is created; City / Email / Contact / Forecast only fill what is still empty later), `item` = { Item_Name, SKU, QTY,
// Bin_Location, PAC }. Used by the QC route (not crated) and by the Crate route (crating Done).
export async function upsertToShip(store, user, so, header, item, extra = {}) {
  const [agg] = await store.find(AGG, (a) => text(a.SO) === so, { criteria: eq('SO', so) });
  if (!agg) {
    await store.addRecord(AGG, { SO: so, PAC: item.PAC, ...header, ...extra, Item_Details: [item] }, user);
    return;
  }
  const rows = (agg.Item_Details || []).map((r) => ({ ...r }));
  const row = rows.find((r) => text(r.SKU) === item.SKU && text(r.PAC) === item.PAC);
  if (row) { row.QTY = item.QTY; if (text(item.Bin_Location) !== '') row.Bin_Location = item.Bin_Location; if (text(item.Item_Name) !== '') row.Item_Name = item.Item_Name; }
  else rows.push(item);
  const patch = { Item_Details: rows, ...extra };
  for (const k of ['City', 'Email', 'Contact', 'Forecast_Delivery', 'Forecast_Window', 'Forecast_Status']) {
    if (text(header[k]) !== '' && text(agg[k]) === '') patch[k] = header[k]; // fills what is empty, never overwrites
  }
  await store.updateRecord(AGG, agg.ID, patch, { byForm: true });
}

async function approvedToShip({ record: qc, store, user }, so, sku, pac, units) {
  const qty = await approvedTotal(store, so, sku, pac, units);
  await upsertToShip(store, user, so, {
    ORDER_TYPE: qc.Order_Type, Target_Date: qc.Target_Delivery_Date, PR: qc.PR, DEMO: qc.Demo, DELIVERY_TYPE: qc.Delivery_Type,
    Customer_Name: qc.Customer_Name, Customer_Address: qc.Customer_Address, Customer_Type: qc.Customer_Type,
    City: qc.City, Email: qc.Email, Contact: qc.Contact,
    Forecast_Delivery: qc.Forecast_Delivery, Forecast_Window: qc.Forecast_Window, Forecast_Status: qc.Forecast_Status,
  }, { Item_Name: qc.Item_Name, SKU: sku, QTY: qty, Bin_Location: qc.Bin_Location, PAC: pac });
}

export async function qcRouting(ctx) {
  const qc = ctx.record;
  const status = text(qc.QC_Status);
  if (status !== 'Approved' && status !== 'Rejected') return;
  const so = text(qc.SO), sku = text(qc.SKU), pac = text(qc.PAC), units = count(qc.Quantity);
  if (so === '' || sku === '' || units < 1) return;

  if (status === 'Rejected') { await rejectedToException(ctx, so, sku, pac, units); return; }
  if (isCrate(qc.For_Crate)) { await approvedToCrate(ctx, so, sku, pac, units); await advanceStage(ctx.store, so, qc.Item_Name, sku, 'Crate'); }
  else { await approvedToShip(ctx, so, sku, pac, units); await advanceStage(ctx.store, so, qc.Item_Name, sku, 'Order Aggregation'); }
}
register(QC, { afterAdd: qcRouting, afterUpdate: qcRouting });
