# Procurement custom APIs: the ported ones, and a "not ported yet" placeholder for the rest. Ported
# from server/modules/procurement/apis.mjs.
#
# approve_po_* are what the Purchase Request tab's "Create PO" button calls; Approve_P_O_H_C is the
# link name Creator generated for approve_po_hc. Every handler below that is itself defined in
# another Procurement file (po_create.py, po_approval.py, clone_shipment.py,
# receiving_buttons.py, replacement_requests.py, settings_hooks.py, dashboard.py) already registers
# itself into app.custom_apis.CUSTOM_APIS at import time, the same self-registering pattern
# app/fulfillment/apis.py uses -- importing those modules here is what makes
# invoke_custom_api find them. get_born_late_rate (po_spec.py), get_po_tracking (po_spec.py) and
# get_rr_report (rr_spec.py) exist as plain functions but were never wired into CUSTOM_APIS by their
# own files (Node wires them here too, in apis.mjs, not in po-spec.mjs/rr-spec.mjs), so this file
# registers those three directly.
#
# create_bin_receiving is a genuine placeholder in Node itself (createBinReceivingWidget.dg is never
# implemented there either) -- not registered: app.custom_apis.invoke_custom_api's own fallback
# answers it with the standard "not ported yet" message.
from app.custom_apis import CUSTOM_APIS

import app.procurement.clone_shipment  # noqa: F401 -- registers clone_shipment_for_replacement
import app.procurement.dashboard  # noqa: F401 -- registers get_procurement_dashboard
import app.procurement.po_approval  # noqa: F401 -- registers approve_po_main/approve_po_tony/approve_po_fenteng/Approve_P_O_H_C
import app.procurement.receiving_buttons  # noqa: F401 -- registers create_receiving_from_shipment
import app.procurement.replacement_requests  # noqa: F401 -- registers create_rr_main/create_rr_tony/create_rr_fenteng
import app.procurement.settings_hooks  # noqa: F401 -- registers preview_procurement_setting/recalculate_shipments/get_procurement_settings
import app.procurement.books_apis  # noqa: F401 -- registers create_books_contact/add_item_by_id/fetch_customer_from_books
import app.procurement.estimates  # noqa: F401 -- registers create_estimate
import app.procurement.akeneo_apis  # noqa: F401 -- registers search_items_akeneo/fetch_item_from_akeneo
import app.procurement.supplier_portal  # noqa: F401 -- registers acknowledge_po_tony/acknowledge_po_fenteng/approve_rr_tony/approve_rr_fenteng
from app.procurement.po_spec import get_born_late_rate, get_po_tracking
from app.procurement.rr_spec import get_rr_report


async def _get_born_late_rate_api(payload: dict, store, ctx: dict) -> dict:
    return await get_born_late_rate(payload or {}, store)


async def _get_po_tracking_api(payload: dict, store, ctx: dict) -> dict:
    return await get_po_tracking(payload or {}, store)


async def _get_rr_report_api(payload: dict, store, ctx: dict) -> dict:
    return await get_rr_report(payload or {}, store)


CUSTOM_APIS["get_born_late_rate"] = _get_born_late_rate_api
CUSTOM_APIS["get_po_tracking"] = _get_po_tracking_api
CUSTOM_APIS["get_rr_report"] = _get_rr_report_api
