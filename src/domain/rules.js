// The workflow rules, as data. Every guard in actions.js refuses with one of these ids,
// so a refusal on screen can always be looked up on the Rules page.
//
// Tags: BLOCKS = the system stops you · REQUIRED = a field you must fill ·
//       AUTOMATIC = the system does it · REFERENCE = a fact about how a module behaves.

export const RULES = [
  // Inquiry
  { id: 'INQ.NEW', module: 'Inquiry', tag: 'REQUIRED', text: 'An inquiry needs an item and a customer picked from the lists, a customer type, a sales owner, a target date and a quantity above zero.' },
  { id: 'INQ.PROJECT_CUSTOMER', module: 'Inquiry', tag: 'BLOCKS', text: 'A project must belong to the inquiry\'s customer. Changing the customer clears the project.' },
  { id: 'INQ.QUOTE_DUP', module: 'Inquiry', tag: 'BLOCKS', text: 'Each supplier can have only one quote row on an inquiry.' },
  { id: 'INQ.PRICE', module: 'Inquiry', tag: 'BLOCKS', text: 'A Negotiated price can only be entered once there is an Initial price. The Final price is never typed: it is the Negotiated price if entered, otherwise the Initial price.' },
  { id: 'INQ.ONE_SELECTED', module: 'Inquiry', tag: 'BLOCKS', text: 'Only one supplier quote can be Selected at a time.' },
  { id: 'INQ.SRP', module: 'Inquiry', tag: 'REQUIRED', text: 'Approving the SRP needs an amount above zero.' },
  { id: 'INQ.READY', module: 'Inquiry', tag: 'BLOCKS', text: 'An estimate needs all five conditions: supplier selected, availability confirmed, a final price, collateral complete or N/A, and SRP approved.' },
  { id: 'INQ.PROJECT', module: 'Inquiry', tag: 'BLOCKS', text: 'An estimate needs a project linked to the inquiry.' },
  { id: 'INQ.LOCKED', module: 'Inquiry', tag: 'BLOCKS', text: 'An inquiry that has become a Sales Order is locked. It cannot be edited or deleted.' },
  { id: 'INQ.READINESS', module: 'Inquiry', tag: 'REFERENCE', text: 'Status is always worked out from the record, never stored: 5 of 5 conditions is Ready, 1 to 4 is In Progress, none is Not Ready.' },
  { id: 'INQ.MARGIN', module: 'Inquiry', tag: 'REFERENCE', text: 'Margin = (SRP − selected final cost) ÷ SRP. The cost is in CNY and the SRP in PHP, and no exchange rate is applied, exactly as in the original widget.' },
  { id: 'INQ.TAGGED', module: 'Inquiry', tag: 'AUTOMATIC', text: 'Every supplier is tagged on a new inquiry. Each answers through its own quote row.' },
  { id: 'INQ.QUOTE_GROUP', module: 'Inquiry', tag: 'AUTOMATIC', text: 'Inquiries with the same project and group discount share one quote group.' },
  { id: 'INQ.ESTIMATE_GROUP', module: 'Inquiry', tag: 'AUTOMATIC', text: 'Creating an estimate also covers the other Ready inquiries of the same project or quote group, which share one estimate number.' },
  { id: 'INQ.SO', module: 'Inquiry', tag: 'AUTOMATIC', text: 'Converting the estimate creates the Sales Order line, and a Purchase Request unless the selected supplier is Warehouse Stock.' },
  { id: 'INQ.CUSTOMER_DUP', module: 'Inquiry', tag: 'BLOCKS', text: 'A customer with that name already exists.' },
  { id: 'INQ.PROJECT_CODE', module: 'Inquiry', tag: 'AUTOMATIC', text: 'A new project gets the next PRJ-xxxxx code and starts Active.' },
  { id: 'INQ.ITEM_ID', module: 'Inquiry', tag: 'REQUIRED', text: 'Adding an item needs its Item ID and name. An ID already in the catalog updates that item instead of duplicating it.' },
  { id: 'INQ.CHAT', module: 'Inquiry', tag: 'REQUIRED', text: 'A message needs text, and only a supplier that is quoted on the inquiry (Fenteng or Tony) has a conversation thread.' },

  // Purchase Request
  { id: 'PR.NEW', module: 'Purchase Request', tag: 'REQUIRED', text: 'A new PR needs an item, a target date, a quantity above zero, a customer, a customer type and a sales owner. Supplier, price and shipping mode are filled in later.' },
  { id: 'PR.OVERRIDE', module: 'Purchase Request', tag: 'REQUIRED', text: 'Choosing a supplier other than the recommended one needs an override reason.' },
  { id: 'PR.SRP', module: 'Purchase Request', tag: 'REQUIRED', text: 'Approving the SRP needs an amount above zero.' },
  { id: 'PR.READY', module: 'Purchase Request', tag: 'AUTOMATIC', text: 'A PR becomes Ready for PO by itself when four conditions pass: supplier selected, final price confirmed, shipping mode selected (Local needs none) and a target date. It goes back to For Sourcing if one stops passing.' },
  { id: 'PR.PRICE', module: 'Purchase Request', tag: 'REFERENCE', text: 'The final price comes from, in order: an approved SRP, a supplier quote, the SO reference rate, then the catalog rate. A PR from an inquiry, or whose item has a catalog rate, counts as confirmed on its own.' },
  { id: 'PR.RECOMMEND', module: 'Purchase Request', tag: 'REFERENCE', text: 'The recommended supplier is the eligible one with the lowest price (Negotiated if entered, else Initial), with lead time breaking a tie. A supplier that has not quoted is never recommended.' },
  { id: 'PR.LOAD', module: 'Purchase Request', tag: 'REFERENCE', text: 'Supplier load is counted in PO lines against the supplier capacity: 80% is Near Capacity, 100% is Overloaded. It is shown for information and never blocks a PR.' },
  { id: 'PR.GROUP_MIXED', module: 'Purchase Request', tag: 'BLOCKS', text: 'A Sales Order group with PRs for more than one supplier cannot be turned into a PO, because a PO goes to one supplier.' },
  { id: 'PR.GROUP_NOT_READY', module: 'Purchase Request', tag: 'BLOCKS', text: 'Every active PR in the group must be Ready for PO before the group can be turned into a PO.' },
  { id: 'PR.GROUP_CONVERTED', module: 'Purchase Request', tag: 'BLOCKS', text: 'A group with a PR that is already converted to a PO cannot be converted again.' },
  { id: 'PR.HOLD_REASON', module: 'Purchase Request', tag: 'REQUIRED', text: 'Putting a PR on hold or cancelling it needs a reason from the list. "Other" also needs notes.' },
  { id: 'PR.LOCKED', module: 'Purchase Request', tag: 'BLOCKS', text: 'A PR that has been converted to a PO is locked and cannot be held or cancelled.' },
  { id: 'PR.NOT_READY', module: 'Purchase Request', tag: 'BLOCKS', text: 'Only a PR marked Ready for PO can be converted to a Purchase Order.' },
  { id: 'PR.HELD', module: 'Purchase Request', tag: 'BLOCKS', text: 'A PR that is On Hold or Cancelled cannot be converted to a PO.' },
  { id: 'PR.HOLD_FLAG', module: 'Purchase Request', tag: 'REFERENCE', text: 'Hold is a flag on top of the real status. The status is never overwritten, so Resume and Restore put things back.' },

  // Purchase Order
  { id: 'PO.ONE_PER_SUPPLIER', module: 'Purchase Order', tag: 'AUTOMATIC', text: 'Converting PRs creates one PO per supplier.' },
  { id: 'PO.SUPPLIER', module: 'Purchase Order', tag: 'BLOCKS', text: 'A PO for an unrecognised supplier cannot be sent.' },
  { id: 'PO.LOCAL', module: 'Purchase Order', tag: 'REFERENCE', text: 'A Local (HC System) PO never reaches the accounting system.' },
  { id: 'PO.ACK_DATES', module: 'Purchase Order', tag: 'REQUIRED', text: 'Acknowledging a PO needs both an ETD and an ETA, and the ETA cannot be before the ETD.' },
  { id: 'PO.ACK_ONCE', module: 'Purchase Order', tag: 'BLOCKS', text: 'A PO can be acknowledged only once.' },
  { id: 'PO.CANCEL', module: 'Purchase Order', tag: 'BLOCKS', text: 'A PO can be cancelled only before anything has shipped, and needs a reason. Its pending shipment and receiving are removed and its PRs go back to the queue.' },
  { id: 'PO.COMPLETE', module: 'Purchase Order', tag: 'AUTOMATIC', text: 'A Confirmed PO becomes Completed by itself once every shipment on it has arrived and been received in full.' },
  { id: 'PO.ACK_AUTO', module: 'Purchase Order', tag: 'AUTOMATIC', text: 'Acknowledging a PO creates its Shipment and its Receiving.' },

  // Shipment
  { id: 'SHP.TRANSIT', module: 'Shipments', tag: 'BLOCKS', text: 'A shipment must be In Transit before it can be marked arrived.' },
  { id: 'SHP.ARRIVE', module: 'Shipments', tag: 'AUTOMATIC', text: 'Marking a shipment arrived opens its Receiving.' },

  // Receiving
  { id: 'RCV.ARRIVED', module: 'Receiving', tag: 'BLOCKS', text: 'Goods can be received only after the shipment has arrived.' },
  { id: 'RCV.NUMBERS', module: 'Receiving', tag: 'REQUIRED', text: 'Quantities must be whole numbers, zero or more, and at least one must be above zero.' },
  { id: 'RCV.TOTAL', module: 'Receiving', tag: 'BLOCKS', text: 'Accepted + Damaged + Missing may not exceed Expected. Partial receipts are allowed.' },
  { id: 'RCV.EXCEPTION', module: 'Receiving', tag: 'AUTOMATIC', text: 'Any damaged or missing quantity raises a Procurement Exception with its context.' },
  { id: 'RCV.ONE', module: 'Receiving', tag: 'REFERENCE', text: 'There is only one Receiving per Shipment.' },
  { id: 'RCV.STOCK', module: 'Receiving', tag: 'AUTOMATIC', text: 'When a Receiving is fully accepted, the Sales Order items waiting on it become available to Fulfillment.' },

  // Exceptions and replacements
  { id: 'EXC.DUP', module: 'Exceptions', tag: 'BLOCKS', text: 'An exception that already has a Replacement Request cannot raise another.' },
  { id: 'EXC.SUPPLIER', module: 'Exceptions', tag: 'REQUIRED', text: 'A Replacement Request needs the supplier it will be sourced from.' },
  { id: 'RR.DATES', module: 'Replacement', tag: 'REQUIRED', text: 'Approving a replacement needs both an Expected Ship Date and an ETA.' },
  { id: 'RR.ONCE', module: 'Replacement', tag: 'BLOCKS', text: 'A replacement can be approved only once.' },
  { id: 'RR.CLONE', module: 'Replacement', tag: 'AUTOMATIC', text: 'Approving a replacement creates its replacement Shipment and Receiving. Completion comes only from the physical receipt.' },

  // Readiness Gate
  { id: 'GATE.RECEIVED', module: 'Readiness Gate', tag: 'BLOCKS', text: 'A package cannot be created for an item that has not been received into the warehouse.' },
  { id: 'GATE.PAC', module: 'Readiness Gate', tag: 'BLOCKS', text: 'A package (PAC #) must exist before release. A blank PAC means no package covers the line.' },
  { id: 'GATE.PICKER', module: 'Readiness Gate', tag: 'BLOCKS', text: 'Assign a picker before releasing to Pick.' },
  { id: 'GATE.PAYMENT', module: 'Readiness Gate', tag: 'BLOCKS', text: 'An unpaid item needs credit terms or a still-valid Approve Dispatch override before release.' },
  { id: 'GATE.OVERRIDE', module: 'Readiness Gate', tag: 'REQUIRED', text: 'An Approve Dispatch override needs a reason and a valid-until date in the future.' },

  // Pick / Pack / QC / Crate / Aggregation
  { id: 'PICK.NEXT', module: 'Pick', tag: 'AUTOMATIC', text: 'Marking an item picked creates its Pack record. The picker is deliberately not copied.' },
  { id: 'PACK.PACKER', module: 'Pack & QC', tag: 'BLOCKS', text: 'Approve and Reject at QC are refused until a packer is assigned. The packer is the Quality Checker. The Pack stage itself was retired: Pick goes straight to Pack & QC.' },
  { id: 'SOR.TYPE', module: 'Sales Order Report', tag: 'REQUIRED', text: 'Creating a package needs a Delivery Type: Delivery, Pick Up or Installation.' },
  { id: 'SOR.ONE_PACKAGE', module: 'Sales Order Report', tag: 'BLOCKS', text: 'A Sales Order has one package. Creating a second is refused.' },
  { id: 'SOR.READY', module: 'Sales Order Report', tag: 'BLOCKS', text: 'A package covers the whole Sales Order, so every item on it must be received first.' },
  { id: 'EC.STATE', module: 'Exception Control', tag: 'BLOCKS', text: 'A QC reject moves Pending to In Rework to Completed, or to Unrepairable. It cannot skip a step or go back.' },
  { id: 'EC.RR', module: 'Exception Control', tag: 'BLOCKS', text: 'A replacement can be requested for a QC reject only when it is Unrepairable.' },
  { id: 'XFER.NEW', module: 'Transfer Item', tag: 'REQUIRED', text: 'A transfer or warehouse request needs an item, a quantity above zero and two different warehouses.' },
  { id: 'XFER.DONE', module: 'Transfer Item', tag: 'BLOCKS', text: 'A warehouse request goes Pending then Done. A warehouse transfer goes Pending Dispatch, Dispatched, then Received. Nothing moves past its last step.' },
  { id: 'RET.NEW', module: 'Sales Returns', tag: 'BLOCKS', text: 'A sales return can be opened only for a completed or failed delivery, and only once per delivery.' },
  { id: 'RET.BOOKS', module: 'Sales Returns', tag: 'REQUIRED', text: 'Sending a return to Books needs an RMA number, a reason, a quantity above zero and a signature. It goes once.' },
  { id: 'TRUCK.NEW', module: 'Truck Maintenance', tag: 'REQUIRED', text: 'A checklist needs a known truck and a date.' },
  { id: 'TRUCK.SIGN', module: 'Truck Maintenance', tag: 'REQUIRED', text: 'A checklist cannot be completed without a signature. It goes Open, In Progress, Completed.' },
  { id: 'TRUCK.ENTRY', module: 'Truck Maintenance', tag: 'REQUIRED', text: 'A fuel or service entry needs a known truck, a date and a cost above zero.' },
  { id: 'SCHED.NEW', module: 'Schedule Requests', tag: 'REQUIRED', text: 'A schedule request needs a new date and a reason, and a delivery can have only one waiting for review.' },
  { id: 'SCHED.DECIDE', module: 'Schedule Requests', tag: 'BLOCKS', text: 'Declining needs a reason. Confirming moves the delivery\'s start date, and works only while the delivery is still in Initial Scheduling or Service Request.' },
  { id: 'QC.ROUTE', module: 'QC Checklist', tag: 'AUTOMATIC', text: 'Approving QC routes on "For Crate": to the Crate checklist, or straight to Order Aggregation.' },
  { id: 'QC.REJECT', module: 'QC Checklist', tag: 'REQUIRED', text: 'Rejecting QC needs a reason, and it raises a Fulfillment Exception.' },
  { id: 'CRATE.DONE', module: 'Crate', tag: 'BLOCKS', text: 'Nothing moves on from Crate until Crating Status is Done.' },
  { id: 'OA.PAYMENT', module: 'Order Aggregation', tag: 'BLOCKS', text: 'Dispatch is blocked on payment, with the same credit and override exceptions as the Readiness Gate.' },
  { id: 'OA.DEDUP', module: 'Order Aggregation', tag: 'BLOCKS', text: 'An item that has already been dispatched cannot create a second Service Request.' },
  { id: 'OA.DMS', module: 'Order Aggregation', tag: 'AUTOMATIC', text: 'Dispatch creates the Service Request in Delivery Management, at Initial Scheduling.' },

  // Delivery Management
  { id: 'DMS.INITIAL', module: 'Initial Scheduling', tag: 'REQUIRED', text: 'The initial delivery date must be set before the job is handed off to Service Request.' },
  { id: 'DMS.CONFIRM', module: 'Initial Scheduling', tag: 'REQUIRED', text: 'Confirming the site needs both a Confirmation Method and Notes. Only a person may set Confirmed.' },
  { id: 'DMS.SITE', module: 'Service Request', tag: 'BLOCKS', text: 'A delivery cannot be scheduled until the site is confirmed. Pick Up jobs are exempt.' },
  { id: 'DMS.PICKUP', module: 'Service Request', tag: 'AUTOMATIC', text: 'A Pick Up job is scheduled without a team, because the customer collects it.' },
  { id: 'DMS.FULL', module: 'Service Request', tag: 'BLOCKS', text: 'If no team has free capacity in the next 14 days, scheduling is refused rather than overbooking.' },
  { id: 'DMS.ENGINE', module: 'Service Request', tag: 'REFERENCE', text: 'The engine searches from the initial date (or today if that has passed), skips Sundays and days a team is off, and picks the least-loaded team with room.' },
  { id: 'DMS.FAIL', module: 'Ongoing Service', tag: 'REQUIRED', text: 'Marking a delivery failed needs a reason, and sends it to the Exception Queue.' },
  { id: 'DMS.RESOLVE', module: 'Exception Queue', tag: 'REQUIRED', text: 'Resolving an exception needs a Resolution Action. Reschedule also needs a new date. Revert to System hands the job back to the engine.' },

  // Forecast
  { id: 'FC.RANGE', module: 'Forecast', tag: 'BLOCKS', text: 'In every leg the minimum days cannot be above the maximum days.' },
  { id: 'FC.VALUES', module: 'Forecast', tag: 'BLOCKS', text: 'Leg lengths must be zero or more, and the weeks shown must be a whole number from 1 to 52.' },
  { id: 'FC.WINDOW', module: 'Forecast', tag: 'REFERENCE', text: 'The forecast is a window (Earliest, Likely, Latest), never one exact date. Likely is the midpoint.' },
  { id: 'FC.ANCHOR', module: 'Forecast', tag: 'REFERENCE', text: 'With re-anchoring on, the forecast counts from the most advanced real event: shipped date, arrival, or the current Fulfillment stage, so the window tightens as the order moves.' },
  { id: 'FC.STOCK', module: 'Forecast', tag: 'REFERENCE', text: 'An order that has reached Fulfillment and is not a pre-order has no import leg left: only preparation and delivery.' },
  { id: 'FC.TARGET', module: 'Forecast', tag: 'REFERENCE', text: 'An order with no client target date is counted separately as No target. You cannot be on time against a promise nobody recorded.' },
  { id: 'FC.SEVERITY', module: 'Forecast', tag: 'REFERENCE', text: 'Overdue: today is past the client date. On track: the latest date fits. At risk: only the earliest date fits. Will miss: even the earliest is too late.' },
  { id: 'FC.SOURCE', module: 'Forecast', tag: 'REFERENCE', text: 'The forecast is built from the Purchase Requests, so a pure-stock order with no PR is not listed. Cancelled PRs and delivered orders are left out.' },

  // General
  // Supplier portals
  { id: 'SUP.OWN', module: 'Supplier Portal', tag: 'BLOCKS', text: 'A supplier can only act on records assigned to it. Each portal shows only its own supplier\'s lines.' },
  { id: 'SUP.RESPONSE', module: 'Supplier Portal', tag: 'REQUIRED', text: 'A response needs an availability. Unless the supplier declines (Unavailable or Cannot Produce), it also needs an Initial Price above zero and a Lead Time.' },
  { id: 'SUP.LOCKED', module: 'Supplier Portal', tag: 'BLOCKS', text: 'A response is locked once the buyer selected another supplier, once this supplier is selected (pricing locks, collateral opens), and for good when it is Completed.' },
  { id: 'SUP.DECLINE', module: 'Supplier Portal', tag: 'AUTOMATIC', text: 'Declining (Unavailable or Cannot Produce) asks for confirmation, tells the buyer, and removes the line from the supplier\'s queue.' },
  { id: 'SUP.PR_VIEW', module: 'Supplier Portal', tag: 'BLOCKS', text: 'A PR that came from an inquiry is view-only for the supplier, and a held or cancelled PR cannot be quoted.' },
  { id: 'SUP.PO_HELD', module: 'Supplier Portal', tag: 'BLOCKS', text: 'A PO or shipment cannot be acknowledged or shipped while every line on it is on hold or cancelled.' },
  { id: 'SUP.SHIP', module: 'Supplier Portal', tag: 'REQUIRED', text: 'Shipping needs a Date Shipped (not in the future) and a Mode.' },
  { id: 'SUP.VISIBLE', module: 'Supplier Portal', tag: 'REFERENCE', text: 'A supplier sees a PO only once it is sent, and a shipment only once the PO is acknowledged (or the replacement approved). The supplier status of an inquiry or PR line is worked out from the quotes, never stored.' },
  { id: 'RR.PROGRESS', module: 'Replacement', tag: 'BLOCKS', text: 'After approving, the supplier moves a replacement forward: Acknowledged, In Production, Shipped. It cannot go back, and Received comes only from the physical receipt.' },
  { id: 'EXC.RAISE', module: 'Exceptions', tag: 'REQUIRED', text: 'Raising an exception by hand needs where it came from, the item, a type and a quantity above zero.' },
  { id: 'EXC.REVIEW', module: 'Exceptions', tag: 'REQUIRED', text: 'Assigning an exception for review needs an assignee and a due date. It then reads Under Review.' },
  { id: 'EXC.RESOLVE', module: 'Exceptions', tag: 'BLOCKS', text: 'An exception is resolved by hand only while it is Open or Under Review, with a note. One with a replacement under way closes by itself when the replacement is received.' },
  { id: 'EXC.SEVERITY', module: 'Exceptions', tag: 'REFERENCE', text: 'Severity is worked out, never stored: Damaged, Defective and Wrong item are High, anything of 5 or more units is High, the rest are Medium. An exception is Overdue when its due date has passed and it is not Resolved or Closed.' },
  { id: 'RR.CANCEL', module: 'Replacement', tag: 'BLOCKS', text: 'A replacement can be cancelled before it ships, with a reason. Its pending replacement shipment is removed and the exception opens again.' },
  { id: 'RR.CLOSE', module: 'Replacement', tag: 'BLOCKS', text: 'Only a replacement that has been received can be closed.' },
  { id: 'RCV.BOOKS', module: 'Receiving', tag: 'BLOCKS', text: 'A receiving goes to Books once, and only after it was counted in full.' },
  { id: 'RCV.SCRATCH', module: 'Receiving', tag: 'REQUIRED', text: 'A receiving created from scratch needs a supplier, an item and a quantity above zero. It has no PO.' },
  { id: 'SHP.FLAGS', module: 'Shipments', tag: 'REFERENCE', text: 'Delayed, Arriving in 1 Week, Needs Attention and Ship Mode Unmatched are worked out from the dates and modes each time, never stored. Delayed: not arrived and the ETA has passed. Needs Attention: delayed, still pending after its ETD, or due after the date the client wants it. Ship Mode Unmatched: the supplier shipped by a different mode than the PO.' },
  { id: 'GEN.STATE', module: 'General', tag: 'BLOCKS', text: 'That step is not available in the record\'s current status.' },
  { id: 'GEN.FIELD', module: 'General', tag: 'REQUIRED', text: 'A required field is missing.' },
];

export const TAGS = ['BLOCKS', 'REQUIRED', 'AUTOMATIC', 'REFERENCE'];

export class RuleError extends Error {
  constructor(ruleId, detail) {
    const rule = RULES.find((r) => r.id === ruleId);
    super(detail || (rule && rule.text) || ruleId);
    this.name = 'RuleError';
    this.ruleId = ruleId;
    this.rule = rule;
  }
}

export function refuse(ruleId, detail) {
  throw new RuleError(ruleId, detail);
}
