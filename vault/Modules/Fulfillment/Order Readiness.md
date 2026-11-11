---
title: Order Readiness
tags: [page, fulfillment, built]
module: Fulfillment
route: "#/fulfillment/readiness"
status: partial
source: src/pages/screens.jsx (GateScreen)
---

# Order Readiness

> Sales order readiness gate: nothing reaches the pickers until it is packaged, assigned and paid for.

**Section:** [[Fulfillment]] · **Route:** `#/fulfillment/readiness` · **Source:** `src/pages/screens.jsx` (`GateScreen`) · **Status:** built, not yet at parity

**Shows:** [[items]]

## What the live page has

- **Inner tabs:** Dashboard · Approve Dispatch
- **Stat cards:** Pending Payment · Not Released · Released · Complaints
- **Buttons:** Release · Approve

### Still missing from this page

- tab: Dashboard
- tab: Approve Dispatch
- stat card: Pending Payment
- stat card: Not Released
- stat card: Released
- stat card: Complaints
- button: Approve

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[gateRelease]] | Releases an item from the Readiness Gate to Pick. Needs a package, a picker and settled payment. | [[GATE.PAC]], [[GATE.PICKER]], [[GATE.PAYMENT]] |
| [[assignPicker]] | Names the picker who will collect the item. | — |
| [[setPayment]] | Sets the item's payment to Paid, Unpaid or Credit. | — |
| [[approveOverride]] | Lets an unpaid item through the gate and dispatch, with a reason and a valid-until date in the future. | [[GATE.OVERRIDE]] |

## In the flow

Work arrives from: [[Inquiry List]], [[Receiving]]

Work goes on to: [[Pick]]
