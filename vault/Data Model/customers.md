---
title: customers
tags: [entity]
label: Customer
---

# customers

**Customer.** A customer from the customer master, with type, contacts and billing and shipping addresses.

38 rows in the sample data.

## Created by
- [[customerCreate]]

## Shown on
- [[Inquiry List]]
- [[Purchase Request]]

## Fields
- `id`
- `name`
- `type`
- `companyName`
- `email`
- `phone`
- `mobile`
- `billing`
- `shipping`

## A sample row

```json
{
  "id": "cus1",
  "name": "Marco Villa",
  "type": "Designer",
  "companyName": "",
  "email": "marco.villa@example.com",
  "phone": "",
  "mobile": "0917 000 0000",
  "billing": {
    "line1": "12 Sample St",
    "line2": "",
    "city": "Quezon City",
    "state": "Metro Manila",
    "zip": "1100",
    "country": "Philippines"
  },
  "shipping": {
    "line1": "12 Sample St",
    "line2": "",
    "city": "Quezon City",
    "state": "Metro Manila",
    "zip": "1100",
    "country": "Philippines"
  }
}
```

Up: [[Data Model]].
