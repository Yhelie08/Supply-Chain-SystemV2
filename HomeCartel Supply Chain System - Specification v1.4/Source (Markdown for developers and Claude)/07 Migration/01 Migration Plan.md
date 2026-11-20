# Migration Plan: Moving off Zoho Creator

## Principle
Move **one department at a time**, in the build order, with a short **parallel run**, and never lose an open order. Closed history is imported for reporting; open work is imported to continue.

## Steps per department
| Step | What happens |
|---|---|
| 1. Export | Export Creator forms and reports for the department (open records + 12 months of closed **[DEFAULT]**), including subforms and attachments. |
| 2. Map | Map each Creator field to the new table (field map kept in the repo as a CSV). Rename confusing fields on the way (Creator PO "Order date" → `po_date`; "Ship"/"Shipment" → `shipout_*` / `receive_*`). |
| 3. Clean | Fix known data problems before import: supplier names ("Tony" vs "Tony Fan") to supplier IDs; installer list reconciled; 93 orders whose target date is before their order date flagged for review; replacements given a target (DT-6); the duplicate crate status fields resolved. |
| 4. Import | Import into a **staging** Supabase project; run the acceptance checklists on real data. |
| 5. Parallel run | 2 weeks **[DEFAULT]**: staff work in the new system; Creator is kept read-only as a fallback. Compare daily: open counts per stage, dates, rankings. |
| 6. Cut over | Creator screens for that department are switched off (read-only archive kept for 12 months). |

## Stamps for imported records
- Imported records keep Creator's created / modified times.
- Event stamps that existed in Creator are imported with `source = 'import'`.
- Stamps that never existed stay empty (shown as a dash). **Nothing is invented** (T-9).
- Order Date is filled from Books for every open record before cut-over: the sort depends on it.

## Order of cut-over
1. Foundation + Books sync (no Creator change; runs alongside)
2. Procurement (Inquiry, PR, PO, Ship & Track, supplier portal): suppliers get new logins and a one-page guide in EN/中文
3. Receiving, Exceptions, RR
4. Fulfillment (all stages together, so the ranking is the same on every screen)
5. Delivery office
6. Field app + write-back (together)

## While departments are in different systems
During a phased cut-over, work must still pass between a department already in the new system and one still in Creator (for example: goods received in the new system must reach fulfillment in Creator). Two ways to handle it:

| Option | How | Cost |
|---|---|---|
| **A. Back-to-back cut-over [DEFAULT]** | Build and test steps 1–4 on staging with copied data, then cut over Procurement, Receiving, Fulfillment and the Delivery office in consecutive weeks. During those few weeks the handoff is entered by hand in both systems. | Benefits arrive later, but no throwaway work |
| B. Bridges | Each department goes live as soon as it is built; a small sync pushes handoffs into Creator (received stock → Creator Pre-Order; aggregated packages → Creator scheduling). | Earlier benefit, but 1–2 weeks of work per bridge on a system being retired |

## Risks and how they are handled
| Risk | Handling |
|---|---|
| Two systems disagree during the parallel run | Creator is read-only during the run; only the new system is edited |
| Suppliers keep replying by WeChat instead of the portal | Buyer enters it with the "reported" time; agent A2 later reads messages |
| Staff skip the new screens | Every stage move happens only in the new system; stamps prove use |
| Missing data blocks the sorter | Only Order Date is required for sorting; everything else can be filled later |
| Books API limits during import | Import at night, rate-limited |

## Acceptance checklist (per department)
- [ ] Open record counts per stage match Creator on cut-over day.
- [ ] Every open record has an Order Date.
- [ ] Three random orders traced end to end show the same status in both systems.
- [ ] Staff confirm the daily list on day 1 of the parallel run.
