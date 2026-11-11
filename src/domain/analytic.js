// Supply Chain Conversion: the end-to-end journey of an order, worked out from the records each time.
// Ported from the "Supply Chain Conversion" widget. Nothing is stored.

const pct = (a, b) => (b > 0 ? Math.round((a * 100) / b) : 0);

export function conversion(db) {
  const items = db.items;
  const delivered = (i) => db.serviceRequests.some((s) => s.itemId === i.id && s.status === 'Completed');
  const picked = items.filter((i) => !['Readiness Gate', 'Pick'].includes(i.stage));
  const passed = items.filter((i) => i.qcStatus === 'Approved' || ['Crate', 'Order Aggregation', 'Dispatched'].includes(i.stage));
  const pos = db.pos.filter((p) => p.status !== 'Cancelled');
  const soCount = new Set(items.map((i) => i.soNo)).size;
  const done = db.serviceRequests.filter((s) => s.status === 'Completed');
  const onTime = done.filter((s) => !s.initialDate || !s.scheduledDate || s.scheduledDate <= s.initialDate);
  const impact = db.exceptions.length;

  const funnel = [
    ['Sales Orders', soCount],
    ['Items received', items.filter((i) => i.received).length],
    ['Items picked', picked.length],
    ['QC passed', passed.length],
    ['Dispatched', items.filter((i) => i.stage === 'Dispatched').length],
    ['Delivered', items.filter(delivered).length],
  ];

  const split = ['Delivery', 'Pick Up', 'Installation'].map((t) => [t, db.serviceRequests.filter((s) => s.type === t).length]);

  const suppliers = db.suppliers.filter((s) => !s.stock).map((s) => {
    const mine = db.pos.filter((p) => p.supplier === s.name && p.status !== 'Cancelled');
    return {
      name: s.name, pos: mine.length, completed: mine.filter((p) => p.status === 'Completed').length,
      spend: mine.reduce((n, p) => n + p.total, 0), currency: s.local ? 'PHP' : 'CNY',
      exceptions: db.exceptions.filter((e) => e.supplier === s.name).length,
    };
  });

  const reasons = Object.entries(db.exceptions.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);

  const kpi = {
    overall: pct(items.filter(delivered).length, items.length),
    poCompletion: pct(pos.filter((p) => p.status === 'Completed').length, pos.length),
    pickToPack: pct(passed.length, picked.length),
    onTime: pct(onTime.length, done.length),
    orders: soCount,
    impact: pct(impact, soCount),
    spendCNY: pos.filter((p) => p.currency === 'CNY').reduce((n, p) => n + p.total, 0),
  };

  // Insights: the biggest drop between funnel steps (flagged at 15%), and the exception rate (flagged at 10%).
  const insights = [];
  for (let i = 1; i < funnel.length; i += 1) {
    const [, prev] = funnel[i - 1];
    const [name, cur] = funnel[i];
    if (prev > 0 && ((prev - cur) * 100) / prev >= 15) insights.push({ tone: 'warn', text: `Bottleneck: ${funnel[i - 1][0]} to ${name} loses ${pct(prev - cur, prev)}% (${prev} to ${cur}).` });
  }
  if (kpi.impact >= 10) insights.push({ tone: 'bad', text: `Exception rate is ${kpi.impact}% of orders (${impact} exception(s) on ${soCount} order(s)).` });
  if (!insights.length) insights.push({ tone: 'ok', text: 'No bottleneck above 15% and the exception rate is under 10%.' });

  return { kpi, funnel, split, suppliers, reasons, insights };
}
