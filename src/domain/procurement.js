// Derived facts for the Procurement pages (Shipments, Receiving, Exceptions, Replacement). Nothing here is stored: delayed,
// arriving soon, severity and overdue are worked out from the records and today's date each time.

import { addDays } from './util.js';

export const EXCEPTION_TYPES = ['Damaged', 'Missing', 'Damaged + Missing', 'Wrong item', 'Defective', 'Other'];
export const EXCEPTION_DEPTS = ['Procurement', 'Warehouse', 'Quality', 'Sales'];

const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// ───────────── Shipments ─────────────

export function shipmentFlags(s, db, today) {
  const po = s.poId ? db.pos.find((p) => p.id === s.poId) : null;
  const lines = db.prs.filter((p) => (s.prNos || []).includes(p.no));
  const required = lines.map((p) => p.targetDate).filter(Boolean).sort()[0] || '';
  const arrived = s.status === 'Arrived';
  const delayed = !arrived && !!s.eta && s.eta < today;
  const arrivingSoon = s.status === 'In Transit' && !!s.eta && s.eta >= today && s.eta <= addDays(today, 7);
  const lateStart = s.status === 'Pending' && !!s.etd && s.etd < today;
  const afterClientDate = !arrived && !!required && !!s.eta && s.eta > required;
  const modeMismatch = !!po && !!s.mode && !!po.mode && s.mode !== po.mode;
  return {
    required, delayed, arrivingSoon, modeMismatch,
    remaining: !arrived && s.eta ? diff(today, s.eta) : null,
    attention: delayed || lateStart || afterClientDate,
    attentionWhy: delayed ? 'Past its ETA' : lateStart ? 'Not shipped after its ETD' : afterClientDate ? 'Due after the client date' : '',
  };
}

// ───────────── Receiving ─────────────

export function receivingState(r, db) {
  const awaitingReplacement = r.status === 'Closed – Exceptions'
    && db.exceptions.some((e) => e.receivingNo === r.no && e.status !== 'Closed' && e.status !== 'Resolved');
  return {
    pending: r.status === 'Open',
    incomplete: r.status === 'Partial',
    complete: r.status === 'Received',
    withExceptions: r.damaged > 0 || r.missing > 0 || r.status === 'Closed – Exceptions',
    sentToBooks: !!r.sentToBooks,
    awaitingReplacement,
  };
}

// ───────────── Exceptions ─────────────

const BAD_TYPES = ['Damaged', 'Damaged + Missing', 'Defective', 'Wrong item'];
export const exceptionSeverity = (e) => (BAD_TYPES.includes(e.type) || Number(e.qty) >= 5 ? 'High' : 'Medium');
export const exceptionLabel = (e) => (e.status === 'RR Created' ? 'Waiting' : e.status);
export const exceptionOverdue = (e, today) => !!e.dueDate && e.dueDate < today && !['Resolved', 'Closed'].includes(e.status);
export const exceptionOpen = (e) => !['Resolved', 'Closed'].includes(e.status);

// ───────────── Replacement requests ─────────────

// Which tab a replacement belongs to: Local (HC System) sourcing, otherwise by where the exception came from.
export const rrKind = (rr) => (rr.supplier === 'HC System' ? 'Local' : rr.source === 'Fulfillment' ? 'Fulfillment' : 'Procurement');
