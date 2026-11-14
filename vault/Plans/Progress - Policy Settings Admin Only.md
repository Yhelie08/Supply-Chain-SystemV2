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

# Progress — Policy Settings admin lang (2026-11-13)

## Ang problema

Ang Policy Settings (4 numbers ng scheduling engine) ay **hidden** sa menu, pero bukas pa rin:

- Kahit sinong naka-sign in ay nakakabukas ng `/w/Delivery Management/Policy Settings/index.html`.
- Kahit sinong naka-sign in ay nakakapag-POST ng `/api/updateRecordById` (o add / delete) sa `All_Policy_Settings`. Kung page lang ang itago, bukas pa rin ang pinto sa likod.

## Ano ang ginawa

| Bahagi | Ano |
|---|---|
| `server/access.mjs` (bago) | `canServeFile`, `visibleSections`, `checkCall`, `checkUpload`; isang lugar ang rules |
| `server/pages.json`, `tools/import-widgets.mjs` | `"adminOnly": true` sa Policy Settings tab (nasa generator din, para hindi mawala kapag nag-regenerate) |
| `server/index.mjs` | 4 hook: widget file, `/api/pages`, SDK writes, `/api/uploadFile` |
| `tests/core/access.test.js` (bago) | 5 tests |

Rules:

- **Page:** non-admin → redirect sa `/`. Chine-check ang **resolved file path**, hindi ang URL, kaya hindi gumagana ang `..%2F` trick; hindi rin mahalaga ang uppercase/lowercase (Windows).
- **Menu:** tinatanggal ang tab sa `/api/pages` para sa non-admin.
- **Writes:** `addRecords` (form `Policy_Settings`), `updateRecordById`, `updateRecords`, `deleteRecordById` (report `All_Policy_Settings`) at `/api/uploadFile` → `{code: 403, message: "Only admins can open or change Policy Settings."}` para sa non-admin.
- **Bukas pa rin:** reads (`getRecords`, `getRecordById`) at lahat ng ibang form. Ang scheduling engine ay nagbabasa sa server (`scheduling.mjs`), kaya hindi apektado.

## Paano na-verify

| Check | Resulta |
|---|---|
| `node --test tests/core/access.test.js` | 5 of 5 |
| `tests/core/*` + `tests/delivery-management/*` | 162 of 162 |
| Totoong server, temp SQLite, `BACKEND=local`, port 4013 (binura pagkatapos) | 15 of 15 |

Sa 15 HTTP checks:

- **Admin:** page 200; add at update gumana; ang `..%2F` URL ay 200 (kaya talagang umaabot ito sa Policy page).
- **Normal user:** page 302; walang Policy Settings sa menu; add / update / delete / upload ay 403; `getRecords` OK (nakita ang value na sinave ng admin); ang write sa ibang form ay hindi na-block ng guard; ang `..%2F` URL ay 302.

## Hindi pa na-check

- Buong `npm run test:all` — may dev server sa port 4000, kaya hindi ko tinakbo ang buong suite.
- Browser click-through (admin na nag-e-edit ng 4 numbers, user na nare-redirect).
- `npm run dev:pg` (Postgres). Backend-independent ang guard, pero hindi ko ito sinubukan sa pg.
- `server/index.mjs` ay core file: sabihan ang core owner bago i-merge.

## Phase 2 — hindi pa ginagawa

Scheduler / Dispatcher / Field roles at per-tab access. Hinihintay ang pagkumpirma ng matrix:

- Nagla-login ba mismo ang installers at drivers (phones), o ang field team lead ang nag-e-enter?
- Pwede bang mag-resolve ng exceptions ang dispatcher?
- Sino ang pwedeng mag-edit ng Policy Settings bukod sa admin?

Kapag natuloy: kailangan ng bagong column sa `_users` (hindi na sapat ang `admin | user` na CHECK), at ang mga kasalukuyang normal user ay mawawalan ng Delivery tabs hanggang bigyan ng role. Pag-isipan muna.

# Ang buong listahan ng kulang (kopya ng sagot, 2026-11-13)

Walang kulang na Delivery function mula sa Zoho Creator: 16/16 workflows, 6/6 custom APIs, 20/20 reports. Ang kulang ay koneksyon, permissions at data. Ang buong detalye ay nasa [[Checklist - Delivery Missing Functions]].

| Grupo | Item |
|---|---|
| May code, walang key o URL | Books/Inventory OAuth (#2, #3); CMS push URLs (#4) |
| Wala pang code | CMS → app route (#6); Roles Phase 2 (#7); Files migration (#8); Email/SMS (#9); Audit trail (#10); Multi-instance lock (#11) |
| Data at deployment | Production export (#12); Railway pa rin bridge sa Zoho (#13); Upstream Fulfillment: `SO_to_Readiness`, `Release_Records_to_Pick1` (#16); 8 empty forms sa backup (§2.4) |
| Hindi pa na-verify | Click-through ng 13 tabs (#20, §3); `npm audit` 6 vulnerabilities (#21); keys public sa git (#22) |
