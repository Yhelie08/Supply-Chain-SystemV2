---
title: "Plan - Merge Yhel Fulfillment Update"
tags:
  - plan
  - fulfillment
  - git
  - merge
status: EXECUTED + DEPLOYED 2026-11-14. Save point e184e60/9532b32/d9bf006; merge 1 e444d32 (yhelie-update, 7 conflicts resolved both-intents); merge 2 c68f8f9 (jv-update, clean). Tests 614/614 + UI 124/124; browser spot-check passed; docs synced. PUSH done (owner himself, main = 7225cc9, fast-forward); deploy 33945185 SUCCESS via railway up, live verified. Follow-ups: CMS retarget to Service Request before CMS_API_KEY; register Yhel engine workflows in ported.json (DONE 2026-11-17).
date: 2026-11-14
---

> [!INFO] Where this fits
> Yhel (repo owner `Yhelie08`) pushed Fulfillment work to the branch `yhelie-update`. This plan records how to bring it into the working branch `Johncel-Dev` **without losing the uncommitted rehearsal + access work**. **Scope widened 2026-11-14 (owner):** also include `origin/jv-update` (1 new commit that is not in Yhel's branch), so there is **a single push to `main`** after the merges + tests. Companion security plan: [[Plan - Field Account API Allowlist]]. Module context: [[Plan - Module Folders and Team Split]], [[Plan - Branches and Pull Requests]]. What changed, step by step: [[00 - Change Log]].

# Merge Yhel's Fulfillment update + JV's latest (`origin/yhelie-update` + `origin/jv-update`)

## 1. Summary
- Yhel pushed 7 commits to `yhelie-update`, all Fulfillment (Pack & QC, QC routing, Crate/To Ship/Dispatch, Need Approval, Akeneo/Shopify picker, new skin). 77 files.
- **JV:** only 1 new commit that is not in Yhel's branch — `83319aa` (supplier-quote reverse sync, Response_Status fix, buyer price lock, sidebar badge fix). The rest of JV's work is already in Yhel's branch (merge `3e05f9b`).
- **Main:** an ancestor of `Johncel-Dev` (24 ahead, 0 behind) → **the push is a fast-forward**; one push command for main (+ syncing `origin/Johncel-Dev`).
- Our `Johncel-Dev` has a lot of **uncommitted** work (rehearsal + access) and 1 commit not pushed yet.
- 7 files are changed on both sides (uncommitted) + 2 files in committed history (`fulfillment/index.mjs`, `workflows.mjs`) → they will conflict. **A merge is not possible with uncommitted changes** — git blocks it to protect the work.
- Safe order: **commit first** (save point, no push) → merge → resolve → tests.
- **Confirmed by the owner (2026-11-14):** the Schedule Requests tab is gone for good — the CMS now enters through **Service Request**. Pack is merged into **Pack & QC**. Accept both of Yhel's removals in `pages.json`.
- **Gap found in review:** the local CMS route still writes to the old `DMS_Schedule_Request` — it must be pointed at Service Request before the CMS is enabled (see §6).

## 2. Current state (read-only inspection, 2026-11-14)

- Remote `origin` = `https://github.com/Yhelie08/Supply-Chain-SystemV2.git`.
- Current branch `Johncel-Dev`, **ahead 1** of `origin/Johncel-Dev` (local commit `e87f04a` "Fix sign-in on BACKEND=pg", not pushed).
- Working tree is **dirty**: ~23 modified files + many untracked (the rehearsal, `server/access.mjs`, `scoping.mjs`, migration tool, new tests, docs). None committed yet.
- `git fetch` done; `origin/yhelie-update` now at `afdc45d`.
- `origin/jv-update` at `83319aa`; **1 commit unique vs `origin/yhelie-update`** (verified 2026-11-14).
- `origin/main` at `eea7cac`; **an ancestor of `Johncel-Dev`** (ahead 24, behind 0) → fast-forward push possible, no divergence.
- Guardrail in place (commit `5c51a5a`): **git push and destructive git commands are blocked**. Merge and commit are allowed. (The final push has its own go + guardrail handling — see §5 step 8.)

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
- `package.json` +1 — **a new script `fulfillment:sync`, NOT a new dependency** (no package-lock change). `.gitignore` +3. New tool: `tools/fulfillment-sync.mjs` — it writes to the DB, see §6.

### What JV adds (1 commit: `83319aa` — the rest of `jv-update` is already in Yhel's branch via merge `3e05f9b`)

"Port missing supplier-quote reverse sync, fix Response_Status and buyer price lock" — 6 files, +76/−12:
- `Stage_Supplier_Changed` hook (`server/modules/procurement/inquiry.mjs`): the supplier's submitted quote now reaches the buyer's Inquiry Detail (it did not before).
- `submitResponse()` fix in the Tony Fan + Fenteng Lighting portals: `Response_Status` now moves past "Waiting" on a normal price-only submit.
- Buyer price lock: Initial/Negotiated Price stay locked while the supplier's Availability is "Pending".
- **Bonus:** the sidebar badge is wired to the real `dataSource` ("Postgres"/"Local SQLite") for every user — **this fixes the hardcoded "Local database" label**, one of the pending cosmetic issues of the rehearsal.

Overlap: `server/index.mjs` (**three-way hotspot:** ours + Yhel + JV), `server/public/index.html` and `modules/Procurement/Inquiry List/app/index.html` (Yhel). Expect a small conflict in the second merge; keep all intents. Regression gates: `tests/inquiry.test.js`, `tests/procurement/inquiry-workflows.test.js`.

## 4. The overlapping files (uncommitted locally AND changed by Yhel)

These 7 will block a merge until committed, and are the likely conflict points:

| File | Our uncommitted change | Yhel's change |
|---|---|---|
| `server/auth.mjs` | pg sign-in fix (`RETURNING id` on `_sessions`), shared pool | +25 lines |
| `server/index.mjs` | access wiring, CMS route, upload/readFile gates | +3 lines |
| `server/pages.json` | `adminOnly: true` on Policy Settings (2 lines; the 13-tab redesign is already in the base) | −14: Pack removed (→ Pack & QC) + **Schedule Requests removed** (CMS → Service Request). Confirmed intentional by the owner. |
| `server/pg/store.mjs` | ID-descending sort fix (checklist item 24) | +10 lines |
| `docs/shared-postgres-setup.md` | Step 4b clarification (Delivery 168 vs 21,345) | +18 lines |
| `vault/Deluge Scripts (Obsidian)/00 - Change Log.md` | Step 7 + Step 5B entries | +10 lines |
| `tools/import-widgets.mjs` | local edits | +3 lines |

(Yhel also touches `server/pg/api.mjs`, `server/public/index.html`, `server/seed-ops.mjs`, `package.json`, `.gitignore` — clean locally, so they apply without an uncommitted-change block.)

**Review correction — 2 more conflict files in committed history (not listed before):**

| File | Our committed change | Yhel's change |
|---|---|---|
| `server/modules/fulfillment/index.mjs` | forecast wiring: `schedules` (Forecast_Stamp_Daily, Backfill_PreOrder_Forecas), `portedFunctions`, forecast imports | rewritten: new engine imports, **without the forecast wiring** |
| `server/modules/fulfillment/workflows.mjs` | new file: imports `forecast/hooks.mjs` (7 Instant Forecast workflows) | new file, different content: Need Approval stage rules → **add/add conflict** |

⚠️ Picking "theirs" in these two **silently kills the forecast engine** (merged + verified during the rehearsal). Resolution: combine them — Yhel's engine + our forecast wiring. Regression gates: `tests/forecast.test.js`, `tests/delivery-management/forecast-stamp.test.js`.

No untracked-file collision (verified 2026-11-14): Yhel's new files do not hit our untracked files.

## 5. The safe order

1. **Commit the current work** on `Johncel-Dev` as a save point. Stage deliberately (avoid `.env`, secrets, `data/`, scratch; **leave `.claude/agents/` and `.claude/skills/` out** — local tooling, unless shared on purpose). **Decided split (owner, 2026-11-14), 3 atomic commits:** (a) Railway/Postgres rehearsal + files migration tools/tests, (b) access/scoping/CMS + Policy Settings adminOnly, (c) docs + vault plans. **Local only; do not push** (guardrail).
2. **Merge** `origin/yhelie-update` into `Johncel-Dev`: `git merge origin/yhelie-update`. Expect conflicts in the 7 files above + the 2 fulfillment files.
3. **Merge** `origin/jv-update` into `Johncel-Dev`: `git merge origin/jv-update`. This only brings `83319aa` (1 commit — the rest is already in via Yhel's branch). Expect a small conflict in `server/index.mjs`.
4. **Resolve each conflict by keeping both intents** — our rehearsal fixes (pg sign-in, ID-desc sort, access gates, Step 4b/Change Log notes) AND Yhel's Fulfillment work AND JV's supplier-quote fixes. In `pages.json`: **keep Yhel's two removals** (Pack → Pack & QC; Schedule Requests → CMS enters Service Request, confirmed by the owner) **+ our `adminOnly` flag on Policy Settings**. In `fulfillment/index.mjs` + `workflows.mjs`: combine Yhel's engine and our forecast wiring (schedules, portedFunctions, hooks import) — not "theirs" alone. In `server/index.mjs`: combine our access/CMS wiring + Yhel's skin lines + JV's dataSource lines. Keep both Change Log entry sets in date order.
5. **`npm install`** — harmless; no new dependency arrives (only a script was added to `package.json`; no package-lock change). No dependency review needed.
6. **Run the tests:** full node suite + `npm run test:ui`, including the 6 new `tests/fulfillment-*.test.js`. Explicit regression gates: `tests/forecast.test.js` + `tests/delivery-management/forecast-stamp.test.js` (forecast engine), pg auth tests (sign-in fix), Delivery tests (rehearsal), `tests/inquiry.test.js` + `tests/procurement/inquiry-workflows.test.js` (JV's supplier-quote work).
7. **Browser spot-check** Fulfillment (Pack & QC, To Ship, Crate, Need Approval / Approve Dispatch), Delivery — including Yhel's UI changes: full-page forms, Archived cards, hidden Refresh/Debug, Service Appointment Action column, liquid glass skin (`hc-skin=classic` restores the old look) — and Procurement (Inquiry Detail supplier quotes, supplier portals submit). Confirm: no Schedule Requests tab, Service Request is there; the sidebar badge shows "Postgres", not "Local database". Note: Akeneo/Shopify/Books calls need keys — "code exists, no key" is expected until configured, not a merge failure.
8. **Push to main — a single push, with a SEPARATE go.** When the tests + spot-check are green: `git push origin Johncel-Dev Johncel-Dev:main` — one command, two refs (`main` fast-forwards, verified ancestor; `origin/Johncel-Dev` is synced too). **Before pushing:** (a) verify Railway has no GitHub auto-deploy on `main` (the deploy is via `railway up`, separate); (b) the guardrail (`5c51a5a`) blocks push — either the owner runs the command himself, or the guardrail is lifted first with an explicit go. After the push, fixes go forward as new commits — **no force-push**.

## 6. Things to be aware of after the merge

- **New env keys** for Akeneo / Shopify (and Books) — the new integrations report "not configured" until the keys are set. Same pattern as Books/CMS in [[Checklist - Delivery Missing Functions]].
- **Pack → Pack & QC:** any bookmark or doc pointing at the old Pack tab is stale; `pages.json` no longer lists Pack. Confirmed by the owner: Pack really is merged into Pack & QC.
- **Schedule Requests removed — confirmed by the owner (2026-11-14).** New process: everything from the CMS comes in as a **Service Request**. ⚠️ **Gap:** the local CMS integration (`server/integrations/cms.mjs` → `cms-sync.mjs`, tested in `tests/core/cms-route.test.js`) still writes to `DMS_Schedule_Request` / `DMS_Schedule_Request_Messages`. Follow-up work: point the CMS route at Service Request (form + field mapping + chat handling + tests + CMS guide). Not urgent in production yet: `CMS_API_KEY` is still unset on Railway, so no CMS data comes in — but **do it before the CMS is enabled**, or the messages land in a form that has no tab.
- **Delivery UI changes (commit `34cb5f4`, intentional):** records/long forms open as full pages (small dialogs stay pop-outs); Archived grouped into cards; Refresh/Debug buttons + subtitles hidden; Service Appointment Action column hidden; liquid glass skin app-wide (`hc-skin=classic` in localStorage restores the flat look). Staff will see this on the next deploy — part of the spot-check.
- **`tools/fulfillment-sync.mjs` (new, `npm run fulfillment:sync`):** a catch-up tool that **writes to the database** (moves packages into the Readiness/Pick/Pack & QC stages). It claims to be "safe to run any time", but it is still a production write — **do not run it against Railway without an explicit owner go + a rollback path**. It needs a Railway tunnel + `DATABASE_URL`.
- **Deploy is separate:** merging locally does NOT redeploy Railway, and pushing to `main` is GitHub only. The rehearsal deploy (`c6379920`) stays as-is until a deliberate, owner-approved `railway up`. The next deploy would include Yhel's Fulfillment + JV's supplier-quote work. Verify Railway has no GitHub auto-deploy before the push (step 8). **(Done 2026-11-14: verified `source: null`, then owner-approved `railway up` → deployment `33945185` SUCCESS, live verified.)**
- **The lock-down plan** ([[Plan - Field Account API Allowlist]]) is independent; do it before or after the merge, but re-run its tests after merging since `server/index.mjs` and `access.mjs` may shift.

## 7. Reversibility and safety

- The pre-merge commit (step 1) is the restore point.
- If conflicts go sideways **before committing the merge**: `git merge --abort` restores the pre-merge state cleanly (non-destructive).
- Do **not** use `git reset --hard`, `git clean`, force-push, or branch deletion (the guardrail blocks destructive commands; they risk the uncommitted work).
- **Push is the final step (owner goal: a single push to `main`), with its own go after green tests + spot-check.** Once pushed, fixes go forward as new commits — no force-push (guardrail). The guardrail (`5c51a5a`) blocks push: at step 8, the owner runs the push command himself or explicitly lifts the guardrail first.

## 8. Decision points (owner)

- [x] **Schedule Requests: removed** — confirmed by the owner 2026-11-14; the CMS now enters Service Request. Pack → Pack & QC confirmed too. (Keep Yhel's removals in the resolution.)
- [x] **Target: direct merge into `Johncel-Dev`** — decided by the owner 2026-11-14. The save point + `merge --abort` are the protection; `main` is only updated by the final fast-forward push (step 8, with a separate go).
- [x] **Commit granularity: 3 commits** — decided by the owner 2026-11-14: (1) rehearsal + files migration, (2) access/scoping/CMS + adminOnly, (3) docs + vault plans.
- [x] **Scope: include `origin/jv-update`** — owner, 2026-11-14. 1 new commit (`83319aa`); the rest of JV's work is already in Yhel's branch.
- [x] **End goal: a single push to `main`** — owner, 2026-11-14. Fast-forward verified; push after green tests + spot-check, with a separate go (step 8).
- [x] **Go to execute steps 1–7 (save point + merges + tests + spot-check)** — owner: "go na" (2026-11-14); executed the same day.
- [x] **Go to push (step 8)** — the owner himself ran the push 2026-11-14 (guardrail intact); `origin/main` = `7225cc9`, fast-forward, `origin/Johncel-Dev` synced.
- [x] Deploy after merge — owner go 2026-11-14; `railway up` deployment `33945185` SUCCESS, live verified (liquid.css 200, login page new skin, schema 0 changes, schedules on).
- [ ] CMS retarget to Service Request: after merge, before CMS go-live (recommended timing)?

## 9. Status

- [x] Fetch + inspect `origin/yhelie-update` (read-only)
- [x] Identify the 7 overlapping files
- [x] Plan reviewed vs the live repo (2026-11-14): claims verified; corrections folded in (pages.json label, no new dependency, +2 fulfillment conflict files, forecast regression gates)
- [x] Owner confirmed: Schedule Requests removed (CMS → Service Request), Pack → Pack & QC
- [x] Inspect `origin/jv-update` + `origin/main` (2026-11-14): 1 new JV commit (`83319aa`); main is an ancestor → fast-forward push possible
- [x] Owner go (steps 1–7) — "go na", 2026-11-14
- [x] Commit current work (save point, 3 commits): `e184e60` rehearsal, `9532b32` access/CMS, `d9bf006` docs
- [x] Merge `yhelie-update` + `jv-update`, resolve conflicts — merge 1 `e444d32`: 7 conflicts resolved (both intents kept), 7 post-merge test failures fixed (stale Pack/Schedule Requests counts; forecast tests now assert cross-record consistency because the Zoho-ported Instant Forecast stamp recomputes on save). Merge 2 `c68f8f9`: clean auto-merge, both intents verified.
- [x] `npm install` + full suite + UI tests green — 614/614 node (concurrency=2; the default parallelism OOMs 2 PGlite files when a dev server runs alongside), 124/124 UI (5 files). No new dependencies (fulfillment:sync script only).
- [x] Browser spot-check (Fulfillment + Delivery + Procurement) — local SQLite, temp QA admin deleted after: Pack & QC/To Ship/Crate/Order Readiness + Approve Dispatch render; no Pack tab; no Schedule Requests tab, Service Request + full-page form OK, Archived cards OK; Inquiry List renders, JV price-lock confirmed in the served widget; sidebar badge "Local SQLite"; no console errors.
- [x] Push to main — owner pushed 2026-11-14; `origin/main` = `7225cc9` (fast-forward), `origin/Johncel-Dev` synced.
- [x] Deploy to Railway — `railway up --service supply-chain-app` deployment `33945185` SUCCESS 2026-11-14; live verified: `/theme/liquid.css` 404→200, login page new skin, `[pg] schema ready (0 changes)`, schedules on, Fulfillment 11 / Delivery 12 pages; Books/Akeneo/Shopify "not configured" (expected, keys unset).
- [ ] CMS retarget to Service Request (before the CMS is enabled)
- [x] Docs sync (Change Log, Port Status, Fulfillment notes, Delivery checklist + Open Decisions — removed the "Schedule Requests display" pending decision; shared-postgres-setup counts 90→88 forms / 88→86 exportable)
