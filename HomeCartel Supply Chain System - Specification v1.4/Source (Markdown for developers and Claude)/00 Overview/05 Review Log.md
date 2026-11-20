# Review Log

A full review pass over the package, checking every file against the others and against the decisions. These are the problems found and what was changed.

## Contradictions fixed

| # | Problem in v1.0 | Fix in v1.1 | File |
|---|---|---|---|
| 1 | Manual urgency was listed as a tie-break **after** Order Date, so it would only matter between two orders with the same date. Another rule said it "sorts first inside its category". | Urgency is now sort key 1 inside a category, Order Date key 2. | Engines 01 |
| 2 | Two different settings described the same days: `downstream_buffer_days` (5) in the sorter, and `fulfillment_days` + `delivery_days` (3 + 2) in the calculator. The sorter also compared arrival with a pickable date. | One set of settings. The sorter compares the forecast **pickable** date with the date the goods must be pickable. | Engines 01, Defaults |
| 3 | Production planned start was "acknowledgement + 1" in the PO module but "PO + 1" in the ladder and the decision log. | Always **PO Date + 1**. A late acknowledgement raises its own alert and does not move the clock. | Procurement 03 |
| 4 | The feasibility test example said "shortfall about 36 days". The arithmetic gives 41. | Corrected, with the sum shown. | Engines 02 |
| 5 | Default job durations (installation 4 h + 20% buffer) allow only **one** installation per 8-hour team-day, but the delivery calculator assumed 2 per team. | Calculator default is now 1 installation per team per day (about 3 a day with 3 teams). **Measure this first**: it decides how big the delivery backlog really is. | Engines 02, Delivery 02 |
| 6 | The Service Request was created only at aggregation, which builds in the "finished goods waiting for a slot" gap the system is meant to remove. Scheduling also treated "not yet aggregated" as Blocked. | SR is created when the package passes QC; a job is simply never scheduled before the package's ready date. | Fulfillment 04, Delivery 01, 02 |
| 7 | The database stored a stop number on each job, while the scheduling rules say the stop number is the job's position in the day list. | Removed from the job. | Database |
| 8 | Replacement target date had two different formulas. | One rule: original target if still ahead, else creation + 21 days. | Engines 03 |
| 9 | Dispatchers "never see costs", but they book the third party and must see its fee. | Dispatchers see third-party delivery fees, not product costs or prices. | Overview 01, Delivery 02 |
| 10 | `boxes_per_hour` was defined as boxes *picked* in one place and boxes *out* in another. | Boxes finished (pick + QC + crate) per person per hour, whole crew. | Engines 02 |
| 11 | Three pairs of rule numbers collided (AG-, SR-, ST- used in two files each). | Renamed: sorter rules are SE-, fulfillment stage rules FS-, aggregation rules OA-. | Engines 01, Fulfillment 03, 04 |

## Gaps filled

| # | Gap | What was added | File |
|---|---|---|---|
| 12 | The cut line ignored work already released, so it would over-release every day. | Free capacity = capacity minus boxes released and not yet finished. | Engines 01 |
| 13 | On go-live day, about three-quarters of orders are already late and many are over 21 days old. Every one would have sent a notification and raised an aging alert. | Notifications fire only when a state **changes**; imported records count aging from the import date. | Engines 01, 05 |
| 14 | "Arrived" needed a site photo, so a failed visit (gate closed) might never be stamped. | Arrived = the first action at the site. | Delivery 04, Engines 04 |
| 15 | Third-party jobs have no field app, so nothing said who records the result. | The dispatcher records it from the provider's proof; the gate asks for the booking reference in place of the driver signature. | Delivery 02, Fulfillment 04 |
| 16 | No rule for the payment check when Books is down at dispatch. | Use the last synced status if under 60 minutes old, else fail. | Fulfillment 04 |
| 17 | No stock-on-hand source for the "items available" gate on stock items. | `stock_levels` table, synced read-only from Zoho. | Database, Integrations 01 |
| 18 | "Books" was used for functions that belong to Zoho Inventory (receives, transfers, packages, stock). | Note added; build step 0 confirms which API each call uses. | Integrations 01 |
| 19 | Stock PRs have no customer order, so no sort date. | They use their creation date. | Procurement 02, Engines 01 |
| 20 | Suppliers without a portal (Taobao, HC System) had no way to report. | The buyer enters updates for them. | Procurement 07 |
| 21 | The phased cut-over did not say how work passes between a department in the new system and one still in Creator. | Two options described; default is back-to-back cut-over with no bridges. | Migration 01 |
| 22 | The morning sequence (load, gate, app, check-in) was not stated, and two files disagreed on when the app gets the day. | Sequence stated (DS-R5). | Delivery 03, 04 |
| 23 | Job statuses and the shipment `arrived_warehouse` stage were missing from the database. | Added. | Database |

## Rights I had given without asking (now marked as defaults)

Sales agents changing a promise date and requesting urgency on their own orders were written into v1.0 as settled. They were never agreed. They are now marked **[DEFAULT]** and listed in Defaults A-17.

## Checked and left unchanged

- Access rules: shipment tracker (no costs), field team (no payment data), supplier (no customer data) are consistent across the database, the modules and the field API.
- The "no button only for a time" rule: no screen in the package breaks it.
- Every item in the decision log (D1–D23) is reflected in its module.
- All ten delivery items taken from the Onfleet review are present; all excluded items are absent.
- All eleven agents appear in the agent hooks with the agreed phases.

---

# v1.1 → v1.2 (after Allan's correction)

| # | Change | Why | File |
|---|---|---|---|
| 24 | Delivery capacity corrected: **3 sites per team per day** (observed 3–4), counting drop-offs and installations together. Was 1. | Allan: teams normally do 3–4 sites a day for delivery and installation service. The v1.1 default was far too pessimistic and would have made the delivery backlog look three times worse than it is. | Engines 02, Defaults |
| 25 | Job durations corrected to door-to-door, **including travel**: drop-off 1.5 h, installation 2.5 h, full-day installation 8 h. The 20% traffic buffer per job is replaced by a 10% buffer on the whole team-day. | The old durations (2 h and 4 h, plus a per-job buffer) contradicted 3–4 sites a day. Durations now match what teams actually do. | Delivery 01, 02, Defaults |
| 26 | `max_jobs` per team-day raised from 3 to **4**. | 4 drop-offs, or 3 installations, or a mix — the normal day. | Delivery 02 |
| 27 | Delivery backlog now counts **all** jobs, with drop-offs shown separately as the part that can be moved to a third party. | Simpler and matches how the day is actually planned. | Engines 02 |
| 28 | **New module: Control Panel** (Engines 08). Every number in the system is a setting with a plain-words label, a default, limits, a "what it affects" line, and full change history. Includes a simple daily **Capacity** screen, the people and teams list, and all editable lists. | Allan: the capacity numbers must be adjustable from a control panel, for both delivery and warehouse. The same principle now applies to every number in the system: no hard-coded business values, no developer needed to change one. | Engines 08, Database, Build Phases |
| 29 | Measured-vs-used values shown side by side, with a **Use measured value** button. The system never overwrites your number by itself. | Boxes per hour, sites per day and job durations are guesses until measured; this closes the loop without taking control away. | Engines 08 |

---

# v1.2 → v1.3 (Allan's answers to the open questions)

| # | Decision | File |
|---|---|---|
| 30 | Checklist line 1 "abang" = electrical wiring ready at the mounting points. No = installation blocked until ready; drop-off may go ahead; asked again the day before; failed visit `site_not_ready` if found not ready on site. | Delivery 01, 04 |
| 31 | Drivers and installers are edited any time in the Control Panel (staff change often); deactivated people leave future rotation and their jobs go to the dispatcher. | Delivery 02, Engines 08 |
| 32 | Production photos required to leave Production. | Procurement 04 |
| 33 | Remote signature: the customer signs the single-use link sent to their own number, **no ID upload**; the person the goods were left with gives name and relation only. | Delivery 04 |
| 34 | No cash collection by field teams. | Decision Log D20 |
| 35 | Sales agents may change promise dates on their own orders (with a reason) and request urgency (supervisor approves). | Overview 01, Engines 01 |
