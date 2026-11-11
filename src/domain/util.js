// Dates are plain ISO strings (YYYY-MM-DD) so they sort, compare and persist without surprises.

export function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(iso) {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const clean = String(iso).includes('T') ? String(iso).split('T')[0] : String(iso);
  const d = new Date(clean + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Supplier prices are in CNY, selling prices (SRP) in PHP. A zero or missing value reads as a dash.
export function fmtPHP(n) {
  const v = parseFloat(n);
  return Number.isNaN(v) || v === 0 ? '—' : '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCNY(n) {
  const v = parseFloat(n);
  return Number.isNaN(v) || v === 0 ? '—' : '¥' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtMoneyIn(n, currency) {
  return currency === 'CNY' ? fmtCNY(n) : fmtPHP(n);
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtMoney(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
}
