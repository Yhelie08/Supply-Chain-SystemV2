---
title: "Open Decisions - Delivery Management"
tags:
  - plan
  - delivery-management
  - open-items
status: open — waiting for the owner's answers before editing the flow
date: 2026-11-13
---

> [!INFO] Where this fits
> The five decisions that block the flow edits. The full question list: [[Clarifications - Delivery Management]]. The one signed decision: [[Decision - Delivery Clock Divergence]]. What was already done: [[Progress - Delivery Safety]]. The build plan: [[Plan - Delivery Management]].

# Delivery Management — The Five Decisions Before Editing the Flow

- **Status:** Open — waiting for answers
- **Date:** 2026-11-13
- **Who answers:** the owner of the Delivery module
- **Linked:** [[Clarifications - Delivery Management]] (all questions A1–D5), [[Decision - Delivery Clock Divergence]] (the one signed decision)

## How to use this file

Three ways:

1. **One by one** — fill in the "Answer" line.
2. **"All defaults"** — I will use every recommendation below.
3. **"I don't know"** — it becomes a list of blockers, not a guess.

---

## 1. Scope of the CMS and Books (A1)

**What it is:** the new app replaces Zoho Creator for Delivery. But two things are still Zoho:

- **CMS** — a separate Zoho Creator app where customer service raises schedule requests.
- **Books** — Zoho Books/Inventory, for shipments and sales returns.

**The question:** do we let these two stay as "external" systems (A), or try to remove all of Zoho (B)?

| Option | Meaning | Work |
|---|---|---|
| **A** | No Delivery data left in Creator, but the CMS and Books are **fine** | Small: one "door" for the CMS to come in |
| **B** | Remove **all** of Zoho, including the CMS and Books | Big: rebuild the CMS and replace Books — no longer Delivery-only |

**My recommendation:** **A**. Books is the accounting system; the Delivery team should not touch it. The CMS can stay as long as there is a door.

**Answer:** ______________________

---

## 2. Schedule Requests display (A2) — RESOLVED 2026-11-14: removed for good

**Owner decision (2026-11-14):** **the Schedule Requests tab is removed for good.** It will not come back; in the new process **everything from the CMS comes in as a Service Request**. The old question (show read-only or hide while there is no CMS door) no longer applies.

**Applied in the merge (2026-11-14, `e444d32`):** the tab is removed from `pages.json` + `import-widgets.mjs`; 12 admin / 11 user delivery tabs. The CMS inbound route (`/api/integrations/cms/*`) **still has to be pointed at Service Request** before `CMS_API_KEY` is enabled — a follow-up listed in the Change Log and the merge plan.

**Answer:** Removed — the CMS enters Service Request (owner, 2026-11-14).

---

## 3. Site follow-up (A3)

**What it is:** Zoho has an automatic follow-up for sites that have not confirmed. **It is inactive today.** If it were turned on, it would:

- Email the customer
- Count the attempts
- Past the maximum, mark the site **"Unreachable"** and create a high-severity exception

**The question:** port it or skip it?

| Option | Meaning | Needs |
|---|---|---|
| **Port** | Build it in the new app | Email service, a new schedule, tests |
| **Skip** | Staff follow up by hand | Only a write-up of the manual process |

**My recommendation:** **Skip for now.** It is inactive in Zoho anyway, and the app has no email service today. If staff ask for it, build it then.

**Answer:** ______________________ (if port: who owns the email?)

---

## 4. Widget ownership (A6)

**What it is:** the 13 tabs are small web pages (widgets). If a button is broken or a field is wrong in the new app, **who fixes it?**

| Option | Meaning |
|---|---|
| **You: UI + backend** | You own all of Delivery — faster, one person knows everything |
| **Backend only** | You do only the backend; someone else does the UI — needs assigning and coordination |

**Why it matters:** UAT cannot finish without an owner for the UI bugs. Whoever edits a widget must also understand the data.

**My recommendation:** **You: UI + backend** for Delivery.

**Answer:** ______________________

---

## 5. Data contract (A10)

**What it is:** Delivery uses **shared forms** — Service Request, Sales Order Fulfillment, Items, Customer, Sales Order, Policy Settings. Other modules use them too.

The "contract" is a simple list:

- Which fields Delivery reads and writes
- Which values/statuses are expected
- Who may change them

**Why it matters:** it is like a shared room. If someone rearranges the furniture (renames a field or changes a status word) without notice, **Delivery breaks** — and not visibly at first.

**The question:** who signs, and what is the rule when something changes?

| Option | Meaning |
|---|---|
| **Core owner signs** | One person has the final say on the shared schema; a PR + Delivery tests before any change |
| **Each module owner signs their own** | Faster, but conflicts are possible |
| **No contract** | Fastest, but risky |

**My recommendation:** **The core owner signs; any shared-field change needs a PR + Delivery tests.** You fix whatever breaks on the Delivery side, but the change gets a review.

**Answer:** ______________________ (name + rule)

---

## Summary

| # | Question | Recommendation | Answer |
|---|---|---|---|
| A1 | CMS/Books: A or B? | **A** | |
| A2 | Schedule Requests: show or hide? | **Removed for good** (2026-11-14: CMS → Service Request) | |
| A3 | Site follow-up: port or skip? | **Skip for now** | |
| A6 | Widgets: you do everything, or a UI owner? | **You: UI + backend** | |
| A10 | Data contract: who signs? | **Core owner + PR rule** | |

---

## What happens after the answers

| If the answer is... | What happens in the build |
|---|---|
| **A1 = A** | Books and the CMS stay. Only one inbound route opens (needs an API key). |
| **A1 = B** | A big new project: CMS rebuild + Books replacement. No longer Delivery-only — needs a new plan. |
| **A2 = Show** | Read-only list + banner on the tab. Part of UAT (13 tabs). |
| **A2 = Hide** | The tab is hidden. UAT = 12 tabs. Shown once the door exists. |
| **A3 = Skip** | No new code. The manual follow-up process is written in the docs. |
| **A3 = Port** | New email service + schedule + tests. Needs an owner for the email. |
| **A6 = You do everything** | No coordination. You fix the UI bugs in UAT. |
| **A6 = Backend only** | Needs the name of a UI owner before UAT. |
| **A10 = Core owner** | The field list is written as `Delivery Data Contract.md`, with the PR rule. |

## What is NOT in this file

These are needed before going live, but not before editing the flow:

- Production export (B1)
- Books OAuth, Geoapify key, CMS URLs/API key (B2–B4)
- CMS inbound route (B5)
- Files and Railway env (B6–B7)
- Rollback, backup, monitoring, timezone (C1–C6)
- Private repo + key rotation (C7)
- UAT participants, reviewer, sign-off (D3–D5)

The full list is in [[Clarifications - Delivery Management]].

## One line if you do not want to think about it

> **"All defaults"** — A1 = A, A2 = Show read-only, A3 = Skip, A6 = You do everything, A10 = Core owner + PR rule.
