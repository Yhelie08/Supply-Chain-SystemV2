---
title: scheduleRequests
tags: [entity]
label: Schedule request
---

# scheduleRequests

**Schedule request.** A client request to move a delivery date.

2 rows in the sample data.

## Created by
- [[scheduleRequestCreate]]

## Shown on
- [[Schedule Requests]]

## Fields
- `id`
- `no`
- `srNo`
- `soNo`
- `customer`
- `currentDate`
- `newDate`
- `reason`
- `status`
- `createdOn`
- `note`

## A sample row

```json
{
  "id": "sch414",
  "no": "SCH-00001",
  "srNo": "SR-00003",
  "soNo": "SO-16616",
  "customer": "Sam Cortez",
  "currentDate": "2026-11-12",
  "newDate": "2026-11-16",
  "reason": "The client will be abroad until then.",
  "status": "Pending Review",
  "createdOn": "2026-11-11"
}
```

Up: [[Data Model]].
