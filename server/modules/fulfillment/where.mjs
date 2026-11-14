// A Zoho criteria string for "field == value", for store.find(form, test, { criteria }): Postgres filters, so only the rows of that
// sales order / package are read instead of the whole table (the database is remote, every full read costs 0.3 to 0.5 s). The JS test
// passed to find() still runs on the rows that come back, so a value the criteria cannot express just reads more, never wrong.
const BACKSLASH = /\\/g;
const QUOTE = /"/g;
export const eq = (field, value) => `(${field} == "${String(value ?? '').replace(BACKSLASH, '\\\\').replace(QUOTE, '\\"')}")`;
