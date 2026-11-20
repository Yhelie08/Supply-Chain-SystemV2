# Minimal Akeneo PIM client for the Items picker's live search + pick-time field fetch.
# OAuth2 password grant. Deliberately thinner than a full sync client: no product-model/variant-axis
# resolution, no category-tree walk -- this app only reads a single simple product per pick.
#
# Env: AKENEO_BASE_URL, AKENEO_CLIENT_ID, AKENEO_CLIENT_SECRET, AKENEO_USERNAME, AKENEO_PASSWORD
# Ported from server/akeneo/client.mjs.
import base64
import json as json_module
import os
from urllib.parse import quote, urlencode

from app.books.client import _default_fetch  # the same injectable urllib-in-a-thread default


class AkeneoError(Exception):
    def __init__(self, message: str, *, status: int = 0, details=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.details = details


def create_akeneo_api(*, env: dict | None = None, fetch_impl=None) -> dict:
    env = env if env is not None else os.environ
    fetch_impl = fetch_impl or _default_fetch

    def config() -> dict:
        return {
            "base_url": str(env.get("AKENEO_BASE_URL") or "").rstrip("/"),
            "client_id": env.get("AKENEO_CLIENT_ID"),
            "client_secret": env.get("AKENEO_CLIENT_SECRET"),
            "username": env.get("AKENEO_USERNAME"),
            "password": env.get("AKENEO_PASSWORD"),
        }

    def is_configured() -> bool:
        c = config()
        return bool(c["base_url"] and c["client_id"] and c["client_secret"] and c["username"] and c["password"])

    state = {"token": None}

    async def authenticate() -> str:
        c = config()
        basic = base64.b64encode(f"{c['client_id']}:{c['client_secret']}".encode()).decode()
        res = await fetch_impl(
            f"{c['base_url']}/api/oauth/v1/token",
            method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Basic {basic}"},
            body={"grant_type": "password", "username": c["username"], "password": c["password"]},
        )
        json_body = res.get("json") or {}
        if not json_body.get("access_token"):
            raise AkeneoError(f"Akeneo token refresh failed: {json_body.get('error') or res['status']}", status=res["status"], details=json_body)
        state["token"] = json_body["access_token"]
        return state["token"]

    async def get(path: str, params: dict | None = None) -> dict:
        if not is_configured():
            raise AkeneoError("Akeneo is not configured: set AKENEO_BASE_URL, AKENEO_CLIENT_ID, AKENEO_CLIENT_SECRET, AKENEO_USERNAME, AKENEO_PASSWORD.")
        c = config()
        url = f"{c['base_url']}{path}"
        if params:
            url = f"{url}?{urlencode(params)}"
        if not state["token"]:
            await authenticate()
        res = await fetch_impl(url, headers={"Authorization": f"Bearer {state['token']}"})
        if res["status"] == 401:
            await authenticate()
            res = await fetch_impl(url, headers={"Authorization": f"Bearer {state['token']}"})
        if not res["ok"]:
            raise AkeneoError(f"Akeneo answered HTTP {res['status']} for {path}", status=res["status"])
        return res.get("json") or {}

    async def download_media(url: str) -> dict:
        if not is_configured():
            raise AkeneoError("Akeneo is not configured: set AKENEO_BASE_URL, AKENEO_CLIENT_ID, AKENEO_CLIENT_SECRET, AKENEO_USERNAME, AKENEO_PASSWORD.")
        if not state["token"]:
            await authenticate()
        res = await fetch_impl(url, headers={"Authorization": f"Bearer {state['token']}"})
        if res["status"] == 401:
            await authenticate()
            res = await fetch_impl(url, headers={"Authorization": f"Bearer {state['token']}"})
        if not res["ok"]:
            raise AkeneoError(f"Akeneo answered HTTP {res['status']} downloading media", status=res["status"])
        headers_out = res.get("headers") or {}
        content_type = headers_out.get("content-type") or headers_out.get("Content-Type") or "application/octet-stream"
        return {"buffer": res.get("body") or b"", "content_type": content_type}

    # No parent filter: this picker searches every sellable product regardless of parent -- confirmed
    # live that parent:!EMPTY (true variants) carry Costing/dimensions/voltage, while parent:EMPTY
    # carries only Product_Type and no price data. Filtering to parent:EMPTY would silently hide
    # every priced, orderable item. Capped at limit, single page, no search_after follow-up -- a
    # dropdown search fires on every pause in typing, so this stays to one Akeneo call per search,
    # never a paginated walk.
    async def search_items(text: str, *, limit: int = 20) -> list:
        q = str(text or "").strip()
        if not q:
            return []
        by_identifier = await get("/api/rest/v1/products", {
            "search": json_module.dumps({"identifier": [{"operator": "CONTAINS", "value": q}]}),
            "limit": str(limit), "pagination_type": "search_after",
        })
        items = (by_identifier.get("_embedded") or {}).get("items") or []
        if len(items) >= limit:
            return items
        # Identifier search came back thin -- also try name, merged and deduped by identifier.
        by_name = await get("/api/rest/v1/products", {
            "search": json_module.dumps({"name": [{"operator": "CONTAINS", "value": q, "locale": "en_US"}]}),
            "limit": str(limit), "pagination_type": "search_after",
        })
        seen = {p["identifier"] for p in items}
        for p in (by_name.get("_embedded") or {}).get("items") or []:
            if p["identifier"] not in seen:
                items.append(p)
                seen.add(p["identifier"])
        return items[:limit]

    async def get_item(identifier: str) -> dict:
        return await get(f"/api/rest/v1/products/{quote(identifier, safe='')}")

    return {"search_items": search_items, "get_item": get_item, "download_media": download_media, "is_configured": is_configured}
