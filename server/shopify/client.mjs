// Minimal Shopify Admin GraphQL client — only what the Items picker needs: look up a variant's
// real listed price by SKU on pick. Not a sync client; read-only, one query per call.
//
// Env: SHOPIFY_SHOP_URL, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION

export class ShopifyError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = 'ShopifyError';
    this.status = status;
    this.details = details;
  }
}

export function createShopifyApi({ env = process.env, fetch: fetchImpl = globalThis.fetch } = {}) {
  const config = () => ({ shopUrl: env.SHOPIFY_SHOP_URL, token: env.SHOPIFY_ACCESS_TOKEN, apiVersion: env.SHOPIFY_API_VERSION || '2024-04' });
  const isConfigured = () => { const c = config(); return !!(c.shopUrl && c.token); };

  async function graphql(query, variables) {
    if (!isConfigured()) throw new ShopifyError('Shopify is not configured: set SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN.');
    const c = config();
    const res = await fetchImpl(`https://${c.shopUrl}/admin/api/${c.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': c.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new ShopifyError(`Shopify GraphQL request failed (HTTP ${res.status})`);
    const json = await res.json();
    if (json.errors) throw new ShopifyError(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`, { details: json });
    return json.data;
  }

  // Exact SKU match. Returns null when nothing is listed under that SKU (not an error --
  // plenty of Akeneo items have no Shopify listing yet).
  async function priceForSku(sku) {
    const data = await graphql(
      `query ($q: String!) { productVariants(first: 1, query: $q) { nodes { price product { title } } } }`,
      { q: `sku:'${String(sku).replace(/'/g, "\\'")}'` },
    );
    const node = data?.productVariants?.nodes?.[0];
    return node ? { price: node.price, productTitle: node.product?.title || '' } : null;
  }

  return { priceForSku, isConfigured };
}
