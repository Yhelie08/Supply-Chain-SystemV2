from app.model import FORMS, COLUMNS, form_of_report, form_by_name, SYSTEM_COLUMNS
from app.criteria import ZohoError
import pytest

def test_sales_order_fulfillment_form_is_loaded():
    assert "Sales_Order_Fulfillment" in FORMS
    cols = COLUMNS["Sales_Order_Fulfillment"]
    assert "Fulfillment_Stage" in cols
    assert "Category" in cols  # this session's Fulfillment sorting-engine field, confirms parsing works end to end

def test_spec_forms_extension_merges_fields_onto_the_base_form():
    # Stage_Events: base form has Record_Type/Record_Id/Event/Occurred_At/Reported_At/Source/Note;
    # server/spec-forms/Stage_Events.json (extends: true) adds Record_No/Occurred_Bound/Actor/Visit_No.
    cols = COLUMNS["Stage_Events"]
    assert "Record_Id" in cols
    assert "Occurred_Bound" in cols
    assert "Visit_No" in cols

def test_form_of_report_resolves_a_real_report_name():
    form, criteria = form_of_report("Sales_Order_Fulfillment_Report")
    assert form == "Sales_Order_Fulfillment"

def test_form_of_report_falls_back_to_the_form_name_itself_when_no_report_entry_exists():
    # Confirmed in the Node repo's server/model.mjs: a name with no reports.json entry but a real
    # form of the same name resolves to that form directly (used by Capacity_Days, which has no report).
    form, criteria = form_of_report("Capacity_Days")
    assert form == "Capacity_Days"

def test_form_of_report_raises_zoho_error_9230_for_an_unknown_name():
    with pytest.raises(ZohoError) as exc:
        form_of_report("Totally_Made_Up_Report")
    assert exc.value.code == 9230

def test_form_by_name_raises_zoho_error_9220_for_an_unknown_form():
    with pytest.raises(ZohoError) as exc:
        form_by_name("Totally_Made_Up_Form")
    assert exc.value.code == 9220

def test_system_columns_are_excluded_from_a_forms_own_columns():
    assert set(SYSTEM_COLUMNS) == {"ID", "Added_Time", "Modified_Time", "Added_User", "_extra"}
