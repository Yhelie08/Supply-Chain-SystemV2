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
            body={"query": query, "variables": variables},
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
