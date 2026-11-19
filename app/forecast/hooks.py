# The "Instant Forecast" workflows of the Fulfillment forms, ported from server/forecast/hooks.mjs.
# Each is "on add or edit, on success" and works out the forecast of the order that was just saved,
# stamping it on every row of that order. The field holding the sales order has a different name on
# each form (four different spellings in the app). Imported by app/fulfillment/workflows.py, the
# same place Node's hooks.mjs is imported from fulfillment/workflows.mjs.
#
#   SOF_Instant_Forecast        Sales_Order_Fulfillment     SO_No     only when the row has no
#                                                                      Forecast_Delivery yet
#   GATE_Instant_Forecast       Sales_Order_Readiness_Gate  sales_order_number
#   GATE_Instant_Forecast1      Pick1                       SO
#   PREORDER_Instant_Forecast   Pre_Order_FF                SO
#   QC_Instant_Forecast         Checker_Checklist            SO
#   CRATE_Instant_Forecast      Crate_Checklist              SO
#   OA_Instant_Forecast         Order_Aggregation1           SO
from app.workflows import register
from app.forecast.stamp import fc_stamp_by_so_no


def _blank(v) -> bool:
    return v is None or v == ""


def _stamp_on_save(field: str, only_if_no_forecast: bool = False):
    async def hook(args):
        record = args["record"]
        if only_if_no_forecast and not _blank(record.get("Forecast_Delivery")):
            return
        await fc_stamp_by_so_no(args["store"], str(record.get(field) or ""))
    return hook


def _on(form: str, field: str, only_if_no_forecast: bool = False) -> None:
    hook = _stamp_on_save(field, only_if_no_forecast)
    register(form, {"afterAdd": hook, "afterUpdate": hook})


_on("Sales_Order_Fulfillment", "SO_No", only_if_no_forecast=True)
_on("Sales_Order_Readiness_Gate", "sales_order_number")
_on("Pick1", "SO")
_on("Pre_Order_FF", "SO")
_on("Checker_Checklist", "SO")
_on("Crate_Checklist", "SO")
_on("Order_Aggregation1", "SO")
