// Fulfillment workflow ports.
//
// Stage rule for a package (Sales_Order_Fulfillment record), from the user:
//   - No package number (PAC#) yet                           -> "Waiting For Package"
//   - Package number and PAID (Status "Yes")                 -> "Order Readiness"   (an invoice with credit terms counts as fine too)
//   - Package number but Partial / unpaid, NOT approved yet  -> "Need Approval"     (2026-11-14: it stays out of Order Readiness until
//                                                                                    it is approved in the Approve Dispatch tab)
//   - Approved (every Readiness Gate record of the package has a valid Override_Approved for its payment status) -> "Order Readiness"
// The Readiness Gate records themselves are created as soon as there is a package number (pipeline.mjs); the Order Readiness page hides the
// ones that still need approval and the Approve Dispatch tab lists them. Approving one (Override_Approved on the Gate record) moves the
// package to Order Readiness, see the Gate hook below. "Valid" = approved for the payment status the record has NOW: if the payment
// status changes later (Partial -> No), the approval no longer counts.
//
// Only these three stages are managed here. A record already further along (Picking, Pack & QC, Crate, For Delivery) is never moved
// back or forward by this rule.
import { register } from '../../workflows/index.mjs';
import { blank, truthy } from '../../workflows/deluge.mjs';
import { eq } from './where.mjs';

const SOF = 'Sales_Order_Fulfillment';
const GATE = 'Sales_Order_Readiness_Gate';
const WAITING = 'Waiting For Package';
const NEED_APPROVAL = 'Need Approval';
const READINESS = 'Order Readiness';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const hasPackage = (v) => text(v).trim() !== '';

// Does this Readiness Gate record still need a payment approval? Same rule as the Approve Dispatch queue in the Order Readiness widget.
export function needsPaymentApproval(gate) {
  const paid = text(gate.payment_status);
  if (paid === '' || paid === 'Yes') return false;
  if (truthy(gate.Has_Credit_Terms)) return false; // credit terms: expected to be unpaid, no approval needed
  return !(truthy(gate.Override_Approved) && text(gate.Override_Approved_For_Status) === paid);
}

// What the stage should be, given the record as it will be saved (the stored row with this write applied on top).
export async function packageStage(store, sof) {
  const stage = sof.Fulfillment_Stage;
  if (stage !== WAITING && stage !== NEED_APPROVAL && stage !== READINESS) return stage; // later stage, or not set: leave it alone
  if (!hasPackage(sof.Package)) return WAITING;
  if (sof.Status === 'Yes' || truthy(sof.Has_Credit_Terms)) return READINESS;
  const gates = await store.find(GATE, (g) => text(g.sales_order_number) === text(sof.SO_No) && text(g.Package_Order) === text(sof.Package), { criteria: eq('sales_order_number', text(sof.SO_No)) });
  // The Gate records take the package's payment status when it is saved (pipeline.mjs), so judge them by what they are about to be.
  const paid = text(sof.Status);
  return gates.length > 0 && gates.every((g) => !needsPaymentApproval({ ...g, payment_status: paid || g.payment_status })) ? READINESS : NEED_APPROVAL;
}

async function stageOnSave({ input, previous, store }) {
  const next = await packageStage(store, { ...(previous || {}), ...input });
  if (next !== undefined && next !== (input.Fulfillment_Stage ?? previous?.Fulfillment_Stage)) input.Fulfillment_Stage = next;
}
register(SOF, { beforeAdd: stageOnSave, beforeUpdate: stageOnSave });

// A Gate record saved (approved, payment changed): the packages it belongs to take the stage they should have now.
async function stageOnGateSave({ record: gate, store }) {
  const so = text(gate.sales_order_number), pkg = text(gate.Package_Order);
  if (so === '' || pkg === '') return;
  for (const sof of await store.find(SOF, (r) => text(r.SO_No) === so && text(r.Package) === pkg, { criteria: eq('SO_No', so) })) {
    const want = await packageStage(store, sof);
    if (want !== sof.Fulfillment_Stage) await store.updateRecord(SOF, sof.ID, { Fulfillment_Stage: want }, { byForm: true });
  }
}
register(GATE, { afterAdd: stageOnGateSave, afterUpdate: stageOnGateSave });
