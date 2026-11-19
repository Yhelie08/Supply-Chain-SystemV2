// Loads the Procurement workflow ports; each file registers its hooks when imported.
import './inquiry.mjs';
import './inq-spec.mjs';
import './purchase-request.mjs';
// Purchase Request (spec v1.4): feasibility, recommendation in words, pricing status, stamps, ranking. After the ported workflow.
import './pr-spec.mjs';
import './purchase-order.mjs';
import './shipments.mjs';
// Ship & Track (spec v1.4): stage events, photo gate, planned dates, sorting engine. After shipments.mjs so it sees what that one filled in.
import './ship-track.mjs';
// Purchase Order (spec v1.4): state, events, acknowledgement alert, close when received; never deleted.
import './po-spec.mjs';
// The Decisions list and the Procurement settings (spec Approval Queue, Control Panel).
import './decisions.mjs';
import './settings-hooks.mjs';
import './receiving.mjs';
// Receiving (spec v1.4): the four events as server stamps, ready = counted AND binned, fault origin, Arrivals ranking. After the ported workflow.
import './receiving-spec.mjs';
import './supplier-portal-workflows.mjs';
import './production-portal.mjs';
import './replacement-exceptions.mjs';
import './rr-spec.mjs';
import './projects.mjs';
// PR1_Forecast_Stamp: the forecast of a PR (shared forecast code).
import '../../forecast/pr-hooks.mjs';
