---
title: Tony Fan - Purchase Request
tags: [page, tony-fan, built]
module: Tony Fan
route: "#/tonfan/pr"
status: partial
source: src/pages/supplier/ (SupplierPR)
---

# Tony Fan - Purchase Request

> Purchase requests assigned to the supplier: submit pricing, availability and lead time.

**Section:** [[Tony Fan]] · **Route:** `#/tonfan/pr` · **Source:** `src/pages/supplier/` (`SupplierPR`) · **Status:** built, not yet at parity

**Shows:** [[prs]]

## What the live page has

- **Inner tabs:** All PRs · PR Groups · All · Waiting · Submit Response · Selected
- **Stat cards:** Waiting · Submit Response · Selected
- **Buttons:** Respond · View

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[supplierRespondPR]] | Supplier portal: a supplier quotes a purchase request raised by hand. A PR that came from an inquiry is view-only, and a held or cancelled PR cannot be quoted. | [[SUP.OWN]], [[SUP.PR_VIEW]], [[SUP.LOCKED]], [[SUP.RESPONSE]], [[SUP.DECLINE]] |

