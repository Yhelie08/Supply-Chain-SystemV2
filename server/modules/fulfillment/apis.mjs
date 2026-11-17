// Fulfillment custom APIs: all still to port, so each is a "not ported yet" placeholder, except the ones below.
import { withPlaceholders } from '../../custom-api-helpers.mjs';
import { rescoreAll } from './sorter.mjs';

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

export const apis = withPlaceholders(functions, { recalculate_fulfillment_queue });
