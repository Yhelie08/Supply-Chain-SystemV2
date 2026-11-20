# Purchase Request, Pricing and PR Forecast

## Purpose
When a Sales Order needs goods we do not have, the system creates a **Purchase Request (PR)** per line. The PR gets a supplier, a price and a **feasibility check** (can it arrive in time for the promise?) before it is grouped into a PO.

## Fields
`purchase_requests`, `pr_costing` (restricted). Key: SO and SO line, item, quantity, supplier, pricing status, feasibility, earliest feasible date, status, hold reason, the three dates.

## Screens
| Screen | Who | What |
|---|---|---|
| PR queue | Buyer | Open PRs by procurement category (Act now / Watch / Blocked), oldest SO first; columns: PR, SO, item, qty, supplier, pricing status, feasibility, Order Date, Target, Forecast |
| PR detail | Buyer | Supplier recommendation table (price and lead time), feasibility result with options, timeline, notes, hold/resume/cancel |
| PR Forecast | Buyer, supervisor | Per PR, the planned date chain (PO+1 → production end → shipout → arrival → pickable → delivery) vs target, shown as a simple bar per PR; lists PRs that will be born late if raised today |
| New PR (manual) | Buyer | For stock replenishment or items not from an SO (no customer order: the PR's creation date is used as its Order Date for sorting, and its needed-by date as the target) |

## Rules
| # | Rule |
|---|---|
| PR-R1 | PRs are created automatically from Books Sales Orders for lines marked to purchase (`so_to_pr` job), copying Order Date, Target and the customer. A voided or cancelled SO creates no PR. |
| PR-R2 | **Auto-hold on void:** if Books voids or cancels the SO after PRs exist, its open PRs go **On Hold** automatically with reason "SO voided in Books", logged in the timeline. Held PRs cannot be grouped into a PO. |
| PR-R3 | If the Books SO **date or target** changes, open PRs copy it and are re-scored and re-forecast. |
| PR-R4 | **Supplier recommendation** is based on price and lead time against the target date, not on who has fewer POs. Shows each eligible supplier's price (buyer only), lead time and feasibility. |
| PR-R5 | **Pricing hand-off:** PRs needing a price are sent to the pricing engine (the separate pricing tool). It returns, in priority: (1) rate card / price book, (2) recent approved PO cost for the same item, (3) landed cost + markup. If found and the margin is valid: `pricing_status = auto_priced`, `selected_final_cost`, `approved_srp` set, PR → Ready for PO. If not: `needs_manual_quote` and the buyer is notified. |
| PR-R6 | **Feasibility on every PR** (05 / 02): when the supplier and lead time are known (at pricing or selection), the PR shows `feasible` / `at_risk` / `impossible`, and for impossible: shortfall days, the air option and the earliest feasible date. |
| PR-R7 | A PR can be On Hold, Resumed or Cancelled by the buyer with a reason; each is stamped. |
| PR-R8 | PRs are grouped into a PO only if same supplier (by supplier ID) and not on hold. Mixed suppliers block grouping. |

## Timestamps
`pr.created`, `pr.ready_for_po`, `pr.held`, `pr.resumed`, `pr.converted`, `pr.cancelled` (date-time, not date only).

## Notifications
Buyer: PR needs manual quote; PR is impossible (Act now); PR auto-held by void. Sales agent: their order's PR is impossible (with the earliest feasible date) so they can talk to the customer early.

## Access
Buyer: full. Supervisor, admin: full. Sales agent: sees the status and feasibility of PRs for own orders, no costs. Shipment tracker: none.

## Acceptance checklist
- [ ] Voiding an SO in Books puts its PRs on hold within one sync cycle, with the reason.
- [ ] A held PR cannot be added to a PO.
- [ ] A PR with lead 20 days, LCL, and target 15 days away shows Impossible, shortfall, air option and earliest date.
- [ ] Auto-priced PRs move to Ready for PO without a person.
- [ ] Supplier recommendation explains its choice in words (price, lead time, feasibility).
