// Small helpers that stand in for Deluge idioms, shared by the workflow ports.

// A lookup value as an ID: "123", 123 and { ID: "123", display_value: "..." } all give "123"; empty gives "".
export const idOf = (v) => String((v && typeof v === 'object' && !Array.isArray(v) ? v.ID ?? v.id ?? '' : v) ?? '').trim();

// A multi-select lookup as a list of IDs.
export const idsOf = (v) => (v == null || v === '' ? [] : [].concat(v)).map(idOf).filter(Boolean);

// Deluge writes a lookup into a text field as "[123]"; this strips that again (removeFirstOccurence/removeLastOccurence).
export const unbracket = (v) => String(v ?? '').replace(/^\s*\[/, '').replace(/\]\s*$/, '').trim();

// Checkbox values arrive as true / "true" / "false".
export const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';

// null and "" count as "no value"; numbers and numeric strings are compared by value.
export const blank = (v) => v == null || v === '';
export const toNum = (v) => { const n = Number(v); return blank(v) || Number.isNaN(n) ? 0 : n; };
export const hasValue = (v) => !blank(v) && toNum(v) !== 0;
export const sameValue = (a, b) => (blank(a) && blank(b)) || (!blank(a) && !blank(b) && (String(a) === String(b) || (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && Number(a) === Number(b))));

export const lower = (v) => String(v ?? '').trim().toLowerCase();

// "INQ-00025": the sequence padded to 5 digits (longer numbers are left as they are).
export const inquiryNumber = (seq) => `INQ-${String(Math.trunc(toNum(seq))).padStart(5, '0')}`;

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// A double-quoted Zoho criteria literal for any text.
export const lit = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// yyyymmddhhmmss, like Deluge's zoho.currenttime with spaces, colons and dashes removed.
export const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// Dates: Zoho date fields are "YYYY-MM-DD" and date-times "YYYY-MM-DD hh:mm:ss AM/PM"; both are read as a local calendar day.
const pad2 = (n) => String(n).padStart(2, '0');
export function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dayDiff = (a, b) => Math.round((a - b) / 86400000); // whole days from b to a
export const todayDate = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
