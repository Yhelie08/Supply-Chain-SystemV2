---
title: suppliers
tags: [entity]
label: Supplier
---

# suppliers

**Supplier.** The recognised suppliers. HC System is Local sourcing; Warehouse Stock means no purchase.

4 rows in the sample data.

## Fields
- `name`
- `local`
- `stock`
- `handlesAll`
- `categories`
- `maxCapacity`
- `status`

## A sample row

```json
{
  "name": "Fenteng Lighting",
  "local": false,
  "stock": false,
  "handlesAll": false,
  "categories": [
    "Lighting",
    "Fixtures"
  ],
  "maxCapacity": 20,
  "status": "Active"
}
```

Up: [[Data Model]].
