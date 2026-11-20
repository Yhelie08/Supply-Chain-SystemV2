# Client for Zoho Books (v3) and Zoho Inventory (v1). Signs in with its own OAuth refresh token
# (not the Creator service account).
#
#   zoho = create_zoho_api()
#   contact = await zoho["books"]["post"]("/contacts", {"contact_name": "ACME"})
#   salesorders = await zoho["inventory"]["get"]("/salesorders", query={"salesorder_number": "SO-1"})
#
# Env: ZOHO_BOOKS_CLIENT_ID, ZOHO_BOOKS_CLIENT_SECRET, ZOHO_BOOKS_REFRESH_TOKEN, ZOHO_BOOKS_ORG_ID
# (Books and Inventory share the organization id unless ZOHO_INVENTORY_ORG_ID is set), and optionally
# ZOHO_API_DOMAIN / ZOHO_ACCOUNTS_URL. fetch_impl and sleep can be injected, so tests never touch Zoho.
# Ported from server/books/client.mjs.
import asyncio
import json as json_module
import os
import time
import urllib.request
from urllib.parse import urlencode

MAX_CONCURRENT = 4  # Books allows far more per minute than a back office will ever send; this keeps bursts polite
MAX_RETRIES_429 = 3


class BooksError(Exception):
    def __init__(self, message: str, *, status: int = 0, code=None, details=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details


async def _default_fetch(url: str, *, method: str = "GET", headers: dict | None = None, body=None) -> dict:
    """The real-network path. Never exercised by this plan's own tests, which always inject a
    fake fetch_impl instead -- mirrors Node's default of globalThis.fetch, just via urllib run in
    a thread so this stays usable from async code with no new dependency."""
    def _do():
        if isinstance(body, (dict, list)):
            data = json_module.dumps(body).encode("utf-8")
        elif isinstance(body, str):
            data = body.encode("utf-8")
        else:
            data = body
        req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return {"status": resp.status, "ok": 200 <= resp.status < 300, "body": raw, "headers": dict(resp.headers)}
        except urllib.error.HTTPError as e:
            return {"status": e.code, "ok": False, "body": e.read(), "headers": dict(e.headers or {})}
    result = await asyncio.get_event_loop().run_in_executor(None, _do)
    body_bytes = result["body"]
    try:
        parsed = json_module.loads(body_bytes)
    except (json_module.JSONDecodeError, TypeError):
        parsed = None
    return {**result, "json": parsed}


async def _default_sleep(ms: int) -> None:
    await asyncio.sleep(ms / 1000)


def create_zoho_api(*, env: dict | None = None, fetch_impl=None, sleep=None, now=None) -> dict:
    env = env if env is not None else os.environ
    fetch_impl = fetch_impl or _default_fetch
    sleep = sleep or _default_sleep
    now = now or (lambda: time.time() * 1000)

    def config() -> dict:
        return {
            "client_id": env.get("ZOHO_BOOKS_CLIENT_ID"),
            "client_secret": env.get("ZOHO_BOOKS_CLIENT_SECRET"),
            "refresh_token": env.get("ZOHO_BOOKS_REFRESH_TOKEN"),
            "org": env.get("ZOHO_BOOKS_ORG_ID"),
            "inventory_org": env.get("ZOHO_INVENTORY_ORG_ID") or env.get("ZOHO_BOOKS_ORG_ID"),
            "api": env.get("ZOHO_API_DOMAIN") or "https://www.zohoapis.com",
            "accounts": env.get("ZOHO_ACCOUNTS_URL") or "https://accounts.zoho.com",
        }

    def is_configured() -> bool:
        c = config()
        return bool(c["client_id"] and c["client_secret"] and c["refresh_token"] and c["org"])

    # ----- access token: refreshed on demand, one refresh at a time -----
    state = {"token": None, "expires_at": 0.0, "refreshing": None}

    async def access_token(force: bool = False) -> str:
        if not force and state["token"] and now() < state["expires_at"] - 60_000:
            return state["token"]
        if state["refreshing"] is None:
            async def _refresh():
                try:
                    c = config()
                    res = await fetch_impl(
                        f"{c['accounts']}/oauth/v2/token",
                        method="POST",
                        headers={"Content-Type": "application/x-www-form-urlencoded"},
                        body=urlencode({"refresh_token": c["refresh_token"], "client_id": c["client_id"], "client_secret": c["client_secret"], "grant_type": "refresh_token"}),
                    )
                    json_body = res.get("json") or {}
                    if not json_body.get("access_token"):
                        raise BooksError(f"Zoho token refresh failed: {json_body.get('error') or res['status']}", status=res["status"], details=json_body)
                    state["token"] = json_body["access_token"]
                    state["expires_at"] = now() + (float(json_body.get("expires_in") or 3600)) * 1000
                    return state["token"]
                finally:
                    state["refreshing"] = None
            state["refreshing"] = asyncio.ensure_future(_refresh())
        return await state["refreshing"]

    # ----- at most MAX_CONCURRENT requests in flight -----
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def request(service: str, method: str, path: str, *, query: dict | None = None, body=None, binary: bool = False) -> dict:
        if not is_configured():
            raise BooksError("Zoho Books is not configured: set ZOHO_BOOKS_CLIENT_ID, ZOHO_BOOKS_CLIENT_SECRET, ZOHO_BOOKS_REFRESH_TOKEN and ZOHO_BOOKS_ORG_ID.", code="not_configured")
        c = config()
        base = f"{c['api']}/inventory/v1" if service == "inventory" else f"{c['api']}/books/v3"
        org = c["inventory_org"] if service == "inventory" else c["org"]
        params = {"organization_id": org, **(query or {})}
        url = f"{base}{path}?{urlencode(params)}"

        async with semaphore:
            refreshed_once = False
            tries_429 = 0
            while True:
                headers = {"Authorization": f"Zoho-oauthtoken {await access_token()}"}
                if body is not None:
                    headers["Content-Type"] = "application/json"
                res = await fetch_impl(url, method=method, headers=headers, body=body)
                if res["status"] == 401 and not refreshed_once:
                    refreshed_once = True
                    await access_token(True)
                    continue
                if res["status"] == 429 and tries_429 < MAX_RETRIES_429:
                    await sleep(1000 * 2 ** tries_429)
                    tries_429 += 1
                    continue
                if binary and res["ok"]:
                    headers_out = res.get("headers") or {}
                    content_type = headers_out.get("content-type") or headers_out.get("Content-Type") or ""
                    return {"buffer": res.get("body") or b"", "content_type": content_type}
                json_body = res.get("json")
                if not res["ok"] or (json_body and "code" in json_body and json_body["code"] != 0):
                    message = (json_body or {}).get("message") if json_body else None
                    raise BooksError(message or f"Zoho {service} answered HTTP {res['status']}", status=res["status"], code=(json_body or {}).get("code"), details=json_body if json_body is not None else res.get("body"))
                return json_body if json_body is not None else {}

    def service(name: str) -> dict:
        return {
            "get": lambda path, *, query=None: request(name, "GET", path, query=query),
            "download": lambda path, *, query=None: request(name, "GET", path, query=query, binary=True),
            "post": lambda path, body=None, *, query=None: request(name, "POST", path, query=query, body=body),
            "put": lambda path, body=None, *, query=None: request(name, "PUT", path, query=query, body=body),
            "delete": lambda path, *, query=None: request(name, "DELETE", path, query=query),
        }

    return {"books": service("books"), "inventory": service("inventory"), "is_configured": is_configured}
