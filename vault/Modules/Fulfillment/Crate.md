---
title: Crate
tags: [page, fulfillment, built]
module: Fulfillment
route: "#/fulfillment/crate"
status: partial
source: src/pages/screens.jsx (CrateScreen)
---

# Crate

> Crate checklist: nothing moves on until Crating Status is Done.

**Section:** [[Fulfillment]] · **Route:** `#/fulfillment/crate` · **Source:** `src/pages/screens.jsx` (`CrateScreen`) · **Status:** built, not yet at parity

**Shows:** [[items]]

## What the live page has

- **Stat cards:** Pending · Done · Total Crates
- **Buttons:** Save Changes

### Still missing from this page

- stat card: Total Crates
- button: Save Changes

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[crateSet]] | Updates Crating Status: Pending, In Progress or Done. | — |
| [[crateComplete]] | Moves a crated item on to Order Aggregation. Refused until Crating Status is Done. | [[CRATE.DONE]] |

## In the flow

Work arrives from: [[Pack & QC]]

Work goes on to: [[To Ship]]
