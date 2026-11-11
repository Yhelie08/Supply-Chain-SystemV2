---
title: Readiness Gate
tags: [page, fulfillment]
module: Fulfillment
route: "#/fulfillment/gate"
source: src/pages/screens.jsx (GateScreen)
---

# Readiness Gate

> Nothing reaches the pickers until it is received, packaged, assigned and paid for.

**Module:** [[Fulfillment]] · **Route:** `#/fulfillment/gate` · **Source:** `src/pages/screens.jsx` (`GateScreen`)

**Shows:** [[items]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[gateRelease]] | Releases an item from the Readiness Gate to Pick. Needs a package, a picker and settled payment. | [[GATE.PAC]], [[GATE.PICKER]], [[GATE.PAYMENT]] |
| [[createPackage]] | Assigns a PAC number to a received item. Refused while the item is still on order. | [[GATE.RECEIVED]] |
| [[assignPicker]] | Names the picker who will collect the item. | — |
| [[setPayment]] | Sets the item's payment to Paid, Unpaid or Credit. | — |
| [[approveOverride]] | Lets an unpaid item through the gate and dispatch, with a reason and a valid-until date in the future. | [[GATE.OVERRIDE]] |

## In the flow

Work arrives from: [[Inquiry]], [[Receiving]]

Work goes on to: [[Pick]]
