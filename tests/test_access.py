from app.access import create_access

SECTIONS = [
    {"id": "analytic", "label": "Analytic", "tabs": [
        {"page": "Supply_Chain_Analytic", "label": "Supply Chain Analytic", "widget": "Analytic/Supply Chain Analytic"},
    ]},
    {"id": "delivery", "label": "Delivery Management", "tabs": [
        {"page": "Policy_Settings1", "label": "Policy Settings", "widget": "Delivery Management/Policy Settings", "adminOnly": True},
        {"page": "Ongoing_Service1", "label": "Ongoing Service", "widget": "Delivery Management/Ongoing Service"},
        {"page": "Field_Service_Site_Visits1", "label": "Field Service Site Visits", "widget": "Delivery Management/Field Service Site Visits"},
        {"page": "Truck_Maintenance", "label": "Truck Maintenance", "widget": "Delivery Management/Truck Maintenance"},
        {"page": "Service_Request1", "label": "Service Request", "widget": "Delivery Management/Service Request"},
    ]},
]

ADMIN = {"role": "admin"}
REGULAR = {"role": "user"}
FIELD = {"role": "user", "team_name": "Team A"}


def test_admin_sees_every_section_and_tab_unfiltered():
    access = create_access(SECTIONS, "/widgets")
    assert access.visible_sections(ADMIN) == SECTIONS


def test_regular_user_sees_every_section_but_admin_only_tabs_are_removed():
    access = create_access(SECTIONS, "/widgets")
    visible = access.visible_sections(REGULAR)
    delivery = next(s for s in visible if s["id"] == "delivery")
    pages = [t["page"] for t in delivery["tabs"]]
    assert "Policy_Settings1" not in pages
    assert "Ongoing_Service1" in pages
    analytic = next(s for s in visible if s["id"] == "analytic")
    assert len(analytic["tabs"]) == 1  # unaffected, no adminOnly tabs there


def test_field_user_sees_only_delivery_with_the_three_allowed_tabs():
    access = create_access(SECTIONS, "/widgets")
    visible = access.visible_sections(FIELD)
    assert len(visible) == 1
    assert visible[0]["id"] == "delivery"
    pages = {t["page"] for t in visible[0]["tabs"]}
    assert pages == {"Ongoing_Service1", "Field_Service_Site_Visits1", "Truck_Maintenance"}


def test_can_serve_file_admin_can_serve_anything():
    access = create_access(SECTIONS, "/widgets")
    assert access.can_serve_file(ADMIN, "/widgets/Delivery Management/Policy Settings/app/index.html") is True


def test_can_serve_file_regular_user_cannot_serve_an_admin_only_widget():
    access = create_access(SECTIONS, "/widgets")
    assert access.can_serve_file(REGULAR, "/widgets/Delivery Management/Policy Settings/app/index.html") is False
    assert access.can_serve_file(REGULAR, "/widgets/Delivery Management/Ongoing Service/app/index.html") is True


def test_can_serve_file_field_user_can_only_serve_their_three_allowed_widgets():
    access = create_access(SECTIONS, "/widgets")
    assert access.can_serve_file(FIELD, "/widgets/Delivery Management/Ongoing Service/app/index.html") is True
    assert access.can_serve_file(FIELD, "/widgets/Delivery Management/Service Request/app/index.html") is False


def test_check_call_denies_a_regular_user_writing_to_an_admin_only_form():
    access = create_access(SECTIONS, "/widgets")
    denied = access.check_call(REGULAR, "addRecords", {"form_name": "Policy_Settings"})
    assert denied is not None
    assert denied["code"] == 403


def test_check_call_allows_a_regular_user_writing_to_a_normal_form():
    access = create_access(SECTIONS, "/widgets")
    denied = access.check_call(REGULAR, "addRecords", {"form_name": "Sales_Order_Fulfillment"})
    assert denied is None


def test_check_call_allows_an_admin_writing_anything():
    access = create_access(SECTIONS, "/widgets")
    denied = access.check_call(ADMIN, "addRecords", {"form_name": "Policy_Settings"})
    assert denied is None


def test_check_call_only_applies_to_write_ops_get_records_is_unaffected():
    access = create_access(SECTIONS, "/widgets")
    denied = access.check_call(REGULAR, "getRecords", {"report_name": "Policy_Settings_Report"})
    assert denied is None


def test_check_upload_denies_a_regular_user_on_an_admin_only_report():
    access = create_access(SECTIONS, "/widgets")
    assert access.check_upload(REGULAR, "Policy_Settings") is not None
    assert access.check_upload(ADMIN, "Policy_Settings") is None


def test_scope_criteria_adds_team_filter_for_field_users_on_a_scoped_report():
    scoping = {
        "rules": [{"form": "Service_Appointment_Form", "report": "Service_Appointment", "field": "Installer"}],
        "allowedTabs": ["Ongoing_Service1"],
        "allowedWidgets": ["Delivery Management/Ongoing Service"],
    }
    access = create_access(SECTIONS, "/widgets", scoping)
    result = access.scope_criteria(FIELD, "Service_Appointment", "")
    assert result == '(Installer == "Team A")'


def test_scope_criteria_combines_with_existing_user_criteria():
    scoping = {
        "rules": [{"form": "Service_Appointment_Form", "report": "Service_Appointment", "field": "Installer"}],
        "allowedTabs": [], "allowedWidgets": [],
    }
    access = create_access(SECTIONS, "/widgets", scoping)
    result = access.scope_criteria(FIELD, "Service_Appointment", '(Status == "Yes")')
    assert result == '((Installer == "Team A") && (Status == "Yes"))'


def test_scope_criteria_is_a_no_op_for_admins_and_unscoped_reports():
    access = create_access(SECTIONS, "/widgets")
    assert access.scope_criteria(ADMIN, "Service_Appointment", "") == ""
    assert access.scope_criteria(FIELD, "Sales_Order_Fulfillment_Report", "") == ""


def test_check_record_access_denies_a_field_user_for_a_record_belonging_to_another_team():
    scoping = {
        "rules": [{"form": "Service_Appointment_Form", "report": "Service_Appointment", "field": "Installer"}],
        "allowedTabs": [], "allowedWidgets": [],
    }
    access = create_access(SECTIONS, "/widgets", scoping)
    denied = access.check_record_access(FIELD, "Service_Appointment", {"Installer": "Team B"})
    assert denied is not None
    assert denied["code"] == 403


def test_check_record_access_allows_a_field_user_for_their_own_teams_record():
    scoping = {
        "rules": [{"form": "Service_Appointment_Form", "report": "Service_Appointment", "field": "Installer"}],
        "allowedTabs": [], "allowedWidgets": [],
    }
    access = create_access(SECTIONS, "/widgets", scoping)
    denied = access.check_record_access(FIELD, "Service_Appointment", {"Installer": "Team A"})
    assert denied is None
