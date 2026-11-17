// Fulfillment custom APIs: all still to port, so each is a "not ported yet" placeholder, except the ones below.
import { withPlaceholders } from '../../custom-api-helpers.mjs';
import { rescoreAll } from './sorter.mjs';
import { allPickedForPackage } from './pipeline.mjs';

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  check_payment_status: 'checkPaymentStatus',
  create_package_ff: 'createPackageFF'
};

// Manual "Recalculate" trigger for the sorting engine (spec §05/01 §6). Not a Deluge port — new in this
// system — so it is passed straight into `implemented`, not listed in `functions`.
async function recalculate_fulfillment_queue(payload, data) {
  const result = await rescoreAll(data);
  return { status: 'success', ...result };
}

// Tells the Pick widget, right after a Mark Picked save, whether the whole package is now picked and still
// needs a real box count (PKG-R3). Also new, not a Deluge port.
async function package_pick_status({ so, pkg }, data) {
  const allPicked = await allPickedForPackage(data, so, pkg);
  if (!allPicked) return { status: 'success', allPicked: false, needsBoxCount: false };
  const [sof] = await data.find('Sales_Order_Fulfillment', (r) => r.SO_No === so && r.Package === pkg);
  const needsBoxCount = !(sof && sof.Box_Count_Source === 'counted' && sof.Box_Count);
  return { status: 'success', allPicked: true, needsBoxCount };
}

export const apis = withPlaceholders(functions, { recalculate_fulfillment_queue, package_pick_status });
