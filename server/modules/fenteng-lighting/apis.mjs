// Fenteng Lighting custom APIs: all still to port, so each is a "not ported yet" placeholder.
import { withPlaceholders } from '../../custom-api-helpers.mjs';

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  acknowledge_po_fenteng: 'acknowledgePOFenteng',
  approve_rr_fenteng: 'approveRRFenteng'
};

export const apis = withPlaceholders(functions);
