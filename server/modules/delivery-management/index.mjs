// Delivery Management.
import './workflows.mjs';
import { apis, functions } from './apis.mjs';
import { upsertDmsScheduleRequest, addDmsScheduleRequestMessage } from './cms-sync.mjs';

export default {
  label: 'Delivery Management',
  forms: ['Service_Appointment_Form', 'Field_Work', 'Delivery_Scheduling', 'Service_Request1', 'DMS_Exception_Queue', 'DMS_Schedule_Request', 'Service_Request'],
  functions,
  apis,
  // CMS -> DMS functions: not custom APIs (no widget calls them). See cms-sync.mjs.
  integrations: { upsertDmsScheduleRequest, addDmsScheduleRequestMessage },
};
