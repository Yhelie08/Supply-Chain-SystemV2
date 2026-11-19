# Dispatch table for custom APIs (mirrors server/custom-apis.mjs). Empty this task -- every
# department's own sub-project adds its own entries here. invoke_custom_api never raises for an
# unknown name; it returns the same "not ported yet" shape Node's custom-api-helpers.mjs's
# notPorted() produces.
CUSTOM_APIS: dict = {}


async def invoke_custom_api(name: str, payload: dict, store, ctx: dict) -> dict:
    fn = CUSTOM_APIS.get(name)
    if not fn:
        return {"status": "error", "message": f'"{name}" is not ported yet.'}
    return await fn(payload, store, ctx)
