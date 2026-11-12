// Loads the Delivery Management workflow ports; each file registers its hooks when imported.
// Order of work: see vault/Plans/Plan - Delivery Management.md (D1 small workflows, D2 scheduling engine, ...).
// Hooks of one form run in the order they are registered; Zoho runs SA_Scheduling_Engine before SA_Sync_Sales_Order_Display.
import './scheduling-engine.mjs';
import './service-appointment.mjs';
import './field-work.mjs';
import './delivery-scheduling.mjs';
import './exception-queue.mjs';
import './service-request.mjs';
