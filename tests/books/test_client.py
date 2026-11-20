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
