# Procurement settings (spec 05 Shared Engines / 08 Control Panel): validation (CP-R6), history
# (CP-R5), the effect before saving (CP-R4) and "Recalculate now" (CP-R3). Only admins can write
# Procurement_Settings (server/access.mjs). This is also the page of the forecast numbers: the
# forecast engine reads them from here (app/forecast/forecast_settings.py). Ported from
# server/modules/procurement/settings-hooks.mjs.
from app.criteria import ZohoError, zoho_now
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, num_text
from app.forecast.forecast_settings import forecast_values, is_forecast_key
from app.procurement.settings_defs import DEFS, GROUPS, SETTING_DEFS, ladder_problem, problem_with, range_problem
from app.procurement.ship_track import rescore_shipments
from app.workflows import register

FORM = "Procurement_Settings"


def _text(v) -> str:
    return "" if blank(v) else str(v)


def _typed(key: str, raw):
    d = DEFS[key]
    if d["type"] == "text":
        return _text(raw)
    if d["type"] == "yes_no":
        return _text(raw).lower() == "true"
    return float(raw)


def _shown(v) -> str:
    return str(v) if isinstance(v, bool) else _text(v)


def _ok(message: str, data: dict | None = None) -> dict:
    return {"status": "success", "message": message, **(data or {})}


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


_was_value: dict = {}  # key -> the value in use before this write, for the history


# The value in use of every catalogue key, and where it comes from: saved (a row), legacy (the old
# Forecast_Settings record), default.
async def settings_in_use(store) -> dict:
    rows = await store.find(FORM)
    forecast = await forecast_values(store)
    out: dict = {}
    for d in SETTING_DEFS:
        row = next((r for r in rows if _text(r.get("Setting_Key")) == d["key"] and not blank(r.get("Value"))), None)
        if is_forecast_key(d["key"]):
            out[d["key"]] = {"value": forecast[d["key"]]["value"], "source": forecast[d["key"]]["source"], "row": None}
        else:
            out[d["key"]] = {"value": _typed(d["key"], row["Value"]) if row else d["default"], "source": "saved" if row else "default", "row": row}
    return out


def _values(in_use: dict) -> dict:
    return {k: v["value"] for k, v in in_use.items()}


# The reason a value is refused, or None: the limits, a crossed shortest / longest pair, a ladder
# that does not go up.
def refusal(key: str, raw, current: dict) -> str | None:
    bad = problem_with(key, raw)
    if bad:
        return bad
    v = {**current, key: _typed(key, raw)}
    if key.startswith("ladder_rung"):
        return ladder_problem(v)
    return range_problem(key, raw, v)


async def _check(args: dict) -> None:
    input_, previous, id_, store = args["input"], args.get("previous"), args.get("id"), args["store"]
    key = _text(input_.get("Setting_Key") if "Setting_Key" in input_ else (previous or {}).get("Setting_Key")).strip()
    if key not in DEFS:
        raise ZohoError(2001, f'"{key}" is not a Procurement setting.')
    if previous and "Setting_Key" in input_ and _text(input_.get("Setting_Key")).strip() != _text(previous.get("Setting_Key")):
        raise ZohoError(2001, "A setting cannot change its key.")
    input_["Setting_Key"] = key
    clash = [r for r in await store.find(FORM, lambda r: _text(r.get("Setting_Key")) == key) if str(r["ID"]) != str(id_ or "")]
    if clash:
        raise ZohoError(2001, f'"{key}" already has a row: change that one.')
    value = _text(input_.get("Value") if "Value" in input_ else (previous or {}).get("Value")).strip()
    current = _values(await settings_in_use(store))
    bad = refusal(key, value, current)
    if bad:
        raise ZohoError(2001, bad)
    if DEFS[key]["type"] == "text":
        input_["Value"] = value
    elif DEFS[key]["type"] == "yes_no":
        input_["Value"] = str(value.lower() == "true")
    else:
        input_["Value"] = num_text(value)
    _was_value[key] = current[key]


async def _history(args: dict) -> None:
    record, store, user = args["record"], args["store"], args.get("user", "")
    key = _text(record.get("Setting_Key"))
    old_v = _shown(_was_value.get(key))
    _was_value.pop(key, None)
    if old_v == _text(record.get("Value")):
        return
    r = await rescore_shipments(store)  # CP-R3: the change takes effect now
    await store.add_record("Procurement_Settings_History", {"Setting_Key": key, "Old_Value": old_v, "New_Value": _text(record.get("Value")), "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": _text(record.get("Change_Reason")), "Effect": f"{r['changed']} shipment(s) re-scored"})


async def _before_delete(args: dict) -> None:
    previous, store = args.get("previous") or {}, args["store"]
    key = _text(previous.get("Setting_Key"))
    _was_value[f"del:{key}"] = _shown(_values(await settings_in_use(store)).get(key))


async def _after_delete(args: dict) -> None:
    previous, store, user = args.get("previous") or {}, args["store"], args.get("user", "")
    key = _text(previous.get("Setting_Key"))
    now = _shown(_values(await settings_in_use(store)).get(key))
    # no row = back to the old Forecast_Settings value, or the default
    old_v = _was_value.get(f"del:{key}")
    if old_v is None:
        old_v = _text(previous.get("Value"))
    await store.add_record("Procurement_Settings_History", {"Setting_Key": key, "Old_Value": old_v, "New_Value": now, "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": "Back to the default"})
    _was_value.pop(f"del:{key}", None)
    await rescore_shipments(store)


register(FORM, {"beforeAdd": _check, "beforeUpdate": _check, "afterAdd": _history, "afterUpdate": _history, "beforeDelete": _before_delete, "afterDelete": _after_delete})

_COUNT = ["act_now", "tell_customer", "watch", "on_track", "blocked"]


def _tally(results: list) -> dict:
    return {c: len([r for r in results if r.get("category") == c]) for c in _COUNT}


# Custom API: what would this value do to the open shipments? Writes nothing.
async def preview_procurement_setting(payload: dict, store) -> dict:
    key = str((payload or {}).get("key") or "")
    value = (payload or {}).get("value")
    if key not in DEFS:
        return _fail(f'"{key}" is not a Procurement setting.')
    bad = refusal(key, value, _values(await settings_in_use(store)))
    if bad:
        return _fail(bad)
    if DEFS[key]["type"] == "text":
        try_out = {key: str(value)}
    elif DEFS[key]["type"] == "yes_no":
        try_out = {key: str(value).lower()}
    else:
        try_out = {key: float(value)}
    before = await rescore_shipments(store, dry_run=True)
    after = await rescore_shipments(store, dry_run=True, settings_try=try_out)
    was = {r["id"]: r["category"] for r in before["results"]}
    moved = [{"no": r["no"], "from": was.get(r["id"]), "to": r["category"]} for r in after["results"] if was.get(r["id"]) != r["category"]]
    forecast = " The forecast of the orders (Fulfillment and Delivery too) also uses this number." if is_forecast_key(key) else ""
    message = (f"{len(moved)} open shipment(s) would change category." if moved else "No open shipment would change category.") + forecast
    return _ok(message, {"before": _tally(before["results"]), "after": _tally(after["results"]), "moved": moved[:15], "moved_count": len(moved)})


# Custom API: "Recalculate now" (full re-read of the PO and Sales Order dates, then rank everything again).
async def recalculate_shipments(payload: dict, store) -> dict:
    r = await rescore_shipments(store, full=True)
    return _ok(f"Recalculated {r['scored']} shipment(s); {r['changed']} changed.", r)


# Custom API: the catalogue with the value in use, where it comes from, the default, the row that
# holds a change, and who changed it last (CP-R1).
async def get_procurement_settings(payload: dict, store) -> dict:
    use = await settings_in_use(store)
    hist = await store.find("Procurement_Settings_History")
    settings = []
    for d in SETTING_DEFS:
        matches = sorted((h for h in hist if _text(h.get("Setting_Key")) == d["key"]), key=lambda h: int(h["ID"]), reverse=True)
        last = matches[0] if matches else None
        u = use[d["key"]]
        settings.append({**d, "value": u["value"], "source": u["source"], "is_default": u["source"] == "default", "row_id": str(u["row"]["ID"]) if u.get("row") else None, "last_changed_by": (last or {}).get("Changed_By", ""), "last_changed_at": (last or {}).get("Changed_At", "")})
    return _ok("Procurement settings.", {"settings": settings, "groups": GROUPS})


async def _preview_procurement_setting_api(payload: dict, store, ctx: dict) -> dict:
    return await preview_procurement_setting(payload or {}, store)


async def _recalculate_shipments_api(payload: dict, store, ctx: dict) -> dict:
    return await recalculate_shipments(payload or {}, store)


async def _get_procurement_settings_api(payload: dict, store, ctx: dict) -> dict:
    return await get_procurement_settings(payload or {}, store)


CUSTOM_APIS["preview_procurement_setting"] = _preview_procurement_setting_api
CUSTOM_APIS["recalculate_shipments"] = _recalculate_shipments_api
CUSTOM_APIS["get_procurement_settings"] = _get_procurement_settings_api
