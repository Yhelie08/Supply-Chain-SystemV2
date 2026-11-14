// Fulfillment workflow ports.
//
// Stage rule (from the user, 2026-11-14): "Waiting For Package" means there is NO package number yet. As soon as a package
// number exists the record is in Order Readiness, whatever the payment (Paid, Partial or No), like Zoho's SO_to_Readiness.
// Payment still gates the next step: the Readiness Gate records (what Pick works from) are only created for a PAID package,
// see pipeline.mjs. (Before 2026-11-14 an unpaid package also waited in "Waiting For Package".)
//
// Only these two stages are managed here. A record already further along (Picking, Pack & QC, Crate, For Delivery) is
// never moved back or forward by this rule.
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';

const WAITING = 'Waiting For Package';
const READINESS = 'Order Readiness';

const hasPackage = (v) => !blank(v) && String(v).trim() !== '' && String(v) !== 'null';

// What the stage should be, given the record as it will be saved (the stored row with this write applied on top).
export function readinessStage(record) {
  const stage = record.Fulfillment_Stage;
  if (stage !== WAITING && stage !== READINESS) return stage; // later stage, or not set: leave it alone
  return hasPackage(record.Package) ? READINESS : WAITING;
}

function gateByPaymentAndPackage({ input, previous }) {
  const next = readinessStage({ ...(previous || {}), ...input });
  if (next !== undefined && next !== (input.Fulfillment_Stage ?? previous?.Fulfillment_Stage)) input.Fulfillment_Stage = next;
}

register('Sales_Order_Fulfillment', { beforeAdd: gateByPaymentAndPackage, beforeUpdate: gateByPaymentAndPackage });
