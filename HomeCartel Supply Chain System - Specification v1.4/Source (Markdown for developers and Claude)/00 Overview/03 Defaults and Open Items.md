# Defaults and Open Items

Everything marked **[DEFAULT]** in this package is listed here. Each default lets building start now. Most are **settings** that Admin can change later without code.

## A. Decide these first (they change behaviour, not just a number)

| # | Item | Default chosen | Where |
|---|---|---|---|
| 1 | Site checklist line 1 ("abang") | **Decided:** electrical wiring ready at the mounting points. No = installation blocked until ready | Delivery 01 |
| 2 | Meaning of checklist lines "Support" and "Mirror" | Support = something to mount fixtures on; Mirror = a mirror at the site or in the job | Delivery 01 |
| 3 | Installer and driver list | **Decided:** editable any time in the Control Panel (staff change often) | Delivery 02, Engines 08 |
| 4 | Production photos mandatory? | **Decided:** yes, required to leave Production. Shipment photos optional | Procurement 04 |
| 5 | Automatic cancellation at ladder day 3 | **Off.** Day 3 is always a prepared decision | Procurement 04 |
| 6 | Field teams collecting cash | **Decided: no.** Payment is cleared before dispatch | Decision Log D20 |
| 7 | Remote signature | **Decided:** the customer signs the link, no ID upload; the person the goods were left with gives name and relation only. Link 72 h; supervisor decides after 7 days. Default: a representative named in advance on the SR may sign instead | Delivery 04 |
| 8 | Who approves manual urgency | Sales agent requests, supervisor approves | Engines 01 |
| 9 | Sales agents: see only their own customers? | Yes, own customers only | Overview 01 |
| 10 | Late notice to customers from procurement | Goes to the sales agent first, with a drafted message | Delivery 06 |
| 11 | When the box count is entered | At pick completion; updated at crate | Fulfillment 01 |
| 12 | Splitting an order into partial packages | Supervisor decision with a reason, never automatic | Fulfillment 01 |
| 13 | Return credit notes | Created as a **draft** in Books for accounting to approve | Delivery 07 |
| 14 | Kanban board | Read-only (work moves in the stage screens) | Fulfillment 06 |
| 15 | Receiving staff | Part of the fulfillment staff role | Overview 01 |
| 16 | How far manual urgency jumps | First **inside its own category** only. An urgent On-time order still sits below every Late order. The alternative: urgent orders rank right after Broken, above Late. | Engines 01 |
| 17 | Sales agents changing a promise and requesting urgency | **Decided:** yes on their own orders, with a reason; urgency needs supervisor approval | Overview 01 |
| 18 | When the delivery Service Request is created | When the package passes QC, so scheduling starts before aggregation | Delivery 01 |
| 19 | Cut-over style | Back-to-back (build steps 1–4, then switch departments in consecutive weeks), no bridges into Creator | Migration 01 |
| 20 | Payment check when Books is unreachable at dispatch | Use the last synced status if under 60 minutes old, else fail | Fulfillment 04 |

## B. Numbers to measure (replace the default after one week of counting)

| Setting | Default | Measure how |
|---|---|---|
| `boxes_per_hour` (per person) | 8 | Count boxes picked per person per hour for one week |
| `people` on shift | 4 | Supervisor enters daily |
| `hours_per_day` (productive) | 7 | Shift length minus breaks |
| `sites_per_team_per_day` | 3 (observed 3–4) | Count sites per team per day for one week, separating installations from drop-offs |
| `default_promise_days` (orders with no target) | 25 | Recent median promise |
| Job durations (door to door) | Drop-off 1.5 h · installation 2.5 h · full-day installation 8 h | From job stamps after a month |
| `day_buffer_pct` (held back per team-day) | 10% | From job stamps after a month |

## C. Settings with defaults (change any time)

| Area | Setting | Default |
|---|---|---|
| Sorting | `sort_primary_key` | `order_date` |
| Sorting | `at_risk_slack_days` | 3 |
| Sorting | `proc_watch_slack_days` | 7 |
| Sorting | Aging alerts (low / mid / high) | 7 / 14 / 21 days |
| Sorting | Nightly run | 05:00 |
| Sorting | `urgency_warning_pct` | 5% |
| Fulfillment | `assign_batch_boxes` | 20 |
| Fulfillment | Rework silence alert | 3 days |
| Fulfillment | `aggregation_wait_days` | 2 |
| Fulfillment | Warehouse request alert | 24 working hours |
| Fulfillment | Crate weight and size | Required |
| Fulfillment | Credit check at release | Credit terms only |
| Procurement | Production days (supplier default) | 20 |
| Procurement | Consolidation days | 3 |
| Procurement | Transit days | LCL / FCL 30 · Air 14 |
| Procurement | Receiving / fulfillment / delivery days | 2 / 3 / 2 |
| Procurement | PO acknowledgement window | 1 day |
| Procurement | `inquiry_quote_days` | 2 |
| Procurement | `rr_default_days` (replacement target) | 21 |
| Procurement | Forecast window while at sea | ± 3 days |
| Delivery | `rotation_days_ahead` | 14 |
| Delivery | Team-day `max_hours` / `max_jobs` | 8 / 4 |
| Delivery | `max_days_scheduling_window` | 30 |
| Delivery | `soft_hold_minutes` | 20 |
| Delivery | `dropoff_max_wait_days` (before suggesting third party) | 2 |
| Delivery | Appointment windows | Morning / afternoon |
| Delivery | `confirm_cutoff` | 5pm the day before |
| Delivery | `site_visit_minutes` | 90 |
| Delivery | `tracking_expiry_hours` | 48 |
| Delivery | `archive_after_days` | 7 |
| Delivery | Proof retention | 3 years |
| Delivery | Maintenance warning | 7 days before due; oil every 5,000 km |
| Delivery | Working / noisy hours | Warning only, does not block |
| Delivery | Third-party proof | Provider photo + customer confirmation link |
| Shared | `approval_sla_hours` | 24 |
| Shared | Morning list | 07:00 |
| Shared | SMS sending hours | 7am–9pm |
| Shared | Books polling | Every 10 minutes |
| Shared | Photo size | Long side 1600 px, max 10 MB; video max 3 min |
| Integrations | SMS provider | iTexMo (credentials rotated) |
| Integrations | Email provider | Resend or Postmark |
| Integrations | PO and transfers in Books | As today |
| Migration | Parallel run | 2 weeks per department |
| Migration | History imported | Open records + 12 months closed |
| UI | Field app language | English |
| UI | Warehouse screens | Tablet-friendly |
| Access | Shipment tracker dashboard | Ship & Track only |
| Access | Per-person scoreboard figures | Supervisors only |

All of section C is edited in the **Control Panel** (Engines 08), not in code.

## D. Things that must happen before go-live (not decisions)

1. Rotate the SMS credentials that were hardcoded in the old system.
2. Enter the current drivers and installers in the Control Panel.
3. Fill Order Date on every open record from Books.
4. Flag fragile / two-person items (start with mirrors, glass, large fixtures) and set proof templates.
5. Review the 93 orders whose target date is earlier than their order date.
