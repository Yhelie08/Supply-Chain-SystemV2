// Loads the Delivery Management workflow ports; each file registers its hooks when imported.
// Order of work: see vault/Plans/Plan - Delivery Management.md (D1 small workflows, D2 scheduling engine, ...).
import './service-appointment.mjs';
import './field-work.mjs';
import './delivery-scheduling.mjs';
