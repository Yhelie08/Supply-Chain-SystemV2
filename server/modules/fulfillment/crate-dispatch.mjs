// Fulfillment pipeline, the end of the line: Crate -> To Ship -> For Delivery, and the Pre-Order -> Readiness Gate entry. Ported from
//   Crate_Checklist   "Crating Done to Order Aggregation Sync"   (zoho-export/parsed/workflows/form/Crate_Checklist)
//   Order_Aggregation1 "Sync Fulfillment Stage on Dispatch"       (zoho-export/parsed/workflows/form/Order_Aggregation1)
//   Pre_Order_FF      "Pre Order to Readiness Gate"               (Deluge: preorder_to_readiness_gate.txt)
// all "on add or edit, on success". Every write made here stays inside Fulfillment: nothing goes to Procurement, Books, Inventory or
// DMS (the DMS hand-off of a Dispatch is the To Ship widget's own business, not a workflow here).
//
//   Crate_Checklist saved      -> the package's stage is "Crate" (forward only).
//   Crating Status = Done      -> the item goes to To Ship (Order_Aggregation1: ONE record per SO, one Item_Details row per SKU + package,
//                                 same upsert as an approved QC that is not crated), For_Crate = true, stage "Order Aggregation".
//                                 The row's Bin Location / city / e-mail / contact come from the item's approved QC record (Zoho left them
//                                 blank, the Crate form has no such fields); the quantity is the crate's.
//   Order_Aggregation1 saved   -> Dispatch Selected checked: the stage of EVERY item in the grid is "For Delivery"; not checked: "Order
//                                 Aggregation" (= "To Ship"). Forward only, so an item already further along is never pulled back.
//   Pre_Order_FF saved         -> Received + a Package_Number: the item is in the Readiness Gate (one record per SO + SKU + package; an RR
//                                 replacement is told apart by its RR number), values copied as they are, the payment status included.
//
// Differences from Zoho, on purpose: the Crate stage is "Crate" until crating is Done (Zoho put "To Ship" on every save of the Crate
// record); a stage only moves forward; the Pre-Order -> Gate key includes the package (and RR) so an RR replacement never overwrites the
// original item's Gate record.
import { register } from '../../workflows/index.mjs';
import { blank, truthy } from '../../workflows/deluge.mjs';
import { advanceStage } from './pipeline.mjs';
import { upsertToShip } from './qc-routing.mjs';
import { eq } from './where.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const count = (v) => { const n = parseInt(text(v), 10); return Number.isFinite(n) && n > 0 ? n : 0; };

// ---------- Crate -> To Ship ----------
export async function crateToShip({ record: c, store, user }) {
  const so = text(c.SO), sku = text(c.SKU), pac = text(c.Package_Order);
  if (so === '' || sku === '') return;
  if (text(c.Crating_Status1) !== 'Done') { await advanceStage(store, so, c.Item_Name, sku, 'Crate'); return; }

  const [qc] = await store.find('Checker_Checklist', (r) => text(r.SO) === so && text(r.SKU) === sku && text(r.PAC) === pac && text(r.QC_Status) === 'Approved', { criteria: eq('SO', so) });
  const from = qc || {};
  await upsertToShip(store, user, so, {
    ORDER_TYPE: c.Order_Type, Target_Date: c.Target_Delivery_Date, PR: c.PR_if_any, DEMO: c.Dem_if_any, DELIVERY_TYPE: c.Delivery_Type,
    Customer_Name: c.Customer_Name, Customer_Address: c.Customer_Address, Customer_Type: c.Customer_Type,
    City: from.City, Email: from.Email, Contact: from.Contact,
    Forecast_Delivery: c.Forecast_Delivery, Forecast_Window: c.Forecast_Window, Forecast_Status: c.Forecast_Status,
  }, { Item_Name: c.Item_Name, SKU: sku, QTY: count(c.Quantity), Bin_Location: text(from.Bin_Location), PAC: pac }, { For_Crate: true });
  await advanceStage(store, so, c.Item_Name, sku, 'Order Aggregation');
}
register('Crate_Checklist', { afterAdd: crateToShip, afterUpdate: crateToShip });

// ---------- To Ship (Order Aggregation) -> stage ----------
export async function dispatchStage({ record: agg, store }) {
  const so = text(agg.SO);
  if (so === '') return;
  const stage = truthy(agg.Dispatch_Selected) ? 'For Delivery' : 'Order Aggregation';
  for (const row of agg.Item_Details || []) await advanceStage(store, so, row.Item_Name, text(row.SKU), stage);
}
register('Order_Aggregation1', { afterAdd: dispatchStage, afterUpdate: dispatchStage });

// ---------- Pre-Order (Received + package) -> Readiness Gate ----------
const GATE = 'Sales_Order_Readiness_Gate';
export async function preOrderToGate({ record: p, store, user }) {
  const so = text(p.SO), sku = text(p.SKU), pkg = text(p.Package_Number);
  if (so === '' || sku === '' || pkg === '' || text(p.Pre_Order_Status) !== 'Received') return;

  const rr = [...new Set((p.Replacement_Request || []).map((r) => text(r.RR)).filter((v) => v !== ''))].join(', ');
  const values = {
    Order_Type: p.Order_Type, Package_Order: pkg, Delivery_Type: p.Delivery_Type, For_Crate: truthy(p.For_Crate), payment_status: p.Status,
    customer_name: text(p.Customer_Name), customer_type: p.Customer_Type, customer_address: text(p.Customer_Address), pr_number: text(p.PR), rr_number: rr,
    Item_Name: text(p.Item_Name), Quantity: text(p.Qty), Bin_Location: text(p.Bin_Location), Target_Delivery_Date: p.Target_Delivery,
    Forecast_Delivery: text(p.Forecast_Delivery), Forecast_Window: text(p.Forecast_Window), Forecast_Status: text(p.Forecast_Status),
  };
  // A value that comes out empty never blanks one the Gate already has.
  const KEEP_IF_EMPTY = ['customer_name', 'customer_address', 'Forecast_Delivery', 'Forecast_Window', 'Forecast_Status', 'Bin_Location'];
  const existing = await store.find(GATE, (g) => text(g.sales_order_number) === so && text(g.SKU) === sku && text(g.Package_Order) === pkg && text(g.rr_number) === rr, { criteria: eq('sales_order_number', so) });
  for (const g of existing) {
    const patch = Object.fromEntries(Object.entries(values).filter(([k, v]) => !(KEEP_IF_EMPTY.includes(k) && v === '' && !blank(g[k]))));
    await store.updateRecord(GATE, g.ID, patch, { byForm: true });
  }
  if (!existing.length) await store.addRecord(GATE, { sales_order_number: so, SKU: sku, ...values }, user);
}
register('Pre_Order_FF', { afterAdd: preOrderToGate, afterUpdate: preOrderToGate });
