# What the Inquiry and Purchase Request workflows share about the two supplier portals. Ported from
# server/workflows/suppliers.mjs.
import re

from app.deluge import truthy, unbracket

# Each portal: the Books vendor id that identifies the supplier, the name its rows carry, and where
# its copies live.
SUPPLIERS = [
    {"key": "tony", "n": "2", "name": "Tony Fan", "form": "Supplier_2", "books_id": "2680178000002735078", "name_token": "tony", "image_field": "Product_Image_Supplier2_INQ",
     "notifications": "Tony_Notifications", "page": "Tony_Fan_Inquiries", "param": "tonyinquiriesid", "email_env": "TONY_PORTAL_EMAIL", "pr_form": "Tony_Fan_Purchase_Request"},
    {"key": "fenteng", "n": "1", "name": "Fenteng Lighting", "form": "Supplier_1", "books_id": "2680178000049168001", "name_token": "fenteng", "image_field": "Product_Image_Supplier1_INQ",
     "notifications": "Fenteng_Notifications", "page": "Fenteng_Lighting_Inquiries", "param": "fentenginquiriesid", "email_env": "FENTENG_PORTAL_EMAIL", "pr_form": "Fenteng_Lighting_Purchase_Request"},
]


# Which portal a supplier name belongs to: "Tony" and "Tony Fan" are ONE supplier, "Fenteng" and
# "Fenteng Lighting" are ONE supplier (owner, 2026-11-17). A name belongs to a portal when its token
# is a whole word of the name, in any capitals: "TONY FAN" yes, "Fentengxyz" no. Returns the SUPPLIERS
# entry or None.
_WORD_SPLIT_RE = re.compile(r"[^a-z0-9]+")


def portal_of(name) -> dict | None:
    words = [w for w in _WORD_SPLIT_RE.split(str(name if name is not None else "").lower()) if w]
    return next((s for s in SUPPLIERS if s["name_token"] in words), None)


# All Suppliers records by record ID. `name` is the first name (what quote rows carry), `display_name`
# falls back to the last name.
async def supplier_index(store) -> dict:
    rows = await store.find("Suppliers")
    out = {}
    for r in rows:
        supplier_name = r.get("Supplier_Name") or {}
        name = supplier_name.get("first_name") or ""
        out[str(r["ID"])] = {
            "id": str(r["ID"]), "name": name, "display_name": name or (supplier_name.get("last_name") or ""),
            "books_id": str(r.get("Supplier_ID") or ""), "handles_all": truthy(r.get("Handles_All")),
            "categories": r.get("Supported_Categories"), "max_capacity": r.get("Max_Capacity"),
        }
    return out


# The Books vendor id of the supplier a quote row belongs to ('' when unknown).
def quote_books_id(quote: dict, suppliers: dict) -> str:
    entry = suppliers.get(unbracket(quote.get("Supplier_ID")))
    return entry["books_id"] if entry else ""
