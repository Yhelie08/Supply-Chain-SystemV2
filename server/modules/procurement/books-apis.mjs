// Custom APIs that talk to Zoho Books, ported from zoho-export/parsed/functions/:
//   create_books_contact  <- createBooksContact.dg
//   add_item_by_id        <- addItemByIdBooks.dg
// Each handler is (payload, data, ctx): data is the data layer, ctx = { books, user, saveUpload }.
// They answer like the Deluge functions did: { status: 'success' | 'error', message, ... }.
import { ZohoError } from '../../criteria.mjs';
import { BooksError } from '../../books/client.mjs';

const ok = (message, extra = {}) => ({ status: 'success', message, ...extra });
const fail = (message) => ({ status: 'error', message });
const text = (v) => (v == null ? '' : String(v));

// ---------- create_books_contact ----------
export async function create_books_contact(p, data, ctx) {
  if (!ctx.books) return fail('Zoho Books is not available in this backend.');
  if (!p.customerId) return fail('No customerId provided — cannot backfill ID1.');

  // If the officer filled in First/Last Name use those; otherwise the whole Customer Name is the first name.
  const person = p.firstName ? { first: p.firstName, last: p.lastName } : { first: p.custName, last: '' };
  const body = {
    contact_name: p.custName,
    company_name: p.companyName,
    customer_sub_type: p.custSubType === 'individual' ? 'individual' : 'business',
    contact_type: 'customer',
    email: p.custEmail, phone: p.custPhone, mobile: p.custMobile,
    contact_persons: [{ salutation: p.salutation, first_name: person.first, last_name: person.last, email: p.custEmail, phone: p.custPhone, mobile: p.custMobile, is_primary_contact: true }],
    billing_address: { attention: p.billAttention, address: p.billAddress, city: p.billCity, state: p.billState, zip: p.billZip, country: p.billCountry, phone: p.billPhone, fax: p.billFax },
    shipping_address: { attention: p.shipAttention, address: p.shipAddress, city: p.shipCity, state: p.shipState, zip: p.shipZip, country: p.shipCountry, phone: p.shipPhone, fax: p.shipFax },
  };
  // Our Customer_Type values onto Books' own "Customer Type" dropdown.
  const customerType = { Enduser: 'End User', Designer: 'Design Partner' }[p.custType] ?? p.custType;
  if (customerType) body.custom_fields = [{ label: 'Customer Type', value: customerType }];

  let created;
  try { created = await ctx.books.books.post('/contacts', body); } catch (e) {
    if (e instanceof BooksError) return fail(e.code === 'not_configured' ? e.message : `Books contact creation failed — ${e.message}`);
    throw e;
  }
  const contactId = text(created.contact?.contact_id);
  if (!contactId) return fail(`Books contact creation failed — ${created.message || JSON.stringify(created)}`);

  // Link: the Books contact id goes into the customer's ID1.
  try { await data.updateRecord('Customer', p.customerId, { ID1: contactId }, { byForm: true }); } catch (e) { if (!(e instanceof ZohoError && e.code === 9280)) throw e; }
  return ok(`Books contact created and linked (ID1=${contactId})`, { contactId });
}

// ---------- add_item_by_id ----------
// The three real storage warehouses whose bin locations are listed.
const BIN_WAREHOUSES = [
  { id: '2680178000042173149', label: 'HC WH3 BAESA' },
  { id: '2680178000055220196', label: 'HC WH1 BANAWE' },
  { id: '2680178000047672049', label: 'INVENTORY' },
];

export async function add_item_by_id(p, data, ctx) {
  if (!ctx.books) return fail('Zoho Books is not available in this backend.');
  const itemId = text(p.itemBooksId).trim();
  if (!itemId) return fail('Item ID is required.');

  let detail;
  try { detail = (await ctx.books.books.get(`/items/${encodeURIComponent(itemId)}`)).item; } catch (e) {
    if (e instanceof BooksError && e.code === 'not_configured') return fail(e.message);
    detail = null;
  }
  if (!detail) return fail(`Item not found in Books for ID ${itemId} — check the ID and try again.`);

  const item = {
    item_name: detail.name ?? '', SKU: detail.sku ?? '', Item_ref: detail.cf_oldsku ?? '', Description: detail.cf_description ?? '',
    Unit: detail.unit ?? '', Rate: detail.rate ?? 0, category: detail.category_name ?? '',
  };

  // Warehouses holding physical stock (actual available stock, not accounting stock on hand).
  const warehouses = detail.warehouses || [];
  item.Warehouse = warehouses.filter((w) => w.warehouse_actual_available_stock != null && w.warehouse_actual_available_stock !== 0).map((w) => text(w.warehouse_name)).join(', ');

  // Bin locations with stock, per storage warehouse; "Map Bins" when the item has no bin yet.
  const segments = [];
  for (const { id, label } of BIN_WAREHOUSES) {
    const wh = warehouses.find((w) => text(w.warehouse_id) === id);
    if (!wh || wh.is_storage_location_enabled !== true) continue;
    let locations = [];
    try { locations = (await ctx.books.books.get(`/settings/warehouses/${id}/storagelocations`, { query: { item_id: itemId } })).storage_locations || []; } catch { /* treated as no bins */ }
    const bins = locations.filter((l) => l.balance_quantity != null && l.balance_quantity > 0).map((l) => text(l.name)).join(', ');
    segments.push(`${label}: ${bins || 'Map Bins'}`);
  }
  item.Bin_location = segments.join(' | ');

  // Upsert into Items, matched by ID1 (the Books item id).
  const existing = (await data.find('Items', (r) => r.ID1 === itemId)).at(-1);
  const wasUpdate = !!existing;
  const recordId = existing ? existing.ID : await data.addRecord('Items', { ID1: itemId, ...item }, ctx.user || '');
  if (existing) await data.updateRecord('Items', existing.ID, item, { byForm: true });

  // Image: best effort, only when Books has one and the record has none; a failure never undoes the item.
  const shouldFetchImage = !!text(detail.image_name) && text(existing?.Image) === '';
  let imageSynced = false;
  if (shouldFetchImage && ctx.saveUpload) {
    try {
      const file = await ctx.books.books.download(`/items/${encodeURIComponent(itemId)}/image`);
      const ext = /png/.test(file.contentType) ? 'png' : /gif/.test(file.contentType) ? 'gif' : /webp/.test(file.contentType) ? 'webp' : 'jpg';
      const url = await ctx.saveUpload(`${itemId}.${ext}`, file.buffer);
      await data.updateRecord('Items', recordId, { Image: url }, { byForm: true });
      imageSynced = true;
    } catch { imageSynced = false; }
  }
  const failedImage = shouldFetchImage && !imageSynced;
  return ok(`${wasUpdate ? 'Updated existing item' : 'Added new item'}: ${item.item_name}${failedImage ? ' (image sync failed — item saved without photo)' : ''}`, {
    imageSynced, wasUpdate, recordId: String(recordId), ID1: itemId, item_name: item.item_name, SKU: item.SKU, Rate: item.Rate,
    Unit: item.Unit, Description: item.Description, category: item.category, Warehouse: item.Warehouse, Bin_location: item.Bin_location,
  });
}

// ---------- fetch_customer_from_books ----------
// Called when a customer is picked in the New Inquiry / Detail Edit form (not bulk — avoids
// burning Books API quota on every row of a 10k+ customer list). Looks up the live Books contact
// by the local Customer record's ID1 (the Books contact_id, same linking convention create_books_contact
// writes), refreshes address/email/phone/Design fields from Books, and picks up Customer Type from
// the custom field labeled "Customer Type" if Books has it set (same field create_books_contact writes to).
const buildAddr = (a) => ({
  address_line_1: text(a?.address), address_line_2: text(a?.street2),
  district_city: text(a?.city), state_province: text(a?.state), postal_Code: text(a?.zip), country: text(a?.country),
});
export async function fetch_customer_from_books(p, data, ctx) {
  if (!ctx.books) return fail('Zoho Books is not available in this backend.');
  if (!p.customerId) return fail('No customerId provided.');
  const local = await data.getRecordById('Customer', p.customerId).catch(() => null);
  const contactId = text(local?.ID1).trim();
  if (!contactId) return ok('No linked Books contact for this customer (ID1 is blank).', { linked: false, customerId: text(p.customerId) });

  let contact;
  try { contact = (await ctx.books.books.get(`/contacts/${encodeURIComponent(contactId)}`)).contact; } catch (e) {
    if (e instanceof BooksError && e.code === 'not_configured') return fail(e.message);
    return ok(`Books contact ${contactId} not found — ${e.message}`, { linked: false, customerId: text(p.customerId) });
  }
  if (!contact) return ok(`Books contact ${contactId} not found.`, { linked: false, customerId: text(p.customerId) });

  const typeField = (contact.custom_fields || []).find((f) => text(f.label).trim().toLowerCase() === 'customer type');
  const booksType = typeField ? { 'End User': 'Enduser', 'Design Partner': 'Designer' }[text(typeField.value)] ?? text(typeField.value) : '';

  const update = {
    Email: text(contact.email), Phone_Number: text(contact.phone), Mobile: text(contact.mobile),
    Billing_Address: buildAddr(contact.billing_address), Shipping_Address: buildAddr(contact.shipping_address),
  };
  if (booksType) update.Customer_Type = booksType;
  try { await data.updateRecord('Customer', p.customerId, update, { byForm: true }); } catch { /* best effort — the pick still returns fresh values below */ }

  return ok(`Refreshed from Books contact ${contactId}.`, {
    linked: true, customerId: text(p.customerId), Email: update.Email, Phone_Number: update.Phone_Number, Mobile: update.Mobile,
    Customer_Type: booksType, Billing_Address: update.Billing_Address, Shipping_Address: update.Shipping_Address,
  });
}
