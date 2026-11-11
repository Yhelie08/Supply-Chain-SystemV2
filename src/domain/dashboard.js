// Numbers for the Procurement Dashboard, ported from the live widget (Procurement/Dashboard/Widget/app/index.html).
// Weeks run Monday to Sunday and the last eight weeks end with the current one. Every KPI compares the last four
// weeks with the four before them.

import { addDays } from './util.js';
import { startOfWeek } from './forecast.js';

const dayOf = (v) => (v ? String(v).slice(0, 10) : null);

export function weeklyBuckets(dates, weeks, today) {
  const thisWeek = startOfWeek(today);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, -(weeks - 1 - i) * 7);
    return { start, end: addDays(start, 7), count: 0, label: `${Number(start.slice(5, 7))}/${Number(start.slice(8, 10))}` };
  });
  dates.forEach((d) => {
    if (!d) return;
    const b = buckets.find((x) => d >= x.start && d < x.end);
    if (b) b.count += 1;
  });
  return buckets;
}

export const pctChange = (curr, prev) => (prev === 0 ? (curr === 0 ? 0 : 100) : Math.round(((curr - prev) / prev) * 100));

export function timeAgo(date, today) {
  if (!date) return '';
  const days = Math.floor((Date.parse(today) - Date.parse(date)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return weeks < 5 ? `${weeks}w ago` : date;
}

const sum = (list) => list.reduce((t, b) => t + b.count, 0);
const last4 = (b) => sum(b.slice(-4));
const prev4 = (b) => sum(b.slice(-8, -4));

// One KPI: the count shown, the 8-week sparkline, and the change in the last 4 weeks against the 4 before.
function kpi(rows, dateOf, today, count = rows.length) {
  const buckets = weeklyBuckets(rows.map(dateOf), 8, today);
  return { count, spark: buckets.map((b) => b.count), deltaPct: pctChange(last4(buckets), prev4(buckets)), buckets };
}

const breakdown = (order, colors, counts) => order.map((k) => ({ key: k, label: k, count: counts[k] || 0, color: colors[k] }));

export function procurementDashboard(db, today) {
  const poDate = (po) => dayOf(po.createdOn);
  const activePOs = db.pos.filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled');
  const openExc = db.exceptions.filter((e) => e.status !== 'Closed');
  const inTransit = db.shipments.filter((s) => s.status !== 'Arrived');
  const pendingRecv = db.receivings.filter((r) => r.status === 'Open' || r.status === 'Partial');
  const openRR = db.rrs.filter((r) => r.status !== 'Completed');

  const pr = kpi(db.prs, (r) => dayOf(r.createdAt), today);
  const po = kpi(activePOs, poDate, today);
  const exc = kpi(openExc, (e) => dayOf(e.raisedOn || e.createdOn), today);
  const inq = kpi(db.inquiries, (q) => dayOf(q.createdAt), today);
  const ship = kpi(inTransit, (s) => dayOf(s.dateShipped || s.createdOn), today);
  const recv = kpi(pendingRecv, (r) => dayOf(r.createdOn), today);
  const rr = kpi(openRR, (r) => dayOf(r.raisedOn || r.createdOn), today);

  // PRs against POs, all of them, last eight weeks
  const prBuckets = weeklyBuckets(db.prs.map((r) => dayOf(r.createdAt)), 8, today);
  const poBuckets = weeklyBuckets(db.pos.map(poDate), 8, today);
  const chart = prBuckets.map((b, i) => ({ label: b.label, PR: b.count, PO: poBuckets[i].count }));

  // Suppliers: PO lines, and spend in the currency each PO was priced in
  const agg = {};
  const ensure = (name) => (agg[name] ||= { name, count: 0, active: 0, spend: 0, currency: 'CNY' });
  db.suppliers.filter((s) => !s.stock).forEach((s) => { ensure(s.name).currency = s.local ? 'PHP' : 'CNY'; });
  db.pos.forEach((p) => {
    const a = ensure(p.supplier);
    const lines = p.prIds.length;
    a.count += lines;
    if (p.status !== 'Completed' && p.status !== 'Cancelled') a.active += lines;
    a.spend += Number(p.total) || 0;
    a.currency = p.currency || a.currency;
  });
  const suppliers = Object.values(agg).sort((x, y) => y.spend - x.spend);
  const spendByCurrency = suppliers.reduce((t, s) => ({ ...t, [s.currency]: (t[s.currency] || 0) + s.spend }), {});

  const quoteStages = { Final: 0, Negotiating: 0, 'Not Selected': 0, Declined: 0, 'Awaiting Quote': 0 };
  db.inquiries.forEach((q) => {
    if (!q.quotes.length) { quoteStages['Awaiting Quote'] += 1; return; }
    q.quotes.forEach((x) => { quoteStages[x.stage] = (quoteStages[x.stage] || 0) + 1; });
  });
  const count = (rows, key) => rows.reduce((t, r) => ({ ...t, [r[key]]: (t[r[key]] || 0) + 1 }), {});

  const events = [];
  db.prs.forEach((r) => events.push({ type: 'pr', date: dayOf(r.createdAt), title: r.no, desc: 'was submitted' }));
  db.pos.forEach((r) => events.push({ type: 'po', date: poDate(r), title: r.no, desc: `— ${r.status.toLowerCase()}` }));
  db.exceptions.forEach((r) => events.push({ type: 'exc', date: dayOf(r.raisedOn || r.createdOn), title: r.no, desc: `opened — ${r.type}` }));
  db.inquiries.forEach((r) => events.push({ type: 'inq', date: dayOf(r.createdAt), title: r.no, desc: 'was submitted' }));
  db.shipments.forEach((r) => events.push({ type: 'ship', date: dayOf(r.dateShipped || r.createdOn), title: r.no, desc: `— ${r.status}` }));
  db.receivings.forEach((r) => events.push({ type: 'recv', date: dayOf(r.lastReceived || r.createdOn), title: r.no, desc: `— ${r.status.toLowerCase()}` }));
  db.rrs.forEach((r) => events.push({ type: 'rr', date: dayOf(r.raisedOn || r.createdOn), title: r.no, desc: `— ${r.status}` }));
  const activity = events.filter((e) => e.date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 9)
    .map((e) => ({ ...e, when: timeAgo(e.date, today) }));

  return {
    pr, po, exc, inq, ship, recv, rr,
    totalMissing: db.receivings.reduce((t, r) => t + (r.missing || 0), 0),
    supplierCount: suppliers.length, suppliers, topSuppliers: suppliers.filter((s) => s.count > 0).slice(0, 5), spendByCurrency, chart, activity,
    breakdowns: {
      'Purchase Orders': breakdown(['Draft', 'Sent', 'Confirmed', 'Completed', 'Cancelled'], { Draft: '#9ec5f4', Sent: '#6da7ec', Confirmed: '#3987e5', Completed: '#0ca30c', Cancelled: '#d03b3b' }, count(db.pos, 'status')),
      Exceptions: breakdown(['Open', 'RR Created', 'Closed'], { Open: '#d03b3b', 'RR Created': '#fab219', Closed: '#94a3b8' }, count(db.exceptions, 'status')),
      Inquiries: breakdown(['Final', 'Negotiating', 'Not Selected', 'Declined', 'Awaiting Quote'], { Final: '#0ca30c', Negotiating: '#3987e5', 'Not Selected': '#94a3b8', Declined: '#d03b3b', 'Awaiting Quote': '#fab219' }, quoteStages),
      Shipments: breakdown(['Pending', 'In Transit', 'Arrived'], { Pending: '#9ec5f4', 'In Transit': '#3987e5', Arrived: '#0ca30c' }, count(db.shipments, 'status')),
      Receiving: breakdown(['Open', 'Partial', 'Received', 'Closed – Exceptions'], { Open: '#fab219', Partial: '#6da7ec', Received: '#0ca30c', 'Closed – Exceptions': '#d03b3b' }, count(db.receivings, 'status')),
      'Replacement Requests': breakdown(['Open', 'Acknowledged', 'In Production', 'Shipped', 'Received'], { Open: '#d03b3b', Acknowledged: '#3987e5', 'In Production': '#e0a100', Shipped: '#7c5cd6', Received: '#0ca30c' }, count(db.rrs, 'status')),
    },
  };
}
