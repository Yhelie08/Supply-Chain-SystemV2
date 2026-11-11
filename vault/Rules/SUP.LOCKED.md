---
title: SUP.LOCKED
tags: [rule, blocks]
rule: SUP.LOCKED
kind: BLOCKS
module: Supplier Portal
---

# SUP.LOCKED

> A response is locked once the buyer selected another supplier, once this supplier is selected (pricing locks, collateral opens), and for good when it is Completed.

**Kind:** BLOCKS · **Module:** Supplier Portal

## Enforced by
- [[supplierRespondInquiry]] (`src/domain/actions.js:938`)
- [[supplierCollateral]] (`src/domain/actions.js:962`)
- [[supplierRespondPR]] (`src/domain/actions.js:980`)

## Seen on
- [[Tony Fan - Inquiries]]
- [[Fenteng Lighting - Inquiries]]
- [[Tony Fan - Purchase Request]]
- [[Fenteng Lighting - Purchase Request]]

Back to [[Rules Index]].
