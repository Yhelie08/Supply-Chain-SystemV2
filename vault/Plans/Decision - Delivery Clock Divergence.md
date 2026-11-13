---
title: "Decision - Delivery Clock Divergence"
tags:
  - plan
  - delivery-management
  - decision
status: proposed — waiting for the owner's sign-off
date: 2026-11-13
---

> [!INFO] Where this fits
> The one deliberate difference from Zoho. The build plan: [[Plan - Delivery Management]]. The comparison that found it: [[Plan - Delivery Management Open Items]] (section 3). The questions still open: [[Clarifications - Delivery Management]].

# Delivery Management — Clock Divergence Decision

- **Status:** Proposed — waiting for the owner's sign-off
- **Date:** 2026-11-13
- **Owner:** repo owner
- **Related:** `vault/Plans/Plan - Delivery Management Open Items.md` (section 3), `server/modules/delivery-management/scheduling.mjs` (header, item 3), `tests/delivery-management/scheduling.test.js` (lines 31–33, 91, 139)

## 1. Context

The scheduling engine was ported from Zoho's `dmsScheduleSlot` (521 lines). The port keeps Zoho's quirks ("mirrors Zoho") with **one deliberate difference**: how the start time of the next job is computed.

## 2. The Zoho behavior (bug)

Zoho computes the end time with decimal division:

```
ctsTotalMin / 60
```

When the team already has hours that day, the total is rarely a whole number of hours. Example:

```
08:00 + 2.30 hrs = 618 minutes
618 / 60 = 10.3 hours  ->  "10.3:00 AM"
```

`"10.3:00 AM"` is not a valid time, so the whole script fails. **Nothing is written** — no date, no time, no team, no suggestion. The officer sees an empty result and has no idea why.

It only worked when the total came out whole (e.g. `07:42 + 138 minutes = 10:00 AM`). This was confirmed on Zoho Development on 2026-11-12.

## 3. The port behavior

The port works in **whole minutes**:

```
618 minutes -> 10:18 AM
```

So the port produces a suggestion where Zoho produced nothing.

## 4. Decision

**Keep the whole-minute computation. Do not copy Zoho's bug.**

Reasons:

1. Zoho's behavior is a silent failure — the dispatcher gets no suggestion and no error.
2. The port's behavior is deterministic and correct: `10:18 AM`.
3. "Same as Zoho" should mean the same business outcome, not the same defects.
4. The engine tests already cover both cases (whole and non-whole totals).

## 5. Scope

The fix is in the engine (`scheduleSlot`), so it applies to all three callers:

| Caller | Entry point |
|---|---|
| `dms_reschedule` custom API | Re-Schedule button |
| `SA_Scheduling_Engine` workflow | Site confirmation / appointment save |
| `EXC_Resolve_Sync` workflow | Exception Queue "Revert to System" |

This is one decision for the whole engine, not one button.

## 6. Evidence

| Check | Result |
|---|---|
| Zoho Development, team with a confirmed 2-hour job from 08:00 | Nothing written (no date, time, team) |
| Zoho Development, 07:42 start (600 minutes total) | 10:00 AM — confirms the cause is the decimal division |
| Port, same 08:00 scenario | 10:18 AM |
| Port tests | `scheduling.test.js` lines 31–33, 91, 139 |
| Delivery test suite | 109 / 109 pass (2026-11-13) |

## 7. Conditions for acceptance

| # | Action | Who |
|---|---|---|
| 1 | Owner signs this decision (name + date) | repo owner |
| 2 | Add a named regression test for the divergence (10:18 AM and 10:00 AM cases) | Delivery owner |
| 3 | Add a UAT note: "expect 10:18 AM; Zoho shows nothing; intentional" | Delivery owner |
| 4 | Record it in `00 - Change Log.md` and close it in the Open Items list | Delivery owner |
| 5 | Include it in the Zoho Development comparison report as the only intentional difference | Delivery owner |

## 8. What we will not do

- **Copy the bug.** Reproducing a silent failure has no business value and would look like a defect in UAT.
- **Add a compatibility flag** (`DMS_DECIMAL_CLOCK=zoho`). Two behaviors mean two test matrices for a bug no user wants.
- **Hide it.** If someone sees `10:18 AM` in UAT and there is no written explanation, it will be reported as a regression.

## 9. Approval

> **Decision:** The port computes slot times in whole minutes. Zoho's decimal division (`ctsTotalMin / 60`) produces an invalid time when used hours are not whole (e.g. "10.3:00 AM"), and the whole script fails — no date, time, team, or suggestion is written. The port keeps the working behavior (10:18 AM). This is the **only intentional difference** from Zoho.

| | |
|---|---|
| Approved by | ______________________________ |
| Role | ______________________________ |
| Date | ______________________________ |
| Signature / confirmation | ______________________________ |

## 10. Question for the owner (one line)

> "When a team already has hours that day and the total is not a whole hour, Zoho writes nothing; the new app writes a suggestion (e.g. 10:18 AM). Is it OK that this is the only intentional difference?"

- **Yes** → sign section 9, add the UAT note, close the item.
- **No** → a business reason is needed (audit, historical reports); only then discuss a compatibility flag.
