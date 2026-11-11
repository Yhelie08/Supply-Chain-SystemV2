---
title: Pack & QC
tags: [page, fulfillment, built]
module: Fulfillment
route: "#/fulfillment/pack-qc"
status: partial
source: src/pages/screens.jsx (PackQCPage)
---

# Pack & QC

> QC report: the packer is the checker; approve routes to Crate or To Ship, reject raises an exception.

**Section:** [[Fulfillment]] · **Route:** `#/fulfillment/pack-qc` · **Source:** `src/pages/screens.jsx` (`PackQCPage`) · **Status:** built, not yet at parity

**Shows:** [[items]]

## What the live page has

- **Stat cards:** Pending · Approved · Rejected · With Damage
- **Buttons:** Assign packer · Approve · Reject

### Still missing from this page

- stat card: Approved
- stat card: With Damage

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[qcAssign]] | Pack & QC: names the packer, who is also the quality checker. Approve and Reject are refused until this is done. | [[PACK.PACKER]] |
| [[qcApprove]] | Approves at QC. Goes to Crate if the item needs crating, otherwise straight to Order Aggregation. | [[PACK.PACKER]], [[QC.ROUTE]] |
| [[qcReject]] | Rejects at QC with a reason and raises a Fulfillment exception. | [[PACK.PACKER]], [[QC.REJECT]] |
| [[qcRecheck]] | Puts a rejected item (or one whose replacement arrived) back in Pack & QC for a fresh check, with no packer assigned. | — |

## In the flow

Work arrives from: [[Pick]]

Work goes on to: [[Crate]], [[To Ship]], [[Exceptions]]
