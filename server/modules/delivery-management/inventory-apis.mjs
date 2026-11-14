// Delivery Management custom APIs that talk to Zoho Inventory, ported from zoho-export/parsed/functions/:
//   create_shipment_order       <- createShipmentOrder.dg      (a Shipment Order for one package of a delivery)
//   create_sales_return_books   <- createSalesReturnBooks.dg   (a Sales Return, and the stock received back)
// Each handler is (payload, data, ctx): data is the data layer, ctx = { books, user }; they answer like the Deluge
// functions did: { status: 'success' | 'error', message, ... }. Inventory is ctx.books.inventory (server/books/client.mjs);
// when Books is not configured the answer is the client's "Zoho Books is not configured" message.
//
// The Deluge calls Inventory with `invokeurl` and a body typed as a string; here the client posts JSON, which Inventory
// accepts, and the ids that go in the URL are query parameters. Not run against the live Inventory yet: that needs the
// Books OAuth client and the owner's OK (the tests use a stand-in). The custom field ids are Books' own, taken from the
// Deluge; the organisation id comes from the Books client configuration.
import { BooksError } from '../../books/client.mjs';

const ok = (message, extra = {}) => ({ status: 'success', message, ...extra });
const fail = (message) => ({ status: 'error', message });
const text = (v) => (v == null ? '' : String(v));
const isBlank = (v) => text(v) === '' || text(v) === 'null';

// Shipment Order custom fields (Inventory).
export const SHIPMENT_FIELDS = {
  deliveryDate: '2680178000000763374', typeOfDelivery: '2680178000000440145', ceilingMaterial: '2680178000000305854',
  ceilingHeight: '2680178000000305840', siteWiringReady: '2680178000000305866', preparedBy: '2680178000004081025', deliveryTeam: '2680178000004081035',
};
// Sales Return custom fields (Inventory).
export const RETURN_FIELDS = { subReason: '2680178000022219065', returnedBy: '2680178000022245013' };

// Delivery Type mapping from DMS Form choices to Zoho Books / Inventory picklist choices
export const BOOKS_DELIVERY_TYPE_MAP = {
  'Delivery Only': 'Deliver Only',
  'With Installation': 'Deliver & Install',
  'Full-Day Install': 'Deliver & Install',
  'Multi-Day Install': 'Deliver & Install',
  'Replacement': 'Replacement',
  'Site Visit': 'Service',
  'Pullout': 'Pick Up',
  'Pick Up': 'Pick Up',
};

// ---------- create_shipment_order ----------
export async function create_shipment_order(p, data, ctx) {
  const [appointment] = await data.find('Service_Appointment_Form', (r) => r.ID === text(p.recordId).trim());
  const [pack] = await data.find('Package_Shipments', (r) => r.ID === text(p.packageShipmentId).trim());
  if (!pack) return fail('Package Shipment record not found.');
  const rawType = isBlank(p.typeOfDelivery) ? text(appointment?.Type_of_Delivery) : text(p.typeOfDelivery);
  const typeOfDelivery = BOOKS_DELIVERY_TYPE_MAP[rawType] || rawType;
  if (!appointment) return fail('Service Appointment record not found.');
  const existing = pack.Shipment_Created === true || pack.Shipment_Created === 'true' ? text(pack.Shipment_Order_No) : '';
  if (!isBlank(existing)) return fail(`Already sent — Shipment Order ${existing} already exists for this delivery.`);
  const packageNumber = text(pack.Package_Number);
  if (isBlank(packageNumber)) return fail('No Package Number on this record — a real Inventory Package must exist before a Shipment can be created.');
  if (!ctx.books) return fail('Zoho Books is not available in this backend.');
  const salesOrder = text(appointment.Sales_Order);

  let packageId = null;
  let salesorderId = null;
  try {
    const found = await ctx.books.inventory.get('/packages', { query: { salesorder_number: salesOrder } });
    const match = (found.packages || []).find((k) => text(k.package_number) === packageNumber);
    if (match) { packageId = match.package_id; salesorderId = match.salesorder_id; }
  } catch (e) {
    if (e instanceof BooksError) return fail(e.code === 'not_configured' ? e.message : `Error fetching packages: ${e.message}`);
    throw e;
  }
  if (packageId == null) return fail(`Package '${packageNumber}' not found in Inventory for Sales Order ${salesOrder} — cannot create a Shipment without it.`);

  const body = {
    date: p.shipDate, delivery_method: text(p.carrier), shipping_charge: text(p.shippingCharge), send_notification: false, is_delivered: false,
    shipmentorder_custom_fields: [
      { customfield_id: SHIPMENT_FIELDS.deliveryDate, value: text(p.deliveryDate) },
      { customfield_id: SHIPMENT_FIELDS.typeOfDelivery, value: text(typeOfDelivery) },
      { customfield_id: SHIPMENT_FIELDS.ceilingMaterial, value: text(p.ceilingMaterial) },
      { customfield_id: SHIPMENT_FIELDS.ceilingHeight, value: text(p.ceilingHeight) },
      { customfield_id: SHIPMENT_FIELDS.siteWiringReady, value: text(p.siteWiringReady) },
      { customfield_id: SHIPMENT_FIELDS.preparedBy, value: text(p.preparedBy) },
      { customfield_id: SHIPMENT_FIELDS.deliveryTeam, value: text(p.deliveryTeam) },
    ],
  };
  let created;
  try {
    created = await ctx.books.inventory.post('/shipmentorders', body, { query: { salesorder_id: text(salesorderId), package_ids: text(packageId) } });
  } catch (e) {
    if (e instanceof BooksError) return { ...fail(`Inventory rejected the create — ${e.message}`), raw: JSON.stringify(e.details ?? null) };
    throw e;
  }
  const shipment = created.shipmentorder;
  if (!shipment) return { ...fail(`Inventory rejected the create — ${created.message}`), raw: JSON.stringify(created) };
  const shipmentId = shipment.shipment_id;
  const shipmentNo = isBlank(shipment.shipment_number) ? shipmentId : shipment.shipment_number;
  if (isBlank(shipmentId) || isBlank(shipmentNo)) return { ...fail("Shipment created in Inventory but response parsing failed — check the raw response, Inventory's shape may have changed again."), raw: JSON.stringify(created) };

  await data.updateRecord('Package_Shipments', pack.ID, { Shipment_Created: true, Shipment_Order_No: text(shipmentNo), Shipment_Order_ID: text(shipmentId) }, { byForm: true });
  return ok(`Shipment Order ${shipmentNo} created.`, { shipmentorder_id: shipmentId, shipmentorder_no: shipmentNo });
}

// ---------- create_sales_return_books ----------
export async function create_sales_return_books(p, data, ctx) {
  const [record] = await data.find('Sales_Returns_Form', (r) => r.ID === text(p.recordId).trim());
  if (!record) return fail('Sales Return record not found.');
  if (!isBlank(record.Books_SalesReturn_ID)) return fail(`Already sent to Books (Sales Return ${text(record.Books_SalesReturn_No)}).`);
  if (!ctx.books) return fail('Zoho Books is not available in this backend.');
  const salesOrderNo = text(p.salesOrderNo);

  let salesorderId;
  let lines;
  try {
    const search = await ctx.books.inventory.get('/salesorders', { query: { salesorder_number: salesOrderNo } });
    if (!search.salesorders?.length) return fail(`Sales Order '${salesOrderNo}' not found in Inventory — cannot resolve item references.`);
    salesorderId = text(search.salesorders[0].salesorder_id);
    const full = await ctx.books.inventory.get(`/salesorders/${salesorderId}`);
    if (!full.salesorder) return fail('Could not fetch full Sales Order details.');
    lines = full.salesorder.line_items || [];
  } catch (e) {
    if (e instanceof BooksError) return fail(e.code === 'not_configured' ? e.message : `Error fetching Sales Order: ${e.message}`);
    throw e;
  }

  // Each returned SKU takes the first order line with that SKU that no earlier row has taken.
  let returned = [];
  try {
    const parsed = JSON.parse(text(p.itemsJson) || '{}');
    returned = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
  } catch {
    return fail('The returned items could not be read.');
  }
  const lineItems = [];
  const unmatched = [];
  const used = new Set();
  for (const row of returned) {
    const sku = text(row?.SKU).trim();
    const qty = Number(row?.Return_Quantity);
    if (isBlank(sku) || !Number.isFinite(qty) || qty <= 0) continue;
    const line = lines.find((l) => l.sku === sku && !used.has(l.line_item_id));
    if (line) {
      used.add(line.line_item_id);
      lineItems.push({ item_id: line.item_id, salesorder_item_id: line.line_item_id, quantity: qty });
    } else {
      unmatched.push(sku);
    }
  }
  if (lineItems.length === 0) return fail(`No returned item matched a real line on Sales Order ${salesOrderNo}. Unmatched SKUs: [${unmatched.join(', ')}]`);

  const subReasonVal = text(p.subReasonVal);
  const returnedByVal = text(p.returnedByVal);
  let created;
  try {
    created = await ctx.books.inventory.post('/salesreturns', {
      date: p.dateVal, reason: text(p.reasonVal), line_items: lineItems,
      custom_fields: [{ customfield_id: RETURN_FIELDS.subReason, value: subReasonVal }, { customfield_id: RETURN_FIELDS.returnedBy, value: returnedByVal }],
    }, { query: { salesorder_id: salesorderId } });
  } catch (e) {
    if (e instanceof BooksError) return { ...fail(`Inventory rejected the create — ${e.message}`), raw: JSON.stringify(e.details ?? null) };
    throw e;
  }
  const salesReturn = created.salesreturn;
  if (!salesReturn) return { ...fail(`Inventory rejected the create — ${created.message}`), raw: JSON.stringify(created) };
  const returnId = salesReturn.salesreturn_id;
  const returnNo = salesReturn.salesreturn_number;
  await data.updateRecord('Sales_Returns_Form', record.ID, { Books_SalesReturn_ID: text(returnId), Books_SalesReturn_No: text(returnNo), RMA: text(returnNo), SR_CREATION_STATUS: 'CREATED' }, { byForm: true });

  // Receive the stock back. If this step fails the return is still valid: it is reported, not undone.
  const receiveLines = (salesReturn.line_items || []).map((l) => ({ line_item_id: l.line_item_id, quantity: l.quantity }));
  let receiveStatus = 'not_attempted';
  let receiveMessage = '';
  if (receiveLines.length > 0) {
    try {
      const received = await ctx.books.inventory.post('/salesreturnreceives', { line_items: receiveLines }, { query: { salesreturn_id: text(returnId) } });
      if (received.salesreturnreceive) receiveStatus = 'success'; else { receiveStatus = 'failed'; receiveMessage = text(received.message); }
    } catch (e) { receiveStatus = 'failed'; receiveMessage = e.message; }
  }
  const message = receiveStatus === 'success'
    ? `Sales Return ${returnNo} created and stock received back into Inventory.`
    : `Sales Return ${returnNo} created in Books — but the stock Receive step failed (${receiveMessage}). Return is still valid; receive stock manually in Books.`;
  return ok(message, { salesreturn_id: returnId, salesreturn_no: returnNo, receive_status: receiveStatus, ...(unmatched.length ? { unmatched_skus: `[${unmatched.join(', ')}]` } : {}) });
}
