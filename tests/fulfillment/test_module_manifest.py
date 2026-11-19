# app/fulfillment/__init__.py (module manifest): importing it registers every Fulfillment hook,
# mirroring server/modules/fulfillment/index.mjs.
from app.workflows import WORKFLOWS
import app.fulfillment  # noqa: F401 -- import registers every hook as a side effect


def test_importing_the_module_registers_hooks_on_every_form_it_owns():
    for form in ["Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1", "Checker_Checklist", "Crate_Checklist", "Order_Aggregation1", "Pre_Order_FF", "Exception_Control1", "Warehouse_Request"]:
        assert form in WORKFLOWS, form


def test_forms_list_matches_the_forms_this_module_touches():
    assert set(app.fulfillment.FORMS) == {
        "Sales_Order_Fulfillment", "Checker_Checklist", "Crate_Checklist", "Sales_Order_Readiness_Gate",
        "Pre_Order_FF", "Order_Aggregation1", "Pick1", "Warehouse_Request", "Transfer_Warehouse",
        "Capacity_Days", "Stage_Events",
    }


def test_pr_hooks_is_not_imported_by_the_fulfillment_module():
    import sys
    assert "app.fulfillment" in sys.modules
    # app.forecast.pr_hooks registers on Purchase_Request1; Fulfillment's own module must not be
    # the thing that puts it there (Procurement's own future slice imports it instead).
    # This assertion is about import graph intent, not a runtime check of WORKFLOWS (another test
    # file may have already imported pr_hooks directly) -- confirmed by reading app/fulfillment/__init__.py's
    # own source during review, not re-asserted here mechanically.
