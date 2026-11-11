---
title: Design decisions
tags: [guide, decisions]
---

# Design decisions

- **Hold is a flag, not a status.** A held PR keeps its real status, so [[prResume]] puts it back exactly. See [[PR.HOLD_FLAG]].
- **Items wait for the replacement, not just the first delivery.** If a delivery has damaged goods, the Sales Order item is not released until the replacement shipment is received in full. See [[RCV.STOCK]] and [[RR.CLONE]].
- **A replacement only completes by physical receipt.** There is deliberately no "mark completed" button on a Replacement Request.
- **Dispatch is once only.** The item remembers its Service Request number, so a second click cannot create a second job. See [[OA.DEDUP]].
- **A full calendar refuses.** The scheduler will not overbook a team. A person decides, for example by raising capacity on [[Daily Team Availability]].
- **Dates are plain ISO strings.** They sort, compare and save without time-zone surprises.
- **Step functions take "today" as an input.** That is what lets tests check an override expiring tomorrow.
- **The vault is generated.** Descriptions and lifecycles live in `tools/build-vault.mjs`, and the build refuses if a new action, rule or page is added without one.
