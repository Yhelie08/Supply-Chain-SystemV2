// Inquiry_Form workflows, ported from zoho-export/parsed/workflows/form/Inquiry_Form/*.dg.
// Only the events that run when a record is written through the API are here (on validate = before,
// on success = after). Skipped on purpose: INQ_Load_Unit_Choices, INQ_Default_All_Suppliers,
// Disable_Supplier_Quotes_L (on load), INQ_AutoFill_Customer_Type / _Item_Details / _Project_Name and
// Selected_Uncheck_Others (on user input), Notify_Suppliers_on_Inquiry (inactive), Log_Updated_Item (no script).
//
// Order of the hooks follows the order of the workflows in the Zoho app.
import { register } from '../../workflows/index.mjs';
import { zohoNow } from '../../criteria.mjs';
import { idOf, idsOf, unbracket, truthy, blank, toNum, hasValue, sameValue, lower, inquiryNumber, round2, lit, stamp } from '../../workflows/deluge.mjs';
import { SUPPLIERS, supplierIndex, quoteBooksId } from '../../workflows/suppliers.mjs';

export { SUPPLIERS };

// ----- lookups -----
async function projectCode(store, projects) {
  const id = idOf(projects);
  if (!id) return null;
  try { return (await store.getRecordById('Projects', id, { raw: true })).Project_Code ?? null; } catch { return null; }
}

// ----- the supplier-tag <-> quote-row bookkeeping shared by the validate scripts -----
// Adds a "Not Selected" row for every tagged supplier that has no row yet (matched by ID first, then by name).
function addMissingQuoteRows(rows, tagged) {
  const ids = new Set(rows.map((r) => unbracket(r.Supplier_ID)).filter(Boolean));
  const names = new Set(rows.map((r) => lower(r.Suppliers)));
  for (const t of tagged) {
    if (ids.has(t.id) || names.has(t.nameKey)) continue;
    rows.push({ Suppliers: t.name, Supplier_ID: `[${t.id}]`, Stage: 'Not Selected' });
    ids.add(t.id);
    names.add(t.nameKey);
  }
}
const taggedSuppliers = (suppliers, supplierField) => idsOf(supplierField).map((id) => {
  const name = suppliers.get(id)?.name ?? '';
  return { id, name, nameKey: lower(name) };
});

// ===== INQ_Auto_Populate_Supplier_Quotes (on add, on validate) =====
// The Zoho script also computed INQ_No from the highest existing number; INQ_Generate_Number overwrites it
// from INQ_Seq right after the save, so only the parts that survive are kept here.
async function populateQuotes({ input, store }) {
  const suppliers = await supplierIndex(store);
  input.quote_group = (await projectCode(store, input.Projects)) ?? '';
  const tagged = taggedSuppliers(suppliers, input.Suppliers);
  const rows = (input.Supplier_Quotes || []).map((r) => ({ ...r }));
  addMissingQuoteRows(rows, tagged);
  input.Supplier_Quotes = rows;
  input.Supplier_Quotes_Last_Edited = [...(input.Supplier_Quotes_Last_Edited || []), ...tagged.map((t) => ({ Suppliers_Last_Edited: t.name }))];
}

// ===== INQ_Check_Readiness (on add or edit, on validate) =====
// `input` is what the widget sends; on an edit that is only the changed fields, so the whole record is
// rebuilt from the saved one first (Zoho's input is always the whole record). The computed fields are
// written back into `input`.
// Kept as in Zoho: step G reads Collateral_Comple_NA before step H recomputes it, and the project roll-up
// reads the inquiries as they are in the database, before this save.
async function checkReadiness({ input, previous, store }) {
  const suppliers = await supplierIndex(store);
  const rec = { ...(previous || {}), ...input };
  const quotesBefore = JSON.stringify(rec.Supplier_Quotes || []);
  const rows = (rec.Supplier_Quotes || []).map((r) => ({ ...r }));
  const out = {};
  const set = (k, v) => { rec[k] = v; out[k] = v; };
  const projectId = idOf(rec.Projects);

  // Step 0: backfill quote_group
  if (rec.quote_group == null || (rec.quote_group === '' && projectId)) set('quote_group', (await projectCode(store, projectId)) ?? '');

  // Steps A-C: tags removed -> Declined; tags added -> new row
  const tagged = taggedSuppliers(suppliers, rec.Suppliers);
  const taggedIds = new Set(tagged.map((t) => t.id));
  const taggedNames = new Set(tagged.map((t) => t.nameKey));
  for (const qr of rows) {
    const rowId = unbracket(qr.Supplier_ID);
    if (!((rowId && taggedIds.has(rowId)) || taggedNames.has(lower(qr.Suppliers)))) qr.Stage = 'Declined';
  }
  addMissingQuoteRows(rows, tagged);

  // Step D: the selected supplier wins, the others are declined (and restored if the selection is removed)
  const winners = rows.filter((qr) => truthy(qr.Selected));
  const winner = winners.at(-1);
  const restore = (qr) => { if (qr.Stage === 'Declined' && !blank(qr.Prev_Stage)) { qr.Stage = qr.Prev_Stage; qr.Prev_Stage = ''; } };
  if (winner) {
    for (const qr of rows) {
      if (qr.Suppliers === winner.Suppliers) restore(qr);
      else { if (qr.Stage !== 'Declined') qr.Prev_Stage = qr.Stage; qr.Stage = 'Declined'; qr.Selected = false; }
    }
    set('Select_Final_Cost', winner.Final_Price);
  } else {
    rows.forEach(restore);
    set('Select_Final_Cost', 0);
  }

  // Step E: checklist
  set('Supplier_Selected', !!winner);
  set('Availability', !!winner && !blank(winner.Availability));
  set('Final_Price_Exists', toNum(rec.Select_Final_Cost) > 0 || toNum(rec.SRP_Approved1) > 0);
  set('SRP_Approved', rec.SRP_Status === 'Approved');

  // Step F: margin
  const srp = toNum(rec.SRP_Approved1);
  set('Margin', srp > 0 ? round2(((srp - toNum(rec.Select_Final_Cost)) / srp) * 100) : 0);

  // Step G: ready for estimate (uses the collateral flag as it was before this save)
  set('Ready_for_Estimates', !!(rec.Supplier_Selected && rec.Availability && rec.Final_Price_Exists && rec.SRP_Approved && truthy(rec.Collateral_Comple_NA)));

  // Step H: collateral complete or N/A
  set('Collateral_Comple_NA', [rec.Product_Sample, rec.D_Image, rec.Specification, rec.Technical_Drawing].every((v) => v === 'Completed' || v === 'N/A'));

  // Roll up onto the project: are all its inquiries SRP-approved?
  if (projectId) {
    const related = await store.getRecords('Inquiry_Form', { criteria: `Projects == ${lit(projectId)}`, pageSize: 1000 });
    const allApproved = related.every((r) => r.SRP_Status === 'Approved');
    try { await store.updateRecord('Projects', projectId, { All_SRP_Approved: allApproved }, { byForm: true }); } catch { /* project was deleted */ }
  }

  Object.assign(input, out);
  if (JSON.stringify(rows) !== quotesBefore) input.Supplier_Quotes = rows;
}

// ===== Stage_Inquiry_Changed #1 (on add or edit, on success): the stage of each quote row from its prices =====
async function stageRows({ id, record, store }) {
  const rows = record.Supplier_Quotes || [];
  let changed = false;
  const next = rows.map((sq) => {
    const nego = hasValue(sq.Negotiated);
    const final = hasValue(sq.Final_Price);
    const stage = nego && final ? 'Final' : nego || final ? 'Negotiating' : 'Not Selected';
    if (sq.Stage !== stage) changed = true;
    return { ...sq, Stage: stage };
  });
  if (!changed) return;
  await store.updateRecord('Inquiry_Form', id, { Supplier_Quotes: next }, { byForm: true });
  record.Supplier_Quotes = next;
}

// ===== Supplier_Populate_From_INQ (on add, on success): a copy of the inquiry for each supplier that was asked =====
async function populateSuppliers({ record, store, user }) {
  const suppliers = await supplierIndex(store);
  const items = idOf(record.Items) ? await store.getRecordById('Items', idOf(record.Items), { raw: true }).catch(() => null) : null;
  const number = inquiryNumber(record.INQ_Seq);
  const quotes = record.Supplier_Quotes || [];
  const attachments = String(record.Attachments ?? '');
  for (const s of SUPPLIERS) {
    const mine = quotes.filter((q) => quoteBooksId(q, suppliers) === s.booksId);
    if (!mine.length) continue;
    const copy = {
      INQ_No_Supplier: number, SKU_Supplier: record.sku, Target_Date_Supplier: record.target_date, Items_Supplier: record.Items,
      Quantity_Supplier: record.quantity, Unit_Supplier: record.unit, Description_Supplier: record.description,
      Date_Created_Supplier: record.created_date, Open_to_similar_design_Supplier: record.Open_to_similar_design,
      Additional_Description_Supplier: record.Addtional_Description, Response_Status: 'Waiting', edit_counter: 1,
      Supplier_quotes: mine.map((q) => ({
        SupplierName: q.Suppliers, Availability_Supplier: q.Availability, Initial_Price_Supplier: q.Initial_Price,
        Negotiated_Supplier: q.Negotiated, Final_Price_Supplier: q.Final_Price, Lead_Time_Supplier: q.Lead_Time,
        Stage_Supplier: q.Stage, Selected_Supplier: q.Selected,
      })),
    };
    if (!blank(items?.Image)) copy[s.imageField] = items.Image;
    if (attachments !== '' && attachments !== '[]') copy.Image_from_Inq = record.Attachments;
    const newId = await store.addRecord(s.form, copy, user);

    const token = `INQ-${newId}-${stamp()}`;
    await store.addRecord(s.notifications, {
      Recipient_Email: process.env[s.emailEnv] || '',
      Notification_Type: 'New Inquiry added',
      Message: `A new inquiry ${number} was added.`,
      Created_On: zohoNow(), Read: false,
      Target_URL: `${process.env.APP_BASE_URL || ''}/#Page:${s.page}?${s.param}=${token}`,
      Source_Record_No: number, Source_Record_ID: newId, Deep_Link_Token: token,
    }, user);
  }
}

// ===== Stage_Inquiry_Changed #2 and #3 (on add or edit, on success): keep each supplier's copy in step =====
const FREE_CHOICES = new Set(['Required', 'HideToSupplier']);
const fuzzyMatch = (a, b) => { const x = lower(a), y = lower(b); return x.includes(y) || y.includes(x); };

async function syncSuppliers({ record, store }) {
  const suppliers = await supplierIndex(store);
  const quotes = record.Supplier_Quotes || [];
  const items = idOf(record.Items) ? await store.getRecordById('Items', idOf(record.Items), { raw: true }).catch(() => null) : null;
  const attachments = String(record.Attachments ?? '');
  for (const s of SUPPLIERS) {
    const copies = await store.find(s.form, (r) => r.INQ_No_Supplier === record.INQ_No);
    for (const r of copies) {
      const patch = { Dimension_Supplier: record.Dimension, Color_Body_Supplier: record.Color_Body, Voltage_Supplier: record.Voltage, Lumens_Supplier: record.Lumens,
        Color_Temperature_Supplier: record.Color_Temperature, Type_of_Bulb_Supplier: record.Type_of_Bulb };
      if (r.Response_Status !== 'Completed') {
        const mine = quotes.map((q) => {
          const byName = lower(q.Suppliers).includes(s.nameToken);
          return { q, mine: byName || quoteBooksId(q, suppliers) === s.booksId };
        });
        const anySelected = quotes.some((q) => truthy(q.Selected));
        const thisSelected = mine.some((m) => m.mine && truthy(m.q.Selected));
        const copyRows = r.Supplier_quotes || [];
        const matches = (sq) => quotes.filter((q) => !blank(q.Suppliers) && fuzzyMatch(q.Suppliers, sq.SupplierName));
        const hasChanges = copyRows.some((sq) => matches(sq).some((q) => !sameValue(sq.Availability_Supplier, q.Availability) || !sameValue(sq.Initial_Price_Supplier, q.Initial_Price)
          || !sameValue(sq.Negotiated_Supplier, q.Negotiated) || !sameValue(sq.Final_Price_Supplier, q.Final_Price) || !sameValue(sq.Lead_Time_Supplier, q.Lead_Time)));
        let status = r.Response_Status;
        let counter = blank(r.edit_counter) ? 0 : Number(r.edit_counter);
        if (hasChanges) { counter = 1; status = 'Submit Response'; }
        if (anySelected) status = 'Not Selected';
        if (thisSelected) { status = 'Selected'; counter = 1; }
        patch.Response_Status = status;
        patch.edit_counter = counter;
        patch.Supplier_quotes = copyRows.map((sq) => {
          const row = { ...sq };
          for (const q of matches(sq)) {
            Object.assign(row, { Availability_Supplier: q.Availability, Initial_Price_Supplier: q.Initial_Price, Negotiated_Supplier: q.Negotiated,
              Final_Price_Supplier: q.Final_Price, Lead_Time_Supplier: q.Lead_Time, Stage_Supplier: q.Stage, Selected_Supplier: q.Selected });
          }
          return row;
        });
        const keep = (current, incoming) => (FREE_CHOICES.has(incoming) ? current : incoming);
        Object.assign(patch, {
          SKU_Supplier: record.sku, Target_Date_Supplier: record.target_date, Quantity_Supplier: record.quantity, Description_Supplier: record.description,
          Open_to_similar_design_Supplier: record.Open_to_similar_design, Additional_Description_Supplier: record.Addtional_Description,
          Product_Sample_Supplier: keep(r.Product_Sample_Supplier, record.Product_Sample), D_Image_Supplier: keep(r.D_Image_Supplier, record.D_Image),
          Specification_Supplier: keep(r.Specification_Supplier, record.Specification), Technical_Drawing_Supplier: keep(r.Technical_Drawing_Supplier, record.Technical_Drawing),
          Specification_Details_Supplier: record.Specification_Details,
        });
        if (!blank(items?.Image)) patch[s.imageField] = items.Image;
        if (attachments !== '' && attachments !== '[]') patch.Image_from_Inq = record.Attachments;
      }
      await store.updateRecord(s.form, r.ID, patch, { byForm: true });
    }
  }
}

// ===== Stage_Supplier_Changed (Supplier_1/Supplier_2, on edit, on success): push the supplier's
// own submitted quote back up into the matching Inquiry's Supplier_Quotes row, plus the
// collateral/hide-flag fields the native app also pushed up here. Never ported before now — its
// absence meant a supplier's real Submit Response never reached the buyer's own Inquiry Detail
// view at all (confirmed live: Supplier_2's own row had real Initial_Price_Supplier/Availability_
// Supplier saved, but Inquiry_Form's Supplier_Quotes stayed empty forever). Mirrors
// PASTE_Stage_Supplier_Changed_Production.txt exactly: matched by this supplier's real Books
// vendor id (via the Supplier_Quotes row's own Supplier_ID -> Suppliers table lookup), not by name. =====
async function syncBackToInquiry({ s, record, store }) {
  const inqNo = record.INQ_No_Supplier;
  if (blank(inqNo)) return;
  const suppliers = await supplierIndex(store);
  const quoteRow = (record.Supplier_quotes || [])[0];
  if (!quoteRow) return;
  for (const inq of await store.find('Inquiry_Form', (r) => r.INQ_No === inqNo)) {
    const quotes = (inq.Supplier_Quotes || []).map((q) => {
      if (quoteBooksId(q, suppliers) !== s.booksId) return q;
      return {
        ...q, Availability: quoteRow.Availability_Supplier, Initial_Price: quoteRow.Initial_Price_Supplier,
        Negotiated: quoteRow.Negotiated_Supplier, Final_Price: quoteRow.Final_Price_Supplier, Lead_Time: quoteRow.Lead_Time_Supplier,
      };
    });
    const patch = { Supplier_Quotes: quotes };
    if (inq.Product_Sample !== 'HideToSupplier') patch.Product_Sample = record.Product_Sample_Supplier;
    if (inq.D_Image !== 'HideToSupplier') patch.D_Image = record.D_Image_Supplier;
    if (inq.Specification !== 'HideToSupplier') { patch.Specification = record.Specification_Supplier; patch.Specification_Details = record.Specification_Details_Supplier; }
    if (inq.Technical_Drawing !== 'HideToSupplier') patch.Technical_Drawing = record.Technical_Drawing_Supplier;
    await store.updateRecord('Inquiry_Form', inq.ID, patch, { byForm: true });
  }
}

// ===== Item_Image_Create_Update and INQ_AutoFill_Product_Image (on add or edit, on success) =====
async function productImage({ id, record, store }) {
  const patch = {};
  if (!blank(record.sku)) {
    const [bySku] = await store.getRecords('Items', { criteria: `SKU == ${lit(record.sku)}`, pageSize: 1 });
    if (bySku) patch.Product_Image = bySku.Image;
  }
  const current = 'Product_Image' in patch ? patch.Product_Image : record.Product_Image;
  const empty = (v) => { const s = String(v ?? ''); return s === '' || s === '{}' || s === '[]'; };
  if (empty(current) && idOf(record.Items)) {
    const item = await store.getRecordById('Items', idOf(record.Items), { raw: true }).catch(() => null);
    if (!blank(item?.Image)) patch.Product_Image = item.Image;
  }
  if ('Product_Image' in patch && patch.Product_Image !== record.Product_Image) await store.updateRecord('Inquiry_Form', id, patch, { byForm: true });
}

// ===== INQ_Generate_Number (on add, on success) =====
async function generateNumber({ id, record, store }) {
  const number = inquiryNumber(record.INQ_Seq);
  if (record.INQ_No !== number) await store.updateRecord('Inquiry_Form', id, { INQ_No: number }, { byForm: true });
}

// ===== Delete_Item_On_Supplier (on delete, on success): the suppliers' copies go with the inquiry =====
async function deleteSupplierCopies({ previous, store }) {
  for (const s of SUPPLIERS) {
    for (const r of await store.find(s.form, (x) => x.INQ_No_Supplier === previous.INQ_No)) await store.deleteRecord(s.form, r.ID);
  }
}

register('Inquiry_Form', {
  beforeAdd: [populateQuotes, checkReadiness],
  beforeUpdate: [checkReadiness],
  afterAdd: [populateSuppliers, stageRows, syncSuppliers, productImage, generateNumber],
  afterUpdate: [stageRows, syncSuppliers, productImage],
  afterDelete: [deleteSupplierCopies],
});

for (const s of SUPPLIERS) {
  register(s.form, { afterUpdate: [(args) => syncBackToInquiry({ s, ...args })] });
}
