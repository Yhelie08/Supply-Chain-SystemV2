// fcStampDelivery (zoho-export/parsed/functions/fcStampDelivery.dg) and the four workflows that call it, ported:
//   ISCHED_Instant_Forecast (Delivery_Scheduling, field SO), SR_Instant_Forecast (Service_Request1),
//   SA_Instant_Forecast (Service_Appointment_Form), FW_Instant_Forecast (Field_Work), all "on add or edit, on success".
//
// What it does: a delivery row can carry several sales orders (newline, semicolon or comma between them). For each order
// the forecast is read from Sales_Order_Fulfillment (one record per item, so the dates of one order differ); the LATEST
// date of all of them is the real delivery forecast; "Will Miss" wins for the status if any item misses. That date, its
// window and its status are copied onto the rows of the four delivery forms whose sales order text is EXACTLY the text
// that was saved (not "contains": a neighbouring row with a different list would otherwise be stamped, and stamp back),
// and only when a value differs.
//
// THE ENGINE IS NOT HERE. For an order with no forecast yet, Zoho calls `fcStampBySoNo` (864 lines, shared by Fulfillment,
// Procurement and Delivery), which works the forecast out. That belongs to the forecast milestone, so here it is a
// dependency: `forecastEngine.stampBySoNo`, empty until that port exists. Until then the call is skipped and logged once,
// and the stamp copies whatever forecast Sales_Order_Fulfillment already has (the forecast the earlier steps of the chain
// computed). When the engine is ported, set `forecastEngine.stampBySoNo = async (so, store) => ...`.
//
// Quirks kept ("mirrors Zoho"): the search for the latest date starts at today and the first dated item always wins the
// first comparison (even a past date); a missing window or status is written as the text "null".
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { todayDate, ymd } from '../../workflows/deluge.mjs';
import { day, nullText } from './scheduling.mjs';

export const forecastEngine = { stampBySoNo: null };
let warned = false;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// [form, the field that holds the sales order text]
const STAMPED = [['Delivery_Scheduling', 'SO'], ['Service_Request1', 'Sales_Order'], ['Service_Appointment_Form', 'Sales_Order'], ['Field_Work', 'Sales_Order']];

export async function fcStampDelivery(store, soText) {
  if (blank(soText) || String(soText) === 'null') return 'walang SO sa row na ito';
  const orders = String(soText).replaceAll('\n', ',').replaceAll('\r', ',').replaceAll(';', ',').split(',').map((s) => s.trim()).filter(Boolean);

  // First pass: every order should have a forecast; ask the engine for the ones that do not.
  let engineRuns = 0;
  for (const so of orders) {
    const rows = await store.find('Sales_Order_Fulfillment', (r) => r.SO_No === so);
    if (rows.some((r) => !blank(r.Forecast_Delivery))) continue;
    if (forecastEngine.stampBySoNo) { await forecastEngine.stampBySoNo(so, store); engineRuns += 1; } else if (!warned) {
      warned = true;
      console.warn('[forecast] fcStampBySoNo (the forecast engine) is not ported yet: orders with no forecast are not worked out here.');
    }
  }

  // Second pass: the latest date of all the items of all the orders.
  let latest = ymd(todayDate());
  let found = false;
  let window = '';
  let status = '';
  let anyMiss = false;
  for (const so of orders) {
    for (const r of await store.find('Sales_Order_Fulfillment', (x) => x.SO_No === so)) {
      const date = day(r.Forecast_Delivery);
      if (date === '') continue;
      if (r.Forecast_Status === 'Will Miss') anyMiss = true;
      if (!found || date > latest) { found = true; latest = date; window = nullText(r.Forecast_Window); status = nullText(r.Forecast_Status); }
    }
  }
  if (!found) return `${orders.length} SO, wala pa isa mang may forecast`;
  if (anyMiss) status = 'Will Miss';

  // Stamp the four forms, only the values that differ.
  let stamped = 0;
  for (const [form, field] of STAMPED) {
    for (const row of await store.find(form, (r) => r[field] === String(soText))) {
      const changes = {};
      if (day(row.Forecast_Delivery) !== latest) changes.Forecast_Delivery = latest;
      if (row.Forecast_Window !== window) changes.Forecast_Window = window;
      if (row.Forecast_Status !== status) changes.Forecast_Status = status;
      if (Object.keys(changes).length) await store.updateRecord(form, row.ID, changes, { byForm: true });
      stamped += 1;
    }
  }
  const [y, m, d] = latest.split('-');
  return `${orders.length} SO -> ${MONTHS[Number(m) - 1]} ${d}, ${y} | ${window} | ${status} | ${stamped} record | engine ${engineRuns}x`;
}

// `info thisapp.fcStampDelivery(input.Sales_Order + "")`: a blank order text is answered, not stamped.
const instantForecast = (field) => ({ record, store }) => fcStampDelivery(store, String(record[field] ?? ''));

for (const [form, field] of STAMPED) register(form, { afterAdd: instantForecast(field), afterUpdate: instantForecast(field) });
