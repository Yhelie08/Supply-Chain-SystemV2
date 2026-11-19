# Fulfillment module manifest. Ported from server/modules/fulfillment/index.mjs. Importing this
# package registers every hook below, via each submodule's own `register(...)` calls at import time
# -- the same effect Node's index.mjs has by importing every sibling file.
#
# app.forecast.pr_hooks is deliberately NOT imported here: it registers on Purchase_Request1 and is
# Procurement's own wiring in Node (server/modules/procurement/workflows.mjs imports pr-hooks.mjs,
# not fulfillment/index.mjs) -- Procurement's own future slice imports it instead.
import app.fulfillment.workflows  # noqa: F401
import app.fulfillment.sorter_hooks  # noqa: F401
import app.fulfillment.pipeline  # noqa: F401
import app.fulfillment.qc_routing  # noqa: F401
import app.fulfillment.crate_dispatch  # noqa: F401
import app.fulfillment.exception_recheck  # noqa: F401
import app.fulfillment.stage_events  # noqa: F401
import app.fulfillment.apis  # noqa: F401

FORMS = [
    "Sales_Order_Fulfillment", "Checker_Checklist", "Crate_Checklist", "Sales_Order_Readiness_Gate",
    "Pre_Order_FF", "Order_Aggregation1", "Pick1", "Warehouse_Request", "Transfer_Warehouse",
    "Capacity_Days", "Stage_Events",
]
