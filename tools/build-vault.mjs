// Generates the Obsidian vault in /vault from the app's own source, so the notes cannot drift:
//   rules    <- src/domain/rules.js          (imported)
//   actions  <- src/domain/actions.js        (parsed: names, source line, which rules each step refuses with)
//   pages    <- src/live-spec.js (imported: the six sections and 42 tabs of the live app) + src/pages/*.jsx (parsed: which steps each page offers)
//   entities <- src/domain/seed.js           (imported: fields and row counts from the sample data)
//
// Run:  npm run vault
// Anything the code cannot tell us (descriptions, lifecycles, guides) lives in this file, and the
// build FAILS if a new action, rule or page is added without being described here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ───────────────────────── hand-written knowledge ─────────────────────────

const ACTION_INFO = {
  forecastSettingsSave: 'Saves the forecast lead-time settings (each leg is a min and max in days), the two toggles and the weeks shown. A minimum above its maximum is refused. Every forecast date is recalculated from them.',
  forecastSettingsReset: 'Puts every forecast setting back to its default.',
  prCreate: 'Creates a PR by hand from the New PR form, for an item that did not come through an inquiry. Needs item, target date, quantity, customer, customer type and sales owner. Local sourcing goes to HC System with no freight.',
  prEdit: 'Edits the supplier, shipping mode, priority, supplier price, target date or quantity of a PR that has not been converted. Choosing a supplier other than the recommended one needs an override reason. Recomputes whether the PR is Ready for PO.',
  prSetSrp: 'Approves the SRP (PHP) for a PR. An approved SRP is the top-priority final price and what goes onto the Purchase Order.',
  prHold: 'Puts a PR On Hold, or Cancels it when called with cancel. Needs a reason from the list ("Other" also needs notes) and records the date and an optional follow-up date. The status underneath is untouched.',
  prResume: 'Clears the hold (Resume) or the cancellation (Restore), so the PR carries on from the status it already had.',
  prConvert: 'Converts the selected Ready PRs into Purchase Orders, one PO per supplier, and locks the PRs. Used by the group step.',
  prGroupCreatePO: 'Create PO on a Sales Order group: the active PRs of that order go to one supplier in one PO. Refused if suppliers are mixed, a PR is not ready, or one is already converted. Held and cancelled PRs are left out.',
  inquiryCreate: 'Saves a new inquiry from the form: matched item and customer, quotes, collateral, specs and SRP. Tags every supplier, assigns the quote group, and starts the timeline.',
  inquiryUpdate: 'Saves edits to an inquiry. Runs the same checks as create, and writes only what changed to the timeline. Locked once the inquiry is a Sales Order.',
  inquiryDelete: 'Deletes an inquiry after confirmation. Its timeline keeps a trail. Locked once the inquiry is a Sales Order.',
  inquiryApproveSrp: 'Approves the selling price (SRP) in PHP, from the detail view or straight from a Quote Group chip.',
  inquiryEstimate: 'Creates or updates the estimate. Needs all five readiness conditions and a project, and also covers the other Ready inquiries of the same project, with one shared estimate number.',
  inquiryApprove: 'Converts the estimate to a Sales Order. Raises a Purchase Request for the selected supplier (or none for Warehouse Stock) and the Fulfillment item.',
  customerCreate: 'Creates a customer from the New Customer modal: type, contact details, billing and shipping address. Names must be unique.',
  projectCreate: 'Creates a project for a customer from the New Project modal, with the next PRJ-xxxxx code, a group discount and status Active.',
  productCreate: 'Adds an item to the catalog by Item ID, or updates the item if that ID is already there.',
  chatSend: 'Sends a message in a supplier conversation. Only Fenteng and Tony have threads, and only when they are quoted on the inquiry.',
  noteSend: 'Adds a note to the internal Sales and Purchasing conversation on an inquiry.',
  poSend: 'Sends a Draft PO to its supplier. An unrecognised supplier is refused. A Local PO is issued without any accounting push.',
  poAcknowledge: 'Records the supplier\'s ETD and ETA, once only. Creates the Shipment and its Receiving if they are missing.',
  shipmentTransit: 'Marks a Pending shipment In Transit and stamps the date shipped.',
  shipmentArrive: 'Marks an In Transit shipment Arrived, which opens its Receiving for counting.',
  receive: 'Counts goods off the truck: accepted, damaged, missing. Totals may not exceed expected. Damage or shortage raises an exception; a full accept frees the waiting Sales Order items.',
  exceptionCreateRR: 'Raises a Replacement Request for an open exception, sourced from a chosen supplier. One replacement per exception.',
  rrApprove: 'Approves a replacement with an expected ship date and ETA, once only. Creates the replacement shipment and its receiving.',
  createPackage: 'Assigns a PAC number to a received item. Refused while the item is still on order.',
  assignPicker: 'Names the picker who will collect the item.',
  setPayment: 'Sets the item\'s payment to Paid, Unpaid or Credit.',
  approveOverride: 'Lets an unpaid item through the gate and dispatch, with a reason and a valid-until date in the future.',
  gateRelease: 'Releases an item from the Readiness Gate to Pick. Needs a package, a picker and settled payment.',
  pickDone: 'Marks the item picked and sends it straight to Pack & QC. The picker is deliberately not carried forward.',
  qcAssign: 'Pack & QC: names the packer, who is also the quality checker. Approve and Reject are refused until this is done.',
  qcApprove: 'Approves at QC. Goes to Crate if the item needs crating, otherwise straight to Order Aggregation.',
  qcReject: 'Rejects at QC with a reason and raises a Fulfillment exception.',
  qcRecheck: 'Puts a rejected item (or one whose replacement arrived) back in Pack & QC for a fresh check, with no packer assigned.',
  packageCreateOrder: 'Sales Order Report and Pre-Order: creates one package for a whole Sales Order, with a Delivery Type. Every item must be received.',
  ecRework: 'Exception Control: sends a QC reject to rework.',
  ecUnrepairable: 'Exception Control: marks a QC reject unrepairable, which is what allows a replacement to be requested.',
  ecComplete: 'Exception Control: finishes the rework, closes the exception and lets the item be rechecked.',
  transferCreate: 'Transfer Item: creates a warehouse request or a warehouse-to-warehouse transfer.',
  transferAdvance: 'Transfer Item: moves a request to Done, or a transfer through Dispatched to Received.',
  salesReturnCreate: 'Archived: opens a sales return for a completed or failed delivery. Once per delivery.',
  salesReturnSendToBooks: 'Sales Returns: sends a return to Books with an RMA number, reason, quantity and signature.',
  siteVisitCreate: 'Field Service Site Visits: schedules an assessment for a service request.',
  siteVisitUpdate: 'Field Service Site Visits: records whether the site is ready, with notes.',
  truckChecklistCreate: 'Truck Maintenance: opens a daily vehicle checklist.',
  truckChecklistAdvance: 'Truck Maintenance: starts a checklist, then completes it with a signature.',
  truckEntryAdd: 'Truck Maintenance: adds a fuel or service entry.',
  scheduleRequestCreate: 'Schedule Requests: records a client request to move a delivery date.',
  scheduleRequestDecide: 'Schedule Requests: confirms (the delivery starts from the new date) or declines with a reason.',
  crateSet: 'Updates Crating Status: Pending, In Progress or Done.',
  crateComplete: 'Moves a crated item on to Order Aggregation. Refused until Crating Status is Done.',
  dispatch: 'Dispatches an item from Order Aggregation. Blocked on payment, once only, and creates the Service Request in Delivery Management.',
  srSetInitial: 'Sets or changes the initial delivery date, which anchors the scheduling engine\'s search.',
  srConfirmSite: 'Confirms the site with a method and notes. Both are required, and only a person can confirm.',
  srHandOff: 'Hands a job from Initial Scheduling to Service Request. Needs an initial date.',
  srSchedule: 'Runs the scheduling engine: earliest team with room from the initial date, skipping Sundays and days off. Pick Up jobs skip the engine.',
  srStart: 'Starts a Scheduled job, moving it to Ongoing.',
  srComplete: 'Completes an Ongoing job.',
  srFail: 'Marks an Ongoing job failed with a reason and sends it to the Exception Queue.',
  srResolve: 'Resolves a failed delivery by Rescheduling (new date, priority job) or Reverting to System (engine starts over).',
  supplierRespondInquiry: 'Supplier portal: a supplier answers an inquiry line with availability, lead time and prices. Only while the line is Waiting or Submit Response. Unavailable or Cannot Produce declines it and removes it from the supplier queue.',
  supplierCollateral: 'Supplier portal: the selected supplier confirms the product collateral (sample, 3D image, drawing, specification). When every item is Completed or N/A the response is Completed and locked for good.',
  supplierRespondPR: 'Supplier portal: a supplier quotes a purchase request raised by hand. A PR that came from an inquiry is view-only, and a held or cancelled PR cannot be quoted.',
  supplierAckPO: 'Supplier portal: the supplier acknowledges a sent PO with an ETD and ETA, which confirms it and creates the shipment. Blocked if every line is held or cancelled.',
  supplierShip: 'Supplier portal: the supplier ships a pending shipment with a date shipped (not in the future) and a mode. The shipment goes In Transit.',
  supplierApproveRR: 'Supplier portal: the supplier approves a replacement request with a mode, expected ship date and ETA. It becomes Acknowledged and the replacement shipment is created.',
  supplierRRProgress: 'Supplier portal: the supplier moves an approved replacement forward to In Production, then Shipped, and may update the dates. Shipped puts the replacement shipment In Transit. It never goes backwards.',
  poCancel: 'Cancels a Draft, Sent or Confirmed PO that has not shipped, with a reason. Its pending shipment and receiving are removed and its PRs return to the Ready queue.',
  rrCancel: 'Cancels a replacement before it ships, with a reason. The replacement shipment is removed and the exception opens again.',
  rrClose: 'Closes a replacement that has been received.',
  exceptionRaise: 'Raises an exception by hand (Raise Exception): source, item, type, quantity and optional supplier and notes.',
  exceptionReview: 'Assigns an exception to a person with a due date and department. It then reads Under Review.',
  exceptionResolve: 'Resolves an Open or Under Review exception by hand, with a note about how it was resolved.',
  receivingSendToBooks: 'Sends a receiving that was counted in full to Books. Once only.',
  receivingCreate: 'New Receiving, Create From Scratch: a receiving with no PO, for goods that arrived without one. Needs a supplier, an item and a quantity.',
  teamCapacity: 'Sets how many jobs a team can take per day.',
  teamToggleOff: 'Marks a date as a day off for a team, or brings the team back if it was already off.',
};

// Rules that describe behaviour rather than refuse a step, so the code never names them.
const RULE_IMPLEMENTED_BY = {
  'INQ.SO': ['inquiryApprove'],
  'FC.WINDOW': ['forecastSettingsSave'],
  'FC.ANCHOR': ['forecastSettingsSave'],
  'FC.STOCK': ['forecastSettingsSave'],
  'FC.TARGET': ['forecastSettingsSave'],
  'FC.SEVERITY': ['forecastSettingsSave'],
  'FC.SOURCE': ['forecastSettingsSave'],
  'PR.READY': ['prCreate', 'prEdit', 'prSetSrp', 'prResume'],
  'PR.PRICE': ['prSetSrp', 'prEdit'],
  'PR.RECOMMEND': ['prEdit', 'prCreate'],
  'PR.LOAD': ['prGroupCreatePO'],
  'INQ.READINESS': ['inquiryEstimate'],
  'INQ.MARGIN': ['inquiryApproveSrp'],
  'INQ.TAGGED': ['inquiryCreate'],
  'INQ.QUOTE_GROUP': ['inquiryCreate', 'inquiryUpdate'],
  'INQ.ESTIMATE_GROUP': ['inquiryEstimate'],
  'INQ.PROJECT_CODE': ['projectCreate'],
  'PR.HOLD_FLAG': ['prHold', 'prResume'],
  'PO.ONE_PER_SUPPLIER': ['prConvert'],
  'PO.LOCAL': ['poSend'],
  'PO.ACK_AUTO': ['poAcknowledge'],
  'PO.COMPLETE': ['receive'],
  'EXC.SEVERITY': ['exceptionRaise'],
  'SHP.FLAGS': ['shipmentTransit', 'shipmentArrive'],
  'PACK.PACKER': ['qcAssign'],
  'SUP.DECLINE': ['supplierRespondInquiry', 'supplierRespondPR'],
  'SUP.VISIBLE': ['supplierAckPO', 'supplierShip'],
  'SHP.ARRIVE': ['shipmentArrive'],
  'RCV.EXCEPTION': ['receive'],
  'RCV.ONE': ['poAcknowledge', 'shipmentArrive'],
  'RCV.STOCK': ['receive'],
  'RR.CLONE': ['rrApprove'],
  'PICK.NEXT': ['pickDone'],
  'QC.ROUTE': ['qcApprove'],
  'OA.DMS': ['dispatch'],
  'DMS.PICKUP': ['srSchedule'],
  'DMS.ENGINE': ['srSchedule'],
};

const ENTITY_INFO = {
  inquiries: ['Inquiry', 'A customer enquiry that is quoted by a supplier, estimated, and approved into a Sales Order.'],
  prs: ['Purchase Request', 'One request per Sales Order item that must be bought from a supplier.'],
  pos: ['Purchase Order', 'The order sent to a supplier. One per supplier per conversion.'],
  shipments: ['Shipment', 'A supplier shipment on its way to the warehouse. Replacement shipments carry an RR number instead of a PO.'],
  receivings: ['Receiving', 'The count of goods off a shipment. One per shipment.'],
  exceptions: ['Exception', 'Damaged, missing or QC-rejected goods. Source is Procurement or Fulfillment.'],
  rrs: ['Replacement Request', 'A request for a supplier to replace goods from an exception.'],
  items: ['Fulfillment item', 'One record per Sales Order item, carried through every Fulfillment stage by changing its stage.'],
  serviceRequests: ['Service Request', 'A delivery job in Delivery Management, from Initial Scheduling to Completed.'],
  customers: ['Customer', 'A customer from the customer master, with type, contacts and billing and shipping addresses.'],
  projects: ['Project', 'A customer project with a PRJ-xxxxx code and a group discount. Inquiries of the same project and discount share a quote group.'],
  products: ['Catalog item', 'An item in the product catalog. Picking one on an inquiry autofills SKU, description, unit and SRP.'],
  timeline: ['Timeline entry', 'One line of an inquiry history: created, updated (with the changed fields), SRP approved, estimate, messages, deleted.'],
  messages: ['Supplier message', 'One message in an inquiry conversation with Fenteng or Tony.'],
  notes: ['Internal note', 'One note in the Sales and Purchasing conversation on an inquiry.'],
  transfers: ['Transfer', 'A warehouse request or a warehouse-to-warehouse transfer.'],
  salesReturns: ['Sales Return', 'A return for a completed or failed delivery, sent to Books with an RMA.'],
  siteVisits: ['Site visit', 'A site assessment before installation or repair.'],
  truckChecks: ['Truck checklist', 'A daily vehicle checklist: Open, In Progress, Completed with a signature.'],
  truckEntries: ['Truck entry', 'A fuel or service entry for a truck.'],
  scheduleRequests: ['Schedule request', 'A client request to move a delivery date.'],
  teams: ['Team', 'A delivery team with a daily job capacity and days off.'],
  suppliers: ['Supplier', 'The recognised suppliers. HC System is Local sourcing; Warehouse Stock means no purchase.'],
  audit: ['Audit entry', 'One line per workflow step taken.'],
};

// [from, to, action]. Validated against the real action list.
const LIFECYCLES = {
  inquiries: { field: 'status', edges: [['Open', 'Estimate Created', 'inquiryEstimate'], ['Estimate Created', 'Sales Order', 'inquiryApprove']], note: 'Readiness (Not Ready, In Progress, Ready) is never stored. It is worked out from five conditions each time, see [[INQ.READINESS]]. An estimate needs Ready, and a group estimate also moves the other Ready inquiries of the project to Estimate Created.' },
  prs: { field: 'status', edges: [['For Sourcing', 'Ready for PO', 'prEdit'], ['Ready for PO', 'For Sourcing', 'prEdit'], ['Ready for PO', 'Converted to PO', 'prGroupCreatePO']], note: 'The move between For Sourcing and Ready for PO is automatic. It is recomputed after [[prCreate]], [[prEdit]], [[prSetSrp]] and [[prResume]], see [[PR.READY]]. On Hold and Cancelled are a separate `hold` flag set by [[prHold]] and cleared by [[prResume]]; the status underneath never changes.' },
  shipments: { field: 'status', edges: [['Pending', 'In Transit', 'shipmentTransit'], ['In Transit', 'Arrived', 'shipmentArrive']] },
  receivings: { field: 'status', edges: [['Open', 'Partial', 'receive'], ['Open', 'Received', 'receive'], ['Partial', 'Received', 'receive'], ['Open', 'Closed – Exceptions', 'receive'], ['Partial', 'Closed – Exceptions', 'receive']] },
  exceptions: { field: 'status', edges: [['Open', 'RR Created', 'exceptionCreateRR'], ['RR Created', 'Closed', 'receive']], note: 'Closed happens when the replacement shipment is received in full.' },
  rrs: { field: 'status', edges: [['Open', 'Acknowledged', 'rrApprove'], ['Acknowledged', 'In Production', 'supplierRRProgress'], ['In Production', 'Shipped', 'supplierRRProgress'], ['Acknowledged', 'Shipped', 'supplierRRProgress'], ['Shipped', 'Received', 'receive']], note: 'Received comes only from the physical receipt of the replacement shipment. The supplier moves it from Acknowledged to In Production to Shipped, never backwards.' },
  items: {
    field: 'stage',
    edges: [['Readiness Gate', 'Pick', 'gateRelease'], ['Pick', 'QC', 'pickDone'], ['QC', 'Crate', 'qcApprove'], ['QC', 'Order Aggregation', 'qcApprove'], ['Crate', 'Order Aggregation', 'crateComplete'], ['QC', 'QC', 'qcRecheck'], ['Order Aggregation', 'Dispatched', 'dispatch']],
    note: 'QC goes to Crate only when the item needs crating. A rejected item stays in QC until [[qcRecheck]] puts it back for a fresh check.',
  },
  serviceRequests: {
    field: 'status',
    edges: [['Initial Scheduling', 'Service Request', 'srHandOff'], ['Service Request', 'Scheduled', 'srSchedule'], ['Scheduled', 'Ongoing', 'srStart'], ['Ongoing', 'Completed', 'srComplete'], ['Ongoing', 'Exception', 'srFail'], ['Exception', 'Service Request', 'srResolve']],
  },
};

const PIPELINE_ORDER = ['Procurement', 'Fulfillment', 'Delivery Management'];

// Where work goes next, by page label. Side branches (exceptions, failed deliveries) are included.
// Validated against the real pages, and "Before" is derived by inverting it.
const FLOW_NEXT = {
  'Procurement Dashboard': ['Inquiry List'],
  'Inquiry List': ['Purchase Request', 'Order Readiness'],
  'Purchase Request': ['Purchase Order'],
  'Purchase Order': ['Shipments'],
  'Shipments': ['Receiving'],
  'Receiving': ['Order Readiness', 'Exceptions'],
  'Exceptions': ['Replacement Request'],
  'Replacement Request': ['Shipments'],
  'Forecast Setting': [],
  'Order Readiness': ['Pick'],
  'Pick': ['Pack & QC'],
  'Pack & QC': ['Crate', 'To Ship', 'Exceptions'],
  'Crate': ['To Ship'],
  'To Ship': ['Initial Scheduling'],
  'Initial Scheduling': ['Service Request'],
  'Service Request': ['Service Appointment'],
  'Service Appointment': ['Ongoing Service'],
  'Ongoing Service': ['DMS Exception Queue'],
  'DMS Exception Queue': ['Service Request'],
};

// ───────────────────────── reading the source ─────────────────────────

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const lineOf = (src, index) => src.slice(0, index).split('\n').length;

function parseActions() {
  const src = read('src/domain/actions.js');
  const re = /^  (\w+)\(d, p(?:, (?:ctx|\{[^}]*\}))?\) \{$/gm;
  const found = [];
  let m;
  while ((m = re.exec(src))) found.push({ name: m[1], index: m.index });

  // Shared helpers above the ACTIONS object (cleanQuotes, applyInquiryData, logTimeline...) enforce rules and
  // create records on behalf of the steps that call them, so a step inherits everything its helpers do.
  const actionsStart = src.indexOf('export const ACTIONS');
  const helperRe = /^(?:export )?function (\w+)\(/gm;
  const helperHeads = [];
  while ((m = helperRe.exec(src)) && m.index < actionsStart) helperHeads.push({ name: m[1], index: m.index });
  const scan = (body) => ({
    rules: [...body.matchAll(/'([A-Z]+(?:\.[A-Z_]+)+)'/g)].map((x) => x[1]),
    creates: [...body.matchAll(/\bd\.(\w+)\.push\(/g)].map((x) => x[1]),
  });
  const helpers = {};
  helperHeads.forEach((h, i) => {
    const end = i + 1 < helperHeads.length ? helperHeads[i + 1].index : actionsStart;
    helpers[h.name] = { body: src.slice(h.index, end) };
  });
  const resolve = (body, seen = new Set()) => {
    const own = scan(body);
    for (const [name, h] of Object.entries(helpers)) {
      if (seen.has(name) || !new RegExp(`\\b${name}\\(`).test(body)) continue;
      seen.add(name);
      const sub = resolve(h.body, seen);
      own.rules.push(...sub.rules);
      own.creates.push(...sub.creates);
    }
    return own;
  };

  return found.map((a, i) => {
    const end = i + 1 < found.length ? found[i + 1].index : src.indexOf('\n};', a.index);
    const all = resolve(src.slice(a.index, end));
    return { name: a.name, line: lineOf(src, a.index), rules: [...new Set(all.rules)], creates: [...new Set(all.creates)] };
  });
}

// The menu is data (src/live-spec.js), so the vault reads it directly. A page's note name is its label, except on the two
// supplier portals, which share labels with Procurement and with each other.
async function loadSpec() {
  const spec = await import(pathToFileURL(path.join(ROOT, 'src/live-spec.js')).href);
  const noteName = (section, p) => (section.supplier ? `${section.label} - ${p.label}` : p.label);
  const groups = [...spec.SECTIONS, spec.REFERENCE].map((section) => ({
    group: section.label,
    items: section.pages.map((p) => ({ ...p, pageLabel: p.label, label: noteName(section, p) })),
  }));
  return groups;
}

function parseScreens(specPages) {
  const out = {};
  const blurbOf = (p) => specPages.find((x) => x.path === p).blurb;
  for (const file of ['src/pages/screens.jsx', 'src/pages/info.jsx', 'src/pages/extras.jsx']) {
    const src = read(file);
    const re = /^export function (\w+)\((?:[^)]*)\) \{/gm;
    const found = [];
    let m;
    while ((m = re.exec(src))) found.push({ name: m[1], index: m.index });
    found.forEach((f, i) => {
      const body = src.slice(f.index, i + 1 < found.length ? found[i + 1].index : src.length);
      const title = (body.match(/title="([^"]+)"/) || [])[1] || '';
      const subtitle = (body.match(/subtitle="([^"]+)"/) || [])[1] || '';
      const actions = [...new Set([...body.matchAll(/\bname: '(\w+)'/g), ...body.matchAll(/\baction: '(\w+)'/g)].map((x) => x[1]))];
      const reads = [...new Set([...body.matchAll(/db\.(inquiries|customers|projects|products|timeline|messages|notes|prs|pos|shipments|receivings|exceptions|rrs|items|serviceRequests|teams)\b/g)].map((x) => x[1]))];
      out[f.name] = { file, title, subtitle, actions, reads };
    });
  }
  // Some modules are a folder of components sharing one route. Their steps are every act('...') call and every
  // Screen action declaration (name: '...') in the folder.
  const DIR_PAGES = {
    InquiryPage: { dir: 'src/pages/inquiry', path: 'procurement/inquiry', title: 'Inquiry', reads: ['inquiries', 'customers', 'projects', 'products', 'timeline', 'messages', 'notes'] },
    ForecastPage: { dir: 'src/pages/forecast', path: 'procurement/forecast', title: 'Forecast Setting', reads: ['prs', 'shipments', 'items', 'inquiries', 'serviceRequests'] },
    ProcurementDashboard: { dir: 'src/pages/procurement', path: 'procurement/dashboard', title: 'Procurement Dashboard', reads: ['inquiries', 'prs', 'pos', 'shipments', 'receivings', 'exceptions', 'rrs'] },
    PRPage: { dir: 'src/pages/pr', path: 'procurement/pr', title: 'Purchase Request', reads: ['prs', 'pos', 'products', 'customers'] },
    SupplierInquiries: { dir: 'src/pages/supplier', files: ['InquiriesPage.jsx', 'parts.jsx'], path: 'tonfan/inquiries', title: 'Inquiries', reads: ['inquiries', 'messages', 'timeline'] },
    SupplierPR: { dir: 'src/pages/supplier', files: ['PRPage.jsx'], path: 'tonfan/pr', title: 'Purchase Request', reads: ['prs'] },
    SupplierPO: { dir: 'src/pages/supplier', files: ['POPage.jsx'], path: 'tonfan/po', title: 'Purchase Order', reads: ['pos', 'prs'] },
    SupplierShipments: { dir: 'src/pages/supplier', files: ['ShipmentsPage.jsx'], path: 'tonfan/shipments', title: 'Shipments', reads: ['shipments'] },
    SupplierRR: { dir: 'src/pages/supplier', files: ['RRPage.jsx'], path: 'tonfan/replacement', title: 'Replacement Request', reads: ['rrs', 'exceptions'] },
    DeliveryAnalytics: { dir: 'src/pages/delivery', files: ['DeliveryAnalytics.jsx'], path: 'delivery/analytics', title: 'Delivery Analytics', reads: ['serviceRequests', 'teams'] },
    TeamsScreen: { dir: 'src/pages/delivery', files: ['TeamsScreen.jsx'], path: 'delivery/availability', title: 'Daily Team Availability', reads: ['serviceRequests', 'teams'] },
    InitialSchedulingScreen: { dir: 'src/pages/delivery', files: ['InitialSchedulingScreen.jsx'], path: 'delivery/initial', title: 'Initial Scheduling', reads: ['serviceRequests'] },
    ServiceRequestScreen: { dir: 'src/pages/delivery', files: ['ServiceRequestScreen.jsx'], path: 'delivery/requests', title: 'Service Request', reads: ['serviceRequests'] },
    AppointmentScreen: { dir: 'src/pages/delivery', files: ['AppointmentScreen.jsx'], path: 'delivery/appointments', title: 'Service Appointment', reads: ['serviceRequests', 'teams'] },
    OngoingScreen: { dir: 'src/pages/delivery', files: ['OngoingScreen.jsx'], path: 'delivery/ongoing', title: 'Ongoing Service', reads: ['serviceRequests', 'teams'] },
    Archived: { dir: 'src/pages/delivery', files: ['ArchivedScreen.jsx'], path: 'delivery/archived', title: 'Archived', reads: ['serviceRequests', 'salesReturns', 'teams'] },
    SiteVisits: { dir: 'src/pages/delivery', files: ['SiteVisitsScreen.jsx'], path: 'delivery/site-visits', title: 'Field Service Site Visits', reads: ['siteVisits', 'serviceRequests'] },
    SalesReturns: { dir: 'src/pages/delivery', files: ['SalesReturnsScreen.jsx'], path: 'delivery/returns', title: 'Sales Returns', reads: ['salesReturns', 'serviceRequests'] },
    DmsExceptionScreen: { dir: 'src/pages/delivery', files: ['DmsExceptionScreen.jsx'], path: 'delivery/exceptions', title: 'DMS Exception Queue', reads: ['serviceRequests', 'teams'] },
    TruckMaintenance: { dir: 'src/pages/delivery', files: ['TruckMaintenanceScreen.jsx'], path: 'delivery/trucks', title: 'Truck Maintenance', reads: ['truckChecks', 'truckEntries'] },
    ScheduleRequests: { dir: 'src/pages/delivery', files: ['ScheduleRequestsScreen.jsx'], path: 'delivery/schedule-requests', title: 'Schedule Requests', reads: ['scheduleRequests', 'serviceRequests'] },
  };
  for (const [component, info] of Object.entries(DIR_PAGES)) {
    const dir = path.join(ROOT, info.dir);
    const calls = fs.readdirSync(dir).filter((f) => f.endsWith('.jsx') && (!info.files || info.files.includes(f))).flatMap((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      return [...text.matchAll(/\bact\('(\w+)'/g), ...text.matchAll(/\bname: '(\w+)'/g)].map((x) => x[1]);
    });
    out[component] = { file: info.dir + '/', title: info.title, subtitle: blurbOf(info.path), actions: [...new Set(calls)], reads: info.reads };
  }
  return out;
}

// ───────────────────────── markdown helpers ─────────────────────────

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const fm = (obj) => `---\n${Object.entries(obj).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : typeof v === 'string' && /[:#\[\]{}]/.test(v) ? q(v) : v}`).join('\n')}\n---\n\n`;
const link = (n) => `[[${n}]]`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tagOf = (s) => slug(s);
const mermaidId = (s) => s.replace(/[^A-Za-z0-9]/g, '_');

function table(head, rows) {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

// ───────────────────────── build ─────────────────────────

const STATUS_TEXT = { built: 'matches the live page', partial: 'built, not yet at parity', placeholder: 'not built yet' };

// What the live page has (from live-spec.js), and what ours is still missing (from the parity baseline).
function liveSpecText(p, gaps) {
  const list = (title, items) => (items.length ? `- **${title}:** ${items.join(' · ')}\n` : '');
  const body = list('Inner tabs', p.tabs) + list('Stat cards', p.stats) + list('Buttons', p.buttons) + list('Widgets', p.widgets || []);
  if (!body && !gaps.length) return '';
  return `## What the live page has\n\n${body}\n` + (gaps.length ? `### Still missing from this page\n\n${gaps.map((g) => `- ${g}`).join('\n')}\n\n` : '');
}

export async function buildVault(outDir) {
  const { RULES } = await import(pathToFileURL(path.join(ROOT, 'src/domain/rules.js')).href);
  const { seedDb } = await import(pathToFileURL(path.join(ROOT, 'src/domain/seed.js')).href);

  const actions = parseActions();
  const navGroups = await loadSpec();
  const specPages = navGroups.flatMap((g) => g.items);
  const screens = parseScreens(specPages);
  const baselineFile = path.join(ROOT, 'ui-tests/parity-baseline.json');
  const parityGaps = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
  const db = seedDb('2026-11-11');
  const files = new Map();
  const put = (rel, text) => files.set(rel, text);

  // ── Validation: fail loudly when the code outgrows this file ──
  const problems = [];
  const actionNames = new Set(actions.map((a) => a.name));
  const ruleIds = new Set(RULES.map((r) => r.id));
  for (const a of actions) {
    if (!ACTION_INFO[a.name]) problems.push(`Action "${a.name}" has no entry in ACTION_INFO.`);
    for (const r of a.rules) if (!ruleIds.has(r)) problems.push(`Action "${a.name}" refuses with unknown rule ${r}.`);
  }
  for (const n of Object.keys(ACTION_INFO)) if (!actionNames.has(n)) problems.push(`ACTION_INFO describes "${n}", which is not in actions.js.`);
  const usedByCode = new Set(actions.flatMap((a) => a.rules));
  for (const r of RULES) {
    if (!usedByCode.has(r.id) && !RULE_IMPLEMENTED_BY[r.id]) problems.push(`Rule ${r.id} is neither enforced by an action nor listed in RULE_IMPLEMENTED_BY.`);
  }
  for (const [rid, names] of Object.entries(RULE_IMPLEMENTED_BY)) {
    if (!ruleIds.has(rid)) problems.push(`RULE_IMPLEMENTED_BY names unknown rule ${rid}.`);
    for (const n of names) if (!actionNames.has(n)) problems.push(`RULE_IMPLEMENTED_BY maps ${rid} to unknown action ${n}.`);
  }
  for (const [coll, lc] of Object.entries(LIFECYCLES)) {
    for (const [, , a] of lc.edges) if (!actionNames.has(a)) problems.push(`Lifecycle ${coll} uses unknown action ${a}.`);
  }
  for (const g of navGroups) for (const i of g.items) {
    if (!i.blurb) problems.push(`Route ${i.path} has no blurb in live-spec.js.`);
    if (i.status !== 'placeholder' && !screens[i.component]) problems.push(`Route ${i.path} uses component ${i.component}, which was not found in src/pages.`);
  }
  if (problems.length) throw new Error('Vault build refused:\n - ' + problems.join('\n - '));

  // ── Derived maps ──
  const pageByAction = new Map();
  const pages = [];
  for (const g of navGroups) {
    for (const item of g.items) {
      const scr = item.status === 'placeholder' ? { title: item.title || item.pageLabel, actions: [], reads: [], file: 'src/pages/Placeholder.jsx' } : screens[item.component];
      const page = { ...item, module: g.group, title: scr.title || item.pageLabel, blurb: item.blurb, actions: scr.actions.filter((a) => actionNames.has(a)), reads: scr.reads, file: scr.file, component: item.status === 'placeholder' ? 'Placeholder' : item.component };
      pages.push(page);
      for (const a of page.actions) {
        if (!pageByAction.has(a)) pageByAction.set(a, []);
        pageByAction.get(a).push(page);
      }
    }
  }
  const implementers = new Map();
  for (const r of RULES) {
    const names = new Set(actions.filter((a) => a.rules.includes(r.id)).map((a) => a.name));
    (RULE_IMPLEMENTED_BY[r.id] || []).forEach((n) => names.add(n));
    implementers.set(r.id, [...names]);
  }
  const pageName = (p) => p.label;
  const nameClash = pages.map((p) => p.label).filter((l, i, arr) => arr.indexOf(l) !== i);
  if (nameClash.length) throw new Error('Duplicate page labels: ' + nameClash.join(', '));
  const labels = new Set(pages.map((p) => p.label));
  const flowBefore = {};
  for (const [from, tos] of Object.entries(FLOW_NEXT)) {
    if (!labels.has(from)) throw new Error(`FLOW_NEXT names unknown page "${from}".`);
    for (const to of tos) {
      if (!labels.has(to)) throw new Error(`FLOW_NEXT sends "${from}" to unknown page "${to}".`);
      (flowBefore[to] ||= []).push(from);
    }
  }

  // ── Rules ──
  for (const r of RULES) {
    const impl = implementers.get(r.id);
    const onPages = [...new Set(impl.flatMap((n) => (pageByAction.get(n) || []).map(pageName)))];
    const codeActions = actions.filter((a) => a.rules.includes(r.id));
    put(`Rules/${r.id}.md`,
      fm({ title: r.id, tags: ['rule', r.tag.toLowerCase()], rule: r.id, kind: r.tag, module: r.module }) +
      `# ${r.id}\n\n> ${r.text}\n\n**Kind:** ${r.tag} · **Module:** ${r.module}\n\n` +
      (codeActions.length
        ? `## Enforced by\n${codeActions.map((a) => `- ${link(a.name)} (\`src/domain/actions.js:${a.line}\`)`).join('\n')}\n\n`
        : '') +
      (RULE_IMPLEMENTED_BY[r.id] ? `## Describes behaviour of\n${RULE_IMPLEMENTED_BY[r.id].map((n) => `- ${link(n)}`).join('\n')}\n\nThis rule is documentation of what the step does by itself. No code path refuses with it.\n\n` : '') +
      (onPages.length ? `## Seen on\n${onPages.map((p) => `- ${link(p)}`).join('\n')}\n\n` : '') +
      `Back to ${link('Rules Index')}.\n`);
  }

  const byTag = {};
  RULES.forEach((r) => (byTag[r.tag] ||= []).push(r));
  put('Rules Index.md',
    fm({ title: 'Rules Index', tags: ['index', 'rule'] }) +
    `# Rules Index\n\n${RULES.length} rules. A refusal in the app names its rule id, which is the note name here.\n\n` +
    Object.entries({ BLOCKS: 'The system stops you.', REQUIRED: 'A field you must fill in.', AUTOMATIC: 'The system does it by itself.', REFERENCE: 'A fact about how a module behaves.' })
      .map(([tag, meaning]) => `## ${tag}\n*${meaning}* (${(byTag[tag] || []).length})\n\n${table(['Rule', 'Module', 'What it says'], (byTag[tag] || []).map((r) => [link(r.id), r.module, r.text]))}\n`).join('\n'));

  // ── Actions ──
  for (const a of actions) {
    const where = pageByAction.get(a.name) || [];
    const mod = where[0]?.module || 'Domain';
    const ruleList = [...new Set([...a.rules, ...Object.entries(RULE_IMPLEMENTED_BY).filter(([, n]) => n.includes(a.name)).map(([id]) => id)])];
    put(`Actions/${a.name}.md`,
      fm({ title: a.name, tags: ['action', tagOf(mod)], module: mod, source: `src/domain/actions.js:${a.line}` }) +
      `# ${a.name}\n\n${ACTION_INFO[a.name]}\n\n**Source:** \`src/domain/actions.js:${a.line}\`\n\n` +
      (where.length ? `## Offered on\n${where.map((p) => `- ${link(pageName(p))} (${p.module})`).join('\n')}\n\n` : '') +
      (a.creates.length ? `## Creates records in\n${a.creates.map((c) => `- ${link(c)}`).join('\n')}\n\n` : '') +
      (ruleList.length ? `## Rules\n${ruleList.map((r) => `- ${link(r)}: ${RULES.find((x) => x.id === r).text}`).join('\n')}\n\n` : '') +
      `## How it behaves\nA step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See ${link('How the engine works')}.\n`);
  }

  // ── Entities ──
  const collections = Object.keys(db).filter((k) => Array.isArray(db[k]));
  for (const coll of collections) {
    const rows = db[coll];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const [label, blurb] = ENTITY_INFO[coll] || [coll, ''];
    if (!ENTITY_INFO[coll]) throw new Error(`Collection "${coll}" has no ENTITY_INFO entry.`);
    const lc = LIFECYCLES[coll];
    const seen = lc ? [...new Set(rows.map((r) => r[lc.field]).filter(Boolean))] : [];
    const readBy = pages.filter((p) => p.reads.includes(coll));
    const createdBy = actions.filter((a) => a.creates.includes(coll));
    const sample = rows[0] ? JSON.stringify(rows[0], null, 2) : '{}';
    put(`Data Model/${coll}.md`,
      fm({ title: coll, tags: ['entity'], label }) +
      `# ${coll}\n\n**${label}.** ${blurb}\n\n${rows.length} rows in the sample data.\n\n` +
      (createdBy.length ? `## Created by\n${createdBy.map((a) => `- ${link(a.name)}`).join('\n')}\n\n` : '') +
      (readBy.length ? `## Shown on\n${readBy.map((p) => `- ${link(pageName(p))}`).join('\n')}\n\n` : '') +
      (lc ? `## Lifecycle (\`${lc.field}\`)\n\n\`\`\`mermaid\nflowchart LR\n${lc.edges.map(([f, t, a]) => `  ${mermaidId(f)}["${f}"] -->|${a}| ${mermaidId(t)}["${t}"]`).join('\n')}\n\`\`\`\n\n${table(['From', 'To', 'Step'], lc.edges.map(([f, t, a]) => [f, t, link(a)]))}\n\n${lc.note ? lc.note + '\n\n' : ''}Values seen in the sample data: ${seen.map((s) => `\`${s}\``).join(', ')}.\n\n` : '') +
      `## Fields\n${keys.map((k) => `- \`${k}\``).join('\n')}\n\n## A sample row\n\n\`\`\`json\n${sample}\n\`\`\`\n\nUp: ${link('Data Model')}.\n`);
  }
  put('Data Model.md',
    fm({ title: 'Data Model', tags: ['index', 'entity'] }) +
    `# Data Model\n\nThe whole database is one JSON object held in the browser (see ${link('How the engine works')}). Each collection is an array of plain records.\n\n` +
    table(['Collection', 'What it is', 'Rows in sample'], collections.map((c) => [link(c), (ENTITY_INFO[c] || [])[1] || '', db[c].length])) +
    `\n\n## How the records connect\n\n\`\`\`mermaid\nflowchart TD\n  inquiries -->|inquiryApprove| items\n  inquiries -->|inquiryApprove| prs\n  prs -->|prConvert| pos\n  pos -->|poAcknowledge| shipments\n  pos -->|poAcknowledge| receivings\n  shipments -->|shipmentArrive| receivings\n  receivings -->|receive: damaged or missing| exceptions\n  exceptions -->|exceptionCreateRR| rrs\n  rrs -->|rrApprove| shipments\n  receivings -->|receive: in full| items\n  items -->|qcReject| exceptions\n  items -->|dispatch| serviceRequests\n  teams -->|srSchedule| serviceRequests\n\`\`\`\n\n` +
    `**The links are by number, not by id:** a PR points at its PO by \`poNo\`, an item points at its PR by \`prNo\` and at its Service Request by \`srNo\`. Records point back to their source by internal id where the code needs to follow them (\`poId\`, \`shipmentId\`, \`itemId\`).\n`);

  // ── Pages / modules ──
  for (const [gi, g] of navGroups.entries()) {
    g.items.forEach((item, ii) => {
      const p = pages.find((x) => x.path === item.path);
      const next = FLOW_NEXT[p.label] || [];
      const prev = flowBefore[p.label] || [];
      const steps = p.actions.map((n) => {
        const a = actions.find((x) => x.name === n);
        const rs = [...new Set([...a.rules, ...Object.entries(RULE_IMPLEMENTED_BY).filter(([, v]) => v.includes(n)).map(([id]) => id)])].filter((r) => !r.startsWith('GEN.'));
        return [link(n), ACTION_INFO[n], rs.map(link).join(', ') || '—'];
      });
      put(`Modules/${g.group}/${p.label}.md`,
        fm({ title: p.label, tags: ['page', tagOf(g.group), p.status === 'placeholder' ? 'not-built' : 'built'], module: g.group, route: `#/${p.path}`, status: p.status, source: `${p.file} (${p.component})` }) +
        `# ${p.label}\n\n> ${p.blurb}\n\n**Section:** ${link(g.group)} · **Route:** \`#/${p.path}\` · **Source:** \`${p.file}\` (\`${p.component}\`) · **Status:** ${STATUS_TEXT[p.status]}\n\n` +
        (p.reads.length ? `**Shows:** ${p.reads.map(link).join(', ')}\n\n` : '') +
        liveSpecText(p, parityGaps[p.path] || []) +
        (steps.length ? `## Steps on this page\n\n${table(['Step', 'What it does', 'Rules'], steps)}\n\n` : '') +
        ((prev.length || next.length) ? `## In the flow\n\n${prev.length ? `Work arrives from: ${prev.map(link).join(', ')}\n\n` : ''}${next.length ? `Work goes on to: ${next.map(link).join(', ')}\n` : ''}` : ''));
    });
    put(`Modules/${g.group}.md`,
      fm({ title: g.group, tags: ['module', tagOf(g.group)] }) +
      `# ${g.group}\n\n${g.items.length} page tab${g.items.length === 1 ? '' : 's'}.\n\n${table(['Page', 'Status', 'What it is for'], g.items.map((i) => { const p = pages.find((x) => x.path === i.path); return [link(p.label), STATUS_TEXT[p.status], p.blurb]; }))}\n\nUp: ${link('System Map')}.\n`);
  }

  // ── System map ──
  const gl = (title) => pages.find((p) => p.title === title || p.label === title)?.label;
  put('System Map.md',
    fm({ title: 'System Map', tags: ['index', 'architecture'] }) +
    `# System Map\n\nFrom the customer\'s first inquiry to the truck at their door.\n\n\`\`\`mermaid\nflowchart TD\n  subgraph PROC["1 · Procurement"]\n    INQ[Inquiry] --> PR[Purchase Request] --> PO[Purchase Order] --> SHP[Shipments] --> RCV[Receiving]\n    RCV -.->|damaged or missing| EXC[Exceptions] --> RR[Replacement] -.->|replacement shipment| SHP\n  end\n  subgraph FUL["2 · Fulfillment"]\n    GATE[Order Readiness] --> PICK[Pick] --> PACK[Pack] --> QC[Pack & QC]\n    QC -->|needs crate| CRATE[Crate] --> OA[To Ship]\n    QC -->|no crate| OA\n    QC -.->|rejected| EXC\n  end\n  subgraph DMS["3 · Delivery"]\n    IS[Initial Scheduling] --> SR[Service Request] --> SA[Service Appointment] --> ON[Ongoing Service]\n    ON -.->|failed| DX[DMS Exception Queue] -.->|resolve| SR\n  end\n  INQ -->|in stock| GATE\n  RCV ==>|received in full| GATE\n  OA ==>|dispatch| IS\n\`\`\`\n\n` +
    `## The three modules\n\nThe app has six sections (the dropdown in the top bar). These are the three that carry the order, and the other three are ${link('Analytic')}, ${link('Tony Fan')} and ${link('Fenteng Lighting')}.\n\n${PIPELINE_ORDER.map((m) => `- ${link(m)}: ${navGroups.find((g) => g.group === m).items.map((i) => link(pages.find((p) => p.path === i.path).label)).join(' → ')}`).join('\n')}\n\n` +
    `## The hand-offs between them\n\n` +
    table(['From', 'To', 'Happens when', 'Step'], [
      ['Inquiry List', 'Purchase Request + Fulfillment item', 'The customer approves the estimate', link('inquiryApprove')],
      ['Purchase Request', 'Purchase Order', 'Ready PRs are converted', link('prConvert')],
      ['Purchase Order', 'Shipment + Receiving', 'The supplier acknowledges', link('poAcknowledge')],
      ['Receiving', 'Order Readiness (item becomes packageable)', 'The shipment is received in full', link('receive')],
      ['Receiving', 'Exceptions', 'Any goods are damaged or missing', link('receive')],
      ['Pack & QC', 'Exceptions', 'An item is rejected', link('qcReject')],
      ['To Ship', 'Initial Scheduling', 'The item is dispatched', link('dispatch')],
      ['Ongoing Service', 'DMS Exception Queue', 'A delivery fails', link('srFail')],
    ]) + `\n\nOther starting points: ${link('Home')}, ${link('Rules Index')}, ${link('Data Model')}.\n`);

  // ── Guides ──
  put('Guides/How the engine works.md',
    fm({ title: 'How the engine works', tags: ['guide', 'architecture'] }) +
    `# How the engine works\n\n` +
    `**Everything the app can do is a function in \`src/domain/actions.js\`.** The screens only collect input and call it.\n\n` +
    `## One step\n\n1. \`run(db, name, payload)\` takes a deep copy of the whole database.\n2. The step function changes the copy and returns a message.\n3. If any guard fails it throws a \`RuleError\` carrying a rule id. The copy is discarded, so a refused step changes nothing.\n4. On success the copy becomes the new database, is saved to \`localStorage\`, and an audit line is added.\n\n` +
    `That is why the tests can assert "a refused step leaves the database untouched" and mean it.\n\n` +
    `## Rules are data\n\nEvery refusal names a rule from \`src/domain/rules.js\`. The ${link('Rules Index')} and every rule note come from that file, and the app's Rules page shows the same list.\n\n` +
    `## The seed is built by the engine\n\nThe sample data is not typed in. \`src/domain/seed.js\` creates it by running real steps (${link('inquiryCreate')}, ${link('prConvert')}, ${link('receive')}, ${link('dispatch')} and so on). Every sample record therefore sits in a state the rules would allow, and the seed breaks loudly if a rule changes.\n\n` +
    `## One screen from one declaration\n\n\`src/ui/Screen.jsx\` turns a list of columns, tabs, stats and steps into a working page: table, search, detail drawer, forms for the inputs a step needs, and CSV export. Adding a page means writing a declaration in \`src/pages/screens.jsx\` and a line in \`src/nav.js\`.\n\n` +
    `## The scheduling engine\n\n${link('srSchedule')} searches up to 14 days from the initial date (or today, if that has passed). It skips Sundays and any day a team is off, ignores teams already at capacity, and picks the least-loaded team. If nothing is free it refuses with ${link('DMS.FULL')} instead of overbooking. Pick Up jobs skip the engine entirely (${link('DMS.PICKUP')}).\n\n` +
    `## Payment\n\nAn item's payment is settled when it is Paid, on Credit, or covered by an override that has not expired. The same check guards both ${link('gateRelease')} and ${link('dispatch')}.\n`);

  put('Guides/Running the app.md',
    fm({ title: 'Running the app', tags: ['guide'] }) +
    `# Running the app\n\n\`\`\`\nnpm install\nnpm run dev        # http://localhost:5173, also reachable from phones on the same wifi\nnpm test           # workflow rules + every page renders\nnpm run build      # production build into dist/\nnpm run vault      # regenerate this Obsidian vault from the source\n\`\`\`\n\n` +
    `Data lives in the browser's \`localStorage\` under \`supply-chain-v2:db\`. **Reset sample data** on the ${link('Supply Chain Analytic')} page puts the sample records back. Clearing site data does the same.\n\n` +
    `## A good first walk-through\n\n1. ${link('Inquiry List')}: open INQ-00009, add what is missing until the readiness checklist shows 5 of 5, then create the estimate and convert it to a Sales Order.\n2. ${link('Purchase Request')}: the new PR becomes Ready for PO by itself once its four conditions pass. Use Create PO on its group. Try a group with a held PR to see how it is left out.\n3. ${link('Purchase Order')}: send it, then acknowledge with an ETD and ETA.\n4. ${link('Shipments')} then ${link('Receiving')}: mark in transit, arrived, then receive with some damaged goods and watch an exception appear.\n5. ${link('Exceptions')} then ${link('Replacement Request')}: create and approve the replacement, receive the replacement shipment.\n6. ${link('Order Readiness')}: create a package, assign a picker, set payment, release. Try releasing an unpaid item to see ${link('GATE.PAYMENT')}.\n7. Pick, then Pack & QC, then ${link('To Ship')}: dispatch.\n8. ${link('Initial Scheduling')}: set a date, confirm the site, hand off, then schedule it on ${link('Service Request')}.\n9. ${link('Forecast Setting')}: see when each open order is expected to arrive, and change the lead-time settings.\n`);

  put('Guides/Testing.md',
    fm({ title: 'Testing', tags: ['guide'] }) +
    `# Testing\n\n\`npm test\` runs three files with Node's built-in runner. No test framework is installed.\n\n` +
    table(['File', 'What it proves'], [
      ['tests/workflow.test.js', 'The rules: each gate refuses what it should, a refused step leaves the data untouched, replacements close the loop, the scheduler never overbooks.'],
      ['tests/render.test.js', 'Every page renders from the real store and sample data with no "undefined", "[object Object]" or NaN in the output.'],
      ['tests/vault.test.js', 'This vault builds, every link resolves, and nothing is orphaned.'],
    ]) +
    `\n## What is not tested\n\n- Clicking. The render test is server-side, so button handlers, forms and the drawer are untested.\n- A real browser. Nobody has looked at the layout at phone width or in dark mode.\n- Anything against Zoho. There is no Zoho connection in this app. See ${link('Differences from the Zoho system')}.\n`);

  // The real system moved on after this prototype: say so at the top of the notes that describe it.
  const PROTOTYPE_NOTE = '> [!WARNING] This is the earlier prototype\n> These notes describe the React prototype in `src/`. The real system now runs the original Zoho widgets on our own server, with a database, sign-in and users, hosted on Railway. See `vault/Deluge Scripts (Obsidian)/00 - Current System.md` and `00 - Port Status.md`.\n\n';

  put('Guides/Differences from the Zoho system.md',
    fm({ title: 'Differences from the Zoho system', tags: ['guide', 'context'] }) +
    `# Differences from the Zoho system\n\n${PROTOTYPE_NOTE}The live system runs on Zoho Creator (Deluge scripts and widgets) with Zoho Books and Inventory behind it. This app is a standalone React model of the same flow. It is not connected to any of that.\n\n` +
    table(['Live system', 'This app'], [
      ['Separate forms for Gate, Pick, Pack, QC, Crate and Order Aggregation, each synced by a script', 'One item record whose \`stage\` changes. No sync scripts, so none can drift or fail silently.'],
      ['Estimates, invoices, packages and stock in Books and Inventory', 'Estimate and package numbers are generated locally. There is no accounting.'],
      ['Rules scattered across Deluge scripts and widget code', `${RULES.length} rules in one file, enforced in one place, shown in the app.`],
      ['Many people, with roles', 'One browser, no sign-in, no roles.'],
      ['Scheduled jobs (shipment delay, forecast)', 'None. Nothing happens by itself over time.'],
      ['Supplier portals for Fenteng and Tony Fan', 'The two sections and all ten tabs are in the menu as placeholders. Suppliers are names on records, and their steps (quote, acknowledge, approve replacement) are done from the buyer side for now.'],
      ['Delivery forecast, urgency levels, PR on-hold plan, supplier load balancing', 'PR hold/cancel is built. The others are not.'],
    ]) +
    `\nThe flow, the status names and the main gates follow the documentation of the live system. The set of rules here is smaller than the live system's.\n`);

  put('Guides/Design decisions.md',
    fm({ title: 'Design decisions', tags: ['guide', 'decisions'] }) +
    `# Design decisions\n\n` +
    `- **Hold is a flag, not a status.** A held PR keeps its real status, so ${link('prResume')} puts it back exactly. See ${link('PR.HOLD_FLAG')}.\n` +
    `- **Items wait for the replacement, not just the first delivery.** If a delivery has damaged goods, the Sales Order item is not released until the replacement shipment is received in full. See ${link('RCV.STOCK')} and ${link('RR.CLONE')}.\n` +
    `- **A replacement only completes by physical receipt.** There is deliberately no "mark completed" button on a Replacement Request.\n` +
    `- **Dispatch is once only.** The item remembers its Service Request number, so a second click cannot create a second job. See ${link('OA.DEDUP')}.\n` +
    `- **A full calendar refuses.** The scheduler will not overbook a team. A person decides, for example by raising capacity on ${link('Daily Team Availability')}.\n` +
    `- **Dates are plain ISO strings.** They sort, compare and save without time-zone surprises.\n` +
    `- **Step functions take "today" as an input.** That is what lets tests check an override expiring tomorrow.\n` +
    `- **The vault is generated.** Descriptions and lifecycles live in \`tools/build-vault.mjs\`, and the build refuses if a new action, rule or page is added without one.\n`);

  put('Guides/Not built yet.md',
    fm({ title: 'Not built yet', tags: ['guide', 'backlog'] }) +
    `# Not built yet\n\n${PROTOTYPE_NOTE}Every tab of the live app exists in the menu. The pages marked **not built yet** show a placeholder, and the built pages list what they still lack under *Still missing from this page*.\n\n- Sign-in, roles and who-did-it on the audit trail.\n- A shared database, so more than one person can work at once. Today the data is in one browser.\n- Notifications beyond the bell, which lists recent steps.\n- Attachments, photos and signatures.\n- The supplier portals (${link('Tony Fan')} and ${link('Fenteng Lighting')}): placeholders for now.\n- Scheduled jobs: delivery forecast, shipment delay flagging, urgency.\n- Accounting and stock integration.\n- Clicking tests and a real-browser visual check.\n- Resetting a single module's sample data instead of everything.\n`);

  put('Guides/Glossary.md',
    fm({ title: 'Glossary', tags: ['guide'] }) +
    `# Glossary\n\n` +
    table(['Term', 'Meaning'], [
      ['SO', 'Sales Order. Numbered SO-16601 upward in this app.'],
      ['PR', 'Purchase Request. One per Sales Order item bought from a supplier.'],
      ['PO', 'Purchase Order. One per supplier.'],
      ['PAC #', 'The package number. A blank PAC means no package covers that line, which blocks release at the Gate.'],
      ['RR', 'Replacement Request.'],
      ['ETD / ETA', 'Estimated time of departure from the supplier / of arrival at the warehouse.'],
      ['LCL / FCL / Air', 'Shipping modes: less-than-container load, full container load, air freight.'],
      ['Local / HC System', 'Local sourcing: no freight and no accounting push. The supplier named HC System.'],
      ['Order Readiness', 'The checkpoint before Pick: received, packaged, picker assigned, payment settled.'],
      ['QC', 'Quality check, done by whoever packed the item.'],
      ['To Ship', 'Where finished items wait to be dispatched together to Delivery (called Order Aggregation inside the code).'],
      ['DMS', 'Delivery Management System, the third module here (Delivery).'],
      ['Initial date', 'The first delivery date requested. The scheduler searches forward from it.'],
      ['Pick Up', 'A delivery type where the customer collects. It needs no team and no site confirmation.'],
    ]) + '\n');

  // ── Home ──
  put('Home.md',
    fm({ title: 'Home', tags: ['index'] }) +
    `# Supply Chain System v2\n\n${PROTOTYPE_NOTE}A React model of the Home Cartel supply chain: Procurement, Fulfillment and Delivery, with the workflow rules enforced in one place.\n\nThis vault is generated from the source by \`npm run vault\`. Edit the app, not these notes.\n\n` +
    `## Start here\n\n- ${link('System Map')}: the whole flow on one diagram\n- ${link('Running the app')} and ${link('How the engine works')}\n- ${link('Rules Index')}: ${RULES.length} rules\n- ${link('Data Model')}: ${collections.length} collections\n- ${link('Differences from the Zoho system')} and ${link('Not built yet')}\n- ${link('Design decisions')}, ${link('Testing')}, ${link('Glossary')}\n\n` +
    `## Sections\n\nThe six sections of the dropdown in the top bar, plus the Reference link.\n\n${table(['Section', 'Pages'], [...navGroups.map((g) => [link(g.group), g.items.map((i) => link(pages.find((p) => p.path === i.path).label)).join(', ')])])}\n\n` +
    `## In numbers\n\n- ${pages.length} pages (${pages.filter((p) => p.status === 'placeholder').length} not built yet), ${actions.length} workflow steps, ${RULES.length} rules, ${collections.length} collections\n- ${RULES.filter((r) => r.tag === 'BLOCKS').length} blocking rules, ${RULES.filter((r) => r.tag === 'REQUIRED').length} required-field rules\n\n` +
    `## All workflow steps\n\n${table(['Step', 'What it does'], actions.map((a) => [link(a.name), ACTION_INFO[a.name]]))}\n`);

  // ── Obsidian config ──
  put('.obsidian/app.json', JSON.stringify({ alwaysUpdateLinks: true, showFrontmatter: false }, null, 2) + '\n');
  return { files, counts: { pages: pages.length, actions: actions.length, rules: RULES.length, collections: collections.length } };
}

function colorGroup(query, rgb) {
  return { query, color: { a: 1, rgb } };
}

export async function writeVault(outDir) {
  const { files, counts } = await buildVault(outDir);
  fs.mkdirSync(outDir, { recursive: true });
  // Regenerate only what we own. Anything else in .obsidian (workspace, user settings) is left alone.
  for (const dir of ['Modules', 'Rules', 'Actions', 'Data Model', 'Guides']) fs.rmSync(path.join(outDir, dir), { recursive: true, force: true });
  for (const [rel, text] of files) {
    const target = path.join(outDir, rel);
    if (rel.startsWith('.obsidian/') && fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  const graph = path.join(outDir, '.obsidian', 'graph.json');
  if (!fs.existsSync(graph)) {
    fs.writeFileSync(graph, JSON.stringify({
      colorGroups: [
        colorGroup('path:"Modules/Procurement"', 7032792),
        colorGroup('path:"Modules/Fulfillment"', 2781142),
        colorGroup('path:"Modules/Delivery Management"', 953989),
        colorGroup('path:"Modules/Tony Fan"', 15105570),
        colorGroup('path:"Modules/Fenteng Lighting"', 15105570),
        colorGroup('path:Rules', 12597547),
        colorGroup('path:Actions', 14716427),
        colorGroup('path:"Data Model"', 3056219),
      ],
      showTags: false,
    }, null, 2) + '\n');
  }
  return { count: files.size, ...counts };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const out = path.join(ROOT, 'vault');
  writeVault(out).then((r) => {
    console.log(`Vault written to ${out}`);
    console.log(`${r.count} files · ${r.pages} pages · ${r.actions} steps · ${r.rules} rules · ${r.collections} collections`);
  }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
