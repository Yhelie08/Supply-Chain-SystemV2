// Custom API backing the Items picker's live Akeneo search. Search itself goes straight through
// a thin passthrough custom API (search_items_akeneo) so the widget's dropdown stays debounced
// and server-side without round-tripping through getRecords; the pick-time fetch
// (fetch_item_from_akeneo) does the real work: one Akeneo product fetch, upserts Items in
// Postgres (same ID1-by-master-id convention as add_item_by_id in books-apis.mjs), one Shopify
// price lookup by SKU, and returns Inquiry-form spec fields (Dimension/Color/Voltage/Lumens) for
// the widget to apply directly -- those have no home on the Items master, only on the inquiry.
import { AkeneoError } from '../../akeneo/client.mjs';
import { ShopifyError } from '../../shopify/client.mjs';

const ok = (message, extra = {}) => ({ status: 'success', message, ...extra });
const fail = (message) => ({ status: 'error', message });
const text = (v) => (v == null ? '' : String(v));
// Akeneo's `description` attribute is rich-text HTML (<p>, <ul>, <br> etc) -- stripped to plain
// text for Items.Description (a plain textarea field, not an HTML renderer).
const stripHtml = (v) => text(v).replace(/<(p|div|li|br)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '').trim();
const firstValue = (values, attr) => { const e = values?.[attr]; return Array.isArray(e) && e[0] ? e[0].data : undefined; };
const firstEntry = (values, attr) => { const e = values?.[attr]; return Array.isArray(e) && e[0] ? e[0] : undefined; };

export async function search_items_akeneo(p, data, ctx) {
  if (!ctx.akeneo) return fail('Akeneo is not available in this backend.');
  const q = text(p.q).trim();
  if (!q) return ok('', { items: [] });
  try {
    const items = await ctx.akeneo.searchItems(q, { limit: 20 });
    return ok('', { items: items.map((it) => ({ identifier: it.identifier, name: text(firstValue(it.values, 'name')) || it.identifier })) });
  } catch (e) {
    if (e instanceof AkeneoError) return fail(e.message);
    throw e;
  }
}

// Width/Length2/Height2/Diameter are Akeneo "metric" attributes: { amount, unit }, not plain
// numbers -- confirmed live (e.g. { amount: "10.0000", unit: "CENTIMETER" }). amount is trimmed
// of trailing zeros and unit shortened (CENTIMETER -> cm) to match this form's own placeholder
// style ("600 x 600 x 150 mm").
const UNIT_SHORT = { CENTIMETER: 'cm', MILLIMETER: 'mm', METER: 'm', INCH: 'in' };
function formatMetric(m) {
  if (!m || m.amount == null) return null;
  const n = Number(m.amount);
  const amount = Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(m.amount);
  return amount + (UNIT_SHORT[m.unit] || (m.unit ? ` ${m.unit}` : ''));
}
function buildDimension(values) {
  const parts = [];
  for (const [key, label] of [['Length2', 'L'], ['Width', 'W'], ['Height2', 'H'], ['Diameter', 'Dia']]) {
    const formatted = formatMetric(firstValue(values, key));
    if (formatted) parts.push(`${label} ${formatted}`);
  }
  return parts.join(' x ');
}

export async function fetch_item_from_akeneo(p, data, ctx) {
  if (!ctx.akeneo) return fail('Akeneo is not available in this backend.');
  const identifier = text(p.identifier).trim();
  if (!identifier) return fail('No identifier provided.');

  let product;
  try { product = await ctx.akeneo.getItem(identifier); } catch (e) {
    if (e instanceof AkeneoError) return fail(`Akeneo item ${identifier} not found — ${e.message}`);
    throw e;
  }
  const v = product.values || {};
  const item = {
    item_name: text(firstValue(v, 'name')) || identifier,
    SKU: product.identifier,
    Description: stripHtml(firstValue(v, 'description')),
    category: '', // Product_Type lives on the parent model, not every variant -- left for manual pick, same as Unit.
  };

  // Rate: Shopify's real listed price by SKU, not Akeneo's Costing (a bucketed cost-tier range
  // like "100-200 USD", not a precise sellable price -- see server/shopify/client.mjs).
  let rate = null;
  if (ctx.shopify) {
    try { const match = await ctx.shopify.priceForSku(product.identifier); if (match) rate = Number(match.price) || null; }
    catch (e) { if (!(e instanceof ShopifyError)) throw e; /* best effort -- no price is not a failure */ }
  }
  if (rate != null) item.Rate = String(rate);

  // Upsert into Items, matched by ID1 (mirrors add_item_by_id's convention) -- Akeneo's own
  // identifier doubles as ID1 here since Items has no separate Akeneo-id slot and the identifier
  // IS the SKU, a stable natural key.
  const existing = (await data.find('Items', (r) => r.ID1 === identifier)).at(-1);
  const wasUpdate = !!existing;
  const recordId = existing ? existing.ID : await data.addRecord('Items', { ID1: identifier, ...item }, ctx.user || '');
  if (existing) await data.updateRecord('Items', existing.ID, item, { byForm: true });

  // Image: best effort, only when Akeneo has one and the record has none yet -- downloaded and
  // cached locally once per item (not re-fetched on later picks), same "fetch once, cache
  // forever" shape as books-apis.mjs's own image sync, so re-loading this item's picker row
  // never re-calls Akeneo just for the photo.
  const imageEntry = firstEntry(v, 'image');
  const shouldFetchImage = !!imageEntry?._links?.download?.href && text(existing?.Image) === '';
  let imageSynced = false;
  if (shouldFetchImage) {
    try {
      const { buffer } = await ctx.akeneo.downloadMedia(imageEntry._links.download.href);
      const ext = (text(imageEntry.data).split('.').pop() || 'jpg').toLowerCase();
      const url = await ctx.saveUpload(`${identifier}.${ext}`, buffer);
      await data.updateRecord('Items', recordId, { Image: url }, { byForm: true });
      imageSynced = true;
    } catch { imageSynced = false; }
  }

  // color2 is a multi-select (e.g. ["red","silver","white"]) -- joined for the free-text Color
  // Body field. color_temperature/voltage come back lowercase ("3000k"/"220v"); ColorTemp is
  // upper-cased so it can match the form's fixed 2700K-5000K picklist, Voltage stays free text.
  // No Akeneo attribute corresponds to Lumens (wattage is a different, unrelated measure) --
  // left unset rather than mislabeling wattage as lumens.
  const color2 = firstValue(v, 'color2');
  const finalImage = imageSynced ? (await data.getRecordById('Items', recordId)).Image : text(existing?.Image);
  return ok(`${wasUpdate ? 'Updated existing item' : 'Added new item'}: ${item.item_name}`, {
    wasUpdate, recordId: String(recordId), ID1: identifier, item_name: item.item_name, SKU: item.SKU,
    Description: item.Description, category: item.category, Rate: item.Rate || '', Image: finalImage,
    Dimension: buildDimension(v), ColorBody: Array.isArray(color2) ? color2.join(', ') : text(color2),
    ColorTemp: text(firstValue(v, 'color_temperature')).toUpperCase(), Voltage: text(firstValue(v, 'voltage')),
  });
}
