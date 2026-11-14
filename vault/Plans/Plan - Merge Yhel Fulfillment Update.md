---
title: "Plan - Merge Yhel Fulfillment Update"
tags:
  - plan
  - fulfillment
  - git
  - merge
status: EXECUTED + DEPLOYED 2026-11-14. Save point e184e60/9532b32/d9bf006; merge 1 e444d32 (yhelie-update, 7 conflicts resolved both-intents); merge 2 c68f8f9 (jv-update, clean). Tests 614/614 + UI 124/124; browser spot-check passed; docs synced. PUSH done (owner himself, main = 7225cc9, fast-forward); deploy 33945185 SUCCESS via railway up, live verified. Follow-ups: CMS retarget to Service Request before CMS_API_KEY; register Yhel engine workflows in ported.json.
date: 2026-11-14
---

> [!INFO] Where this fits
> Yhel (repo owner `Yhelie08`) pushed Fulfillment work to the branch `yhelie-update`. This plan records how to bring it into the working branch `Johncel-Dev` **without losing the uncommitted rehearsal + access work**. **Scope widened 2026-11-14 (owner):** isama rin ang `origin/jv-update` (1 new commit na wala kay Yhel), para **isang push na lang sa `main`** pagkatapos ng merges + tests. Companion security plan: [[Plan - Field Account API Allowlist]]. Module context: [[Plan - Module Folders and Team Split]], [[Plan - Branches and Pull Requests]]. What changed, step by step: [[00 - Change Log]].

# Merge Yhel's Fulfillment update + JV's latest (`origin/yhelie-update` + `origin/jv-update`)

## 1. Buod (Tagalog)
- Nag-push si Yhel ng 7 commit sa `yhelie-update` — puro Fulfillment (Pack & QC, QC routing, Crate/To Ship/Dispatch, Need Approval, Akeneo/Shopify picker, bagong skin). 77 file.
- **JV:** 1 commit lang ang bago na wala kay Yhel — `83319aa` (supplier-quote reverse sync, Response_Status fix, buyer price lock, sidebar badge fix). Ang iba niyang trabaho ay kasama na sa branch ni Yhel (merge `3e05f9b`).
- **Main:** ancestor ng `Johncel-Dev` (24 ahead, 0 behind) → **fast-forward ang push**; isang push command lang para sa main (+ sync ng `origin/Johncel-Dev`).
- Ang `Johncel-Dev` natin ay may maraming **hindi pa na-commit** na trabaho (rehearsal + access) at 1 commit na hindi pa na-push.
- May 7 file na parehong binago (uncommitted) + 2 file sa committed history (`fulfillment/index.mjs`, `workflows.mjs`) → magko-conflict. **Hindi pwedeng i-merge nang may uncommitted changes** — bloke ng git para protektahan ang trabaho.
- Ligtas na order: **commit muna** (save point, hindi push) → merge → resolve → tests.
- **Confirmed ng owner (2026-11-14):** tanggal na talaga ang Schedule Requests tab — ang CMS ay pumapasok na sa **Service Request**. Ang Pack ay merged na sa **Pack & QC**. Tanggapin ang dalawang pag-alis ni Yhel sa `pages.json`.
- **Gap na nakita sa review:** ang local CMS route ay nagsusulat pa rin sa lumang `DMS_Schedule_Request` — kailangang i-retarget sa Service Request bago i-enable ang CMS (tingnan §6).

## 2. Current state (read-only inspection, 2026-11-14)

- Remote `origin` = `https://github.com/Yhelie08/Supply-Chain-SystemV2.git`.
- Current branch `Johncel-Dev`, **ahead 1** of `origin/Johncel-Dev` (local commit `e87f04a` "Fix sign-in on BACKEND=pg", not pushed).
- Working tree is **dirty**: ~23 modified files + many untracked (the rehearsal, `server/access.mjs`, `scoping.mjs`, migration tool, new tests, docs). None committed yet.
- `git fetch` done; `origin/yhelie-update` now at `afdc45d`.
- `origin/jv-update` at `83319aa`; **1 commit unique vs `origin/yhelie-update`** (verified 2026-11-14).
- `origin/main` at `eea7cac`; **ancestor ng `Johncel-Dev`** (ahead 24, behind 0) → fast-forward push possible, walang divergence.
- Guardrail in place (commit `5c51a5a`): **git push and destructive git commands are blocked**. Merge and commit are allowed. (Ang final push ay may hiwalay na go + guardrail handling — tingnan §5 step 8.)

## 3. What Yhel pushed (7 commits unique vs Johncel-Dev)

| Commit | Summary |
|---|---|
| `afdc45d` | Fulfillment: Need Approval stage, speed-ups, Pre-Order and Sales Order Report fixes |
| `375b44a` | Add Deluge Scripts Master Index and Supply Chain Widget & Deluge System Map |
| `e6b6522` | Fulfillment: QC routing, Crate/To Ship/Dispatch, Exception repair loop, To Ship and Pack & QC UI fixes |
| `8fdc2bb` | Fulfillment: Pack & QC stage, paid + package → Readiness → Pick → Pack & QC |
| `3e05f9b` | Merge origin/jv-update into yhelie-update |
| `9899b03` | Wire Items picker to live Akeneo search + Shopify pricing, fix Customer auto-fill |
| `34cb5f4` | Liquid glass skin, Fulfillment and Delivery page clean-up, dark-mode fixes |

77 files, +4096 / −2374. Highlights:
- **New Fulfillment engine:** `server/modules/fulfillment/{pipeline,qc-routing,crate-dispatch,exception-recheck,workflows,where}.mjs` + 6 new `tests/fulfillment-*.test.js`.
- **New integrations:** `server/akeneo/client.mjs`, `server/shopify/client.mjs`, `server/modules/procurement/{akeneo-apis,books-apis}.mjs`.
- **Pack stage removed**, replaced by **Pack & QC** (`modules/Fulfillment/Pack/*` and `zoho-export/parsed/forms/Pack.json`, `Pack_Notifications.json` deleted; `server/pages.json` −14).
- **New skin:** `server/public/theme/liquid.css`, changes to `views.js`/`views.css`/`theme-init.js`.
- `package.json` +1 — **bagong script `fulfillment:sync`, HINDI bagong dependency** (walang package-lock change). `.gitignore` +3. Bagong tool: `tools/fulfillment-sync.mjs` — nagsusulat sa DB, tingnan §6.

### What JV adds (1 commit: `83319aa` — the rest of `jv-update` is already in Yhel's branch via merge `3e05f9b`)

"Port missing supplier-quote reverse sync, fix Response_Status and buyer price lock" — 6 files, +76/−12:
- `Stage_Supplier_Changed` hook (`server/modules/procurement/inquiry.mjs`): ang submitted quote ng supplier ay umaabot na sa buyer's Inquiry Detail (dating hindi).
- `submitResponse()` fix sa Tony Fan + Fenteng Lighting portals: ang `Response_Status` ay umuusad na past "Waiting" sa normal price-only submit.
- Buyer price lock: naka-lock ang Initial/Negotiated Price hangga't "Pending" ang supplier Availability.
- **Bonus:** ang sidebar badge ay naka-wire na sa totoong `dataSource` ("Postgres"/"Local SQLite") para sa lahat ng users — **naaayos nito ang hardcoded "Local database" label**, isa sa pending cosmetic issues ng rehearsal.

Overlap: `server/index.mjs` (**three-way hotspot:** atin + Yhel + JV), `server/public/index.html` at `modules/Procurement/Inquiry List/app/index.html` (Yhel). Asahan ang maliit na conflict sa second merge; keep all intents. Regression gates: `tests/inquiry.test.js`, `tests/procurement/inquiry-workflows.test.js`.

## 4. The overlapping files (uncommitted locally AND changed by Yhel)

These 7 will block a merge until committed, and are the likely conflict points:

| File | Our uncommitted change | Yhel's change |
|---|---|---|
| `server/auth.mjs` | pg sign-in fix (`RETURNING id` on `_sessions`), shared pool | +25 lines |
| `server/index.mjs` | access wiring, CMS route, upload/readFile gates | +3 lines |
| `server/pages.json` | `adminOnly: true` sa Policy Settings (2 lines; ang 13-tab redesign ay nasa base na) | −14: Pack removed (→ Pack & QC) + **Schedule Requests removed** (CMS → Service Request). Confirmed intentional ng owner. |
| `server/pg/store.mjs` | ID-descending sort fix (checklist item 24) | +10 lines |
| `docs/shared-postgres-setup.md` | Step 4b clarification (Delivery 168 vs 21,345) | +18 lines |
| `vault/Deluge Scripts (Obsidian)/00 - Change Log.md` | Step 7 + Step 5B entries | +10 lines |
| `tools/import-widgets.mjs` | local edits | +3 lines |

(Yhel also touches `server/pg/api.mjs`, `server/public/index.html`, `server/seed-ops.mjs`, `package.json`, `.gitignore` — clean locally, so they apply without an uncommitted-change block.)

**Review correction — 2 more conflict files sa committed history (hindi nakalista dati):**

| File | Our committed change | Yhel's change |
|---|---|---|
| `server/modules/fulfillment/index.mjs` | forecast wiring: `schedules` (Forecast_Stamp_Daily, Backfill_PreOrder_Forecas), `portedFunctions`, forecast imports | rewritten: new engine imports, **wala ang forecast wiring** |
| `server/modules/fulfillment/workflows.mjs` | new file: imports `forecast/hooks.mjs` (7 Instant Forecast workflows) | new file, ibang laman: Need Approval stage rules → **add/add conflict** |

⚠️ Kapag "theirs" ang pinili sa dalawang ito, **patay nang tahimik ang forecast engine** (merged + verified na noong rehearsal). Resolution: pagsamahin — ang engine ni Yhel + ang forecast wiring sa atin. Regression gates: `tests/forecast.test.js`, `tests/delivery-management/forecast-stamp.test.js`.

Walang untracked-file collision (verified 2026-11-14): ang mga bagong file ni Yhel ay hindi tumatama sa untracked files natin.

## 5. The safe order

1. **Commit the current work** on `Johncel-Dev` as a save point. Stage deliberately (avoid `.env`, secrets, `data/`, scratch; **iwanan sa labas ang `.claude/agents/` at `.claude/skills/`** — local tooling, maliban kung sinadyang i-share). **Decided split (owner, 2026-11-14), 3 atomic commits:** (a) Railway/Postgres rehearsal + files migration tools/tests, (b) access/scoping/CMS + Policy Settings adminOnly, (c) docs + vault plans. **Local only; do not push** (guardrail).
2. **Merge** `origin/yhelie-update` into `Johncel-Dev`: `git merge origin/yhelie-update`. Expect conflicts in the 7 files above + the 2 fulfillment files.
3. **Merge** `origin/jv-update` into `Johncel-Dev`: `git merge origin/jv-update`. Dadalhin lang nito ang `83319aa` (1 commit — the rest is already in via Yhel's branch). Expect a small conflict sa `server/index.mjs`.
4. **Resolve each conflict by keeping both intents** — our rehearsal fixes (pg sign-in, ID-desc sort, access gates, Step 4b/Change Log notes) AND Yhel's Fulfillment work AND JV's supplier-quote fixes. Sa `pages.json`: **keep Yhel's two removals** (Pack → Pack & QC; Schedule Requests → CMS enters Service Request, confirmed ng owner) **+ ang `adminOnly` flag natin sa Policy Settings**. Sa `fulfillment/index.mjs` + `workflows.mjs`: pagsamahin ang engine ni Yhel at ang forecast wiring natin (schedules, portedFunctions, hooks import) — huwag "theirs" lang. Sa `server/index.mjs`: pagsamahin ang access/CMS wiring natin + ang skin lines ni Yhel + ang dataSource lines ni JV. Keep both Change Log entry sets in date order.
5. **`npm install`** — harmless, pero walang bagong dependency na darating (script lang ang nadagdag sa `package.json`; walang package-lock change). Walang dependency review na kailangan.
6. **Run the tests:** full node suite + `npm run test:ui`, including the 6 new `tests/fulfillment-*.test.js`. Explicit regression gates: `tests/forecast.test.js` + `tests/delivery-management/forecast-stamp.test.js` (forecast engine), pg auth tests (sign-in fix), Delivery tests (rehearsal), `tests/inquiry.test.js` + `tests/procurement/inquiry-workflows.test.js` (JV's supplier-quote work).
7. **Browser spot-check** Fulfillment (Pack & QC, To Ship, Crate, Need Approval / Approve Dispatch), Delivery — including ang mga UI changes ni Yhel: full-page forms, Archived cards, hidden Refresh/Debug, Service Appointment Action column, liquid glass skin (`hc-skin=classic` ang restore) — at Procurement (Inquiry Detail supplier quotes, supplier portals submit). Confirm: wala nang Schedule Requests tab, nandiyan ang Service Request; sidebar badge shows "Postgres" hindi "Local database". Note: Akeneo/Shopify/Books calls need keys — "code exists, no key" is expected until configured, not a merge failure.
8. **Push to main — isang push, may HIWALAY na go.** Pag green ang tests + spot-check: `git push origin Johncel-Dev Johncel-Dev:main` — isang command, dalawang ref (fast-forward ang `main`, verified ancestor; nasya-sync din ang `origin/Johncel-Dev`). **Bago mag-push:** (a) i-verify na walang GitHub auto-deploy ang Railway sa `main` (ang deploy ay via `railway up`, hiwalay); (b) ang guardrail (`5c51a5a`) ay nagba-block ng push — either patakbuhin ng owner ang command mismo, o i-lift muna ang guardrail nang may explicit go. Pagkatapos ng push, ang fixes ay pasulong bilang bagong commits — **walang force-push**.

## 6. Things to be aware of after the merge

- **New env keys** for Akeneo / Shopify (and Books) — the new integrations will report "not configured" until keys are set. Same pattern as Books/CMS in [[Checklist - Delivery Missing Functions]].
- **Pack → Pack & QC:** any bookmark or doc pointing at the old Pack tab is stale; `pages.json` no longer lists Pack. Confirmed ng owner: merged na talaga ang Pack sa Pack & QC.
- **Schedule Requests removed — confirmed ng owner (2026-11-14).** Bagong process: lahat ng galing CMS ay pumapasok sa **Service Request**. ⚠️ **Gap:** ang local CMS integration (`server/integrations/cms.mjs` → `cms-sync.mjs`, tested sa `tests/core/cms-route.test.js`) ay nagsusulat pa rin sa `DMS_Schedule_Request` / `DMS_Schedule_Request_Messages`. Follow-up work: i-retarget ang CMS route sa Service Request (form + field mapping + chat handling + tests + CMS guide). Hindi pa urgent sa production: unset pa ang `CMS_API_KEY` sa Railway, so walang CMS data na pumapasok — pero **gawin bago i-enable ang CMS**, kundi mapupunta ang messages sa form na walang tab.
- **Delivery UI changes (commit `34cb5f4`, intentional):** records/long forms open as full pages (small dialogs stay pop-outs); Archived grouped into cards; Refresh/Debug buttons + subtitles hidden; Service Appointment Action column hidden; liquid glass skin app-wide (`hc-skin=classic` in localStorage restores the flat look). Makikita ito ng staff sa next deploy — kasama sa spot-check.
- **`tools/fulfillment-sync.mjs` (new, `npm run fulfillment:sync`):** catch-up tool na **nagsusulat sa database** (nililipat ang packages sa Readiness/Pick/Pack & QC stages). "Safe to run any time" ang claim nito, pero production write pa rin — **huwag patakbuhin against Railway nang walang explicit owner go + rollback path**. Nangangailangan ng Railway tunnel + `DATABASE_URL`.
- **Deploy is separate:** merging locally does NOT redeploy Railway, and pushing to `main` is GitHub only. The rehearsal deploy (`c6379920`) stays as-is until a deliberate, owner-approved `railway up`. The next deploy would include Yhel's Fulfillment + JV's supplier-quote work. Verify na walang GitHub auto-deploy ang Railway bago ang push (step 8). **(Done 2026-11-14: verified `source: null`, then owner-approved `railway up` → deployment `33945185` SUCCESS, live verified.)**
- **The lock-down plan** ([[Plan - Field Account API Allowlist]]) is independent; do it before or after the merge, but re-run its tests after merging since `server/index.mjs` and `access.mjs` may shift.

## 7. Reversibility and safety

- The pre-merge commit (step 1) is the restore point.
- If conflicts go sideways **before committing the merge**: `git merge --abort` restores the pre-merge state cleanly (non-destructive).
- Do **not** use `git reset --hard`, `git clean`, force-push, or branch deletion (guardrail blocks destructive commands; they risk the uncommitted work).
- **Push is the final step (owner goal: isang push sa `main`), with its own go after green tests + spot-check.** Once pushed, fixes go forward as new commits — no force-push (guardrail). The guardrail (`5c51a5a`) blocks push: at step 8, the owner runs the push command themselves or explicitly lifts the guardrail first.

## 8. Decision points (owner)

- [x] **Schedule Requests: removed** — confirmed ng owner 2026-11-14; CMS enters Service Request na. Pack → Pack & QC confirmed din. (Keep Yhel's removals sa resolution.)
- [x] **Target: direct merge into `Johncel-Dev`** — decided ng owner 2026-11-14. Save point + `merge --abort` ang proteksyon; ang `main` ay maa-update lang sa final fast-forward push (step 8, may hiwalay na go).
- [x] **Commit granularity: 3 commits** — decided ng owner 2026-11-14: (1) rehearsal + files migration, (2) access/scoping/CMS + adminOnly, (3) docs + vault plans.
- [x] **Scope: isama ang `origin/jv-update`** — owner, 2026-11-14. 1 new commit (`83319aa`); the rest of JV's work is already in Yhel's branch.
- [x] **End goal: isang push sa `main`** — owner, 2026-11-14. Fast-forward verified; push after green tests + spot-check, with separate go (step 8).
- [x] **Go to execute steps 1–7 (save point + merges + tests + spot-check)** — owner: "go na" (2026-11-14); executed same day.
- [x] **Go to push (step 8)** — owner himself ran the push 2026-11-14 (guardrail intact); `origin/main` = `7225cc9`, fast-forward, `origin/Johncel-Dev` synced.
- [x] Deploy after merge — owner go 2026-11-14; `railway up` deployment `33945185` SUCCESS, live verified (liquid.css 200, login page new skin, schema 0 changes, schedules on).
- [ ] CMS retarget to Service Request: after merge, before CMS go-live (recommended timing)?

## 9. Status

- [x] Fetch + inspect `origin/yhelie-update` (read-only)
- [x] Identify the 7 overlapping files
- [x] Plan reviewed vs live repo (2026-11-14): claims verified; corrections folded in (pages.json label, no new dependency, +2 fulfillment conflict files, forecast regression gates)
- [x] Owner confirmed: Schedule Requests removed (CMS → Service Request), Pack → Pack & QC
- [x] Inspect `origin/jv-update` + `origin/main` (2026-11-14): 1 new JV commit (`83319aa`); main is ancestor → fast-forward push possible
- [x] Owner go (steps 1–7) — "go na", 2026-11-14
- [x] Commit current work (save point, 3 commits): `e184e60` rehearsal, `9532b32` access/CMS, `d9bf006` docs
- [x] Merge `yhelie-update` + `jv-update`, resolve conflicts — merge 1 `e444d32`: 7 conflicts resolved (both intents kept), 7 post-merge test failures fixed (stale Pack/Schedule Requests counts; forecast tests now assert cross-record consistency because the Zoho-ported Instant Forecast stamp recomputes on save). Merge 2 `c68f8f9`: clean auto-merge, both intents verified.
- [x] `npm install` + full suite + UI tests green — 614/614 node (concurrency=2; default parallelism OOMs 2 PGlite files when a dev server runs alongside), 124/124 UI (5 files). No new dependencies (fulfillment:sync script only).
- [x] Browser spot-check (Fulfillment + Delivery + Procurement) — local SQLite, temp QA admin deleted after: Pack & QC/To Ship/Crate/Order Readiness + Approve Dispatch render; no Pack tab; no Schedule Requests tab, Service Request + full-page form OK, Archived cards OK; Inquiry List renders, JV price-lock confirmed in served widget; sidebar badge "Local SQLite"; no console errors.
- [x] Push to main — owner pushed 2026-11-14; `origin/main` = `7225cc9` (fast-forward), `origin/Johncel-Dev` synced.
- [x] Deploy to Railway — `railway up --service supply-chain-app` deployment `33945185` SUCCESS 2026-11-14; live verified: `/theme/liquid.css` 404→200, login page new skin, `[pg] schema ready (0 changes)`, schedules on, Fulfillment 11 / Delivery 12 pages; Books/Akeneo/Shopify "not configured" (expected, keys unset).
- [ ] CMS retarget to Service Request (bago i-enable ang CMS)
- [x] Docs sync (Change Log, Port Status, Fulfillment notes, Delivery checklist + Open Decisions — inalis ang "Schedule Requests display" pending decision; shared-postgres-setup counts 90→88 forms / 88→86 exportable)