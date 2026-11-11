// Purchase Request logic ported from the live PR widget (Procurement/Purchase Request/Widget/app/index.html)
// and the PR_Check_Readiness workflow. Like the inquiry helpers, nothing here is stored: readiness, price
// source, supplier recommendation and load are computed from the records every time.

export const HOLD_REASONS = ['Client stopped order', 'Client payment issue', 'Client changing specs', 'Client confirmed cancel', 'Other'];
export const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];
export const SHIP_MODES = ['Airfreight', 'LCL', 'FCL'];
export const SOURCING_TYPES = ['Import', 'Local'];
export const PRIORITY_SCORE = { HIGH: 80, MEDIUM: 55, LOW: 30 };

// "Tony" and "Tony Fan" are the same supplier. The live widget compares names with a prefix-tolerant match
// because both spellings are written into the same fields by different code paths.
export function supplierKeyMatch(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0;
}

// "2 weeks" -> 14. Used only as the tie-break between equal prices.
export function leadDays(text) {
  const m = /(\d+(?:\.\d+)?)\s*(day|week|month)?/i.exec(String(text ?? ''));
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'day').toLowerCase();
  return unit === 'week' ? n * 7 : unit === 'month' ? n * 30 : n;
}

export const holdState = (pr) => (pr.hold === 'On Hold' || pr.hold === 'Cancelled' ? pr.hold : 'Active');
export const isInactive = (pr) => holdState(pr) !== 'Active';

// Price confirmation, in the widget's priority order:
//   an approved SRP > a supplier quote > the SO's SRP reference > the catalog rate.
// A PR that came from an inquiry, or whose item has a catalog rate, counts as confirmed on its own.
export function priceInfo(pr, product) {
  const approved = Number(pr.srpApproved) || 0;
  if (approved > 0) return { final: approved, source: 'srp_approved', approved: true, currency: 'PHP' };
  const quote = Number(pr.price) || 0;
  const srpRate = Number(pr.srpRate) || 0;
  const itemRate = product ? Number(product.rate) || 0 : 0;
  let final = quote;
  let source = quote > 0 ? 'quote' : 'none';
  if (final <= 0) {
    if (srpRate > 0) { final = srpRate; source = 'srp'; } else if (itemRate > 0) { final = itemRate; source = 'catalog'; }
  }
  const hasInquiry = !!pr.inquiryNo;
  return {
    final, source, currency: source === 'quote' ? 'CNY' : source === 'none' ? pr.currency || 'CNY' : 'PHP',
    approved: hasInquiry ? true : itemRate > 0 ? true : quote > 0,
  };
}

export function priceDetail(pr, info) {
  if (info.source === 'srp_approved') return `SRP approved: ₱${info.final.toLocaleString()}`;
  if (pr.inquiryNo) return `From Inquiry, approved${info.final > 0 ? ` (${info.currency === 'PHP' ? '₱' : '¥'}${info.final.toLocaleString()})` : ''}`;
  if (info.source === 'catalog') return `Catalog rate, auto approved (₱${info.final.toLocaleString()})`;
  if (info.approved) return `¥${info.final.toLocaleString()} supplier quote`;
  return pr.sourcingType === 'Local' ? 'Awaiting price entry' : 'Awaiting supplier quote';
}

export const PRICE_SOURCE_LABEL = {
  srp_approved: 'SRP Approved (final)', quote: 'Supplier Quote', srp: 'SO Reference (SRP)', catalog: 'Catalog Rate (auto)', none: 'No price yet',
};

// The four conditions PR_Check_Readiness evaluates. When all four pass the PR is Ready for PO.
export function readiness(pr, product) {
  const info = priceInfo(pr, product);
  const local = pr.sourcingType === 'Local';
  const checks = [
    { key: 'supplier', title: 'Supplier selected', passed: !!String(pr.supplier || '').trim(), sub: pr.supplier || 'No supplier selected' },
    { key: 'price', title: 'Final price confirmed', passed: info.approved, sub: priceDetail(pr, info) },
    { key: 'mode', title: 'Shipping mode selected', passed: local || !!String(pr.mode || '').trim(), sub: local ? 'Local sourcing needs no freight' : pr.mode || 'Not set' },
    { key: 'target', title: 'Target date exists', passed: !!pr.targetDate, sub: pr.targetDate || 'No target date' },
  ];
  return { checks, passed: checks.filter((c) => c.passed).length, ready: checks.every((c) => c.passed), missing: checks.filter((c) => !c.passed).map((c) => c.title), info };
}

// Display only: where this PR is and what happens next.
export function nextStep(pr, product) {
  if (holdState(pr) === 'On Hold') {
    return { here: `On Hold (${pr.status})`, action: `Client${pr.holdFollowUp ? ` — follow up by ${pr.holdFollowUp}` : ''}`, who: 'Sales', tone: 'wait' };
  }
  if (holdState(pr) === 'Cancelled') return { here: `Cancelled (${pr.status})`, action: 'Cancelled — client confirmed', who: '', tone: 'stop' };
  if (pr.status === 'Converted to PO') return { here: 'Converted to PO', action: `PO created${pr.poNo ? ` (${pr.poNo})` : ''} — continue in Purchase Order`, who: '', tone: 'done' };
  if (pr.status === 'Ready for PO') return { here: 'Ready for PO', action: 'Group into a PO', who: 'Purchasing', tone: 'next' };
  const r = readiness(pr, product);
  const here = 'For Sourcing';
  if (!r.checks[0].passed) return { here, action: 'Select a supplier', who: 'Purchasing', tone: 'next' };
  if (!r.checks[1].passed) return { here, action: 'Get / approve the final price', who: 'Purchasing', tone: 'next' };
  if (!r.checks[2].passed) return { here, action: 'Set the shipment mode', who: 'Purchasing', tone: 'next' };
  return { here, action: 'Complete the sourcing details', who: 'Purchasing', tone: 'next' };
}

export function holdDays(pr, today) {
  if (!pr.holdDate) return null;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(pr.holdDate)) / 86400000));
}

// ───────────── supplier recommendation and load ─────────────

const eligibleFor = (supplier, category) => {
  if (supplier.stock) return false;
  if (supplier.handlesAll) return true;
  return (supplier.categories || []).some((c) => c.trim() === category);
};

// Count of PO lines (one per PR) on POs that are not finished, per supplier. Counting lines, not orders,
// is what the widget does, so an Overloaded supplier is a statement about lines.
export function activeLineCounts(pos) {
  const out = {};
  (pos || []).forEach((po) => {
    if (po.status === 'Completed' || po.status === 'Cancelled') return;
    out[po.supplier] = (out[po.supplier] || 0) + po.prIds.length;
  });
  return out;
}

// The widget's "Supplier Recommendation — Load Balancing" table. The recommendation is the eligible supplier
// with the lowest price (Negotiated if entered, else Initial); lead time breaks a tie. A supplier that has
// not quoted is never recommended, and if nobody has quoted yet nobody is.
export function loadBalancing(suppliers, pos, category, quotes = []) {
  if (!category) return [];
  const counts = activeLineCounts(pos);
  const real = suppliers.filter((s) => !s.stock);
  const quoteFor = (name) => quotes.find((q) => q && supplierKeyMatch(q.supplier, name));
  const price = (q) => (Number(q.negotiated) > 0 ? Number(q.negotiated) : Number(q.initial) > 0 ? Number(q.initial) : null);
  let best = '';
  let bestPrice = -1;
  let bestLead = -1;
  real.filter((s) => eligibleFor(s, category)).forEach((s) => {
    const q = quoteFor(s.name);
    const p = q ? price(q) : null;
    if (p == null) return;
    const lead = leadDays(q.leadTime);
    if (bestPrice === -1 || p < bestPrice) { bestPrice = p; bestLead = lead == null ? -1 : lead; best = s.name; } else if (p === bestPrice && lead != null && (bestLead === -1 || lead < bestLead)) { bestLead = lead; best = s.name; }
  });
  return real.map((s) => {
    const eligible = eligibleFor(s, category);
    const active = counts[s.name] || 0;
    const percent = s.maxCapacity > 0 ? Math.round((active * 100) / s.maxCapacity) : 0;
    const q = quoteFor(s.name);
    const hasQuote = !!(q && price(q) != null);
    return {
      name: s.name, category: eligible ? 'Match' : 'Not Match', activePOs: active, percent,
      loadStatus: percent >= 100 ? 'Overloaded' : percent >= 80 ? 'Near Capacity' : 'Normal',
      eligible: !eligible ? 'Removed' : s.name === best ? 'Recommended' : hasQuote ? 'Available' : 'Awaiting Quote',
    };
  });
}

export const recommendedSupplier = (suppliers, pos, category, quotes) =>
  (loadBalancing(suppliers, pos, category, quotes).find((r) => r.eligible === 'Recommended') || {}).name || '';

// Portfolio-wide load, for the Supplier Load View tab.
export function portfolioLoad(suppliers, pos) {
  const counts = activeLineCounts(pos);
  return suppliers.filter((s) => !s.stock).map((s) => {
    const active = counts[s.name] || 0;
    const percent = s.maxCapacity > 0 ? Math.round((active * 100) / s.maxCapacity) : 0;
    return { name: s.name, active, maxCapacity: s.maxCapacity || 0, percent, status: percent >= 100 ? 'Overloaded' : percent >= 80 ? 'Near Capacity' : 'Normal', categories: s.handlesAll ? 'All categories' : (s.categories || []).join(', ') || '—' };
  });
}
