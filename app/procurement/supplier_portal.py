# What a supplier does in the Tony Fan / Fenteng Lighting portal, ported from zoho-export/parsed/functions:
#   acknowledgePOTony / acknowledgePOFenteng   the supplier confirms a PO with its ETD and ETA
#   approveRRTony / approveRRFenteng           the supplier approves a Replacement Request with an expected ship date and an ETA
# No Zoho Books / Inventory call is made. Run with the raw store (no workflow hooks), like the Deluge functions.
#
# Acknowledge: the supplier's PO copy becomes "Confirmed" (a second try answers "already"), and so does the PO of Procurement, with
# Acknowledge_On. The ETD / ETA go onto the PO's Pending shipment. A PO that has no shipment yet, or that is a replacement (has an
# RR reference), gets its shipment, the supplier's copy of it and its Receiving record now (nothing is made twice; see po_approval.py).
# Approve RR: the supplier's RR and the main Replacement_Request with the same RR_No become "Acknowledged" with the dates.
# Ported from server/modules/procurement/supplier-portal.mjs.
from app.criteria import zoho_now
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, id_of, today_date, ymd
from app.procurement.po_approval import SUPPLIER, shipment_and_receiving_for
from app.procurement.po_spec import record_po_acknowledged

RR_FORM = {"Tony": "Tony_Fan_Replacement_Request", "Fenteng": "Fenteng_Lighting_Replacement_Request"}


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _ok(message: str) -> dict:
    return {"status": "success", "message": message}


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


async def acknowledge_po(key: str, payload: dict, store, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    s = SUPPLIER[key]
    sfx = s["sfx"]

    def f(n: str) -> str:
        return f"{n}{sfx}"

    po_no = _text(payload.get(f"poNo{sfx[1:]}") if payload.get(f"poNo{sfx[1:]}") is not None else payload.get("poNo"))
    etd, eta = _text(payload.get("etd")), _text(payload.get("eta"))
    if etd == "" or eta == "":
        return _fail("ETD and ETA are both required to acknowledge this PO.")
    copies = await store.find(s["copy"], lambda c: _text(c.get(f("PO_No"))) == po_no)
    if len(copies) == 0:
        return _fail(f"PO not found: {po_no}")
    for copy in copies:
        if _text(copy.get(f("PO_Status"))) == "Confirmed":
            return {"status": "already", "message": "Already acknowledged"}
        now = zoho_now()
        await store.update_record(s["copy"], copy["ID"], {f("Acknowledge_On"): now, f("PO_Status"): "Confirmed"}, by_form=True)
        for apo in await store.find("Purchase_Order", lambda p: _text(p.get("PO_No")) == _text(copy.get(f("PO_No")))):
            await store.update_record("Purchase_Order", apo["ID"], {"Acknowledge_On": now, "PO_Status": "Confirmed"}, by_form=True)
            await record_po_acknowledged(store, apo["ID"], ctx.get("user", ""))  # spec v1.4: the state and the po.acknowledged event
            pending = await store.find("Shipments", lambda x: id_of(x.get("PO_No")) == str(apo["ID"]) and _text(x.get("Shipment_Status")) == "Pending")
            if pending:
                await store.update_record("Shipments", pending[-1]["ID"], {"ETD": etd, "ETA": eta}, by_form=True)
            if _text(apo.get("RR_Reference_No")) != "" or len(pending) == 0:
                await shipment_and_receiving_for(store, ctx, s, _text(apo.get("PO_No")), {"ETD": etd, "ETA": eta})
    return _ok(f"Acknowledged {po_no}")


async def approve_rr(key: str, payload: dict, store) -> dict:
    form = RR_FORM[key]
    id_ = _text(payload.get("rrRecordId"))
    expected, eta = _text(payload.get("expectedShipDate")), _text(payload.get("eta"))
    matches = [] if id_ == "" else await store.find(form, lambda x: str(x["ID"]) == id_)
    r = matches[0] if matches else None
    if not r:
        return _fail("Replacement Request not found.")
    if _text(r.get("RR_Status")) != "Open":
        return _fail("Already approved.")
    if expected == "" or eta == "":
        return _fail("Expected Ship Date and ETA are both required to approve.")
    patch = {"RR_Status": "Acknowledged", "Expected_Ship_Date": expected, "ETA": eta, "Supplier_Acknowledgement1": True, "Supplier_Acknowledge_Date": ymd(today_date()), "Last_Updated": ymd(today_date())}
    await store.update_record(form, r["ID"], patch, by_form=True)
    for main in await store.find("Replacement_Request", lambda x: _text(x.get("RR_No")) == _text(r.get("RR_No"))):
        await store.update_record("Replacement_Request", main["ID"], patch, by_form=True)
    return _ok(f"Replacement Request approved — Expected Ship {expected}, ETA {eta}.")


async def _acknowledge_po_tony(payload, store, ctx):
    return await acknowledge_po("Tony", payload or {}, store, ctx)


async def _acknowledge_po_fenteng(payload, store, ctx):
    return await acknowledge_po("Fenteng", payload or {}, store, ctx)


async def _approve_rr_tony(payload, store, ctx):
    return await approve_rr("Tony", payload or {}, store)


async def _approve_rr_fenteng(payload, store, ctx):
    return await approve_rr("Fenteng", payload or {}, store)


CUSTOM_APIS["acknowledge_po_tony"] = _acknowledge_po_tony
CUSTOM_APIS["acknowledge_po_fenteng"] = _acknowledge_po_fenteng
CUSTOM_APIS["approve_rr_tony"] = _approve_rr_tony
CUSTOM_APIS["approve_rr_fenteng"] = _approve_rr_fenteng
