// Fulfillment custom APIs: all still to port, so each is a "not ported yet" placeholder.
import { withPlaceholders } from '../../custom-api-helpers.mjs';

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  check_payment_status: 'checkPaymentStatus',
  create_package_ff: 'createPackageFF'
};

export const apis = withPlaceholders(functions);
