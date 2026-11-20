# Custom API backing the Items picker's live Akeneo search. search_items_akeneo is a thin
# passthrough so the widget's dropdown stays debounced and server-side without round-tripping
# through getRecords; fetch_item_from_akeneo does the real work: one Akeneo product fetch, upserts
# Items (same ID1-by-master-id convention as add_item_by_id in books_apis.py), one Shopify price
# lookup by SKU, and returns Inquiry-form spec fields (Dimension/Color/Voltage/Lumens) for the
# widget to apply directly -- those have no home on the Items master, only on the inquiry.
# Ported from server/modules/procurement/akeneo-apis.mjs.
import re

from app.akeneo.client import AkeneoError
from app.custom_apis import CUSTOM_APIS
from app.shopify.client import ShopifyError


def _ok(message: str, extra: dict | None = None) -> dict:
    return {"status": "success", "message": message, **(extra or {})}


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


def _text(v) -> str:
    return "" if v is None else str(v)


# Akeneo's `description` attribute is rich-text HTML (<p>, <ul>, <br> etc) -- stripped to plain
# text for Items.Description (a plain textarea field, not an HTML renderer).
def _strip_html(v) -> str:
    s = _text(v)
    s = re.sub(r"<(p|div|li|br)[^>]*>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip("\n").strip()


def _first_value(values: dict, attr: str):
    e = (values or {}).get(attr)
    return e[0].get("data") if isinstance(e, list) and e else None


def _first_entry(values: dict, attr: str):
    e = (values or {}).get(attr)
    return e[0] if isinstance(e, list) and e else None


async def search_items_akeneo(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("akeneo"):
        return _fail("Akeneo is not available in this backend.")
    q = _text(p.get("q")).strip()
    if not q:
        return _ok("", {"items": []})
    try:
        items = await ctx["akeneo"]["search_items"](q, limit=20)
        return _ok("", {"items": [{"identifier": it["identifier"], "name": _text(_first_value(it.get("values"), "name")) or it["identifier"]} for it in items]})
    except AkeneoError as e:
        return _fail(e.message)


# Width/Length2/Height2/Diameter are Akeneo "metric" attributes: {amount, unit}, not plain numbers
# -- confirmed live (e.g. {"amount": "10.0000", "unit": "CENTIMETER"}). amount is trimmed of
# trailing zeros and unit shortened (CENTIMETER -> cm) to match this form's own placeholder style
# ("600 x 600 x 150 mm").
UNIT_SHORT = {"CENTIMETER": "cm", "MILLIMETER": "mm", "METER": "m", "INCH": "in"}


def _format_metric(m) -> str | None:
    if not m or m.get("amount") is None:
        return None
    try:
        n = float(m["amount"])
        amount = str(round(n, 2)) if n == n else str(m["amount"])
        if amount.endswith(".0"):
            amount = amount[:-2]
    except (TypeError, ValueError):
        amount = str(m["amount"])
    unit = m.get("unit")
    suffix = UNIT_SHORT.get(unit, f" {unit}" if unit else "")
    return amount + suffix


def _build_dimension(values: dict) -> str:
    parts = []
    for key, label in (("Length2", "L"), ("Width", "W"), ("Height2", "H"), ("Diameter", "Dia")):
        formatted = _format_metric(_first_value(values, key))
        if formatted:
            parts.append(f"{label} {formatted}")
    return " x ".join(parts)


async def fetch_item_from_akeneo(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("akeneo"):
        return _fail("Akeneo is not available in this backend.")
    identifier = _text(p.get("identifier")).strip()
    if not identifier:
        return _fail("No identifier provided.")

    try:
        product = await ctx["akeneo"]["get_item"](identifier)
    except AkeneoError as e:
        return _fail(f"Akeneo item {identifier} not found — {e.message}")

    v = product.get("values") or {}
    item = {
        "item_name": _text(_first_value(v, "name")) or identifier,
        "SKU": product["identifier"],
        "Description": _strip_html(_first_value(v, "description")),
        "category": "",  # Product_Type lives on the parent model, not every variant -- left for manual pick, same as Unit.
    }

    # Rate: Shopify's real listed price by SKU, not Akeneo's Costing (a bucketed cost-tier range
    # like "100-200 USD", not a precise sellable price -- see app/shopify/client.py).
    rate = None
    if ctx.get("shopify"):
        try:
            match = await ctx["shopify"]["price_for_sku"](product["identifier"])
            if match:
                try:
                    rate = float(match["price"])
                except (TypeError, ValueError):
                    rate = None
        except ShopifyError:
            pass  # best effort -- no price is not a failure
    if rate is not None:
        item["Rate"] = str(rate)

    # Upsert into Items, matched by ID1 (mirrors add_item_by_id's convention) -- Akeneo's own
    # identifier doubles as ID1 here since Items has no separate Akeneo-id slot and the identifier
    # IS the SKU, a stable natural key.
    matches = await store.find("Items", lambda r: r.get("ID1") == identifier)
    existing = matches[-1] if matches else None
    was_update = bool(existing)
    if existing:
        record_id = existing["ID"]
        await store.update_record("Items", existing["ID"], item, by_form=True)
    else:
        record_id = await store.add_record("Items", {"ID1": identifier, **item}, ctx.get("user") or "")

    # Image: best effort, only when Akeneo has one and the record has none yet -- downloaded and
    # cached locally once per item (not re-fetched on later picks), same "fetch once, cache
    # forever" shape as books_apis.py's own image sync, so re-loading this item's picker row never
    # re-calls Akeneo just for the photo.
    image_entry = _first_entry(v, "image")
    should_fetch_image = bool((image_entry or {}).get("_links", {}).get("download", {}).get("href")) and _text((existing or {}).get("Image")) == ""
    image_synced = False
    if should_fetch_image:
        try:
            result = await ctx["akeneo"]["download_media"](image_entry["_links"]["download"]["href"])
            data_name = _text(image_entry.get("data"))
            ext = (data_name.split(".")[-1] if "." in data_name else "jpg").lower()
            url = await ctx["save_upload"](f"{identifier}.{ext}", result["buffer"])
            await store.update_record("Items", record_id, {"Image": url}, by_form=True)
            image_synced = True
        except Exception:
            image_synced = False

    # color2 is a multi-select (e.g. ["red","silver","white"]) -- joined for the free-text Color
    # Body field. color_temperature/voltage come back lowercase ("3000k"/"220v"); ColorTemp is
    # upper-cased so it can match the form's fixed 2700K-5000K picklist, Voltage stays free text.
    # No Akeneo attribute corresponds to Lumens (wattage is a different, unrelated measure) --
    # left unset rather than mislabeling wattage as lumens.
    color2 = _first_value(v, "color2")
    if image_synced:
        final_image = (await store.get_record_by_id("Items", record_id)).get("Image")
    else:
        final_image = _text((existing or {}).get("Image"))
    return _ok(
        f"{'Updated existing item' if was_update else 'Added new item'}: {item['item_name']}",
        {
            "wasUpdate": was_update, "recordId": str(record_id), "ID1": identifier, "item_name": item["item_name"], "SKU": item["SKU"],
            "Description": item["Description"], "category": item["category"], "Rate": item.get("Rate", ""), "Image": final_image,
            "Dimension": _build_dimension(v), "ColorBody": ", ".join(color2) if isinstance(color2, list) else _text(color2),
            "ColorTemp": _text(_first_value(v, "color_temperature")).upper(), "Voltage": _text(_first_value(v, "voltage")),
        },
    )


CUSTOM_APIS["search_items_akeneo"] = search_items_akeneo
CUSTOM_APIS["fetch_item_from_akeneo"] = fetch_item_from_akeneo
