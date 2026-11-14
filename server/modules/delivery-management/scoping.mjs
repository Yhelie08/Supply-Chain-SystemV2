// Team scoping configuration for Delivery Management
export const teamScoping = {
  rules: [
    { form: 'Service_Appointment_Form', report: 'Service_Appointment', field: 'Installer' },
    { form: 'Field_Work', report: 'Field_Work_Report', field: 'Assigned_to_Installer' },
  ],
  allowedTabs: ['Ongoing_Service1', 'Field_Service_Site_Visits1', 'Truck_Maintenance'],
  allowedWidgets: [
    'Delivery Management/Ongoing Service',
    'Delivery Management/Field Service Site Visits',
    'Delivery Management/Truck Maintenance',
  ],
};
