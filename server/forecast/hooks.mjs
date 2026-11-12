// The "Instant Forecast" workflows of the Fulfillment forms, ported. Each is "on add or edit, on success" and has one line of
// Deluge: `info thisapp.fcStampBySoNo(input.<SO field> + "")`, which works out the forecast of the order that was just saved
// and stamps it on the rows of that order (server/forecast/stamp.mjs). The field that holds the sales order has a different
// name on each form (four different spellings in the app).
//   SOF_Instant_Forecast        Sales_Order_Fulfillment     SO_No     only when the row has no Forecast_Delivery yet
//   GATE_Instant_Forecast       Sales_Order_Readiness_Gate  sales_order_number
//   GATE_Instant_Forecast1      Pick1                       SO        (named GATE_ in Zoho, but it sits on Pick1)
//   PREORDER_Instant_Forecast   Pre_Order_FF                SO
//   QC_Instant_Forecast         Checker_Checklist           SO
//   CRATE_Instant_Forecast      Crate_Checklist             SO
//   OA_Instant_Forecast         Order_Aggregation1          SO
// (The Delivery forms have their own four in server/modules/delivery-management/forecast-stamp.mjs.)
//
// The stamp writes through the plain store, which runs no hooks, so a stamp never fires these again; and it only writes a
// value that differs. This file is imported by the Fulfillment module (server/modules/fulfillment/workflows.mjs).
import { register } from '../workflows/index.mjs';
import { fcStampBySoNo } from './stamp.mjs';

const stampOnSave = (field, { onlyIfNoForecast = false } = {}) => async ({ record, store }) => {
  if (onlyIfNoForecast && !(record.Forecast_Delivery == null || record.Forecast_Delivery === '')) return;
  await fcStampBySoNo(store, String(record[field] ?? ''));
};
const on = (form, field, opts) => register(form, { afterAdd: stampOnSave(field, opts), afterUpdate: stampOnSave(field, opts) });

on('Sales_Order_Fulfillment', 'SO_No', { onlyIfNoForecast: true });
on('Sales_Order_Readiness_Gate', 'sales_order_number');
on('Pick1', 'SO');
on('Pre_Order_FF', 'SO');
on('Checker_Checklist', 'SO');
on('Crate_Checklist', 'SO');
on('Order_Aggregation1', 'SO');
