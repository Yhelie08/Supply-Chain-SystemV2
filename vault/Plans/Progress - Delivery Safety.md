---
title: "Progress - Delivery Safety"
tags:
  - plan
  - delivery-management
  - progress
status: branch pushed, no PR; 367 of 367 tests pass (as reported)
date: 2026-11-13
---

> [!INFO] Where this fits
> What changed in the Delivery safety work, in plain words. The open questions: [[Clarifications - Delivery Management]]. The clock decision: [[Decision - Delivery Clock Divergence]]. The build plan: [[Plan - Delivery Management]].

# Progress — Delivery Safety (2026-11-13)

## In short: what is this branch?

- Branch: `feature/delivery-safety`
- Pushed, **no PR yet**
- **367 of 367 tests pass** (from your run)
- One commit: `5dac5fb` — "confirm once, and queue the scheduling work"
- **9 new tests** in `tests/delivery-management/safety.test.js`

## What was done

### #5 — Confirm only once

**Before:** clicking Confirm twice made **two appointments**. Like pressing "Order" twice in an online shop: two orders arrive.

**Now:** the second confirm is refused:

> "Already confirmed — Service Appointment ... was already created."

Even **three clicks at the same time** make only one appointment.

**Important:** this is a **deliberate difference from Zoho**. In Zoho, a double click = two appointments. This was agreed.

### #6 — No two people in one slot

**Before:** two dispatchers confirm the same time at the same moment. Both see "free", both save. Trouble afterwards.

**Now:** like a **queue at a shop**, one at a time. The second one sees the first and gets a **Calendar Conflict**.

**Proof:** **two tests fail when the queue is removed** and pass when it is there. So this was a real problem, not a guess.

**Limit:** the queue works **on one server only**. With several server instances a database lock is needed. This is written in `locks.mjs` and in the Change Log.

### #7 — Error messages

When the CMS or Books fails, **there was already an error message**. Nothing changed.

## What cannot be done yet

| # | What | Why not yet |
|---|---|---|
| #3 | Policy Settings — admin only | The app has no per-role access yet; this is core work |
| #4 | Three roles (Scheduler, Dispatcher, Field team) | Same reason; core work |

The answers are written in [[Clarifications - Delivery Management]] so they are not forgotten.

## #8 — The clock

**Simple explanation:**

- A team already has **2 hours of work** that day.
- A new order comes in.
- In **Zoho**: no time is given. No suggestion, no explanation. **This is a bug.**
- In the **new app**: it gives **10:18 AM**, right after that work.

**Question:** keep the fix, or copy Zoho (nothing shown)?

**Recommendation:** keep the fix. No customer or dispatcher wants an order without a time.

Full detail and the signature block: [[Decision - Delivery Clock Divergence]].

## What is still missing (simple list)

### Decisions not answered yet

- **Scope:** do the CMS and Books stay? (A1)
- **Schedule Requests:** show the records first, or hide them? (A2)
- **Site confirmation follow-up:** port it or skip it? (A3)
- **Widget/UI:** will you fix the 13 tabs? (A6)
- **Data contract:** who signs it? (A10)

### Access and keys

- Production data (export)
- Books OAuth client
- Geoapify key
- CMS URLs and API key
- Railway settings (`BACKEND=pg`, `TZ`, etc.)
- Files (a few GB, where to store them, backup)

### Before go-live

- Rollback plan
- Database and file backups
- Monitoring and alerts
- Time zone
- Private repo and key rotation
- Reviewer
- UAT by the owner and staff

### Acceptance

- Sign the clock decision (#8)
- UAT click-through of the 13 tabs
- Sign-off

## What comes next (in order)

1. **Decide #8** (clock): sign the decision file.
2. **Answer the remaining questions** in Clarifications (A1, A2, A3, A6, A10 first).
3. **Open the PR** for `feature/delivery-safety`.
4. **UAT**: the owner first, then staff.
5. **Go-live checklist**: keys, data, files, deployment, backup.

## Files

- [[Clarifications - Delivery Management]]
- [[Decision - Delivery Clock Divergence]]
- [[Plan - Delivery Management]]
- [[Plan - Delivery Management Open Items]]
