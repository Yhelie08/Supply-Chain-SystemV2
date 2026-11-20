# Pick, QC, Rework (Paint) and Crate

All four stages share these rules:

- **FS-1** Every list uses the **same ranking** as Order Readiness (oldest Order Date first inside categories). Never newest first. Users may sort a column for their session only.
- **FS-2** Every row shows rank and reason on hover, Order Date, Target, Forecast, boxes, Next Step, and "in this stage since".
- **FS-3** Every row has an **Exception** action (05 / 05). An open exception holds the package at its stage.
- **FS-4** Each stage's work is stamped by the save that completes it. No time buttons.
- **FS-5** Screens are **tablet-friendly** for the warehouse floor **[DEFAULT]**.

## 1. Pick

**Purpose:** take the items from their bins.

| # | Rule |
|---|---|
| PK-R1 | Released packages enter the pick queue. Assignment: the system **suggests** the next ranked unassigned package to the present picker holding the least work, in batches of `assign_batch_boxes`; the supervisor confirms or changes the name. |
| PK-R2 | Pick list shows bin, SKU, item, quantity per line. The picker marks each line picked (or raises an exception: bin empty, short, wrong item). |
| PK-R3 | Completing the pick asks for the **box count** (PKG-R3) and sends the package to QC. (The Pack stage no longer exists.) |

Stamps: `package.picker_assigned`, `package.picked`.

## 2. QC (Quality Check)

**Purpose:** confirm every item is right and working before it leaves.

| # | Rule |
|---|---|
| QC-R1 | Checklist per item category (fixture body, LED, bulb type, Kelvin / color temperature, lighting features, uniformity, …), stored as a template so categories can have different checks. |
| QC-R2 | **Approved** requires: every checklist line answered, at least **one photo**, and the checker's **signature** (Tier 2 of the pre-delivery gate). An empty checklist can never be approved. |
| QC-R3 | **Rejected** requires a reason and photos and creates an exception (found at QC, with caused stage / fault origin). The checker chooses: rework, replace (RR), or return to pick (wrong item). |
| QC-R4 | Approved packages go to Crate if `for_crate`, otherwise to Order Aggregation. |
| QC-R5 | A second QC after rework is visit 2; both visits are kept. |

Stamps: `package.qc_started` (opening the checklist with the first answer), `package.qc_passed` / `package.qc_rejected`.

## 3. Rework (including Paint)

**Purpose:** fix what failed QC. **Paint is rework, not a planned step.** The paint bench's workload *is* the internal rework rate.

| # | Rule |
|---|---|
| RW-R1 | A rework job is created only from an exception (QC rejection or another stage). Types: paint, repair, replace part, other. |
| RW-R2 | The rework queue is ranked like every other stage; the package keeps its original Order Date and category (often Already late). |
| RW-R3 | Done → back to QC (always re-checked). |
| RW-R4 | Rework rate (packages with ≥1 rework ÷ packages through QC), weekly, on the Scoreboard, split by rework type and fault origin. |
| RW-R5 | Silence alert: rework not done within 3 days **[DEFAULT]**. |

Stamps: `package.rework_started`, `package.rework_done`.

## 4. Crate

**Purpose:** build a crate for fragile or large items (mirrors, glass, big fixtures).

| # | Rule |
|---|---|
| CR-R1 | Only packages with `for_crate = true` enter. `for_crate` is set from item flags (fragile) or by the supervisor. |
| CR-R2 | **Crate Done** requires the crating checklist and at least one photo; crate weight (kg) and dimensions (cm) are recorded **[DEFAULT: required]**. |
| CR-R3 | The old form had two of every status and checklist field; the new system has **one** of each. |
| CR-R4 | Box count is updated if crating changed it. |

Stamps: `package.crated`.

## Access
Fulfillment staff: work their assigned stage. Fulfillment supervisor: assign, reassign, resolve exceptions. No costs, no payment data on any of these screens.

## Acceptance checklist
- [ ] Two released packages, the newer one released first: Pick, QC, Crate and Aggregation all show the older SO above.
- [ ] QC cannot be approved with a blank checklist line, no photo or no signature.
- [ ] A QC rejection creates an exception, and after rework the package returns to QC with two visits recorded.
- [ ] Paint rework counts in the rework rate.
- [ ] Crate Done is refused without a photo.
