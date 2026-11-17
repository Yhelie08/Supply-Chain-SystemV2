// Procurement: Inquiry, Purchase Request, Purchase Order, Shipments, Receiving, Replacement, Exceptions.
// The Tony Fan and Fenteng Lighting portals are their own modules.
import { runRrDaily } from './rr-spec.mjs';
import { runInquiryDaily } from './inq-spec.mjs';
import './workflows.mjs';
import { apis, functions } from './apis.mjs';
import { runShipment10DayCheck, runShipmentDelayStatus } from './shipment-schedules.mjs';
import { runShipmentLadder } from './ship-track.mjs';
import { runReceivingDaily } from './receiving-spec.mjs';

export default {
  label: 'Procurement',
  forms: ['Inquiry_Form', 'Purchase_Request1', 'Purchase_Order', 'Shipments', 'Receiving', 'Replacement_Request', 'Exceptions', 'Supplier_1', 'Supplier_2', 'Projects', 'Stage_Events', 'Ladder_Events', 'Approval_Queue', 'Procurement_Settings', 'Procurement_Settings_History', 'Target_Date_Changes'],
  functions,
  apis,
  // Scheduled workflows (run by server/schedules.mjs when SCHEDULES=on); the names are Zoho's. Both ran at 08:00 in Zoho.
  schedules: [
    { name: 'Daily_Shipment_10_Day_Che', at: '08:00', timeZone: 'Asia/Manila', run: (store, ctx) => runShipment10DayCheck(store, ctx) },
    { name: 'Shipment_Delay_Status_Dai', at: '08:00', timeZone: 'Asia/Manila', run: (store, ctx) => runShipmentDelayStatus(store, ctx) },
    // Not a Zoho schedule: the supplier ladder, the silence alert and the full re-score of the spec v1.4 (Ship & Track).
    { name: 'Shipment_Ladder_Daily', at: '08:10', timeZone: 'Asia/Manila', run: (store, ctx) => runShipmentLadder(store, ctx) },
    // Not a Zoho schedule: the Arrivals ranking and the receiving silence alerts of the spec v1.4.
    // Not a Zoho schedule: a supplier that has not quoted after inquiry_quote_days (spec Inquiry).
    { name: 'Inquiry_Quotes_Daily', at: '08:30', timeZone: 'Asia/Manila', run: (store, ctx) => runInquiryDaily(store, ctx) },
    // Not a Zoho schedule: a Replacement Request the supplier has not acknowledged (spec 06).
    { name: 'Replacement_Daily', at: '08:40', timeZone: 'Asia/Manila', run: (store, ctx) => runRrDaily(store, ctx) },
    { name: 'Receiving_Silence_Daily', at: '08:20', timeZone: 'Asia/Manila', run: (store, ctx) => runReceivingDaily(store, ctx) },
  ],
};
