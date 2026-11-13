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

1. **Per item** — write your answer in the "Sagot" column.
2. **Default lahat** — reply "default lahat" and I will use every default below.
3. **Unknown** — write "hindi ko alam" and it becomes a tracked blocker, not a guess.

---

# A. Flow/build decisions — needed before editing the flow

| # | Tanong | Bakit nakakaapekto sa build | Default | Sagot |
|---|---|---|---|---|
| **A1** | Scope ng "off Zoho Creator": (A) wala nang Delivery data/logic sa Creator, pero OK ang CMS + Books bilang external; o (B) tanggalin lahat ng Zoho? | Kung B, kailangan ng CMS rebuild at Books replacement — malaking bagong work | **A** | |
| **A2** | Schedule Requests hanggang wala ang CMS route: ipakita ang DB records (read-only), o itago ang tab? | Binabago ang UI at UAT coverage | **DB-only + banner** | **Sinagot 2026-11-13:** gagawa ang team ng API na tatanggap ng lahat ng papasok sa cloud web (ang daan ng CMS). Hanggang doon: DB-only + banner. |
| **A3** | `DMS_Site_Confirmation_Fol`: ipoport o skip? | Kung port, kailangan ng email service + bagong schedule + tests | **Skip; document manual follow-up** | **Hinihintay:** lilinawin pa ng team kung lalagyan ng email at SMS ang API. Hindi muna isasama (parehong inactive sa Zoho; email lang ang ginamit noon, naka-pause ang SMS). |
| **A4** | Policy Settings: visible sa menu, admin-only, o hidden? | Binabago ang menu at permissions | **Admin-only** | **Sinagot 2026-11-13:** admin lang ang may access. |
| **A5** | Roles basis: Zoho profiles (`DMS_Full_Edit`, etc.) o ang draft na Scheduler/Dispatcher/Field team? | Binabago ang access matrix at auth work | **Map Zoho profiles → 3 roles muna** | **Sinagot 2026-11-13:** tatlong role lang ang may access (scheduler, dispatcher, field team: installer at driver). Ang per-role access ay core feature na hindi pa nagagawa. |
| **A6** | Widget/UI ownership: ikaw ba ang mag-aayos ng 13 tabs, o backend lang? | Kung backend lang, kailangan i-assign ang UI fixes | **Ikaw: UI + backend** | |
| **A7** | Concurrency lock: dagdagan ba ng advisory lock/transaction ang scheduling writes? | Dalawang dispatcher, sabay confirm — pwedeng pareho mag-save | **Oo** | **Sinagot 2026-11-13: oo.** Nagawa: pila (`locks.mjs`) sa scheduling, may test. |
| **A8** | Idempotency guard: dagdagan ba ang `confirm_dms_schedule_request`? | Walang guard ngayon — double-click = dalawang appointment | **Oo** (shipment/return may guard na) | **Sinagot 2026-11-13:** isang beses lang. Nagawa: refused ang pangalawang confirm, may test. |
| **A9** | CMS/Books failure handling: error lang, o retry queue? | Binabago ang error UX at backend | **Error + manual retry** (no queue for v1) | **Sinagot 2026-11-13:** magpakita ng error (manual retry). Ganito na ang takbo. |
| **A10** | Data contract: sino ang pipirma, at sino ang mag-aayos ng Delivery kung may mag-rename ng shared field? | Schema drift ang pinakamalaking integration risk | **Core owner signs; shared-field change = PR + Delivery tests** | |

---

# B. Integration at credentials — needed before live testing

| # | Tanong | Bakit kailangan | Default | Sagot |
|---|---|---|---|---|
| **B1** | Production export: sino, kailan, at confirmed ba ang read-only access? | Development data ay test data lang — 5 appointments | **Owner: this week** | |
| **B2** | Books OAuth client: sino ang may-ari at kailan? | Hindi pa live-test ang shipment/return | **Owner: before UAT step 10** | |
| **B3** | Geoapify key: sino at kailan? | Geocoding returns "not configured" | **Owner: before UAT** | |
| **B4** | CMS URLs + API key: sino, kailan, at active pa ba ang CMS? | Push at inbound route | **Owner + CMS owner** | |
| **B5** | CMS inbound route: sino ang magsusulat (core PR), at kailan? Fallback kung ma-delay? | Walang caller ang dalawang integration functions | **Core PR; fallback = A2** | |
| **B6** | Files: ilang GB, kasya ba sa volume, sino ang magda-download at magba-backup? | Lumang records ay Zoho paths pa rin | **Owner/core: one-time download + volume backup** | |
| **B7** | Railway env: sino ang magse-set ng `BACKEND=pg`, `DATABASE_URL`, `TZ`, `SCHEDULES`, keys? | Default ay `BACKEND=zoho` — hindi standalone | **Owner/core** | |

---

# C. Operations at go-live — needed before deploying

| # | Tanong | Bakit kailangan | Default | Sagot |
|---|---|---|---|---|
| **C1** | Rollback: kaya bang bumalik sa Zoho? Gaano katagal? Sino ang magde-desisyon? | Kung walang rollback, risky ang cutover | **Keep Zoho read-only for 30 days; owner decides** | |
| **C2** | Zoho after go-live: read-only, frozen, o delete? | Nakakaapekto sa rollback at audit | **Read-only, 30 days, then review** | |
| **C3** | Backup/restore: sino at gaano kadalas para sa Postgres + volume? | Walang automatic backup ang Railway volume | **Daily DB + weekly volume snapshot** | |
| **C4** | Monitoring: sapat na ba ang `/healthz` + logs, o may alerting? | Walang alert kapag failing ang hooks | **At least error log review + daily check** | |
| **C5** | `SCHEDULES=on` sa production? | Kailangan ng `Forecast_Stamp_Daily` para sa delivery forecasts | **Oo, at i-verify ang first run** | |
| **C6** | `TZ=Asia/Manila` — set na ba sa Railway? | Kung hindi, mali ang "today" ng engine | **I-confirm bago UAT** | |
| **C7** | Repo private + key rotation: kailan, bago mag-invite? | Public repo + keys sa git history | **Bago mag-invite ng kahit sino** | |
| **C8** | Flaky procurement test: ayusin ngayon o watch? | Minsang bumagsak sa full run | **Watch; huwag munang gastusan** | |
| **C9** | Migration verification: row counts + spot checks; sino ang pipirma? | Hindi sapat ang "imported" lang | **Owner signs after spot-check** | |

---

# D. Acceptance at sign-off — before calling it done

| # | Tanong | Bakit kailangan | Default | Sagot |
|---|---|---|---|---|
| **D1** | Clock divergence: pipirmahan ba ang decision record? | Ito lang ang intentional difference sa Zoho | **Keep fix; sign [[Decision - Delivery Clock Divergence]]** | **Hindi pa sinasagot.** Simpleng paliwanag sa seksyon H. |
| **D2** | "Same talaga" definition: OK ba ang 8 acceptance criteria? | Para walang pagtatalo sa dulo | **Oo** | |
| **D3** | UAT participants: sino, kailan, sino ang pipirma? | Owner muna, tapos staff day | **Owner + 1 staff day; owner signs** | |
| **D4** | Reviewer/CODEOWNERS: sino ang magre-review? | Walang gate ngayon | **Core owner + module owner** | |
| **D5** | Verification after cutover: keep Development alive? Snapshot? Gaano katagal? | Para may comparison pagkatapos | **Keep Development 30 days** | |

---

# E. Nasagot na — hindi mo na kailangang sagutin

| Tanong | Sagot |
|---|---|
| Naka-preserve ba ang Zoho IDs? | **Oo** — `server/pg/import.mjs` keeps every ID |
| Naka-preserve ba ang ID order? | **Oo** — queries use `ORDER BY ID` |
| Nagre-retrigger ba ang scripted insert ng hooks? | **Hindi** — hook writes bypass hooks (`createHookedStore`) |
| May schedules ba ang Delivery? | **Wala** — forecast schedules ay nasa Fulfillment (`SCHEDULES=on`) |
| Active ba ang `DMS_Site_Confirmation_Fol`? | **Hindi** — inactive sa `.ds` |
| Existing ba ang CMS URLs? | **Oo** — nasa Deluge (public key); new app ay env-gated |
| Binabasa ba ang Books sa confirm? | **Oo** — shipping address + line items |
| May UI tests ba ang 13 widgets? | **Wala** — React prototype lang ang may render test |
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

Or simply: **"default lahat"** — I will use every default above and only stop if an answer changes the code materially.

---

# H. Simpleng paliwanag (para sa hindi techy)

Ito ang parehong mga tanong sa itaas, sa pang-araw-araw na salita. Idinagdag 2026-11-13.

## D1: ang "clock divergence", sa simpleng salita

**Ang sitwasyon.** May dalawang team (halimbawa CJ at John Dave). Ang CJ ay may trabaho na sa umaga (2 oras). May bagong order na kailangang bigyan ng oras.

**Ang ginagawa ng Zoho ngayon.** Kapag may trabaho na ang team sa araw na iyon, **walang oras na ibinibigay ang Zoho**. Walang lalabas na suggestion at hindi sinasabi kung bakit. Ang sanhi: nagkukuwenta ito ng oras na may decimal ("10.3") at hindi iyon tinatanggap na oras, kaya nabibigo ang buong script. Gumagana lang ito kapag nagkataong buong oras ang kinalabasan.

**Ang ginagawa ng bagong app.** Nagbibigay ito ng oras na kasunod ng trabaho: 8:00 AM + 2.30 oras = **10:18 AM**.

**Ang tanong.** Ito ang **tanging bagay na sinadya nating hindi kopyahin sa Zoho**. Papayag ka bang manatili ang pagwawasto?

| Pagpipilian | Ang mangyayari |
|---|---|
| **Manatili ang pagwawasto (inirerekomenda)** | Laging may suggestion ang bawat order, tulad ng inaasahan ng staff |
| **Kopyahin ang Zoho** | Kapag may trabaho na ang team, walang lalabas na suggestion, at kailangang mano-manong ayusin ng staff |

Ang desisyon ay nakasulat sa [[Decision - Delivery Clock Divergence]]; kapag pumayag ka, pipirmahan ito.

## Ang walong tanong na para sa iyo

| # | Paksa | Ang ibig sabihin | Inirerekomenda | Sagot |
|---|---|---|---|---|
| 1 | Tab na Schedule Requests (A2) | Hindi pa makakapasok sa bagong app ang mga request ng CMS | Ipakita ang tab na may paalalang "wala pang koneksyon sa CMS" | Gagawa ang team ng API na tatanggap ng lahat ng papasok sa cloud web |
| 2 | Follow-up na email sa customer (A3) | Isang lumang schedule na hindi na aktibo sa Zoho | Huwag munang isama | Lilinawin ng team kung may email at SMS ang API |
| 3 | Sino ang makakakita ng Policy Settings (A4) | Dito nakalagay ang mga numero ng pag-schedule | Admin lang | Admin lang |
| 4 | Mga role (A5) | Scheduler, dispatcher, field team (installer at driver) | Kumpirmahin sa team | Ang tatlong role lang ang may access |
| 5 | Dobleng click (A8) | Dalawang appointment ang nagagawa ng dobleng click sa Confirm | Ayusin: isang beses lang | Isang beses lang (**nagawa**) |
| 6 | Dalawang dispatcher, sabay (A7) | Pareho silang makakapag-save ng parehong slot | Ayusin | Oo (**nagawa**) |
| 7 | Kapag nag-fail ang CMS o Books (A9) | Ano ang mangyayari | Magpakita ng error, manual na retry | Magpakita ng error |
| 8 | Ang clock divergence (D1) | Tingnan ang paliwanag sa itaas | Manatili ang pagwawasto | **Hinihintay** |

## Ang dalawang "butas" na inayos (2026-11-13)

1. **Dobleng click sa Confirm:** dati, dalawang click = dalawang appointment. Ngayon, tinatanggihan ang pangalawa ("Already confirmed…"), kahit tatlong click nang sabay.
2. **Dalawang dispatcher, parehong oras:** dati, parehong makakakuha ng parehong slot. Ngayon, pinipila ang pag-schedule nang isa-isa, kaya ang pangalawa ay makikita ang nauna at makakatanggap ng "Calendar Conflict".

Nasa branch `feature/delivery-safety`, may test, at ang pagkakabigo ng dalawang test kapag tinanggal ang pila ang patunay na totoo ang problema.
