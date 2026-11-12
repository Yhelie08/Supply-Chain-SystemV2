// PR1_Forecast_Stamp ("on add or edit, on success" of Purchase_Request1), ported: one line of Deluge,
// `info thisapp.fcPrToPreOrder(input.ID.toLong())`, which works out the forecast of the PR, stamps the PR and its order, and
// copies it onto the Pre Order rows of the PR (server/forecast/purchase-request.mjs). Imported by the Procurement module
// (server/modules/procurement/workflows.mjs). The stamp writes through the plain store, so it does not fire this again.
import { register } from '../workflows/index.mjs';
import { fcPrToPreOrder } from './purchase-request.mjs';

const stamp = ({ id, store }) => fcPrToPreOrder(store, id);
register('Purchase_Request1', { afterAdd: stamp, afterUpdate: stamp });
