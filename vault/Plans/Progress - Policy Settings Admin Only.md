---
title: "Progress - Policy Settings Admin Only"
tags:
  - plan
  - delivery-management
  - progress
  - roles
status: Phase 1 done (code + tests, not clicked in a browser); Phase 2 (3 roles, per-tab access) not started
date: 2026-11-13
---

> [!INFO] Where this fits
> Roles Phase 1 from [[Checklist - Delivery Missing Functions]] item 7. The decision (Policy Settings admin-only, three roles only) is in [[Clarifications - Delivery Management]]. The draft role matrix is in [[Plan - Delivery Management Open Items]] section 5. Short entry: [[00 - Change Log]].

# Progress — Policy Settings, admin only (2026-11-13)

## The problem

Policy Settings (the 4 numbers of the scheduling engine) is **hidden** in the menu, but it was still open:

- Anyone signed in could open `/w/Delivery Management/Policy Settings/index.html`.
- Anyone signed in could POST `/api/updateRecordById` (or add / delete) on `All_Policy_Settings`. Hiding the page alone leaves the back door open.

## What was done

| Part | What |
|---|---|
| `server/access.mjs` (new) | `canServeFile`, `visibleSections`, `checkCall`, `checkUpload`; the rules in one place |
| `server/pages.json`, `tools/import-widgets.mjs` | `"adminOnly": true` on the Policy Settings tab (also in the generator, so a regenerate does not drop it) |
| `server/index.mjs` | 4 hooks: widget file, `/api/pages`, SDK writes, `/api/uploadFile` |
| `tests/core/access.test.js` (new) | 5 tests |

Rules:

- **Page:** non-admin → redirect to `/`. The **resolved file path** is checked, not the URL, so the `..%2F` trick does not work; upper/lower case does not matter either (Windows).
- **Menu:** the tab is removed from `/api/pages` for non-admins.
- **Writes:** `addRecords` (form `Policy_Settings`), `updateRecordById`, `updateRecords`, `deleteRecordById` (report `All_Policy_Settings`) and `/api/uploadFile` → `{code: 403, message: "Only admins can open or change Policy Settings."}` for non-admins.
- **Still open:** reads (`getRecords`, `getRecordById`) and every other form. The scheduling engine reads on the server (`scheduling.mjs`), so it is not affected.

## How it was verified

| Check | Result |
|---|---|
| `node --test tests/core/access.test.js` | 5 of 5 |
| `tests/core/*` + `tests/delivery-management/*` | 162 of 162 |
| Real server, temp SQLite, `BACKEND=local`, port 4013 (deleted afterwards) | 15 of 15 |

In the 15 HTTP checks:

- **Admin:** page 200; add and update worked; the `..%2F` URL is 200 (so it really reaches the Policy page).
- **Normal user:** page 302; no Policy Settings in the menu; add / update / delete / upload are 403; `getRecords` OK (saw the value the admin saved); a write to another form was not blocked by the guard; the `..%2F` URL is 302.

## Not checked yet

- The full `npm run test:all`: a dev server was running on port 4000, so the full suite was not run.
- Browser click-through (an admin editing the 4 numbers, a user being redirected).
- `npm run dev:pg` (Postgres). The guard does not depend on the backend, but it was not tried on pg.
- `server/index.mjs` is a core file: tell the core owner before merging.

## Phase 2 — not started

Scheduler / Dispatcher / Field roles and per-tab access. Waiting for the matrix to be confirmed:

- Do the installers and drivers sign in themselves (phones), or does the field team lead enter the data?
- May the dispatcher resolve exceptions?
- Who besides the admin may edit Policy Settings?

If it goes ahead: `_users` needs a new column (the `admin | user` CHECK is no longer enough), and the current normal users lose the Delivery tabs until they are given a role. Think it through first.

# The full list of what is missing (copy of the answer, 2026-11-13)

No Delivery function from Zoho Creator is missing: 16/16 workflows, 6/6 custom APIs, 20/20 reports. What is missing is connections, permissions and data. Full detail in [[Checklist - Delivery Missing Functions]].

| Group | Item |
|---|---|
| Has code, no key or URL | Books/Inventory OAuth (#2, #3); CMS push URLs (#4) |
| No code yet | CMS → app route (#6); Roles Phase 2 (#7); Files migration (#8); Email/SMS (#9); Audit trail (#10); Multi-instance lock (#11) |
| Data and deployment | Production export (#12); Railway still bridges to Zoho (#13); Upstream Fulfillment: `SO_to_Readiness`, `Release_Records_to_Pick1` (#16); 8 empty forms in the backup (§2.4) |
| Not verified yet | Click-through of the 13 tabs (#20, §3); `npm audit` 6 vulnerabilities (#21); keys public in git (#22) |
