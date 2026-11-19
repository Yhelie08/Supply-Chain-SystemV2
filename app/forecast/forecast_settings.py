# One place for the forecast numbers: the Procurement Settings page (spec 05 Shared Engines / 08
# Control Panel). Ported from server/modules/procurement/forecast-settings.mjs -- that file has no
# real Procurement module-code dependency, only reads the generic Forecast_Settings and
# Procurement_Settings forms, so it lives in app/forecast/ here rather than waiting for a
# Procurement package that does not exist yet.
#
#   no Procurement_Settings row for a forecast key  ->  exactly what the engine did before (the old
#                                                        record, or its built-in defaults)
#   a row                                           ->  that field of the record is replaced, the
#                                                        rest keeps its value
from app.forecast.engine import settings_from, DEFAULT_SETTINGS as _ENGINE

FORECAST_FIELDS = {
    "transit_air_min_days": ("Air_Transit_Min", "airTMin"), "transit_air_max_days": ("Air_Transit_Max", "airTMax"),
    "customs_air_min_days": ("Air_Customs_to_WH_Min", "airCMin"), "customs_air_max_days": ("Air_Customs_to_WH_Max", "airCMax"),
    "transit_lcl_min_days": ("LCL_Transit_Min", "lclTMin"), "transit_lcl_max_days": ("LCL_Transit_Max", "lclTMax"),
    "customs_lcl_min_days": ("LCL_Customs_to_WH_Min", "lclCMin"), "customs_lcl_max_days": ("LCL_Customs_to_WH_Max", "lclCMax"),
    "transit_fcl_min_days": ("FCL_Transit_Min", "fclTMin"), "transit_fcl_max_days": ("FCL_Transit_Max", "fclTMax"),
    "customs_fcl_min_days": ("FCL_Customs_to_WH_Min", "fclCMin"), "customs_fcl_max_days": ("FCL_Customs_to_WH_Max", "fclCMax"),
    "local_transit_days": ("Local_Transit_Days", "locTMin"), "local_customs_days": ("Local_Customs_Days", "locCMin"),
    "fulfillment_days": ("Prep_Days_Thru_QC", "prepMin"), "delivery_days": ("Delivery_Days", "delMin"),
    "forecast_reanchor": ("Re_anchor_on_Latest_Real_Event", "reAnchor"),
    "forecast_include_supplier_lead_time": ("Include_Supplier_Lead_Time", "addSupLead"),
}


def is_forecast_key(k) -> bool:
    return k in FORECAST_FIELDS


ENGINE_DEFAULTS = _ENGINE


def _blank(v) -> bool:
    return v is None or v == ""


def _text(v) -> str:
    return "" if _blank(v) else str(v)


async def _sources(store):
    legacy = None
    try:
        rows = await store.find("Forecast_Settings")
        legacy = rows[0] if rows else None
    except Exception:
        legacy = None
    try:
        rows = await store.find("Procurement_Settings")
    except Exception:
        rows = []
    return legacy, rows


async def forecast_record(store, overrides: dict | None = None) -> dict | None:
    overrides = overrides or {}
    legacy, rows = await _sources(store)
    settings_set: dict[str, str] = {}
    for r in rows:
        key = _text(r.get("Setting_Key"))
        if is_forecast_key(key) and not _blank(r.get("Value")):
            settings_set[key] = _text(r.get("Value"))
    for k, v in overrides.items():
        if is_forecast_key(k):
            settings_set[k] = _text(v)
    if not settings_set:
        return legacy
    rec = dict(legacy) if legacy else {
        "Re_anchor_on_Latest_Real_Event": str(_ENGINE["reAnchor"]),
        "Include_Supplier_Lead_Time": str(_ENGINE["addSupLead"]),
    }
    for k, v in settings_set.items():
        rec[FORECAST_FIELDS[k][0]] = v
    return rec


async def forecast_settings(store, overrides: dict | None = None) -> dict:
    return settings_from(await forecast_record(store, overrides))


async def forecast_values(store) -> dict:
    legacy, rows = await _sources(store)
    s = settings_from(await forecast_record(store))
    out = {}
    for key, (field, engine_key) in FORECAST_FIELDS.items():
        row = next((r for r in rows if _text(r.get("Setting_Key")) == key and not _blank(r.get("Value"))), None)
        if row:
            source = "saved"
        elif legacy and not _blank(legacy.get(field)):
            source = "legacy"
        else:
            source = "default"
        out[key] = {"value": s[engine_key], "source": source}
    return out


def plan_numbers(f: dict) -> dict:
    def mid(a, b):
        return round((float(a) + float(b)) / 2)

    return {
        "transit_air_days": mid(f["airTMin"], f["airTMax"]), "transit_lcl_days": mid(f["lclTMin"], f["lclTMax"]),
        "transit_fcl_days": mid(f["fclTMin"], f["fclTMax"]), "customs_air_days": mid(f["airCMin"], f["airCMax"]),
        "customs_lcl_days": mid(f["lclCMin"], f["lclCMax"]), "customs_fcl_days": mid(f["fclCMin"], f["fclCMax"]),
        "fulfillment_days": int(f["prepMin"]), "delivery_days": int(f["delMin"]),
    }
