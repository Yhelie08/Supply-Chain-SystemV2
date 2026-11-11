---
title: SHP.FLAGS
tags: [rule, reference]
rule: SHP.FLAGS
kind: REFERENCE
module: Shipments
---

# SHP.FLAGS

> Delayed, Arriving in 1 Week, Needs Attention and Ship Mode Unmatched are worked out from the dates and modes each time, never stored. Delayed: not arrived and the ETA has passed. Needs Attention: delayed, still pending after its ETD, or due after the date the client wants it. Ship Mode Unmatched: the supplier shipped by a different mode than the PO.

**Kind:** REFERENCE · **Module:** Shipments

## Describes behaviour of
- [[shipmentTransit]]
- [[shipmentArrive]]

This rule is documentation of what the step does by itself. No code path refuses with it.

## Seen on
- [[Shipments]]

Back to [[Rules Index]].
