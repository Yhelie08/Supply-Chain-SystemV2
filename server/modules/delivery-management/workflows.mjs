// Loads the Delivery Management workflow ports; each file registers its hooks when imported.
// Order of work: see vault/Plans/Plan - Delivery Management.md (D1 small workflows, D2 scheduling engine, ...).
// Hooks of one form run in the order they are registered; Zoho runs SA_Scheduling_Engine before SA_Sync_Sales_Order_Display.
import './scheduling-engine.mjs';
// Day plans (spec v1.4, Delivery 02 §4): after scheduling-engine.mjs on purpose — it re-reads the appointment
// fresh, but must run after scheduling-engine's own Scheduled write to see it this same save.
import './day-plans.mjs';
import './service-appointment.mjs';
// Site Requirements Checklist (spec v1.4, Delivery 01): after service-appointment.mjs on purpose, see its own header.
import './site-checklist.mjs';
// Appointment confirmation (spec v1.4, Delivery 03 §1, AP-R2).
import './confirmation.mjs';
import './geocode.mjs';
import './field-work.mjs';
import './delivery-scheduling.mjs';
import './exception-queue.mjs';
import './service-request.mjs';
import './forecast-stamp.mjs';
// Sorting Engine (spec v1.4, 05/01; Delivery 02 §2): category, queue rank, priority reason on every open appointment.
import './sorter-hooks.mjs';
// Job status chain + event log (spec v1.4, Delivery 03 "Job statuses"; 05/04 Timestamps and Event Log). Last on
// purpose: reads the fully-settled appointment after every other hook above has run this save.
import './job-status.mjs';
// Sales Returns status chain (spec v1.4, Delivery 07 §1, RT-R6): keeps a return in sync with its linked
// pull-out appointment.
import './sales-returns.mjs';
// Field Service Site Visits (spec v1.4, Delivery 08 §1, SV-R2/R3): carries a site visit's checklist onto the
// later installation appointment for the same Sales Order.
import './site-visits.mjs';
