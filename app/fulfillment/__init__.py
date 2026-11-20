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
import app.fulfillment.mandatory  # noqa: F401
import app.fulfillment.urgency  # noqa: F401
import app.fulfillment.apis  # noqa: F401
import app.fulfillment.release_bulk  # noqa: F401
import app.fulfillment.release_guard  # noqa: F401
import app.fulfillment.exception_hold  # noqa: F401
import app.fulfillment.scoreboard  # noqa: F401
import app.fulfillment.delivery_failures  # noqa: F401
from app.fulfillment.sorter import rescore_all
from app.forecast.schedule import run_backfill_pre_order, run_forecast_stamp_daily

FORMS = [
    "Sales_Order_Fulfillment", "Checker_Checklist", "Crate_Checklist", "Sales_Order_Readiness_Gate",
    "Pre_Order_FF", "Order_Aggregation1", "Pick1", "Warehouse_Request", "Transfer_Warehouse",
    "Capacity_Days", "Stage_Events",
]

# Scheduled workflows (run by app/schedules.py when SCHEDULES=on); the names are Zoho's. Same names and times as Node's
# server/modules/fulfillment/index.mjs. Each `run` gets the plain store and a log function.
SCHEDULES = [
    {"name": "Forecast_Stamp_Daily", "at": "01:00", "time_zone": "Asia/Manila", "run": lambda store, log: run_forecast_stamp_daily(store, log=log)},
    {"name": "Backfill_PreOrder_Forecas", "at": "01:00", "time_zone": "Asia/Manila", "run": lambda store, log: run_backfill_pre_order(store, log=log)},
    {"name": "Recalculate_Fulfillment_Queue", "at": "05:00", "time_zone": "Asia/Manila", "run": lambda store, log: rescore_all(store, trigger="nightly")},
]
