// Shared record-numbering helper for the ported Deluge workflows and the button APIs.
// The Deluge-style call sites pass the prefix WITHOUT the dash, e.g. nextNumber(store, 'Purchase_Order',
// 'PO_No', 'PO'). The store method (pg/store.mjs, db.mjs) takes the prefix WITH the dash ('PO-') and does
// the locked, concurrency-safe max+1 against a persistent series counter. This thin wrapper keeps every
// existing call site unchanged while routing all numbering through that lock.
export function nextNumber(store, form, field, prefix, digits = 5) {
  return store.nextNumber(form, field, `${prefix}-`, digits);
}