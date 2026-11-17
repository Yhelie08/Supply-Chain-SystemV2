// Event-triggered scoring (spec §05/01 §6: "any material event ... re-score that Sales Order's records immediately").
// Registered on the two forms whose saves can change a package's category or rank: the package itself, and its
// Readiness Gate records (payment/approval changes flip Blocked on and off). The nightly and manual triggers are
// server/modules/fulfillment/index.mjs (schedule) and apis.mjs (recalculate_fulfillment_queue) respectively.
//
// No re-entrancy risk: the `store` a hook receives (server/workflows/index.mjs's createHookedStore) is always
// the raw, unhooked store the wrapper closes over, never the wrapper itself — so rescoreOne's writes here cannot
// re-trigger these same hooks.
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { rescoreOne } from './sorter.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

async function onSofSave({ record, store }) {
  await rescoreOne(store, text(record.SO_No));
}
register('Sales_Order_Fulfillment', { afterAdd: onSofSave, afterUpdate: onSofSave });

async function onGateSave({ record, store }) {
  await rescoreOne(store, text(record.sales_order_number));
}
register('Sales_Order_Readiness_Gate', { afterAdd: onGateSave, afterUpdate: onGateSave });
