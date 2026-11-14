// Form workflows of the Tony Fan / Fenteng Lighting portals, ported from zoho-export/parsed/workflows/form:
//   Tony_Shipment / Fenteng_Shipment        Tony_Shipment_Sync / Fenteng_Shipment_Sync   (edit, on success)
//     Each supplier shipment line ticked "Select to ship" and not yet Synced: it gets a shipment id (SHP-AIR-00001 / SHP-LCL-... /
//     SHP-FCL-..., from the Shipment_ID_Counter) and is added to the parent shipment's Supplier_Shipment_Details as "In Transit"; the
//     line is marked Synced (so it is never added twice); the parent shipment gets Ship_Out_Date and Estimated_Warehouse_Arrival
//     (Airfreight + 12 days, FCL + 47, LCL + 67); and the shipment lines of the parent get Shipment_Mode_When_Received by SKU.
//   Tony_Fan_Purchase_Request / Fenteng_Lighting_Purchase_Request
//     Mandatory_PR_Fields_Suppl*   (edit, on validate)   refused while editing is locked (edit_counter 0) and while the response is
//                                  missing its Availability, prices (unless a catalog price exists, or the supplier cannot produce /
//                                  is unavailable / confirmed) or Lead Time
//     PR_Stage_Supplier_Changed*   (edit, on success)    the supplier's answer (Availability, Initial / Negotiated / Final price, Lead
//                                  Time) is copied onto this supplier's row of the buyer's PR (Supplier_Selected)
//     Tony_Sync_Image_PR / Fenteng_Sync_Image_PR (add or edit, on success)  the product image of the item
// Not ported: the Disable_* workflows (on load), Submit_Response_PRbtn / Action buttons (they only open the form), the notifications (inactive),
// and `input.edit_counter = 0` at the end of PR_Stage_Supplier_Changed*: Zoho runs it on success, where a change to the form's input is not
// saved, so it never locked anything.
import { register } from '../../workflows/index.mjs';
import { ZohoError } from '../../criteria.mjs';
import { blank, idOf, truthy, toNum, parseDate, addDays, ymd } from '../../workflows/deluge.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const refuse = (message) => { throw new ZohoError(2001, message); };

// ---------------- the supplier's shipment ----------------
const SHIPMENTS = [
  { form: 'Tony_Shipment', grid: 'Supplier2_Shipment_Details' },
  { form: 'Fenteng_Shipment', grid: 'Supplier1_Shipment_Details' },
];
const DAYS = { Airfreight: 12, LCL: 67, FCL: 47 };
const PREFIX = { Airfreight: 'AIR', LCL: 'LCL', FCL: 'FCL' };
const COUNTER = { Airfreight: 'Air_Counter', LCL: 'LCL_Counter', FCL: 'FCL_Counter' };

for (const { form, grid } of SHIPMENTS) {
  register(form, {
    afterUpdate: async ({ record: sup, id, store }) => {
      const supId = text(sup.ID || id);
      const rows = (sup[grid] || []).map((r) => ({ ...r }));
      const todo = rows.filter((r) => truthy(r.Select_To_Ship) && !truthy(r.Synced) && ['Airfreight', 'LCL', 'FCL'].includes(text(r.Shipment_Mode)));
      if (todo.length === 0) return;
      const parentId = text(sup.Parent_Shipment_ID);
      const parent = parentId === '' ? null : await store.getRecordById('Shipments', parentId, { raw: true }).catch(() => null);
      if (!parent) return;

      let [counter] = await store.find('Shipment_ID_Counter');
      if (!counter) { const cid = await store.addRecord('Shipment_ID_Counter', { Air_Counter: 1, LCL_Counter: 1, FCL_Counter: 1 }); counter = await store.getRecordById('Shipment_ID_Counter', cid, { raw: true }); }
      const next = { Airfreight: toNum(counter.Air_Counter) || 1, LCL: toNum(counter.LCL_Counter) || 1, FCL: toNum(counter.FCL_Counter) || 1 };

      const details = [...(parent.Supplier_Shipment_Details || [])];
      const modeBySku = new Map();
      let shipOut = null, arrival = null;
      for (const r of todo) {
        const mode = text(r.Shipment_Mode);
        const seq = next[mode]++;
        details.push({
          Shipment_ID: `SHP-${PREFIX[mode]}-${String(seq).padStart(5, '0')}`, SO_No: parent.Sales_Order, PR_No: r.PR_No, RR_No: r.RR_No, SKU: r.SKU, Item_Name: r.Item_Name,
          Date_Shipped: text(r.Date_Shipped), Shipment_Mode: mode, Status: 'In Transit',
        });
        shipOut = text(r.Date_Shipped);
        const d = parseDate(r.Date_Shipped);
        if (d) arrival = ymd(addDays(d, DAYS[mode]));
        modeBySku.set(text(r.SKU), mode);
        r.Synced = true;
      }
      await store.updateRecord(form, supId, { [grid]: rows }, { byForm: true });
      await store.updateRecord('Shipment_ID_Counter', counter.ID, { Air_Counter: next.Airfreight, LCL_Counter: next.LCL, FCL_Counter: next.FCL }, { byForm: true });
      const patch = { Supplier_Shipment_Details: details };
      if (shipOut) patch.Ship_Out_Date = shipOut;
      if (arrival) patch.Estimated_Warehouse_Arrival = arrival;
      patch.PO_Shipments = (parent.PO_Shipments || []).map((l) => (modeBySku.has(text(l.SKU)) ? { ...l, Shipment_Mode_When_Received: modeBySku.get(text(l.SKU)) } : l));
      await store.updateRecord('Shipments', parent.ID, patch, { byForm: true });
    },
  });
}

// ---------------- the supplier's Purchase Request ----------------
const PR_FORMS = [
  { form: 'Tony_Fan_Purchase_Request', sfx: '_Supplier2', name: 'Tony' },
  { form: 'Fenteng_Lighting_Purchase_Request', sfx: '_Supplier1', name: 'Fenteng' },
];

for (const { form, sfx, name } of PR_FORMS) {
  const f = (n) => `${n}${sfx}`;

  register(form, {
    // Mandatory_PR_Fields_Suppl*: only on an edit
    beforeUpdate: ({ input, previous }) => {
      const rec = { ...(previous || {}), ...input };
      if (toNum(rec.edit_counter) === 0 && text(rec.edit_counter) !== '' ) refuse('Editing is locked. Wait for Purchase Request update.');
      const missing = [];
      const note = (m) => { if (!missing.includes(m)) missing.push(m); };
      const hasSrp = !blank(rec[f('SRP_Rate_PR')]) && toNum(rec[f('SRP_Rate_PR')]) !== 0;
      for (const row of rec[f('Supplier_Selected')] || []) {
        const avail = text(row[f('Availability')]);
        if (avail === '') note('Availability');
        if (avail !== 'Cannot Produce' && avail !== 'Unavailable' && avail !== 'Confirmed' && !hasSrp) {
          if (blank(row[f('Initial_Price')]) || toNum(row[f('Initial_Price')]) === 0) note('Initial Price');
          if (blank(row[f('Final_Price')]) || toNum(row[f('Final_Price')]) === 0) note('Final Price');
        }
        if (avail !== 'Cannot Produce' && avail !== 'Unavailable' && avail !== 'Confirmed' && (blank(row[f('Lead_Time')]) || toNum(row[f('Lead_Time')]) === 0)) note('Lead Time');
      }
      if (missing.length) refuse(`Required fields missing: ${missing.join(', ')}`);
    },

    afterAdd: syncImage,
    afterUpdate: async (ctx) => { await syncImage(ctx); await copyAnswerToBuyerPR(ctx); },
  });

  // Tony_Sync_Image_PR / Fenteng_Sync_Image_PR
  async function syncImage({ record: r, id, store }) {
    const item = idOf(r[f('Items')]) === '' ? null : await store.getRecordById('Items', idOf(r[f('Items')]), { raw: true }).catch(() => null);
    if (item && !blank(item.Image) && text(r[`Product_Image${sfx}_PR`]) !== text(item.Image)) {
      await store.updateRecord(form, text(r.ID || id), { [`Product_Image${sfx}_PR`]: item.Image }, { byForm: true });
    }
  }

  // PR_Stage_Supplier_Changed*: the answer goes to this supplier's row of the buyer's PR
  async function copyAnswerToBuyerPR({ record: r, store }) {
    const prNo = text(r[f('PR_No')]);
    const answer = (r[f('Supplier_Selected')] || [])[0];
    if (prNo === '' || !answer) return;
    const nameById = new Map((await store.find('Suppliers')).map((x) => [String(x.ID), text(x.Supplier_Name?.first_name ?? x.Supplier_Name)]));
    for (const pr of await store.find('Purchase_Request1', (p) => text(p.PR_No) === prNo, { criteria: `(PR_No == "${prNo.replace(/["\\]/g, '')}")` })) {
      let changed = false;
      const rows = (pr.Supplier_Selected || []).map((row) => {
        const s = nameById.get(idOf(row.Suppliers)) ?? text(row.Suppliers?.display_value ?? row.Suppliers);
        if (!(s === name || s.includes(name)) || changed) return row;
        const next = { ...row, Availability: answer[f('Availability')], Initial_Price: answer[f('Initial_Price')], Negotiated: answer[f('Negotiated')], Final_Price: answer[f('Final_Price')], Lead_Time: answer[f('Lead_Time')] };
        changed = JSON.stringify(next) !== JSON.stringify(row);
        return next;
      });
      if (changed) await store.updateRecord('Purchase_Request1', pr.ID, { Supplier_Selected: rows }, { byForm: true });
    }
  }
}
