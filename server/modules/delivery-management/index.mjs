// Delivery Management.
import { apis, functions } from './apis.mjs';

export default {
  label: 'Delivery Management',
  forms: ['Service_Appointment_Form', 'Field_Work', 'Delivery_Scheduling', 'Service_Request1', 'DMS_Exception_Queue', 'DMS_Schedule_Request', 'Service_Request'],
  functions,
  apis,
};
