// Delivery Management.
import './workflows.mjs';
import './approval-decisions.mjs';
import './auto-handoff.mjs';
import './settings.mjs';
import './time-window.mjs';
import { apis, functions } from './apis.mjs';
import { upsertDmsScheduleRequest, addDmsScheduleRequestMessage } from './cms-sync.mjs';
import { teamScoping } from './scoping.mjs';
import { rescoreAll } from './sorter.mjs';
import { generateRotation } from './rotation.mjs';
import { runConfirmCutoffCheck } from './confirmation.mjs';
import { archiveOldJobs } from './job-status.mjs';
import { checkRedeliverySilence } from './failure-redelivery.mjs';
import { checkMaintenanceDue } from './truck-maintenance.mjs';

export { teamScoping };

export default {
  label: 'Delivery Management',
  forms: ['Service_Appointment_Form', 'Field_Work', 'Delivery_Scheduling', 'Service_Request1', 'DMS_Exception_Queue', 'DMS_Schedule_Request', 'Service_Request', 'Schedule_Holds', 'Day_Plan', 'Delivery_Failure_Reasons', 'Sales_Returns_Form', 'Vehicle_Status', 'Vehicle_Maintenance_Log', 'Delivery_Settings_History', 'Delivery_Roster'],
  teamScoping,
  functions,
  apis,
  // Not Zoho schedules: the Sorting Engine's nightly full re-score (spec v1.4, 05/01 §6), and Team Rotation
  // (Delivery 02 §1, TM-R1) ahead of it so the Scheduling Engine always has teams to suggest from.
  schedules: [
    { name: 'Rotate_Delivery_Teams_Daily', at: '04:00', timeZone: 'Asia/Manila', run: (store) => generateRotation(store) },
    { name: 'Recalculate_Delivery_Queue', at: '05:00', timeZone: 'Asia/Manila', run: (store) => rescoreAll(store) },
    // Delivery 03 §1, AP-R4: unconfirmed by confirm_cutoff (spec default 5pm the day before) -> dispatcher alert.
    { name: 'Confirm_Cutoff_Daily', at: '17:00', timeZone: 'Asia/Manila', run: (store) => runConfirmCutoffCheck(store) },
    // Job status chain's "archived" stage (05/04; Delivery 03): no real archive action exists to hook (see
    // job-status.mjs's own header), so this is the only way the chain ever reaches archived.
    { name: 'Archive_Delivery_Jobs_Daily', at: '03:00', timeZone: 'Asia/Manila', run: (store) => archiveOldJobs(store) },
    // Delivery 05, FR-R4: done (partial/failed) with no redelivery scheduled within redelivery_silence_days.
    { name: 'Redelivery_Silence_Daily', at: '09:00', timeZone: 'Asia/Manila', run: (store) => checkRedeliverySilence(store) },
    // Delivery 08 §2, TK-R2: maintenance due warning (date- or km-based).
    { name: 'Maintenance_Due_Daily', at: '06:00', timeZone: 'Asia/Manila', run: (store) => checkMaintenanceDue(store) },
  ],
  // CMS -> DMS functions: not custom APIs (no widget calls them). See cms-sync.mjs.
  integrations: { upsertDmsScheduleRequest, addDmsScheduleRequestMessage },
  // Deluge functions this module ports without a custom API of their own (read by tools/build-module-readmes.mjs).
  portedFunctions: {
    fcStampDelivery: 'Ported (copies the forecast; for an order with none it calls the engine fcStampBySoNo, merged 2026-11-13)',
    upsertDmsScheduleRequest: 'Ported (inbound route /api/integrations/cms/schedule-request)',
    addDmsScheduleRequestMessage: 'Ported (inbound route /api/integrations/cms/message)',
    pushDmsStatusToCms: 'Ported (skipped until CMS_STATUS_URL is set)',
    pushDmsMessageToCms: 'Ported (skipped until CMS_MESSAGE_URL is set)',
    reScheduleDelivery: 'Ported (the dms_reschedule API runs it)',
  },
};
