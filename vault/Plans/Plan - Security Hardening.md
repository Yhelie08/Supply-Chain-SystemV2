---
title: "Plan - Security Hardening"
tags:
  - plan
  - security
  - hardening
status: proposed 2026-11-14, awaiting owner go — NOT coded yet. Repo→private decided; key rotation + per-batch go pending.
date: 2026-11-14
---

> [!INFO] Where this fits
> Sagot sa tanong ng owner: "mas maganda bang language ang gamitin para secured ang website?" Hindi — ang security ay nasa server practices, hindi sa language. Ang manual read-only code review (2026-11-14) ay nakakita ng 5 totoong butas; ang plano na ito ang mag-aayos, hindi rewrite. Isinasama nito ang [[Plan - Field Account API Allowlist]] (Checklist item 26) bilang P2. Kaugnay: [[Checklist - Delivery Missing Functions]], [[Progress - Policy Settings Admin Only]]. Ano ang nagbago: [[00 - Change Log]].

# Security hardening (5 findings, prioritized)

## 1. Buod (Tagalog)

- **Hindi kailangan mag-rewrite.** Ang HTML/JS ay ang display layer ng lahat ng website (kahit ng mga bangko). Ang Node.js stack natin ay may matibay nang pundasyon: encrypted passwords (scrypt), HttpOnly+Secure cookies, login rate limit, auth-gated lahat ng data, team scoping, 614 passing tests. Ang rewrite ay buwan ang aabutin, mataas ang risk, at kailangan PA RIN ang parehong fixes sa bagong code.
- **5 totoong butas ang nakita** (manual code review, may file/line evidence sa §3): (1) exposed legacy API key sa public repo, (2) field accounts nakakapag-access ng ibang data via API, (3) pwedeng mag-upload ng HTML/SVG na tatakbo bilang script (XSS), (4) walang size limit ang requests/uploads, (5) mahinang CSP + Tailwind mula sa CDN.
- **Desisyon ng owner:** gagawing **private** ang GitHub repo. Ang key ay i-rotate/revoke. Bawat batch ng fix ay may hiwalay na go; deploy ay hiwalay na go rin.
- **Status:** plano pa lang, hindi pa nako-code.

## 2. What is already strong (huwag sirain)

| Protection | Where |
|---|---|
| scrypt password hashing (16-byte salt, 64-byte hash), min 10 chars | `server/auth.mjs` |
| Session cookie `hc_session`: HttpOnly, Secure, SameSite=Lax; SHA-256 token storage | `server/auth.mjs`, `server/index.mjs` |
| Login rate limit: 8 attempts / 15 min per IP | `server/auth.mjs` `tooManyAttempts` |
| Forced password change; sessions cleared on password change/reset | `server/auth.mjs` |
| Lahat ng `/api/*`, `/w/`, `/uploads/` ay auth-gated (401/302 kapag walang session) | `server/index.mjs:221` |
| Path-traversal guard sa uploads at theme files | `server/index.mjs:70` `inside()` |
| Team row scoping (Service_Appointment, Field_Work) + admin-only Policy Settings | `server/access.mjs` |
| Live secrets nasa `.env` (gitignored) + Railway variables lang — **verified: ang live Geoapify key ay WALA sa kahit anong tracked file** | `.gitignore`, `.railwayignore` |

## 3. The 5 findings (evidence)

### F1 — Exposed legacy Geoapify key sa PUBLIC repo (pinaka-urgent)

- Ang repo `Yhelie08/Supply-Chain-SystemV2` ay **public** (`gh api` → `visibility: public`).
- May **legacy Geoapify API key** (Zoho-era) sa **3 tracked files**:
  1. `zoho-export/Supply_Chain_App.ds:42316` (`geoapifyKey = "…"`)
  2. `zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Geocode_Address.dg`
  3. `vault/Deluge Scripts (Obsidian)/Delivery Management/_Deluge/Deluge/dms_location_route_geocode.md`
- **Hindi ito ang live key.** Fingerprint comparison (sha256 prefix, hindi ang value): legacy `8e0009f621e5` vs live `1549d9af1615` — magkaiba. Ang live key (`GEOAPIFY_API_KEY`) ay nasa `.env` + Railway variables lang, at ginagamit ng `server/modules/delivery-management/geocode.mjs:55`. Walang widget na direktang tumatawag sa Geoapify.
- Risk: kahit legacy, pwedeng gamitin ng kahit sino ang key hangga't valid ito sa Geoapify account (quota abuse, charges). Nasa git history na ito — ang pag-rotate/revoke ang tanging paraan para ma-invalidate.

### F2 — Field account API hole (OWASP A01, broken access control)

- `server/access.mjs` `checkCall`: Policy_Settings lang ang binablock para sa non-admin. Ang field user (role user + team_name, hal. team CJ) ay nakakapag-read/write ng **lahat** ng ibang data kapag tinawag ang `/api/*` diretso.
- Nakatago lang ang menu (3 tabs), hindi nakakandado ang API. **Naitala na sa sariling docs:** [[Plan - Field Account API Allowlist]] + Checklist item 26 — sinubukan ng team: nakabasa ng Service_Request, DMS reports, nakapag-add ng Daily_Team_Availability.
- Detalyadong plano na may 14-name allowlist, TDD abuse cases, at enforcement points — awaiting go.

### F3 — Stored XSS sa /uploads/

- `server/index.mjs:232-241` (`uploadFile`): walang extension/type check — kahit anong file, tinatanggap.
- `server/index.mjs:31` (MIME map): `.html → text/html`, `.svg → image/svg+xml` (pwedeng may script ang SVG).
- `server/index.mjs:310`: ang `/uploads/` ay inihahain **same-origin** bilang webpage.
- Attack: naka-login na user → upload `evil.html`/`evil.svg` → kapag binuksan ng ibang user ang link, tatakbo ang script sa origin ng app (pwedeng kumilos bilang victim, magbasa ng data via API). Auth-gated ang uploads pero sapat na ang isang compromised o malicious na account.

### F4 — Walang request body size limit

- `server/index.mjs:37-39` (`readBody`): `chunks.push(c)` hanggang matapos — walang cap. Isang authenticated user na mag-POST ng napakalaking body ay pwedeng maubos ang memory ng server (DoS).

### F5 — Mahinang CSP + CDN scripts

- `server/index.mjs:32` (`SECURITY_HEADERS`): `frame-ancestors 'self'` lang ang CSP — walang script-src/style-src/connect-src.
- **14 widgets** ang kumukuha ng Tailwind mula `cdn.tailwindcss.com` (third-party script na tatakbo sa app — supply-chain risk; may console warnings na rin ito). **42 widgets** ang gumagamit ng Google Fonts (CSS/fonts, mas mababang risk).

## 4. The fixes (prioritized batches)

### P1 — Secret exposure (owner actions + git/docs cleanup, walang server code)

1. **I-revoke ang legacy key sa Geoapify dashboard** (owner). Ang live key (`1549…`) ay HIWALAY at hindi gagalawin — walang epekto sa live geocoding. Kung hindi ma-access ang account kung saan naka-issued ang legacy key, i-record iyon; ang revocation pa rin ang tanging full fix.
2. **Untrack ang 2 export files** (panatilihin ang local copies): `git rm --cached zoho-export/Supply_Chain_App.ds "zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Geocode_Address.dg"`. Idagdag sa `.gitignore` ang `zoho-export/**/*.ds` at ang partikular na `.dg` path (o `zoho-export/**/*.dg` kung sang-ayon ang owner na archival lang ang mga ito). Hindi maaapektuhan ang deploy — `.railwayignore` na ang nag-exclude ng `zoho-export/`.
3. **I-mask ang key sa vault note** (`dms_location_route_geocode.md`): palitan ang literal ng `"<GEOAPIFY_API_KEY — nasa .env>"`. Mananatiling tracked at useful ang note.
4. **Gawing private ang repo** (desisyon na ng owner): GitHub → Settings → Danger Zone → Change visibility, O explicit go para sa `gh api -X PATCH repos/Yhelie08/Supply-Chain-SystemV2 -f private=true`. Libre pa rin; retained ang team collaborators (Yhel, JV, Johncel); walang epekto sa Railway (`railway up` mula sa laptop, `source: null`).
5. **Trufflehog secret scan** (available skill) sa repo + git history — kumpirmahing walang ibang exposed key; i-record ang resulta dito.
6. **Huwag mag-history-rewrite** (destructive; may team na nag-pull na). Ang revocation ang nag-i-invalidate ng lumang key kahit nasa history pa. Ang pag-private ng repo ang pumipigil ng future exposure.

**Tests/verification:** `git ls-files` — wala nang key-containing files; `git grep` ng legacy key — 0 hits sa tracked files (vault note masked); trufflehog report; repo visibility = private.
**Risk:** mababa. Ang untracked exports ay archival reference lang (nasa local pa rin). Ang private repo ay hindi binabago ang deploy path.

### P2 — Field account API allowlist (hiwalay na go)

I-execute ang [[Plan - Field Account API Allowlist]] — deny-by-default, 14 names, field users lang; admins/regular users hindi gagalawin. TDD: abuse cases muna sa `tests/core/access.test.js`. Ang buong detalye (allowlist, enforcement points, tests, residual limits) ay nasa plan na iyon — hindi duplicated dito.

### P3 — Uploads XSS (server code + tests)

1. **I-check muna ang rendering:** ang widgets ay nagpapakita ng larawan via `<img src="/uploads/…">` (detail view — naitala sa Change Log, files migration entry). Ang `Content-Disposition: attachment` ay **safe sa `<img>`** (nagre-render pa rin). Kung may widget na nag-o-open ng PDF sa tab, ang attachment ay magiging download — acceptable, i-note.
2. `/uploads/` route (`index.mjs:310`): images (png/jpg/jpeg/webp) → inline pa rin; **lahat ng iba (html, svg, pdf, mp4, …) → `Content-Disposition: attachment`** + ligtas na MIME (html/svg → `application/octet-stream`). Hindi na tatakbo ang uploaded HTML/SVG bilang page.
3. `uploadFile` (`index.mjs:232`): extension allowlist batay sa MIME map (png, jpg, jpeg, webp, mp4, pdf) — tanggihan ang iba (html, svg, js, …) bago isulat.
4. **Tests:** upload .html/.svg → denied; uploaded .png → inline image pa rin; non-image na na-upload bago ang fix → served as attachment; existing photo flows (3 field tabs, QC Checklist, Evidence_Photos) hindi masisira. Full suite + UI tests.

**Risk:** mababa–katamtaman. Ang pinakamalaking risk ay may widget na umaasa sa inline non-image rendering — ang browser spot-check ang maghuhuli. Reversible: isang linya ang tanggalin para ibalik ang dating behavior.

### P4 — Body size limit (server code + tests)

1. `readBody` (`index.mjs:37`): lagyan ng cap — **~1MB para sa JSON**, **~10MB para sa uploadFile** (parameterized per route). Lumagpas → `413` na may generic message, sirain ang stream.
2. **Tests:** oversized JSON → 413; oversized upload → 413; normal requests/uploads unaffected; full suite green.

**Risk:** mababa. Ang 10MB ay higit sa sapat para sa larawan/pirma (ang pinakamalaking na-migrate ay 64KB–89KB; ang videos ay mp4, 88MB total ng 168 files — i-check ang pinakamalaking video bago i-fix ang cap, o gawing 25MB ang upload cap kung may malaking video). Reversible.

### P5 — CSP + vendor Tailwind (server code + theme asset + tests)

1. **I-vendor ang Tailwind:** i-download ang kasalukuyang CDN script (pin ang version) → `server/public/theme/vendor/tailwind.js`. Ang `applyTheme` transform (`index.mjs:55`) na ang nag-i-inject ng theme sa bawat widget HTML — dagdagan ng replace: `cdn.tailwindcss.com` → `/theme/vendor/tailwind.js`. **Walang 14 widgets na i-edit isa-isa.** (Honest note: ang Tailwind Play CDN ay hindi recommended for production ng Tailwind mismo — ang vendoring ay nag-aalis ng third-party runtime dependency ngayon; ang proper build step ay long-term optional.)
2. **Palawakin ang CSP** (`SECURITY_HEADERS`, `index.mjs:32`):
   `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`
3. **Honest limitation:** `'unsafe-inline'` ay kailangan ng ported widgets (inline scripts); ang full nonce refactor ay malaking trabaho, out of scope. Ang Google Fonts (42 widgets) ay mananatiling external pero CSP-allowed; ang self-hosting ay optional later pass (may self-hosted Overpass na ang theme).
4. **I-verify na walang widget na tumatawag sa ibang external domain** (ang Geoapify/Books/Akeneo/Shopify ay server-side). Kung may makita sa browser check, i-allowlist ang partikular na domain nang explicit.
5. **Tests:** full suite + `npm run test:ui` + browser spot-check ng bawat section — walang console CSP violations, gumagana pa ang Tailwind styles at liquid-glass theme.

**Risk:** katamtaman — ang CSP ay pwedeng mag-block ng hindi inaasahang resource. Mitigation: browser spot-check ng lahat ng sections bago i-deploy; reversible (ibalik ang lumang headers).

## 5. Optional / hiwalay na desisyon (hindi automatic)

- **Second admin** `kahit-anong-email@example.com` (unknown password, naitala sa Change Log Nov-14): reset o deactivate — owner decision.
- **HSTS** (`Strict-Transport-Security`): minor header, Railway naka-TLS na.
- **Row-level team scoping expansion + /uploads/ team gating:** naka-note sa allowlist plan §5 bilang follow-ups.
- **Google Fonts self-hosting** at **proper Tailwind build**: later passes.

## 6. Owner actions + batching

| # | Action | Sino |
|---|---|---|
| 1 | I-revoke ang legacy Geoapify key sa dashboard (fingerprint `8e00…`; ang live `1549…` ay huwag galawin) | Owner |
| 2 | Gawing private ang repo (GitHub settings, o explicit go para sa gh api) | Owner |
| 3 | Go sa P2 allowlist (14 names, nasa allowlist plan) | Owner |
| 4 | Go per batch (P1 → P2 → P3+P4 → P5), at hiwalay na go per deploy | Owner |

**Batching:** P1 (git/docs/owner actions, walang server code) → P2 (access control) → P3+P4 (uploads, parehong `index.mjs`, hiwalay na commits) → P5 (CSP/theme). Bawat batch: tests green → local commit → **owner ang nag-pu-push** → owner-approved `railway up --service supply-chain-app --environment production` → live verification. Walang seed, walang fulfillment-sync sa production.

## 7. Verification (end-to-end, pagkatapos ng lahat ng batches)

1. `npm test -- --test-concurrency=2` — 614+ tests green (kasama ang bagong abuse/upload/limit tests).
2. `npm run test:ui` — 124+ green.
3. Trufflehog: 0 bagong exposed secrets; legacy key revoked.
4. `git ls-files` + `git grep`: wala nang key sa tracked files; repo private.
5. Live headers check (`curl -I`): kumpleto ang CSP, nosniff, referrer-policy.
6. Browser spot-check (throwaway QA admin + field account, binura agad): lahat ng sections render walang CSP violations; photos render pa rin; upload ng .html → denied; field account → 403 sa denied reports, gumagana ang 3 tabs; admin/regular user unaffected.
7. Docs sync: Change Log, Checklist item 26, allowlist plan status, ang plan na ito.

## 8. Risk and reversibility

- Bawat batch ay reversible: P1 (re-track lang kung kailangan, pero ang key ay revoked na), P2 (tanggalin ang field branch), P3/P4 (ibalik ang lumang route code), P5 (ibalik ang lumang headers + CDN reference).
- Ang pinakamalaking risk ay P5 (CSP blocking) at P3 (rendering change) — parehong may browser spot-check bago ang deploy.
- Walang database write ang alinman sa mga batch na ito. Walang seed/sync. Ang deploy ay hiwalay na owner-approved step.

## 9. Critical files

- `server/index.mjs` (P3: 232-241, 310; P4: 37-39; P5: 32, 55)
- `server/access.mjs`, `server/modules/delivery-management/scoping.mjs`, `tests/core/access.test.js` (P2 — nasa allowlist plan)
- `server/public/theme/vendor/tailwind.js` (P5, new)
- `.gitignore`, `zoho-export/Supply_Chain_App.ds`, `zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Geocode_Address.dg`, `vault/Deluge Scripts (Obsidian)/Delivery Management/_Deluge/Deluge/dms_location_route_geocode.md` (P1)
- `server/modules/delivery-management/geocode.mjs` (read-only reference — live key usage)

## 10. Status

- [ ] Owner go sa plan na ito (per batch)
- [ ] P1: legacy key revoked (owner), 2 files untracked, vault note masked, repo private, trufflehog clean
- [ ] P2: allowlist implemented per [[Plan - Field Account API Allowlist]] (hiwalay na go)
- [ ] P3: uploads XSS closed + tests green
- [ ] P4: body size limits + tests green
- [ ] P5: CSP + vendored Tailwind + tests green
- [ ] Docs sync (Change Log, Checklist item 26, allowlist plan status)
- [ ] Deploy per batch (hiwalay na owner go) + live verification