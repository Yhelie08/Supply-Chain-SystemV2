// Fulfillment workflow ports.
//
// Order Readiness gate (rule from the user, 2026-11-13): a package enters Order Readiness only when it is PAID and has a
// PACKAGE. Until then it waits in "Waiting For Package".
//
// Zoho's SO_to_Readiness bumped Waiting For Package -> Order Readiness as soon as a Package existed, whatever the payment
// (an unpaid package then sat in Readiness with a closed gate). This is stricter on purpose: it needs Status == "Yes"
// (Paid) too. Partial and No stay in Waiting For Package.
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
  return hasPackage(record.Package) && record.Status === 'Yes' ? READINESS : WAITING;
}

function gateByPaymentAndPackage({ input, previous }) {
  const next = readinessStage({ ...(previous || {}), ...input });
  if (next !== undefined && next !== (input.Fulfillment_Stage ?? previous?.Fulfillment_Stage)) input.Fulfillment_Stage = next;
}

register('Sales_Order_Fulfillment', { beforeAdd: gateByPaymentAndPackage, beforeUpdate: gateByPaymentAndPackage });
