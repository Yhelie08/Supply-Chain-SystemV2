---
title: products
tags: [entity]
label: Catalog item
---

# products

**Catalog item.** An item in the product catalog. Picking one on an inquiry autofills SKU, description, unit and SRP.

51 rows in the sample data.

## Created by
- [[productCreate]]

## Shown on
- [[Inquiry List]]
- [[Purchase Request]]

## Fields
- `id`
- `bookId`
- `name`
- `sku`
- `description`
- `unit`
- `rate`
- `category`

## A sample row

```json
{
  "id": "prd3",
  "bookId": "4662244000010001",
  "name": "LED Panel 60W",
  "sku": "SKU-0001",
  "description": "LED Panel 60W (sample catalog item)",
  "unit": "pcs",
  "rate": 1445,
  "category": "Lighting"
}
```

Up: [[Data Model]].
