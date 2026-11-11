---
title: Rules Index
tags: [index, rule]
---

# Rules Index

118 rules. A refusal in the app names its rule id, which is the note name here.

## BLOCKS
*The system stops you.* (51)

| Rule | Module | What it says |
| --- | --- | --- |
| [[INQ.PROJECT_CUSTOMER]] | Inquiry | A project must belong to the inquiry's customer. Changing the customer clears the project. |
| [[INQ.QUOTE_DUP]] | Inquiry | Each supplier can have only one quote row on an inquiry. |
| [[INQ.PRICE]] | Inquiry | A Negotiated price can only be entered once there is an Initial price. The Final price is never typed: it is the Negotiated price if entered, otherwise the Initial price. |
| [[INQ.ONE_SELECTED]] | Inquiry | Only one supplier quote can be Selected at a time. |
| [[INQ.READY]] | Inquiry | An estimate needs all five conditions: supplier selected, availability confirmed, a final price, collateral complete or N/A, and SRP approved. |
| [[INQ.PROJECT]] | Inquiry | An estimate needs a project linked to the inquiry. |
| [[INQ.LOCKED]] | Inquiry | An inquiry that has become a Sales Order is locked. It cannot be edited or deleted. |
| [[INQ.CUSTOMER_DUP]] | Inquiry | A customer with that name already exists. |
| [[PR.GROUP_MIXED]] | Purchase Request | A Sales Order group with PRs for more than one supplier cannot be turned into a PO, because a PO goes to one supplier. |
| [[PR.GROUP_NOT_READY]] | Purchase Request | Every active PR in the group must be Ready for PO before the group can be turned into a PO. |
| [[PR.GROUP_CONVERTED]] | Purchase Request | A group with a PR that is already converted to a PO cannot be converted again. |
| [[PR.LOCKED]] | Purchase Request | A PR that has been converted to a PO is locked and cannot be held or cancelled. |
| [[PR.NOT_READY]] | Purchase Request | Only a PR marked Ready for PO can be converted to a Purchase Order. |
| [[PR.HELD]] | Purchase Request | A PR that is On Hold or Cancelled cannot be converted to a PO. |
| [[PO.SUPPLIER]] | Purchase Order | A PO for an unrecognised supplier cannot be sent. |
| [[PO.ACK_ONCE]] | Purchase Order | A PO can be acknowledged only once. |
| [[PO.CANCEL]] | Purchase Order | A PO can be cancelled only before anything has shipped, and needs a reason. Its pending shipment and receiving are removed and its PRs go back to the queue. |
| [[SHP.TRANSIT]] | Shipments | A shipment must be In Transit before it can be marked arrived. |
| [[RCV.ARRIVED]] | Receiving | Goods can be received only after the shipment has arrived. |
| [[RCV.TOTAL]] | Receiving | Accepted + Damaged + Missing may not exceed Expected. Partial receipts are allowed. |
| [[EXC.DUP]] | Exceptions | An exception that already has a Replacement Request cannot raise another. |
| [[RR.ONCE]] | Replacement | A replacement can be approved only once. |
| [[GATE.RECEIVED]] | Readiness Gate | A package cannot be created for an item that has not been received into the warehouse. |
| [[GATE.PAC]] | Readiness Gate | A package (PAC #) must exist before release. A blank PAC means no package covers the line. |
| [[GATE.PICKER]] | Readiness Gate | Assign a picker before releasing to Pick. |
| [[GATE.PAYMENT]] | Readiness Gate | An unpaid item needs credit terms or a still-valid Approve Dispatch override before release. |
| [[PACK.PACKER]] | Pack & QC | Approve and Reject at QC are refused until a packer is assigned. The packer is the Quality Checker. The Pack stage itself was retired: Pick goes straight to Pack & QC. |
| [[SOR.ONE_PACKAGE]] | Sales Order Report | A Sales Order has one package. Creating a second is refused. |
| [[SOR.READY]] | Sales Order Report | A package covers the whole Sales Order, so every item on it must be received first. |
| [[EC.STATE]] | Exception Control | A QC reject moves Pending to In Rework to Completed, or to Unrepairable. It cannot skip a step or go back. |
| [[EC.RR]] | Exception Control | A replacement can be requested for a QC reject only when it is Unrepairable. |
| [[XFER.DONE]] | Transfer Item | A warehouse request goes Pending then Done. A warehouse transfer goes Pending Dispatch, Dispatched, then Received. Nothing moves past its last step. |
| [[RET.NEW]] | Sales Returns | A sales return can be opened only for a completed or failed delivery, and only once per delivery. |
| [[SCHED.DECIDE]] | Schedule Requests | Declining needs a reason. Confirming moves the delivery's start date, and works only while the delivery is still in Initial Scheduling or Service Request. |
| [[CRATE.DONE]] | Crate | Nothing moves on from Crate until Crating Status is Done. |
| [[OA.PAYMENT]] | Order Aggregation | Dispatch is blocked on payment, with the same credit and override exceptions as the Readiness Gate. |
| [[OA.DEDUP]] | Order Aggregation | An item that has already been dispatched cannot create a second Service Request. |
| [[DMS.SITE]] | Service Request | A delivery cannot be scheduled until the site is confirmed. Pick Up jobs are exempt. |
| [[DMS.FULL]] | Service Request | If no team has free capacity in the next 14 days, scheduling is refused rather than overbooking. |
| [[FC.RANGE]] | Forecast | In every leg the minimum days cannot be above the maximum days. |
| [[FC.VALUES]] | Forecast | Leg lengths must be zero or more, and the weeks shown must be a whole number from 1 to 52. |
| [[SUP.OWN]] | Supplier Portal | A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines. |
| [[SUP.LOCKED]] | Supplier Portal | A response is locked once the buyer selected another supplier, once this supplier is selected (pricing locks, collateral opens), and for good when it is Completed. |
| [[SUP.PR_VIEW]] | Supplier Portal | A PR that came from an inquiry is view-only for the supplier, and a held or cancelled PR cannot be quoted. |
| [[SUP.PO_HELD]] | Supplier Portal | A PO or shipment cannot be acknowledged or shipped while every line on it is on hold or cancelled. |
| [[RR.PROGRESS]] | Replacement | After approving, the supplier moves a replacement forward: Acknowledged, In Production, Shipped. It cannot go back, and Received comes only from the physical receipt. |
| [[EXC.RESOLVE]] | Exceptions | An exception is resolved by hand only while it is Open or Under Review, with a note. One with a replacement under way closes by itself when the replacement is received. |
| [[RR.CANCEL]] | Replacement | A replacement can be cancelled before it ships, with a reason. Its pending replacement shipment is removed and the exception opens again. |
| [[RR.CLOSE]] | Replacement | Only a replacement that has been received can be closed. |
| [[RCV.BOOKS]] | Receiving | A receiving goes to Books once, and only after it was counted in full. |
| [[GEN.STATE]] | General | That step is not available in the record's current status. |

## REQUIRED
*A field you must fill in.* (31)

| Rule | Module | What it says |
| --- | --- | --- |
| [[INQ.NEW]] | Inquiry | An inquiry needs an item and a customer picked from the lists, a customer type, a sales owner, a target date and a quantity above zero. |
| [[INQ.SRP]] | Inquiry | Approving the SRP needs an amount above zero. |
| [[INQ.ITEM_ID]] | Inquiry | Adding an item needs its Item ID and name. An ID already in the catalog updates that item instead of duplicating it. |
| [[INQ.CHAT]] | Inquiry | A message needs text, and only a supplier that is quoted on the inquiry (Fenteng or Tony) has a conversation thread. |
| [[PR.NEW]] | Purchase Request | A new PR needs an item, a target date, a quantity above zero, a customer, a customer type and a sales owner. Supplier, price and shipping mode are filled in later. |
| [[PR.OVERRIDE]] | Purchase Request | Choosing a supplier other than the recommended one needs an override reason. |
| [[PR.SRP]] | Purchase Request | Approving the SRP needs an amount above zero. |
| [[PR.HOLD_REASON]] | Purchase Request | Putting a PR on hold or cancelling it needs a reason from the list. "Other" also needs notes. |
| [[PO.ACK_DATES]] | Purchase Order | Acknowledging a PO needs both an ETD and an ETA, and the ETA cannot be before the ETD. |
| [[RCV.NUMBERS]] | Receiving | Quantities must be whole numbers, zero or more, and at least one must be above zero. |
| [[EXC.SUPPLIER]] | Exceptions | A Replacement Request needs the supplier it will be sourced from. |
| [[RR.DATES]] | Replacement | Approving a replacement needs both an Expected Ship Date and an ETA. |
| [[GATE.OVERRIDE]] | Readiness Gate | An Approve Dispatch override needs a reason and a valid-until date in the future. |
| [[SOR.TYPE]] | Sales Order Report | Creating a package needs a Delivery Type: Delivery, Pick Up or Installation. |
| [[XFER.NEW]] | Transfer Item | A transfer or warehouse request needs an item, a quantity above zero and two different warehouses. |
| [[RET.BOOKS]] | Sales Returns | Sending a return to Books needs an RMA number, a reason, a quantity above zero and a signature. It goes once. |
| [[TRUCK.NEW]] | Truck Maintenance | A checklist needs a known truck and a date. |
| [[TRUCK.SIGN]] | Truck Maintenance | A checklist cannot be completed without a signature. It goes Open, In Progress, Completed. |
| [[TRUCK.ENTRY]] | Truck Maintenance | A fuel or service entry needs a known truck, a date and a cost above zero. |
| [[SCHED.NEW]] | Schedule Requests | A schedule request needs a new date and a reason, and a delivery can have only one waiting for review. |
| [[QC.REJECT]] | QC Checklist | Rejecting QC needs a reason, and it raises a Fulfillment Exception. |
| [[DMS.INITIAL]] | Initial Scheduling | The initial delivery date must be set before the job is handed off to Service Request. |
| [[DMS.CONFIRM]] | Initial Scheduling | Confirming the site needs both a Confirmation Method and Notes. Only a person may set Confirmed. |
| [[DMS.FAIL]] | Ongoing Service | Marking a delivery failed needs a reason, and sends it to the Exception Queue. |
| [[DMS.RESOLVE]] | Exception Queue | Resolving an exception needs a Resolution Action. Reschedule also needs a new date. Revert to System hands the job back to the engine. |
| [[SUP.RESPONSE]] | Supplier Portal | A response needs an availability. Unless the supplier declines (Unavailable or Cannot Produce), it also needs an Initial Price above zero and a Lead Time. |
| [[SUP.SHIP]] | Supplier Portal | Shipping needs a Date Shipped (not in the future) and a Mode. |
| [[EXC.RAISE]] | Exceptions | Raising an exception by hand needs where it came from, the item, a type and a quantity above zero. |
| [[EXC.REVIEW]] | Exceptions | Assigning an exception for review needs an assignee and a due date. It then reads Under Review. |
| [[RCV.SCRATCH]] | Receiving | A receiving created from scratch needs a supplier, an item and a quantity above zero. It has no PO. |
| [[GEN.FIELD]] | General | A required field is missing. |

## AUTOMATIC
*The system does it by itself.* (18)

| Rule | Module | What it says |
| --- | --- | --- |
| [[INQ.TAGGED]] | Inquiry | Every supplier is tagged on a new inquiry. Each answers through its own quote row. |
| [[INQ.QUOTE_GROUP]] | Inquiry | Inquiries with the same project and group discount share one quote group. |
| [[INQ.ESTIMATE_GROUP]] | Inquiry | Creating an estimate also covers the other Ready inquiries of the same project or quote group, which share one estimate number. |
| [[INQ.SO]] | Inquiry | Converting the estimate creates the Sales Order line, and a Purchase Request unless the selected supplier is Warehouse Stock. |
| [[INQ.PROJECT_CODE]] | Inquiry | A new project gets the next PRJ-xxxxx code and starts Active. |
| [[PR.READY]] | Purchase Request | A PR becomes Ready for PO by itself when four conditions pass: supplier selected, final price confirmed, shipping mode selected (Local needs none) and a target date. It goes back to For Sourcing if one stops passing. |
| [[PO.ONE_PER_SUPPLIER]] | Purchase Order | Converting PRs creates one PO per supplier. |
| [[PO.COMPLETE]] | Purchase Order | A Confirmed PO becomes Completed by itself once every shipment on it has arrived and been received in full. |
| [[PO.ACK_AUTO]] | Purchase Order | Acknowledging a PO creates its Shipment and its Receiving. |
| [[SHP.ARRIVE]] | Shipments | Marking a shipment arrived opens its Receiving. |
| [[RCV.EXCEPTION]] | Receiving | Any damaged or missing quantity raises a Procurement Exception with its context. |
| [[RCV.STOCK]] | Receiving | When a Receiving is fully accepted, the Sales Order items waiting on it become available to Fulfillment. |
| [[RR.CLONE]] | Replacement | Approving a replacement creates its replacement Shipment and Receiving. Completion comes only from the physical receipt. |
| [[PICK.NEXT]] | Pick | Marking an item picked creates its Pack record. The picker is deliberately not copied. |
| [[QC.ROUTE]] | QC Checklist | Approving QC routes on "For Crate": to the Crate checklist, or straight to Order Aggregation. |
| [[OA.DMS]] | Order Aggregation | Dispatch creates the Service Request in Delivery Management, at Initial Scheduling. |
| [[DMS.PICKUP]] | Service Request | A Pick Up job is scheduled without a team, because the customer collects it. |
| [[SUP.DECLINE]] | Supplier Portal | Declining (Unavailable or Cannot Produce) asks for confirmation, tells the buyer, and removes the line from the supplier's queue. |

## REFERENCE
*A fact about how a module behaves.* (18)

| Rule | Module | What it says |
| --- | --- | --- |
| [[INQ.READINESS]] | Inquiry | Status is always worked out from the record, never stored: 5 of 5 conditions is Ready, 1 to 4 is In Progress, none is Not Ready. |
| [[INQ.MARGIN]] | Inquiry | Margin = (SRP − selected final cost) ÷ SRP. The cost is in CNY and the SRP in PHP, and no exchange rate is applied, exactly as in the original widget. |
| [[PR.PRICE]] | Purchase Request | The final price comes from, in order: an approved SRP, a supplier quote, the SO reference rate, then the catalog rate. A PR from an inquiry, or whose item has a catalog rate, counts as confirmed on its own. |
| [[PR.RECOMMEND]] | Purchase Request | The recommended supplier is the eligible one with the lowest price (Negotiated if entered, else Initial), with lead time breaking a tie. A supplier that has not quoted is never recommended. |
| [[PR.LOAD]] | Purchase Request | Supplier load is counted in PO lines against the supplier capacity: 80% is Near Capacity, 100% is Overloaded. It is shown for information and never blocks a PR. |
| [[PR.HOLD_FLAG]] | Purchase Request | Hold is a flag on top of the real status. The status is never overwritten, so Resume and Restore put things back. |
| [[PO.LOCAL]] | Purchase Order | A Local (HC System) PO never reaches the accounting system. |
| [[RCV.ONE]] | Receiving | There is only one Receiving per Shipment. |
| [[DMS.ENGINE]] | Service Request | The engine searches from the initial date (or today if that has passed), skips Sundays and days a team is off, and picks the least-loaded team with room. |
| [[FC.WINDOW]] | Forecast | The forecast is a window (Earliest, Likely, Latest), never one exact date. Likely is the midpoint. |
| [[FC.ANCHOR]] | Forecast | With re-anchoring on, the forecast counts from the most advanced real event: shipped date, arrival, or the current Fulfillment stage, so the window tightens as the order moves. |
| [[FC.STOCK]] | Forecast | An order that has reached Fulfillment and is not a pre-order has no import leg left: only preparation and delivery. |
| [[FC.TARGET]] | Forecast | An order with no client target date is counted separately as No target. You cannot be on time against a promise nobody recorded. |
| [[FC.SEVERITY]] | Forecast | Overdue: today is past the client date. On track: the latest date fits. At risk: only the earliest date fits. Will miss: even the earliest is too late. |
| [[FC.SOURCE]] | Forecast | The forecast is built from the Purchase Requests, so a pure-stock order with no PR is not listed. Cancelled PRs and delivered orders are left out. |
| [[SUP.VISIBLE]] | Supplier Portal | A supplier sees a PO only once it is sent, and a shipment only once the PO is acknowledged (or the replacement approved). The supplier status of an inquiry or PR line is worked out from the quotes, never stored. |
| [[EXC.SEVERITY]] | Exceptions | Severity is worked out, never stored: Damaged, Defective and Wrong item are High, anything of 5 or more units is High, the rest are Medium. An exception is Overdue when its due date has passed and it is not Resolved or Closed. |
| [[SHP.FLAGS]] | Shipments | Delayed, Arriving in 1 Week, Needs Attention and Ship Mode Unmatched are worked out from the dates and modes each time, never stored. Delayed: not arrived and the ETA has passed. Needs Attention: delayed, still pending after its ETD, or due after the date the client wants it. Ship Mode Unmatched: the supplier shipped by a different mode than the PO. |
