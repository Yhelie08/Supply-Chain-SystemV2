// Loads the Procurement workflow ports; each file registers its hooks when imported.
import './inquiry.mjs';
import './purchase-request.mjs';
import './purchase-order.mjs';
import './shipments.mjs';
import './receiving.mjs';
import './replacement-exceptions.mjs';
// PR1_Forecast_Stamp: the forecast of a PR (shared forecast code).
import '../../forecast/pr-hooks.mjs';
