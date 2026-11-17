// Procurement: Inquiry, Purchase Request, Purchase Order, Shipments, Receiving, Replacement, Exceptions.
// The Tony Fan and Fenteng Lighting portals are their own modules.
import './workflows.mjs';
import { apis, functions } from './apis.mjs';
import { runShipment10DayCheck, runShipmentDelayStatus } from './shipment-schedules.mjs';

export default {
  label: 'Procurement',
  forms: ['Inquiry_Form', 'Purchase_Request1', 'Purchase_Order', 'Shipments', 'Receiving', 'Replacement_Request', 'Exceptions', 'Supplier_1', 'Supplier_2', 'Projects'],
  functions,
  apis,
  // Scheduled workflows (run by server/schedules.mjs when SCHEDULES=on); the names are Zoho's. Both ran at 08:00 in Zoho.
  schedules: [
    { name: 'Daily_Shipment_10_Day_Che', at: '08:00', timeZone: 'Asia/Manila', run: (store, ctx) => runShipment10DayCheck(store, ctx) },
    { name: 'Shipment_Delay_Status_Dai', at: '08:00', timeZone: 'Asia/Manila', run: (store, ctx) => runShipmentDelayStatus(store, ctx) },
  ],
};
