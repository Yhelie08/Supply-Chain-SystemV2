# Team scoping configuration for Delivery Management. Ported from
# server/modules/delivery-management/scoping.mjs. Consumed by app/main.py's create_access() call
# (app/access.py's Phase 2: row-level team scoping for field installer teams).
TEAM_SCOPING = {
    "rules": [
        {"form": "Service_Appointment_Form", "report": "Service_Appointment", "field": "Installer"},
        {"form": "Field_Work", "report": "Field_Work_Report", "field": "Assigned_to_Installer"},
    ],
    "allowedTabs": ["Ongoing_Service1", "Field_Service_Site_Visits1", "Truck_Maintenance"],
    "allowedWidgets": [
        "Delivery Management/Ongoing Service",
        "Delivery Management/Field Service Site Visits",
        "Delivery Management/Truck Maintenance",
    ],
}
