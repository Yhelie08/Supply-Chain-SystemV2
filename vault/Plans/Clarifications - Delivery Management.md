---
title: "Clarifications - Delivery Management"
tags:
  - plan
  - delivery-management
  - open-items
status: open — answered A2, A3 (pending team), A4, A5, A7, A8, A9 on 2026-11-13; the rest still waiting
date: 2026-11-13
---

> [!INFO] Where this fits
> Everything I need clarified before changing the Delivery Management flow. The one signed decision: [[Decision - Delivery Clock Divergence]]. The build plan: [[Plan - Delivery Management]]. What is missing: [[Plan - Delivery Management Open Items]].

# Delivery Management — Clarifications Before We Edit the Flow

- **Status:** Open — waiting for answers
- **Date:** 2026-11-13
- **Purpose:** Everything I need clarified before changing the Delivery Management flow. Each item has a **default recommendation**; if you have no preference, answer "default".
- **Related:** [[Decision - Delivery Clock Divergence]], [[Plan - Delivery Management]], [[Plan - Delivery Management Open Items]]

## How to use this file

Three ways to answer:

1. **Per item** — write your answer in the "Answer" column.
2. **All defaults** — reply "all defaults" and I will use every default below.
3. **Unknown** — write "I don't know" and it becomes a tracked blocker, not a guess.

---

# A. Flow/build decisions — needed before editing the flow

| # | Question | Why it affects the build | Default | Answer |
|---|---|---|---|---|
| **A1** | Scope of "off Zoho Creator": (A) no Delivery data/logic left in Creator, but the CMS + Books are fine as external systems; or (B) remove all of Zoho? | If B, the CMS must be rebuilt and Books replaced — big new work | **A** | |
| **A2** | Schedule Requests until the CMS route exists: show the DB records (read-only), or hide the tab? | Changes the UI and the UAT coverage | **DB-only + banner** | **Answered 2026-11-13:** the team will build an API that receives everything coming in from the cloud web (the CMS path). Until then: DB-only + banner. |
| **A3** | `DMS_Site_Confirmation_Fol`: port or skip? | If ported, it needs an email service + a new schedule + tests | **Skip; document the manual follow-up** | **Waiting:** the team will confirm whether the API gets email and SMS. Not included for now (both inactive in Zoho; only email was used, SMS was paused). |
| **A4** | Policy Settings: visible in the menu, admin-only, or hidden? | Changes the menu and permissions | **Admin-only** | **Answered 2026-11-13:** admin only. |
| **A5** | Roles basis: Zoho profiles (`DMS_Full_Edit`, etc.) or the draft Scheduler/Dispatcher/Field team? | Changes the access matrix and the auth work | **Map Zoho profiles → 3 roles first** | **Answered 2026-11-13:** only three roles have access (scheduler, dispatcher, field team: installer and driver). Per-role access is a core feature not built yet. |
| **A6** | Widget/UI ownership: will you fix the 13 tabs, or backend only? | If backend only, the UI fixes must be assigned | **You: UI + backend** | |
| **A7** | Concurrency lock: add an advisory lock/transaction to the scheduling writes? | Two dispatchers confirming at once could both save | **Yes** | **Answered 2026-11-13: yes.** Done: a queue (`locks.mjs`) on scheduling, with a test. |
| **A8** | Idempotency guard: add one to `confirm_dms_schedule_request`? | No guard today — double-click = two appointments | **Yes** (shipment/return already have a guard) | **Answered 2026-11-13:** once only. Done: the second confirm is refused, with a test. |
| **A9** | CMS/Books failure handling: error only, or a retry queue? | Changes the error UX and the backend | **Error + manual retry** (no queue for v1) | **Answered 2026-11-13:** show an error (manual retry). It already works this way. |
| **A10** | Data contract: who signs it, and who fixes Delivery if someone renames a shared field? | Schema drift is the biggest integration risk | **Core owner signs; shared-field change = PR + Delivery tests** | |

---

# B. Integration and credentials — needed before live testing

| # | Question | Why it is needed | Default | Answer |
|---|---|---|---|---|
| **B1** | Production export: who, when, and is read-only access confirmed? | Development data is test data only — 5 appointments | **Owner: this week** | |
| **B2** | Books OAuth client: who owns it and when? | Shipment/return not live-tested yet | **Owner: before UAT step 10** | |
| **B3** | Geoapify key: who and when? | Geocoding returns "not configured" | **Owner: before UAT** | |
| **B4** | CMS URLs + API key: who, when, and is the CMS still active? | Push and the inbound route | **Owner + CMS owner** | |
| **B5** | CMS inbound route: who writes it (core PR), and when? Fallback if it is delayed? | The two integration functions have no caller | **Core PR; fallback = A2** | |
| **B6** | Files: how many GB, do they fit the volume, who downloads and backs them up? | Old records still hold Zoho paths | **Owner/core: one-time download + volume backup** | |
| **B7** | Railway env: who sets `BACKEND=pg`, `DATABASE_URL`, `TZ`, `SCHEDULES`, keys? | The default is `BACKEND=zoho` — not standalone | **Owner/core** | |

---

# C. Operations and go-live — needed before deploying

| # | Question | Why it is needed | Default | Answer |
|---|---|---|---|---|
| **C1** | Rollback: can we go back to Zoho? How long? Who decides? | Without a rollback the cutover is risky | **Keep Zoho read-only for 30 days; owner decides** | |
| **C2** | Zoho after go-live: read-only, frozen, or deleted? | Affects rollback and audit | **Read-only, 30 days, then review** | |
| **C3** | Backup/restore: who and how often for Postgres + the volume? | The Railway volume has no automatic backup | **Daily DB + weekly volume snapshot** | |
| **C4** | Monitoring: are `/healthz` + logs enough, or do we need alerting? | No alert when the hooks fail | **At least error log review + daily check** | |
| **C5** | `SCHEDULES=on` in production? | `Forecast_Stamp_Daily` is needed for the delivery forecasts | **Yes, and verify the first run** | |
| **C6** | `TZ=Asia/Manila` — already set on Railway? | If not, the engine's "today" is wrong | **Confirm before UAT** | |
| **C7** | Repo private + key rotation: when, before inviting anyone? | Public repo + keys in the git history | **Before inviting anyone** | |
| **C8** | Flaky procurement test: fix now or watch? | It failed once in a full run | **Watch; do not spend on it yet** | |
| **C9** | Migration verification: row counts + spot checks; who signs? | "Imported" alone is not enough | **Owner signs after spot-check** | |

---

# D. Acceptance and sign-off — before calling it done

| # | Question | Why it is needed | Default | Answer |
|---|---|---|---|---|
| **D1** | Clock divergence: sign the decision record? | It is the only intentional difference from Zoho | **Keep fix; sign [[Decision - Delivery Clock Divergence]]** | **Not answered yet.** Simple explanation in section H. |
| **D2** | "Really the same" definition: are the 8 acceptance criteria OK? | So there is no argument at the end | **Yes** | |
| **D3** | UAT participants: who, when, who signs? | The owner first, then a staff day | **Owner + 1 staff day; owner signs** | |
| **D4** | Reviewer/CODEOWNERS: who reviews? | No gate today | **Core owner + module owner** | |
| **D5** | Verification after cutover: keep Development alive? Snapshot? How long? | So there is something to compare with afterwards | **Keep Development 30 days** | |

---

# E. Already answered — you do not need to answer these

| Question | Answer |
|---|---|
| Are the Zoho IDs preserved? | **Yes** — `server/pg/import.mjs` keeps every ID |
| Is the ID order preserved? | **Yes** — queries use `ORDER BY ID` |
| Does a scripted insert re-trigger the hooks? | **No** — hook writes bypass hooks (`createHookedStore`) |
| Does Delivery have schedules? | **No** — the forecast schedules are in Fulfillment (`SCHEDULES=on`) |
| Is `DMS_Site_Confirmation_Fol` active? | **No** — inactive in the `.ds` |
| Do the CMS URLs exist? | **Yes** — in the Deluge (public key); the new app is env-gated |
| Is Books read on confirm? | **Yes** — shipping address + line items |
| Do the 13 widgets have UI tests? | **No** — only the React prototype has a render test |
| Delivery tests | **109 / 109 pass** (2026-11-13) |

## Two findings that are recommendations, not questions

1. **No idempotency guard in `confirm_dms_schedule_request`.** A double-click can create two appointments. Recommended fix: refuse (or return the existing appointment) when `Status = Confirmed` or `Service_Appointment_Record_ID` is set.
2. **No transaction/lock in `updateRecord`.** Two dispatchers can confirm the same slot concurrently. Recommended fix: advisory lock or transaction around the scheduling write path.

---

# F. Minimum sets

| Milestone | Items needed |
|---|---|
| **Start editing the flow now** | A1–A9 (A10 can follow) |
| **Realistic UAT** | B1, B2, B3, B4, C6, D3 |
| **Go-live** | B5–B7, C1–C7, D1–D5 |

---

# G. Copy-paste reply template

```
A1: 
A2: 
A3: 
A4: 
A5: 
A6: 
A7: 
A8: 
A9: 
A10: 

B1: 
B2: 
B3: 
B4: 
B5: 
B6: 
B7: 

C1: 
C2: 
C3: 
C4: 
C5: 
C6: 
C7: 
C8: 
C9: 

D1: 
D2: 
D3: 
D4: 
D5: 
```

Or simply: **"all defaults"** — I will use every default above and only stop if an answer changes the code materially.

---

# H. Plain explanation (for non-technical readers)

The same questions as above, in everyday words. Added 2026-11-13.

## D1: the "clock divergence", in simple words

**The situation.** There are two teams (for example CJ and John Dave). CJ already has work in the morning (2 hours). A new order needs a time.

**What Zoho does today.** When the team already has work that day, **Zoho gives no time**. No suggestion appears and it does not say why. The cause: it computes a time with a decimal ("10.3"), which is not accepted as a time, so the whole script fails. It only works when the result happens to be a whole hour.

**What the new app does.** It gives a time right after that work: 8:00 AM + 2.30 hours = **10:18 AM**.

**The question.** This is the **only thing we deliberately did not copy from Zoho**. Do you agree to keep the correction?

| Option | What happens |
|---|---|
| **Keep the correction (recommended)** | Every order always gets a suggestion, as staff expect |
| **Copy Zoho** | When the team already has work, no suggestion appears, and staff must fix it by hand |

The decision is written in [[Decision - Delivery Clock Divergence]]; once you agree, it gets signed.

## The eight questions for you

| # | Topic | What it means | Recommended | Answer |
|---|---|---|---|---|
| 1 | Schedule Requests tab (A2) | CMS requests cannot reach the new app yet | Show the tab with a note "no CMS connection yet" | The team will build an API that receives everything from the cloud web |
| 2 | Follow-up email to the customer (A3) | An old schedule no longer active in Zoho | Leave it out for now | The team will confirm whether the API has email and SMS |
| 3 | Who can see Policy Settings (A4) | It holds the scheduling numbers | Admin only | Admin only |
| 4 | Roles (A5) | Scheduler, dispatcher, field team (installer and driver) | Confirm with the team | Only the three roles have access |
| 5 | Double click (A8) | A double click on Confirm makes two appointments | Fix it: once only | Once only (**done**) |
| 6 | Two dispatchers at once (A7) | Both can save the same slot | Fix it | Yes (**done**) |
| 7 | When the CMS or Books fails (A9) | What happens | Show an error, manual retry | Show an error |
| 8 | The clock divergence (D1) | See the explanation above | Keep the correction | **Waiting** |

## The two "holes" that were fixed (2026-11-13)

1. **Double click on Confirm:** before, two clicks = two appointments. Now the second is refused ("Already confirmed…"), even with three clicks at the same time.
2. **Two dispatchers, same time:** before, both could get the same slot. Now scheduling is queued one at a time, so the second sees the first and gets a "Calendar Conflict".

It is on branch `feature/delivery-safety`, with tests; two tests failing when the queue is removed is the proof that the problem was real.
