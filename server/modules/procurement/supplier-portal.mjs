// What a supplier does in the Tony Fan / Fenteng Lighting portal, ported from zoho-export/parsed/functions:
//   acknowledgePOTony / acknowledgePOFenteng   the supplier confirms a PO with its ETD and ETA
//   approveRRTony / approveRRFenteng           the supplier approves a Replacement Request with an expected ship date and an ETA
// No Zoho Books / Inventory call is made. Run with the raw store (no workflow hooks), like the Deluge functions.
//
// Acknowledge: the supplier's PO copy becomes "Confirmed" (a second try answers "already"), and so does the PO of Procurement, with
// Acknowledge_On. The ETD / ETA go onto the PO's Pending shipment. A PO that has no shipment yet, or that is a replacement (has an
// RR reference), gets its shipment, the supplier's copy of it and its Receiving record now (nothing is made twice; see po-approval.mjs).
// Approve RR: the supplier's RR and the main Replacement_Request with the same RR_No become "Acknowledged" with the dates.
import { ok, fail } from '../../custom-api-helpers.mjs';
import { blank, todayDate, ymd } from '../../workflows/deluge.mjs';
import { zohoNow } from '../../criteria.mjs';
import { SUPPLIER, shipmentAndReceivingFor } from './po-approval.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const RR_FORM = { Tony: 'Tony_Fan_Replacement_Request', Fenteng: 'Fenteng_Lighting_Replacement_Request' };

export async function acknowledgePO(key, payload, store, ctx = {}) {
  const S = SUPPLIER[key];
  const f = (n) => `${n}${S.sfx}`;
  const poNo = text(payload[`poNo${S.sfx.slice(1)}`] ?? payload.poNo);
  const etd = text(payload.etd), eta = text(payload.eta);
  if (etd === '' || eta === '') return fail('ETD and ETA are both required to acknowledge this PO.');
  const copies = await store.find(S.copy, (c) => text(c[f('PO_No')]) === poNo, { criteria: `(${f('PO_No')} == "${poNo.replace(/"/g, '')}")` });
  if (copies.length === 0) return fail(`PO not found: ${poNo}`);
  for (const copy of copies) {
    if (text(copy[f('PO_Status')]) === 'Confirmed') return { status: 'already', message: 'Already acknowledged' };
    const now = zohoNow();
    await store.updateRecord(S.copy, copy.ID, { [f('Acknowledge_On')]: now, [f('PO_Status')]: 'Confirmed' }, { byForm: true });
    for (const apo of await store.find('Purchase_Order', (p) => text(p.PO_No) === text(copy[f('PO_No')]), { criteria: `(PO_No == "${text(copy[f('PO_No')]).replace(/"/g, '')}")` })) {
      await store.updateRecord('Purchase_Order', apo.ID, { Acknowledge_On: now, PO_Status: 'Confirmed' }, { byForm: true });
      const pending = await store.find('Shipments', (s) => text(s.PO_No?.ID ?? s.PO_No) === String(apo.ID) && text(s.Shipment_Status) === 'Pending');
      if (pending.length) await store.updateRecord('Shipments', pending[pending.length - 1].ID, { ETD: etd, ETA: eta }, { byForm: true });
      if (text(apo.RR_Reference_No) !== '' || pending.length === 0) await shipmentAndReceivingFor(store, ctx, S, text(apo.PO_No), { ETD: etd, ETA: eta });
    }
  }
  return ok(`Acknowledged ${poNo}`);
}

export async function approveRR(key, payload, store) {
  const form = RR_FORM[key];
  const id = text(payload.rrRecordId);
  const expected = text(payload.expectedShipDate), eta = text(payload.eta);
  const [r] = id === '' ? [] : await store.find(form, (x) => String(x.ID) === id);
  if (!r) return fail('Replacement Request not found.');
  if (text(r.RR_Status) !== 'Open') return fail('Already approved.');
  if (expected === '' || eta === '') return fail('Expected Ship Date and ETA are both required to approve.');
  const patch = { RR_Status: 'Acknowledged', Expected_Ship_Date: expected, ETA: eta, Supplier_Acknowledgement1: true, Supplier_Acknowledge_Date: ymd(todayDate()), Last_Updated: ymd(todayDate()) };
  await store.updateRecord(form, r.ID, patch, { byForm: true });
  for (const main of await store.find('Replacement_Request', (x) => text(x.RR_No) === text(r.RR_No))) await store.updateRecord('Replacement_Request', main.ID, patch, { byForm: true });
  return ok(`Replacement Request approved — Expected Ship ${expected}, ETA ${eta}.`);
}

export const acknowledge_po_tony = (p, s, c) => acknowledgePO('Tony', p || {}, s, c);
export const acknowledge_po_fenteng = (p, s, c) => acknowledgePO('Fenteng', p || {}, s, c);
export const approve_rr_tony = (p, s) => approveRR('Tony', p || {}, s);
export const approve_rr_fenteng = (p, s) => approveRR('Fenteng', p || {}, s);
