// Fulfillment.
import './workflows.mjs';
import { apis, functions } from './apis.mjs';
import { runForecastStampDaily, runBackfillPreOrder } from '../../forecast/schedule.mjs';

export default {
  label: 'Fulfillment',
  forms: ['Sales_Order_Fulfillment', 'Checker_Checklist', 'Crate_Checklist', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Order_Aggregation1', 'Pick1', 'Pack', 'Warehouse_Request', 'Transfer_Warehouse'],
  functions,
  apis,
  // Deluge functions this module ports without a custom API of their own (read by tools/build-module-readmes.mjs). The forecast
  // functions are shared code in server/forecast/ and are listed here because Fulfillment registers their hooks and schedules.
  portedFunctions: {
    fcStampBySoNo: 'Ported (server/forecast/stamp.mjs; not yet compared with Zoho Development)',
    fcStampPurchaseRequest: 'Ported (server/forecast/purchase-request.mjs; not yet compared with Zoho Development)',
    fcPrToPreOrder: 'Ported (server/forecast/purchase-request.mjs; not yet compared with Zoho Development)',
  },
  // Scheduled workflows (run by server/schedules.mjs when SCHEDULES=on); the names are Zoho's.
  schedules: [
    { name: 'Forecast_Stamp_Daily', at: '01:00', timeZone: 'Asia/Manila', run: (store, ctx) => runForecastStampDaily(store, ctx) },
    { name: 'Backfill_PreOrder_Forecas', at: '01:00', timeZone: 'Asia/Manila', run: (store, ctx) => runBackfillPreOrder(store, ctx) },
  ],
};
