---
title: timeline
tags: [entity]
label: Timeline entry
---

# timeline

**Timeline entry.** One line of an inquiry history: created, updated (with the changed fields), SRP approved, estimate, messages, deleted.

72 rows in the sample data.

## Created by
- [[inquiryCreate]]
- [[inquiryUpdate]]
- [[inquiryDelete]]
- [[inquiryApproveSrp]]
- [[inquiryEstimate]]
- [[inquiryApprove]]
- [[chatSend]]

## Shown on
- [[Inquiry]]

## Fields
- `id`
- `inqNo`
- `title`
- `type`
- `actor`
- `at`
- `changes`

## A sample row

```json
{
  "id": "tl5",
  "inqNo": "INQ-00001",
  "title": "Inquiry created",
  "type": "Created",
  "actor": "Buyer",
  "at": "2026-11-11T08:00:00.000Z",
  "changes": [
    {
      "label": "Item",
      "to": "LED Panel 60W"
    },
    {
      "label": "Customer",
      "to": "Marco Villa"
    },
    {
      "label": "Quantity",
      "to": "20 pcs"
    },
    {
      "label": "Target Date",
      "to": "2026-12-11"
    },
    {
      "label": "Sales Owner",
      "to": "HC Sales 1"
    },
    {
      "label": "Project",
      "to": "Villa Project"
    },
    {
      "label": "Supplier quotes",
      "to": "1 row(s)"
    }
  ]
}
```

Up: [[Data Model]].
