---
title: SUP.OWN
tags: [rule, blocks]
rule: SUP.OWN
kind: BLOCKS
module: Supplier Portal
---

# SUP.OWN

> A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines.

**Kind:** BLOCKS · **Module:** Supplier Portal

## Enforced by
- [[supplierRespondInquiry]] (`src/domain/actions.js:938`)
- [[supplierCollateral]] (`src/domain/actions.js:962`)
- [[supplierRespondPR]] (`src/domain/actions.js:980`)
- [[supplierAckPO]] (`src/domain/actions.js:1010`)
- [[supplierShip]] (`src/domain/actions.js:1018`)
- [[supplierApproveRR]] (`src/domain/actions.js:1032`)
- [[supplierRRProgress]] (`src/domain/actions.js:1039`)

## Seen on
- [[Tony Fan - Inquiries]]
- [[Fenteng Lighting - Inquiries]]
- [[Tony Fan - Purchase Request]]
- [[Fenteng Lighting - Purchase Request]]
- [[Tony Fan - Purchase Order]]
- [[Fenteng Lighting - Purchase Order]]
- [[Tony Fan - Shipments]]
- [[Fenteng Lighting - Shipments]]
- [[Tony Fan - Replacement Request]]
- [[Fenteng Lighting - Replacement Request]]

Back to [[Rules Index]].
