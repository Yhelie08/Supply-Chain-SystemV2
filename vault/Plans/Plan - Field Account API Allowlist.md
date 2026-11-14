---
title: "Plan - Field Account API Allowlist"
tags:
  - plan
  - delivery-management
  - security
  - access-control
status: proposed 2026-11-14, awaiting owner go — NOT coded yet. Closes checklist item 26 (Phase 2 of item 7).
date: 2026-11-14
---

> [!INFO] Where this fits
> Security hardening before the staff switchover. The Delivery flow is complete; this closes the access-control hole recorded in [[Checklist - Delivery Missing Functions]] item 26 (and item 7, Phase 2). Today a field installer account sees only 3 tabs in the menu, but can still read and write other data by calling `/api/*` directly. This plan locks that down with a deny-by-default allowlist. Related: [[Plan - Delivery Management Open Items]], [[Progress - Policy Settings Admin Only]] (Phase 1). What changed, step by step: [[00 - Change Log]].

# Field account API allowlist (deny-by-default)

## 1. Buod (Tagalog)
- **Ang butas:** ang field account (hal. team CJ) ay 3 tabs lang ang nakikita sa menu, pero kapag tinawag ang API diretso, nakakabasa/nakakasulat pa rin sa ibang data. Nakatago lang ang pinto, hindi nakakandado.
- **Ang fix:** deny-by-default allowlist — field account = ang data lang ng 3 tabs nila (14 pangalan), everything else denied. Admin at regular user ay hindi gagalawin.
- **Status:** plano pa lang, hindi pa nako-code. Hinihintay ang go ng may-ari.

## 2. The problem (OWASP A01 — broken access control)

`server/access.mjs` `checkCall(me, op, body)` runs on every `POST /api/<op>` (wired at `server/index.mjs:258`). Today it only blocks the admin-only form `Policy_Settings` for non-admins. For a field user it allows every other report/form. Confirmed in checklist item 26: a field account (team CJ) read `Service_Request`, `DMS_Schedule_Request_Report`, `All_Daily_Team_Availability`, `Delivery_Scheduling_Report`, and added (then deleted) a `Daily_Team_Availability` record.

The menu (`visibleSections`) and widget files (`canServeFile`) are already scoped to the 3 tabs. The **API data path is not**. Hiding the menu is not authorization.

## 3. The fix

A **deny-by-default allowlist** applied **only to field accounts**. Definition unchanged: `isFieldUser(me) = role !== 'admin' && Boolean(team_name)`.

- **Admins** (`role === 'admin'`): full access, unchanged.
- **Regular users** (`role === 'user'`, no `team_name`): unchanged — still everything except `Policy_Settings`.
- **Field users**: may touch only the 14 names below; every other report/form is denied; **all custom APIs denied** (the 3 tabs call none).

### The exact allowlist (14 names, resolved from the widget code)

| Tab | Names (form or report) |
|---|---|
| **Ongoing Service** | `Service_Appointment`, `Field_Work_Report`, `Field_Work`, `Evidence_Photos`, `All_Evidence_Photos` |
| **Field Service Site Visits** | `Field_Service_Site_Visit_Form_Report`, `Site_Visit_Photos`, `All_Site_Visit_Photos` |
| **Truck Maintenance** | `Daily_Checklist_for_Vehicle`, `Daily_Checklist_for_Vehicle_Report`, `Fuel_Entries`, `All_Fuel_Entries`, `Service_Entries`, `All_Service_Entries` |

Source of truth (the constants the widgets actually pass to the SDK):
- `modules/Delivery Management/Ongoing Service/app/index.html:334-345` — `REPORT_SA`, `REPORT_FW`, `FORM_FW`, `FORM_EVIDENCE`, `REPORT_EVIDENCE`.
- `modules/Delivery Management/Field Service Site Visits/app/index.html:243,630-631` — `REPORT_NAME`, `PHOTO_FORM`, `PHOTO_REPORT`.
- `modules/Delivery Management/Truck Maintenance/app/index.html:505-506,1205-1208` — `FORM_NAME`, `REPORT_NAME`, `FUEL_FORM`, `FUEL_REPORT`, `SERVICE_FORM`, `SERVICE_REPORT`.

This matches the candidate list already written in checklist item 26. Note: `All_Site_Visit_Photos` is the widget's own "educated guess" name (comment at line 631); the allowlist mirrors whatever the widget calls, so it stays consistent regardless.

## 4. Enforcement points

All in `server/access.mjs`, plus one gate in `server/index.mjs`:

1. **`checkCall(me, op, body)`** — after the existing admin-form block, add: if `isFieldUser(me)`:
   - `op === 'invokeCustomApi'` → deny (field tabs use no custom APIs).
   - else resolve the data name: `addRecords` → `body.form_name`; `getRecords` / `getRecordById` / `updateRecordById` / `updateRecords` / `deleteRecordById` → `body.report_name`. If the name is missing or not in the allowlist (case-insensitive) → deny.
2. **`checkUpload(me, report)`** (`/api/uploadFile`, `index.mjs:233`) — field user: deny if `report` missing or not allowed.
3. **`/api/readFile`** (`index.mjs:241`) — add `access.checkCall(me, 'getRecordById', { report_name })` before reading, so a field user cannot read a file off a denied report.

New denial body (generic, no internals): `FIELD_DENIED = { code: 403, message: 'Access denied: your account can only use its assigned Delivery tabs.' }`. The existing `DENIED` (Policy Settings) stays as-is for regular users.

Config: add `allowedData: [...14 names]` to `server/modules/delivery-management/scoping.mjs` (`teamScoping`), read by `createAccess` with the 14-name default fallback. Keeps the list in one configurable place, next to `allowedTabs` / `allowedWidgets`.

## 5. Explicitly NOT in this pass (residual limits, to revisit)

1. **Row-level team scoping** still applies only to `Service_Appointment` and `Field_Work` (the existing `ruleMap`). The other allowed forms are not yet filtered row-by-row per team. This pass is the name allowlist (item 26), not an expansion of row scoping.
2. **Static `/uploads/` files** (`index.mjs:309`) are still fetchable by any signed-in user who knows the filename. Gating those by team needs a file→record→team map and risks breaking image rendering in the 3 tabs; separate, bigger change.

Both are honest follow-ups, not silently ignored.

## 6. Tests and verification (TDD)

Abuse cases first, in `tests/core/access.test.js` (field user `{ role:'user', team_name:'CJ' }`):
- Field user **denied** on outside data: `getRecords`/`addRecords`/`updateRecordById`/`deleteRecordById` for `Service_Request`, `DMS_Schedule_Request_Report`, `All_Daily_Team_Availability`, `Delivery_Scheduling_Report`, `Daily_Team_Availability`, `Policy_Settings` → `FIELD_DENIED` (or `DENIED` for Policy Settings).
- Field user **denied** on `invokeCustomApi` (any api name).
- Field user **allowed** on each of the 14 names (correct op per form vs report).
- Case-insensitive: `service_request` denied; `FIELD_WORK` allowed.
- Missing name for a field user → denied; a body with no name must not throw.
- `checkUpload`: allowed report passes; denied report → `FIELD_DENIED`.
- **Admin unaffected**: `checkCall(admin, 'getRecords', { report_name:'Service_Request' }) === null`.
- **Regular user unaffected**: `getRecords Service_Request === null`; `addRecords Daily_Team_Availability === null`.
- Regression guard: every name constant in the 3 widgets is in the allowlist (so a future widget change that adds a name fails the test until the allowlist is updated).

Then run the full node suite + `npm run test:ui`; confirm no regression. Browser spot-check (throwaway field account, deleted after): the 3 tabs still load and save; a direct API call to a denied report returns 403.

## 7. Risk and reversibility

- Low risk to admins/regular users (gated by `isFieldUser`). Main risk is denying a name a field tab legitimately needs → mitigated by deriving the list from the widget code and the regression-guard test.
- Reversible: remove the field-user branch (or empty `allowedData`) to restore prior behavior.
- No Railway/Postgres write needed to build and test this locally; deploy is a separate, owner-approved step.

## 8. Critical files

- `server/access.mjs` (edit — `checkCall`, `checkUpload`, `FIELD_DENIED`, allowlist set)
- `server/modules/delivery-management/scoping.mjs` (edit — `allowedData`)
- `server/index.mjs` (edit — `readFile` gate)
- `tests/core/access.test.js` (edit — abuse cases)
- The 3 widget `index.html` files (read-only source of truth for the names)

## 9. Status

- [ ] Owner go on the exact 14-name allowlist
- [ ] Implement (TDD)
- [ ] Full suite + UI tests green
- [ ] Browser spot-check with a throwaway field account
- [ ] Docs sync (checklist item 26 / item 7, Change Log)
- [ ] Deploy (separate owner go)