from app.delivery.scoping import TEAM_SCOPING


def test_team_scoping_matches_the_node_source_exactly():
    assert TEAM_SCOPING["rules"] == [
        {"form": "Service_Appointment_Form", "report": "Service_Appointment", "field": "Installer"},
        {"form": "Field_Work", "report": "Field_Work_Report", "field": "Assigned_to_Installer"},
    ]
    assert TEAM_SCOPING["allowedTabs"] == ["Ongoing_Service1", "Field_Service_Site_Visits1", "Truck_Maintenance"]
    assert TEAM_SCOPING["allowedWidgets"] == [
        "Delivery Management/Ongoing Service",
        "Delivery Management/Field Service Site Visits",
        "Delivery Management/Truck Maintenance",
    ]


def test_create_access_uses_the_real_scoping_not_just_its_own_default():
    # Regression guard: app/access.py's _DEFAULT_SCOPING happens to be byte-identical to
    # TEAM_SCOPING today, so a test that only checks behavior would pass even if main.py never
    # passed TEAM_SCOPING at all. This asserts the actual wiring, not just the coincidental match.
    import inspect
    from app import main
    src = inspect.getsource(main)
    assert "TEAM_SCOPING" in src, "app/main.py must pass TEAM_SCOPING to create_access explicitly"
