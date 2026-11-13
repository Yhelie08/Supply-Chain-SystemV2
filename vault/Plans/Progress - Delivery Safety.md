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

## Sandali lang: ano ang branch na ito?

- Branch: `feature/delivery-safety`
- Naka-push, **wala pang PR**
- **367 sa 367 tests ang pumasa** (ayon sa run mo)
- Isang commit: `5dac5fb` — "confirm once, and queue the scheduling work"
- May **9 na bagong tests** sa `tests/delivery-management/safety.test.js`

## Ano ang nagawa

### #5 — Isang confirm lang

**Dati:** kapag na-click ang Confirm nang dalawang beses, **dalawang appointment** ang nagagawa. Parang dalawang beses mong pinindot ang "Order" sa online shop — dalawang order ang dumating.

**Ngayon:** ang pangalawang confirm ay tinatanggihan:

> "Already confirmed — Service Appointment ... was already created."

Kahit **tatlong click nang sabay**, isang appointment lang ang magagawa.

**Importante:** ito ay **sadyang kaibahan sa Zoho**. Sa Zoho, double click = two appointments. Napagkasunduan na ito.

### #6 — Walang dalawang tao sa isang slot

**Dati:** dalawang dispatcher, sabay confirm ng parehong oras. Pareho silang nakakakita ng "bakante," pareho silang nag-save. Nagkakaproblema pagkatapos.

**Ngayon:** parang **pila sa tindahan** — isa-isa lang. Ang pangalawa ay makakakita ng nauna at makakatanggap ng **Calendar Conflict**.

**Patunay:** may **dalawang test na bumabagsak kapag tinanggal ang pila**, at pumapasa kapag nandiyan. Ibig sabihin, totoong problema ito noon — hindi hula.

**Limitasyon:** gumagana ang pila **sa isang server lang**. Kung magkaroon ng maraming server instances, kailangan ng database lock. Nakasulat ito sa `locks.mjs` at sa Change Log.

### #7 — Error messages

Kapag pumalya ang CMS o Books, **may error message na** noon pa. Walang binago.

## Ano ang hindi pa kaya ngayon

| # | Ano | Bakit hindi pa |
|---|---|---|
| #3 | Policy Settings — admin lang | Wala pang per-role access ang buong app; core work ito |
| #4 | Tatlong roles (Scheduler, Dispatcher, Field team) | Parehong dahilan; core work ito |

Nakasulat na ang mga sagot sa [[Clarifications - Delivery Management]] para hindi makalimutan.

## #8 — Ang oras (clock)

**Simpleng paliwanag:**

- May team na may **2 oras nang trabaho** sa araw na iyon.
- May bagong order.
- Sa **Zoho**: hindi nagbibigay ng oras. Walang suggestion, walang paliwanag. **Bug ito.**
- Sa **bagong app**: nagbibigay ng **10:18 AM**, kasunod ng trabaho.

**Tanong:** panatilihin ba ang fix, o gayahin ang Zoho (walang lalabas)?

**Recommendation:** panatilihin ang fix. Walang customer o dispatcher ang gustong order na walang oras.

Nasa [[Decision - Delivery Clock Divergence]] ang buong detalye at signature block.

## Ano pa ang kulang (simple na listahan)

### Mga desisyong hindi pa nasagot

- **Scope:** mananatili ba ang CMS at Books? (A1)
- **Schedule Requests:** ipakita ba muna ang records, o itago? (A2)
- **Site confirmation follow-up:** ipoport ba o skip? (A3)
- **Widget/UI:** ikaw ba ang mag-aayos ng 13 tabs? (A6)
- **Data contract:** sino ang pipirma? (A10)

### Mga access at keys

- Production data (export)
- Books OAuth client
- Geoapify key
- CMS URLs at API key
- Railway settings (`BACKEND=pg`, `TZ`, atbp.)
- Files (ilang GB, saan ilalagay, backup)

### Bago mag-go-live

- Rollback plan
- Backup ng database at files
- Monitoring at alerts
- Time zone
- Private repo at key rotation
- Reviewer
- UAT ng owner at staff

### Acceptance

- Pirmahan ang clock decision (#8)
- UAT click-through ng 13 tabs
- Sign-off

## Ano ang susunod (sunod-sunod)

1. **Desisyunan ang #8** (clock) — pirmahan ang decision file.
2. **Sagutin ang natitirang tanong** sa Clarifications (A1, A2, A3, A6, A10 muna).
3. **I-open ang PR** para sa `feature/delivery-safety`.
4. **UAT** — owner muna, tapos staff.
5. **Go-live checklist** — keys, data, files, deployment, backup.

## Mga file

- [[Clarifications - Delivery Management]]
- [[Decision - Delivery Clock Divergence]]
- [[Plan - Delivery Management]]
- [[Plan - Delivery Management Open Items]]
