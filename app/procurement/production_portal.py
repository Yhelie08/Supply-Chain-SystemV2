# The supplier's Production screen of the spec v1.4 (02 Procurement / 07 Supplier Portal, 04 Ship
# and Track).
#
# The supplier works on its own copy of the shipment (Tony_Shipment / Fenteng_Shipment, never on the
# buyer's Shipments, which holds customer names). The copy carries only what the supplier may see:
# the lines, the planned production dates, its own reports.
#   supplier writes   Report_Prod_Event (production_started | production_finished) + Report_Prod_Date
#                      (the day it happened); Prod_Photo (a production photo)        [SP-R4, ST-R3]
#   server does        checks the rules while the supplier is still on the screen (before), then on
#                       the parent shipment: copies the photo, records the stage event with
#                       source = supplier (when it happened + when we were told), re-plans,
#                       re-scores, and refreshes the view fields on the copy (refresh_supplier_view
#                       in ship_track.py).
# A production finished report needs a production photo (ST-R3); this closes the gap the supplier's
# ship-date path still has. Ported from server/modules/procurement/production-portal.mjs.
import re

from app.criteria import ZohoError, zoho_now
from app.deluge import blank, id_of
from app.procurement.events import log_event, occurred_from
from app.procurement.ship_track import append_photo, apply_shipment_event, effective_stage, refresh_supplier_view
from app.workflows import register


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _refuse(message: str) -> None:
    raise ZohoError(2001, message)


_COPIES = ["Tony_Shipment", "Fenteng_Shipment"]
_EVENTS = ["production_started", "production_finished"]
_PHOTO_TYPES = re.compile(r"\.(jpe?g|png|heic|webp|pdf)$", re.IGNORECASE)  # ST-R3 (10 MB is checked by the upload endpoint)


async def _parent_of(store, copy: dict):
    id_ = id_of(copy.get("Parent_Shipment_ID"))
    if id_ == "":
        return None
    try:
        return await store.get_record_by_id("Shipments", id_, raw=True)
    except Exception:
        return None


def _make_before_update():
    async def before_update(args: dict) -> None:
        input_, previous, store = args["input"], args.get("previous"), args["store"]
        ev = _text(input_.get("Report_Prod_Event"))
        photo = _text(input_.get("Prod_Photo"))
        if photo != "" and not _PHOTO_TYPES.search(photo.split("?")[0]):
            _refuse("A production photo must be JPG, PNG, HEIC, WebP or PDF.")
        if ev == "":
            if _text(input_.get("Report_Prod_Date")) != "":
                _refuse("Say what happened (production started or finished) with the date.")
            return
        if ev not in _EVENTS:
            _refuse(f'Unknown production report "{ev}".')
        rec = {**(previous or {}), **input_}
        parent = await _parent_of(store, rec)
        if not parent:
            _refuse("This shipment is not linked to an order any more.")
        if effective_stage(parent) != "production":
            _refuse("This shipment has already left Production.")
        occurred_from(_text(input_.get("Report_Prod_Date")))  # refuses a date in the future (SP-R4)
        if ev == "production_finished" and _text(rec.get("Prod_Photo")) == "" and blank(parent.get("Production_Photos")):
            _refuse("Add at least one production photo before you report production finished.")
    return before_update


def _make_after_update(form: str):
    async def after_update(args: dict) -> None:
        record, previous, id_, store = args["record"], args.get("previous"), args.get("id"), args["store"]
        copy_id = _text(record.get("ID") or id_)
        parent = await _parent_of(store, record)
        if not parent:
            return
        photo = _text(record.get("Prod_Photo"))
        new_photo = photo != "" and photo != _text((previous or {}).get("Prod_Photo"))
        ev = _text(record.get("Report_Prod_Event"))
        date = _text(record.get("Report_Prod_Date"))
        if new_photo:
            # the photo shows on the shipment, on Receiving and on any exception later (ST-R4)
            await store.update_record("Shipments", parent["ID"], {"Production_Photos": append_photo(parent.get("Production_Photos"), photo), "Last_Supplier_Update_At": zoho_now()}, by_form=True)
            await log_event(store, record_type="shipment", record_id=parent["ID"], record_no=parent.get("Shipment_No"), event="shipment.production_photo", occurred_at=zoho_now(), source="supplier", note=photo.split("/")[-1])
        if ev != "":
            await store.update_record(form, copy_id, {"Report_Prod_Event": "", "Report_Prod_Date": ""}, by_form=True)
            try:
                await apply_shipment_event(store, parent["ID"], ev, occurred_at=date, source="supplier", gate=True)
            except Exception as e:
                print(f"[production-portal] {ev} {e}")
        await refresh_supplier_view(store, parent["ID"])
    return after_update


for _form in _COPIES:
    register(_form, {"beforeUpdate": _make_before_update(), "afterUpdate": _make_after_update(_form)})
