// Tony Fan custom APIs: ported in procurement/supplier-portal.mjs (no Books call).
import { withPlaceholders } from '../../custom-api-helpers.mjs';
import { acknowledge_po_tony, approve_rr_tony } from '../procurement/supplier-portal.mjs';

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  acknowledge_po_tony: 'acknowledgePOTony',
  approve_rr_tony: 'approveRRTony'
};

export const apis = withPlaceholders(functions, { acknowledge_po_tony, approve_rr_tony });
