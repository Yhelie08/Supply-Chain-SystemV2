# Delivery settings, the Control Panel's "Delivery capacity" group (spec 05 Shared Engines / 08):
# validation (CP-R6), history (CP-R5), the effect before saving (CP-R4) and the editable team
# roster (Delivery 02, TM-R4). Admin only (app/access.py). The catalogue itself is settings_defs.py.
#
# Storage is the existing Policy_Settings table, not a new one: every module already reads it; a
# key that is NOT in the catalogue (another module's, or a custom one) passes through untouched.
# Ported from server/modules/delivery-management/settings.mjs.
from app.criteria import ZohoError, zoho_now
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, num_text
from app.delivery.settings_defs import DEFS, GROUPS, SETTING_DEFS, TYPE_FIELD, is_delivery_key, problem_with, typed, workday_problem
from app.workflows import register

POLICY = "Policy_Settings"
HISTORY = "Delivery_Settings_History"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _shown(v) -> str:
    if blank(v):
        return ""
    return num_text(v) if isinstance(v, (int, float)) else str(v)


_was_value: dict = {}  # key -> the value in use before this write, for the history


async def settings_in_use(store) -> dict:
    rows = await store.find(POLICY, lambda r: is_delivery_key(_text(r.get("Policy_Key"))))
    out = {}
    for d in SETTING_DEFS:
        row = next((r for r in rows if _text(r.get("Policy_Key")) == d["key"] and not blank(r.get("Value"))), None)
        out[d["key"]] = {"value": typed(d, row["Value"]) if row else d["default"], "source": "saved" if row else "default", "row": row}
    return out


def _values_of(in_use: dict) -> dict:
    return {k: v["value"] for k, v in in_use.items()}


def _refusal(key: str, raw, current: dict) -> str | None:
    return problem_with(key, raw) or workday_problem(key, raw, current)


async def _check(args: dict) -> None:
    input_, previous, id_, store = args["input"], args.get("previous"), args.get("id"), args["store"]
    key = _text(input_.get("Policy_Key") if "Policy_Key" in input_ else (previous or {}).get("Policy_Key")).strip()
    if not is_delivery_key(key):
        return  # not a Delivery catalogue key: not ours
    if previous and "Policy_Key" in input_ and _text(input_.get("Policy_Key")).strip() != _text(previous.get("Policy_Key")):
        raise ZohoError(2001, "A setting cannot change its key.")
    clash = [r for r in await store.find(POLICY, lambda r: _text(r.get("Policy_Key")) == key) if str(r["ID"]) != str(id_ or "")]
    if clash:
        raise ZohoError(2001, f'"{key}" already has a row: change that one.')
    d = DEFS[key]
    value = _text(input_.get("Value") if "Value" in input_ else (previous or {}).get("Value")).strip()
    current = _values_of(await settings_in_use(store))
    bad = _refusal(key, value, current)
    if bad:
        raise ZohoError(2001, bad)
    input_["Policy_Key"] = key
    input_["Value"] = value.replace(r"\s+", " ").upper() if d["type"] == "time" else ("" if value == "" else num_text(value))
    if blank(input_.get("Description") if "Description" in input_ else (previous or {}).get("Description")):
        input_["Description"] = d["label"]
    if blank(input_.get("Type_field") if "Type_field" in input_ else (previous or {}).get("Type_field")):
        input_["Type_field"] = TYPE_FIELD[d["type"]]
    _was_value[key] = current[key]


async def _history(args: dict) -> None:
    record, store, user = args["record"], args["store"], args.get("user", "")
    key = _text(record.get("Policy_Key"))
    if not is_delivery_key(key):
        return
    old_v = _shown(_was_value.get(key))
    _was_value.pop(key, None)
    if old_v == _text(record.get("Value")):
        return
    effect = ""
    # preview == 'ranking' re-scores the queue right away in Node (CP-R3). sorter.rescoreAll is
    # Phase 3 and not yet ported, so this phase deliberately does NOT call it -- Effect stays blank
    # for a ranking key's history row until Phase 3 lands and this call is added back.
    await store.add_record(HISTORY, {"Setting_Key": key, "Old_Value": old_v, "New_Value": _shown(record.get("Value")), "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": _text(record.get("Change_Reason")), "Effect": effect})


async def _before_delete(args: dict) -> None:
    previous, store = args.get("previous") or {}, args["store"]
    key = _text(previous.get("Policy_Key"))
    if is_delivery_key(key):
        _was_value[f"del:{key}"] = _shown(_values_of(await settings_in_use(store)).get(key))


async def _after_delete(args: dict) -> None:
    previous, store, user = args.get("previous") or {}, args["store"], args.get("user", "")
    key = _text(previous.get("Policy_Key"))
    if not is_delivery_key(key):
        return
    before = _was_value.pop(f"del:{key}", None)
    if before is None:
        before = _text(previous.get("Value"))
    await store.add_record(HISTORY, {"Setting_Key": key, "Old_Value": before, "New_Value": _shown(DEFS[key]["default"]), "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": "Back to the default", "Effect": ""})


register(POLICY, {
    "beforeAdd": _check,
    "beforeUpdate": _check,
    "afterAdd": _history,
    "afterUpdate": _history,
    "beforeDelete": _before_delete,
    "afterDelete": _after_delete,
})


async def get_settings(store) -> dict:
    use = await settings_in_use(store)
    hist = await store.find(HISTORY, lambda h: is_delivery_key(_text(h.get("Setting_Key"))))
    current = _values_of(use)
    settings = []
    for d in SETTING_DEFS:
        matches = sorted((h for h in hist if _text(h.get("Setting_Key")) == d["key"]), key=lambda h: int(h["ID"]), reverse=True)
        last = matches[0] if matches else None
        u = use[d["key"]]
        problem = _refusal(d["key"], u["value"], current) if u["source"] == "saved" else None
        settings.append({**d, "value": u["value"], "source": u["source"], "is_default": u["source"] == "default", "row_id": str(u["row"]["ID"]) if u.get("row") else None, "problem": problem, "last_changed_by": (last or {}).get("Changed_By", ""), "last_changed_at": (last or {}).get("Changed_At", "")})
    return {"settings": settings, "groups": GROUPS}


async def preview_setting(store, key, value) -> dict:
    if not is_delivery_key(str(key if key is not None else "")):
        return {"status": "error", "message": f'"{key}" is not a Delivery setting.'}
    d = DEFS[key]
    current = _values_of(await settings_in_use(store))
    bad = _refusal(key, value, current)
    if bad:
        return {"status": "error", "message": bad}
    shared = f" {d['shared']}'s own ranking reads this number too." if d.get("shared") else ""

    if d["preview"] == "ranking":
        return {"status": "error", "message": "Ranking preview is not available yet (Phase 3 — Sorter/Rotation — has not been ported)."}
    if d["preview"] == "backlog":
        return {"status": "error", "message": "Backlog preview is not available yet (Phase 7 — Analytics — has not been ported)."}
    return {"status": "success", "message": f"No open job changes right now: this number is read when it is needed. {d['affects']}{shared}"}


async def _get_delivery_settings_api(payload: dict, store, ctx: dict) -> dict:
    return {"status": "success", **(await get_settings(store))}


async def _preview_delivery_setting_api(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    return await preview_setting(store, p.get("key"), p.get("value"))


CUSTOM_APIS["get_delivery_settings"] = _get_delivery_settings_api
CUSTOM_APIS["preview_delivery_setting"] = _preview_delivery_setting_api


ROSTER_FORM = "Delivery_Roster"
_ROLES = ["installer", "driver", "vehicle"]
_seeding = False  # "Make editable" writes 13 rows but logs ONE history row, not 13


def _is_false(v) -> bool:
    # Matches Node's String(v) !== 'false': only a literal false/bool False/"false" counts as
    # inactive, never Python's own str(False) == "False" (capital F).
    return str(v).lower() == "false"


def _active_rows(rows: list, role: str, except_id=None) -> list:
    return [r for r in rows if _text(r.get("Role")) == role and not _is_false(r.get("Active")) and str(r["ID"]) != str(except_id or "")]


def _row_text(r: dict) -> str:
    active = "inactive" if _is_false(r.get("Active")) else "active"
    order = "" if blank(r.get("Sort_Order")) else f", order {_text(r.get('Sort_Order'))}"
    return f"{_text(r.get('Name'))} ({active}{order})"


async def _check_roster(args: dict) -> None:
    input_, previous, id_, store = args["input"], args.get("previous"), args.get("id"), args["store"]
    role = _text(input_.get("Role") if "Role" in input_ else (previous or {}).get("Role")).strip()
    name = _text(input_.get("Name") if "Name" in input_ else (previous or {}).get("Name")).strip()
    if role not in _ROLES:
        raise ZohoError(2001, "Role must be installer, driver or vehicle.")
    if not name:
        raise ZohoError(2001, "Enter a name.")
    if len(name) > 60:
        raise ZohoError(2001, "The name is too long (60 characters at most).")
    rows = await store.find(ROSTER_FORM)
    if any(str(r["ID"]) != str(id_ or "") and _text(r.get("Role")) == role and _text(r.get("Name")).strip().lower() == name.lower() for r in rows):
        raise ZohoError(2001, f"{name} is already on the {role} roster.")
    input_["Role"] = role
    input_["Name"] = name
    will_be_active = not _is_false(input_.get("Active", (previous or {}).get("Active", "true")))
    if previous and not will_be_active and not _is_false(previous.get("Active")) and len(_active_rows(rows, _text(previous.get("Role")), id_)) == 0:
        raise ZohoError(2001, f"At least one {_text(previous.get('Role'))} must stay active.")
    if previous and _text(previous.get("Role")) != role and len(_active_rows(rows, _text(previous.get("Role")), id_)) == 0 and not _is_false(previous.get("Active")):
        raise ZohoError(2001, f"At least one {_text(previous.get('Role'))} must stay active.")


async def _log_roster(store, user: str, role: str, old_v: str, new_v: str) -> None:
    await store.add_record(HISTORY, {"Setting_Key": f"roster:{role}", "Old_Value": old_v, "New_Value": new_v, "Changed_By": user or "", "Changed_At": zoho_now(), "Reason": "", "Effect": "Used from the next nightly rotation; team rows that already exist are not changed."})


async def _roster_after_add(args: dict) -> None:
    if not _seeding:
        await _log_roster(args["store"], args.get("user", ""), _text(args["record"].get("Role")), "", _row_text(args["record"]))


async def _roster_after_update(args: dict) -> None:
    record, previous, store, user = args["record"], args.get("previous"), args["store"], args.get("user", "")
    if previous and _row_text(previous) == _row_text(record) and _text(previous.get("Role")) == _text(record.get("Role")):
        return
    await _log_roster(store, user, _text(record.get("Role")), _row_text(previous) if previous else "", _row_text(record))


async def _roster_before_delete(args: dict) -> None:
    previous, store = args.get("previous") or {}, args["store"]
    rows = await store.find(ROSTER_FORM)
    if not _is_false(previous.get("Active")) and len(_active_rows(rows, _text(previous.get("Role")), previous.get("ID"))) == 0:
        raise ZohoError(2001, f"At least one {_text(previous.get('Role'))} must stay active.")


async def _roster_after_delete(args: dict) -> None:
    previous, store, user = args.get("previous") or {}, args["store"], args.get("user", "")
    await _log_roster(store, user, _text(previous.get("Role")), _row_text(previous), "")


register(ROSTER_FORM, {
    "beforeAdd": _check_roster,
    "beforeUpdate": _check_roster,
    "afterAdd": _roster_after_add,
    "afterUpdate": _roster_after_update,
    "beforeDelete": _roster_before_delete,
    "afterDelete": _roster_after_delete,
})

_ROSTER_NOT_READY = "The roster is not available yet (Phase 3 — Sorter/Rotation — has not been ported)."


async def get_roster(store) -> dict:
    # rosterFrom (rotation.mjs, Phase 3) is not yet ported -- stub the whole read, not a partial one.
    return {"status": "error", "message": _ROSTER_NOT_READY}


async def seed_roster(store, user: str = "") -> dict:
    # ROSTER (rotation.mjs's built-in list, Phase 3) is not yet ported -- stub the whole write.
    return {"status": "error", "message": _ROSTER_NOT_READY}


async def _get_delivery_roster_api(payload: dict, store, ctx: dict) -> dict:
    return await get_roster(store)


async def _seed_delivery_roster_api(payload: dict, store, ctx: dict) -> dict:
    return await seed_roster(store, ctx.get("user", ""))


CUSTOM_APIS["get_delivery_roster"] = _get_delivery_roster_api
CUSTOM_APIS["seed_delivery_roster"] = _seed_delivery_roster_api
