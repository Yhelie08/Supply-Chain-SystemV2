---
title: Home
tags: [index]
---

# Supply Chain System v2

> [!WARNING] This is the earlier prototype
> These notes describe the React prototype in `src/`. The real system now runs the original Zoho widgets on our own server, with a database, sign-in and users, hosted on Railway. See `vault/Deluge Scripts (Obsidian)/00 - Current System.md` and `00 - Port Status.md`.

A React model of the Home Cartel supply chain: Procurement, Fulfillment and Delivery, with the workflow rules enforced in one place.

This vault is generated from the source by `npm run vault`. Edit the app, not these notes.

## Start here

- [[System Map]]: the whole flow on one diagram
- [[Running the app]] and [[How the engine works]]
- [[Rules Index]]: 118 rules
- [[Data Model]]: 24 collections
- [[Differences from the Zoho system]] and [[Not built yet]]
- [[Design decisions]], [[Testing]], [[Glossary]]

## Sections

The six sections of the dropdown in the top bar, plus the Reference link.

| Section | Pages |
| --- | --- |
| [[Analytic]] | [[Supply Chain Analytic]] |
| [[Procurement]] | [[Procurement Dashboard]], [[Inquiry List]], [[Purchase Request]], [[Purchase Order]], [[Shipments]], [[Receiving]], [[Replacement Request]], [[Exceptions]], [[Forecast Setting]] |
| [[Tony Fan]] | [[Tony Fan - Inquiries]], [[Tony Fan - Purchase Request]], [[Tony Fan - Purchase Order]], [[Tony Fan - Shipments]], [[Tony Fan - Replacement Request]] |
| [[Fenteng Lighting]] | [[Fenteng Lighting - Inquiries]], [[Fenteng Lighting - Purchase Request]], [[Fenteng Lighting - Purchase Order]], [[Fenteng Lighting - Shipments]], [[Fenteng Lighting - Replacement Request]] |
| [[Fulfillment]] | [[Fulfillment Dashboard]], [[Sales Order Report]], [[Pre-Order]], [[Order Readiness]], [[Pick]], [[Pack & QC]], [[Crate]], [[To Ship]], [[Exception Control]], [[Transfer Item]] |
| [[Delivery Management]] | [[Delivery Analytics]], [[Daily Team Availability]], [[Initial Scheduling]], [[Service Request]], [[Service Appointment]], [[Ongoing Service]], [[Archived]], [[Field Service Site Visits]], [[Sales Returns]], [[DMS Exception Queue]], [[Truck Maintenance]], [[Schedule Requests]] |
| [[Reference]] | [[Rules]], [[Activity]] |

## In numbers

- 44 pages (0 not built yet), 80 workflow steps, 118 rules, 24 collections
- 51 blocking rules, 31 required-field rules

## All workflow steps

| Step | What it does |
| --- | --- |
| [[inquiryCreate]] | Saves a new inquiry from the form: matched item and customer, quotes, collateral, specs and SRP. Tags every supplier, assigns the quote group, and starts the timeline. |
| [[inquiryUpdate]] | Saves edits to an inquiry. Runs the same checks as create, and writes only what changed to the timeline. Locked once the inquiry is a Sales Order. |
| [[inquiryDelete]] | Deletes an inquiry after confirmation. Its timeline keeps a trail. Locked once the inquiry is a Sales Order. |
| [[inquiryApproveSrp]] | Approves the selling price (SRP) in PHP, from the detail view or straight from a Quote Group chip. |
| [[inquiryEstimate]] | Creates or updates the estimate. Needs all five readiness conditions and a project, and also covers the other Ready inquiries of the same project, with one shared estimate number. |
| [[inquiryApprove]] | Converts the estimate to a Sales Order. Raises a Purchase Request for the selected supplier (or none for Warehouse Stock) and the Fulfillment item. |
| [[customerCreate]] | Creates a customer from the New Customer modal: type, contact details, billing and shipping address. Names must be unique. |
| [[projectCreate]] | Creates a project for a customer from the New Project modal, with the next PRJ-xxxxx code, a group discount and status Active. |
| [[productCreate]] | Adds an item to the catalog by Item ID, or updates the item if that ID is already there. |
| [[chatSend]] | Sends a message in a supplier conversation. Only Fenteng and Tony have threads, and only when they are quoted on the inquiry. |
| [[noteSend]] | Adds a note to the internal Sales and Purchasing conversation on an inquiry. |
| [[prCreate]] | Creates a PR by hand from the New PR form, for an item that did not come through an inquiry. Needs item, target date, quantity, customer, customer type and sales owner. Local sourcing goes to HC System with no freight. |
| [[prEdit]] | Edits the supplier, shipping mode, priority, supplier price, target date or quantity of a PR that has not been converted. Choosing a supplier other than the recommended one needs an override reason. Recomputes whether the PR is Ready for PO. |
| [[prSetSrp]] | Approves the SRP (PHP) for a PR. An approved SRP is the top-priority final price and what goes onto the Purchase Order. |
| [[prHold]] | Puts a PR On Hold, or Cancels it when called with cancel. Needs a reason from the list ("Other" also needs notes) and records the date and an optional follow-up date. The status underneath is untouched. |
| [[prResume]] | Clears the hold (Resume) or the cancellation (Restore), so the PR carries on from the status it already had. |
| [[prConvert]] | Converts the selected Ready PRs into Purchase Orders, one PO per supplier, and locks the PRs. Used by the group step. |
| [[prGroupCreatePO]] | Create PO on a Sales Order group: the active PRs of that order go to one supplier in one PO. Refused if suppliers are mixed, a PR is not ready, or one is already converted. Held and cancelled PRs are left out. |
| [[poSend]] | Sends a Draft PO to its supplier. An unrecognised supplier is refused. A Local PO is issued without any accounting push. |
| [[poAcknowledge]] | Records the supplier's ETD and ETA, once only. Creates the Shipment and its Receiving if they are missing. |
| [[poCancel]] | Cancels a Draft, Sent or Confirmed PO that has not shipped, with a reason. Its pending shipment and receiving are removed and its PRs return to the Ready queue. |
| [[shipmentTransit]] | Marks a Pending shipment In Transit and stamps the date shipped. |
| [[shipmentArrive]] | Marks an In Transit shipment Arrived, which opens its Receiving for counting. |
| [[receive]] | Counts goods off the truck: accepted, damaged, missing. Totals may not exceed expected. Damage or shortage raises an exception; a full accept frees the waiting Sales Order items. |
| [[exceptionCreateRR]] | Raises a Replacement Request for an open exception, sourced from a chosen supplier. One replacement per exception. |
| [[rrApprove]] | Approves a replacement with an expected ship date and ETA, once only. Creates the replacement shipment and its receiving. |
| [[rrCancel]] | Cancels a replacement before it ships, with a reason. The replacement shipment is removed and the exception opens again. |
| [[rrClose]] | Closes a replacement that has been received. |
| [[exceptionRaise]] | Raises an exception by hand (Raise Exception): source, item, type, quantity and optional supplier and notes. |
| [[exceptionReview]] | Assigns an exception to a person with a due date and department. It then reads Under Review. |
| [[exceptionResolve]] | Resolves an Open or Under Review exception by hand, with a note about how it was resolved. |
| [[receivingSendToBooks]] | Sends a receiving that was counted in full to Books. Once only. |
| [[receivingCreate]] | New Receiving, Create From Scratch: a receiving with no PO, for goods that arrived without one. Needs a supplier, an item and a quantity. |
| [[packageCreateOrder]] | Sales Order Report and Pre-Order: creates one package for a whole Sales Order, with a Delivery Type. Every item must be received. |
| [[ecRework]] | Exception Control: sends a QC reject to rework. |
| [[ecUnrepairable]] | Exception Control: marks a QC reject unrepairable, which is what allows a replacement to be requested. |
| [[ecComplete]] | Exception Control: finishes the rework, closes the exception and lets the item be rechecked. |
| [[transferCreate]] | Transfer Item: creates a warehouse request or a warehouse-to-warehouse transfer. |
| [[transferAdvance]] | Transfer Item: moves a request to Done, or a transfer through Dispatched to Received. |
| [[salesReturnCreate]] | Archived: opens a sales return for a completed or failed delivery. Once per delivery. |
| [[salesReturnSendToBooks]] | Sales Returns: sends a return to Books with an RMA number, reason, quantity and signature. |
| [[siteVisitCreate]] | Field Service Site Visits: schedules an assessment for a service request. |
| [[siteVisitUpdate]] | Field Service Site Visits: records whether the site is ready, with notes. |
| [[truckChecklistCreate]] | Truck Maintenance: opens a daily vehicle checklist. |
| [[truckChecklistAdvance]] | Truck Maintenance: starts a checklist, then completes it with a signature. |
| [[truckEntryAdd]] | Truck Maintenance: adds a fuel or service entry. |
| [[scheduleRequestCreate]] | Schedule Requests: records a client request to move a delivery date. |
| [[scheduleRequestDecide]] | Schedule Requests: confirms (the delivery starts from the new date) or declines with a reason. |
| [[supplierRespondInquiry]] | Supplier portal: a supplier answers an inquiry line with availability, lead time and prices. Only while the line is Waiting or Submit Response. Unavailable or Cannot Produce declines it and removes it from the supplier queue. |
| [[supplierCollateral]] | Supplier portal: the selected supplier confirms the product collateral (sample, 3D image, drawing, specification). When every item is Completed or N/A the response is Completed and locked for good. |
| [[supplierRespondPR]] | Supplier portal: a supplier quotes a purchase request raised by hand. A PR that came from an inquiry is view-only, and a held or cancelled PR cannot be quoted. |
| [[supplierAckPO]] | Supplier portal: the supplier acknowledges a sent PO with an ETD and ETA, which confirms it and creates the shipment. Blocked if every line is held or cancelled. |
| [[supplierShip]] | Supplier portal: the supplier ships a pending shipment with a date shipped (not in the future) and a mode. The shipment goes In Transit. |
| [[supplierApproveRR]] | Supplier portal: the supplier approves a replacement request with a mode, expected ship date and ETA. It becomes Acknowledged and the replacement shipment is created. |
| [[supplierRRProgress]] | Supplier portal: the supplier moves an approved replacement forward to In Production, then Shipped, and may update the dates. Shipped puts the replacement shipment In Transit. It never goes backwards. |
| [[createPackage]] | Assigns a PAC number to a received item. Refused while the item is still on order. |
| [[assignPicker]] | Names the picker who will collect the item. |
| [[setPayment]] | Sets the item's payment to Paid, Unpaid or Credit. |
| [[approveOverride]] | Lets an unpaid item through the gate and dispatch, with a reason and a valid-until date in the future. |
| [[gateRelease]] | Releases an item from the Readiness Gate to Pick. Needs a package, a picker and settled payment. |
| [[pickDone]] | Marks the item picked and sends it straight to Pack & QC. The picker is deliberately not carried forward. |
| [[qcAssign]] | Pack & QC: names the packer, who is also the quality checker. Approve and Reject are refused until this is done. |
| [[qcApprove]] | Approves at QC. Goes to Crate if the item needs crating, otherwise straight to Order Aggregation. |
| [[qcReject]] | Rejects at QC with a reason and raises a Fulfillment exception. |
| [[qcRecheck]] | Puts a rejected item (or one whose replacement arrived) back in Pack & QC for a fresh check, with no packer assigned. |
| [[crateSet]] | Updates Crating Status: Pending, In Progress or Done. |
| [[crateComplete]] | Moves a crated item on to Order Aggregation. Refused until Crating Status is Done. |
| [[dispatch]] | Dispatches an item from Order Aggregation. Blocked on payment, once only, and creates the Service Request in Delivery Management. |
| [[forecastSettingsSave]] | Saves the forecast lead-time settings (each leg is a min and max in days), the two toggles and the weeks shown. A minimum above its maximum is refused. Every forecast date is recalculated from them. |
| [[forecastSettingsReset]] | Puts every forecast setting back to its default. |
| [[srSetInitial]] | Sets or changes the initial delivery date, which anchors the scheduling engine's search. |
| [[srConfirmSite]] | Confirms the site with a method and notes. Both are required, and only a person can confirm. |
| [[srHandOff]] | Hands a job from Initial Scheduling to Service Request. Needs an initial date. |
| [[srSchedule]] | Runs the scheduling engine: earliest team with room from the initial date, skipping Sundays and days off. Pick Up jobs skip the engine. |
| [[srStart]] | Starts a Scheduled job, moving it to Ongoing. |
| [[srComplete]] | Completes an Ongoing job. |
| [[srFail]] | Marks an Ongoing job failed with a reason and sends it to the Exception Queue. |
| [[srResolve]] | Resolves a failed delivery by Rescheduling (new date, priority job) or Reverting to System (engine starts over). |
| [[teamCapacity]] | Sets how many jobs a team can take per day. |
| [[teamToggleOff]] | Marks a date as a day off for a team, or brings the team back if it was already off. |
