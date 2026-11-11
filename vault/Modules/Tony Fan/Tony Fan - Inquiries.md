---
title: Tony Fan - Inquiries
tags: [page, tony-fan, built]
module: Tony Fan
route: "#/tonfan/inquiries"
status: partial
source: src/pages/supplier/ (SupplierInquiries)
---

# Tony Fan - Inquiries

> Inquiries assigned to the supplier: submit pricing, availability and collateral.

**Section:** [[Tony Fan]] · **Route:** `#/tonfan/inquiries` · **Source:** `src/pages/supplier/` (`SupplierInquiries`) · **Status:** built, not yet at parity

**Shows:** [[inquiries]], [[messages]], [[timeline]]

## What the live page has

- **Inner tabs:** Inquiries · Group Inquiry · All · Waiting · Submit Response · Selected · Completed
- **Stat cards:** Waiting · Submit Response · Selected · Completed
- **Buttons:** Respond · View · Product Collateral

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[supplierRespondInquiry]] | Supplier portal: a supplier answers an inquiry line with availability, lead time and prices. Only while the line is Waiting or Submit Response. Unavailable or Cannot Produce declines it and removes it from the supplier queue. | [[SUP.OWN]], [[SUP.LOCKED]], [[SUP.RESPONSE]], [[INQ.PRICE]], [[SUP.DECLINE]] |
| [[supplierCollateral]] | Supplier portal: the selected supplier confirms the product collateral (sample, 3D image, drawing, specification). When every item is Completed or N/A the response is Completed and locked for good. | [[SUP.OWN]], [[SUP.LOCKED]] |
| [[chatSend]] | Sends a message in a supplier conversation. Only Fenteng and Tony have threads, and only when they are quoted on the inquiry. | [[INQ.CHAT]] |

