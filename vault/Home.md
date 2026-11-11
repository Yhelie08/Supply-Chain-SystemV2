---
title: Home
tags: [index]
---

# Supply Chain System v2

A React model of the Home Cartel supply chain: Procurement, Fulfillment and Delivery, with the workflow rules enforced in one place.

This vault is generated from the source by `npm run vault`. Edit the app, not these notes.

## Start here

- [[System Map]]: the whole flow on one diagram
- [[Running the app]] and [[How the engine works]]
- [[Rules Index]]: 76 rules
- [[Data Model]]: 18 collections
- [[Differences from the Zoho system]] and [[Not built yet]]
- [[Design decisions]], [[Testing]], [[Glossary]]

## Modules

| Module | Pages |
| --- | --- |
| [[Overview]] | [[Dashboard]] |
| [[Procurement]] | [[Inquiry]], [[Purchase Request]], [[Purchase Order]], [[Shipments]], [[Receiving]], [[Exceptions]], [[Replacement]] |
| [[Fulfillment]] | [[Readiness Gate]], [[Pick]], [[Pack]], [[QC Checklist]], [[Crate]], [[Order Aggregation]] |
| [[Delivery]] | [[Initial Scheduling]], [[Service Request]], [[Appointments]], [[Ongoing Service]], [[Exception Queue]], [[Teams & Capacity]] |
| [[Reference]] | [[Rules]], [[Activity]] |

## In numbers

- 22 pages, 48 workflow steps, 76 rules, 18 collections
- 32 blocking rules, 19 required-field rules

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
| [[shipmentTransit]] | Marks a Pending shipment In Transit and stamps the date shipped. |
| [[shipmentArrive]] | Marks an In Transit shipment Arrived, which opens its Receiving for counting. |
| [[receive]] | Counts goods off the truck: accepted, damaged, missing. Totals may not exceed expected. Damage or shortage raises an exception; a full accept frees the waiting Sales Order items. |
| [[exceptionCreateRR]] | Raises a Replacement Request for an open exception, sourced from a chosen supplier. One replacement per exception. |
| [[rrApprove]] | Approves a replacement with an expected ship date and ETA, once only. Creates the replacement shipment and its receiving. |
| [[createPackage]] | Assigns a PAC number to a received item. Refused while the item is still on order. |
| [[assignPicker]] | Names the picker who will collect the item. |
| [[setPayment]] | Sets the item's payment to Paid, Unpaid or Credit. |
| [[approveOverride]] | Lets an unpaid item through the gate and dispatch, with a reason and a valid-until date in the future. |
| [[gateRelease]] | Releases an item from the Readiness Gate to Pick. Needs a package, a picker and settled payment. |
| [[pickDone]] | Marks the item picked and opens its Pack record. The picker is deliberately not carried forward. |
| [[packSend]] | Names the packer and sends the item to QC. The packer becomes the Quality Checker. |
| [[qcApprove]] | Approves at QC. Goes to Crate if the item needs crating, otherwise straight to Order Aggregation. |
| [[qcReject]] | Rejects at QC with a reason and raises a Fulfillment exception. |
| [[qcRecheck]] | Sends a rejected item (or one whose replacement arrived) back to Pack for a fresh QC. |
| [[crateSet]] | Updates Crating Status: Pending, In Progress or Done. |
| [[crateComplete]] | Moves a crated item on to Order Aggregation. Refused until Crating Status is Done. |
| [[dispatch]] | Dispatches an item from Order Aggregation. Blocked on payment, once only, and creates the Service Request in Delivery Management. |
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
