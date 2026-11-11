---
title: inquiryApprove
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:269"
---

# inquiryApprove

Converts the estimate to a Sales Order. Raises a Purchase Request for the selected supplier (or none for Warehouse Stock) and the Fulfillment item.

**Source:** `src/domain/actions.js:269`

## Offered on
- [[Inquiry]] (Procurement)

## Creates records in
- [[prs]]
- [[items]]
- [[timeline]]

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[INQ.SO]]: Converting the estimate creates the Sales Order line, and a Purchase Request unless the selected supplier is Warehouse Stock.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
