// What a supplier sees in its portal (Tony Fan, Fenteng Lighting), worked out from the buyer-side records.
// Ported from the live supplier widgets (Procurement/Supplier - Tony Fan/Widget/*). Fenteng is a configuration clone of Tony Fan, so
// everything here takes the supplier's name. Nothing is stored: the supplier's status on a line is always computed.

import { collateralDone, selectedQuote } from './inquiry.js';

export const PORTAL_SUPPLIERS = ['Tony Fan', 'Fenteng Lighting'];
export const SHIP_MODES = ['Airfreight', 'LCL', 'FCL', 'Local'];
export const MODE_LABEL = { Airfreight: 'Air Freight', LCL: 'LCL', FCL: 'FCL', Local: 'Local' };

// A quote the supplier has answered: it picked an availability or priced it.
export const responded = (q) => !!q && (q.availability !== 'Pending' || Number(q.initial) > 0);
export const declined = (q) => !!q && q.stage === 'Declined';

// The supplier's status on one inquiry line (the widget's Response_Status):
//   Waiting          not answered yet
//   Submit Response  answered (or the buyer changed something), still open
//   Selected         the buyer chose this supplier; pricing is locked, collateral is open
//   Not Selected     the buyer chose another supplier; locked
//   Completed        selected and every collateral item confirmed; locked for good
export function inquiryStatus(inq, supplier) {
  const q = (inq.quotes || []).find((x) => x.supplier === supplier);
  if (!q || declined(q)) return '';
  const sel = selectedQuote(inq);
  if (sel && sel.supplier !== supplier) return 'Not Selected';
  if (sel) return inq.status === 'Sales Order' || collateralDone(inq) ? 'Completed' : 'Selected';
  return responded(q) ? 'Submit Response' : 'Waiting';
}

export const quotesEditable = (status) => status === 'Waiting' || status === 'Submit Response';
export const collateralEditable = (status) => status === 'Selected';

export const inquiryRows = (db, supplier) => db.inquiries.filter((i) => inquiryStatus(i, supplier));

// Purchase requests: a PR is the supplier's when it was quoted to it or already assigned to it.
export function prStatus(pr, supplier) {
  const q = (pr.quotes || []).find((x) => x.supplier === supplier);
  const mine = !!q || pr.supplier === supplier;
  if (!mine || declined(q)) return '';
  const sel = (pr.quotes || []).find((x) => x.selected);
  if (sel) return sel.supplier === supplier ? 'Selected' : 'Not Selected';
  if (pr.supplier === supplier && pr.status === 'Converted to PO') return 'Selected';
  return responded(q) || (pr.supplier === supplier && Number(pr.price) > 0) ? 'Submit Response' : 'Waiting';
}
// A PR that came from an inquiry is view-only (the inquiry is where it is quoted). Held or cancelled ones cannot be quoted.
export const prViewOnly = (pr) => !!pr.inquiryNo;
export const prRows = (db, supplier) => db.prs.filter((p) => prStatus(p, supplier));

// Purchase orders: the supplier sees a PO once it has been sent.
export const poLabel = (po) => (po.status === 'Sent' ? 'Awaiting Acknowledge' : po.status);
export const poRows = (db, supplier) => db.pos.filter((p) => p.supplier === supplier && p.status !== 'Draft' && p.status !== 'Cancelled');

// Shipments: they only exist once the PO is acknowledged (or, for a replacement, once the RR is approved).
export const shipmentLabel = (s) => (s.status === 'Pending' ? 'Pending' : 'Shipped');
export const shipmentRows = (db, supplier) => db.shipments.filter((s) => s.supplier === supplier);

// Replacement requests, with the live status names.
export const RR_LABEL = { Open: 'Awaiting Approval' };
export const rrLabel = (rr) => RR_LABEL[rr.status] || rr.status;
export const rrRows = (db, supplier) => db.rrs.filter((r) => r.supplier === supplier);
export const RR_FLOW = ['Open', 'Acknowledged', 'In Production', 'Shipped', 'Received'];

// Grouping: inquiries by quote group, PRs/POs/shipments by Sales Order, RRs by exception.
export const quoteGroupOf = (inq) => inq.quoteGroup || '— No Group —';
