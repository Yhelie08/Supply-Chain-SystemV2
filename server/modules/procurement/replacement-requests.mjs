// "Create RR" of the Exceptions page, ported from zoho-export/parsed/functions:
//   createRRMain     (custom API create_rr_main)      one Replacement_Request per SKU + type of the exception's damaged / missing items
//   createRRTony / createRRFenteng (create_rr_tony / create_rr_fenteng)   the supplier's copy of each of those RRs, with the SAME RR number
// No Zoho Books call. Run with the raw store (no workflow hooks), like the Deluge functions, so the numbers and dates are set here.
//
// Once only: an RR that already exists for the same exception + SKU + source type is not made again (the answer says "No new RR needed"),
// and a supplier copy is never made twice, nor for a supplier different from the one the main RR was sent to.
// Items that are damaged but repairable, and were not marked "Not Fixed", are not replaced (they go back through repair, see Exception Control).
import { ok, fail } from '../../custom-api-helpers.mjs';
import { blank, todayDate, ymd, toNum } from '../../workflows/deluge.mjs';
import { nextNumber } from './purchase-order.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const today = () => ymd(todayDate());
const q = (field, value) => `(${field} == "${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;

async function exceptionOf(store, exceptionId) {
  const id = text(exceptionId);
  const [r] = id === '' ? [] : await store.find('Exceptions', (e) => String(e.ID) === id);
  return r || null;
}

// "Shade: 2, Base: 1" -> the spare part types and the "type: qty" pairs
function spareParts(raw, other) {
  const value = text(raw);
  if (value === '') return null;
  const types = [], pairs = [];
  for (const seg of value.split(',')) {
    const s = seg.trim();
    const i = s.indexOf(':');
    let type = (i < 0 ? s : s.slice(0, i)).trim();
    let qty = (i < 0 ? '' : s.slice(i + 1)).trim();
    if (qty === '' || qty === 'null') qty = '—';
    if (type === 'Others' && text(other) !== '') type = text(other);
    types.push(type); pairs.push(`${type}: ${qty}`);
  }
  return { type: types.join(', '), pairs: pairs.join(', ') };
}

// The exception's Product_Context rows grouped by SKU + type (Damage / Missing), skipping the repairable damage that is not "Not Fixed".
function groups(exc, supplierOverride = '') {
  const out = new Map();
  for (const pc of exc.Product_Context1 || []) {
    if (text(pc.Type_field) === 'Damage' && text(pc.Repairable) === 'Yes' && text(pc.Repair_Outcome) !== 'Not Fixed') continue;
    const key = `${text(pc.SKU)}||${text(pc.Type_field)}`;
    if (!out.has(key)) out.set(key, { sku: text(pc.SKU), item: pc.Item, supplier: supplierOverride !== '' ? supplierOverride : pc.Supplier, type: text(pc.Type_field), qty: 0, spareType: '', spairs: '' });
    const g = out.get(key);
    g.qty += blank(pc.Qty) ? 0 : toNum(pc.Qty);
    const sp = spareParts(pc.Quantity_of_damage_spare_s, pc.Spare_Part_Type_Other);
    if (sp) { g.spareType = g.spareType === '' ? sp.type : `${g.spareType}, ${sp.type}`; g.spairs = g.spairs === '' ? sp.pairs : `${g.spairs}, ${sp.pairs}`; }
  }
  return [...out.values()];
}

const sourceTypeOf = (exc, g) => (text(exc.Source_Module) === 'Receiving' ? (g.type === 'Damage' ? 'Receiving Damage' : 'Receiving Missing') : text(exc.Source_Module) === 'Fulfillment QC' ? 'QC Failure' : 'Management Decision');

function summaryRow(exc, g) {
  return { PR_No: exc.Receiving_Line_ID, Supplier: g.supplier, SKU: g.sku, Item: g.item, SO_No: exc.Sales_Order, Original_PO_No: exc.PO_No, Priority: exc.Priority, RR_Qty: g.qty };
}

// ---------------- createRRMain ----------------
export async function createRRMain({ exceptionId }, store, ctx = {}) {
  const exc = await exceptionOf(store, exceptionId);
  if (!exc) return fail('Exception not found.');
  const made = new Set();
  for (const rr of await store.find('Replacement_Request', (x) => text(x.Source_Exception_No) === text(exc.Exception_No), { criteria: q('Source_Exception_No', exc.Exception_No) })) {
    for (const row of rr.Replacement_Summary || []) made.add(`${text(row.SKU)}||${text(rr.Source_Type)}`);
  }
  let created = 0;
  for (const g of groups(exc)) {
    const sourceType = sourceTypeOf(exc, g);
    if (made.has(`${g.sku}||${sourceType}`)) continue;
    await store.addRecord('Replacement_Request', {
      RR_No: await nextNumber(store, 'Replacement_Request', 'RR_No', 'RR'), RR_Date: today(), RR_Status: 'Open', Source_Type: sourceType, Source_Exception_No: exc.Exception_No,
      Last_Updated: today(), RR_Supplier: g.supplier, RR_SKU: g.sku, RR_Item_Name: g.item, RR_Qty_Value: g.qty, RR_PR_No: exc.Receiving_Line_ID,
      RR_Item_to_Replace: g.spareType, RR_Damage_Qty: g.qty, RR_Spare_Parts: g.spairs, Replacement_Summary: [summaryRow(exc, g)],
    }, ctx.user);
    made.add(`${g.sku}||${sourceType}`);
    created++;
    // the original PO remembers which SKUs are missing / damaged
    for (const po of await store.find('Purchase_Order', (p) => text(p.PO_No) === text(exc.PO_No), { criteria: q('PO_No', exc.PO_No) })) {
      await store.updateRecord('Purchase_Order', po.ID, sourceType === 'Receiving Missing' ? { Missing_SKUs: g.sku } : { Damage_SKUs: g.sku }, { byForm: true });
    }
  }
  if (created > 0) await store.updateRecord('Exceptions', exc.ID, { Exception_Status: 'Under Review' }, { byForm: true });
  return { status: 'success', created, message: created > 0 ? `${created} RR(s) created.` : 'No new RR needed — every item already has one.' };
}

// ---------------- createRRTony / createRRFenteng ----------------
const SUPPLIER = {
  Tony: { name: 'Tony', form: 'Tony_Fan_Replacement_Request', po: 'Tony_Fan_Purchase_Order', sfx: '_Supplier2' },
  Fenteng: { name: 'Fenteng', form: 'Fenteng_Lighting_Replacement_Request', po: 'Fenteng_Lighting_Purchase_Order', sfx: '_Supplier1' },
};

export async function createRRSupplier(key, { exceptionId }, store, ctx = {}) {
  const S = SUPPLIER[key];
  const exc = await exceptionOf(store, exceptionId);
  if (!exc) return fail('Exception not found.');
  const made = new Set();
  for (const rr of await store.find(S.form, (x) => text(x.Source_Exception_No) === text(exc.Exception_No), { criteria: q('Source_Exception_No', exc.Exception_No) })) {
    for (const row of rr.Replacement_Summary || []) made.add(`${text(row.SKU)}||${text(rr.Source_Type)}`);
  }
  const parents = await store.find('Replacement_Request', (x) => text(x.Source_Exception_No) === text(exc.Exception_No), { criteria: q('Source_Exception_No', exc.Exception_No) });
  let created = 0;
  for (const g of groups(exc, text(exc.RR_Supplier_Override).trim())) {
    if (!text(g.supplier).includes(S.name)) continue;
    const sourceType = sourceTypeOf(exc, g);
    if (made.has(`${g.sku}||${sourceType}`)) continue;
    let parentNo = '', parentSupplier = '';
    for (const p of parents) {
      if (text(p.Source_Type) !== sourceType) continue;
      if ((p.Replacement_Summary || []).some((row) => text(row.SKU) === g.sku)) { parentNo = text(p.RR_No); parentSupplier = text(p.RR_Supplier); }
    }
    // a supplier's copy never disagrees with its parent RR about who the supplier is (a blank parent supplier is allowed: older RRs have none)
    if (parentNo !== '' && parentSupplier.trim() !== '' && !parentSupplier.includes(S.name)) continue;
    if (parentNo === '') continue;
    await store.addRecord(S.form, {
      RR_No: parentNo, RR_Date: today(), RR_Status: 'Open', Source_Type: sourceType, Source_Exception_No: exc.Exception_No, Last_Updated: today(),
      RR_Item_to_Replace: g.spareType, RR_Damage_Qty: g.qty, RR_Spare_Parts: g.spairs, Replacement_Summary: [summaryRow(exc, g)],
    }, ctx.user);
    made.add(`${g.sku}||${sourceType}`);
    created++;
    for (const po of await store.find(S.po, (p) => text(p[`PO_No${S.sfx}`]) === text(exc.PO_No), { criteria: q(`PO_No${S.sfx}`, exc.PO_No) })) {
      await store.updateRecord(S.po, po.ID, sourceType === 'Receiving Missing' ? { [`Missing_SKUs${S.sfx}`]: g.sku } : { [`Damage_SKUs${S.sfx}`]: g.sku }, { byForm: true });
    }
  }
  return { status: 'success', created, message: `${created} ${S.name} RR(s) created` };
}

export const create_rr_main = (p, s, c) => createRRMain(p || {}, s, c);
export const create_rr_tony = (p, s, c) => createRRSupplier('Tony', p || {}, s, c);
export const create_rr_fenteng = (p, s, c) => createRRSupplier('Fenteng', p || {}, s, c);
