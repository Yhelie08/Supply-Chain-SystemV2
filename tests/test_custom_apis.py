import pytest

from app.custom_apis import CUSTOM_APIS, invoke_custom_api


@pytest.mark.asyncio
async def test_unknown_api_name_returns_a_not_ported_error_not_an_exception():
    result = await invoke_custom_api("totally_made_up_api", {}, None, {})
    assert result["status"] == "error"
    assert "not ported yet" in result["message"]


@pytest.mark.asyncio
async def test_a_registered_api_is_called_with_payload_store_and_ctx():
    seen = {}

    async def fake_api(payload, store, ctx):
        seen["payload"] = payload
        seen["store"] = store
        seen["ctx"] = ctx
        return {"status": "success"}

    CUSTOM_APIS["fake_api"] = fake_api
    try:
        result = await invoke_custom_api("fake_api", {"x": 1}, "the-store", {"user": "alice"})
        assert result == {"status": "success"}
        assert seen["payload"] == {"x": 1}
        assert seen["store"] == "the-store"
        assert seen["ctx"] == {"user": "alice"}
    finally:
        del CUSTOM_APIS["fake_api"]
