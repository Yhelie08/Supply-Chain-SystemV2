---
title: Running the app
tags: [guide]
---

# Running the app

```
npm install
npm run dev        # http://localhost:5173, also reachable from phones on the same wifi
npm test           # workflow rules + every page renders
npm run build      # production build into dist/
npm run vault      # regenerate this Obsidian vault from the source
```

Data lives in the browser's `localStorage` under `supply-chain-v2:db`. **Reset sample data** on the [[Supply Chain Analytic]] page puts the sample records back. Clearing site data does the same.

## A good first walk-through

1. [[Inquiry List]]: open INQ-00009, add what is missing until the readiness checklist shows 5 of 5, then create the estimate and convert it to a Sales Order.
2. [[Purchase Request]]: the new PR becomes Ready for PO by itself once its four conditions pass. Use Create PO on its group. Try a group with a held PR to see how it is left out.
3. [[Purchase Order]]: send it, then acknowledge with an ETD and ETA.
4. [[Shipments]] then [[Receiving]]: mark in transit, arrived, then receive with some damaged goods and watch an exception appear.
5. [[Exceptions]] then [[Replacement Request]]: create and approve the replacement, receive the replacement shipment.
6. [[Order Readiness]]: create a package, assign a picker, set payment, release. Try releasing an unpaid item to see [[GATE.PAYMENT]].
7. Pick, then Pack & QC, then [[To Ship]]: dispatch.
8. [[Initial Scheduling]]: set a date, confirm the site, hand off, then schedule it on [[Service Request]].
9. [[Forecast Setting]]: see when each open order is expected to arrive, and change the lead-time settings.
