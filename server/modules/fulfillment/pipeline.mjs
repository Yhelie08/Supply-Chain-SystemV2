// Fulfillment pipeline, first part: Sales Order -> Order Readiness -> Pick -> Pack & QC. Ported from
//   Sales_Order_Fulfillment     SO_to_Readiness          (zoho-export/parsed/workflows/form/Sales_Order_Fulfillment)
//   Sales_Order_Readiness_Gate  Release_Records_to_Pick1 (zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate)
//   Pick1                       Pick1_Marked_to_QC_Sync  (zoho-export/parsed/workflows/form/Pick1)
// all "on add or edit, on success". Not ported yet (next parts): QC approve -> Crate / Order Aggregation, Crating done, Dispatch ->
// For Delivery.
//
// What it does:
//   A Sales_Order_Fulfillment record (one per package) with a Package AND paid (Status "Yes") creates one
//   Sales_Order_Readiness_Gate record per item line, with the customer name and address. The stage is set by workflows.mjs
//   (Waiting For Package -> Order Readiness). Not paid yet: nothing is created; Gate records that already exist are only
//   refreshed (payment, address, quantity), so paying later and saving again moves the package in without duplicates.
//   A Gate record saved with Release checked creates (or updates) its Pick1 record, adds a Pick_Notifications row for a new
//   one, and the package's Fulfillment_Stage becomes "Picking". Per item: a sibling that is not released stays out of Pick.
//   A Pick1 record saved with Marked ("Mark Picked") checked creates (or updates) its Checker_Checklist record, the item's Pack & QC
//   line, and the package's Fulfillment_Stage becomes "Pack & QC". (Pack is not a form any more: Zoho's Pick1_Marked_to_Pack_Sync is
//   retired.) Saved without Marked, it only keeps the stage at Picking.
//
// Values are copied as they are from one form to the next (SO, PR, RR, Demo, package, item, SKU, quantity, bin, customer, address,
// target date, forecast): nothing is renamed, rounded or recalculated on the way. A value that comes out empty never blanks one that is
// already there (customer name / address, forecast).
//
// Differences from Zoho, on purpose: the Gate is only filled for PAID packages (rule from the user, 2026-11-13); Zoho filled it
// for any package. A stage only moves FORWARD (Zoho's Gate script set "Order Readiness" on every save, pulling a package that
// was already further along back). Writes made here do not run the workflows again (a scripted insert / update does not on
// Zoho either).
import { register } from '../../workflows/index.mjs';
import { blank, truthy } from '../../workflows/deluge.mjs';
import { zohoNow } from '../../criteria.mjs';
import { readinessStage } from './workflows.mjs';

const SOF = 'Sales_Order_Fulfillment';
const GATE = 'Sales_Order_Readiness_Gate';
const PICK = 'Pick1';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// The pipeline, in order (Crate is skipped by packages that are not for crating, so it is only a position here).
export const STAGE_ORDER = ['Waiting For Package', 'Order Readiness', 'Picking', 'Pack & QC', 'Crate', 'Order Aggregation', 'For Delivery'];

// Moves the package record(s) that hold this item to `stage`, only forward. The item is found in
// Sales_Order_Fulfillment.Item_Details1 by SO + Item + SKU, like Zoho.
export async function advanceStage(store, so, itemName, sku, stage) {
  const target = STAGE_ORDER.indexOf(stage);
  for (const sof of await store.find(SOF, (r) => r.SO_No === so)) {
    const holdsItem = (sof.Item_Details1 || []).some((row) => text(row.Item) === text(itemName) && text(row.SKU) === text(sku));
    if (!holdsItem) continue;
    if (sof.Fulfillment_Stage === stage || STAGE_ORDER.indexOf(sof.Fulfillment_Stage) > target) continue; // there already, or further along
    await store.updateRecord(SOF, sof.ID, { Fulfillment_Stage: stage }, { byForm: true });
  }
}

// ---------- Sales order package -> Readiness Gate ----------
export async function soToReadiness({ record: sof, store, user }) {
  const so = text(sof.SO_No);
  const pkg = text(sof.Package);
  if (pkg === '') return; // no package yet: nothing to sync
  const paid = sof.Status === 'Yes';

  let customerName = '';
  if (!blank(sof.Customer)) {
    try { customerName = text((await store.getRecordById('Customer', String(sof.Customer), { raw: true })).customer_name); } catch { /* customer gone: leave the name empty */ }
  }
  const address = text(sof.Shipping_Address) !== '' ? text(sof.Shipping_Address) : text(sof.Billing_Address);
  const common = {
    Order_Type: sof.order_type, Package_Order: pkg, Delivery_Type: sof.Delivery_Type, For_Crate: truthy(sof.For_Crate),
    Target_Delivery_Date: sof.target_delivery_date, payment_status: sof.Status, customer_name: customerName, customer_type: sof.Customer_Type,
    customer_address: address, pr_number: text(sof.PR_No), rr_number: text(sof.RR_No),
    Forecast_Delivery: text(sof.Forecast_Delivery), Forecast_Window: text(sof.Forecast_Window), Forecast_Status: text(sof.Forecast_Status),
  };
  // These come from a lookup or from a later stamp: when they come out empty now, what the Gate already holds is kept (never blanked).
  const KEEP_IF_EMPTY = ['customer_name', 'customer_address', 'Forecast_Delivery', 'Forecast_Window', 'Forecast_Status'];
  const refresh = (gate, values) => Object.fromEntries(Object.entries(values).filter(([k, v]) => !(KEEP_IF_EMPTY.includes(k) && v === '' && !blank(gate[k]))));

  for (const row of sof.Item_Details1 || []) {
    const item = { Item_Name: text(row.Item), SKU: text(row.SKU), Quantity: text(row.Quantity), Bin_Location: text(row.Bin_Location) };
    const existing = await store.find(GATE, (g) => g.sales_order_number === so && g.SKU === item.SKU && g.Package_Order === pkg);
    for (const gate of existing) {
      await store.updateRecord(GATE, gate.ID, refresh(gate, { ...common, ...item }), { byForm: true });
      // An item already released keeps Pick1 in step (a corrected quantity, address...).
      if (truthy(gate.Release)) {
        for (const pick of await store.find(PICK, (p) => p.SO === so && p.SKU === item.SKU && p.Item_Name === item.Item_Name && p.Package_Order === pkg)) {
          await store.updateRecord(PICK, pick.ID, {
            Package_Order: pkg, PR_if_any: common.pr_number, RR: common.rr_number, Delivery_Type: common.Delivery_Type, Order_Type: common.Order_Type,
            Target_Delivery_Date: common.Target_Delivery_Date, For_Crate: common.For_Crate, Item_Name: item.Item_Name, Bin_Location: item.Bin_Location,
            SKU: item.SKU, Quantity_to_Pick: item.Quantity, Customer_Name: customerName || pick.Customer_Name, Customer_Address: address || pick.Customer_Address,
            Customer_Type: common.customer_type, Forecast_Delivery: common.Forecast_Delivery || pick.Forecast_Delivery, Forecast_Window: common.Forecast_Window || pick.Forecast_Window,
            Forecast_Status: common.Forecast_Status || pick.Forecast_Status,
          }, { byForm: true });
        }
      }
    }
    if (!existing.length && paid) await store.addRecord(GATE, { sales_order_number: so, ...common, ...item }, user);
  }
}
register(SOF, { afterAdd: soToReadiness, afterUpdate: soToReadiness });

// ---------- Readiness Gate (Release) -> Pick ----------
export async function releaseToPick({ record: gate, store, user }) {
  const so = text(gate.sales_order_number);
  if (!truthy(gate.Release)) return;

  // Every record of this sales order that is itself released goes to Pick1 (a sibling that is not released stays out).
  for (const g of await store.find(GATE, (r) => r.sales_order_number === so && truthy(r.Release))) {
    const rr = text(g.rr_number);
    const fields = {
      Picker: g.Assign_Picker, Package_Order: g.Package_Order, PR_if_any: g.pr_number, RR: g.rr_number, Demo: g.Demo, Delivery_Type: g.Delivery_Type,
      Order_Type: g.Order_Type, Target_Delivery_Date: g.Target_Delivery_Date, For_Crate: g.For_Crate, Item_Name: g.Item_Name, Bin_Location: g.Bin_Location,
      SKU: g.SKU, Quantity_to_Pick: g.Quantity, Customer_Name: g.customer_name, Customer_Address: g.customer_address, Customer_Type: g.customer_type,
      Forecast_Delivery: g.Forecast_Delivery, Forecast_Window: g.Forecast_Window, Forecast_Status: g.Forecast_Status,
    };
    // RR is part of the key: an RR replacement reuses the original's package number.
    const found = await store.find(PICK, (p) => p.SO === so && p.SKU === g.SKU && p.Item_Name === g.Item_Name && p.Package_Order === g.Package_Order && text(p.RR) === rr);
    if (found.length) {
      for (const p of found) await store.updateRecord(PICK, p.ID, fields, { byForm: true });
    } else {
      const pickId = await store.addRecord(PICK, { SO: so, ...fields }, user);
      await store.addRecord('Pick_Notifications', {
        Recipient_Email: 'homecartelff@gmail.com', Notification_Type: 'Pick Record Created', Message: `New item ready for picking — ${so} (${g.Item_Name}).`,
        Created_On: zohoNow(), Read: false, Target_URL: '', Source_Record_No: so, Source_Record_ID: pickId,
      }, user);
    }
    await advanceStage(store, so, g.Item_Name, g.SKU, 'Picking');
  }
}
register(GATE, { afterAdd: releaseToPick, afterUpdate: releaseToPick });

// ---------- Pick (Marked) -> Pack & QC ----------
const QC = 'Checker_Checklist';

// The customer's city, e-mail and phone for the QC / delivery side, from the package record that holds the item (Contact_No) and its
// Customer record. Only what is found is returned.
async function customerContact(store, so, itemName, sku) {
  const out = {};
  const [sof] = await store.find(SOF, (r) => r.SO_No === so && (r.Item_Details1 || []).some((row) => text(row.Item) === text(itemName) && text(row.SKU) === text(sku)));
  if (!sof) return out;
  if (text(sof.Contact_No) !== '') out.Contact = text(sof.Contact_No);
  if (!blank(sof.Customer)) {
    try {
      const c = await store.getRecordById('Customer', String(sof.Customer), { raw: true });
      if (text(c.Email) !== '') out.Email = text(c.Email);
      if (out.Contact === undefined && text(c.Phone_Number) !== '') out.Contact = text(c.Phone_Number);
      const city = c.Billing_Address && typeof c.Billing_Address === 'object' ? text(c.Billing_Address.district_city) : '';
      if (city !== '') out.City = city;
    } catch { /* customer gone: nothing to add */ }
  }
  return out;
}
export async function pickedToQc({ record: pick, store, user }) {
  const so = text(pick.SO);
  if (!truthy(pick.Marked)) { await advanceStage(store, so, pick.Item_Name, pick.SKU, 'Picking'); return; }

  const pac = text(pick.Package_Order);
  const rr = text(pick.RR);
  const fields = {
    PR: pick.PR_if_any, Demo: pick.Demo, RR: pick.RR, Delivery_Type: pick.Delivery_Type, Order_Type: pick.Order_Type, Target_Delivery_Date: pick.Target_Delivery_Date,
    For_Crate: pick.For_Crate, Customer_Name: pick.Customer_Name, Customer_Address: pick.Customer_Address, Customer_Type: pick.Customer_Type,
    Item_Name: pick.Item_Name, Quantity: pick.Quantity_to_Pick, Bin_Location: pick.Bin_Location,
    Forecast_Delivery: pick.Forecast_Delivery, Forecast_Window: pick.Forecast_Window, Forecast_Status: pick.Forecast_Status,
    ...(await customerContact(store, so, pick.Item_Name, pick.SKU)),
  };
  // Only a QC record that is still pending counts as "the same": one already approved / rejected is history, so an item that comes
  // back through Pick (an RR) always gets a new QC record. No Quality_Checker here: the Pack & QC page assigns it.
  const pending = await store.find(QC, (c) => c.SO === so && c.SKU === text(pick.SKU) && c.PAC === pac && text(c.RR) === rr && text(c.QC_Status) === '');
  if (pending.length) for (const c of pending) await store.updateRecord(QC, c.ID, fields, { byForm: true });
  else await store.addRecord(QC, { SO: so, PAC: pac, SKU: text(pick.SKU), ...fields }, user);
  await advanceStage(store, so, pick.Item_Name, pick.SKU, 'Pack & QC');
}
register(PICK, { afterAdd: pickedToQc, afterUpdate: pickedToQc });

// ---------- Catch-up for everything that did not come through a hook ----------
// The hooks above run when a widget writes through the API. Data that arrives another way (a custom API, an import, a row written
// directly, or anything saved before these hooks existed) would never move on. This sweep finds that data and runs the same steps on
// it. It is safe to run any time and as often as wanted: it only acts where a step is missing, and a second run changes nothing.
//   1. a package that is paid and has a package number -> its Readiness Gate records (and the Order Readiness stage)
//   2. a Gate record that is Released -> its Pick1 record
//   3. a Pick1 record that is Marked -> its QC record
//   4. every package's stage is brought forward to where its Gate / Pick / QC records show it is (never backward)
// Custom APIs that write to these forms should call it when they finish (their writes do not fire the hooks).
export async function reconcileFulfillment(store, { user = 'system' } = {}) {
  const done = { gate: 0, pick: 0, qc: 0, stage: 0 };
  const sameItem = (sof, name, sku) => (sof.Item_Details1 || []).some((row) => text(row.Item) === text(name) && text(row.SKU) === text(sku));

  // 1. Sales order packages -> Gate
  let [sofs, gates] = [await store.find(SOF), await store.find(GATE)];
  for (const sof of sofs) {
    const pkg = text(sof.Package);
    if (pkg === '') continue;
    const stage = readinessStage(sof);
    if (stage !== undefined && stage !== sof.Fulfillment_Stage) { await store.updateRecord(SOF, sof.ID, { Fulfillment_Stage: stage }, { byForm: true }); done.stage++; }
    if (sof.Status !== 'Yes') continue;
    const missing = (sof.Item_Details1 || []).some((row) => !gates.some((g) => g.sales_order_number === text(sof.SO_No) && g.SKU === text(row.SKU) && g.Package_Order === pkg));
    if (missing) { await soToReadiness({ record: sof, store, user }); done.gate++; }
  }

  // 2. Released Gate records -> Pick1
  const picks0 = await store.find(PICK);
  gates = await store.find(GATE);
  for (const g of gates) {
    if (!truthy(g.Release)) continue;
    const has = picks0.some((p) => p.SO === g.sales_order_number && p.SKU === g.SKU && p.Item_Name === g.Item_Name && p.Package_Order === g.Package_Order && text(p.RR) === text(g.rr_number));
    if (!has) { await releaseToPick({ record: g, store, user }); done.pick++; }
  }

  // 3. Marked Pick1 records -> QC
  const picks = await store.find(PICK);
  const qcs = await store.find(QC);
  for (const p of picks) {
    if (!truthy(p.Marked)) continue;
    const has = qcs.some((c) => c.SO === p.SO && c.SKU === text(p.SKU) && c.PAC === text(p.Package_Order) && text(c.RR) === text(p.RR));
    if (!has) { await pickedToQc({ record: p, store, user }); done.qc++; }
  }

  // 4. Stages: forward only, in memory, one write per package that is behind
  sofs = await store.find(SOF);
  const gateRows = await store.find(GATE);
  const pickRows = await store.find(PICK);
  for (const sof of sofs) {
    let want = sof.Fulfillment_Stage;
    const at = (stage) => { if (STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(want)) want = stage; };
    for (const row of sof.Item_Details1 || []) {
      if (pickRows.some((p) => p.SO === sof.SO_No && sameItem(sof, p.Item_Name, p.SKU) && truthy(p.Marked))) at('Pack & QC');
      else if (pickRows.some((p) => p.SO === sof.SO_No && sameItem(sof, p.Item_Name, p.SKU))) at('Picking');
      else if (gateRows.some((g) => g.sales_order_number === sof.SO_No && g.SKU === text(row.SKU) && truthy(g.Release))) at('Picking');
    }
    if (want !== sof.Fulfillment_Stage) { await store.updateRecord(SOF, sof.ID, { Fulfillment_Stage: want }, { byForm: true }); done.stage++; }
  }
  return done;
}
