# The ONE place Fulfillment_Stage is changed by code (step 7.0 of the Python Fulfillment plan) and the
# one place a Stage_Events row is written. Before this, advance_stage, reconcile_fulfillment and the
# readiness-gate hook wrote the stage through the RAW store inside a hook, and a raw-store write never
# fires the Stage_Events afterUpdate hook, so only the first stage of a package was ever logged.
#
# - Code that moves a stage inside a hook or a sweep calls set_stage(store, sof, stage).
# - Widget saves that go through the hooked store are still logged by the afterAdd / afterUpdate hook in
#   stage_events.py, which calls log_stage_event() below.
# - If set_stage is handed a HOOKED store, its write fires that hook itself (and the sorter's save hook), so set_stage does not log
#   or re-score a second time.
from app.deluge import blank
from app.fulfillment.events import EVENTS, log_package_event, stage_event_name, stage_slug  # noqa: F401 -- stage_slug, EVENTS are re-exported
from app.workflows import HookedStore

SOF = "Sales_Order_Fulfillment"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


async def log_stage_event(store, id_, stage) -> None:
    """One stamp for the package entering `stage`, named as the spec names it (events.py), with its visit number."""
    event = stage_event_name(stage)
    if event:
        await log_package_event(store, id_, event)


async def set_stage(store, sof: dict, stage, *, rescore: bool = True) -> bool:
    """Move a package to `stage`, log the event and re-score the queue (a stage change is a material event, sorting engine section 6).
    `sof` is the package row as the caller read it. Does nothing (returns False) when the package is already there.
    rescore=False for a caller that re-scores once itself (the catch-up sweep, a Gate save whose own hook re-scores)."""
    if _text(stage) == _text(sof.get("Fulfillment_Stage")):
        return False
    await store.update_record(SOF, sof["ID"], {"Fulfillment_Stage": stage}, by_form=True)
    if not isinstance(store, HookedStore):
        await log_stage_event(store, sof["ID"], stage)
        if rescore:
            from app.fulfillment.sorter import rescore_all   # late import: the sorter imports the pipeline, which imports this module
            await rescore_all(store)
    return True
