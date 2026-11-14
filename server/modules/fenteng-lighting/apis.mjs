// Fenteng Lighting custom APIs: ported in procurement/supplier-portal.mjs (no Books call).
import { withPlaceholders } from '../../custom-api-helpers.mjs';
import { acknowledge_po_fenteng, approve_rr_fenteng } from '../procurement/supplier-portal.mjs';

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  acknowledge_po_fenteng: 'acknowledgePOFenteng',
  approve_rr_fenteng: 'approveRRFenteng'
};

export const apis = withPlaceholders(functions, { acknowledge_po_fenteng, approve_rr_fenteng });
