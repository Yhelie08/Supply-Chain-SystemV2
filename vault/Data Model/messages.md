---
title: messages
tags: [entity]
label: Supplier message
---

# messages

**Supplier message.** One message in an inquiry conversation with Fenteng or Tony.

3 rows in the sample data.

## Created by
- [[chatSend]]

## Shown on
- [[Inquiry List]]
- [[Tony Fan - Inquiries]]
- [[Fenteng Lighting - Inquiries]]

## Fields
- `id`
- `inqNo`
- `supplier`
- `role`
- `sender`
- `message`
- `at`

## A sample row

```json
{
  "id": "msg102",
  "inqNo": "INQ-00013",
  "supplier": "Tony",
  "role": "Buyer",
  "sender": "Buyer",
  "message": "Can you confirm stock for 30 pcs before Friday?",
  "at": "2026-11-11T08:00:00.000Z"
}
```

Up: [[Data Model]].
