# Decision Log

The design doc (folder 08) records the discussion in the order it happened. These are the **final decisions**. If the design doc says something different, this list wins.

## Final decisions

| # | Topic | Final decision | Replaces |
|---|---|---|---|
| D1 | Platform | One new system on Railway + Supabase. Zoho Creator is retired. "LocalSystem" was the start of this new system, not a second system. | "Two systems" concern; building fixes in Creator |
| D2 | Stack | Python (FastAPI) backend, SQL in Postgres for sorting and calculators, HTMX office screens, React PWA for the field app | TypeScript-everywhere proposal; Node stack in the Onfleet doc |
| D3 | Sort key | **Books Sales Order date, oldest first**, inside every category. Quotation date is stored beside it for reference. | Record creation date; target date first (staff spec 2.1.2) |
| D4 | Categories: Fulfillment and Delivery | 1 Broken/complaint · 2 Already late · 3 About to be late · 4 On time · Blocked shown separately with an owner | Hidden priority tiers; one ranked list; "jump tier" |
| D5 | Categories: Procurement | 1 Act now · 2 Tell the customer · 3 Watch | — |
| D6 | Urgency | **Manual only (M1).** Needs a name and reason, expires after the promised date or 14 days, can be raised but never lowered by hand, never skips a gate. Rules U1–U7 dropped. | Staff spec 4.1 rules U1–U7 |
| D7 | Sorting and box counts | Sorting **does not** need box counts. Boxes are only used by the capacity calculators. | — |
| D8 | Box count | Count the boxes: one field on the package, entered when the package is made up. No units-per-box formula. | Units-per-box derivation |
| D9 | Fulfillment capacity | `backlog_days = boxes ÷ (people × boxes_per_hour × hours_per_day)` | Packages × 2 hours; fixed 32 crew hours |
| D10 | Delivery capacity | The limit is **installers**, not trucks. `backlog_days = jobs ÷ sites_per_day`. Mix is about 50/50 installation vs drop-off. | Truck volume / cbm as the limit |
| D11 | Third-party delivery | Lalamove (or similar) for **drop-offs only**. Installation jobs always use our own teams. | — |
| D12 | Stages | Pack retired. Paint = rework (a loop, not a step). "Received" = binned, counted and pickable. | Pack stage; Paint as a planned step |
| D13 | Timestamps | One server stamp each time a record **enters** a stage. Each event stores *when it happened* and *when the system was told*. Never build a button whose only job is recording a time. Silence past an expected window is an alert. | Separate start/end stamp pairs |
| D14 | Dates | Order Date, Target Delivery and Forecast Delivery always shown together. The forecast never overwrites the promise. | — |
| D15 | Supplier ladder | Day 1 late → notify + call; day 2 → request discount; day 3 → **prepared decision** to cancel and re-source (Taobao). "Late" = production not started by PO + 1 day. | 3 / 7 / 14-day ladder; automatic cancellation |
| D16 | Feasibility gate | At PO creation (and in pricing), compare the planned arrival with the target. **Warn and suggest, do not block.** Record the shortfall. | — |
| D17 | Replacements | Get their own top category (Broken). A replacement also gets a Target Delivery when created, so it never sinks. | Ranking by target date with "no date goes last" |
| D18 | Pre-delivery gate | Build it (staff spec 2.2, Tier 1 first). Partial dispatch is an explicit, approved decision. | — |
| D19 | Ship & Track access | Shipment trackers see Ship & Track only, **no costs, prices or markups**. | — |
| D20 | Field team and money | Drivers and installers never see what the customer paid or owes. **No cash collection by field teams** (decided); payment is cleared before dispatch. | Onfleet doc "COD collected" screen |
| D21 | Delivery ideas from the Onfleet review | **Taken:** per-line delivery results, failure reason codes, redelivery as a new linked job, proof requirements per item type, automatic status pings, load sheet in reverse drop order, version check on day lists, customer tracking link and SMS with a time window, dispatcher force-close, fragile and two-person flags, delivery metrics. **Left out:** their tech stack, cbm/weight for every SKU, drag-and-drop load board, map server, outside webhook API, live GPS, route solver, 3D packing. | — |
| D22 | Agents | Rules and calculators stay plain code. Agents read, draft and suggest; humans approve. **Agent Phase 2:** supplier chaser, shipment inbox reader, site confirmation, pre-delivery qualification. **Agent Phase 3:** customer late notice, stuck-order nudger, complaint intake, proof-of-delivery check, daily supervisor brief, data cleaner, QC photo check. The system is built agent-ready from day one. | — |
| D23 | Build order | System first, agent-ready; agents plug in later through the same gates. Never launch the field app before the write-back to Zoho Books works. | — |

## Ideas recorded in the design doc that are **not** built

| Idea | Why not |
|---|---|
| Hidden priority tiers / one ranked list (design doc Part 3) | Replaced by visible categories (D4) |
| Automatic urgency rules U1–U7 | 78% of orders are late, so the flag would mean nothing (D6) |
| Ranking by Target Delivery first | 74% of target dates were impossible when set; Order Date is always true (D3). Can be switched later by a setting once target dates are trustworthy. |
| Start and end stamp pairs | One stamp per stage entry is simpler and cannot disagree with itself (D13) |
| Supplier ladder at 3 / 7 / 14 days | Replaced by 1 / 2 / 3 (D15) |
| Units-per-box derivation | Count boxes directly (D8) |
| Route optimisation, live GPS map | 5–8 drops a day; the dispatcher and the load order matter more (D21) |
| cbm / weight master data for 8,000 SKUs | Trucks are not the limit today (D10). Revisit if they become one. |
