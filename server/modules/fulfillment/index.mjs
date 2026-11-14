// Fulfillment.
import { apis, functions } from './apis.mjs';
import './workflows.mjs';
import './pipeline.mjs';
import './qc-routing.mjs';
import './crate-dispatch.mjs';
import './exception-recheck.mjs';

export default {
  label: 'Fulfillment',
  forms: ['Sales_Order_Fulfillment', 'Checker_Checklist', 'Crate_Checklist', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Order_Aggregation1', 'Pick1', 'Warehouse_Request', 'Transfer_Warehouse'],
  functions,
  apis,
};
