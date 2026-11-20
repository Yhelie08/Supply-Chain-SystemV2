# Fulfillment vs HomeCartel Spec v1.4 — para sa review mo

Petsa: 2026-11-20. Step 7.1 ng `docs/superpowers/plans/2026-11-19-python-fulfillment-completion.md`. **Walang itinayo dahil dito**: ito ay pagbabasa lang, hindi pa ito ang pag-aayos.

## Ano ang binasa at ano ang hindi

- **Binasa nang buo:** ang 6 na dokumento sa `03 Fulfillment` (Markdown source), at para sa mga rule na tinutukoy nila: `05 Shared Engines / 01 Sorting Engine` at `05 / 04 Timestamps and Event Log`, at ang `stage_events` / `packages` na bahagi ng `01 Database`.
- **Ikinumpara sa:** ang Python code sa `app/fulfillment/*.py` (binasa ko ang sorter, pipeline, qc_routing, crate_dispatch, workflows, stage), ang form columns (`tests/fixtures/node_model.json`), at ang mga widget sa `modules/Fulfillment/` sa pamamagitan ng paghahanap ng mga salita (hindi ko binuksan ang bawat widget sa browser).
- **Hindi ko binasa:** `05 / 02 Calculators`, `05 / 05 Exceptions, Alerts`, `05 / 08 Control Panel`, `00 Overview`, `08 Design Doc`, at ang "slices 6 to 10" ni JV (wala sa repo; kailangan siyang tanungin).
- **Walang code na pinatakbo para sa review na ito** maliban sa isang maliit na check ng cut line (tingnan ang 4.2 #3).

## 1. Ang pinaka-importante

**Ang Fulfillment code (Node at Python) ay 1:1 na port ng LUMANG Zoho Creator flow, hindi pa ang v1.4 na disenyo.** Katulad ng natuklasan sa Delivery review. Mga patunay:

| Spec v1.4 | Nasa code ngayon |
|---|---|
| Stages: `waiting_items / ready / released / picking / qc / rework / crating / aggregated / dispatched` (`01 Database`) | Mga stage ng Creator: `Waiting For Package / Need Approval / Order Readiness / Picking / Pack & QC / Crate / Order Aggregation / For Delivery`. Walang "rework" na stage, walang "released" na hiwalay sa Picking |
| Mga hiwalay na table: `packages`, `package_lines`, `pick_tasks`, `qc_checks`, `rework_jobs`, `crate_jobs`, `dispatch_checks` | Mga lumang form: `Sales_Order_Fulfillment`, `Pick1`, `Checker_Checklist`, `Crate_Checklist`, `Order_Aggregation1`, `Exception_Control1`. Walang `dispatch_checks` |
| Event names: `package.created / ready / box_counted / released / picked / qc_passed / qc_rejected / rework_done / crated / aggregated / dispatched` | `package.<pangalan ng stage>`: `package.order_readiness`, `package.picking`, `package.pack_qc`, `package.order_aggregation`, `package.for_delivery`. **Iba ang mga pangalan** |
| Queue ranking sa BAWAT stage list (FS-1, FS-2, SE-5) | Ang `Category / Queue_Rank / Priority_Reason` ay binabasa lang ng Order Readiness widget. Ang Pick, Pack & QC, Crate, To Ship at Kanban widget ay **walang** nagpapakita ng rank o reason (nahanap sa paghahanap ng salita; hindi ko tiningnan kung oldest-first ang pagkakasunod nila) |

Ibig sabihin, karamihan ng nasa baba ay hindi "bug", kundi hindi pa ginagawa ang v1.4 na bersyon.

## 2. Ang Stage_Events fix kahapon (7.0) laban sa spec

Ang tamang pagbasa: **tama ang direksyon, pero hindi pa tugma sa spec ang mga detalye.**

| Spec | Ngayon | Status |
|---|---|---|
| T-1: isang stamp bawat pasok sa stage | Isa na (inayos 2026-11-20) | ✅ |
| T-2: server lang ang nagsusulat ng stamp | Oo, `Source = "system"` | ✅ |
| T-3: `occurred_at` at `reported_at` | Pareho ang dalawa (system event, kaya tama) | ✅ |
| Event names ayon sa spec (`package.released`, `package.qc_passed`...) | `package.<stage>` | ❌ **Kailangan ng desisyon** (tingnan ang Tanong 1) |
| T-6: ang ikalawang pasok sa parehong stage ay bagong row na `visit_no = 2`; hindi na-o-overwrite ang una | Ang form ay may `Visit_No` at `Occurred_Bound` columns pero **hindi ginagamit**. Pasulong lang ang galaw ng stage ngayon (`advance_stage`), kaya walang ikalawang pasok sa praktika | ⚠️ |
| Events na hindi galing sa stage change: `package.created`, `ready`, `box_counted`, `picker_assigned`, `qc_started`, `qc_passed/rejected`, `rework_started/done`, `blocked/unblocked`, `entered_queue` | Wala | ❌ |
| T-7 at ang `expected_windows` table (silence alerts, hal. released → picked sa 1 araw, rework 3 araw) | Wala | ❌ |

Dapat ding malaman: ang **Delivery Analytics #7** (`server/modules/delivery-management/ship-to-sr-gap.mjs`) ay nagbabasa ng `package.order_aggregation`. Kung papalitan natin ang mga event names ayon sa spec (hal. `package.aggregated`), kailangan ding baguhin iyon.

## 3. Packages and Box Count (`03/01`)

| Rule | Status | Tala |
|---|---|---|
| PKG-R1 package auto-create mula sa Books SO / unang received line; `waiting_items` → `ready` kapag lahat ng line ay binned | ❌ | Ang package ay ginagawa ngayon ng `create_package_ff` (Books, naka-hold). Walang "binned" check |
| PKG-R2 partial package = supervisor + reason | ❌ | Walang split |
| PKG-R3 box count: ilagay sa pick completion; hanggang doon ay "estimated" | ⚠️ | May `Box_Count`, `Box_Count_Source` (`counted`/`estimated`), ang API `package_pick_status` ay nagsasabi kung kailangan pa ng bilang, at ang sorter ay gumagamit ng sum ng quantity kapag estimated. Hindi ko nakita ang salitang "estimated" sa capacity widgets (Crate lang) |
| PKG-R4 box count ay hindi para sa sorting | ✅ | Capacity at cut line lang ang gumagamit |
| PKG-R5 replacement = sariling package na naka-link sa RR | ⚠️ | May `RR_No`; ang pre-order → Gate ay may RR sa key. Hindi ko nasuri ang buong flow |
| PKG-R6 SO changes ay dumadaloy pababa sa open packages | ❌ | Walang sync mula sa Books (naka-hold) |
| Screen "Waiting for items" na may forecast ng procurement | ❌ | Wala sa widgets |

## 4. Order Readiness at Sorting Engine (`03/02`, `05/01`)

### 4.1 Ano ang meron

Categories (`blocked → broken → late → at_risk → on_time`), sort key (order date, target, record number), cut line, mga column (`Category`, `Queue_Rank`, `Priority_Reason`, `Suggested_Release`, `Scored_At`), default target `order_date + 25 araw` kapag walang target, nightly 05:00 (tumatakbo na mula 2026-11-20 kapag `SCHEDULES=on`), event-triggered rescoring sa save ng package at ng Gate, at ang API `recalculate_fulfillment_queue`. Ang bayad na gate ay pinipigilan ang release (`needs_payment_approval`), kasama ang credit terms at ang override na may kasamang status.

### 4.2 Ano ang kulang o iba

| # | Rule | Status | Tala |
|---|---|---|---|
| 1 | OR-R1 Blocked: payment, items not physically available, **address o contact** nawawala, open exception | ✅ **2026-11-20** | Sinusuri na: payment, items (ang package na wala pang package number ay Blocked: "Items not available yet"), open exception, address, at contact number (sa package o sa Customer). Bawat block ay may pangalan ng role na dapat kumilos (`Blocked_Owner`: Sales agent, Fulfillment supervisor, Procurement / Receiving). Ang "items not physically available" ay batay sa package number lang, hindi pa sa bin/binned status |
| 2 | Broken: complaint/replacement, open RR, **failed/partial job na `damaged_in_transit` o `refused`**, Sales Return redelivery | ✅ **2026-11-20** (kailangan pang kumpirmahin ang Sales Return) | Complaint/replacement at open RR: oo na. **Failed job na `damaged_in_transit` o `refused`: ✅** (`app/fulfillment/delivery_failures.py`; binabasa ang Service_Appointment_Form ng Delivery, read-only; ang match ay ayon sa sales order lang, at ang failure ay nareresolba kapag ang redelivery nito ay `done`/`archived`; kinumpirma ng owner ang dalawang palagay na ito, 2026-11-20). **Sales Return redelivery: ✅** (parehong module; ang package ay Broken kapag ang order nito ay may Sales Return (`Sales_Returns_Form` ng Delivery, read-only) na hindi pa `credit_note_issued` o `closed`; ang match ay ayon sa sales order, gaya ng open RR; **hindi pa kinukumpirma ng owner**: kapag refund lang ang return at walang redelivery na utang, Broken pa rin ang bukas na package ng order hanggang sarado ang return) |
| 3 | OR-R3 cut line: "stops at the package that would exceed 224" | ✅ **2026-11-20** | Sinunod ang acceptance ng spec: ang listahan ay humihinto SA package na lalampas sa kapasidad, at wala nang susunod na isinasama (hindi tatalon ang mas maliit at mas bagong order sa mas matanda). Halimbawa 100+100+40+10 sa 224: ang una at ikalawa lang. **Rekomendasyon ko (wala sa spec):** kung ang pinakaunang package lang ay mas malaki sa buong kapasidad, isasama pa rin ito nang mag-isa para hindi ito ma-stuck magpakailanman; kapag zero na ang libreng kapasidad, wala nang isasama |
| 3b | SE-5 / spec §2: ang **category** ang nag-uuri ng listahan (broken, late, at risk, on time); sa loob ng category, urgent muna, saka order date; ang Blocked ay wala sa work list | ✅ **2026-11-20** (ito ay pagbabago sa dating asal) | Dati, **order date lang** ang pag-uuri (hindi kasama ang category), kaya ang lumang on-time na order ay nauuna sa mas bagong late. Ngayon ayon na sa spec. Ang Blocked ay inilalagay pagkatapos ng work list at hindi kailanman nasusuhestiyon. Kailangan mong kumpirmahin (Tanong 7) |
| 4 | Slack = target − today − **work days na kailangan pa** (calculators); `at_risk` kapag ≤ 3 araw | ✅ **2026-11-20** | Slack = araw hanggang target − (`fulfillment_days` 3 kung nasa warehouse pa ang package + `delivery_days` 2), ang mga numero ng Calculators; ang mga setting ay binabasa mula sa Policy_Settings. Ang Late ay "lumampas na ang target" pa rin. Mga araw ng kalendaryo (walang weekends). Ang `fulfillment_days` / `delivery_days` ay nasa Procurement settings din; dalawang lugar ang pinagkukunan hanggang may iisang Control Panel |
| 5 | `sort_primary_key` setting (`order_date` o `target_delivery`) | ✅ **2026-11-20** | Binabasa mula sa `Policy_Settings`. Ang `aging_*` at `urgency_warning_pct` ay binabasa na rin. Hindi pa binabasa ang `assign_batch_boxes` (pang-Pick ito) |
| 6 | Manual urgency (MU-1 hanggang MU-6): `urgent` | ✅ **2026-11-20** | Bagong form `Urgency_Requests` (`app/fulfillment/urgency.py`): kailangan ng pangalan at dahilan; ang pag-approve ay kailangan ng pangalan ng approver at nagse-set ng expiry (target date, o 14 araw); hindi pwedeng ibaba o i-delete ang approved; mauuna lang sa sarili nitong category; babala kapag lampas 5% ang urgent. Ang "supervisor ang nag-a-approve" ay pangalan lang na isusulat, hindi login check (roles ay naka-hold). Wala pang screen para gumawa ng request |
| 7 | `suggested_action` mula sa `suggested_actions` lookup | ✅ **2026-11-20** | Bagong form `Suggested_Actions` (Admin ang mag-e-edit) na may built-in defaults na ang 3 halimbawa lang ng spec (Release today; Add crew or release over capacity; Chase payment with sales agent). Blangko ang iba, hindi ako nag-imbento |
| 8 | OR-R7 / Sorting §5 aging guard (7 / 14 / 21 araw sa parehong stage; exception sa 14; Admin sa 21) | ✅ **2026-11-20** | `Aging_Days` at `Aging_Level` sa package; sa 14 araw: isang row sa pangkalahatang `Exceptions` form (Source_Module "Fulfillment EXC", Assigned_Department "Fulfillment", Priority Medium, hindi nagba-block sa package) at isang notification sa supervisor; sa 21 araw: ang parehong exception ay nagiging High at may notification sa Admin; awtomatikong nagsasara ang exception kapag umusad ang package. Ang walang stamp ay binibilang mula sa import date |
| 9 | Sorting §6: re-score sa **anumang material event** (stage change, payment, target change, exception opened/closed, urgency, schedule change) | ⚠️ **2026-11-20** | Idinagdag: stage change (`set_stage`, isang beses lang sa catch-up sweep), exception opened/closed, urgency saved. Dati: save ng package at Gate. **Wala pa:** pagbabago ng target mula sa Books/Delivery (Delivery module, naka-hold ang Books) |
| 10 | Stale banner kapag `scored_at` > 26 oras; `job_runs` row | ✅ **2026-11-20** | Bagong API `ranking_status` at pulang banner sa Order Readiness widget; bagong form `Job_Runs` na may row para sa nightly at manual na takbo (ok o failed na may error). Ang re-score pagkatapos ng isang save ay walang row (sinasadya) |
| 11 | "Today's release" screen: Release selected, Release all suggested, Recalculate; capacity bar (people, boxes/hour); "over capacity by N boxes"; crew sizing | ⚠️ **2026-11-20** | Nasa Order Readiness widget na: Recalculate button; sa capacity bar: boxes in progress, libre ngayon, suggested, backlog days, "Over capacity by N boxes", at crew sizing ("to clear Late + About to be late ... you need X people (you have P)"). **Release selected / Release all suggested: GINAWA na (2026-11-20, custom API `release_gate_records` + mga button sa Order Readiness; sinubukan sa browser).** Isang picker lang ang tinatanong, at pinupunan lang nito ang mga item na walang picker. Hindi pa ginagawa: ang "Release all" na may kanya-kanyang picker bawat row sa isang dialog. Nakita na ang widget sa browser (capacity bar, Recalculate, stale banner, bulk release). |
| 12 | OR-R4 release ay "supervisor lang" at nag-i-stamp ng `package.released` | ⚠️ | Ang Release ay checkbox sa Gate record (`Release`). Walang check sa role (roles ay naka-hold) at walang hiwalay na `released` event |
| 13 | OR-R5 payment override: pangalan ng approver at dahilan | ⚠️ | May `Override_Approved` at `Override_Approved_For_Status`. Hindi ko nasuri kung may approver at reason na naka-save |
| 14 | OR-R6 notifications bawat state (late → supervisor **at** sales agent; blocked → owner by name) | ⚠️ **2026-11-20** | Nagpapadala na kapag **nagbago** ang category: naging Late (supervisor at sales agent) at naging Blocked (ang owner ayon sa pangalan ng role); walang ipinapadala sa unang scoring (go-live). **Wala pa:** ang About to be late (morning list ng supervisor; hindi pa naitatayo ang morning list) at ang tunay na pagpapadala sa sales agent (walang field ng agent sa package; ang Recipient ay ang inbox ng Fulfillment) |
| 15 | OR-R8 credit check (credit terms lang muna) | ✅ | `Has_Credit_Terms` ay ginagamit sa gate |

## 5. Pick, QC, Rework, Crate (`03/03`)

| Rule | Status | Tala |
|---|---|---|
| FS-1 / FS-2 / SE-5 parehong ranking at rank + reason sa bawat stage list | ❌ | Tingnan ang §1 |
| FS-3 Exception action sa bawat row; ang open exception ay humahawak sa package | ✅ **2026-11-20** (bahagi) | May Exception Control at Exception_Control1. Ang open exception ay nagbo-block sa sorter, at ngayon ay tinatanggihan din ng server ang **Mark as Picked**, **Crating Done** at **Dispatch Selected** (`app/fulfillment/exception_hold.py`). **Hindi** kasama ang QC Approved: sinira nito ang split ng QC (ang mga pumasang unit ay hindi na makakausad), kaya inalis. Hindi pa nasubukan sa browser |
| PK-R1 suggest ng picker (pinakakaunting trabaho, batch `assign_batch_boxes`) | ❌ | May `Assign_Picker` field lang |
| PK-R3 pick completion ay humihingi ng box count at nagpapadala sa QC | ⚠️ | May `package_pick_status` API; ang widget ay hindi ko nasuri |
| QC-R1 checklist template bawat item category | ❌ | Mga nakapirming field (`Fixture_Body_Checklist`, `LED_Checklist`, `Kelvin`...) |
| **QC-R2 Approved ay nangangailangan ng: lahat ng checklist line, ≥1 photo, signature** | ✅ **2026-11-20 (mandatory na)** | `app/fulfillment/mandatory.py`: ang server ay tumatanggi kung wala ang photo, ang signature, o kung may grupo ng checklist (Fixture Body, LED, Uniformity) na walang naka-tick (pinili ng owner: bawat grupo ay may kahit isa). Pareho ang check sa widget bago mag-send. Hindi pa napatunayan sa totoong browser |
| QC-R3 Rejected: dahilan + photos, gumagawa ng exception, pipili ang checker (rework, replace/RR, return to pick) | ⚠️ | Ang Rejected ay gumagawa ng Exception_Control1 bawat rejected unit (tama). ✅ 2026-11-20: ang server ay humihingi na ng dahilan (Remarks) at ≥1 photo. Wala pa ring "return to pick" na pagpipilian |
| QC-R4 Approved → Crate kung `for_crate`, kung hindi → Order Aggregation | ✅ | `qc_routing.py` |
| QC-R5 ikalawang QC pagkatapos ng rework = visit 2; pareho ay itinatago | ⚠️ | Ang QC record ay hindi nao-overwrite (may re-check path), pero walang `visit_no` |
| RW-R1 hanggang R5 (rework job, ranking, balik sa QC, rework rate, silence alert 3 araw) | ❌ | Walang hiwalay na rework job; ang Exception Control ang pumapalit. Ang "balik sa QC" ay ginagawa ng `exception_recheck.py` (✅ ang bahaging iyon). Walang rework rate at silence alert |
| CR-R1 `for_crate` mula sa item flags o supervisor | ⚠️ | May `For_Crate` field. Walang "fragile" na flag sa item |
| **CR-R2 Crate Done nangangailangan ng checklist + ≥1 photo + timbang (kg) at sukat (cm)** | ✅ **2026-11-20 (mandatory na)** | Bagong columns `Crate_Weight_Kg` at `Crate_Dimensions_Cm` (`server/spec-forms/Crate_Checklist.json`), may input sa Crate widget, at ang server ay tumatanggi sa Done kung kulang ang checklist (≥1 naka-tick), photo, timbang (>0) o sukat. Hindi pa napatunayan sa totoong browser |
| CR-R3 isa lang ang bawat status at checklist | ⚠️ | Hindi ko nasuri |
| CR-R4 box count ay ina-update kung nagbago dahil sa crating | ✅ | Itinama ko ang unang sulat ko: ang Crate widget ay may Box Count na input at sumusulat sa package (`Box_Count_Source = counted`). Wala sa server code, nasa widget |

## 6. Order Aggregation at Pre-Delivery Gate (`03/04`)

| Rule | Status | Tala |
|---|---|---|
| OA-R1 grouped by delivery job / date | ❌ | Hindi ko nakita |
| OA-R2 "Aggregated" ay kumpirmasyon ng lahat ng box | ⚠️ | Ang "Dispatch Selected" ay checkbox sa To Ship (`dispatch_stage`: checked → For Delivery). Walang hiwalay na Aggregated step |
| OA-R3 ang Service Request ay ginagawa kapag pumasa sa QC (SR-R1) | ⚠️ | Nasa Delivery module (Node) ito, hindi sa Fulfillment |
| OA-R4 alert kapag naghihintay nang higit sa `aggregation_wait_days` (2) nang walang job | ❌ | Wala |
| Gate G1 hanggang G9, GT-R1 hanggang GT-R5 | ⚠️ | Hindi sa Fulfillment ang gate: ang G1, G3, G5 ay nasa Delivery (Node, 2026-11-19, tingnan ang Change Log). Wala pang `dispatch_checks` table, G2, G4, G6, G7, G8 at GT-R3 (naka-save na bawat gate run) na nakita ko. May lumang form na `Dispatch_Checklist` na hindi ko nasuri. **Kailangang pagpasyahan kung sa Fulfillment o Delivery ito ilalagay sa Python** |
| `package.aggregated`, `package.dispatched`, `dispatch_check.failed` | ❌ | Tingnan ang §2 |

## 7. Warehouse Request at Transfer (`03/05`)

| Rule | Status | Tala |
|---|---|---|
| Warehouse Request: Type, Assigned to, Status `Requested → Assigned → Done / Cannot do`, ranking, silence alert 24 oras, notification sa requester | ❌ | Ang form ay umiiral (`Warehouse_Request`). Ang tanging code ay ang pagkopya ng item image (`_item_images`) |
| TR-R1 hanggang R4 Transfer: Sent at Received (may signature), exception kapag may kulang, Books transfer order | ❌ | May `Transfer_Warehouse` form. Walang Sent/Received stamps o exception. Ang Books ay naka-hold |

## 8. Kanban, Scoreboard, SO Report (`03/06`)

| Rule | Status | Tala |
|---|---|---|
| Kanban columns Ready → Released → Pick → QC → Rework → Crate → Aggregated → Dispatched, kulay ng category, urgent marker, rank order | ❌ | May Kanban widget na lumang bersyon; hindi nito ginagamit ang Category o Queue_Rank |
| Scoreboard numbers (boxes out, boxes/person/hour, capacity used, backlog days, rework rate, time in stage (median), received → pick gap, on-time dispatch) | ⚠️ | May Fulfillment Dashboard (Scoreboard) na may mga seksyong "Quality" at "Team". ✅ **2026-11-20: time in stage (median)** ay nasa Dashboard na (card na "Time in Stage"; binabasa ang Stage_Events sa pamamagitan ng API na `stage_time_report`; hindi pa nakikita sa browser). Wala pa ang iba: boxes out, boxes/person/hour, capacity used, rework rate, received → pick gap, on-time dispatch |
| SO Report: isang row bawat SO, furthest-behind stage, sales agent ay nakakakita ng sarili nilang customers lang, walang costs | ⚠️ | May Sales Order Report widget. Ang pagtatago ng costs at ang paghihigpit sa sales agent ay roles, na naka-hold |

## 9. Buod ng mga puwang, ayon sa laki

1. ~~**Mga rule na walang server check** (QC-R2, CR-R2, QC-R3)~~ **Tapos na 2026-11-20** (ginawang mandatory ayon sa owner; tingnan ang Change Log).
2. **Sorting engine (§4.2)**: contact check, slack na may work days, `sort_primary_key`, urgency (M1), suggested_action, aging guard, stale banner, rescore sa mas maraming events.
3. **Event log**: pangalan ng mga event ayon sa spec, `visit_no`, `expected_windows` + silence alerts.
4. **Rework job** bilang sariling bagay (RW-R1 hanggang R5) at ang rework rate.
5. **Pre-Delivery Gate** (G1 hanggang G9, `dispatch_checks`): kailangan munang magpasya kung Fulfillment o Delivery.
6. **Ranking sa lahat ng stage screen at Kanban**; Today's release screen na buo.
7. **Warehouse Request at Transfer** workflows.
8. Mga nakadepende sa Books o roles (naka-hold): PKG-R1/R6, TR-R3, OR-R6 (kalahati), at ang mga paghihigpit ayon sa role.

## 10. Mga tanong para sa iyo

1. **Mga pangalan ng event (7.0):** gagamitin natin ang mga pangalan ng spec (`package.released`, `package.qc_passed`, `package.aggregated`, `package.dispatched`...) o iiwan ang `package.<stage>`? Kapag spec ang pipiliin, kailangan ding baguhin ang Delivery Analytics #7 na nagbabasa ng `package.order_aggregation`, at ang mga stage name mismo ay magkakaiba sa spec.
2. ~~**Cut line:**~~ **Sinagot 2026-11-20 (sinunod ang file):** hihinto sa package na lalampas; tingnan ang §4.2 #3. **Cut line:** ang package na tumatawid sa kapasidad (halimbawa 40 box na magdadala ng kabuuan sa 240 kapag 224 ang kapasidad) ay isasama o hindi? Ang code ay nagsasama; ang acceptance line ng spec ("stops at the package that would exceed 224") ay mukhang hindi.
3. ~~**Aling stage ang tinatawag na "WIP"?**~~ **Sinagot 2026-11-20:** Picking, Pack & QC at Crate lang (ang Order Aggregation ay tapos na ang trabaho). **Aling stage ang tinatawag na "WIP"?** Binibilang ng code ang Picking hanggang Order Aggregation bilang gumagamit ng kapasidad; ang spec ay "released and not yet aggregated".
4. **Pre-Delivery Gate:** sa Fulfillment o sa Delivery ilalagay ang G2, G4, G6, G7, G8 at `dispatch_checks`? (Ang G1, G3, G5 ay nasa Delivery na.)
5. **Slices 6 hanggang 10 ni JV:** hindi ko pa nakikita ang listahan; kailangan siyang tanungin.
6. ~~**Aging sa 14 araw:**~~ **Sinagot 2026-11-20:** gumawa ng Exceptions row (hindi nagba-block) at notification. **Aging sa 14 araw:** "exception created" ayon sa spec. Notification lang ang ginawa ko (tingnan ang §4.2 #8). Gusto mo bang gumawa ng row sa pangkalahatang `Exceptions` form (kailangang idagdag ang mga halaga ng Fulfillment sa mga picklist nito), o sapat na ang notification at ang level sa row?
7. ~~**Ranking ayon sa category**~~ **Sinagot 2026-11-20:** ayon sa spec (category muna) at slack = araw − (3 + 2). **Ranking ayon sa category** (§4.2 #3b): kumpirmahin na tama ito. Ang slack na may "work days na kailangan pa" (§4.2 #4) ay hindi ko ginalaw dahil hindi malinaw sa Calculators kung ilang araw ang gagamitin bawat package; ano ang gusto mo (halimbawa `fulfillment_days` + `delivery_days` = 5 araw)?

## 11. Mungkahing pagkakasunod (hindi pa sinisimulan, hintayin ang iyong pasya)

1. ~~Ang mga server check ng QC-R2, QC-R3 at CR-R2~~ (tapos na 2026-11-20).
2. Ang mga maliliit na ayos sa sorter: contact check, slack na may work days, rescore pagkatapos ng `set_stage` at pagbubukas ng exception, at ang desisyon sa cut line.
3. Event names at `visit_no` ayon sa desisyon sa Tanong 1; pagkatapos, `expected_windows` at aging guard.
4. Rework job, urgency (M1), suggested_actions, stale banner.
5. Ang gate at ang mga screen: ayon sa Tanong 4.

Bawat isa ay: maikling design note → test muna → code → isang commit, ayon sa plano (7.3).
