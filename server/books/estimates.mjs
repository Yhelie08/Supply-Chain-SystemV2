// create_estimate, ported from zoho-export/parsed/functions/createEstimateForInquiry.dg.
// One Books estimate per project: the first "Create estimate" creates it from every ready inquiry of the
// project, later ones update it. Handler signature (payload, data, ctx) with ctx = { books }.
//
// Differences from the Deluge function, on purpose:
//  - an inquiry with no quote_group is matched to its project only; the Zoho filter `quote_group == rec.quote_group`
//    would otherwise pull in every unrelated inquiry whose quote_group is also empty;
//  - a stored estimate id is cleared only when Books says the estimate does not exist; if Books cannot be
//    reached the call stops, instead of clearing the id and creating a duplicate estimate.
import { ZohoError, today } from '../criteria.mjs';
import { BooksError } from './client.mjs';
import { idOf, truthy, blank, toNum } from '../workflows/deluge.mjs';

const fail = (message) => ({ status: 'error', message });
const text = (v) => (blank(v) ? '' : String(v));
const COLLATERAL = ['Product_Sample', 'D_Image', 'Specification', 'Technical_Drawing'];

const collateralComplete = (r) => COLLATERAL.every((k) => r[k] === 'Completed' || r[k] === 'N/A');
const srpApproved = (r) => truthy(r.SRP_Approved) || r.SRP_Status === 'Approved' || toNum(r.SRP_Approved1) > 0;
const finalPriceExists = (r) => truthy(r.Final_Price_Exists) || toNum(r.Select_Final_Cost) > 0 || toNum(r.SRP_Approved1) > 0;
const isReady = (r) => truthy(r.Ready_for_Estimates)
  || (truthy(r.Supplier_Selected) && truthy(r.Availability) && finalPriceExists(r) && collateralComplete(r) && srpApproved(r));

// The Books line description: the inquiry's own text first, then each filled-in specification, one per line.
function lineDescription(inq) {
  return [
    inq.description, ['Dimension', inq.Dimension], ['Color Body', inq.Color_Body], ['Color Temperature', inq.Color_Temperature],
    ['Type of Bulb', inq.Type_of_Bulb], ['Voltage', inq.Voltage], ['Lumens', inq.Lumens], inq.Addtional_Description,
  ].map((part) => (Array.isArray(part) ? (blank(part[1]) ? '' : `${part[0]}: ${part[1]}`) : text(part))).filter(Boolean).join('\n');
}

export async function create_estimate({ inqNo }, data, ctx) {
  if (!ctx.books) return fail('Zoho Books is not available in this backend.');
  const books = ctx.books.books;
  const bookErr = (e, prefix) => (e instanceof BooksError ? fail(e.code === 'not_configured' ? e.message : `${prefix}${e.message}`) : null);

  const rec = (await data.find('Inquiry_Form', (r) => r.INQ_No === inqNo))[0];
  if (!rec) return fail(`Inquiry ${inqNo} not found`);

  // 1. readiness, recomputed from the fields so a stale flag does not block it
  if (!isReady(rec)) return fail(`Inquiry ${inqNo} is not yet ready for estimate. Please verify readiness checklist.`);
  if (!truthy(rec.Ready_for_Estimates)) await data.updateRecord('Inquiry_Form', rec.ID, { Ready_for_Estimates: true }, { byForm: true });

  // 2. project
  const projectId = idOf(rec.Projects);
  if (!projectId) return fail('No project assigned. Please assign a project first.');
  const project = await data.getRecordById('Projects', projectId, { raw: true }).catch(() => null);
  const projName = text(project?.Project_Name);
  let estimateId = text(project?.Books_Estimate_ID);
  let estimateNo = text(project?.Books_Estimate_No);
  const projectCustomerId = idOf(project?.Customer);

  // 3. customer, falling back to the project's customer
  const customerOf = async (id) => (id ? data.getRecordById('Customer', id, { raw: true }).catch(() => null) : null);
  let customerId = idOf(rec.Customer);
  const customer = await customerOf(customerId);
  let booksCustomerId = text(customer?.ID1);
  let customerName = text(customer?.customer_name);
  if (!booksCustomerId) {
    const fallback = await customerOf(projectCustomerId);
    if (fallback) {
      booksCustomerId = text(fallback.ID1);
      customerName = text(fallback.customer_name);
      customerId = projectCustomerId;
      await data.updateRecord('Inquiry_Form', rec.ID, { Customer: projectCustomerId }, { byForm: true });
    }
  }
  // Not linked yet: look the customer up in Books by name and remember the id
  if (!booksCustomerId && customerName) {
    try {
      const found = (await books.get('/contacts', { query: { contact_name: customerName } })).contacts || [];
      if (found.length) {
        booksCustomerId = text(found[0].contact_id);
        const linkTo = customerId || projectCustomerId;
        if (linkTo) await data.updateRecord('Customer', linkTo, { ID1: booksCustomerId }, { byForm: true }).catch((e) => { if (!(e instanceof ZohoError)) throw e; });
      }
    } catch (e) { if (!(e instanceof BooksError)) throw e; if (e.code === 'not_configured') return fail(e.message); }
  }
  if (!booksCustomerId) {
    return fail(customerName ? `Customer '${customerName}' is not linked to Zoho Books (missing contact ID).` : 'No customer assigned on inquiry or project. Please select a customer.');
  }

  // 4. does the project's estimate still exist in Books?
  let currentItems = [];
  if (estimateId) {
    try {
      const existing = (await books.get(`/estimates/${encodeURIComponent(estimateId)}`)).estimate;
      if (existing) {
        currentItems = existing.line_items || [];
        if (text(existing.estimate_number)) estimateNo = text(existing.estimate_number);
      }
    } catch (e) {
      if (!(e instanceof BooksError)) throw e;
      if (e.code === 'not_configured') return fail(e.message);
      if (e.status !== 404 && e.code !== 1002) return fail(`Could not check the existing estimate in Books: ${e.message}`);
      estimateId = '';
      estimateNo = '';
      await data.updateRecord('Projects', projectId, { Books_Estimate_ID: '', Books_Estimate_No: '' }, { byForm: true });
    }
  }

  // 5. line items from every ready inquiry of the project (and of its quote group)
  const group = text(rec.quote_group);
  const siblings = await data.find('Inquiry_Form', (r) => idOf(r.Projects) === projectId || (group !== '' && text(r.quote_group) === group));
  const lineItems = [];
  const inqNos = [];
  const items = new Map((await data.find('Items')).map((i) => [i.ID, i]));
  const itemsBySku = new Map();
  for (const i of items.values()) if (!blank(i.SKU)) itemsBySku.set(i.SKU, i);
  for (const inq of siblings) {
    if (!isReady(inq)) continue;
    inqNos.push(inq.INQ_No);
    const item = items.get(idOf(inq.Items)) ?? itemsBySku.get(inq.sku);
    const booksItemId = text(item?.ID1);
    const qty = toNum(inq.quantity) > 0 ? Math.trunc(toNum(inq.quantity)) : 1;
    const line = { ...(booksItemId && { item_id: booksItemId }), name: text(item?.item_name) || text(inq.sku), description: lineDescription(inq), quantity: qty, rate: toNum(inq.SRP_Approved1) };
    const existingLine = booksItemId && currentItems.find((li) => text(li.item_id) === booksItemId);
    if (existingLine && text(existingLine.line_item_id)) line.line_item_id = text(existingLine.line_item_id);
    lineItems.push(line);
  }

  const targetDate = text(rec.target_date);
  const customFields = [
    ['Sales Agent', text(rec.Sales_Owner)], ['Project Name', projName], ['Design Company', text(rec.Design_Company)],
    ['Designer/ Architect', text(rec.Designer_Architect)], ['Design Partner', text(rec.Design_Partner)], ['Commission ', text(rec.Commission)],
    ['Customer Type', text(rec.Customer_Type) === 'Enduser' ? 'End User' : text(rec.Customer_Type)], ['Order Type', text(rec.Order_Type)],
    ['Project Type:', text(rec.Project_Type)], ['For Bidding? (✓ if yes)', text(rec.For_Bidding)], ['Additional discount needed', text(rec.Addtl_Disc_Needed1)],
    ['Target Delivery Date', targetDate], ['INQ No', inqNos.join(', ')],
  ].map(([label, value]) => ({ label, value }));

  // 6. update the estimate, or create it
  let saved;
  const updating = !!estimateId;
  try {
    saved = updating
      ? await books.put(`/estimates/${encodeURIComponent(estimateId)}`, { line_items: lineItems, custom_fields: customFields, expiry_date: targetDate })
      : await books.post('/estimates', { customer_id: booksCustomerId, line_items: lineItems, custom_fields: customFields, date: today(), expiry_date: targetDate });
  } catch (e) {
    const out = bookErr(e, updating ? 'Books UPDATE failed: ' : 'Books CREATE failed: ');
    if (out) return out;
    throw e;
  }
  if (!updating && !saved?.estimate) return fail(`Books CREATE failed: ${saved?.message ?? ''}`);
  if (updating) {
    if (text(saved?.estimate?.estimate_number)) estimateNo = text(saved.estimate.estimate_number);
  } else {
    estimateId = text(saved.estimate.estimate_id);
    estimateNo = text(saved.estimate.estimate_number);
  }

  for (const inq of siblings) {
    await data.updateRecord('Inquiry_Form', inq.ID, { Books_Estimate_ID: estimateId, Books_Estimate_No: estimateNo, Estimate_Created: true, Ready_for_Estimates: true }, { byForm: true });
  }
  await data.updateRecord('Projects', projectId, { Books_Estimate_ID: estimateId, Books_Estimate_No: estimateNo }, { byForm: true });
  return {
    status: 'success', estimateId, estimateNo,
    message: updating ? `Estimate ${estimateNo} updated in Zoho Books` : `Estimate ${estimateNo} created with ${lineItems.length} items`,
  };
}
