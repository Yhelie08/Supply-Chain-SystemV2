# Exceptions, Alerts and Notifications

## 1. Exceptions (one log for every stage)

### Purpose
A problem should be flagged **where it is found**, by whoever finds it: an empty bin at pick, a missing accessory at QC, a crate that will not fit, damage at receiving, a refused item at site. All go to one `exceptions` table.

### Rules

| # | Rule |
|---|---|
| EX-1 | Every queue row in Receiving, Pick, QC, Rework, Crate, Order Aggregation and the field app has an **Exception** action. It opens a short form with stage-specific reasons. |
| EX-2 | An exception records the **stage it was found in** and the **stage it was caused in**, plus `fault_origin`: supplier, transit, our warehouse, at site, unknown. Damage found at QC but caused in transit is a freight problem, not a QC problem. |
| EX-3 | Opening an exception **holds the item** at its current stage: it cannot be marked picked, passed, crated or aggregated while the exception is open. The package goes to **Blocked** with the exception owner as `blocked_owner_id`. |
| EX-4 | Photos are required for damage exceptions (min 1). Production and shipment photos from the supplier are shown beside them so fault origin can be judged. |
| EX-5 | Resolutions: **Rework** (creates a rework job), **Replace** (creates an RR, see Procurement 06), **Accept as is** (supervisor, with reason), **Cancel line** (supervisor). Closing releases the item back into its stage at its true age. |
| EX-6 | Every exception has a named owner and is subject to the aging guard. |

### Fulfillment reasons [DEFAULT list, Admin-editable]
Pick: bin empty, wrong item in bin, short quantity. QC: damaged, wrong spec (wattage, color temperature, size, finish), missing part or accessory, not working. Crate: will not fit, crate material missing. Aggregation: package incomplete, label wrong.

## 2. Alerts

Alerts come from three places: **silence** (expected windows, 05/04), **aging** (sorting engine §5) and **thresholds** (e.g. urgency over 5%, born-late rate rising, ranking stale). Each alert has a severity, an owner role and a link to the record.

## 3. Notifications

### The rule that keeps notifications useful
**A state that carries no action gets no notification.** Silence means healthy. "On track" never notifies anyone. Anything that arrives must be worth opening.

| Channel | Used for |
|---|---|
| In-app (bell + "My work" list) | Everything below, always |
| Email | Supplier digests, daily summaries, escalations **[DEFAULT]** |
| SMS / Viber | Customers (delivery), field team day-before reminder **[DEFAULT]** |

### Who hears what

| Event | Who | How |
|---|---|---|
| Fulfillment record becomes **About to be late** | Fulfillment supervisor | Morning list (not instant) |
| Record becomes **Already late** | Supervisor **and** the sales agent who owns the order | Same day, in-app + email |
| Record **Blocked** | The named owner of the block | Instant, in-app |
| Procurement **Act now** | Buyer | Instant + morning list |
| Procurement **Tell the customer** | Sales agent (with a drafted customer message for approval) | Same day |
| Supplier ladder rung fires | Buyer (rung 1–2); buyer + supervisor (rung 3 decision) | Instant |
| Aging 14 / 21 days | Supervisor / Admin | Instant |
| Silence alert | Owner role in `expected_windows` | Instant |
| Exception raised | Exception owner; buyer if fault origin = supplier | Instant |
| Job failed or partial | Dispatcher + sales agent | Instant |

Notifications fire on a **change** of state only (the day a record becomes late), never every day for the same state. Records that are already late when imported at go-live send nothing; they appear in the lists.

### Supplier notifications
**One digest per supplier per day** listing every overdue line and what is asked, in the supplier's language (EN / 中文), plus portal notifications. Never one email per event.

### Daily summaries
- **Morning list** per role at 07:00 **[DEFAULT]**: the person's suggested-release work, new blocks they own, decisions waiting in the approval queue.
- **Supervisor brief** (later written by an agent, see 07 Agent Hooks): what was done yesterday vs capacity, what is late, what is blocked, decisions waiting.

## Acceptance checklist

- [ ] A picker flags "bin empty": the package is held, shows Blocked with the owner, and cannot be marked picked.
- [ ] Damage found at QC can be recorded as caused in transit; the monthly report shows damage by fault origin.
- [ ] Closing the exception returns the package to its original rank, not the bottom.
- [ ] No notification is sent for on-track records.
- [ ] A supplier with 5 overdue lines gets one digest email, not five.
