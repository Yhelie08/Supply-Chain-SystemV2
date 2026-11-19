# PR1_Forecast_Stamp ("on add or edit, on success" of Purchase_Request1), ported from
# server/forecast/pr-hooks.mjs: works out the forecast of the PR, stamps the PR and its order, and
# copies it onto the Pre Order rows of the PR. Imported by the Procurement module in Node
# (server/modules/procurement/workflows.mjs), NOT by Fulfillment -- app/fulfillment/__init__.py
# does not import this file; Procurement's own future slice does. The stamp writes through the
# plain store, so it does not fire this again.
from app.workflows import register
from app.forecast.purchase_request import fc_pr_to_pre_order


async def _stamp(args):
    await fc_pr_to_pre_order(args["store"], args["id"])


register("Purchase_Request1", {"afterAdd": _stamp, "afterUpdate": _stamp})
