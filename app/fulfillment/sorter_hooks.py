# Event-triggered scoring (spec §05/01 §6: "any material event ... re-score that Sales Order's
# records immediately"). Ported from server/modules/fulfillment/sorter-hooks.mjs. Registered on the
# two forms whose saves can change a package's category or rank: the package itself, and its
# Readiness Gate records (payment/approval changes flip Blocked on and off). The nightly schedule
# (app/forecast/schedule.py's spirit, not wired to cron) and the manual trigger (apis.py's
# recalculate_fulfillment_queue) call rescore_all directly.
#
# No re-entrancy risk: the `store` a hook receives (app/workflows.py's create_hooked_store) is
# always the raw, unhooked store the wrapper closes over, never the wrapper itself -- so
# rescore_one's writes here cannot re-trigger these same hooks.
from app.deluge import blank
from app.fulfillment.sorter import rescore_one
from app.workflows import register


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def _on_sof_save(args: dict) -> None:
    await rescore_one(args["store"], _text(args["record"].get("SO_No")))


register("Sales_Order_Fulfillment", {"afterAdd": _on_sof_save, "afterUpdate": _on_sof_save})


async def _on_gate_save(args: dict) -> None:
    await rescore_one(args["store"], _text(args["record"].get("sales_order_number")))


register("Sales_Order_Readiness_Gate", {"afterAdd": _on_gate_save, "afterUpdate": _on_gate_save})
