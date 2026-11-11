---
title: INQ.PROJECT_CUSTOMER
tags: [rule, blocks]
rule: INQ.PROJECT_CUSTOMER
kind: BLOCKS
module: Inquiry
---

# INQ.PROJECT_CUSTOMER

> A project must belong to the inquiry's customer. Changing the customer clears the project.

**Kind:** BLOCKS · **Module:** Inquiry

## Enforced by
- [[inquiryCreate]] (`src/domain/actions.js:187`)
- [[inquiryUpdate]] (`src/domain/actions.js:210`)
- [[projectCreate]] (`src/domain/actions.js:325`)

## Seen on
- [[Inquiry]]

Back to [[Rules Index]].
