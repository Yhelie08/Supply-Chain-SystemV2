import { useSyncExternalStore } from 'react';
import ZH from './i18n-zh.js';

// EN / 中文 for the supplier portals. Keys are the English text itself, so a label that has no translation simply
// stays in English. The choice is a per-viewer convenience and lives in the browser, not in the data.
const KEY = 'supply-chain-v2:lang';
const EXTRA = {
  'Purchase Request': '采购申请',
  'Lead Time': '交货期',
  'Not Selected': '未选中',
  'Search…': '搜索…',
  'Export CSV': '导出 CSV',
  'Nothing here yet.': '暂无内容。',
  'Actions': '操作',
  'Close': '关闭',
  'Group': '分组',
  // The same English word can mean different things on different pages. "page|word" wins when a page asks with that context.
  'po|Confirmed': '已确认',
};

const read = () => { try { return localStorage.getItem(KEY) === 'zh' ? 'zh' : 'en'; } catch { return 'en'; } };
let lang = read();
const subs = new Set();
const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export function setLang(next) {
  lang = next === 'zh' ? 'zh' : 'en';
  try { localStorage.setItem(KEY, lang); } catch { /* the choice still applies for this visit */ }
  subs.forEach((fn) => fn());
}

export function translate(text, to = lang, context = '') {
  if (to !== 'zh' || text == null) return text;
  return (context && EXTRA[`${context}|${text}`]) || EXTRA[text] || ZH[text] || text;
}

export function useLang() {
  const current = useSyncExternalStore(subscribe, () => lang, () => 'en');
  return { lang: current, setLang, t: (text, context) => translate(text, current, context) };
}
