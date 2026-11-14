// Delivery Management.
import './workflows.mjs';
import { apis, functions } from './apis.mjs';
import { upsertDmsScheduleRequest, addDmsScheduleRequestMessage } from './cms-sync.mjs';
import { teamScoping } from './scoping.mjs';

export { teamScoping };

export default {
  label: 'Delivery Management',
  forms: ['Service_Appointment_Form', 'Field_Work', 'Delivery_Scheduling', 'Service_Request1', 'DMS_Exception_Queue', 'DMS_Schedule_Request', 'Service_Request'],
  teamScoping,
  functions,
  apis,
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
