# app/procurement/__init__.py (module manifest): importing it registers every Procurement hook,
# mirroring server/modules/procurement/{index,workflows}.mjs.
from app.workflows import WORKFLOWS
import app.procurement  # noqa: F401 -- import registers every hook as a side effect


def test_importing_the_module_registers_hooks_on_every_form_it_owns():
    for form in ["Inquiry_Form", "Purchase_Request1", "Purchase_Order", "Shipments", "Receiving", "Replacement_Request", "Exceptions", "Projects", "Approval_Queue", "Procurement_Settings"]:
        assert form in WORKFLOWS, form


def test_forms_list_matches_the_forms_this_module_touches():
    assert set(app.procurement.FORMS) == {
        "Inquiry_Form", "Purchase_Request1", "Purchase_Order", "Shipments", "Receiving",
        "Replacement_Request", "Exceptions", "Supplier_1", "Supplier_2", "Projects",
        "Ladder_Events", "Approval_Queue", "Procurement_Settings", "Procurement_Settings_History",
        "Target_Date_Changes",
    }


def test_pr_hooks_is_imported_by_the_procurement_module():
    import sys
    assert "app.forecast.pr_hooks" in sys.modules
    assert "Purchase_Request1" in WORKFLOWS


def test_custom_apis_are_registered_via_apis_module():
    from app.custom_apis import CUSTOM_APIS
    for name in ["approve_po_main", "approve_po_tony", "approve_po_fenteng", "Approve_P_O_H_C",
                 "create_receiving_from_shipment", "clone_shipment_for_replacement",
                 "create_rr_main", "create_rr_tony", "create_rr_fenteng",
                 "preview_procurement_setting", "recalculate_shipments", "get_procurement_settings",
                 "get_born_late_rate", "get_po_tracking", "get_rr_report", "get_procurement_dashboard"]:
        assert name in CUSTOM_APIS, name


def test_books_akeneo_are_now_registered_only_genuine_placeholders_are_not():
    # Books/Akeneo/Shopify were ported in the 2026-11-20 Integrations sub-project (see
    # app/procurement/books_apis.py, estimates.py, akeneo_apis.py) -- they are real handlers now,
    # not placeholders. create_bin_receiving stays a genuine Node placeholder
    # (createBinReceivingWidget.dg is never implemented there either).
    from app.custom_apis import CUSTOM_APIS
    for name in ["add_item_by_id", "create_books_contact", "fetch_customer_from_books",
                 "search_items_akeneo", "fetch_item_from_akeneo", "create_estimate"]:
        assert name in CUSTOM_APIS, name
    assert "create_bin_receiving" not in CUSTOM_APIS


def test_supplier_portal_is_registered():
    # Ported from server/modules/procurement/supplier-portal.mjs (see app/procurement/supplier_portal.py).
    from app.custom_apis import CUSTOM_APIS
    for name in ["acknowledge_po_tony", "acknowledge_po_fenteng", "approve_rr_tony", "approve_rr_fenteng"]:
        assert name in CUSTOM_APIS, name
