# Build Phases

Build in this order. Each step is usable on its own, and each one makes the next one possible. Effort figures are rough, for one in-house developer working with Claude.

| Step | Scope | Why this order | Rough effort |
|---|---|---|---|
| **0. Foundation** | Database, login and roles (RLS), policy settings, the event log and stamps, the **Control Panel** (settings with history), Zoho Books sync of Sales Orders, invoices and payment status, Order Date on every record, the three dates, the **on-time delivery metric** | Without stamps and dates nothing else can be measured or proven | 3–5 weeks |
| **1. Procurement core** | Inquiry, PR (with On Hold on Books void), pricing hand-off, PO with the **feasibility gate**, Ship & Track with planned vs actual dates, supplier portal (production start/end, photos), supplier ladder, procurement sorter (Act now / Tell the customer / Watch) | Most late deliveries are created here | 5–7 weeks |
| **2. Receiving + Exceptions + Replacement** | Four receiving events, partial receives, bin location, exceptions with fault origin, RR with supplier choice and a target date | "Received" must mean pickable before fulfillment can trust it | 3–4 weeks |
| **3. Fulfillment** | Packages with box count, Order Readiness (scan, categorise, sort, suggest), cut line, aging guard, Pick, QC, Rework, Crate, Order Aggregation, **Pre-Delivery Gate**, Kanban, Scoreboard, SO Report, Warehouse Request, Transfer | Fixes *natatabunan* in the warehouse | 5–7 weeks |
| **4. Delivery office** | Service Request with site checklist, earliest-date service with soft holds, daily team rotation, scheduling engine, delivery sorter, appointments, dispatch, third-party booking, load sheet, Sales Returns, Site Visits, Truck Maintenance | Turns delivery into a planned queue | 4–6 weeks |
| **5. Field app + write-back (ship together)** | Offline PWA: today's jobs, per-line results, proofs, signatures, remote signature, failure codes, status pings. **At the same time:** close-out write-back to Zoho Books, returns to stock, exceptions for refusals | A field app whose results are retyped into Books by hand gets abandoned | 6–9 weeks |
| **6. Customer communication** | Day-before SMS with window and tracking link, "on the way", delivered with photo, failed with rebook, tracking page, procurement late notices through the sales agent | Customers stop calling to ask | 2–3 weeks |
| **7. Analytics** | Delivery, fulfillment and procurement dashboards, the key metrics | Proves the system works | 2 weeks |
| **8. Agent Phase 2** | Supplier chaser, shipment inbox reader, site confirmation, pre-delivery qualification. All in suggest mode first. | Needs clean data from steps 0–7 | 4–6 weeks |
| **9. Agent Phase 3** | Customer late notice, stuck-order nudger, complaint intake, proof-of-delivery check, daily supervisor brief, data cleaner, QC photo check | After Phase 2 agents prove accurate | 4–6 weeks |

**Total:** roughly 9–14 months with one developer plus Claude. Steps 1–4 can overlap if a second developer joins.

## Rules for the build

1. **Agent-ready from day one.** Every decision record has `decided_by_type` (system / human / agent), and the approval queue and agent log tables exist from step 0, even before any agent runs.
2. **Never ship step 5 without its write-back.**
3. **Rotate the leaked SMS credentials** (hardcoded in the old `dms_site_confirmation` script) **before** any customer SMS is sent from the new system.
4. **Measure while building.** Start counting these now, by hand if needed: boxes per person per hour, and installation jobs per team per day. The calculators need them.
5. **Each step ends with its acceptance checklists passing**, using real data copied from Zoho Creator.
6. **Parallel run** each department for 2 weeks **[DEFAULT]** before switching off its Creator screens (see 07 Migration).

## Before step 0: data to prepare

| Item | Owner | Needed for |
|---|---|---|
| Current drivers and installers entered in the Control Panel | Delivery office | Team rotation |
| Vehicle list (3 field vehicles today) | Delivery office | Team rotation, truck maintenance |
| Supplier list with default lead times | Procurement | Feasibility gate |
| Fragile and two-person flags on delivery-eligible items (start with mirrors, glass, large fixtures) | Procurement / catalog | Scheduling and proof rules |
| One week of counted boxes per person per hour | Fulfillment supervisor | Fulfillment calculator |
| One week of sites per team per day, split into installations and drop-offs | Delivery office | Delivery calculator |
