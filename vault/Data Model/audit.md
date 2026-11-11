---
title: audit
tags: [entity]
label: Audit entry
---

# audit

**Audit entry.** One line per workflow step taken.

40 rows in the sample data.

## Fields
- `at`
- `action`
- `ref`
- `msg`

## A sample row

```json
{
  "at": "2026-11-11T08:00:00.000Z",
  "action": "qcReject",
  "ref": "it388",
  "msg": "SO-16632 rejected. EXC-FF-00002 raised."
}
```

Up: [[Data Model]].
