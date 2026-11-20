# "Release selected" and "Release all suggested" (Order Readiness screen, spec 05 / 02: the supervisor releases the morning list in one go).
#
# Custom API release_gate_records. Payload:
#   mode     "selected" (the Gate rows in `ids` / `idsCsv`) or "suggested" (every package the sorting engine marks Suggested_Release)
#   picker   optional default picker: it fills ONLY the items that have no picker; an item that already has one keeps its own
#   preview  true: say what WOULD happen (skips, boxes, how far over capacity) and write nothing; the screen asks this before it confirms
# The release of each item is the same write the single Release button makes (Assign_Picker + Release on the Gate row, through the hooked
# store), so Pick rows, the notification, the stage change, Stage_Events (package.released) and the re-score are the same hooks.
#
# Rules, from the spec (03 Fulfillment / 02 Order Readiness; owner 2026-11-20: "ayon sa document"):
#   OR-R4  "Releasing moves the PACKAGE to Pick": both modes work per PACKAGE. Choosing one item of a package releases all its items or
#          none. If any item of the package cannot be released, the whole package is left alone (it never goes out half released).
#   OR-R1  a Blocked package is not in the work list: it is skipped, with the reason (and its owner) the sorting engine gave. The marks are
#          refreshed first (one re-score), so an old mark does not refuse a package that is fine now.
#   OR-R4  "The supervisor may release beyond the line; the screen shows over capacity by N boxes": over capacity is NEVER a reason to skip;
#          the answer carries `overCapacityBy` and a `warning` text instead.
#   Also skipped: an item already released (stays untouched), a package that still needs payment approval, an item with no picker when no
#   default picker was given.
# "suggested" reads its list once, best rank first; one answer per item {id, so, package, sku, item, status, reason}; a row problem never raises.
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, truthy
from app.fulfillment.sorter import capacity_summary, effective_boxes, rescore_all
from app.fulfillment.workflows import needs_payment_approval
from app.workflows import create_hooked_store

SOF = "Sales_Order_Fulfillment"
GATE = "Sales_Order_Readiness_Gate"
READINESS = "Order Readiness"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v).strip()


def _ids(payload: dict) -> list[str]:
    raw = payload.get("ids")
    if raw in (None, ""):
        raw = payload.get("idsCsv")
    if isinstance(raw, str):
        raw = raw.split(",")
    seen, out = set(), []
    for x in raw or []:
        x = _text(x)
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _row(gate: dict, status: str, reason: str = "") -> dict:
    return {"id": gate.get("ID"), "so": _text(gate.get("sales_order_number")), "package": _text(gate.get("Package_Order")),
            "sku": _text(gate.get("SKU")), "item": _text(gate.get("Item_Name")), "status": status, "reason": reason}


def _key(gate: dict) -> tuple[str, str]:
    return _text(gate.get("sales_order_number")), _text(gate.get("Package_Order"))


def _package_of(sofs: list[dict], so: str, pkg: str) -> dict | None:
    same_so = [s for s in sofs if _text(s.get("SO_No")) == so]
    for s in same_so:
        if _text(s.get("Package")) == pkg:
            return s
    return same_so[0] if len(same_so) == 1 and pkg == "" else None


def _problem(gate: dict, sof: dict | None, picker: str) -> str:
    """Why this item stops its package from being released now, or "" when it does not."""
    if needs_payment_approval(gate):
        return "Still needs payment approval"
    if sof and sof.get("Category") == "blocked":
        why, who = _text(sof.get("Blocked_Reason")), _text(sof.get("Blocked_Owner"))
        return "Blocked" + (f": {why}" if why else "") + (f" (owner: {who})" if who else "")
    if _text(gate.get("Assign_Picker")) == "" and picker == "":
        return "No picker assigned (choose a picker)"
    return ""


async def _release_row(hooked, gate: dict, picker: str, user: str) -> None:
    data = {"Release": True}
    if _text(gate.get("Assign_Picker")) == "":
        data["Assign_Picker"] = picker
    await hooked.update_record(GATE, gate["ID"], data, by_form=True, user=user)


def _whole(n):
    """6.0 -> 6 (the capacity figures are floats because people * boxes per hour can be fractional); a real fraction stays, to 1 decimal."""
    return int(n) if float(n) == int(n) else round(float(n), 1)


def _warning(over, releasing: bool) -> str:
    # said only when THIS release adds boxes: an old over-capacity with nothing to release is not "this puts you over"
    return f"This puts you over capacity by {_whole(over)} boxes. Releasing over capacity is allowed." if releasing and over > 0 else ""


async def release_gate_records(payload: dict, store, ctx: dict) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    mode = _text(payload.get("mode"))
    picker = _text(payload.get("picker"))
    preview = truthy(payload.get("preview"))
    user = (ctx or {}).get("user") or ""
    if mode not in ("selected", "suggested"):
        return {"status": "error", "message": 'mode must be "selected" or "suggested".'}
    ids = _ids(payload) if mode == "selected" else []
    if mode == "selected" and not ids:
        return {"status": "error", "message": "Choose at least one row to release."}

    await rescore_all(store)   # fresh Blocked / Suggested marks: an old mark must not decide
    sofs = await store.find(SOF)
    gates = await store.find(GATE)
    results: list[dict] = []
    todo_by_package: list[tuple[tuple[str, str], list[dict]]] = []   # (so, package) -> the unreleased items to release, in order

    def unreleased(key):
        return [g for g in gates if _key(g) == key and not truthy(g.get("Release"))]

    if mode == "selected":
        by_id = {str(g["ID"]): g for g in gates}
        seen = set()
        for id_ in ids:
            gate = by_id.get(id_)
            if gate is None:
                results.append({"id": id_, "so": "", "package": "", "sku": "", "item": "", "status": "skipped", "reason": "Row not found"})
                continue
            key = _key(gate)
            if truthy(gate.get("Release")):
                results.append(_row(gate, "skipped", "Already released"))
            if key not in seen:
                seen.add(key)
                todo_by_package.append((key, unreleased(key)))
    else:
        suggested = [s for s in sofs if truthy(s.get("Suggested_Release")) and s.get("Fulfillment_Stage") == READINESS]
        suggested.sort(key=lambda s: (int(_text(s.get("Queue_Rank")) or 10**9), _text(s.get("SO_No"))))
        for sof in suggested:
            key = (_text(sof.get("SO_No")), _text(sof.get("Package")))
            items = unreleased(key)
            if items:
                todo_by_package.append((key, items))

    to_release: list[tuple[dict | None, list[dict]]] = []
    for key, items in todo_by_package:
        if not items:
            continue
        sof = _package_of(sofs, *key)
        problems = {g["ID"]: _problem(g, sof, picker) for g in items}
        first = next((p for p in problems.values() if p), "")
        if first:
            for g in items:
                results.append(_row(g, "skipped", problems[g["ID"]] or f"Package left alone because another item cannot be released ({first})"))
        else:
            to_release.append((sof, items))

    boxes = sum(effective_boxes(sof) for sof, _ in to_release if sof)
    cap = await capacity_summary(store)
    if preview:
        for _, items in to_release:
            results.extend(_row(g, "would_release") for g in items)
        over = max(0, cap["inProgressBoxes"] + boxes - cap["capacityBoxes"])
    else:
        hooked = create_hooked_store(store)
        for _, items in to_release:
            for g in items:
                await _release_row(hooked, g, picker, user)
                results.append(_row(g, "released"))
        over = (await capacity_summary(store))["overCapacityBy"] if to_release else cap["overCapacityBy"]

    done = sum(1 for r in results if r["status"] == "released")
    would = sum(1 for r in results if r["status"] == "would_release")
    return {
        "status": "success", "mode": mode, "preview": preview, "released": done, "wouldRelease": would,
        "skipped": sum(1 for r in results if r["status"] == "skipped"), "packages": len(to_release), "boxes": _whole(boxes),
        "capacityBoxes": _whole(cap["capacityBoxes"]), "overCapacityBy": _whole(over), "warning": _warning(over, bool(to_release)), "results": results,
    }


CUSTOM_APIS["release_gate_records"] = release_gate_records
