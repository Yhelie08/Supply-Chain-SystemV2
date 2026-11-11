---
title: XFER.DONE
tags: [rule, blocks]
rule: XFER.DONE
kind: BLOCKS
module: Transfer Item
---

# XFER.DONE

> A warehouse request goes Pending then Done. A warehouse transfer goes Pending Dispatch, Dispatched, then Received. Nothing moves past its last step.

**Kind:** BLOCKS · **Module:** Transfer Item

## Enforced by
- [[transferAdvance]] (`src/domain/actions.js:838`)

## Seen on
- [[Transfer Item]]

Back to [[Rules Index]].
