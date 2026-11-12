// Tony Fan custom APIs: all still to port, so each is a "not ported yet" placeholder.
import { withPlaceholders } from '../../custom-api-helpers.mjs';

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  acknowledge_po_tony: 'acknowledgePOTony',
  approve_rr_tony: 'approveRRTony'
};

export const apis = withPlaceholders(functions);
