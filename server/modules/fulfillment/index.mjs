// Fulfillment.
import './workflows.mjs';
import { apis, functions } from './apis.mjs';
import { runForecastStampDaily, runBackfillPreOrder } from '../../forecast/schedule.mjs';

export default {
  label: 'Fulfillment',
  forms: ['Sales_Order_Fulfillment', 'Checker_Checklist', 'Crate_Checklist', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Order_Aggregation1', 'Pick1', 'Pack', 'Warehouse_Request', 'Transfer_Warehouse'],
  functions,
  apis,
  // Scheduled workflows (run by server/schedules.mjs when SCHEDULES=on); the names are Zoho's.
  schedules: [
    { name: 'Forecast_Stamp_Daily', at: '01:00', timeZone: 'Asia/Manila', run: (store, ctx) => runForecastStampDaily(store, ctx) },
    { name: 'Backfill_PreOrder_Forecas', at: '01:00', timeZone: 'Asia/Manila', run: (store, ctx) => runBackfillPreOrder(store, ctx) },
  ],
};
