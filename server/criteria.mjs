// Pure helpers shared by the SQLite store (db.mjs) and the Postgres store (pg/store.mjs):
// Zoho-style errors, Zoho date strings, and the Zoho criteria -> JS predicate compiler.

export class ZohoError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const pad = (n) => String(n).padStart(2, '0');
export function zohoNow(d = new Date()) {
  const h = d.getHours() % 12 || 12;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// ---------- Zoho criteria -> JS predicate ----------
export const TOKEN = /\s+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?|&&|\|\||==|!=|>=|<=|>|<|\(|\)|!|,|\.(?:contains|startsWith|endsWith)\s*\(|[A-Za-z_]\w*(?:\.(?!contains\b|startsWith\b|endsWith\b)\w+)*/y;
export function compileCriteria(src, ctx = {}) {
  if (!src || !String(src).trim()) return () => true;
  let js = '', m; TOKEN.lastIndex = 0;
  const s = String(src);
  while (TOKEN.lastIndex < s.length) {
    const at = TOKEN.lastIndex;
    if (!(m = TOKEN.exec(s))) throw new ZohoError(3330, `Unsupported criteria near: ${s.slice(at, at + 30)}`);
    const t = m[0];
    if (/^\s+$/.test(t)) js += ' ';
    else if (/^["']/.test(t)) js += JSON.stringify(t.slice(1, -1).replace(/\\(.)/g, '$1'));
    else if (/^(true|false|null)$/.test(t)) js += t;
    else if (t === 'zoho.currentdate') js += JSON.stringify(today());
    else if (t === 'zoho.loginuser' || t === 'zoho.loginuserid') js += JSON.stringify(ctx.user || '');
    else if (/^\.(contains|startsWith|endsWith)/.test(t)) js += t.startsWith('.contains') ? '.includes(' : t.replace(/\s*\($/, '') + '(';
    else if (/^[A-Za-z_]/.test(t)) js += `v(${JSON.stringify(t)})`;
    else js += t;
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function('v', `return (${js});`);
  return (rec) => {
    const v = (name) => {
      let x = rec[name.split('.')[0]];
      if (x && typeof x === 'object' && !Array.isArray(x) && 'ID' in x) x = x.ID;
      if (x === '' || x === undefined) return null;
      if (name === 'ID' || (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x) && x.length < 16)) return Number(x);
      return x;
    };
    try { return !!fn(v); } catch { return false; }
  };
}
