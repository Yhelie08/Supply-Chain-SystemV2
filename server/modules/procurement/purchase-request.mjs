// Purchase_Request1 workflows, ported from zoho-export/parsed/workflows/form/Purchase_Request1/*.dg.
// Only the events that run on API writes are here (on validate = before, on success = after).
// Skipped on purpose: PR_AutoFill_Item_Details, autofill_customer_type, Select_Unselect_Supplier (on user input),
// PR_Lock_UI_Fields (on load), Notify_on_Purchase_Request (inactive).
// PR1_Forecast_Stamp (the forecast of a PR) lives in server/forecast/pr-hooks.mjs, imported by this module's workflows.mjs.
//
// All the "on validate" scripts share Zoho's one `input`, and each reads what the one before it wrote, so they run as
// steps of one function in the order of the workflows in Zoho. Quirks are kept: for example the readiness check runs
// before the default status and the shipment mode are set, so it sees them as they were before this save.
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { idOf, truthy, blank, toNum, sameValue, lower, round2, lit, parseDate, ymd, addDays, dayDiff, todayDate } from '../../workflows/deluge.mjs';
import { SUPPLIERS, supplierIndex, quoteBooksId } from '../../workflows/suppliers.mjs';

const text = (v) => (blank(v) ? '' : String(v));
const num = (v) => (blank(v) ? null : Number(v));
// The pieces that differ per supplier portal copy: Tony's fields end in _Supplier2, Fenteng's in _Supplier1.
const COPIES = SUPPLIERS.map((s) => ({ ...s, sfx: `_Supplier${s.n}` }));

// ===== on validate: everything the Zoho scripts compute before the save =====
async function validate({ input, previous, store }) {
  const adding = !previous;
  const rec = { ...(previous || {}), ...input };
  const out = {};
  const set = (k, v) => { rec[k] = v; out[k] = v; };
  const today = todayDate();
  const suppliers = await supplierIndex(store);
  const lbBefore = JSON.stringify(rec.Supplier_Load_Balancing || []);
  const selBefore = JSON.stringify(rec.Supplier_Selected || []);
  const lb = (rec.Supplier_Load_Balancing || []).map((r) => ({ ...r }));
  const sel = (rec.Supplier_Selected || []).map((r) => ({ ...r }));

  // --- PR_Generate_Number (on add): the next number after the highest existing one ---
  if (adding) {
    let max = 0;
    for (const r of await store.find('Purchase_Request1')) {
      const n = Number(String(r.PR_No ?? '').replace(/[^0-9]/g, ''));
      if (n > max) max = n;
    }
    set('PR_No', `PR-${String(max + 1).padStart(5, '0')}`);
  }

  // --- PR_Sync_Supplier_Load_Bal: which suppliers can do this category, their load, and the recommended one ---
  const category = text(rec.category);
  const eligible = [];
  for (const s of suppliers.values()) {
    const raw = s.categories;
    const cats = Array.isArray(raw) ? raw : typeof raw === 'string' && raw !== '' ? (raw.replace(/\r/g, '').includes('\n') ? raw.replace(/\r/g, '').split('\n') : raw.split(',')) : [];
    if (s.handlesAll || cats.some((c) => String(c).trim() === category)) eligible.push(s.id);
  }
  const rowSupplier = (r) => idOf(r.Suppliers);
  for (const r of lb) if (!eligible.includes(rowSupplier(r))) { r.Match_Category = 'Not Match'; r.Eligible_Supplier = 'Removed'; }
  for (const id of eligible) {
    if (!lb.some((r) => rowSupplier(r) === id)) {
      const name = suppliers.get(id).displayName;
      lb.push({ Suppliers: { ID: id, display_value: name, zc_display_value: name }, Match_Category: 'Match' });
    }
  }
  // Live load per supplier: line items on purchase orders that are not Completed or Cancelled
  const liveByName = new Map();
  const activePos = await store.getRecords('Purchase_Order', { criteria: 'PO_Status != "Completed" && PO_Status != "Cancelled"', pageSize: 1000 });
  for (const po of activePos) for (const line of po.PO_Line_Items || []) liveByName.set(line.Supplier, (liveByName.get(line.Supplier) || 0) + 1);
  // Recommended: lowest price (negotiated, else initial), then the shortest lead time among equal prices
  let recommended = '';
  let bestPrice = -1;
  let bestLead = -1;
  for (const id of eligible) {
    const nm = suppliers.get(id).displayName;
    let price = -1;
    let lead = -1;
    for (const q of sel) {
      const who = text(q.Suppliers);
      if (who === nm || who.includes(nm)) {
        if (!blank(q.Negotiated) && Number(q.Negotiated) > 0) price = Number(q.Negotiated);
        else if (!blank(q.Initial_Price) && Number(q.Initial_Price) > 0) price = Number(q.Initial_Price);
        lead = num(q.Lead_Time);
      }
    }
    if (price >= 0) {
      if (bestPrice === -1 || price < bestPrice) { bestPrice = price; bestLead = lead; recommended = id; }
      else if (price === bestPrice && ((lead != null && bestLead === -1) || lead < bestLead)) { bestLead = lead; recommended = id; }
    }
  }
  for (const r of lb) {
    const id = rowSupplier(r);
    if (!eligible.includes(id)) continue;
    const live = liveByName.get(suppliers.get(id).displayName) || 0;
    const cap = toNum(suppliers.get(id).maxCapacity);
    const pct = cap > 0 ? (live * 100) / cap : 0;
    // Numbers in subform rows are kept as text with Zoho's two decimals, as the rows exported from Zoho have them
    Object.assign(r, { Match_Category: 'Match', Active_POs: String(live), Percent: round2(pct).toFixed(2), Load_Status: pct >= 100 ? 'Overloaded' : pct >= 80 ? 'Near Capacity' : 'Normal', Eligible_Supplier: id === recommended ? 'Recommended' : 'Available' });
  }

  // --- PR_Sync_Supplier_Selected: one row per matched supplier, one winner, copied up to the PR ---
  if (rec.Sourcing_Type === 'Local') {
    set('Selected_Supplier', 'HC System');
    set('Required_Days_Lead', 0);
  } else {
    const matched = [];
    for (const r of lb) if (r.Match_Category === 'Match' && !matched.includes(rowSupplier(r))) matched.push(rowSupplier(r));
    const existing = [];
    for (const r of sel) {
      const id = text(r.Supplier_ID);
      existing.push(id);
      if (!matched.includes(id)) { r.Status = 'Removed'; r.Selected = false; } else r.Status = 'Active';
    }
    for (const id of matched) {
      if (!existing.includes(id)) sel.push({ Supplier_ID: id, Suppliers: suppliers.get(id)?.displayName ?? '', Status: 'Active', Selected: false });
    }
    const first = sel.findIndex((r) => truthy(r.Selected));
    if (first >= 0) sel.forEach((r, i) => { if (i !== first) r.Selected = false; });
    const winner = sel.filter((r) => truthy(r.Selected)).at(-1);
    if (winner) {
      set('Selected_Supplier', winner.Suppliers);
      if (toNum(winner.Final_Price) > 0) set('Selcted_Final_Cost', toNum(winner.Final_Price));
      set('Required_Days_Lead', toNum(winner.Lead_Time));
    } else {
      set('Selected_Supplier', '');
      set('Selcted_Final_Cost', 0);
      set('Required_Days_Lead', 0);
      set('Followed_Recommendation', '');
    }
  }

  // --- PR_Check_Readiness: the four conditions and their AND ---
  set('Selected_Supplier1', !blank(rec.Selected_Supplier));
  let hasPrice = false;
  if (!blank(rec.SRP_Approved_PR) && toNum(rec.SRP_Approved_PR) !== 0) hasPrice = true;
  else if (!blank(rec.SRP_Rate_PR) && toNum(rec.SRP_Rate_PR) !== 0) hasPrice = true;
  else if (!blank(rec.inquiry_reference)) hasPrice = true;
  else {
    const [item] = blank(rec.sku) ? [] : await store.getRecords('Items', { criteria: `SKU == ${lit(rec.sku)}`, pageSize: 1 });
    hasPrice = toNum(item?.Rate) !== 0 || toNum(rec.Selcted_Final_Cost) > 0;
  }
  set('Final_price_confirmed', hasPrice);
  set('Shipping_mode_selected', rec.Sourcing_Type === 'Local' || !blank(rec.Shipment_Mode));
  set('Target_date_exists', !blank(rec.Target_Delivery));
  set('PR_READY_FOR_PO', rec.Selected_Supplier1 && rec.Final_price_confirmed && rec.Shipping_mode_selected && rec.Target_date_exists);

  // --- PR_Set_Default_Status ---
  set('PR_Status', blank(rec.Link_PO_No) ? 'Open' : 'Converted to PO');

  // --- PR_Lock_After_PO: a PR that became a PO may not change its commercial terms ---
  if (rec.PR_Status === 'Converted to PO' && previous?.PR_Status === 'Converted to PO') {
    const snapshot = (rows) => new Map((rows || []).map((r) => [text(r.Supplier_ID), `${truthy(r.Selected)}|${toNum(r.Final_Price)}|${text(r.Status)}|${text(r.Suppliers)}`]));
    const was = snapshot(previous.Supplier_Selected);
    const now = snapshot(sel);
    const changed = ['quantity', 'Selected_Supplier', 'Shipment_Mode', 'Target_Delivery', 'Selcted_Final_Cost', 'Production_Date'].some((k) => !sameValue(rec[k], previous[k]))
      || was.size !== now.size || [...now].some(([id, snap]) => was.get(id) !== snap);
    if (changed) throw new ZohoError(2001, 'Warning: this PR is already locked because it has been converted to a PO. The Qty, Supplier, Shipping Mode, Target Date, Final Cost, or Production Date should not be changed. Please revert the changes before saving.');
  }

  // --- PR_Export_Selected_Supplier (on edit only): the selected row's supplier and lead time onto the PR.
  // (The Zoho script also assigns the final price to a variable it never uses, so that part does nothing.) ---
  if (!adding) {
    for (const r of sel) if (truthy(r.Selected)) { set('Selected_Supplier', r.Suppliers); set('Required_Days_Lead', r.Lead_Time); }
  }

  // --- PR_Compute_Shipment_Timeline ---
  let production = null;
  if (rec.PR_Status === 'Converted to PO') production = parseDate(rec.Production_Date);
  else { production = today; set('Production_Date', ymd(today)); }
  if (production) {
    const shipDays = rec.Sourcing_Type === 'Local' ? 0 : rec.Shipment_Mode === 'LCL' || rec.Shipment_Mode === 'FCL' ? 30 : 14;
    const productionEnd = addDays(production, toNum(rec.Required_Days_Lead));
    const target = addDays(productionEnd, shipDays);
    const current = today > productionEnd ? target : productionEnd;
    set('Remaining_Days', dayDiff(current, today));
    // Zoho reads `input.Supplier_Target_Date` here, which this port takes to be the field supplier_target_date as saved before this save.
    const supplierTarget = parseDate(rec.supplier_target_date);
    set('Delay_Status', supplierTarget && today > supplierTarget ? 'Delayed' : rec.Remaining_Days <= 3 ? 'At Risk' : 'On Track');
  }

  // --- PR_Set_Shipment_Mode: supplier target date = target delivery - 4 days; LCL if 30+ days away, else airfreight ---
  const delivery = parseDate(rec.Target_Delivery);
  if (delivery) set('supplier_target_date', ymd(addDays(delivery, -4)));
  if (rec.PR_Status !== 'Converted to PO') {
    const target = parseDate(rec.supplier_target_date);
    if (target) {
      const far = dayDiff(target, today) >= 30;
      set('Shipment_Mode', far ? 'LCL' : 'Airfreight');
      set('Shipment_Days', far ? 30 : 14);
    }
  }

  // --- PR_Compute_Priority ---
  let score = 0;
  if (delivery) {
    const days = dayDiff(delivery, today);
    if (days <= 3) score += 50; else if (days <= 7) score += 30; else if (days <= 14) score += 15;
  }
  if (toNum(rec.Order_Value) >= 500000) score += 20;
  const lastUpdate = parseDate(rec.Last_Update);
  if (lastUpdate && dayDiff(today, lastUpdate) > 5) score += 20;
  set('Priority', score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low');
  set('Priority_Score', score);

  Object.assign(input, out);
  if (JSON.stringify(lb) !== lbBefore) input.Supplier_Load_Balancing = lb;
  if (JSON.stringify(sel) !== selBefore) input.Supplier_Selected = sel;
}

// ===== PR_Populate_From_PR (on add, on success): a copy for each supplier portal that should quote =====
async function populateCopies({ record, store, user }) {
  if (record.Source === 'SO' || record.Sourcing_Type === 'Local') return;
  const suppliers = await supplierIndex(store);
  const inqNo = record.inquiry_reference;
  const route = { tony: true, fenteng: true };
  const quote = {};
  if (!blank(inqNo)) {
    // Linked to an inquiry: only the supplier whose quote was selected there; both if none was selected
    route.tony = route.fenteng = false;
    let anySelected = false;
    const [inq] = await store.find('Inquiry_Form', (r) => r.INQ_No === inqNo);
    for (const q of inq?.Supplier_Quotes || []) {
      if (!truthy(q.Selected)) continue;
      anySelected = true;
      for (const c of COPIES) if (quoteBooksId(q, suppliers) === c.booksId) { route[c.key] = true; quote[c.key] = q; }
    }
    if (!anySelected) route.tony = route.fenteng = true;
  }
  const item = idOf(record.Items) ? await store.getRecordById('Items', idOf(record.Items), { raw: true }).catch(() => null) : null;
  for (const c of COPIES) {
    if (!route[c.key]) continue;
    const q = quote[c.key];
    const copy = {
      [`PR_No${c.sfx}`]: record.PR_No, [`PR_Date${c.sfx}`]: record.PR_Date, [`Items${c.sfx}`]: record.Items, [`sku${c.sfx}`]: record.sku,
      [`quantity${c.sfx}`]: record.quantity, [`Description1${c.sfx}`]: record.Description1, [`description${c.sfx}`]: record.description,
      [`unit${c.sfx}`]: record.unit, [`category${c.sfx}`]: record.category, [`Target_Delivery${c.sfx}`]: record.Target_Delivery,
      [`Priority_PR${c.sfx}`]: record.Priority, [`SRP_Rate_PR${c.sfx}`]: record.SRP_Rate_PR, [`inquiry_reference${c.sfx}`]: inqNo,
      Response_Status: q ? 'Selected' : 'Waiting', edit_counter: 1,
      [`Supplier_Selected${c.sfx}`]: [q
        ? { [`Suppliers${c.sfx}`]: c.name, [`Availability${c.sfx}`]: q.Availability, [`Initial_Price${c.sfx}`]: q.Initial_Price, [`Negotiated${c.sfx}`]: q.Negotiated,
          [`Final_Price${c.sfx}`]: q.Final_Price, [`Lead_Time${c.sfx}`]: q.Lead_Time, [`Selected${c.sfx}`]: true }
        : { [`Suppliers${c.sfx}`]: c.name }],
    };
    if (!blank(item?.Image)) copy[`Product_Image${c.sfx}_PR`] = item.Image;
    await store.addRecord(c.prForm, copy, user);
  }
}

// ===== PR_Changed (on edit, on success): stamp Last_Update and bring each supplier's copy up to date =====
async function changedCopies({ id, record, store }) {
  await store.updateRecord('Purchase_Request1', id, { Last_Update: zohoNow() }, { byForm: true });
  const suppliers = await supplierIndex(store);
  const rows = record.Supplier_Selected || [];
  const anySelected = rows.some((r) => truthy(r.Selected));
  const [inq] = blank(record.inquiry_reference) ? [] : await store.find('Inquiry_Form', (r) => r.INQ_No === record.inquiry_reference);
  const item = idOf(record.Items) ? await store.getRecordById('Items', idOf(record.Items), { raw: true }).catch(() => null) : null;
  for (const c of COPIES) {
    for (const copy of await store.find(c.prForm, (r) => r[`PR_No${c.sfx}`] === record.PR_No)) {
      const hasChanges = !sameValue(copy[`sku${c.sfx}`], record.sku) || !sameValue(copy[`quantity${c.sfx}`], record.quantity)
        || !sameValue(copy[`Target_Delivery${c.sfx}`], record.Target_Delivery) || !sameValue(copy[`Description1${c.sfx}`], record.Description1);
      const thisSelected = rows.some((r) => truthy(r.Selected) && lower(r.Suppliers).includes(c.nameToken));
      const inquiryQuote = (inq?.Supplier_Quotes || []).find((q) => truthy(q.Selected) && quoteBooksId(q, suppliers) === c.booksId);
      let status = copy.Response_Status;
      let counter = blank(copy.edit_counter) ? 0 : Number(copy.edit_counter);
      if (hasChanges) { status = 'Submit Response'; counter = 1; }
      if (anySelected) { status = 'Not Selected'; counter = 0; }
      if (thisSelected || inquiryQuote) { status = 'Selected'; counter = 1; }
      const patch = {
        Response_Status: status, edit_counter: counter,
        [`PR_Date${c.sfx}`]: record.PR_Date, [`sku${c.sfx}`]: record.sku, [`quantity${c.sfx}`]: record.quantity, [`Description1${c.sfx}`]: record.Description1,
        [`description${c.sfx}`]: record.description, [`Target_Delivery${c.sfx}`]: record.Target_Delivery, [`SRP_Rate_PR${c.sfx}`]: record.SRP_Rate_PR,
        [`inquiry_reference${c.sfx}`]: record.inquiry_reference,
      };
      if (inquiryQuote) {
        patch[`Supplier_Selected${c.sfx}`] = (copy[`Supplier_Selected${c.sfx}`] || []).map((r) => ({
          ...r, [`Availability${c.sfx}`]: inquiryQuote.Availability, [`Initial_Price${c.sfx}`]: inquiryQuote.Initial_Price, [`Negotiated${c.sfx}`]: inquiryQuote.Negotiated,
          [`Final_Price${c.sfx}`]: inquiryQuote.Final_Price, [`Lead_Time${c.sfx}`]: inquiryQuote.Lead_Time, [`Selected${c.sfx}`]: true,
        }));
      }
      if (!blank(item?.Image)) patch[`Product_Image${c.sfx}_PR`] = item.Image;
      await store.updateRecord(c.prForm, copy.ID, patch, { byForm: true });
    }
  }
}

// ===== PR1_Sync_Own_Image (on add or edit, on success) =====
async function syncOwnImage({ id, record, store }) {
  const item = idOf(record.Items) ? await store.getRecordById('Items', idOf(record.Items), { raw: true }).catch(() => null) : null;
  if (!blank(item?.Image) && record.Product_Image_PR !== item.Image) await store.updateRecord('Purchase_Request1', id, { Product_Image_PR: item.Image }, { byForm: true });
}

// ===== PR_Deleted (on delete, on success): the suppliers' copies go with the PR =====
async function deleteCopies({ previous, store }) {
  for (const c of COPIES) {
    for (const copy of await store.find(c.prForm, (r) => r[`PR_No${c.sfx}`] === previous.PR_No)) await store.deleteRecord(c.prForm, copy.ID);
  }
}

register('Purchase_Request1', {
  beforeAdd: [validate],
  beforeUpdate: [validate],
  afterAdd: [populateCopies, syncOwnImage],
  afterUpdate: [changedCopies, syncOwnImage],
  afterDelete: [deleteCopies],
});

