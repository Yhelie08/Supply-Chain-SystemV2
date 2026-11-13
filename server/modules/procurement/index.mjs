// Procurement: Inquiry, Purchase Request, Purchase Order, Shipments, Receiving, Replacement, Exceptions.
// The Tony Fan and Fenteng Lighting portals are their own modules.
import './workflows.mjs';
import { apis, functions } from './apis.mjs';

export default {
  label: 'Procurement',
  forms: ['Inquiry_Form', 'Purchase_Request1', 'Purchase_Order', 'Shipments', 'Receiving', 'Replacement_Request', 'Exceptions', 'Supplier_1', 'Supplier_2', 'Projects'],
  functions,
  apis,
};
