# Python Integrations Port (Books / Akeneo / Shopify) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the last 6 "not ported yet" Procurement custom-API placeholders (Books contact/item/customer sync, Akeneo product search/fetch, the Books estimate builder) and their three HTTP clients from the real, working Node source, with zero live network calls and zero `.env` changes.

**Architecture:** Each HTTP client (`books`, `akeneo`, `shopify`) is a small factory function returning a dict of bound async methods, with every I/O dependency (`fetch_impl`, `sleep`, `env`, `now`) injectable — mirroring Node's own `createZohoApi({...})` constructor-injection pattern exactly, which is what let Node's test suite verify this code with zero network access. Each custom-API handler is a plain `async def handler(payload, store, ctx)` registered into `app.custom_apis.CUSTOM_APIS`, the same shape every other custom API in this port already uses.

**Tech Stack:** Python 3.12, asyncio, no new runtime dependency (the real-network default path uses `urllib.request` in a thread executor; every test injects a fake `fetch_impl` instead and never takes that path).

**Spec:** `docs/superpowers/specs/2026-11-20-python-integrations-design.md`

## Global Constraints

- Parity first: reproduce Node's current behavior exactly. No HomeCartel spec v1.4 work beyond what Node already implements.
- No live credentials wired, no `.env` file touched, no real network call ever made by this plan's own code or tests.
- Every client's I/O (`fetch_impl`, `sleep`, `env`, `now`) stays constructor-injectable, matching `server/books/client.mjs`'s own `{env, fetch, sleep, now}` pattern.
- Books gets full test coverage ported from three real Node test files (`tests/core/books-client.test.js`, `tests/procurement/books-apis.test.js`, `tests/procurement/books-estimates.test.js`). Akeneo and Shopify get **no new test files** — Node itself has zero coverage for `akeneo-apis.mjs`, `akeneo/client.mjs`, `shopify/client.mjs` (confirmed by a full-repo grep of `tests/`), and the user explicitly decided to match that gap rather than invent verification Node never had.
- Every custom-API handler keeps the exact `(payload, store, ctx)` signature `app/custom_apis.py`'s `invoke_custom_api` calls every handler with.
- Out of scope, confirmed no real Node code exists for either: the PO-approval Books-booking second half, and the spec's `ZB-R1` job-queue/retry infrastructure.
- `ZohoError` in this codebase is `app/criteria.py`'s positional `ZohoError(code: int, message: str)` — **do not confuse it with `BooksError`** (a new, separate exception class this plan adds, keyword-only, matching Node's own `BooksError` which is a distinct class from Node's `ZohoError`).

---

## Task 1 — `app/books/client.py`

**Files:**
- Create: `app/books/client.py`
- Create: `app/books/__init__.py` (empty)
- Test: `tests/books/test_client.py`
- Test: `tests/books/__init__.py` (empty)

**Interfaces:**
```python
# app/books/client.py
class BooksError(Exception):
    def __init__(self, message: str, *, status: int = 0, code=None, details=None): ...
    # self.message, self.status, self.code, self.details

def create_zoho_api(*, env: dict | None = None, fetch_impl=None, sleep=None, now=None) -> dict: ...
# Returns {"books": <service>, "inventory": <service>, "is_configured": callable}
# <service> is a dict: {"get": callable, "download": callable, "post": callable, "put": callable, "delete": callable}
# get(path, *, query=None) -> dict
# download(path, *, query=None) -> {"buffer": bytes, "content_type": str}
# post(path, body=None, *, query=None) -> dict
# put(path, body=None, *, query=None) -> dict
# delete(path, *, query=None) -> dict
```

**Steps:**

- [ ] **Step 1: Write the failing tests**

Port every test from `tests/core/books-client.test.js` (already read in full). Create `tests/books/__init__.py` empty, then `tests/books/test_client.py`:

```python
import asyncio
import pytest
from app.books.client import create_zoho_api, BooksError

ENV = {"ZOHO_BOOKS_CLIENT_ID": "cid", "ZOHO_BOOKS_CLIENT_SECRET": "secret", "ZOHO_BOOKS_REFRESH_TOKEN": "refresh", "ZOHO_BOOKS_ORG_ID": "111"}


def _json(status: int, body: dict) -> dict:
    return {"status": status, "ok": 200 <= status < 300, "json": body}


def fake(handler):
    """A fake Zoho: answers token refreshes and API calls from a queue of handlers, and records every call."""
    calls: list[dict] = []
    tokens = {"n": 0}

    async def fetch_impl(url: str, *, method: str | None = None, headers: dict | None = None, body=None):
        call = {"url": str(url), "method": method, "headers": headers or {}, "body": body}
        calls.append(call)
        if "/oauth/v2/token" in call["url"]:
            tokens["n"] += 1
            return _json(200, {"access_token": f"token-{tokens['n']}", "expires_in": 3600})
        n = len([c for c in calls if "/oauth/" not in c["url"]])
        return handler(call, n)

    def token_calls() -> int:
        return len([c for c in calls if "/oauth/" in c["url"]])

    return {"fetch_impl": fetch_impl, "calls": calls, "token_calls": token_calls}


# Node: 'not configured: a clear error and no network call'
@pytest.mark.asyncio
async def test_not_configured_clear_error_no_network_call():
    f = fake(lambda call, n: _json(200, {}))
    zoho = create_zoho_api(env={}, fetch_impl=f["fetch_impl"])
    assert zoho["is_configured"]() is False
    with pytest.raises(BooksError) as exc_info:
        await zoho["books"]["get"]("/contacts")
    assert exc_info.value.code == "not_configured"
    assert "ZOHO_BOOKS_CLIENT_ID" in exc_info.value.message
    assert len(f["calls"]) == 0


# Node: 'sends the organization id, the token and a JSON body; reuses the token'
@pytest.mark.asyncio
async def test_sends_org_id_token_and_json_body_reuses_token():
    f = fake(lambda call, n: _json(200, {"code": 0, "message": "success", "contact": {"contact_id": "99"}}))
    zoho = create_zoho_api(env=ENV, fetch_impl=f["fetch_impl"])
    out = await zoho["books"]["post"]("/contacts", {"contact_name": "ACME"})
    await zoho["books"]["get"]("/items", query={"search_text": "lamp"})
    assert out["contact"]["contact_id"] == "99"
    _, post, get = f["calls"]
    assert post["url"] == "https://www.zohoapis.com/books/v3/contacts?organization_id=111"
    assert post["method"] == "POST"
    assert post["headers"]["Authorization"] == "Zoho-oauthtoken token-1"
    assert post["headers"]["Content-Type"] == "application/json"
    assert post["body"] == {"contact_name": "ACME"}
    assert get["url"] == "https://www.zohoapis.com/books/v3/items?organization_id=111&search_text=lamp"
    assert get["body"] is None
    assert f["token_calls"]() == 1, "one refresh served both calls"


# Node: "Inventory uses its own base URL, and the Books organization id unless told otherwise"
@pytest.mark.asyncio
async def test_inventory_uses_own_base_url_and_books_org_id_unless_told():
    f = fake(lambda call, n: _json(200, {"code": 0, "salesorders": []}))
    await create_zoho_api(env=ENV, fetch_impl=f["fetch_impl"])["inventory"]["get"]("/salesorders", query={"salesorder_number": "SO-1"})
    assert f["calls"][-1]["url"] == "https://www.zohoapis.com/inventory/v1/salesorders?organization_id=111&salesorder_number=SO-1"
    await create_zoho_api(env={**ENV, "ZOHO_INVENTORY_ORG_ID": "222"}, fetch_impl=f["fetch_impl"])["inventory"]["get"]("/packages")
    assert "organization_id=222" in f["calls"][-1]["url"]


# Node: 'parallel calls share one token refresh'
@pytest.mark.asyncio
async def test_parallel_calls_share_one_token_refresh():
    f = fake(lambda call, n: _json(200, {"code": 0}))
    zoho = create_zoho_api(env=ENV, fetch_impl=f["fetch_impl"])
    await asyncio.gather(*[zoho["books"]["get"]("/items") for _ in range(5)])
    assert f["token_calls"]() == 1


# Node: '401: refreshes the token once and retries; a second 401 is an error'
@pytest.mark.asyncio
async def test_401_refreshes_token_once_and_retries_second_401_is_error():
    def handler(call, n):
        return _json(401, {"code": 57, "message": "invalid token"}) if n == 1 else _json(200, {"code": 0, "ok": True})

    f = fake(handler)
    zoho = create_zoho_api(env=ENV, fetch_impl=f["fetch_impl"])
    out = await zoho["books"]["get"]("/items")
    assert out["ok"] is True
    assert f["token_calls"]() == 2
    assert f["calls"][-1]["headers"]["Authorization"] == "Zoho-oauthtoken token-2"

    always_401 = fake(lambda call, n: _json(401, {"code": 57, "message": "invalid token"}))
    with pytest.raises(BooksError) as exc_info:
        await create_zoho_api(env=ENV, fetch_impl=always_401["fetch_impl"])["books"]["get"]("/items")
    assert exc_info.value.status == 401
    assert exc_info.value.code == 57


# Node: '429: backs off 1s, 2s, 4s then gives up'
@pytest.mark.asyncio
async def test_429_backs_off_1s_2s_4s_then_gives_up():
    waits: list[int] = []

    async def sleep(ms: int) -> None:
        waits.append(ms)

    def recovers(call, n):
        return _json(429, {"message": "slow down"}) if n <= 2 else _json(200, {"code": 0, "done": True})

    r = fake(recovers)
    out = await create_zoho_api(env=ENV, fetch_impl=r["fetch_impl"], sleep=sleep)["books"]["get"]("/items")
    assert out["done"] is True
    assert waits == [1000, 2000]

    waits.clear()
    never = fake(lambda call, n: _json(429, {"message": "slow down"}))
    with pytest.raises(BooksError) as exc_info:
        await create_zoho_api(env=ENV, fetch_impl=never["fetch_impl"], sleep=sleep)["books"]["get"]("/items")
    assert exc_info.value.status == 429
    assert waits == [1000, 2000, 4000]


# Node: "a Books error code is an error even on HTTP 200, and carries Books' message"
@pytest.mark.asyncio
async def test_books_error_code_is_error_even_on_http_200():
    f = fake(lambda call, n: _json(200, {"code": 3062, "message": "Contact name already exists."}))
    with pytest.raises(BooksError) as exc_info:
        await create_zoho_api(env=ENV, fetch_impl=f["fetch_impl"])["books"]["post"]("/contacts", {})
    assert exc_info.value.code == 3062
    assert "already exists" in exc_info.value.message


# Node: 'a failed token refresh is reported, not retried forever'
@pytest.mark.asyncio
async def test_failed_token_refresh_reported_not_retried_forever():
    async def fetch_impl(url, **kwargs):
        return _json(400, {"error": "invalid_code"})

    with pytest.raises(BooksError, match="token refresh failed: invalid_code"):
        await create_zoho_api(env=ENV, fetch_impl=fetch_impl)["books"]["get"]("/items")


# Node: 'at most 4 requests are in flight at once'
@pytest.mark.asyncio
async def test_at_most_4_requests_in_flight_at_once():
    state = {"in_flight": 0, "peak": 0}

    async def fetch_impl(url, **kwargs):
        if "/oauth/" in str(url):
            return _json(200, {"access_token": "t", "expires_in": 3600})
        state["in_flight"] += 1
        state["peak"] = max(state["peak"], state["in_flight"])
        await asyncio.sleep(0.005)
        state["in_flight"] -= 1
        return _json(200, {"code": 0})

    zoho = create_zoho_api(env=ENV, fetch_impl=fetch_impl)
    await asyncio.gather(*[zoho["books"]["get"]("/items") for _ in range(12)])
    assert state["peak"] == 4
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/books/test_client.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.books'`

- [ ] **Step 3: Write the implementation**

Port directly from `server/books/client.mjs` (already read in full this session). Create `app/books/__init__.py` as an empty file, then `app/books/client.py`:

```python
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
        data = body.encode("utf-8") if isinstance(body, str) else body
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
                res = await fetch_impl(url, method=method, headers=headers, body=json_module.dumps(body) if body is not None else None)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/books/test_client.py -q`
Expected: PASS (9/9)

- [ ] **Step 5: Commit**

```bash
git add app/books/__init__.py app/books/client.py tests/books/__init__.py tests/books/test_client.py
git commit -m "feat: app/books/client.py (Zoho Books/Inventory OAuth client)"
```

---

## Task 2 — `app/akeneo/client.py`

**Files:**
- Create: `app/akeneo/client.py`
- Create: `app/akeneo/__init__.py` (empty)

**Interfaces:**
```python
# app/akeneo/client.py
class AkeneoError(Exception):
    def __init__(self, message: str, *, status: int = 0, details=None): ...
    # self.message, self.status, self.details

def create_akeneo_api(*, env: dict | None = None, fetch_impl=None) -> dict: ...
# Returns {"search_items": callable, "get_item": callable, "download_media": callable, "is_configured": callable}
# search_items(text, *, limit=20) -> list[dict]      (async)
# get_item(identifier) -> dict                        (async)
# download_media(url) -> {"buffer": bytes, "content_type": str}   (async)
```

**No test file for this task** — per the Global Constraints, Akeneo has zero Node test coverage and this port matches that exactly.

**Steps:**

- [ ] **Step 1: Write the implementation**

Port directly from `server/akeneo/client.mjs` (already read in full this session):

```python
# Minimal Akeneo PIM client for the Items picker's live search + pick-time field fetch.
# OAuth2 password grant. Deliberately thinner than a full sync client: no product-model/variant-axis
# resolution, no category-tree walk -- this app only reads a single simple product per pick.
#
# Env: AKENEO_BASE_URL, AKENEO_CLIENT_ID, AKENEO_CLIENT_SECRET, AKENEO_USERNAME, AKENEO_PASSWORD
# Ported from server/akeneo/client.mjs.
import base64
import json as json_module
import os
from urllib.parse import urlencode

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
            body=json_module.dumps({"grant_type": "password", "username": c["username"], "password": c["password"]}),
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
        from urllib.parse import quote
        return await get(f"/api/rest/v1/products/{quote(identifier, safe='')}")

    return {"search_items": search_items, "get_item": get_item, "download_media": download_media, "is_configured": is_configured}
```

Note: `Task 1`'s `_default_fetch` in `app/books/client.py` must be importable (not name-mangled as module-private) for this reuse — confirm the name has a single leading underscore (module-private by convention, not enforced) so `from app.books.client import _default_fetch` works; it already does per Task 1's own code above.

- [ ] **Step 2: Manual smoke check (no test file, per scope)**

Run a quick Python REPL check that the module imports cleanly and `is_configured()` returns `False` with no env vars set:

```bash
python -c "from app.akeneo.client import create_akeneo_api; a = create_akeneo_api(env={}); print(a['is_configured']())"
```

Expected output: `False`

- [ ] **Step 3: Commit**

```bash
git add app/akeneo/__init__.py app/akeneo/client.py
git commit -m "feat: app/akeneo/client.py (Akeneo PIM OAuth2 client, no tests -- matches Node's own untested state)"
```

---

## Task 3 — `app/shopify/client.py`

**Files:**
- Create: `app/shopify/client.py`
- Create: `app/shopify/__init__.py` (empty)

**Interfaces:**
```python
# app/shopify/client.py
class ShopifyError(Exception):
    def __init__(self, message: str, *, status: int = 0, details=None): ...

def create_shopify_api(*, env: dict | None = None, fetch_impl=None) -> dict: ...
# Returns {"price_for_sku": callable, "is_configured": callable}
# price_for_sku(sku) -> {"price": str, "product_title": str} | None    (async)
```

**No test file for this task** — same reasoning as Task 2.

**Steps:**

- [ ] **Step 1: Write the implementation**

Port directly from `server/shopify/client.mjs` (already read in full this session):

```python
# Minimal Shopify Admin GraphQL client -- only what the Items picker needs: look up a variant's
# real listed price by SKU on pick. Not a sync client; read-only, one query per call.
#
# Env: SHOPIFY_SHOP_URL, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION
# Ported from server/shopify/client.mjs.
import json as json_module
import os

from app.books.client import _default_fetch


class ShopifyError(Exception):
    def __init__(self, message: str, *, status: int = 0, details=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.details = details


def create_shopify_api(*, env: dict | None = None, fetch_impl=None) -> dict:
    env = env if env is not None else os.environ
    fetch_impl = fetch_impl or _default_fetch

    def config() -> dict:
        return {"shop_url": env.get("SHOPIFY_SHOP_URL"), "token": env.get("SHOPIFY_ACCESS_TOKEN"), "api_version": env.get("SHOPIFY_API_VERSION") or "2024-04"}

    def is_configured() -> bool:
        c = config()
        return bool(c["shop_url"] and c["token"])

    async def graphql(query: str, variables: dict) -> dict:
        if not is_configured():
            raise ShopifyError("Shopify is not configured: set SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN.")
        c = config()
        res = await fetch_impl(
            f"https://{c['shop_url']}/admin/api/{c['api_version']}/graphql.json",
            method="POST",
            headers={"X-Shopify-Access-Token": c["token"], "Content-Type": "application/json"},
            body=json_module.dumps({"query": query, "variables": variables}),
        )
        if not res["ok"]:
            raise ShopifyError(f"Shopify GraphQL request failed (HTTP {res['status']})")
        json_body = res.get("json") or {}
        if json_body.get("errors"):
            raise ShopifyError(f"Shopify GraphQL errors: {json_module.dumps(json_body['errors'])}", details=json_body)
        return json_body.get("data")

    # Exact SKU match. Returns None when nothing is listed under that SKU (not an error --
    # plenty of Akeneo items have no Shopify listing yet).
    async def price_for_sku(sku) -> dict | None:
        data = await graphql(
            "query ($q: String!) { productVariants(first: 1, query: $q) { nodes { price product { title } } } }",
            {"q": f"sku:'{str(sku).replace(chr(39), chr(92) + chr(39))}'"},
        )
        nodes = ((data or {}).get("productVariants") or {}).get("nodes") or []
        node = nodes[0] if nodes else None
        if not node:
            return None
        return {"price": node["price"], "product_title": (node.get("product") or {}).get("title") or ""}

    return {"price_for_sku": price_for_sku, "is_configured": is_configured}
```

- [ ] **Step 2: Manual smoke check**

```bash
python -c "from app.shopify.client import create_shopify_api; s = create_shopify_api(env={}); print(s['is_configured']())"
```

Expected output: `False`

- [ ] **Step 3: Commit**

```bash
git add app/shopify/__init__.py app/shopify/client.py
git commit -m "feat: app/shopify/client.py (Shopify SKU price lookup, no tests -- matches Node's own untested state)"
```

---

## Task 4 — `app/procurement/books_apis.py`

**Files:**
- Create: `app/procurement/books_apis.py`
- Test: `tests/procurement/test_books_apis.py`

**Interfaces:**
- Consumes: `app.books.client.BooksError` (Task 1), `app.criteria.ZohoError` (positional `ZohoError(code, message)`, already exists), `app.custom_apis.CUSTOM_APIS` (already exists)
- Produces: `create_books_contact(payload, store, ctx)`, `add_item_by_id(payload, store, ctx)`, `fetch_customer_from_books(payload, store, ctx)` — all registered into `CUSTOM_APIS` at import time. `ctx` is a dict carrying `books` (a `create_zoho_api()` result or `None`), `user` (str), `save_upload` (an async callable `(name: str, buf: bytes) -> str`, or `None`).

**Steps:**

- [ ] **Step 1: Write the failing tests**

Port every test from `tests/procurement/books-apis.test.js` (already read in full). Create `tests/procurement/test_books_apis.py`:

```python
import pytest
from app.books.client import BooksError


def _fake_books(routes: dict):
    """A stand-in for the Books client: routes maps 'METHOD /path' to a response (or an Exception
    to raise, or a callable taking the call's opts and returning a response)."""
    calls: list[dict] = []

    def run(method: str):
        async def call_fn(path, *args, **kwargs):
            opts = dict(kwargs)
            if args:
                opts["body"] = args[0]
            calls.append({"method": method, "path": path, **opts})
            key = f"{method} {path}"
            if key not in routes:
                raise BooksError(f"no route {key}", status=404, code=1002)
            r = routes[key]
            if isinstance(r, Exception):
                raise r
            return r(opts) if callable(r) else r
        return call_fn

    books_service = {"get": run("GET"), "post": run("POST"), "download": run("DOWNLOAD")}
    return {"calls": calls, "books": {"books": books_service}}


CONTACT = {"customerId": "", "custName": "ACME Corp", "custType": "Enduser", "custEmail": "a@acme.test", "custPhone": "1", "custMobile": "2", "companyName": "ACME", "custSubType": "business",
           "salutation": "Mr.", "firstName": "", "lastName": "", "billAddress": "1 Main St", "billCity": "Manila", "billCountry": "PH", "shipAddress": "2 Side St"}


@pytest.fixture
async def store(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


async def _call(name, payload, ctx, store):
    from app.custom_apis import invoke_custom_api
    import app.procurement.books_apis  # noqa: F401 -- registers the handlers
    return await invoke_custom_api(name, payload, store, ctx)


# Node: 'create_books_contact: sends the contact to Books and links its id into Customer.ID1'
@pytest.mark.asyncio
async def test_create_books_contact_sends_contact_and_links_id1(store):
    customer_id = await store.add_record("Customer", {"customer_name": "ACME Corp"})
    zoho = _fake_books({"POST /contacts": {"code": 0, "contact": {"contact_id": "777"}}})
    out = await _call("create_books_contact", {**CONTACT, "customerId": customer_id}, zoho, store)
    assert out["status"] == "success"
    assert out["contactId"] == "777"
    assert out["message"] == "Books contact created and linked (ID1=777)"
    assert (await store.get_record_by_id("Customer", customer_id, raw=True))["ID1"] == "777"

    sent = zoho["calls"][0]["body"]
    assert sent["contact_name"] == "ACME Corp"
    assert sent["customer_sub_type"] == "business"
    assert sent["contact_type"] == "customer"
    assert sent["custom_fields"] == [{"label": "Customer Type", "value": "End User"}], 'Enduser becomes Books\' "End User"'
    assert sent["contact_persons"][0] == {"salutation": "Mr.", "first_name": "ACME Corp", "last_name": "", "email": "a@acme.test", "phone": "1", "mobile": "2", "is_primary_contact": True}
    assert sent["billing_address"]["address"] == "1 Main St"


# Node: 'create_books_contact: first/last name win when given; Designer maps to Design Partner; individual sub type'
@pytest.mark.asyncio
async def test_create_books_contact_first_last_name_designer_individual(store):
    customer_id = await store.add_record("Customer", {"customer_name": "Jo"})
    zoho = _fake_books({"POST /contacts": {"code": 0, "contact": {"contact_id": "1"}}})
    await _call("create_books_contact", {**CONTACT, "customerId": customer_id, "custType": "Designer", "custSubType": "individual", "firstName": "Jo", "lastName": "Cruz"}, zoho, store)
    sent = zoho["calls"][0]["body"]
    assert sent["customer_sub_type"] == "individual"
    assert sent["custom_fields"][0]["value"] == "Design Partner"
    assert [sent["contact_persons"][0]["first_name"], sent["contact_persons"][0]["last_name"]] == ["Jo", "Cruz"]


# Node: 'create_books_contact: no customer type means no custom field; a missing customerId or Books failure is an error answer'
@pytest.mark.asyncio
async def test_create_books_contact_no_type_no_field_missing_id_or_failure_is_error(store):
    customer_id = await store.add_record("Customer", {"customer_name": "X"})
    zoho = _fake_books({"POST /contacts": {"code": 0, "contact": {"contact_id": "1"}}})
    await _call("create_books_contact", {**CONTACT, "customerId": customer_id, "custType": ""}, zoho, store)
    assert "custom_fields" not in zoho["calls"][0]["body"]

    assert await _call("create_books_contact", {**CONTACT, "customerId": ""}, zoho, store) == {"status": "error", "message": "No customerId provided — cannot backfill ID1."}
    failing = _fake_books({"POST /contacts": BooksError("Contact name already exists.", status=400, code=3062)})
    out = await _call("create_books_contact", {**CONTACT, "customerId": customer_id}, failing, store)
    assert out == {"status": "error", "message": "Books contact creation failed — Contact name already exists."}
    assert (await store.get_record_by_id("Customer", customer_id, raw=True))["ID1"] == "1", "a failed call leaves ID1 as it was"


# Node: 'without a Books client the Books APIs say so instead of failing'
@pytest.mark.asyncio
async def test_without_books_client_apis_say_so(store):
    for name in ["create_books_contact", "add_item_by_id"]:
        out = await _call(name, {"customerId": "1", "itemBooksId": "1"}, {}, store)
        assert out["status"] == "error"
        assert "Books is not available" in out["message"]


ITEM = {
    "name": "Lamp", "sku": "LAMP-1", "cf_oldsku": "OLD-1", "cf_description": "A lamp", "unit": "pcs", "rate": 250, "category_name": "Table Lamps", "image_name": "lamp.png",
    "warehouses": [
        {"warehouse_id": "2680178000042173149", "warehouse_name": "HC WH3 BAESA", "warehouse_actual_available_stock": 5, "is_storage_location_enabled": True},
        {"warehouse_id": "2680178000055220196", "warehouse_name": "HC WH1 BANAWE", "warehouse_actual_available_stock": 0, "is_storage_location_enabled": True},
        {"warehouse_id": "2680178000047672049", "warehouse_name": "INVENTORY", "warehouse_actual_available_stock": 2, "is_storage_location_enabled": False},
    ],
}


def _item_routes(**extra):
    routes = {
        "GET /items/42": {"code": 0, "item": ITEM},
        "GET /settings/warehouses/2680178000042173149/storagelocations": {"storage_locations": [{"name": "A1", "balance_quantity": 3}, {"name": "A2", "balance_quantity": 0}, {"name": "B7", "balance_quantity": 2}]},
        "GET /settings/warehouses/2680178000055220196/storagelocations": {"storage_locations": [{"name": "Z9", "balance_quantity": 0}]},
        "DOWNLOAD /items/42/image": {"buffer": b"png-bytes", "content_type": "image/png"},
    }
    routes.update(extra)
    return routes


# Node: 'add_item_by_id: adds a new Items record with warehouses, bin locations and the image'
@pytest.mark.asyncio
async def test_add_item_by_id_adds_new_record_with_warehouses_bins_image(store):
    saved = []

    async def save_upload(name, buf):
        saved.append([name, buf.decode()])
        return f"/uploads/{name}"

    zoho = _fake_books(_item_routes())
    out = await _call("add_item_by_id", {"itemBooksId": " 42 "}, {**zoho, "user": "staff@example.test", "save_upload": save_upload}, store)
    assert out["status"] == "success"
    assert out["wasUpdate"] is False
    assert out["message"] == "Added new item: Lamp"
    assert out["imageSynced"] is True
    assert out["Warehouse"] == "HC WH3 BAESA, INVENTORY", "warehouses with physical stock"
    assert out["Bin_location"] == "HC WH3 BAESA: A1, B7 | HC WH1 BANAWE: Map Bins", 'bins with stock; "Map Bins" when none; INVENTORY has no storage locations'
    row = await store.get_record_by_id("Items", out["recordId"], raw=True)
    assert [row["ID1"], row["item_name"], row["SKU"], row["Item_ref"], row["Description"], row["Unit"], row["Rate"], row["category"], row["Image"], row["Added_User"]] == \
        ["42", "Lamp", "LAMP-1", "OLD-1", "A lamp", "pcs", "250", "Table Lamps", "/uploads/42.png", "staff@example.test"]
    assert saved == [["42.png", "png-bytes"]]


# Node: 'add_item_by_id: a second call updates the same record and does not fetch the image again'
@pytest.mark.asyncio
async def test_add_item_by_id_second_call_updates_no_refetch_image(store):
    async def save_upload(name, buf=None):
        return f"/uploads/{name}"

    first = await _call("add_item_by_id", {"itemBooksId": "42"}, {**_fake_books(_item_routes()), "save_upload": save_upload}, store)
    zoho = _fake_books(_item_routes(**{"GET /items/42": {"code": 0, "item": {**ITEM, "name": "Lamp v2", "rate": 300}}}))
    again = await _call("add_item_by_id", {"itemBooksId": "42"}, {**zoho, "save_upload": save_upload}, store)
    assert again["wasUpdate"] is True
    assert again["recordId"] == first["recordId"]
    assert again["message"] == "Updated existing item: Lamp v2"
    assert again["imageSynced"] is False
    assert not any(c["method"] == "DOWNLOAD" for c in zoho["calls"]), "the item already has a photo"
    assert len(await store.find("Items")) == 1
    row = await store.get_record_by_id("Items", first["recordId"], raw=True)
    assert [row["item_name"], row["Rate"], row["Image"]] == ["Lamp v2", "300", "/uploads/42.png"]


# Node: 'add_item_by_id: an image failure keeps the item and says so; an unknown item is an error'
@pytest.mark.asyncio
async def test_add_item_by_id_image_failure_keeps_item_unknown_item_is_error(store):
    zoho = _fake_books(_item_routes(**{"DOWNLOAD /items/42/image": BooksError("boom")}))
    out = await _call("add_item_by_id", {"itemBooksId": "42"}, {**zoho, "save_upload": (lambda n, b=None: f"{n}")}, store)
    assert out["status"] == "success"
    assert out["message"] == "Added new item: Lamp (image sync failed — item saved without photo)"
    assert len(await store.find("Items")) == 1

    assert await _call("add_item_by_id", {"itemBooksId": "999"}, _fake_books(_item_routes()), store) == {"status": "error", "message": "Item not found in Books for ID 999 — check the ID and try again."}
    assert await _call("add_item_by_id", {"itemBooksId": "  "}, _fake_books({}), store) == {"status": "error", "message": "Item ID is required."}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/procurement/test_books_apis.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.procurement.books_apis'`

- [ ] **Step 3: Write the implementation**

Port directly from `server/modules/procurement/books-apis.mjs` (already read in full this session). Note the real `data.find('Items', (r) => r.ID1 === itemId)).at(-1)` (Node) means "the last matching row wins if there are duplicates" — `app/store.py`'s `find(form, test)` takes a Python predicate, so this becomes `(await store.find("Items", lambda r: r.get("ID1") == item_id))[-1:]`.

```python
# Custom APIs that talk to Zoho Books, ported from zoho-export/parsed/functions/:
#   create_books_contact  <- createBooksContact.dg
#   add_item_by_id        <- addItemByIdBooks.dg
#   fetch_customer_from_books
# Each handler is (payload, store, ctx): ctx carries books (a create_zoho_api() result or None),
# user (str), save_upload (an async callable (name, buf) -> str, or None). They answer like the
# Deluge functions did: {status: 'success' | 'error', message, ...}.
# Ported from server/modules/procurement/books-apis.mjs.
import re

from app.criteria import ZohoError
from app.books.client import BooksError
from app.custom_apis import CUSTOM_APIS


def _ok(message: str, extra: dict | None = None) -> dict:
    return {"status": "success", "message": message, **(extra or {})}


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


def _text(v) -> str:
    return "" if v is None else str(v)


# ---------- create_books_contact ----------
async def create_books_contact(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("books"):
        return _fail("Zoho Books is not available in this backend.")
    if not p.get("customerId"):
        return _fail("No customerId provided — cannot backfill ID1.")

    # If the officer filled in First/Last Name use those; otherwise the whole Customer Name is the first name.
    if p.get("firstName"):
        person = {"first": p["firstName"], "last": p.get("lastName")}
    else:
        person = {"first": p.get("custName"), "last": ""}
    body = {
        "contact_name": p.get("custName"),
        "company_name": p.get("companyName"),
        "customer_sub_type": "individual" if p.get("custSubType") == "individual" else "business",
        "contact_type": "customer",
        "email": p.get("custEmail"), "phone": p.get("custPhone"), "mobile": p.get("custMobile"),
        "contact_persons": [{"salutation": p.get("salutation"), "first_name": person["first"], "last_name": person["last"], "email": p.get("custEmail"), "phone": p.get("custPhone"), "mobile": p.get("custMobile"), "is_primary_contact": True}],
        "billing_address": {"attention": p.get("billAttention"), "address": p.get("billAddress"), "city": p.get("billCity"), "state": p.get("billState"), "zip": p.get("billZip"), "country": p.get("billCountry"), "phone": p.get("billPhone"), "fax": p.get("billFax")},
        "shipping_address": {"attention": p.get("shipAttention"), "address": p.get("shipAddress"), "city": p.get("shipCity"), "state": p.get("shipState"), "zip": p.get("shipZip"), "country": p.get("shipCountry"), "phone": p.get("shipPhone"), "fax": p.get("shipFax")},
    }
    # Our Customer_Type values onto Books' own "Customer Type" dropdown.
    customer_type = {"Enduser": "End User", "Designer": "Design Partner"}.get(p.get("custType"), p.get("custType"))
    if customer_type:
        body["custom_fields"] = [{"label": "Customer Type", "value": customer_type}]

    try:
        created = await ctx["books"]["books"]["post"]("/contacts", body)
    except BooksError as e:
        return _fail(e.message if e.code == "not_configured" else f"Books contact creation failed — {e.message}")

    contact_id = _text((created or {}).get("contact", {}).get("contact_id"))
    if not contact_id:
        return _fail(f"Books contact creation failed — {(created or {}).get('message') or created}")

    # Link: the Books contact id goes into the customer's ID1.
    try:
        await store.update_record("Customer", p["customerId"], {"ID1": contact_id}, by_form=True)
    except ZohoError as e:
        if e.code != 9280:
            raise
    return _ok(f"Books contact created and linked (ID1={contact_id})", {"contactId": contact_id})


# ---------- add_item_by_id ----------
# The three real storage warehouses whose bin locations are listed.
BIN_WAREHOUSES = [
    {"id": "2680178000042173149", "label": "HC WH3 BAESA"},
    {"id": "2680178000055220196", "label": "HC WH1 BANAWE"},
    {"id": "2680178000047672049", "label": "INVENTORY"},
]


async def add_item_by_id(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("books"):
        return _fail("Zoho Books is not available in this backend.")
    item_id = _text(p.get("itemBooksId")).strip()
    if not item_id:
        return _fail("Item ID is required.")

    detail = None
    try:
        detail = (await ctx["books"]["books"]["get"](f"/items/{item_id}")).get("item")
    except BooksError as e:
        if e.code == "not_configured":
            return _fail(e.message)
        detail = None
    if not detail:
        return _fail(f"Item not found in Books for ID {item_id} — check the ID and try again.")

    item = {
        "item_name": detail.get("name") or "", "SKU": detail.get("sku") or "", "Item_ref": detail.get("cf_oldsku") or "", "Description": detail.get("cf_description") or "",
        "Unit": detail.get("unit") or "", "Rate": detail.get("rate") if detail.get("rate") is not None else 0, "category": detail.get("category_name") or "",
    }

    # Warehouses holding physical stock (actual available stock, not accounting stock on hand).
    warehouses = detail.get("warehouses") or []
    item["Warehouse"] = ", ".join(_text(w.get("warehouse_name")) for w in warehouses if w.get("warehouse_actual_available_stock") is not None and w.get("warehouse_actual_available_stock") != 0)

    # Bin locations with stock, per storage warehouse; "Map Bins" when the item has no bin yet.
    segments = []
    for bw in BIN_WAREHOUSES:
        wh = next((w for w in warehouses if _text(w.get("warehouse_id")) == bw["id"]), None)
        if not wh or wh.get("is_storage_location_enabled") is not True:
            continue
        try:
            locations = (await ctx["books"]["books"]["get"](f"/settings/warehouses/{bw['id']}/storagelocations", query={"item_id": item_id})).get("storage_locations") or []
        except BooksError:
            locations = []  # treated as no bins
        bins = ", ".join(_text(l.get("name")) for l in locations if l.get("balance_quantity") is not None and l.get("balance_quantity") > 0)
        segments.append(f"{bw['label']}: {bins or 'Map Bins'}")
    item["Bin_location"] = " | ".join(segments)

    # Upsert into Items, matched by ID1 (the Books item id).
    matches = await store.find("Items", lambda r: r.get("ID1") == item_id)
    existing = matches[-1] if matches else None
    was_update = bool(existing)
    if existing:
        record_id = existing["ID"]
        await store.update_record("Items", existing["ID"], item, by_form=True)
    else:
        record_id = await store.add_record("Items", {"ID1": item_id, **item}, ctx.get("user") or "")

    # Image: best effort, only when Books has one and the record has none; a failure never undoes the item.
    should_fetch_image = bool(_text(detail.get("image_name"))) and _text((existing or {}).get("Image")) == ""
    image_synced = False
    if should_fetch_image and ctx.get("save_upload"):
        try:
            file = await ctx["books"]["books"]["download"](f"/items/{item_id}/image")
            content_type = file.get("content_type") or ""
            ext = "png" if "png" in content_type else "gif" if "gif" in content_type else "webp" if "webp" in content_type else "jpg"
            url = await ctx["save_upload"](f"{item_id}.{ext}", file["buffer"])
            await store.update_record("Items", record_id, {"Image": url}, by_form=True)
            image_synced = True
        except Exception:
            image_synced = False
    failed_image = should_fetch_image and not image_synced
    return _ok(
        f"{'Updated existing item' if was_update else 'Added new item'}: {item['item_name']}{' (image sync failed — item saved without photo)' if failed_image else ''}",
        {"imageSynced": image_synced, "wasUpdate": was_update, "recordId": str(record_id), "ID1": item_id, "item_name": item["item_name"], "SKU": item["SKU"], "Rate": item["Rate"],
         "Unit": item["Unit"], "Description": item["Description"], "category": item["category"], "Warehouse": item["Warehouse"], "Bin_location": item["Bin_location"]},
    )


# ---------- fetch_customer_from_books ----------
# Called when a customer is picked in the New Inquiry / Detail Edit form (not bulk -- avoids
# burning Books API quota on every row of a 10k+ customer list). Looks up the live Books contact
# by the local Customer record's ID1 (the Books contact_id, same linking convention
# create_books_contact writes), refreshes address/email/phone/Design fields from Books, and picks
# up Customer Type from the custom field labeled "Customer Type" if Books has it set (same field
# create_books_contact writes to).
def _build_addr(a: dict | None) -> dict:
    a = a or {}
    return {"address_line_1": _text(a.get("address")), "address_line_2": _text(a.get("street2")), "district_city": _text(a.get("city")), "state_province": _text(a.get("state")), "postal_Code": _text(a.get("zip")), "country": _text(a.get("country"))}


async def fetch_customer_from_books(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    if not ctx.get("books"):
        return _fail("Zoho Books is not available in this backend.")
    if not p.get("customerId"):
        return _fail("No customerId provided.")
    try:
        local = await store.get_record_by_id("Customer", p["customerId"])
    except Exception:
        local = None
    contact_id = _text((local or {}).get("ID1")).strip()
    if not contact_id:
        return _ok("No linked Books contact for this customer (ID1 is blank).", {"linked": False, "customerId": _text(p.get("customerId"))})

    try:
        contact = (await ctx["books"]["books"]["get"](f"/contacts/{contact_id}")).get("contact")
    except BooksError as e:
        if e.code == "not_configured":
            return _fail(e.message)
        return _ok(f"Books contact {contact_id} not found — {e.message}", {"linked": False, "customerId": _text(p.get("customerId"))})
    if not contact:
        return _ok(f"Books contact {contact_id} not found.", {"linked": False, "customerId": _text(p.get("customerId"))})

    type_field = next((f for f in (contact.get("custom_fields") or []) if _text(f.get("label")).strip().lower() == "customer type"), None)
    books_type = ({"End User": "Enduser", "Design Partner": "Designer"}.get(_text(type_field.get("value")), _text(type_field.get("value"))) if type_field else "")

    update = {
        "Email": _text(contact.get("email")), "Phone_Number": _text(contact.get("phone")), "Mobile": _text(contact.get("mobile")),
        "Billing_Address": _build_addr(contact.get("billing_address")), "Shipping_Address": _build_addr(contact.get("shipping_address")),
    }
    if books_type:
        update["Customer_Type"] = books_type
    try:
        await store.update_record("Customer", p["customerId"], update, by_form=True)
    except Exception:
        pass  # best effort -- the pick still returns fresh values below

    return _ok(f"Refreshed from Books contact {contact_id}.", {
        "linked": True, "customerId": _text(p.get("customerId")), "Email": update["Email"], "Phone_Number": update["Phone_Number"], "Mobile": update["Mobile"],
        "Customer_Type": books_type, "Billing_Address": update["Billing_Address"], "Shipping_Address": update["Shipping_Address"],
    })


CUSTOM_APIS["create_books_contact"] = create_books_contact
CUSTOM_APIS["add_item_by_id"] = add_item_by_id
CUSTOM_APIS["fetch_customer_from_books"] = fetch_customer_from_books
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/procurement/test_books_apis.py -q`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add app/procurement/books_apis.py tests/procurement/test_books_apis.py
git commit -m "feat: app/procurement/books_apis.py (create_books_contact, add_item_by_id, fetch_customer_from_books)"
```

---

## Task 5 — `app/procurement/estimates.py`

**Files:**
- Create: `app/procurement/estimates.py`
- Test: `tests/procurement/test_estimates.py`

**Interfaces:**
- Consumes: `app.books.client.BooksError` (Task 1), `app.criteria.ZohoError`, `app.criteria.zoho_now`/`today` (already exist — confirm `today()` with no args returns today's date string, matching Node's `today()` from `criteria.mjs`), `app.deluge.id_of`/`truthy`/`blank`/`to_num` (already exist).
- Produces: `create_estimate(payload, store, ctx)` registered into `CUSTOM_APIS["create_estimate"]`. `ctx` carries `books` only.

**Steps:**

- [ ] **Step 1: Write the failing tests**

Port every test from `tests/procurement/books-estimates.test.js` (already read in full). Create `tests/procurement/test_estimates.py`:

```python
import pytest
from app.books.client import BooksError
from app.criteria import today


def _fake_books(routes: dict):
    calls: list[dict] = []

    def run(method: str):
        async def call_fn(path, *args, **kwargs):
            if method in ("POST", "PUT"):
                opts = {"body": args[0] if args else kwargs.get("body")}
            else:
                opts = dict(kwargs)
            calls.append({"method": method, "path": path, **opts})
            r = routes.get(f"{method} {path}")
            if r is None:
                raise BooksError(f"no route {method} {path}", status=404, code=1002)
            if isinstance(r, Exception):
                raise r
            return r
        return call_fn

    return {"calls": calls, "books": {"books": {"get": run("GET"), "post": run("POST"), "put": run("PUT")}}}


def _estimate(id_: str, no: str, **extra) -> dict:
    return {"code": 0, "estimate": {"estimate_id": id_, "estimate_number": no, **extra}}


@pytest.fixture
async def store(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
async def seed(store):
    customer = await store.add_record("Customer", {"customer_name": "ACME", "ID1": "C100"})
    project = await store.add_record("Projects", {"Project_Name": "Mall", "Customer": customer})
    item = await store.add_record("Items", {"ID1": "B1", "item_name": "Lamp", "SKU": "LAMP-1"})
    return {"customer": customer, "project": project, "item": item}


async def _inquiry(store, seed, **extra):
    payload = {
        "INQ_No": "INQ-00001", "Projects": seed["project"], "Customer": seed["customer"], "Items": seed["item"], "sku": "LAMP-1", "quantity": "3", "SRP_Approved1": 1000, "description": "A lamp", "Dimension": "10x10",
        "quote_group": "PRJ-1", "Sales_Owner": "HC Sales 7", "Customer_Type": "Enduser", "target_date": "2026-12-01", "Supplier_Selected": True, "Availability": True, "Final_Price_Exists": True,
        "SRP_Approved": True, "Product_Sample": "Completed", "D_Image": "N/A", "Specification": "Completed", "Technical_Drawing": "Completed", "Ready_for_Estimates": True, **extra,
    }
    return await store.add_record("Inquiry_Form", payload)


async def _call(inq_no, ctx, store):
    from app.custom_apis import invoke_custom_api
    import app.procurement.estimates  # noqa: F401
    return await invoke_custom_api("create_estimate", {"inqNo": inq_no}, store, ctx)


async def _read(store, form, id_):
    return await store.get_record_by_id(form, id_, raw=True)


# Node: 'first estimate for a project: created in Books from the ready inquiries, ids saved on inquiry and project'
@pytest.mark.asyncio
async def test_first_estimate_created_from_ready_inquiries_ids_saved(store, seed):
    id_ = await _inquiry(store, seed)
    zoho = _fake_books({"POST /estimates": _estimate("E1", "EST-0001")})
    out = await _call("INQ-00001", zoho, store)
    assert out == {"status": "success", "estimateId": "E1", "estimateNo": "EST-0001", "message": "Estimate EST-0001 created with 1 items"}

    body = zoho["calls"][0]["body"]
    assert body["customer_id"] == "C100"
    assert body["date"] == today()
    assert body["expiry_date"] == "2026-12-01"
    assert body["line_items"] == [{"item_id": "B1", "name": "Lamp", "description": "A lamp\nDimension: 10x10", "quantity": 3, "rate": 1000}]
    assert [f["label"] for f in body["custom_fields"]] == ["Sales Agent", "Project Name", "Design Company", "Designer/ Architect", "Design Partner", "Commission ",
                                                             "Customer Type", "Order Type", "Project Type:", "For Bidding? (✓ if yes)", "Additional discount needed", "Target Delivery Date", "INQ No"]

    def field(label):
        return next(f for f in body["custom_fields"] if f["label"] == label)["value"]

    assert [field("Sales Agent"), field("Project Name"), field("Customer Type"), field("INQ No")] == ["HC Sales 7", "Mall", "End User", "INQ-00001"]

    rec = await _read(store, "Inquiry_Form", id_)
    assert [rec["Books_Estimate_ID"], rec["Books_Estimate_No"], rec["Estimate_Created"]] == ["E1", "EST-0001", True]
    proj = await _read(store, "Projects", seed["project"])
    assert [proj["Books_Estimate_ID"], proj["Books_Estimate_No"]] == ["E1", "EST-0001"]


# Node: 'later estimate for the same project: the existing estimate is updated, keeping its line item ids'
@pytest.mark.asyncio
async def test_later_estimate_updates_existing_keeps_line_item_ids(store, seed):
    await _inquiry(store, seed)
    await store.update_record("Projects", seed["project"], {"Books_Estimate_ID": "E1", "Books_Estimate_No": "EST-0001"}, by_form=True)
    zoho = _fake_books({
        "GET /estimates/E1": _estimate("E1", "EST-0001", line_items=[{"item_id": "B1", "line_item_id": "L1"}, {"item_id": "OTHER", "line_item_id": "L2"}]),
        "PUT /estimates/E1": _estimate("E1", "EST-0001"),
    })
    out = await _call("INQ-00001", zoho, store)
    assert out == {"status": "success", "estimateId": "E1", "estimateNo": "EST-0001", "message": "Estimate EST-0001 updated in Zoho Books"}
    put = next(c for c in zoho["calls"] if c["method"] == "PUT")["body"]
    assert put["line_items"][0]["line_item_id"] == "L1"
    assert "customer_id" not in put
    assert not any(c["method"] == "POST" for c in zoho["calls"])


# Node: 'only ready inquiries of the project are in the estimate; an unrelated inquiry with an empty group is left out'
@pytest.mark.asyncio
async def test_only_ready_inquiries_included_empty_group_other_project_left_out(store, seed):
    await _inquiry(store, seed)
    await _inquiry(store, seed, INQ_No="INQ-00002", quantity="0", sku="OTHER", Items="")  # same project, ready: quantity falls back to 1
    await _inquiry(store, seed, INQ_No="INQ-00003", Ready_for_Estimates=False, Supplier_Selected=False)  # same project, not ready
    other_project = await store.add_record("Projects", {"Project_Name": "Other"})
    await _inquiry(store, seed, INQ_No="INQ-00004", Projects=other_project, quote_group="")  # other project
    zoho = _fake_books({"POST /estimates": _estimate("E1", "EST-0001")})
    out = await _call("INQ-00001", zoho, store)
    assert out["message"] == "Estimate EST-0001 created with 2 items"
    assert next(f for f in zoho["calls"][0]["body"]["custom_fields"] if f["label"] == "INQ No")["value"] == "INQ-00001, INQ-00002"
    assert zoho["calls"][0]["body"]["line_items"][1]["quantity"] == 1
    assert zoho["calls"][0]["body"]["line_items"][1]["name"] == "OTHER", "no matching item: the SKU is the name"
    assert "item_id" not in zoho["calls"][0]["body"]["line_items"][1]


# Node: 'refuses when the inquiry is missing, not ready, or has no project'
@pytest.mark.asyncio
async def test_refuses_when_inquiry_missing_not_ready_or_no_project(store, seed):
    none_ = _fake_books({})
    assert await _call("INQ-99999", none_, store) == {"status": "error", "message": "Inquiry INQ-99999 not found"}
    await _inquiry(store, seed, Ready_for_Estimates=False, Supplier_Selected=False)
    assert "not yet ready for estimate" in (await _call("INQ-00001", none_, store))["message"]


# Node: 'a stale "ready" flag is healed when the fields say it is ready'
@pytest.mark.asyncio
async def test_stale_ready_flag_healed_when_fields_say_ready(store, seed):
    id_ = await _inquiry(store, seed, Ready_for_Estimates=False)
    out = await _call("INQ-00001", _fake_books({"POST /estimates": _estimate("E1", "EST-0001")}), store)
    assert out["status"] == "success"
    assert (await _read(store, "Inquiry_Form", id_))["Ready_for_Estimates"] is True


# Node: 'customer: falls back to the project customer, then looks it up in Books by name'
@pytest.mark.asyncio
async def test_customer_falls_back_to_project_then_books_lookup_by_name(store, seed):
    id_ = await _inquiry(store, seed, Customer="")
    zoho = _fake_books({"POST /estimates": _estimate("E1", "EST-0001")})
    assert (await _call("INQ-00001", zoho, store))["status"] == "success"
    assert zoho["calls"][0]["body"]["customer_id"] == "C100"
    assert (await _read(store, "Inquiry_Form", id_))["Customer"] == seed["customer"], "the inquiry now has the project's customer"


# Node: 'customer not in Books: a clear error and nothing is created'
@pytest.mark.asyncio
async def test_customer_not_in_books_clear_error_nothing_created(store, seed):
    await _inquiry(store, seed)
    await store.update_record("Customer", seed["customer"], {"ID1": ""}, by_form=True)
    zoho = _fake_books({"GET /contacts": {"code": 0, "contacts": []}})
    assert (await _call("INQ-00001", zoho, store))["message"] == "Customer 'ACME' is not linked to Zoho Books (missing contact ID)."
    assert not any(c["method"] == "POST" for c in zoho["calls"])


# Node: 'an estimate Books no longer has is forgotten and a new one is created; a Books outage is not mistaken for that'
@pytest.mark.asyncio
async def test_gone_estimate_forgotten_new_created_outage_not_mistaken(store, seed):
    await _inquiry(store, seed)
    await store.update_record("Projects", seed["project"], {"Books_Estimate_ID": "GONE", "Books_Estimate_No": "EST-0009"}, by_form=True)
    gone = _fake_books({"GET /estimates/GONE": BooksError("The estimate does not exist.", status=404, code=1002), "POST /estimates": _estimate("E3", "EST-0010")})
    assert (await _call("INQ-00001", gone, store))["message"] == "Estimate EST-0010 created with 1 items"
    assert (await _read(store, "Projects", seed["project"]))["Books_Estimate_ID"] == "E3"

    await store.update_record("Projects", seed["project"], {"Books_Estimate_ID": "E3", "Books_Estimate_No": "EST-0010"}, by_form=True)
    down = _fake_books({"GET /estimates/E3": BooksError("Service unavailable", status=503)})
    out = await _call("INQ-00001", down, store)
    assert out["status"] == "error"
    assert "Could not check the existing estimate in Books: Service unavailable" in out["message"]
    assert not any(c["method"] == "POST" for c in down["calls"]), "no duplicate estimate"
    assert (await _read(store, "Projects", seed["project"]))["Books_Estimate_ID"] == "E3", "the stored id is kept"


# Node: 'Books rejecting the estimate is reported with its message and nothing is saved'
@pytest.mark.asyncio
async def test_books_rejecting_estimate_reported_nothing_saved(store, seed):
    id_ = await _inquiry(store, seed)
    out = await _call("INQ-00001", _fake_books({"POST /estimates": BooksError("Invalid value passed for expiry_date.", status=400, code=4)}), store)
    assert out == {"status": "error", "message": "Books CREATE failed: Invalid value passed for expiry_date."}
    assert (await _read(store, "Inquiry_Form", id_))["Estimate_Created"] is False
    assert (await _read(store, "Projects", seed["project"]))["Books_Estimate_ID"] == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/procurement/test_estimates.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.procurement.estimates'`

- [ ] **Step 3: Write the implementation**

Port directly from `server/modules/procurement/estimates.mjs` (already read in full this session):

```python
# create_estimate, ported from zoho-export/parsed/functions/createEstimateForInquiry.dg.
# One Books estimate per project: the first "Create estimate" creates it from every ready inquiry
# of the project, later ones update it. ctx = {books}.
#
# Differences from the Deluge function, on purpose:
#  - an inquiry with no quote_group is matched to its project only; the Zoho filter
#    `quote_group == rec.quote_group` would otherwise pull in every unrelated inquiry whose
#    quote_group is also empty;
#  - a stored estimate id is cleared only when Books says the estimate does not exist; if Books
#    cannot be reached the call stops, instead of clearing the id and creating a duplicate estimate.
# Ported from server/modules/procurement/estimates.mjs.
import math

from app.books.client import BooksError
from app.criteria import ZohoError, today
from app.custom_apis import CUSTOM_APIS
from app.deluge import blank, id_of, to_num, truthy

COLLATERAL = ["Product_Sample", "D_Image", "Specification", "Technical_Drawing"]


def _text(v) -> str:
    return "" if blank(v) else str(v)


def _collateral_complete(r: dict) -> bool:
    return all(r.get(k) in ("Completed", "N/A") for k in COLLATERAL)


def _srp_approved(r: dict) -> bool:
    return truthy(r.get("SRP_Approved")) or r.get("SRP_Status") == "Approved" or to_num(r.get("SRP_Approved1")) > 0


def _final_price_exists(r: dict) -> bool:
    return truthy(r.get("Final_Price_Exists")) or to_num(r.get("Select_Final_Cost")) > 0 or to_num(r.get("SRP_Approved1")) > 0


def _is_ready(r: dict) -> bool:
    return truthy(r.get("Ready_for_Estimates")) or (
        truthy(r.get("Supplier_Selected")) and truthy(r.get("Availability")) and _final_price_exists(r) and _collateral_complete(r) and _srp_approved(r)
    )


# The Books line description: the inquiry's own text first, then each filled-in specification, one per line.
def _line_description(inq: dict) -> str:
    parts = [
        inq.get("description"), ("Dimension", inq.get("Dimension")), ("Color Body", inq.get("Color_Body")), ("Color Temperature", inq.get("Color_Temperature")),
        ("Type of Bulb", inq.get("Type_of_Bulb")), ("Voltage", inq.get("Voltage")), ("Lumens", inq.get("Lumens")), inq.get("Addtional_Description"),
    ]
    out = []
    for part in parts:
        if isinstance(part, tuple):
            label, value = part
            out.append("" if blank(value) else f"{label}: {value}")
        else:
            out.append(_text(part))
    return "\n".join(p for p in out if p)


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


async def create_estimate(payload: dict, store, ctx: dict) -> dict:
    p = payload or {}
    inq_no = p.get("inqNo")
    if not ctx.get("books"):
        return _fail("Zoho Books is not available in this backend.")
    books = ctx["books"]["books"]

    def book_err(e, prefix: str):
        return _fail(e.message if e.code == "not_configured" else f"{prefix}{e.message}") if isinstance(e, BooksError) else None

    matches = await store.find("Inquiry_Form", lambda r: r.get("INQ_No") == inq_no)
    rec = matches[0] if matches else None
    if not rec:
        return _fail(f"Inquiry {inq_no} not found")

    # 1. readiness, recomputed from the fields so a stale flag does not block it
    if not _is_ready(rec):
        return _fail(f"Inquiry {inq_no} is not yet ready for estimate. Please verify readiness checklist.")
    if not truthy(rec.get("Ready_for_Estimates")):
        await store.update_record("Inquiry_Form", rec["ID"], {"Ready_for_Estimates": True}, by_form=True)

    # 2. project
    project_id = id_of(rec.get("Projects"))
    if not project_id:
        return _fail("No project assigned. Please assign a project first.")
    try:
        project = await store.get_record_by_id("Projects", project_id, raw=True)
    except Exception:
        project = None
    proj_name = _text((project or {}).get("Project_Name"))
    estimate_id = _text((project or {}).get("Books_Estimate_ID"))
    estimate_no = _text((project or {}).get("Books_Estimate_No"))
    project_customer_id = id_of((project or {}).get("Customer"))

    # 3. customer, falling back to the project's customer
    async def customer_of(id_):
        if not id_:
            return None
        try:
            return await store.get_record_by_id("Customer", id_, raw=True)
        except Exception:
            return None

    customer_id = id_of(rec.get("Customer"))
    customer = await customer_of(customer_id)
    books_customer_id = _text((customer or {}).get("ID1"))
    customer_name = _text((customer or {}).get("customer_name"))
    if not books_customer_id:
        fallback = await customer_of(project_customer_id)
        if fallback:
            books_customer_id = _text(fallback.get("ID1"))
            customer_name = _text(fallback.get("customer_name"))
            customer_id = project_customer_id
            await store.update_record("Inquiry_Form", rec["ID"], {"Customer": project_customer_id}, by_form=True)
    # Not linked yet: look the customer up in Books by name and remember the id
    if not books_customer_id and customer_name:
        try:
            found = (await books["get"]("/contacts", query={"contact_name": customer_name})).get("contacts") or []
            if found:
                books_customer_id = _text(found[0].get("contact_id"))
                link_to = customer_id or project_customer_id
                if link_to:
                    try:
                        await store.update_record("Customer", link_to, {"ID1": books_customer_id}, by_form=True)
                    except ZohoError:
                        pass
        except BooksError as e:
            if e.code == "not_configured":
                return _fail(e.message)
    if not books_customer_id:
        return _fail(f"Customer '{customer_name}' is not linked to Zoho Books (missing contact ID)." if customer_name else "No customer assigned on inquiry or project. Please select a customer.")

    # 4. does the project's estimate still exist in Books?
    current_items = []
    if estimate_id:
        try:
            existing = (await books["get"](f"/estimates/{estimate_id}")).get("estimate")
            if existing:
                current_items = existing.get("line_items") or []
                if _text(existing.get("estimate_number")):
                    estimate_no = _text(existing["estimate_number"])
        except BooksError as e:
            if e.code == "not_configured":
                return _fail(e.message)
            if e.status != 404 and e.code != 1002:
                return _fail(f"Could not check the existing estimate in Books: {e.message}")
            estimate_id = ""
            estimate_no = ""
            await store.update_record("Projects", project_id, {"Books_Estimate_ID": "", "Books_Estimate_No": ""}, by_form=True)

    # 5. line items from every ready inquiry of the project (and of its quote group)
    group = _text(rec.get("quote_group"))
    siblings = await store.find("Inquiry_Form", lambda r: id_of(r.get("Projects")) == project_id or (group != "" and _text(r.get("quote_group")) == group))
    line_items = []
    inq_nos = []
    items = {i["ID"]: i for i in await store.find("Items")}
    items_by_sku = {i["SKU"]: i for i in items.values() if not blank(i.get("SKU"))}
    for inq in siblings:
        if not _is_ready(inq):
            continue
        inq_nos.append(inq.get("INQ_No"))
        item = items.get(id_of(inq.get("Items"))) or items_by_sku.get(inq.get("sku"))
        books_item_id = _text((item or {}).get("ID1"))
        qty = math.trunc(to_num(inq.get("quantity"))) if to_num(inq.get("quantity")) > 0 else 1
        line = {**({"item_id": books_item_id} if books_item_id else {}), "name": _text((item or {}).get("item_name")) or _text(inq.get("sku")), "description": _line_description(inq), "quantity": qty, "rate": to_num(inq.get("SRP_Approved1"))}
        existing_line = books_item_id and next((li for li in current_items if _text(li.get("item_id")) == books_item_id), None)
        if existing_line and _text(existing_line.get("line_item_id")):
            line["line_item_id"] = _text(existing_line["line_item_id"])
        line_items.append(line)

    target_date = _text(rec.get("target_date"))
    custom_fields = [
        {"label": label, "value": value} for label, value in [
            ("Sales Agent", _text(rec.get("Sales_Owner"))), ("Project Name", proj_name), ("Design Company", _text(rec.get("Design_Company"))),
            ("Designer/ Architect", _text(rec.get("Designer_Architect"))), ("Design Partner", _text(rec.get("Design_Partner"))), ("Commission ", _text(rec.get("Commission"))),
            ("Customer Type", "End User" if _text(rec.get("Customer_Type")) == "Enduser" else _text(rec.get("Customer_Type"))), ("Order Type", _text(rec.get("Order_Type"))),
            ("Project Type:", _text(rec.get("Project_Type"))), ("For Bidding? (✓ if yes)", _text(rec.get("For_Bidding"))), ("Additional discount needed", _text(rec.get("Addtl_Disc_Needed1"))),
            ("Target Delivery Date", target_date), ("INQ No", ", ".join(inq_nos)),
        ]
    ]

    # 6. update the estimate, or create it
    updating = bool(estimate_id)
    try:
        if updating:
            saved = await books["put"](f"/estimates/{estimate_id}", {"line_items": line_items, "custom_fields": custom_fields, "expiry_date": target_date})
        else:
            saved = await books["post"]("/estimates", {"customer_id": books_customer_id, "line_items": line_items, "custom_fields": custom_fields, "date": today(), "expiry_date": target_date})
    except BooksError as e:
        out = book_err(e, "Books UPDATE failed: " if updating else "Books CREATE failed: ")
        if out:
            return out
        raise
    if not updating and not (saved or {}).get("estimate"):
        return _fail(f"Books CREATE failed: {(saved or {}).get('message') or ''}")
    if updating:
        if _text((saved or {}).get("estimate", {}).get("estimate_number")):
            estimate_no = _text(saved["estimate"]["estimate_number"])
    else:
        estimate_id = _text(saved["estimate"]["estimate_id"])
        estimate_no = _text(saved["estimate"]["estimate_number"])

    for inq in siblings:
        if _is_ready(inq):
            await store.update_record("Inquiry_Form", inq["ID"], {"Books_Estimate_ID": estimate_id, "Books_Estimate_No": estimate_no, "Estimate_Created": True, "Ready_for_Estimates": True}, by_form=True)
    await store.update_record("Projects", project_id, {"Books_Estimate_ID": estimate_id, "Books_Estimate_No": estimate_no}, by_form=True)
    return {
        "status": "success", "estimateId": estimate_id, "estimateNo": estimate_no,
        "message": f"Estimate {estimate_no} updated in Zoho Books" if updating else f"Estimate {estimate_no} created with {len(line_items)} items",
    }


CUSTOM_APIS["create_estimate"] = create_estimate
```

**Important divergence check at implementation time:** re-read `estimates.mjs` lines 151-153 (`for (const inq of siblings) { await data.updateRecord(...) }`) against the code above — Node updates **every sibling unconditionally** (not gated on `isReady(inq)` a second time), because `siblings` there is never filtered down from the full list before this final loop; only the `lineItems` loop (step 5) skips non-ready ones. The draft above added an `if _is_ready(inq):` guard around the final stamping loop that Node's real source does **not** have — remove that guard so every sibling (ready or not) gets `Books_Estimate_ID`/`Books_Estimate_No` stamped, matching Node exactly. Fix this in the implementation before running the tests, then verify test `test_only_ready_inquiries_included_empty_group_other_project_left_out` still passes (it doesn't assert on the non-ready sibling's stamped fields either way, so this fix is only visible via careful re-reading, not a failing assertion — get it right by matching source, not by chasing a red test).

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/procurement/test_estimates.py -q`
Expected: PASS (9/9)

- [ ] **Step 5: Commit**

```bash
git add app/procurement/estimates.py tests/procurement/test_estimates.py
git commit -m "feat: app/procurement/estimates.py (create_estimate)"
```

---

## Task 6 — `app/procurement/akeneo_apis.py`

**Files:**
- Create: `app/procurement/akeneo_apis.py`

**Interfaces:**
- Consumes: `app.akeneo.client.AkeneoError` (Task 2), `app.shopify.client.ShopifyError` (Task 3).
- Produces: `search_items_akeneo(payload, store, ctx)`, `fetch_item_from_akeneo(payload, store, ctx)` registered into `CUSTOM_APIS`. `ctx` carries `akeneo` (a `create_akeneo_api()` result or `None`), `shopify` (a `create_shopify_api()` result or `None`), `user`, `save_upload`.

**No test file for this task** — per the Global Constraints, Akeneo has zero Node test coverage and this port matches that exactly. The `akeneo_apis.py` module is exercised transitively by nothing in this plan's own test suite; its correctness rests on faithful line-by-line porting, confirmed by the manual smoke check in Step 2.

**Steps:**

- [ ] **Step 1: Write the implementation**

Port directly from `server/modules/procurement/akeneo-apis.mjs` (already read in full this session):

```python
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
```

- [ ] **Step 2: Manual smoke check (no test file, per scope)**

```bash
python -c "
import app.procurement.akeneo_apis
from app.custom_apis import CUSTOM_APIS
print('search_items_akeneo' in CUSTOM_APIS, 'fetch_item_from_akeneo' in CUSTOM_APIS)
"
```

Expected output: `True True`

- [ ] **Step 3: Commit**

```bash
git add app/procurement/akeneo_apis.py
git commit -m "feat: app/procurement/akeneo_apis.py (search_items_akeneo, fetch_item_from_akeneo, no tests -- matches Node's own untested state)"
```

---

## Task 7 — Wire everything into `app/procurement/apis.py`

**Files:**
- Modify: `app/procurement/apis.py`
- Test: `tests/procurement/test_integrations_manifest.py`

**Interfaces:**
- Consumes: `app.procurement.books_apis` (Task 4), `app.procurement.estimates` (Task 5), `app.procurement.akeneo_apis` (Task 6) — each self-registers into `CUSTOM_APIS` at import time, same pattern as every other module `apis.py` already imports (`clone_shipment`, `dashboard`, `po_approval`, `receiving_buttons`, `replacement_requests`, `settings_hooks`).
- Produces: nothing new — this task only adds three import lines so `invoke_custom_api` can find the six handlers.

**Steps:**

- [ ] **Step 1: Write the failing test**

```python
# tests/procurement/test_integrations_manifest.py
# Confirms the six Books/Akeneo/Shopify custom APIs are wired through app.procurement.apis, the same
# way the manifest test in test_module_manifest.py already confirms the rest of Procurement's own
# custom APIs (this file is intentionally narrower in scope: it checks the six *new* names only).
def test_books_and_akeneo_custom_apis_are_registered():
    import app.procurement.apis  # noqa: F401 -- import registers every handler as a side effect
    from app.custom_apis import CUSTOM_APIS
    for name in ["create_books_contact", "add_item_by_id", "fetch_customer_from_books", "search_items_akeneo", "fetch_item_from_akeneo", "create_estimate"]:
        assert name in CUSTOM_APIS, name


def test_remaining_placeholders_are_still_unregistered():
    # create_bin_receiving (a genuine Node placeholder) must still fall through to the generic
    # "not ported yet" answer -- confirms this task did not accidentally register something it
    # shouldn't have.
    import app.procurement.apis  # noqa: F401
    from app.custom_apis import CUSTOM_APIS
    assert "create_bin_receiving" not in CUSTOM_APIS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/procurement/test_integrations_manifest.py -q`
Expected: FAIL — `AssertionError: create_books_contact` (not yet imported anywhere)

- [ ] **Step 3: Modify `app/procurement/apis.py`**

Read the current file first (it already imports `clone_shipment`, `dashboard`, `po_approval`, `receiving_buttons`, `replacement_requests`, `settings_hooks`, and directly registers `get_born_late_rate`/`get_po_tracking`/`get_rr_report`). Add three more self-registering imports to that same list, at the end of the existing import block:

```python
import app.procurement.books_apis  # noqa: F401 -- registers create_books_contact/add_item_by_id/fetch_customer_from_books
import app.procurement.estimates  # noqa: F401 -- registers create_estimate
import app.procurement.akeneo_apis  # noqa: F401 -- registers search_items_akeneo/fetch_item_from_akeneo
```

Do not modify anything else in the file — the `get_born_late_rate`/`get_po_tracking`/`get_rr_report` direct-registration block stays exactly as it is; this task only adds imports for self-registering modules, following the same pattern already used for the other six.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/procurement/test_integrations_manifest.py -q`
Expected: PASS (2/2)

- [ ] **Step 5: Run the full Procurement regression and the full repo suite**

```bash
python -m pytest tests/procurement/ -q
python -m pytest tests/ -q
```

Expected: every test passes, including every pre-existing Procurement and Fulfillment test (confirms nothing in this task's three new imports broke an existing hook-registration order — none of `books_apis.py`/`estimates.py`/`akeneo_apis.py` register any `Shipments`/`Purchase_Request1`/other hooked-form `register()` calls, only `CUSTOM_APIS` entries, so no ordering interaction with the rest of Procurement is expected, but confirm by running the suite rather than assuming it).

- [ ] **Step 6: Commit**

```bash
git add app/procurement/apis.py tests/procurement/test_integrations_manifest.py
git commit -m "feat: wire Books/Akeneo/Shopify custom APIs into app/procurement/apis.py"
```

---

## Final verification (after Task 7)

1. `python -m pytest tests/ -q` — full suite, every test green, including the ~19 new tests this plan added (9 Books client + 7 Books APIs + 9 estimates... wait, count precisely at execution time: 9 + 7 + 9 + 2 manifest = 27 new tests) plus every pre-existing test unchanged.
2. `python -c "import app.procurement"` — confirms the full Procurement package (which imports `app.procurement.apis`, which now imports the three new self-registering modules) still imports cleanly end to end with no circular-import or ordering surprise.
3. Confirm no `.env` file changed: `git status` should show no changes outside the files this plan explicitly lists.
4. Manual note for the user: this plan does not include a live smoke test against real Zoho Books/Akeneo/Shopify — per the user's explicit instruction, no credentials were wired. When ready to test live, the next step is providing real values for `ZOHO_BOOKS_CLIENT_ID`/`ZOHO_BOOKS_CLIENT_SECRET`/`ZOHO_BOOKS_REFRESH_TOKEN`/`ZOHO_BOOKS_ORG_ID` (and the Akeneo/Shopify equivalents) in `.env`, which this plan intentionally does not do.
