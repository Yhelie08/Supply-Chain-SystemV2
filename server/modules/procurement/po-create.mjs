// "Create PO" (custom API approve_po_main), from the HomeCartel spec v1.4 (02 Procurement / 03 Purchase Order and Feasibility Gate):
//   PO-R4  one PO = one supplier = one mode: the ready PRs are grouped by supplier ID + mode (several Sales Orders can share a PO);
//          lines of another mode, or another supplier, go on their own PO. The supplier is found by ID (name, other name, or a careful
//          whole-word start), never by a part of a name (INQ-R6)
//   PO-R1  the feasibility gate: warn and suggest, do not block. A line that cannot arrive in time needs an option before anything is
//          written: A) air  B) propose a new target (goes to the Decisions list, the target changes only if it is accepted)  C) proceed
//   PO-R3  born_late, shortfall_days and a note on the PO; the born-late rate is read from these
//   DT-1   earliest Order Date and target on the PO; production planned start = PO date + 1 (was: the same day)
// Everything else is the port of approvePOMain (PRs of the same PR_No are never added twice; hold / cancelled / override rules unchanged).
// Not done here: the PO in Zoho Books when sent (PO-R6, on hold with the Books calls).
import { ok, fail } from '../../custom-api-helpers.mjs';
import { zohoNow } from '../../criteria.mjs';
import { blank, idOf, truthy, toNum, todayDate, ymd, addDays } from '../../workflows/deluge.mjs';
import { nextNumber } from './purchase-order.mjs';
import { loadSettings, feasibility, normMode, resolveSupplier, supplierDaysFrom } from './plan.mjs';
import { prepareItem } from './decisions-core.mjs';
import { logEvent } from './events.mjs';

const PO = 'Purchase_Order';
const PR = 'Purchase_Request1';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const today = () => ymd(todayDate());
const crit = (field, value) => `(${field} == "${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
const round0 = (v) => Math.round(toNum(v));
const CHOICES = ['air', 'move_target', 'proceed'];

async function byId(store, form, ref) {
  const id = idOf(ref);
  if (id === '') return null;
  try { return await store.getRecordById(form, id, { raw: true }); } catch { return null; }
}

export async function approvePOMain({ soNo, prNos, lateChoices } = {}, store, ctx = {}) {
  soNo = text(soNo);
  const wanted = (Array.isArray(prNos) ? prNos : []).map(text).filter(Boolean);
  if (soNo === '' && wanted.length === 0) return fail('soNo (or a list of PR numbers) is required.');
  const choices = lateChoices && typeof lateChoices === 'object' ? lateChoices : {};
  const ready = (p) => !truthy(p.PR_Approved) && truthy(p.PR_READY_FOR_PO);
  const found = soNo !== ''
    ? await store.find(PR, (p) => text(p.Sales_Order) === soNo && ready(p), { criteria: crit('Sales_Order', soNo) })
    : (await store.find(PR, (p) => wanted.includes(text(p.PR_No)) && ready(p)));

  let skipped = '';
  let eligible = [];
  for (const pr of found) {
    if (text(pr.Hold_Status) === 'On Hold' || text(pr.Hold_Status) === 'Cancelled') { skipped += `${pr.PR_No} (${pr.Hold_Status}), `; continue; }
    if (text(pr.Followed_Recommendation) === 'No' && text(pr.Override_Reason) === '') { skipped += `${pr.PR_No}, `; continue; }
    eligible.push(pr);
  }
  const label = soNo !== '' ? `SO ${soNo}` : wanted.join(', ');
  if (eligible.length === 0 && skipped === '') return { status: 'empty', message: `No eligible PRs found for ${label}` };

  const settings = await loadSettings(store);
  const supplierRows = await store.find('Suppliers');
  const evaluate = (pr) => feasibility({ ...settings, ...supplierDaysFrom(supplierRows, text(pr.Selected_Supplier)) },
    { poDate: todayDate(), productionDays: toNum(pr.Required_Days_Lead) > 0 ? toNum(pr.Required_Days_Lead) : null, mode: normMode(pr.Shipment_Mode), target: pr.Target_Delivery });

  // ---- the feasibility gate: nothing is written until every late line has an option ----
  const late = eligible.filter((pr) => !(['', null].includes(text(pr.Target_Delivery))) && evaluate(pr).feasibility === 'impossible');
  const pending = late.filter((pr) => !CHOICES.includes(choices[text(pr.PR_No)]));
  if (pending.length) {
    return {
      status: 'needs_choice', message: `${pending.length} line(s) cannot arrive in time for the customer's promise. Choose an option for each one, then create the PO.`,
      lines: late.map((pr) => { const f = evaluate(pr); return { pr_no: text(pr.PR_No), supplier: text(pr.Selected_Supplier), mode: normMode(pr.Shipment_Mode), target: text(pr.Target_Delivery), shortfall_days: f.shortfall_days, earliest_feasible_date: f.earliest_feasible_date, air_option: f.air_option ?? '', can_air: normMode(pr.Shipment_Mode) !== 'Airfreight', chosen: choices[text(pr.PR_No)] ?? '' }; }),
    };
  }
  const notes = [];
  const bornLate = new Map(); // PR_No -> shortfall left after the choice
  const gateLate = new Map(); // PR_No -> shortfall AT THE GATE, before any option (spec: born late = late when the PO is raised)
  for (let i = 0; i < eligible.length; i++) {
    const pr = eligible[i];
    const choice = choices[text(pr.PR_No)];
    if (!late.includes(pr)) continue;
    const before = evaluate(pr);
    if (choice === 'air') {
      await store.updateRecord(PR, pr.ID, { Shipment_Mode: 'Airfreight', Shipment_Days: 14 }, { byForm: true });
      eligible[i] = await store.getRecordById(PR, pr.ID, { raw: true });
    } else if (choice === 'move_target') {
      await prepareItem(store, settings, {
        kind: 'forecast_promise_change', recordType: 'pr', recordId: pr.ID, recordNo: pr.PR_No, options: ['accept_target', 'keep_target'], payload: { proposed_target: before.earliest_feasible_date, from: 'create_po' },
        summary: `${pr.PR_No}: it cannot arrive in time for ${text(pr.Target_Delivery)}. The earliest it can be delivered is ${before.earliest_feasible_date}. Accept that as the new target (and tell the customer), or keep the target.`,
      });
    }
    gateLate.set(text(pr.PR_No), before.shortfall_days);
    const after = evaluate(eligible[i]);
    const left = after.feasibility === 'impossible' ? after.shortfall_days : 0;
    if (left > 0) bornLate.set(text(pr.PR_No), left);
    notes.push(`${pr.PR_No}: ${before.shortfall_days} days late; chose ${choice === 'air' ? `air (${left > 0 ? `still ${left} days late` : 'on time'})` : choice === 'move_target' ? 'propose a new target' : 'proceed as is'}`);
  }

  // ---- group by supplier ID + mode ----
  const groups = new Map();
  const unmatched = new Set();
  for (const pr of eligible) {
    const name = text(pr.Selected_Supplier);
    const found2 = resolveSupplier(supplierRows, name);
    if (!found2 && name !== '') unmatched.add(name);
    const mode = text(pr.Shipment_Mode) === '' ? '' : normMode(pr.Shipment_Mode);
    const key = `${found2 ? found2.row.ID : `name:${name.toLowerCase()}`}|${mode}`;
    if (!groups.has(key)) groups.set(key, { name, row: found2?.row ?? null, mode, prs: [] });
    groups.get(key).prs.push(pr);
  }

  let approved = '';
  const created = [];
  for (const g of groups.values()) {
    // a PR that already has its line on a PO is only linked (nothing is made twice)
    const fresh = [];
    for (const pr of g.prs) {
      const [already] = await store.find(PO, (p) => (p.PO_Line_Items || []).some((ln) => text(ln.PR_No) === text(pr.PR_No)));
      if (already) {
        await store.updateRecord(PR, pr.ID, { PR_Status: 'Converted to PO', Link_PO_No: already.PO_No, PR_Approved: true }, { byForm: true });
        approved += `${pr.PR_No} -> ${already.PO_No}; `;
      } else fresh.push(pr);
    }
    if (fresh.length === 0) continue;

    const first = fresh[0];
    const customers = [];
    for (const pr of fresh) { const c = text((await byId(store, 'Customer', pr.Customer))?.customer_name); if (c && !customers.includes(c)) customers.push(c); }
    const [so] = await store.find('Sales_Order', (s) => text(s.Sales_Order_Number) === text(first.Sales_Order), { criteria: crit('Sales_Order_Number', first.Sales_Order) });
    const soId = so ? so.ID : await store.addRecord('Sales_Order', { Sales_Order_Number: first.Sales_Order }, ctx.user);
    const orders = fresh.map((p) => text(p.Order_Date)).filter(Boolean).sort();
    const targets = fresh.map((p) => text(p.Target_Delivery)).filter(Boolean).sort();
    const gate = fresh.map((p) => gateLate.get(text(p.PR_No)) || 0);
    const poNo = await nextNumber(store, PO, 'PO_No', 'PO');
    const id = await store.addRecord(PO, {
      PO_No: poNo, Customer: customers.length <= 1 ? customers[0] ?? '' : `${customers.length} customers`, Customer_Type: first.Customer_Type, Sales_Owner: first.Sales_Owner,
      PO_Date: today(), PO_Status: 'Draft', SO_No: soId, Supplier_Id: g.row ? String(g.row.ID) : '', Supplier_Name: g.name, Shipment_Mode: g.mode,
      Earliest_Order_Date: orders[0] ?? '', Earliest_Target: targets[0] ?? '', Born_Late: gate.some((n) => n > 0), Shortfall_Days: Math.max(0, ...gate), Lines_Raised: fresh.length, Lines_Born_Late: gate.filter((n) => n > 0).length,
      Feasibility_Note: notes.filter((n) => fresh.some((p) => n.startsWith(`${p.PR_No}:`))).join('\n'), Po_State: 'sent',
    }, ctx.user);
    created.push(poNo);

    const lines = [];
    let srpRate = null;
    for (const pr of fresh) {
      const item = await byId(store, 'Items', pr.Items);
      const rate = blank(pr.Selcted_Final_Cost) ? 0 : toNum(pr.Selcted_Final_Cost);
      const qty = round0(pr.quantity);
      const line = {
        PR_No: pr.PR_No, Supplier: g.name, Item: text(item?.item_name), SKU: pr.sku, QTY: qty, Unit: pr.unit, Final_Price: rate, Line_Total: qty * round0(rate),
        Shipping_Mode: pr.Shipment_Mode, Target_Delivery: pr.Target_Delivery, supplier_target_date: pr.supplier_target_date, Delay_Status: pr.Delay_Status,
        Required_Days_Lead: pr.Required_Days_Lead, Remaining_Days: pr.Remaining_Days, Followed_Recommendation: pr.Followed_Recommendation,
        Override_Reason: pr.Override_Reason, Priority: pr.Priority, Production_Date: ymd(addDays(todayDate(), 1)), // production starts PO date + 1 (spec PO-R5)
      };
      if (item && toNum(item.Rate) !== 0) { line.SRP_Rate_PO = round0(item.Rate); srpRate ??= round0(item.Rate); }
      if (item && !blank(item.Image)) line.Item_Image = item.Image;
      lines.push(line);
    }
    const mine = g.row;
    await store.updateRecord(PO, id, {
      Sales_Owner: first.Sales_Owner, ...(srpRate != null ? { SRP_Rate: srpRate } : {}), PO_Line_Items: lines,
      Total_PO_Value: lines.reduce((s, l) => s + (blank(l.Line_Total) ? 0 : toNum(l.Line_Total)), 0), Total_Lines: lines.length, Sent_On: zohoNow(), Is_Locked: true,
      Supplier_Load_At_PO: mine ? toNum(mine.Active_PO_Count) : 0,
    }, { byForm: true });
    for (const pr of fresh) {
      await store.updateRecord(PR, pr.ID, { PR_Status: 'Converted to PO', Link_PO_No: poNo, Production_Date: ymd(addDays(todayDate(), 1)), PR_Approved: true, Last_Update: zohoNow(), Pr_State: 'converted' }, { byForm: true });
      await logEvent(store, { recordType: 'pr', recordId: pr.ID, recordNo: pr.PR_No, event: 'pr.converted', occurredAt: zohoNow(), source: 'user', actor: ctx.user || '', note: poNo });
      approved += `${pr.PR_No} -> ${poNo}; `;
    }
    await logEvent(store, { recordType: 'po', recordId: id, recordNo: poNo, event: 'po.created', occurredAt: zohoNow(), source: 'user', actor: ctx.user || '' });
    await logEvent(store, { recordType: 'po', recordId: id, recordNo: poNo, event: 'po.sent', occurredAt: zohoNow(), source: 'user', actor: ctx.user || '' });

    if (mine) { // the supplier's load: how many open PO lines it has now (found by supplier ID)
      let active = 0;
      for (const po of await store.find(PO, (p) => text(p.PO_Status) !== 'Completed' && text(p.PO_Status) !== 'Cancelled')) {
        const poSupplier = text(po.Supplier_Id) !== '' ? String(po.Supplier_Id) === String(mine.ID) : resolveSupplier(supplierRows, text(po.PO_Line_Items?.[0]?.Supplier))?.row.ID === mine.ID;
        if (poSupplier) active += (po.PO_Line_Items || []).length;
      }
      await store.updateRecord('Suppliers', mine.ID, { Active_PO_Count: active }, { byForm: true });
    }
  }
  if (approved === '' && skipped === '') return { status: 'empty', message: `No eligible PRs found for ${label}` };
  return ok(`Approved: ${approved}` + (skipped !== '' ? ` | Skipped (needs Override Reason, or On Hold/Cancelled): ${skipped}` : '') + (unmatched.size ? ` | Supplier not in the Suppliers list (add it, or an other name for it): ${[...unmatched].join(', ')}` : ''),
    { pos: created, born_late: [...bornLate.keys()], unmatched_suppliers: [...unmatched] });
}
