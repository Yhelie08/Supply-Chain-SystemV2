// Loads the Fulfillment workflow ports; each file registers its hooks when imported.
// The seven Instant Forecast workflows (the forecast of an order is worked out when its Gate, Pick, QC, Crate, Order
// Aggregation, Pre Order or Fulfillment row is saved) are shared forecast code: server/forecast/hooks.mjs.
import '../../forecast/hooks.mjs';
