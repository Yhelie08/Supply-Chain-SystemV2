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

Data lives in the browser's `localStorage` under `supply-chain-v2:db`. **Reset sample data** on the [[Dashboard]] puts the sample records back. Clearing site data does the same.

## A good first walk-through

1. [[Inquiry]]: quote the Draft inquiry, create its estimate (it needs a project first, so use Edit), then approve it.
2. [[Purchase Request]]: mark the new PR ready, then convert it. Try converting a held one to see [[PR.HELD]].
3. [[Purchase Order]]: send it, then acknowledge with an ETD and ETA.
4. [[Shipments]] then [[Receiving]]: mark in transit, arrived, then receive with some damaged goods and watch an exception appear.
5. [[Exceptions]] then [[Replacement]]: create and approve the replacement, receive the replacement shipment.
6. [[Readiness Gate]]: create a package, assign a picker, set payment, release. Try releasing an unpaid item to see [[GATE.PAYMENT]].
7. Pick, Pack, QC, then [[Order Aggregation]]: dispatch.
8. [[Initial Scheduling]]: set a date, confirm the site, hand off, then schedule it on [[Service Request]].
