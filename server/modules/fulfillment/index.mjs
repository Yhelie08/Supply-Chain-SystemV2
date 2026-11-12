// Fulfillment.
import { apis, functions } from './apis.mjs';

export default {
  label: 'Fulfillment',
  forms: ['Sales_Order_Fulfillment', 'Checker_Checklist', 'Crate_Checklist', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Order_Aggregation1', 'Pick1', 'Pack', 'Warehouse_Request', 'Transfer_Warehouse'],
  functions,
  apis,
};
