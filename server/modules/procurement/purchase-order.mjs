// Purchase_Order workflows, ported from zoho-export/parsed/workflows/form/Purchase_Order/*.dg (on validate = before the save).
//   PO_Generate_Number    (on add)          the next PO-nnnnn after the highest existing one
//   PO_Compute_Totals     (add or edit)     Total_PO_Value = sum of the line totals, Total_Lines = number of lines
//   PO_Detect_Mixed       (add or edit)     Mixed_Shipping = the lines do not all have the same shipping mode
//   PO_Status_Timestamps  (add or edit)     Sent_On / Completed_On when the status BECOMES Sent / Completed
// Skipped on purpose: PO_Lock_UI_Fields (on load, only disables fields on the form).
//
// Quirk kept from Zoho: for "Acknowledged" the script assigns a plain variable (`Acknowledged_On = ...`, no `input.`), so it never
// stored anything; Acknowledge_On is set by the acknowledge function (acknowledgePO*), which is not ported yet.
//
// The Fenteng copy of the form (Fenteng_Lighting_Purchase_Order, every field ends in _Supplier1) has the same totals / mixed /
// timestamps scripts. Its number script is NOT ported: it counts the MAIN Purchase_Order table, and the copy is meant to carry the
// number of the PO it was made from (set by approvePOFenteng, not ported yet). Differences on purpose: its timestamps compare with
// the copy's OWN previous status (Zoho looked the id up in the main Purchase_Order form, which is a different record).
import { register } from '../../workflows/index.mjs';
import { blank, toNum, round2, todayDate, ymd } from '../../workflows/deluge.mjs';

const text = (v) => (blank(v) ? '' : String(v));

// The next "PREFIX-00001" after the highest number in `field` of `form`.
export async function nextNumber(store, form, field, prefix, digits = 5) {
  let max = 0;
  for (const r of await store.find(form)) {
    const raw = text(r[field]);
    if (raw === '') continue;
    const n = parseInt(raw.replace(prefix + '-', ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(digits, '0')}`;
}

// Field names per copy of the form: the main one has plain names, Fenteng's end in _Supplier1.
const MAIN = { number: 'PO_No', status: 'PO_Status', lines: 'PO_Line_Items', lineTotal: 'Line_Total', mode: 'Shipping_Mode', value: 'Total_PO_Value', count: 'Total_Lines', mixed: 'Mixed_Shipping', sent: 'Sent_On', done: 'Completed_On' };
const FENTENG = Object.fromEntries(Object.entries(MAIN).map(([k, v]) => [k, `${v}_Supplier1`]));

function steps(f, { withNumber }) {
  return async function validate({ input, previous, store }) {
    const rec = { ...(previous || {}), ...input };
    if (withNumber && !previous) input[f.number] = await nextNumber(store, 'Purchase_Order', f.number, 'PO');

    // PO_Compute_Totals
    let value = 0;
    const lines = rec[f.lines] || [];
    for (const ln of lines) if (!blank(ln[f.lineTotal])) value += toNum(ln[f.lineTotal]);
    input[f.value] = round2(value);
    input[f.count] = lines.length;

    // PO_Detect_Mixed
    let first = '';
    let mixed = false;
    for (const ln of lines) {
      if (first === '') first = ln[f.mode];
      else if (ln[f.mode] !== first) mixed = true;
    }
    input[f.mixed] = mixed;

    // PO_Status_Timestamps: only the save that CHANGES the status stamps the date
    const before = text(previous?.[f.status]);
    const now = text(rec[f.status]);
    if (now === 'Sent' && before !== 'Sent') input[f.sent] = ymd(todayDate());
    if (now === 'Completed' && before !== 'Completed') input[f.done] = ymd(todayDate());
  };
}

register('Purchase_Order', { beforeAdd: steps(MAIN, { withNumber: true }), beforeUpdate: steps(MAIN, { withNumber: false }) });
register('Fenteng_Lighting_Purchase_Order', { beforeAdd: steps(FENTENG, { withNumber: false }), beforeUpdate: steps(FENTENG, { withNumber: false }) });
