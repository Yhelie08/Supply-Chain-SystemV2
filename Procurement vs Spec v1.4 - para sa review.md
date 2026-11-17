# Procurement vs HomeCartel Spec v1.4 — para sa review mo

> **Hindi pa ito naa-apply.** Walang binago sa code. Review document lang ito: binasa ko ang spec, tiningnan ko ang current Procurement sa repo, at nilista ko ang **contradictions**, **kulang na features**, **kulang na fields**, at **recommended solution** (laging base sa spec na ibinigay mo).
>
> Pinagkunan (spec): `02 Procurement` (8 docs: Inquiry, PR & Pricing, PO & Feasibility Gate, Ship & Track, Receiving, Exceptions & Replacement, Supplier Portal, Dashboard) + `05 Shared Engines` (01 Sorting, 03 Dates & Forecast, 04 Timestamps & Event Log). Para sa context, binasa ko rin ang `01 Database`, `05/02 Calculators`, `00/02 Decision Log`, `00/03 Defaults`, `00/04 Build Phases`.
> Binasa ko ang **Markdown source** ng bawat PDF (parehong content, mas madaling i-quote ang rule numbers).
>
> Pinagkunan (current): `server/modules/procurement/*`, `server/forecast/*`, `modules/Procurement/*` (widgets), `modules/Tony Fan`, `modules/Fenteng Lighting`, `zoho-export/parsed/forms/*` (fields), `vault/Plans/Plan - Finish Procurement.md`.
>
> **Legend:** ✅ OK (sumusunod sa spec) · ⚠️ Partial (meron pero kulang/iba) · ❌ Missing (wala) · 🔴 Conflict (kabaligtaran ng spec) · ❔ Not verified (hindi ko na-check sa code)

---

## 1. Buod (isang tingin)

**Tama ang hinala mo: kulang pa ang Procurement kumpara sa document.** Ang current Procurement ay **port ng Zoho Creator** (widgets + workflows). Ang spec v1.4 ay **bagong disenyo** na may mga bagay na wala sa Zoho. Halos lahat ng "puso" ng spec ay wala pa:

| Wala pa sa current system (kumpirmado sa code) | Spec |
|---|---|
| Feasibility gate (born-late, shortfall, Air / bagong target / proceed) | PO-R1 – R3, Calculators §3 |
| Supplier ladder (day 1 / 2 / 3, `ladder_events`, prepared decision) | Ship & Track, LD-R1 – R4 |
| Sorting engine ng Procurement (Act now / Tell the customer / Watch / Blocked, `queue_rank`, `priority_reason`, `suggested_action`, aging, nightly job, manual urgency) | Engines 01 |
| Event log (`stage_events`), `occurred_at` + `reported_at`, silence alerts (`expected_windows`) | Engines 04 |
| Order Date (Books SO date) sa bawat record + Order Age + `target_date_changes` + `forecast_history` | Engines 03 |
| Production stage sa Ship & Track + production photos (required) + supplier "Production" at "Today" screens | ST-R3, SP |
| Roles (buyer, tracker, receiver, sales agent, supplier user) at pagtatago ng costs | Access sections |
| Procurement Dashboard blocks (Today, Born-late rate, On-time arrival, Supplier scorecard, Pipeline, Replacements) | Dashboard |
| RR Target Delivery + Broken category + working HC System shipment | RR-R2 – R4 |

**Mga 🔴 contradiction na dapat unahin** (detalye sa §3):

1. **Newest-first ang sort** (PR number, pababa). Ang spec: **oldest Sales Order date first** — ito mismo ang bug na gustong ayusin ng buong spec. (C1)
2. **Supplier ay text/substring match** (`includes('Fenteng')`, `includes(nm)`). Spec INQ-R6: supplier ID lang — "ang lumang 'Tony' vs 'Tony Fan' bug ay hindi dapat bumalik". (C2)
3. **PO ay per Sales Order** at pwede ang **mixed shipping mode**. Spec: **isang PO = isang supplier = isang mode**, at pinagsasama ang PRs ng iba't ibang SO. (C3)
4. **Tatlong magkakaibang set ng transit days** (30/14 sa PR, 35–60/5–7 sa forecast engine, 5–10 sa seed) at **dalawang magkaibang forecast ladder**. Spec: **isang function, isang set ng settings**. (C4, C5)
5. **"Received" = bilang lang**, hindi binned / pickable (spec D12). (C10)
6. **Nakikita ng supplier ang SRP** (selling price natin) sa PR copy nila. Spec SP-R1: bawal. (C11)
7. **Admin/user lang ang roles**; ang role ay hard-coded na email list sa widgets. Spec: 11 roles + restricted views. (C12)

**Bilang ng rules / items sa coverage tables (§4, na-update pagkatapos ng Ship & Track): 129** — ✅ 40 OK · ⚠️ 62 Partial · ❌ 18 Missing · 🔴 2 Conflict · ❔ 7 Not verified. Dagdag pa ang **67 bagong items sa §11** (mga bahaging hindi ko pa nabasa noong una): ✅ 9 · ⚠️ 22 · ❌ 32 · 🔴 1 · ❔ 3.

**Mahalagang context:** ang spec (D1, D2) ay **bagong system** (Python/FastAPI + Supabase + HTMX), hindi port ng Zoho. Ang current repo ay Node + Postgres na port ng Creator. Kaya ang mga recommendation ko ay naka-sulat bilang **table / column / rule** (stack-neutral). Ikaw ang magdedesisyon kung dito sa current app ilalagay o sa bagong stack (tingnan ang §8, tanong 1).

---

## 2. Ano ang hinihingi ng spec (maikli)

```
Inquiry ─► PR (pricing + feasibility) ─► PO (FEASIBILITY GATE) ─► Ship & Track ─► Receiving ─► (Exceptions ─► RR)
             │                              │                        │ (production → shipout → transit → receive)
             │                              │                        └─ Supplier LADDER (late = walang production start sa PO+1)
             └──────── lahat ay may Order Date · Target · Forecast ──────── lahat ay ni-rank ng SORTING ENGINE
                      lahat ng stamp ay galing sa SERVER (occurred_at + reported_at) at may SILENCE ALERT
```

Mga pangunahing numero (default sa Calculators / Defaults): production 20 d · consolidation 3 d · transit LCL/FCL 30 d, Air 14 d (Air saves **16 d**) · receiving 2 d · fulfillment 3 d · delivery 2 d · `planned_arrival = PO_date + 1 + production + consolidation + transit + receiving` · `at_risk_slack_days` 3 · `proc_watch_slack_days` 7 · aging 7/14/21 · nightly 05:00 · `inquiry_quote_days` 2 · `rr_default_days` 21 · forecast window ±3 d sa dagat.

---

## 3. Contradictions (🔴) at recommended solution

| # | Spec says | Current system (evidence) | Recommended solution (base sa spec) |
|---|---|---|---|
| **C1** Sort order | Sort key: **Order Date (Books SO date) ascending**, tapos target, tapos record no. Pareho sa lahat ng screen (SE-5). INQ list, PR queue, PO grouping, Ship & Track: "oldest first". (Decision D3) | `modules/Procurement/Purchase Request/app/index.html` ~l.4931 at ~l.6329: "Sort PR rows … **descending by PR number (latest PR on top)**" (hiniling noong 2026-08-25). Bawat widget may sariling sort (`localeCompare` sa Inquiry, PO, Shipments, Receiving). | Isang server-side ranking function (SE-3: i-score ang **buong** open list, saka i-filter). `order_date asc → target_delivery asc → record number asc`. Alisin ang PR-number sort sa widgets; hayaan ang user na mag-click ng column sort para sa session lang. Idagdag ang setting `sort_primary_key` (default `order_date`). Tingnan ang §6.1. **(hakbang 4)** ang PR ay oldest Sales Order first na (server rank); ang ibang widget (Inquiry, PO) ay hindi pa. |
| **C2** Supplier identity | **Supplier ID**, hindi free text (INQ-R6, PR-R8). | Pangalan (text) ang gamit: `purchase-request.mjs` (`who.includes(nm)`, `lower(r.Suppliers).includes(c.nameToken)`), `po-approval.mjs` (`sameSupplier` = `a.includes(b)`; `n.includes(supplier)`), `shipments.mjs` (`supplier.includes('Fenteng')`), `replacement-requests.mjs` (`.includes(S.name)`), RR dialog (`indexOf('HC')`). Ang Inquiry quote lang ang may `Supplier_ID`. | `supplier_id` (FK sa `suppliers`) sa PR, PO, PO line, Shipment, RR, Exception line. Pangalan = display lang. Tanggalin lahat ng `.includes(...)` match. I-backfill: mapping table ng lumang pangalan → `supplier_id` (hal. "Tony", "Tony Fan", "Tony Fan Lighting" → isang ID). Test: dalawang supplier na magkaparehong prefix ng pangalan ay hindi nagkakahalo. **(hakbang 4)** ang Create PO ay naghahanap na ng supplier sa ID (pangalan, ibang pangalan, o buong salitang simula; hindi kailanman bahagi ng salita); ang portal copies ay hard-coded pa. |
| **C3** PO structure | PO grouping workspace: **Ready-for-PO PRs na pinagsama kada supplier**, oldest SO first, **maraming SO sa isang PO** (header: earliest Order Date + target). **Isang PO = isang supplier = isang mode** (PO-R4); mixed mode = hiwalay na PO. | `po-approval.mjs`: "the approved PRs of **one sales order** become lines of the PO". Ang PO form ay may isang `SO_No`/`Customer`. `PO_Detect_Mixed` ay nag-fla-flag lang ng `Mixed_Shipping` — hindi pumipigil. | Ilipat ang grouping key sa `(supplier_id, shipment_mode)`; ilagay ang SO / PR / Order Date sa **PO line**; sa header: `po_date`, `shipment_mode`, `earliest_order_date`, `earliest_target`. I-block ang line na ibang mode (PO-R4). **Desisyon mo ito** (§8 tanong 2) dahil nagbabago ang daloy ng Tony/Fenteng portal copies. **(hakbang 4)** ang PO ay isang supplier + isang mode na, at pwedeng magsama ang ilang SO. |
| **C4** Timeline math at mode | Planned arrival = `PO_date + 1 + production + consolidation + transit(mode) + receiving` (isang calculator, settings-driven). **Ang buyer** ang pumipili ng mode/Air sa gate (option A, may dagdag na freight cost). | `PR_Compute_Shipment_Timeline`: `Production_Date` = **ngayon** (hindi PO+1); walang consolidation at receiving; transit na naka-hard-code (30 / 14). `PR_Set_Shipment_Mode`: `supplier_target_date = target − 4 araw` (hard-coded), tapos **awtomatikong LCL kung ≥30 araw, kung hindi ay Airfreight** — hindi pinipili ng buyer. `po-approval.mjs` ay nagse-set ng `Production_Date: today()`. | Isang `feasibility()` function sa SQL/server (Calculators §3), lahat ng numero galing sa settings. Production start = **PO date + 1**. Mode ay **default lang**; ang pagpalit sa Air ay desisyon ng buyer sa Create PO (option A), naka-log, may bagong dates. Alisin ang hard-coded "−4 araw" (o gawing setting kung may tunay na business reason). **(hakbang 4)** hindi na awtomatikong nagiging air ang PR; ang mode ay default na LCL at ang buyer ang pipili sa gate. Ang "-4 araw" na buffer ay nandoon pa. |
| **C5** Forecast numbers / ladders | **Iisang** function para sa plan at forecast ("The same function is reused for the forecast"). Isang set ng defaults. | Tatlong set: (a) PR timeline 30/14; (b) `server/forecast/engine.mjs` default Air 5–7 d, LCL/FCL **35–60 d**, customs 2–3 / 7–10, prep **7 d**, delivery **0**; (c) `server/seed.mjs` Air 5–10, prep **3**, delivery 3. May **dalawang ladder** (`fcStampBySoNo` at `fcStampPurchaseRequest`) na "differ" (nakasulat mismo sa comment ng `purchase-request.mjs`). | Isang forecast function = isang calculator. Ilipat sa Control Panel settings ang: production, consolidation, transit (LCL/FCL/Air), receiving, fulfillment, delivery, sea window ±3. **Kumpirmahin sa owner** kung 30 o 35–60 ang tunay na LCL (§8 tanong 4). Ang min/max ranges ng Zoho ay palitan ng ± window. **Ayos 2026-11-17 (hakbang 3):** ang forecast engine at ang plan ng Ship & Track ay iisa na ang pinagbabasahan, ang Procurement Settings page (ang Forecast Setting tab ay inalis sa menu). Kasalukuyang numero ang panimula, kaya walang nagbago sa forecast. Ang PR timeline (30/14 at "−4 araw") ay hindi pa nakakabit dito. |
| **C6** Forecast anchor | Hindi pa sa PO: **today + buong chain**. Nasa PO: **pinakahuling actual/planned arrival + receiving + fulfillment + delivery**. Delivered: frozen + forecast error. | Anchor = `PR.Added_Time` (kailan ginawa ang PR), kahit lumipas na (naka-clamp sa today, "lampas na sa tantiya"). Hindi gumagamit ng PO date, ack, production dates (wala kasi). Walang freeze sa delivery. | I-anchor sa spec table (Engines 03, "How the forecast is calculated"). Kailangan muna ang actual dates (C7 / §5). I-save ang `forecast_history` bawat pagbabago at `forecast_error` sa delivery. |
| **C7** Typed dates | **Planned dates ay computed, hindi tina-type** (ST-R1). Actual dates ay galing sa portal / forwarder / receiving. | `ETD`, `ETA`, `Estimated_Warehouse_Arrival`, `Supplier_Target_Date` ay tina-type (supplier sa pag-ack, buyer sa Shipments form). Tatlong pangalan para sa arrival (`ETA`, `Arrival_Date`, `Estimated_Warehouse_Arrival`). | Computed ang planned (`planned_*`), actual ay `actual_*` mula sa event. Isang pangalan: `arrival_*`, `shipout_*`, `production_*`, `receive_*` (DB doc §1: "one name, one meaning"). Ang ETA na ibinigay ng supplier ay tatanggapin bilang **report** (event na may `occurred_at`/`reported_at`), hindi bilang planned date. **(hakbang 11)** ang Estimated Warehouse Arrival ng supplier shipout ay galing na sa settings (transit + customs + receiving), hindi na ang fixed 12 / 67 / 47 araw. |
| **C8** Automatic priority | Walang automatic urgency (Decision **D6**: rules U1–U7 dropped). Manual urgency lang (M1: pangalan + dahilan, supervisor approves, expires). | `PR_Compute_Priority` (`purchase-request.mjs`): score mula sa lapit ng target (≤3 d +50 …), **Order_Value ≥ 500,000 → +20**, **stale >5 araw → +20** → High/Medium/Low. | Alisin ang auto `Priority_Score` bilang ranking input. Palitan ng Sorting Engine categories + `urgency_requests` (M1). Ang `Order_Value` ay hindi ginagamit ng spec sa sort. |
| **C9** Timestamps | Server-only stamp, **date-time**, `occurred_at` + `reported_at`, **isang beses lang** (T-6), walang user na pwedeng mag-edit (T-2). | `PO_Status_Timestamps`: nagsusulat ng `Sent_On` / `Completed_On` na **date lang** (`ymd(todayDate())`) sa field na datetime; **nao-overwrite** kapag bumalik at pumasok ulit sa status ("only the save that CHANGES the status stamps"). Ang RR `Closed_At`, `Supplier_Acknowledge_Date` ay date lang. Pwedeng i-edit ang field via API (`updateRecordById` ay walang block sa mga stamp field). | `stage_events` table (server-only write), unique `(record_type, record_id, event, visit_no)`. Ang mga "…_On" fields ay maging **views/derived** mula sa event log. Tingnan ang §6.3. |
| **C10** "Received" | **"Received" = binned, counted, pickable** (D12). Apat na event: arrived → counted → binned → available. Ang bin ay nagpapa-available sa package (RCV-R4). | `Receiving_Set_Line_Result`: line ay `Complete` + `Ready_for_Fulfillment` kapag Accepted = Expected — **walang bin na kailangan**. `Bin_location` ay may iisang choice na "Receiving Area". Walang `arrived`, `binned_at`, `available_at`. Ang shipment ay nagiging **"Delivered"** pagka-receive. | Idagdag ang `receiving_lines.bin_id` (totoong `bins` table), `counted_at / binned_at / available_at` (server stamps). `Ready` ay **kapag may bin lang**. Gate log para sa `arrived` (araw-araw na entry o "before first count"). Palitan ang "Delivered" ng `arrived_warehouse` / `received`. **(hakbang 4)** ang "Received" ay counted AT binned na. |
| **C11** Supplier ay nakakakita ng presyo natin | SP-R1: bawal ang "customer names, addresses or **customer prices**". Ang supplier ay nakakakita lang ng item, qty, specs, dates, **PO price sa kanila**. | `populateCopies` (`purchase-request.mjs`) ay kumokopya ng `SRP_Rate_PR` sa supplier copy (`SRP_Rate_PR_Supplier1` / `_Supplier2` sa Fenteng/Tony PR forms). Dagdag: ang supplier PR form ay may `Selected_Supplier`, `Selcted_Final_Cost`, `Followed_Recommendation`. Walang customer name ✅. | Portal views (`portal_*_v`) na hindi kasama ang SRP, SRP-related, selected-supplier ng iba, at override fields. Alisin ang SRP sa `populateCopies` at i-clear ang laman ng existing copies. **Mataas ang priority** (confidentiality). **(hakbang 5)** hindi na kinokopya ang SRP sa supplier copy; Yes / No flag na lang. Ang lumang halaga sa mga kasalukuyang copy ay hindi pa nalilinis; ang PO line ay may fallback pa sa SRP. **(hakbang 11)** ang `Item_Price` sa supplier copy ng PO ay presyo na ng supplier mismo, hindi na ang SRP o catalog rate. Ang lumang halaga sa mga kasalukuyang copy sa Railway ay hindi pa nalilinis. |
| **C12** Roles at costs | 11 roles (admin, supervisor, buyer, shipment_tracker, receiver, fulfillment_*, dispatcher, field, sales_agent, supplier_user) + RLS views. Costs: buyer/supervisor/admin lang. Tracker: **walang** cost kahit hidden sa page. | `server/auth.mjs`: `role IN ('admin','user')` lang. Ang role sa widgets ay **hard-coded na listahan ng email** (`roleMap` sa Exceptions widget at iba pa). Ang Dashboard ay may "Top Suppliers by Spend" para sa lahat. Plan - Finish Procurement tanong #6 ay bukas pa. | `staff_roles` + role-based views/endpoints. Hindi nagpapadala ang server ng cost fields sa tracker/receiver/sales agent/supplier (hindi lang itinatago sa UI — acceptance checklist ng Ship & Track). Alisin ang email-based role maps. |
| **C13** Hard delete | "No hard deletes of business records" (DB doc §1). | `PR_Deleted` ay nagbubura ng supplier copies; ang PR mismo ay pwedeng i-delete; `Delete_Item_On_Supplier` sa Inquiry. | `status = 'cancelled'` / `archived_at`. Ang "delete" ay maging cancel na may dahilan at stamp (`pr.cancelled`). **(hakbang 4)** ang PR at PO ay hindi na nade-delete (cancel na lang). |
| **C14** Numbering | Sequence bawat uri (`PR-00123`, …). | `nextNumber()` = "pinakamataas + 1" (PR, PO, RR, EXC, SHP, RCV). Pwedeng magbanggaan kapag sabay ang save (nakasulat din sa Plan - Finish Procurement §4). | Postgres `SEQUENCE` bawat uri. |
| **C15** Naming | "Arrival into warehouse = **receive**"; shipping out = **shipout**; hindi dapat gamitin ang "ship" at "shipment" para sa dalawang bagay. Ang "delivery" ay sa customer. | `Shipment_Status` value na **"Delivered"** = dumating sa warehouse. Supplier ay hard-coded na dalawang module (`Tony Fan`, `Fenteng Lighting`) na may `_Supplier1` / `_Supplier2` copies. | Rename: `Delivered` → `arrived_warehouse` / `received`. Isang supplier portal na role-based (`supplier_user` na naka-link sa supplier), hindi kopya ng form kada supplier — para magamit ang pangatlong supplier nang walang bagong form. |
| **C16** Status vocabulary | PO: `draft / sent / acknowledged / closed / cancelled`. PR: `open / ready_for_po / on_hold / converted / cancelled`. | PO form options: `Draft / Confirmed by Supplier / Cancelled / Replacement - Missing`; ang code ay sumusulat ng `Sent`, `Completed`, at `Confirmed` (`supplier-portal-workflows.mjs`) na wala sa listahan ng form. Ang "Replacement - Missing" ay uri, hindi estado. PR: `Open / Converted to PO` + hiwalay na `Hold_Status` + boolean `PR_READY_FOR_PO`. | Isang enum bawat record (text + check constraint). Ilipat ang "replacement" sa `po_type` / `rr_reference`. Hindi ko na-test kung tinatanggap ng store ang value na wala sa picklist (❔). |

---

## 4. Rule-by-rule coverage (kulang / meron)

### 4.1 Inquiry (`02 Procurement/01 Inquiry`)

| Rule | Spec | Current | Status |
|---|---|---|---|
| INQ-R1 | Pag-send, lalabas sa portal ng napiling suppliers + daily digest | Naka-copy sa Tony/Fenteng portal forms (`Supplier_Populate_From_IN`). Walang daily digest (in-app notification lang). | ⚠️ Partial |
| INQ-R2 | Unavailable / Cannot Produce → naka-disable ang price at lead time | Native form rule lang (`Disable_Supplier_Quotes_L`, "nativeFormOnly" sa `ported.json`); may price-lock habang Pending (JV). Hindi ko na-test ang Cannot Produce. **Ayos (hakbang 8):** kapag Unavailable o Cannot Produce, binubura ng server ang price at lead time ng line (hindi lang naka-disable sa screen); may test. | ✅ OK |
| INQ-R3 | Buyer pumipili ng 1 supplier bawat line; ang lead time = production days sa feasibility | `Selected` ay isa lang (native rule). `Lead_Time` ay **text**; hindi ginagamit sa feasibility. **Ayos (hakbang 8):** ang lead time na text ("20 days", "3 weeks", "2-3 weeks", "1 month", "20天") ay binabasa bilang bilang ng araw: `Selected_Lead_Days` sa inquiry, at ito rin ang ginagamit ng PR. | ✅ OK |
| INQ-R4 | "Push Estimate to Books" (buyer only) at itabi ang Books estimate ID | `create_estimate` ported; `Books_Estimate_ID` / `Estimate_Created` meron. Walang role gate (C12). | ⚠️ Partial |
| INQ-R5 | Kapag naging SO sa Books, naka-link pabalik at nagsasara ang Inquiry | Walang SO → Inquiry link/close (kailangan ng Books poller, M7). | ❌ Missing |
| INQ-R6 | Supplier ID, hindi free text | Quote may `Supplier_ID` pero ang iba ay pangalan (C2). **Ayos (hakbang 8):** ang quote row na may supplier ID ay tinutugma sa ID lang; pangalan lang ang gamit para sa lumang row na walang ID. Ang pangalan ng supplier ay iisa na (Tony Fan / Fenteng Lighting). Ang iba pang bahagi ng portal ay hindi pa ID. | ⚠️ Partial |
| INQ-R7 | Feasibility hint bawat quote ("Lead 20 days + sea → earliest 18 Jan") | Wala. **Ayos (hakbang 8):** kapag may needed-by date: "Tony Fan: Lead 20 days + sea -> earliest about 15 Feb (55 days after the 22 Dec you need; by air about 29 Dec, still 7 days late)" sa ilalim ng quote grid. | ✅ OK |
| Timestamps | `inquiry.sent`, `first_quote_received`, `supplier_selected`, `estimate_pushed` | `Inquiry_Timeline` (text log). Walang dedicated stamp. **Ayos (hakbang 8):** `Sent_At`, `First_Quote_At`, `Selected_At`, `Estimate_Pushed_At` (ang una ang nananatili) at ang mga event na inquiry.sent / first_quote_received / supplier_selected / estimate_pushed sa event log. | ✅ OK |
| Notifications | Buyer: lahat ng quote dumating / walang quote pagkalipas ng `inquiry_quote_days` (2 d). Sales agent: supplier selected / estimate ready | May "Notify on supplier Inquiry response". Walang 2-day no-quote alert. **Ayos (hakbang 8):** alert sa buyer kapag lahat ng supplier ay nag-quote (isang beses), at kapag walang quote pagkalipas ng `inquiry_quote_days` (2, nasa Procurement Settings; daily job 08:30). Wala pang abiso sa sales agent. | ⚠️ Partial |
| Access | Sales agent: **walang price**; supplier: sariling lines | Walang role (C12). | 🔴 Conflict |
| Screens | New Inquiry (catalog / Books ID / custom + photos), list (oldest first), detail grid, My inquiries, supplier view | Meron (Inquiry List widget; "+ Add item by Books ID" = `add_item_by_id` ported). List ay hindi oldest-first (C1). **My inquiries (sales agent, no costs)** ay wala. **Ayos (hakbang 8):** ang Inquiry List ay oldest first na at may Age column. Ang "My inquiries" ng sales agent na walang presyo ay wala pa (kailangan ng role). | ⚠️ Partial |

### 4.2 Purchase Request at Pricing (`02/02`)

| Rule | Spec | Current | Status |
|---|---|---|---|
| PR-R1 | Auto-gawa ng PR mula sa Books SO (`so_to_pr`) kopya ang Order Date, Target, customer; void/cancel = walang PR | Wala (Books poller M7 ay hindi pa ginagawa; PR ay galing seed/widget). | ❌ Missing |
| PR-R2 | **Auto-hold** kapag nag-void ang SO sa Books ("SO voided in Books") | Manual lang ang hold (`Hold_Status`, `Hold_Reason`, `Hold_Date`, `Held_By`). **Ayos (hakbang 4):** kapag ang Sales Order ay naging void / cancelled, nagiging On Hold agad ang mga open PR ("SO voided in Books"); wala pang Books poller na nagbabago ng status. | ⚠️ Partial |
| PR-R3 | Kapag nagbago ang SO date/target, kinokopya sa open PRs at nire-re-score | Walang Books sync; ang forecast ay nire-re-stamp kapag na-save ang PR. | ⚠️ Partial |
| PR-R4 | Supplier recommendation = presyo **at lead time laban sa target**; may paliwanag sa salita | Pinakamababang presyo, tie → pinakamaikling lead; hindi tumitingin sa target/feasibility; walang paliwanag. May load-balancing display (Max_Capacity / Load_Status) na wala sa spec. **Ayos (hakbang 4):** timbang ang presyo at lead time laban sa target; may paliwanag sa salita (`Recommendation_Reason`). | ✅ OK |
| PR-R5 | Pricing hand-off: rate card → recent PO cost → landed cost + markup; `auto_priced` o `needs_manual_quote` | Wala. May `hasPrice` check lang (SRP / Rate / inquiry ref). **Ayos (hakbang 4):** `Pricing_Status` (needs_pricing / auto_priced / needs_manual_quote) at alert sa buyer; ang pricing tool ay nasa labas ng system. | ⚠️ Partial |
| PR-R6 | **Feasibility sa bawat PR**: `feasible / at_risk / impossible`, shortfall days, Air option, earliest feasible date | Wala. Ang `Delay_Status` (On Track / At Risk / Delayed) ay galing sa supplier lead laban sa **ngayon**, hindi sa target na kailangan. **Ayos (hakbang 4):** feasible / at_risk / impossible, shortfall, earliest date, air option sa bawat PR. | ✅ OK |
| PR-R7 | Hold / Resume / Cancel na may dahilan; bawat isa may stamp | Hold lang (may dahilan, petsa, tao). Resume at cancel stamp ay wala. **Ayos (hakbang 4):** hold at cancel ay kailangan ng dahilan at naka-stamp (pr.held / resumed / cancelled); ang cancelled ay hindi na binubuhay; walang delete. | ✅ OK |
| PR-R8 | Pwede lang i-group kung **parehong supplier ID** at hindi naka-hold | Hold at Cancelled ay nilalaktawan ✅; supplier by name (C2); PO per SO (C3). **Ayos (hakbang 4):** sa Create PO: grupo ayon sa supplier ID + mode, at hindi isinasama ang naka-hold. | ✅ OK |
| Screen | PR queue by category (Act now / Watch / Blocked), oldest SO first; columns Order Date, Target, Forecast | May Queue at All PRs tab, naka-sort newest PR (C1); walang category; walang Order Date column. **Ayos (hakbang 4, tinama ang status 2026-11-17):** ang PR list ay oldest Sales Order first na (server rank, `Queue_Rank`) at may Feasibility column; ang `Pr_Category` ay nasa data na pero wala pang category tabs sa widget. | ⚠️ Partial |
| Screen | PR Forecast (bar chain bawat PR; PRs na magiging late kung ngayon i-raise) | Wala (ang "Forecast Setting" tab ay settings lang). | ❌ Missing |
| Screen | New PR (manual): creation date ang Order Date | May manual PR (`Source`); walang Order Date rule. | ⚠️ Partial |
| Notifications | Buyer: needs manual quote / impossible / auto-held. Sales agent: PR impossible na may earliest date | Wala. **Ayos (hakbang 4):** alert sa buyer kapag kailangan ng manual quote. | ⚠️ Partial |

### 4.3 Purchase Order at Feasibility Gate (`02/03`)

| Rule | Spec | Current | Status |
|---|---|---|---|
| Gate | Sa Create PO, bawat line: planned arrival vs date needed, shortfall, options A (Air) / B (bagong target) / C (proceed) | Wala. `approve_po_main` ay gumagawa ng PO nang walang tsek. **Ayos (hakbang 4):** dialog sa Create PO: A) air, B) bagong target, C) proceed. | ✅ OK |
| PO-R1 | Warn and suggest, **hindi block**; kailangang pumili ng option sa bawat born-late line; naka-record | Wala. **Ayos (hakbang 4):** warn and suggest; walang naisusulat hangga't walang option ang bawat late line. | ✅ OK |
| PO-R2 | Option B = `forecast_promise_change` sa approval queue ng sales agent; hindi kusang nagbabago ang target | Walang approval queue. **Ayos (hakbang 4):** ang option B ay `forecast_promise_change` sa Decisions; ang target ay nagbabago lang kapag tinanggap. | ✅ OK |
| PO-R3 | Born-late rate sa dashboard, weekly | Wala. **Ayos (hakbang 4):** `Born_Late` at `Shortfall_Days` sa PO; wala pa ang born-late rate sa Dashboard. **Ayos (hakbang 7):** ang born late ay sinusukat sa gate, bago pumili ng option (kahit nailigtas ng air, bilang pa rin ito); `Lines_Raised` at `Lines_Born_Late` sa PO; may API `get_born_late_rate` (bawat linggo) at stat card na "Born late (4 wks)" sa PO list. Ang block sa Dashboard ay hindi pa. | ✅ OK |
| PO-R4 | 1 PO = 1 supplier = 1 mode | Per SO; pwede ang mixed (C3). **Ayos (hakbang 4):** 1 PO = 1 supplier ID = 1 mode; ang iba't ibang SO ay pwedeng magsama sa isang PO (`prNos`). | ✅ OK |
| PO-R5 | Send → portal + digest; ack → `po.acknowledged`; production start = **PO date + 1**; late ack ay hindi gumagalaw ng orasan, may sariling alert | Ack ✅ (`acknowledge_po_*`, `Acknowledge_On`); production start = ngayon (C4); walang late-ack alert. **Ayos (hakbang 4):** production start = PO date + 1; alert kapag hindi na-acknowledge sa loob ng `po_ack_window_days`. | ✅ OK |
| PO-R6 | PO sa Books pag-send; itabi ang Books PO ID | `Books_PO_ID` field meron; ang Books half ng `approve_po_tony/fenteng` ay **hindi pa ported** ("on hold"). | ❌ Missing |
| PO-R7 | `deposit_paid`, `deposit_amount` (restricted) | Wala. **Ayos (hakbang 4):** `Deposit_Paid` / `Deposit_Amount` ay nasa PO; wala pang screen at wala pang paghihigpit sa roles. **Ayos (hakbang 7):** may Deposit card na sa PO detail (paid at amount) na nagse-save. Wala pang paghihigpit ayon sa role, at ang ladder ay hindi pa gumagamit nito. | ⚠️ Partial |
| PO-R8 | Nagsasara ang PO kapag lahat ng line ay fully received / cancelled | `Completed_On` ay galing sa status; hindi ko nakita ang auto-close mula sa Receiving. **Ayos (hakbang 4):** kusang nagsasara kapag fully received ang lahat ng line. | ✅ OK |
| Fields | `born_late`, `shortfall_days`, `feasibility_note`, earliest Order Date / target | Wala (§5). **Ayos (hakbang 4):** `born_late`, `shortfall_days`, `feasibility_note`, earliest order date / target, supplier ID, mode. | ✅ OK |
| Screen | PO list by category (Act now / Tell the customer / Watch / On track) | Wala. **Ayos (hakbang 7):** ang PO list ay may urgency (Act now / Tell customer / Watch / On track / Blocked) na galing sa mga shipment ng PO, may filter na may bilang, ranking, at mga column na Order Date, Target, Forecast. Sa PO detail: Feasibility at creation at Deposit. Sadyang tinanggal (utos ng owner) ang Shipment tracking card sa PO: nasa Shipments tab na ang planned vs actual at ang ladder. Hindi pa: documents at supplier messages sa iisang timeline. | ⚠️ Partial |
| Timestamps | `po.created / sent / acknowledged / closed / cancelled` | Sent, Acknowledge, Completed meron pero date lang at overwritable (C9); walang cancelled. **Ayos (hakbang 4):** po.created / sent / acknowledged / closed / cancelled bilang events. | ✅ OK |
| Notifications | Buyer: PO hindi ack sa loob ng 1 araw. Sales agent: born-late option B | Wala. **Ayos (hakbang 4):** alert sa buyer kapag hindi na-acknowledge; wala pang abiso sa sales agent para sa option B. | ⚠️ Partial |

### 4.4 Ship & Track at Supplier Ladder (`02/04`)

| Rule | Spec | Current | Status |
|---|---|---|---|
| Stages | 4 stages: Production → Shipout → Transit → Receive, planned vs actual bawat isa | Isang `Shipment_Status` (Pending / In Transit / Arriving In 1 Week / Delivered / Delayed). Walang Production stage. **Ayos 2026-11-17:** 6 stages sa `Stage`; ang lumang `Shipment_Status` ay sumusunod para hindi masira ang widget. | ✅ OK |
| ST-R1 | Planned = computed, hindi tina-type | Typed (C7). **Ayos:** computed na ang planned; ang lumang ETD / ETA ay nakatago lang pero pwede pang i-save. | ⚠️ Partial |
| ST-R2 | Bawat actual date: kailan nangyari **at** kailan sinabi; reporting lag buwan-buwan | Wala. **Ayos:** may `occurred_at` + `reported_at` bawat event; wala pa ang buwanang reporting-lag report. | ⚠️ Partial |
| ST-R3 | **Production photos ay required** para umalis sa Production; shipment photos optional; 10 MB, JPG/PNG/HEIC/WebP/PDF | Walang photo field sa Shipments/supplier shipment forms. **Ayos:** gate sa buyer / tracker; wala pa sa supplier path at isang photo lang bawat field. | ⚠️ Partial **(hakbang 6)** ang production finished mula sa supplier portal ay kailangan na rin ng photo; ang photo ay kinokopya sa shipment. Isang file lang bawat field. |
| ST-R4 | Photos ay makikita sa Shipment, Receiving at Exception (para ma-trace ang damage) | Receiving/Exception ay may sariling photos; walang supplier photos na itatabi. | ❌ Missing |
| ST-R5 | Booking / ship date ay nagpapahiwatig na tapos ang production → `before <ship date>` | Wala. **Ayos:** "production finished, before". | ✅ OK |
| ST-R6 | Partial shipments: hati ng line by qty | `Ordered_QTY / Shipment_QTY / Remaining_QTY` sa `PO_Shipments`. | ✅ OK |
| ST-R7 | Pag may actual date, **agad** i-recompute ang forecast ng lahat ng SO sa shipment at i-re-categorise | Walang agarang hook sa Shipments (`server/forecast/hooks.mjs` ay Fulfillment forms lang; `pr-hooks.mjs` ay PR lang). Ang nightly `Forecast_Stamp_Daily` (01:00) ang nagre-restamp ng shipment forecast; walang re-categorise. **Ayos:** nire-rescore agad ang shipment sa bawat save at event. | ⚠️ Partial |
| ST-R8 | Suggested actions (Call supplier PO+2, Request booking, Ask forwarder, Raise shortage RR, Escalate 7 d) | Wala. **Ayos:** may suggested action (fixed list); wala pang "Escalate" at "Raise shortage RR". | ⚠️ Partial |
| Board | Tabs Act now / Tell the customer / Watch / On track / Blocked; days late; next step | Risk_Status (On Track / At Risk / Delayed) at `Need_Attention`. Walang tabs / next step. **Ayos:** may tabs, days late, next step. | ✅ OK |
| Grouping | Bawat row ay nagse-save nang mag-isa | — | ❔ Not verified |
| Access | Tracker: edit stages / dates / forwarder / photos; **walang cost** | Walang role (C12); walang cost field sa Shipments form ✅. | ⚠️ Partial |
| Ladder | Day 1 notify+call · Day 2 request discount · Day 3 prepared decision sa approval queue (cancel at re-source sa Taobao o hold); "late" = production hindi pa nagsimula sa PO+1 | Wala. **Ayos:** rung 1/2/3 at Approval Queue na ginagawa; walang supervisor para sa main suppliers, at walang screen pang mag-decide. **Ayos 2026-11-17 (hakbang 2):** may Decisions screen na; wala pang supervisor para sa main suppliers (may flag na `Is_Main_Supplier`, sa buod lang). | ⚠️ Partial |
| LD-R1 | Ladder din para sa "production finishing late" (day 3 = hold o upgrade mode) | Wala. **Ayos:** production finish ladder. | ✅ OK |
| LD-R2 | Auto-cancel = OFF (default) | Walang ladder, walang auto-cancel ✅ (walang panganib). **Ayos:** walang auto-cancel. | ✅ OK |
| LD-R3/R4 | Isang beses bawat rung bawat line; `ladder_events`; rungs/days/actions ay settings | Wala. **Ayos:** isang beses bawat rung at naka-log; ang rungs / days ay constants pa sa code. **Ayos 2026-11-17 (hakbang 2):** ang rungs / days ay settings na. | ✅ OK |
| Notifications | Buyer: ladder / Act now. Tracker: overdue arrival. Sales agent: Tell-the-customer. Supplier: daily digest | Wala (may `Notified_10d` flag at Zoho schedules na hindi ported). **Ayos:** in-app notification sa ladder at overdue (isang hard-coded na recipient). | ⚠️ Partial |

### 4.5 Receiving (`02/05`)

| Rule | Spec | Current | Status |
|---|---|---|---|
| 4 events | Arrived → Counted → Binned → Available | Counted lang (bilang ng accepted/missing/damaged). **Ayos (hakbang 4):** arrived (gate log, o "before the first count"), counted, binned, available: lahat ay server stamps. | ✅ OK |
| RCV-R1 | Partial receives; bawat save ay nagpo-post lang ng **delta** sa Books (Purchase Receive) | `Partial_Receive_Timeline`, `SKU_Receive_History`, `Books_Receive_ID` ay meron; ang posting (`create_bin_receiving`, 1,885 linya) ay **hindi pa ported**. | ⚠️ Partial |
| RCV-R2 | Server ang tumatanggi ng duplicate receive | `Receiving_Validate_Qty` ay tumatanggi kapag Accepted+Damaged+Missing > Expected ✅; ang duplicate **Books** post check ay wala (hindi pa ported). | ⚠️ Partial |
| RCV-R3 | Damaged / missing → exception na may `found_stage = receiving` at `fault_origin` (supplier / transit / unknown) | `Receiving_Auto_Exception` ✅ (isang exception bawat line). Walang `found_stage` / `fault_origin` (may `Root_Cause_Category` na hindi nakamapa). **Ayos (hakbang 4):** `Found_Stage`, `Fault_Origin` (mula sa root cause), `Affected_Qty` sa exception. | ✅ OK |
| RCV-R4 | Bin → available sa package; kapag lahat ng lines ay available, Ready ang package (<1 min) | `Ready_for_Fulfillment` flag batay sa bilang; walang bin gate. Ang link sa Fulfillment ay hindi ko na-test. **Ayos (hakbang 4):** ang line ay ready lang kapag counted AT binned; ang pagbubuo ng package sa Fulfillment ay hindi ko na-test. | ⚠️ Partial |
| RCV-R5 | Stock items (walang PO) pwede ring i-receive | — | ❔ Not verified |
| RCV-R6 | Silence alerts: arrived → counted 1 d; counted → binned 1 d; binned → available 2 h | Wala. **Ayos (hakbang 4):** silence alerts (arrived to counted, counted to binned, binned to available) sa daily job. | ✅ OK |
| RCV-R7 | Kulang ang dumating → suggested action "Raise shortage RR" | Wala. **Ayos (hakbang 4):** suggested action na mag-raise ng replacement request, at isang abiso sa buyer. | ✅ OK |
| Screens | Arrivals (inaasahan this week + dumating na hindi pa bilang, oldest first) | Wala. | ❌ Missing |
| Photos | Damage photos katabi ng production/shipment photos ng supplier | Walang supplier photos. **Ayos (hakbang 4):** may link sa production / shipment photos ng supplier sa Receiving detail (isang file bawat field). | ⚠️ Partial |
| Access | Walang cost sa receiving screens | Walang cost field ✅. | ✅ OK |

### 4.6 Exceptions at Replacement Request (`02/06`)

| Rule | Spec | Current | Status |
|---|---|---|---|
| RR-R1 | Supplier dialog bago Create RR: Same supplier (preselected), Fenteng, Tony Fan, HC System, **Other**; dahilan lang kung nagbago; naka-record ang original | May dialog (2026-10-12): Same / Fenteng Lighting / Tony Fan / HC System; dahilan kung nagbago ✅. Walang "Other". Nasa Exception (`RR_Supplier_Override`, `RR_Supplier_Change_Reason`), wala sa RR record. **Ayos (hakbang 9):** may opsyon na "Other" (uri ng pangalan ng supplier); ang main RR ay may `RR_Supplier` (napili), `Original_Supplier` at `Supplier_Change_Reason`; walang naisusulat at may error kapag nagbago ang supplier na walang reason ("Tony" at "Tony Fan" ay iisa kaya hindi pagbabago). | ✅ OK |
| RR-R2 | Supplier **na walang portal** (HC System) ay dapat gumawa pa rin ng working replacement shipment; huwag i-release ang R1 hangga't hindi gumagana | `clone_shipment_for_replacement` ay **hindi pa ported** (Port Status). Ang `createRRSupplier` ay Tony/Fenteng lang. Sa Zoho "built" ayon sa widget comment (2026-10-13); sa app na ito ay hindi. **Ayos (hakbang 9):** na-verify: ang ported na `clone_shipment_for_replacement` ay gumagawa ng working replacement shipment para sa HC System (kapag Acknowledged na ang RR sa Local tab) at napupunta sa receiving; may test. Dapat Acknowledged muna ang HC System RR. | ✅ OK |
| RR-R3 | RR **Target Delivery** sa paggawa: orihinal na target kung nasa hinaharap, kung hindi ay today + `rr_default_days` (21); dala ang **Order Date ng orihinal na SO** | Walang `Target_Delivery` / Order Date sa RR form. **Ayos (hakbang 9):** ang RR ay may `Target_Delivery` (orihinal kung nasa hinaharap pa, kung hindi ay ngayon + `rr_default_days` = 21, nasa Procurement Settings) at `Order_Date` ng orihinal na SO (mula sa PR, o sa Sales Order). | ✅ OK |
| RR-R4 | RR lines ay category **Broken** — nasa itaas ng Act now at ng bawat queue | Priority High/Medium/Low lang. **Ayos (hakbang 9):** ang bukas na RR at ang replacement shipment nito ay **Broken**: nasa itaas ng lahat ng queue sa Procurement (Shipments, PO list, RR list). Hindi pa sa Fulfillment at Delivery. | ⚠️ Partial |
| RR-R5 | RR pumapasok sa supplier portal tulad ng PO; sumusunod sa Ship & Track at ladder | Supplier RR copy + `approve_rr_*` ✅; walang Ship & Track / ladder. **Ayos (hakbang 9):** ang replacement shipment ay isang Shipments record kaya sumusunod ito sa Ship & Track at sa Broken ranking; ang ladder sa RR ay hindi ko pa nasubukan. | ⚠️ Partial |
| RR-R6 | Buwanang report: replacements by cause / fault origin / supplier; rework rate | Wala. **Ayos (hakbang 9):** may buwanang report (API `get_rr_report` at tab na "Monthly report" sa RR page): ayon sa dahilan, fault origin, at supplier, at bilang ng nagbago ng supplier. Ang rework rate ay tinatantya mula sa Exception Control at Package_Shipments at hindi ko pa na-verify. | ⚠️ Partial |
| RR-R7 | Kung may stock, laktawan ang purchasing → diretso sa package | — | ❔ Not verified |
| Exception Control | Filter by age, stage found, fault origin, owner; detail may supplier photos, history | May status, priority, assigned dept/to, waiting on, due date. Walang `found_stage / caused_stage / fault_origin`. **Ayos (hakbang 9):** may mga filter na (age, stage found, fault origin, owner), Age column, at oldest first. Wala pa ang supplier photos sa detail. | ⚠️ Partial |
| Timestamps | `exception.raised / resolved`, `rr.created / acknowledged / replacement_received` | `Opened_On` ✅; **resolved ay hindi nai-store** (sinasabi sa comment ng `replacement-exceptions.mjs`: "form has no such fields"); `replacement_received` wala. **Ayos (hakbang 9):** `exception.raised`, `exception.resolved`, `rr.created`, `rr.acknowledged`, `rr.replacement_received` (kapag counted at binned na ang replacement) sa event log, at `Replacement_Received_At` sa RR. | ✅ OK |

### 4.7 Supplier Portal (`02/07`)

| Rule | Spec | Current | Status |
|---|---|---|---|
| Screens | Inquiries, PRs, POs, **Production**, Shipments, RRs, Messages, **Today** | Inquiries ✅, PRs ✅, POs ✅, Shipments ✅ (ship date lang), RRs ✅, Messages (PO/PR/Inquiry Messages forms) ⚠️. **Production** at **Today** ay wala. **Ayos (hakbang 6):** may **Production** screen na (Tony Fan at Fenteng): production started / finished na may petsa, production photo, at delay report. Wala pa ang Today at Messages. | ⚠️ Partial |
| SP-R1 | Sariling supplier lang; walang customer name / address / customer price | Walang customer name ✅; **SRP ay kinokopya** (C11); hiwalay na form kada supplier ang pagbubukod, hindi login-scope. **Ayos (hakbang 5):** hindi na kinokopya ang SRP sa supplier copy ng PR; may `Ref_Price_Known_Supplier1/2` (Yes / No) na lang. Hindi pa login-scope, at ang lumang SRP sa mga kasalukuyang copy ay hindi pa nalilinis. **Ayos (hakbang 11):** pati ang `Item_Price` ng supplier copy ng PO ay presyo na ng supplier; wala nang customer price sa PR at PO copies ng supplier. | ⚠️ Partial |
| SP-R2 | Lalabas ang shipment sa portal **pagkatapos lang ma-ack** ang PO | Ang supplier shipment copy ay ginagawa sa Create PO (`approvePOTony/Fenteng`). Hindi ko na-verify ang timing. **Ayos (hakbang 6):** ang Production screen ay lumalabas lang kapag Confirmed ang PO sa kopya ng supplier (walang PO = lumalabas agad); nasubukan sa sample. Ang lumang Shipments widget ay may sariling gate na hindi ko binago. | ⚠️ Partial |
| SP-R3 | Dropdown values ay naka-store sa English kahit anong wika | May EN / 中文 toggle (Tony Fan / Fenteng widgets). Stored value hindi ko na-test. | ❔ Not verified |
| SP-R4 | Bawat report: kailan nangyari (date na tina-type nila) + kailan sinabi (server time) | Wala. **Ayos (hakbang 5):** ang delay report ay may "kailan nangyari" at "kailan sinabi" sa event log; ang ibang report ng supplier ay ship date lang. **Ayos (hakbang 6):** ang production started / finished / photo ay may petsang inilagay ng supplier at oras ng server. | ⚠️ Partial |
| SP-R5 | "Delay" report: bagong expected date + dahilan → nag-uupdate ng planned dates at re-forecast | Wala. **Ayos (hakbang 5):** bagong expected date + dahilan (kailangan pareho): nag-re-plan ang planned dates, ang forecast ay gumagamit nito, hindi gumagalaw ang target, may event; sa supplier portal at sa buyer widget. | ✅ OK |
| SP-R6 | Login bawat supplier user (role `supplier_user` naka-link sa supplier); deep links sa digest | Wala (admin/user lang; Plan tanong #6 bukas). | ❌ Missing |
| SP-R7 | Mobile-friendly | May `viewport` at `@media` sa widgets; hindi ko na-test sa phone. **Ayos (hakbang 6):** ang Production screen ay gawa para sa phone (isang column, malalaking button); hindi ko pa nakita sa phone-size na screen. | ❔ Not verified |
| SP-R8 | Supplier na walang portal (Taobao, HC System, one-off): buyer ang nag-eenter ng update, kasama ang petsa ng pangyayari | Wala. **Ayos (hakbang 5):** ang buyer ay may "Report an event" at "Report a delay" sa Shipments na may petsa ng pangyayari at kung sino ang nagsabi; ang supplier na walang portal ay wala pang sariling record. | ⚠️ Partial |
| Digest | Daily digest bawat supplier | Wala (in-app lang). | ❌ Missing |

### 4.8 Procurement Dashboard (`02/08`)

| Block | Spec | Current | Status |
|---|---|---|---|
| Today | Act now, Tell the customer, decisions waiting (air upgrade, day-3), PRs needing manual quote, POs not acknowledged | Wala. May 8 KPI cards (PR count, active PO, open exceptions, inquiries, in transit, pending receiving, open RR, suppliers). **Ayos (hakbang 10):** bagong seksyong "What needs action today" sa tuktok ng Dashboard: Act now, Tell the customer, Broken, Decisions waiting (air / day-3 / bagong target), PRs na kailangan ng manual quote, POs na hindi pa na-acknowledge, at ang unang mga gagawin. | ✅ OK |
| Born-late rate | % ng lines na raised na may shortfall, weekly — **main procurement number** | Wala. **Ayos (hakbang 10):** ang % at ang weekly trend (8 linggo), galing sa `Lines_Born_Late` / `Lines_Raised`; may test na tugma sa manual count. | ✅ OK |
| On-time arrival | % lines na dumating sa planned arrival, by supplier | Wala. **Ayos (hakbang 10):** % ng lines na dumating sa planned arrival, kabuuan at bawat supplier. Ang plano ay kinukuwenta ulit mula sa PO date at settings, kaya ang delay report ng supplier (na naglilipat ng plano) ay hindi nagtatago ng huling dating. | ✅ OK |
| Supplier scorecard | Lead planned vs actual, late starts, ladder rungs, reporting lag, damage rate (fault origin = supplier) | Wala ("Top Suppliers by Spend" ay ibang bagay). **Ayos (hakbang 10):** lead time planned vs actual, late starts, ladder rungs, reporting lag, at damage rate kapag ang fault ay supplier. | ✅ OK |
| Pipeline | Lines by stage (production / shipout / transit / receive) + pinakamatandang Order Date | May status breakdown bilang lang; walang Order Date. **Ayos (hakbang 10):** lines bawat stage (production, ship out, in transit, at warehouse) na may pinakamatandang Order Date. | ✅ OK |
| Replacements | Open RRs oldest first + rework rate | Open RR count + RR status breakdown. **Ayos (hakbang 10):** bukas na RR (oldest muna) at ang rework rate (tinatantya). | ✅ OK |
| Rules | Costs/spend lang kay buyer / supervisor / admin; bawat numero ay link sa listahan | Walang role gate; hindi ko na-check ang links. **Ayos (hakbang 10):** bawat numero ay link sa listahan sa likod nito (Shipments, PO list, PR list, Decisions, RR list), na nasubukan sa browser. Walang role gate (naka-hold). | ⚠️ Partial |

### 4.9 Shared Engine 01 — Sorting Engine (para sa Procurement)

| Item | Spec | Current | Status |
|---|---|---|---|
| Method | scan → categorise → sort → suggest; plain code, deterministic | Walang engine. Ang PR ay may sariling score (C8). **Ayos:** para sa shipments lang. | ⚠️ Partial |
| Categories | `act_now`, `tell_customer`, `watch`, `on_track`, `blocked` | Wala. Ang mga input para sa `blocked` ay meron na (hold, walang supplier, walang presyo — `PR_Check_Readiness`). **Ayos:** shipments lang (act_now, tell_customer, watch, on_track, blocked). | ⚠️ Partial |
| "Date needed" | `target − fulfillment_days − delivery_days` vs forecast **pickable** (arrival + receiving) | Wala. **Ayos:** shipments lang. | ⚠️ Partial |
| Sort key | Manual urgent → `order_date` asc → `target_delivery` asc → record number | PR number desc (C1). **Ayos (hakbang 4, tinama ang status 2026-11-17):** ang PR, Shipments at Receiving ay gumagamit na ng iisang `rank` (oldest Sales Order muna); ang Inquiry at PO list ay may sarili pa ring sort. | ⚠️ Partial |
| SE-2 | Rank work units: PO lines (grupo by shipment sa display); lahat ng line ng isang SO ay magkakasama | Wala. **Ayos:** shipments lang. | ⚠️ Partial |
| SE-3 | I-score ang buong open list, saka i-filter | Client-side sort ng nakikitang list. **Ayos:** ang buong listahan ng shipments ang ini-score; ang PR queue ay client-side pa. | ⚠️ Partial |
| SE-4 | Setting `sort_primary_key` (`order_date` / `target_delivery`) | Wala. | ❌ Missing |
| SE-5 | Isang ranking sa lahat ng screen | Bawat widget may sariling sort. | 🔴 Conflict |
| Suggest | `category`, `queue_rank`, `priority_reason`, `suggested_action`, `suggested_release`, `scored_at` sa record; `suggested_actions` lookup (editable ni Admin) | Wala. **Ayos:** shipments lang; ang lookup ay constant, hindi table. | ⚠️ Partial |
| Aging guard | 7 d flag · 14 d exception + supervisor · 21 d escalate kay Admin; imported records bilang mula sa import date | Wala. | ❌ Missing |
| Run | Nightly 05:00 PH + bawat material event + **Recalculate** button; `job_runs`; "ranking is stale" banner (>26 h) | Walang scoring / ranking job. Ang tanging nightly job na may kinalaman ay `Forecast_Stamp_Daily` (01:00 Manila, nakarehistro sa Fulfillment module) at ito ay forecast stamp lang; walang `job_runs` / stale banner. **Ayos:** may daily full re-score (`Shipment_Ladder_Daily`); wala pang `job_runs` / stale banner. | ⚠️ Partial |
| Manual urgency (M1) | Pangalan + dahilan, sales agent humihiling, supervisor nag-a-approve, expires (target o 14 d), hindi pwedeng ibaba, sorts first **sa loob ng category**; babala kapag >5% | Wala (`urgent*` fields, `urgency_requests`). | ❌ Missing |

### 4.10 Shared Engine 03 — Dates and Forecast

| Rule | Spec | Current | Status |
|---|---|---|---|
| DT-1 | **Order Date** (Books SO date) ay kinokopya sa bawat downstream record, hindi tina-type | Wala sa Procurement forms. May `PR_Date`, `Added_Time`, at `SO_Created_Date` sa Fulfillment. **Ayos:** `Order_Date` sa shipments lang. | ⚠️ Partial |
| DT-2 | Kapag binago ng Books ang SO date: open records lang ang ina-update; re-score + re-forecast | Wala (walang Books sync). | ❌ Missing |
| DT-3 | **Order Age** = today − Order Date; humihinto sa delivery | Wala. | ❌ Missing |
| DT-4 | Pagbabago ng Target: dahilan + old/new + sino + "customer told?" → `target_date_changes` | Wala. `PR_Lock_After_PO` ay humaharang lang ng pagbabago pagkatapos ng PO. **Ayos 2026-11-17 (hakbang 2):** sa shipments: kailangan ng dahilan at naka-log sa `Target_Date_Changes` (luma, bago, sino, customer told). | ⚠️ Partial |
| DT-5 | Hindi ino-overwrite ng forecast ang target; **propose** sa approval queue (`forecast_promise_change`) | Hindi ino-overwrite ✅ (hiwalay na `Forecast_*` fields); walang approval queue. **Ayos 2026-11-17 (hakbang 2):** sa shipments: ang forecast ay nagpo-propose lang sa Decisions (`forecast_promise_change`) at hindi nagbabago ng target nang mag-isa. | ⚠️ Partial |
| DT-6 | RR Target: orihinal kung nasa hinaharap, kung hindi today + 21 d | Wala (RR-R3). | ❌ Missing |
| DT-7 | `quotation_date` ay itabi (hindi sa sort) | Wala. | ❌ Missing |
| DT-8 | Display order: Order Date · Target · Forecast, tapos Order Age at "slipped N days" | Wala. Forecast fields meron sa PR / Shipments / Receiving (Forecast_Delivery / Window / Status). **Ayos:** Order Date / Target / Date needed / Forecast pickable sa Shipments. | ⚠️ Partial |
| Forecast chain | Hindi pa PO / nasa PO / received / scheduled / delivered (frozen + forecast error) | May "positions" (Procurement, In transit, At WH, Stock on hand, prep stages) pero naka-anchor sa PR Added_Time (C6); walang freeze. | ⚠️ Partial |
| FC-1 | Recompute sa bawat stage event at nightly | Sa PR save at Fulfillment saves (walang Shipments / Receiving / PO hook) + nightly `Forecast_Stamp_Daily` 01:00 ✅. Hindi event-driven sa bawat stage event. | ⚠️ Partial |
| FC-2 | `forecast_history` na may cause event | Wala. | ❌ Missing |
| FC-3 | `forecast_window` ± 3 d sa dagat | Min–max ranges mula sa settings (hal. 35–60 d, napakalapad); text na "Mmm dd - Mmm dd". | ⚠️ Partial |
| FC-4 | Buwanang forecast error by stage | Wala. | ❌ Missing |
| Status values | `on_time / at_risk / late` | `No Start Date / No Client Date / On Track / At Risk / Will Miss / Overdue` — iba ang pangalan; walang target = "No Client Date" (spec: `order_date + default_promise_days` (25), hindi ibinababa). | ⚠️ Partial |

### 4.11 Shared Engine 04 — Timestamps at Event Log

| Rule | Spec | Current | Status |
|---|---|---|---|
| Event log | `stage_events` (server lang ang sumusulat) | Wala. May `*_Timeline` forms (PR, Inquiry, Shipment, Receiving, Exception): `Action_Title`, `Action_Type`, `Changes`, `Actor`, `Logged_On` — free-text log na gawa ng widget component (`timeline-history.js`); hindi ko na-verify kung server ang nagsusulat. **Ayos:** `Stage_Events` para sa shipments (shipout, production, arrival, chase). | ⚠️ Partial |
| T-1 | Isang stamp bawat pasok sa stage | Kalat na date fields (`Sent_On`, `Acknowledge_On`, `Ship_Out_Date`, `Arrival_Date`, `Received_Date`, `Opened_On`, `Closed_At`). | ⚠️ Partial |
| T-2 | Server lang; walang user na pwedeng mag-type/mag-edit (form, screen, import, API) | Computed ng workflow pero pwedeng i-edit via API (C9). **Ayos:** server-only na sa shipments; ang iba ay hindi pa. | ⚠️ Partial |
| T-3 | `occurred_at` + `reported_at` | Wala (isang petsa lang; typed). **Ayos:** sa shipments events. | ⚠️ Partial |
| T-4 | Walang button na ang tanging gawain ay mag-record ng oras | Hindi ko in-audit ang UI. | ❔ Not verified |
| T-5 | `occurred_bound = 'before'` kapag order lang ang alam | Wala. **Ayos:** "before" bound sa implied events. | ⚠️ Partial |
| T-6 | Unang pasok lang ang stamp; pagbalik = bagong row na `visit_no = 2` | Nao-overwrite (C9); walang `visit_no`. **Ayos:** shipments lang; may `Visit_No`. | ⚠️ Partial |
| T-7 | **Silence is an alert** — `expected_windows` | Wala. **Ayos:** ladder at "hindi pa dumarating sa port" lang; ang ibang windows ay wala. | ⚠️ Partial |
| T-8 | Standard stamps: Created At/By, Modified At/By (tao o pangalan ng automation) | Zoho built-ins (`Added_Time`, `Modified_Time`, `Added_User`). Walang `updated_by_automation`. | ⚠️ Partial |
| T-9 | Imported records: dash kung walang stamp; hindi nag-iimbento ng petsa | — | ❔ Not verified |
| T-10 | Stamps sa exports at filters; "In this stage since" sa listahan | Wala. | ❌ Missing |
| Procurement events | inquiry (sent, first_quote_received, supplier_selected), PR (ready_for_po, held, resumed, converted, cancelled), PO (sent, acknowledged, closed), shipment (6 events), receiving (counted, binned, available), exception/RR (raised, resolved, rr_created, rr_acknowledged, replacement_received) | Iilang lang ang meron bilang field: PO sent/ack/completed, PR hold date, RR ack/closed, exception opened, shipment ship-out/arrival. Ang iba ay wala. | ⚠️ Partial |
| Expected windows (Procurement) | PO sent → ack **1 d** · ack → production_started **PO+1** · production planned end → finished **0 d** · shipped_out → arrived_port **transit+3** · arrived → counted **1 d** · counted → binned **1 d** · binned → available **2 h** | Walang isa man. **Ayos:** PO+1 production start at transit+3 arrival lang. | ⚠️ Partial |

### Tally (kinuwenta mula sa mga talahanayan sa itaas)

| Section | OK | Partial | Missing | Conflict | Not verified | Kabuuan |
|---|---:|---:|---:|---:|---:|---:|
| 4.1 Inquiry (`02 Procurement/01 Inquiry`) | 4 | 5 | 1 | 1 | 0 | 11 |
| 4.2 Purchase Request at Pricing (`02/02`) | 4 | 6 | 2 | 0 | 0 | 12 |
| 4.3 Purchase Order at Feasibility Gate (`02/03`) | 9 | 3 | 1 | 0 | 0 | 13 |
| 4.4 Ship & Track at Supplier Ladder (`02/04`) | 7 | 8 | 1 | 0 | 1 | 17 |
| 4.5 Receiving (`02/05`) | 5 | 4 | 1 | 0 | 1 | 11 |
| 4.6 Exceptions at Replacement Request (`02/06`) | 4 | 4 | 0 | 0 | 1 | 9 |
| 4.7 Supplier Portal (`02/07`) | 1 | 5 | 2 | 0 | 2 | 10 |
| 4.8 Procurement Dashboard (`02/08`) | 6 | 1 | 0 | 0 | 0 | 7 |
| 4.9 Shared Engine 01 — Sorting Engine (para sa Procurement) | 0 | 8 | 3 | 1 | 0 | 12 |
| 4.10 Shared Engine 03 — Dates and Forecast | 0 | 8 | 6 | 0 | 0 | 14 |
| 4.11 Shared Engine 04 — Timestamps at Event Log | 0 | 10 | 1 | 0 | 2 | 13 |
| **Kabuuan** | **40** | **62** | **18** | **2** | **7** | **129** |


---

## 5. Kulang na fields (spec vs current)

Pinagkunan ng "current": `zoho-export/parsed/forms/*.json`. Ang spec field names ay mula sa `01 Database` §5 at sa mga module docs. **Bold** = kailangan para sa mga rule sa taas.

### 5.1 Sa lahat ng procurement record (Database §1)
| Spec | Current | Aksyon |
|---|---|---|
| **The three dates**: `order_date`, `order_age_days`, `target_delivery`, `forecast_delivery`, `forecast_window`, `forecast_status` | May `Target_Delivery`, `Forecast_Delivery / Window / Status` sa PR, Shipments, Receiving. **Walang `order_date`** at order age. | Idagdag ang `order_date` (kinokopya mula sa SO, DT-1) sa PR, PO (earliest), PO line, Shipment (earliest), Receiving, Exception, RR. |
| **Queue columns**: `category`, `blocked_reason`, `blocked_owner_id`, `queue_rank`, `priority_reason`, `suggested_action`, `suggested_release`, `scored_at` | Wala | Idagdag sa PR, PO line, Shipment (Engines 01). |
| Standard columns: `created_by`, `updated_by`, `updated_by_automation` | Zoho `Added_User`, `Modified_User`; wala ang `updated_by_automation` | Idagdag. |
| Human reference sa sequence | `PR_No`, `PO_No`, `Shipment_No`, `Receive_No1`, `RR_No`, `Exception_No`, `INQ_No` ✅ (highest+1, C14) | Gawing sequence. |

### 5.2 Inquiry (`inquiries`, `inquiry_lines`, `supplier_quotes`, `supplier_quote_prices`)
| Spec field | Current | Aksyon |
|---|---|---|
| `status` (`draft / sent / quoted / selected / closed`) | Wala; hinuhugot sa quote `Stage` at `Estimate_Created` | Idagdag ang `status`. |
| `estimate_pushed_at` | `Estimate_Created` (boolean) + `Books_Estimate_ID` | Idagdag ang timestamp. |
| **`inquiry_lines`** (header + lines) | Flat: isang Inquiry record = isang item; `quote_group` ang nag-uugnay | Isaalang-alang ang header + lines (o panatilihin ang `quote_group` at isulat na desisyon). |
| `lead_time_days` (numeric) | `Lead_Time` **text** | I-convert sa integer; kailangan ng feasibility. |
| `supplier_quote_prices` (restricted: initial / negotiated / currency) | Presyo (`Initial_Price`, `Negotiated`, `Final_Price`, CNY) ay nasa **parehong subform** ng availability at lead time | Hiwalay na restricted table / view; ang sales agent ay hindi nakakakita (C12). |
| `selected` per line | `Selected` ✅ | — |
| `inquiry.sent / first_quote_received / supplier_selected / estimate_pushed` | Wala | `stage_events`. |

### 5.3 Purchase Request (`purchase_requests`, `pr_costing`)
| Spec field | Current | Aksyon |
|---|---|---|
| `sales_order_id` + **`sales_order_line_id`** | `Sales_Order` (text); walang line | Idagdag ang line link (isang PR bawat SO line). |
| **`supplier_id`** | `Selected_Supplier` (text) | C2. |
| **`pricing_status`** (`needs_pricing / auto_priced / needs_manual_quote`) | Wala | Idagdag (PR-R5). |
| **`feasibility`** (`feasible / at_risk / impossible`), **`earliest_feasible_date`**, shortfall days, air option | Wala (may `Delay_Status`, `Remaining_Days`) | Idagdag (PR-R6). |
| `status` (`open / ready_for_po / on_hold / converted / cancelled`) | `PR_Status` (Open / Converted to PO) + `Hold_Status` + `PR_READY_FOR_PO` | Isang enum (C16). |
| `hold_reason` | `Hold_Reason`, `Hold_Notes`, `Hold_Date`, `Held_By`, `Hold_Follow_Up_Date` ✅ | Idagdag ang `resumed` / `cancelled` events. |
| **`pr_costing`**: `selected_final_cost`, `approved_srp`, `price_source` | `Selcted_Final_Cost` (typo sa pangalan), `SRP_Approved_PR`, `SRP_Rate_PR` nasa mismong PR (hindi restricted); walang `price_source` | Ilipat sa restricted table; ayusin ang typo; idagdag ang `price_source` (rate card / recent PO / landed + markup). |
| `pr.created / ready_for_po / held / resumed / converted / cancelled` | `Added_Time`, `Hold_Date` lang | `stage_events`. |
| Para sa **Order Date** ng manual PR (stock) | Wala | Gamitin ang creation date. |

### 5.4 Purchase Order (`purchase_orders`, `po_lines`, `po_costing`)
| Spec field | Current | Aksyon |
|---|---|---|
| **`supplier_id`** sa header | Nasa line (`Supplier`, text) | C2/C3. |
| **`shipment_mode`** sa header | Nasa line (`Shipping_Mode`) | PO-R4. |
| **`born_late`**, **`shortfall_days`**, **`feasibility_note`** | Wala | Idagdag (PO-R1). |
| **`deposit_paid`**, **`deposit_amount`** (restricted) | Wala | Idagdag (PO-R7). |
| earliest order date at target ng PO | Wala (isang `SO_No` at `Customer`) | Idagdag. |
| `status`: `draft / sent / acknowledged / closed / cancelled` | C16 | — |
| `po_lines`: **planned dates** (production start/end, shipout, arrival, pickable), queue columns | `Production_Date`, `supplier_target_date`, `Remaining_Days`, `Delay_Status`, `Required_Days_Lead` lang | Idagdag ang buong planned chain mula sa feasibility function. |
| `po_costing`: `unit_cost`, `currency` | `Final_Price` (CNY) nasa line (hindi restricted) | Restricted. |
| `po.created / sent / acknowledged / closed / cancelled` | Date lang (C9) | `stage_events`. |

### 5.5 Shipments (`shipments`, `shipment_lines`)
| Spec field | Current | Aksyon |
|---|---|---|
| `supplier_id`, **`mode`** sa header | `Supplier` (text); mode nasa lines | C2. |
| **`forwarder`**, **`tracking_ref`** | Wala | Idagdag. |
| `stage`: `production / shipped_out / arrived_port / customs_cleared / arrived_warehouse / received` | `Shipment_Status`: Pending / In Transit / Arriving In 1 Week / Delivered / Delayed | Palitan (C15). |
| **planned dates bawat stage** + **actual dates bawat stage** | `ETD`, `ETA`, `Estimated_Warehouse_Arrival`, `Supplier_Target_Date`; actual: `Ship_Out_Date`, `Arrival_Date` | Idagdag: `production_started/finished`, `shipout`, `arrived_port`, `customs_cleared`, `arrived_warehouse` (planned + actual). |
| **`last_supplier_update_at`**, **`last_chase_at`** | Wala | Idagdag (para sa "no response 7 d → Escalate"). |
| **Attachments**: sections `production_photo`, `shipment_photo` (+ packing list) | Wala | Idagdag; required ang production photo bago umalis sa Production (ST-R3). |
| `occurred_at` / `reported_at` bawat actual | Wala | `stage_events`. |
| days late, next step, category | `Risk_Status`, `Need_Attention` | Mula sa sorting engine. |
| `order_date` (earliest) | Wala | DT-1. |

### 5.6 Receiving (`receivings`, `receiving_lines`)
| Spec field | Current | Aksyon |
|---|---|---|
| `warehouse_id` | `Warehouse` (text) | FK. |
| `bin_id` (totoong bin) | `Bin_location` picklist = "Receiving Area" lang | `bins` table; kailangan para sa `available`. |
| **`counted_at`, `binned_at`, `available_at`** | Wala (may `Received_Date`) | Server stamps. |
| `receiving.arrived` (gate log) | Wala | Gate log entry o "before first count". |
| Damage: `fault_origin`, `found_stage = receiving` | `Root_Cause_Category` (7 values, hindi mapped) | Mapping table: Production Damage / Different product / Wrong Item → `supplier`; Shipping Damage → `transit`; iba → `unknown`. |
| `receiving.exception_raised` | Wala | Event. |

### 5.7 Exceptions (`exceptions`)
| Spec field | Current | Aksyon |
|---|---|---|
| `record_type`, `record_id` | `PO_No`, `Shipment_No`, `Receive_No`, `Receiving_Line_ID` (text) | Pwedeng panatilihin bilang FK. |
| **`found_stage`**, **`caused_stage`**, **`fault_origin`** (`supplier / transit / warehouse / site / unknown`) | Wala (`Source_Module`: Receiving / Fulfillment EXC) | Idagdag. |
| `status`: `open / rework / rr_created / closed` | `Open / Under Review / Waiting / Resolved / Closed` | Magdesisyon: ikulong sa spec o i-map. |
| `exception.resolved` stamp | Hindi nai-store | Event. |

### 5.8 Replacement Request (`replacement_requests`)
| Spec field | Current | Aksyon |
|---|---|---|
| **`target_delivery`** (RR-R3) | Wala | Idagdag + `rr_default_days` setting. |
| **`order_date`** (ng orihinal na SO) | Wala | DT-1. |
| `original_so_id` | `RR_SO` (text) | FK. |
| **`original_supplier_id`**, `supplier_id`, `supplier_changed_reason` | `RR_Supplier` (text); override at reason ay nasa Exception | Ilipat sa RR. |
| category `broken` | Wala | Sorting engine. |
| `rr.created / acknowledged / replacement_received` | `RR_Date`, `Supplier_Acknowledge_Date`, `Closed_At` (date lang) | Events. |

### 5.9 Suppliers (`suppliers`)
| Spec field | Current (`Suppliers` form) | Aksyon |
|---|---|---|
| `name`, `display_name` | `Supplier_Name` | — |
| **`default_production_days`**, **`default_consolidation_days`** | Wala | Kailangan ng feasibility (default 20 / 3). |
| **`is_main_supplier`** (Fenteng, Tony Fan → supervisor sa day 3) | Wala | Idagdag. |
| `portal_enabled`, `language`, `contact_email`, `wechat`, `country` | Wala (hard-coded ang Tony/Fenteng) | Idagdag. |
| (extra sa Zoho) `Supported_Categories`, `Handles_All`, `Max_Capacity`, `Active_PO_Count`, `Utilization`, `Status` | Meron | Tingnan ang §6.4. |

### 5.10 Mga shared na table na wala pa
`stage_events` · `expected_windows` · `ladder_events` · `approval_queue` (`ladder_day3`, `air_upgrade`, `forecast_promise_change`) · `target_date_changes` · `forecast_history` · `urgency_requests` · `suggested_actions` · `next_steps` · `job_runs` · `attachments` (sections) · `message_templates` · `outbound_messages` · `roles` / `staff_roles` · `bins`.
Meron na (partial): `policy_settings` → `Policy_Settings` form (Key / Description / Value / Type; walang min / max / default / history); `notifications` → `App_Notifications` (walang severity / record_type); messages → `PO_Messages`, `PR_Messages`, `Inquiry_Messages`.

### 5.11 Settings na kailangang ilagay sa Control Panel (lahat ng **[DEFAULT]** ng Procurement)
`proc_watch_slack_days` 7 · `at_risk_slack_days` 3 · `sort_primary_key` order_date · `default_promise_days` 25 · aging 7 / 14 / 21 · nightly 05:00 · `urgency_warning_pct` 5% · production days 20 · consolidation 3 · transit LCL / FCL 30, Air 14 · receiving 2 · fulfillment 3 · delivery 2 · PO ack window 1 d · `inquiry_quote_days` 2 · `rr_default_days` 21 · forecast window ± 3 d · `auto_cancel_max_value` (auto-cancel OFF) · ladder rungs/days/actions · `expected_windows` rows.

---

## 6. Shared engines — recommended design (base sa spec)

### 6.1 Sorting Engine (Procurement)
1. **Scan** lahat ng open PO lines / shipments / PRs (SE-3: buong listahan, hindi ang nakikita lang).
2. **Categorise** (Blocked muna): `blocked` (PR on hold, walang presyo, walang supplier, SO voided) → `act_now` (forecast arrival hindi aabot sa date needed **at** may magagawa pa: hindi pa shipped out / hindi pa nagsisimula ang production / may ladder rung na) → `tell_customer` (hindi aabot at wala nang magagawa) → `watch` (slack ≤ `proc_watch_slack_days`) → `on_track`.
   `date_needed = target_delivery − fulfillment_days − delivery_days` vs `forecast_pickable = arrival + receiving_days`.
3. **Sort** sa loob ng category: `urgent` (hindi expired) → `order_date asc` → `target_delivery asc` → record number. RR = `broken`, laging nasa itaas.
4. **Suggest**: isulat sa record ang `category`, `queue_rank`, `priority_reason` (plain words, hal. "SO dated 2 Oct (45 days) · 6 days past target"), `suggested_action` (mula sa `suggested_actions` table), `scored_at`.
5. **Kailan tumatakbo**: nightly 05:00 PH, sa bawat material event (stage change, Books date change, target change, urgency, exception), at **Recalculate** button. `job_runs` row + "ranking is stale" banner kapag >26 h.
6. **Aging guard** 7 / 14 / 21 d; **manual urgency (M1)** sa `urgency_requests`.
7. Alisin ang PR-number sort at ang auto `Priority_Score`. Isang endpoint ang ginagamit ng PR queue, PO list, Ship & Track, Receiving Arrivals.
8. **Acceptance (mula sa spec):** dalawang run sa parehong data = parehong rank; ang pagbabago ng target ay nagre-re-rank sa lahat ng screen sa loob ng 1 min; ang pagpalit ng `sort_primary_key` ay walang code change.

### 6.2 Dates at Forecast
- Idagdag ang `order_date` (mula sa SO) sa bawat record; palaging ipakita nang magkakasama: **Order Date · Target · Forecast**, Order Age, "slipped N days".
- Isang `forecast()` function (parehong inputs ng `feasibility()`): gumagamit ng **actual** kung meron (ack, production started/finished, shipout, arrived_port, customs, arrived_warehouse), **planned** kung wala. Hindi PR `Added_Time` ang anchor.
- Sulat sa `forecast_history` (cause event) bawat pagbabago; sa delivery, i-freeze at itabi ang `forecast_error`.
- `target_date_changes` (dahilan, old, new, sino, customer told). Ang forecast ay **nagpe-propose lang** (`forecast_promise_change` sa approval queue); hindi nagbabago ng target.
- Window: ± 3 d sa dagat (setting) sa halip na min–max ranges.
- Status: `on_time / at_risk / late`; walang target → `order_date + default_promise_days`, may "no target set" sa reason.

### 6.3 Timestamps at Event Log
- `stage_events` (`record_type`, `record_id`, `event`, `occurred_at`, `reported_at`, `occurred_bound`, `source`, `actor_id`, `visit_no`) — **server lang** ang may write; unique constraint sa `(record_type, record_id, event, visit_no)`.
- Ang supplier portal / forwarder / receiving ay **nag-ge-generate ng event bilang side effect** (T-4). Ang "Sent_On / Acknowledge_On / Completed_On / Ship_Out_Date / Arrival_Date" ay maging views ng event log.
- `expected_windows` (12 windows para sa Procurement, nakalista sa §4.11) + araw-araw na check na nagre-raise ng alert (silence = alert). Daily reporting lag report bawat supplier.
- Migration: ang kasalukuyang `*_Timeline` records ay pwedeng i-import bilang events na may `occurred_bound` / dash kapag walang eksaktong oras (T-9).

### 6.4 Mga bagay na meron sa current pero **wala sa spec** — keep o drop?
| Feature sa current | Rekomendasyon |
|---|---|
| `Followed_Recommendation` + `Override_Reason` sa PR/PO line | **Keep** — mabuting audit; idagdag sa spec bilang "override reason" (PR-R4). |
| Supplier load-balancing (`Max_Capacity`, `Active_PO_Count`, `Utilization`, `Load_Status`) | Ipakita bilang impormasyon lang; **huwag gamitin sa recommendation** (PR-R4: hindi batay sa dami ng PO). Tanungin kung kailangan pa. |
| Auto `Priority` / `Priority_Score` / `Order_Value` | **Drop** (C8); papalitan ng Sorting Engine. |
| Spare-part / repair details sa Damage (`Repairable`, `Repair_Outcome`, `Spare_Part_Type`) | **Keep** — kailangan sa RR-R1 ("repair checks run first, unchanged"). |
| `Sourcing_Type = Local` / "HC System" | **Keep** — tugma sa RR-R1 at SP-R8; kailangan ang RR-R2 fix. |
| Projects, commission, group discount, For_Bidding, product specs (Color temp, Type of bulb, …) | Wala sa Procurement spec; tanungin ang owner kung sa Inquiry/Estimate pa rin kailangan. |
| Label_Ready / Label_Printed sa Receiving | Wala sa spec; tanungin ang warehouse. |
| Akeneo / Shopify integrations | Wala sa Procurement spec (nasa `06 Integrations`, hindi ko binasa). |

---

## 7. Recommended order ng trabaho (sunod sa spec Build Phases 0–2)

| Hakbang | Laman | Bakit una | Sino ang naaapektuhan |
|---|---|---|---|
| **A. Foundation (Procurement side)** | Settings sa Control Panel (§5.11) · `stage_events` + `expected_windows` · `supplier_id` kahit saan (C2) · roles + restricted views (C12) · `order_date` / `target` / `forecast` sa lahat ng record · sequences (C14) · tanggalin ang SRP sa supplier copies (C11) | Kung walang stamp at dates, walang masusukat; ang C11 ay confidentiality | Lahat |
| **B. Feasibility + PO** | Isang `feasibility()` function · PR `pricing_status` / `feasibility` · Create PO gate (A / B / C) · PO grouping by supplier + mode · `approval_queue` (`forecast_promise_change`, `air_upgrade`) · `born_late`, `shortfall_days`, deposit fields | Dito nagagawa ang karamihan ng late deliveries | Buyer, sales agent |
| **C. Ship & Track + Supplier ladder** | 4 stages planned vs actual · Production screen + photos (required) sa portal · `occurred_at` / `reported_at` · ladder (day 1/2/3, `ladder_events`) · silence alerts · tracker role | Ito ang "built first" na module sa spec | Buyer, tracker, supplier |
| **D. Sorting Engine (Procurement)** | Categories · queue columns · nightly job + `job_runs` + stale banner · aging · manual urgency · palitan ang PR-number sort | Kailangan ng B at C (forecast at stages) | Lahat ng queue screen |
| **E. Receiving + Exceptions + RR** | 4 events · `bins` · `fault_origin` / `found_stage` · RR Target Delivery · Broken category · HC System clone shipment (RR-R2) · Arrivals screen | "Received" = pickable bago mag-trust ang Fulfillment | Receiver, buyer |
| **F. Dashboard** | Today · Born-late rate · On-time arrival · Supplier scorecard · Pipeline · Replacements | Kailangan ng data mula sa A–E | Buyer, supervisor |

**Dependency sa Books:** PR-R1 (SO → PR), PR-R2 (auto-hold sa void), INQ-R5, PO-R6, RCV-R1 ay nangangailangan ng Books integration (Plan - Finish Procurement M7 at ang Books half ng `approve_po_*`, `create_bin_receiving`). Wala pa ito sa app ngayon; ito ay hiwalay na desisyon mo.

---

## 8. Mga tanong / desisyon na kailangan mula sa iyo

| # | Tanong | Bakit mahalaga | Default na gagawin ko kung walang sagot |
|---|---|---|---|
| 1 | Dito ba sa current Node app ilalagay ang spec (A–F), o sa bagong stack ng spec (D2: FastAPI + Supabase + HTMX)? | Pareho ang mga table / rule; iba ang gagawin sa code | Dito sa current app, stack-neutral ang disenyo |
| 2 | Gusto mo bang **PO = supplier + mode (pinagsama ang maraming SO)** gaya ng spec (C3), o panatilihin ang **PO bawat SO**? | Binabago nito ang Create PO, ang Tony/Fenteng PO copies, at ang Shipments | Sundin ang spec |
| 3 | I-drop ba ang awtomatikong LCL → Airfreight (<30 araw) at ang "−4 araw" na buffer? | C4 | I-drop; buyer ang pipili sa gate |
| 4 | Ano ang tunay na transit days? Spec: LCL/FCL **30**, Air **14**. Forecast engine ngayon: LCL/FCL **35–60** + customs 7–10, Air **5–7** + 2–3 | C5 — iba ang resulta ng forecast | Spec defaults, pagkatapos sukatin ang totoong data |
| 5 | Sino ang gagawa ng supplier logins at paano ang Tony (Chinese)? (Plan tanong #6) | SP-R6; kailangan ng `supplier_user` role | Admin ang gagawa; EN / 中文 toggle |
| 6 | Ilalagay ba ang SRP sa supplier portal para sa anumang dahilan? | C11 | Hindi — tanggalin |
| 7 | Itutuloy ba ang Books integration (SO → PR, PO, Receive, Estimate)? | Maraming rule ang nakadepende (§7) | Hiwalay na milestone |
| 8 | Kailangan pa ba ang supplier load-balancing display, Projects / commission, Label printing? | §6.4 | Keep bilang display, hindi sa ranking |

---

## 9. Ano ang **hindi ko na-verify** (huwag munang ituring na tapos)

- **Static review lang ito:** binasa ko ang code at ang Zoho export; **hindi ko pinatakbo ang app o ang tests**, at walang browser check.
- Ang Zoho export (`zoho-export/`) ay snapshot (10-Nov-2026); hindi ko tiningnan ang live Zoho.
- Sort direction ng `PO.html` at `Shipments` widgets: nakumpirma ko ang PR widget (newest first); ang iba ay may sort pero hindi ko binasa ang direksyon.
- Mga ❔ na nakalista sa §4 (INQ-R2, PO-R8, grouping row-save, RCV-R5, RR-R7, SP-R2/R3/R7, T-4, T-9, dashboard links).
- Ang mga hindi ko binasang spec docs na may kinalaman: `05/05 Exceptions, Alerts and Notifications`, `05/06 Next Step and Approval Queue`, `05/08 Control Panel`, `06 Integrations`. Ang approval queue, digest/notifications, at Control Panel ay dependencies ng A–C; kailangang basahin bago i-build.
- Ang Port Status sa vault ay naglilista pa ng `approve_po_*` bilang "Not ported yet", pero may `po-approval.mjs` na sa code (commit `885ec51`); sa code ako sumunod.

---

## 10. Progress (2026-11-17): unang hakbang ng pag-apply — Shipments (Ship & Track)

**Tapos at na-test** (24 bagong tests, buong suite pumasa, at nakita sa browser sa hiwalay na local DB):
| Item | Status |
|---|---|
| ST-R1 / C7: planned dates ay computed (PO date + 1 + production + consolidation + transit + receiving), hindi na tina-type | ✅ |
| T-2, T-3, T-5, T-6 / C9: server-only stamps, `occurred_at` + `reported_at`, `before` bound, unang stamp lang (`Stage_Events`) | ✅ para sa shipments |
| ST-R3: production photo required bago umalis sa Production | ✅ buyer/tracker screen · ⚠️ hindi pa sa supplier-reported shipout |
| ST-R5: shipout = "production finished, before" | ✅ |
| Stages (production → shipped_out → arrived_port → customs_cleared → arrived_warehouse → received) | ✅ (legacy `Shipment_Status` sumusunod pa rin para hindi masira ang widget) |
| Sorting Engine para sa shipments: act_now / tell_customer / watch / on_track / blocked, oldest Order Date first, `queue_rank`, `priority_reason`, `suggested_action` | ✅ |
| Supplier ladder (rung 1/2/3, isang beses bawat rung, day 3 = Approval Queue, walang auto-cancel) + silence alert na "hindi pa dumarating sa port" | ✅ (`Shipment_Ladder_Daily` 08:10) |
| Order Date (DT-1), PO Date, Forwarder, Tracking Ref, Last Supplier Update, Last Chase | ✅ |
| Settings sa `Policy_Settings` (production 20, consolidation 3, transit 30/14, receiving 2, ...) | ✅ (defaults sa code) |

**Hindi pa (susunod na hakbang):** Supplier Portal (Production screen, photos, Today, role `supplier_user`); mas maraming photos bawat shipment; roles at pagtatago ng costs (C12); PR/PO (feasibility gate, PO per supplier + mode, `supplier_id`); Receiving (bins, 4 events); RR (target, Broken, fault origin); Dashboard blocks; aging alerts at manual urgency; screen para sa Approval Queue; Control Panel rows.

**Mga nagbago sa repo mula sa review (ibang commits):** `clone_shipment_for_replacement` ay naka-port na (RR-R2 sa server), may daily shipment schedules (10-day notice at delay status), at may concurrency-safe numbering (C14). Ang mga ito ay bahagyang nagpapabago sa §4.6 at §3 C14.

**Railway:** read-only na tiningnan. Kapag nag-start ang bagong code sa Railway, 3 bagong tables at 36 bagong columns sa `Shipments` ang idadagdag (additive lang, walang buburahin). **Hindi pa ito na-apply** — hinihintay ang go mo.


---

## 11. Mga bahagi ng spec na hindi ko pa nababasa noong una (nadagdag sa review, 2026-11-17)

Walang bagong file sa spec folder (pareho ang petsa ng lahat: 16 Nov 22:32). Ang "nadagdag" ay ang mga docs na hindi ko pa nabasa noon: `05/05 Exceptions, Alerts and Notifications`, `05/06 Next Step and Approval Queue`, `05/07 Agent Hooks`, `05/08 Control Panel`, `06 Integrations` (Books, SMS/Email/Files), `07 Migration`, `00/01 System Overview` (roles, stack) at `00/05 Review Log`. Dito ang bagong tinitingnan laban sa current system:

### 11.1 Notifications at Alerts (`05/05` §2–3)
| Item | Spec | Current | Status |
|---|---|---|---|
| N-1 | Notification **kapag nagbago lang ang state**; walang notification para sa "on track"; walang ipinapadala para sa records na late na pagka-import | Ang ladder rung ay isang beses lang, at ang 10-day notice ay may flag. Wala pang general na change-of-state rule. | ⚠️ Partial |
| N-2 | Sino ang makakarinig: Act now → buyer (instant + morning list); Tell the customer → sales agent (may drafted message); ladder 1–2 → buyer, rung 3 → buyer + supervisor; exception → owner (+ buyer kung supplier ang may kasalanan); silence → owner role | Isang hard-coded na email ang tumatanggap ng lahat (`PROCUREMENT_ALERT_EMAIL`, dati pa sa `shipment-schedules.mjs`). Walang roles. **Ayos 2026-11-17 (hakbang 2):** ang recipient ay setting na (`procurement_alert_email`), hindi na hard-coded; wala pa rin roles. | ⚠️ Partial |
| N-3 | **Isang digest bawat supplier bawat araw** (EN / 中文) na may lahat ng overdue lines; hindi isang email bawat event | Wala. In-app lang ang notifications. | ❌ Missing |
| N-4 | Morning list 07:00 bawat role + "My work" list | Wala. | ❌ Missing |
| N-5 | Channels: in-app (bell) laging; email para sa supplier digest at escalations | Bell ✅ (`App_Notifications`); email ❌ | ⚠️ Partial |
| AL-1 | Bawat alert ay may severity, owner role, at link sa record | May `Target_URL` at `Source_Record_No` lang; walang severity / role | ⚠️ Partial |
| AL-2 | Threshold alerts: urgency >5%, born-late rate tumataas, ranking stale | Wala | ❌ Missing |

### 11.2 Approval Queue at Next Step (`05/06`)
| Item | Spec | Current | Status |
|---|---|---|---|
| AQ kinds | `air_upgrade`, `ladder_day3`, `forecast_promise_change`, `agent_message`, `agent_update` (Procurement); iba pang kinds para sa Fulfillment/Delivery | Ang table na `Approval_Queue` ay ginawa ko; `ladder_day3` lang ang nagsusulat dito. Ang iba ay wala. **Ayos 2026-11-17 (hakbang 2):** tatlong Procurement kinds ay buo na (`ladder_day3`, `air_upgrade`, `forecast_promise_change`); ang agent kinds ay Phase 2. | ⚠️ Partial |
| AQ-1 | "Decisions" inbox bawat role: buod, mga katotohanan na may link, one-click na options | **Walang screen** at walang paraan para mag-decide **Ayos 2026-11-17 (hakbang 2):** may **Decisions** tab na may buod at one-click options; wala pang inbox bawat role. | ⚠️ Partial |
| AQ-2 | Naka-stamp ang decision (sino, kailan, aling option, `decided_by_type`) | May fields sa table, walang action na nagsusulat **Ayos 2026-11-17 (hakbang 2):** naka-stamp ang sino, kailan, aling option, `decided_by_type`; hindi pwedeng i-type o i-delete. | ✅ OK |
| AQ-3 | Hindi na-decide sa loob ng `approval_sla_hours` (24) → escalate sa supervisor | Wala **Ayos 2026-11-17 (hakbang 2):** nag-e-escalate pagkatapos ng `approval_sla_hours` isang beses; sa alert recipient pa dahil wala pang supervisor role. | ⚠️ Partial |
| AQ-4 | Kapag nagbago ang record (hal. nag-ship na ang supplier), ang item ay stale at kusang tinatanggal | Wala: mananatiling `pending` ang day-3 item kahit nagsimula na ang production **Ayos 2026-11-17 (hakbang 2):** ang item ay stale at kusang inaalis kapag nagbago ang record. | ✅ OK |
| NS-1 | Isang listahan `next_steps` (module, status → teksto, role) na ine-edit sa isang lugar | May "Next Step" sa bawat Procurement widget (display lang), pero **hard-coded sa bawat widget** (`nextStepFor`) | ⚠️ Partial |
| NS-2 | Display only, hindi humaharang sa save | ✅ | ✅ OK |
| NS-3 | Next Step **at** rank sa bawat queue row | Shipments lang ang may pareho | ⚠️ Partial |
| NS-4 | Whole-order view: isang linya bawat Sales Order ("2 of 3 lines received · 1 in transit, ETA 20 Nov") | Wala | ❌ Missing |

### 11.3 Control Panel (`05/08`)
| Item | Spec | Current | Status |
|---|---|---|---|
| CP screen | Isang Control Panel na grouped by module (kasama ang Procurement) | `Policy Settings` ay Delivery-only at admin-only; walang Procurement group. Ang mga bagong Ship & Track settings ay binabasa ko mula sa `Policy_Settings` pero walang screen para ilagay ang mga ito. **Ayos 2026-11-17 (hakbang 2):** tab na **Procurement Settings** (admin lang); wala pang iisang Control Panel para sa lahat ng module. | ⚠️ Partial |
| CP-R1 | Bawat setting: key, label, type, default, min, max, module, "ano ang naaapektuhan" | `Policy_Settings` ay may key, description, value, type lang **Ayos 2026-11-17 (hakbang 2):** catalogue na may label, default, min, max, group, "ano ang naaapektuhan". | ✅ OK |
| CP-R2 | **Walang hard-coded na numero**; code = formulas lang | Hard-coded pa: forecast engine defaults (35–60 / 5–7), PR timeline 30/14 at "−4 araw", supplier DAYS (12 / 67 / 47), at ang ladder rungs / text sa Ship & Track (sa code ko ito) **Ayos 2026-11-17 (hakbang 2):** ang planned dates, ladder, SLA at alert recipient ng Ship & Track ay galing na sa settings; hard-coded pa ang PR timeline 30/14, supplier DAYS, at ang forecast engine. **Hakbang 3:** pati ang mga numero ng forecast engine (transit, customs, prep, delivery, at ang dalawang switch) ay galing na sa Procurement Settings. | ⚠️ Partial |
| CP-R3 | Epekto sa **susunod na scoring run** + **Recalculate now** | Wala (rescore ay nangyayari sa bawat save, pero walang button) **Ayos 2026-11-17 (hakbang 2):** **Recalculate now** at awtomatikong rescore sa bawat pagbabago. | ✅ OK |
| CP-R4 | Ipakita ang epekto bago i-save ("N orders ang magbabago ng category") | Wala **Ayos 2026-11-17 (hakbang 2):** ipinapakita kung ilang shipment ang magbabago ng category bago i-save. | ✅ OK |
| CP-R5 | `policy_settings_history` (luma, bago, sino, kailan) | Wala **Ayos 2026-11-17 (hakbang 2):** `Procurement_Settings_History` (luma, bago, sino, kailan, dahilan, epekto). | ✅ OK |
| CP-R6 | Min / max (800 boxes_per_hour ay tinatanggihan) | Wala; tinatanggap ng `loadSettings` ang kahit anong numero **Ayos 2026-11-17 (hakbang 2):** tinatanggihan ang labas sa min / max, at ang ladder days na hindi pataas. | ✅ OK |
| CP-R8 | Setting na sinusukat din: ipakita ang value na gamit at ang sinukat ng system sa nakaraang 30 araw, may "Use measured value" | Wala | ❌ Missing |
| CP-R9 | Per-supplier settings (production days, consolidation days) sa supplier record | Wala sa `Suppliers` form; global lang ang gamit ko **Ayos 2026-11-17 (hakbang 2):** `Default_Production_Days`, `Default_Consolidation_Days`, `Is_Main_Supplier` sa Suppliers; ginagamit ng plan (eksaktong pangalan). | ✅ OK |
| CP-R10 | Agent settings (off / suggest / auto) | Wala | ❌ Missing |
| CP-R11 | Admin lang ang magbabago ng may kinalaman sa pera / gates; supervisor sa capacity, durations, alert days, lists | Admin-only lahat | ⚠️ Partial |
| Lists | Editable lists: exception reasons, suggested actions, message templates, next-step texts | Wala (suggested actions ay constant sa `sorting.mjs`) | ❌ Missing |

### 11.4 Exceptions engine (`05/05` §1)
| Item | Spec | Current | Status |
|---|---|---|---|
| EX-1 | Exception action sa bawat queue row (Receiving, Pick, QC, ...) | Receiving at Exception Control ay meron; hindi ko na-check ang iba | ⚠️ Partial |
| EX-2 | `found_stage`, `caused_stage`, `fault_origin` | Wala (§4.6) | ❌ Missing |
| EX-3 | Habang bukas ang exception, **naka-hold ang item** (hindi pwedeng i-pick / pass / crate) at Blocked ang package may owner | Nasa Fulfillment; hindi ko na-verify | ❔ Not verified |
| EX-4 | Photo kailangan sa damage (min 1) at katabi ng photos ng supplier | Photo gate sa widget ✅; supplier photos ❌ | ⚠️ Partial |
| EX-5 | Resolutions: Rework, Replace (RR), Accept as is (supervisor + dahilan), Cancel line (supervisor) | Rework at Replace meron; "Accept as is" at "Cancel line" hindi ko nakita | ⚠️ Partial |
| EX-6 | May pangalan na owner at aging guard | `Assigned_To` ✅; aging ❌ | ⚠️ Partial |

### 11.5 Agent hooks na kailangan na mula Step 0 (`05/07`)
Ang mga agents mismo ay Phase 2 / 3, pero sabi ng spec na ang mga "hooks" ay dapat nasa system na.

| Item | Spec | Current | Status |
|---|---|---|---|
| AH-1 | `decided_by_type` (system / human / agent) sa bawat decision record | Wala | ❌ Missing |
| AH-2 | `agent_actions` (input, output, model, gastos) | Wala | ❌ Missing |
| AH-3 | `inbound_messages` (supplier / forwarder emails) at `outbound_messages` (`approved_by`) | Wala | ❌ Missing |
| AH-4 | Accuracy report bawat agent | Wala | ❌ Missing |
| A1 | Supplier chaser (Phase 2): drafts ng rung 1–3 na mensahe | Wala (ang ladder ngayon ay notification lang) | ❌ Missing |
| A2 | Shipment inbox reader (Phase 2) + shared procurement inbox | Wala | ❌ Missing |
| A5 | Customer late notice (Phase 3), draft para sa sales agent | Wala | ❌ Missing |

### 11.6 Zoho Books integration (`06/01`)
| Item | Spec | Current | Status |
|---|---|---|---|
| ZB-sync-in | SO (poll bawat 10 min), invoices / payments, customers, items, estimates → SO, credit notes, **stock on hand → `stock_levels`** | Items at customers sa pamamagitan ng button (`add_item_by_id`, `create_books_contact`); walang poller; walang `stock_levels` | ❌ Missing |
| ZB-write | Estimate ✅ · PO pag-send · Purchase Receive (**delta lang**) · transfer · delivered qty · credit note | Estimate lang ang naka-port; ang Books half ng `approve_po_*` at `create_bin_receiving` ay hindi pa | ⚠️ Partial |
| ZB-R1 | Bawat Books call ay dumadaan sa **job queue** na may retries, naka-log; "Books update pending / failed" sa record; alert sa Admin pagkatapos ng 3 failure | Direktang tawag lang; walang queue | ❌ Missing |
| ZB-R2 | Idempotent: itabi ang Books ID, huwag gumawa ng dalawang beses | May ID fields; walang duplicate guard sa Books side | ⚠️ Partial |
| ZB-R3 | Rate limiter; malalaking backfill sa gabi | Wala | ❌ Missing |
| ZB-R5 / R6 | Void → PR on hold at package Blocked; pagbabago ng SO date / target → kopyahin sa open records at re-score | Wala | ❌ Missing |
| ZB-R7 | OAuth tokens sa env lang, kusang nire-refresh | Env vars lang ang naka-set (ayon sa change log); ang refresh ay hindi ko na-check | ❔ Not verified |

### 11.6b Email, SMS at Files (`06/02`)
| Item | Spec | Current | Status |
|---|---|---|---|
| EM-R1 | Transactional email (Resend / Postmark) para sa supplier digest at escalations | Wala | ❌ Missing |
| EM-R2 | Shared inbox ng procurement na pumapasok sa `inbound_messages` | Wala | ❌ Missing |
| EM-R3 | Digest ay bilingual (EN / 中文) | Wala | ❌ Missing |
| FL-R1 | Private storage, **short-lived signed links** | `/uploads/<file>` ay pirmihan at naka-login-lang ang proteksyon | ❌ Missing |
| FL-R2 | JPG, PNG, HEIC, WebP, PDF; video MP4 ≤3 min; **max 10 MB** | Tumatanggap ang `/api/uploadFile` ng kahit anong file at laki (walang check) | ❌ Missing |
| FL-R3 | Compress sa phone (1600 px) | Wala | ❌ Missing |
| FL-R4 | Itala ang uploader, oras, section, caption; may log ang pag-alis | Landas lang ng file ang naka-save sa field | ❌ Missing |
| FL-R5 | Retention: proofs 3 taon | Wala | ❌ Missing |

### 11.7 Platform, roles at metrics (`00/01 System Overview`)
| Item | Spec | Current | Status |
|---|---|---|---|
| TZ | Lahat ng stamp ay **UTC** sa database at ipinapakita sa PH time `13 Nov 2026 14:05` | Naka-store bilang oras ng Maynila sa Zoho format (`2026-11-17 10:55:59 AM`) | 🔴 Conflict |
| Roles | 11 roles (§6) kasama ang: dispatcher nakikita ang third-party fees; fulfillment supervisor may read-only na Procurement arrivals; sales agent: sariling customers lang | Admin / user lang (C12) | ❌ Missing |
| M-1 | Born-late % (main procurement number) | Wala | ❌ Missing |
| M-2 | "In this stage since" sa bawat module | Sa Shipments lang ("N days in this stage") | ⚠️ Partial |
| RL-19 | Stock PR (walang customer order) ay gumagamit ng creation date bilang Order Date | Wala | ❌ Missing |
| RL-13 | Aging ay bibilangin mula sa import date para sa imported records | Ang mga lumang shipments na walang Stage ay hindi nagri-ring ng ladder; ang aging mismo ay wala pa | ⚠️ Partial |

### 11.8 Migration (`07`)
| Item | Spec | Current | Status |
|---|---|---|---|
| MG-1 | Field map (CSV) sa repo; palitan ang magulong pangalan (Creator PO "Order date" → `po_date`, "Ship"/"Shipment" → `shipout_*` / `receive_*`) | May import tool (`importBackup`) na kopya ng Zoho nang walang rename | ⚠️ Partial |
| MG-2 | Linisin bago i-import: supplier names ("Tony" vs "Tony Fan") → supplier IDs; 93 orders na ang target ay bago ang order date ay i-review; replacements bigyan ng target | Wala | ❌ Missing |
| MG-3 | Ang mga imported event stamps ay `source = 'import'`; ang wala ay dash, hindi gagawa-gawa | Wala | ❌ Missing |
| MG-4 | **Order Date** mula sa Books sa lahat ng open record bago ang cut-over | Sa Shipments lang, mula sa Fulfillment `SO_Created_Date` | ⚠️ Partial |
| MG-5 | Acceptance: bilang ng open records bawat stage ay tugma sa Creator; bawat open record ay may Order Date | Hindi pa nasusubukan | ❔ Not verified |

### Tally ng §11 (kinuwenta)

| Section | OK | Partial | Missing | Conflict | Not verified | Kabuuan |
|---|---:|---:|---:|---:|---:|---:|
| 11.1 Notifications at Alerts (`05/05` §2–3) | 0 | 4 | 3 | 0 | 0 | 7 |
| 11.2 Approval Queue at Next Step (`05/06`) | 3 | 5 | 1 | 0 | 0 | 9 |
| 11.3 Control Panel (`05/08`) | 6 | 3 | 3 | 0 | 0 | 12 |
| 11.4 Exceptions engine (`05/05` §1) | 0 | 4 | 1 | 0 | 1 | 6 |
| 11.5 Agent hooks na kailangan na mula Step 0 (`05/07`) | 0 | 0 | 7 | 0 | 0 | 7 |
| 11.6 Zoho Books integration (`06/01`) | 0 | 2 | 4 | 0 | 1 | 7 |
| 11.6b Email, SMS at Files (`06/02`) | 0 | 0 | 8 | 0 | 0 | 8 |
| 11.7 Platform, roles at metrics (`00/01 System Overview`) | 0 | 2 | 3 | 1 | 0 | 6 |
| 11.8 Migration (`07`) | 0 | 2 | 2 | 0 | 1 | 5 |
| **Kabuuan** | **9** | **22** | **32** | **1** | **3** | **67** |

---

## 12. Progress hakbang 2 (2026-11-17): Decisions at Procurement Settings

**Tapos at na-test** (18 bagong tests; buong suite 741 pass, 0 fail; nakita sa browser):
| Item | Status |
|---|---|
| Tab na **Decisions** (Approval Queue): to decide / decided / removed by the system; one-click options; ang system ay naghahanda lang | ✅ |
| `ladder_day3` (cancel-and-re-source / hold / upgrade): ni-re-record, walang awtomatikong cancel | ✅ |
| `air_upgrade` (Act now na hindi pa air): upgrade air (nagpapalit ng mode at nagpa-plan ulit) / move target / tell the customer | ✅ |
| `forecast_promise_change`: accept → nagbabago ang target at naka-log (`Target_Date_Changes`); keep → walang pagbabago | ✅ |
| Decision ay naka-stamp (sino, kailan, option, human); hindi pwedeng i-type, i-delete, o i-decide ulit | ✅ |
| Stale na item kusang inaalis; escalation pagkatapos ng 24 h | ✅ (escalation sa alert recipient pa) |
| Tab na **Procurement Settings** (admin lang): label, default, min, max, "ano ang naaapektuhan"; preview ng epekto; history; Recalculate now | ✅ |
| Per-supplier production / consolidation days at `Is_Main_Supplier` | ✅ |
| Dahilan sa pagpalit ng target date sa Shipments (DT-4) | ✅ |

**Hindi pa:** roles (kaya iisang recipient pa ang lahat ng alert at escalation), ang iba pang module sa Decisions, per-role inbox, notifications at digest, PR/PO (feasibility gate, `supplier_id`, PO per supplier + mode), Receiving, RR, supplier portal, Dashboard. Hindi pa rin na-apply ang schema sa Railway.

---

## 13. Progress hakbang 3 (2026-11-17): iisang settings para sa forecast at Procurement

**Ginawa:** ang **Forecast Setting** tab ay pinagsama sa **Procurement Settings**.
- Ang forecast engine (na ginagamit din ng Fulfillment at Delivery) at ang plan ng Ship & Track ay iisang set ng numero na ang binabasa.
- Ang halaga sa gamit ay: saved na numero sa Procurement Settings, kung wala ay ang field ng lumang `Forecast_Settings` record, kung wala ay ang dating default ng engine. **Kaya walang nagbago sa forecast hanggang may i-save.**
- Ang live record sa Railway (Air 5–7, customs 2–3, LCL 35–60, LCL customs mula 7; blangko ang iba) ang magiging panimula; ipinapakita ito sa page na may tatak na "from the old Forecast Setting".
- Ang plan ng Ship & Track ay kumukuha ng gitna ng bawat range, at kasama na ang customs sa planned pickable date.
- Hiwalay pa ring nakatabi ang lumang widget folder (`modules/Procurement/Forecast Setting`) pero wala na sa menu.

**Hindi pa:** ang PR timeline (30/14 at "−4 araw") at ang supplier DAYS (12 / 67 / 47) ay hard-coded pa; ang Delivery forecast-stamp ay walang gamit sa mga settings na ito (tiningnan); hindi pa na-apply sa Railway.

---

## 14. Progress hakbang 4 (2026-11-17): Purchase Request, Purchase Order, Receiving

**Purchase Request** (`pr-spec.mjs`): feasibility sa bawat PR (feasible / at risk / impossible, shortfall, earliest date, air option); ang rekomendasyon ng supplier ay tumitingin sa presyo **at** lead time laban sa target, may paliwanag sa salita; pricing status; isang `Pr_State`; Order Date; hold / resume / cancel na may dahilan at stamps; hindi na nade-delete ang PR; kapag na-void ang SO, naka-hold agad ang mga open PR nito; ranking ng PR (oldest Sales Order muna) at hindi na newest-first. Hindi na awtomatikong lumilipat sa air ang PR kapag malapit ang target.

**Purchase Order** (`po-create.mjs`, `po-spec.mjs`): ang Create PO ay may **feasibility gate** (dialog sa PR widget: air, bagong target, o proceed; walang naisusulat hangga't walang pinipili); ang PO ay isang supplier + isang mode, at ang iba't ibang SO ay pwedeng magsama; supplier ID, earliest order date at target, born late at shortfall, deposit fields; production start = PO date + 1; po.created / sent / acknowledged / closed / cancelled bilang events; alert kapag hindi na-acknowledge; kusang nagsasara kapag fully received; hindi na nade-delete.

**Receiving** (`receiving-spec.mjs`): ang apat na events (arrived, counted, binned, available) bilang server stamps; ang **"Received" ay counted at binned na**; exception na may found stage at fault origin; silence alerts; shortage suggestion; ang **Arrivals list** na may rank (arrived-not-counted muna, oldest SO muna); ang shipment ay nagiging "received" kapag pickable na lahat.

**Hindi pa:** ang PO sa Zoho Books at ang Purchase Receive (naka-hold ang Books); ang deposit screen; ang PO list na may category; ang Dashboard; ang roles; ang supplier portal (Production, photos, itago ang SRP); ang PR Forecast screen; ang notifications sa sales agent; ang pag-apply sa Railway.

---

## 15. Progress hakbang 5 (2026-11-17): Supplier Portal, unang bahagi

**SRP (C11, SP-R1):** hindi na kinokopya ang selling price sa supplier copy ng PR; ang portal ay nakakakita lang ng `Ref_Price_Known` (Yes / No), na siyang tanging gamit nila dati sa SRP.

**Delay report (SP-R4, SP-R5, SP-R8):** bagong expected date + dahilan; ina-update ang planned dates at forecast, hindi ginagalaw ang target, may event na `shipment.delay_reported`. Nasa Tony Fan at Fenteng Lighting Shipments (EN / 中文) at sa buyer Shipments widget.

**Hindi pa:** Production screen na may photos, "Today" screen, login bawat supplier (SP-R6), daily digest, pag-verify ng SP-R2, paglilinis ng lumang SRP sa kasalukuyang copies, ang SRP fallback sa PO line, ang fixed 12 / 67 / 47 days sa portal, pag-apply sa Railway.

---

## 16. Progress hakbang 6 (2026-11-17): Production screen ng supplier portal

Bagong tab na **Production** sa Tony Fan at Fenteng Lighting (EN / 中文): isang card bawat shipment na may items (SKU, item, dami; walang customer, walang presyo), planned production start at end, status (Not started / In production / Finished, may Late), **Production started** (petsa), **Production photo**, **Production finished** (kailangan ng photo, ST-R3), at **Report a delay**. Ang supplier ay gumagana sa sariling kopya ng shipment; ipinapasa ng server sa shipment ang photo at ang event (source supplier, petsa + oras ng server).

**Hindi pa:** maraming photo bawat shipment (isa lang ang tinatanggap ng upload), partial quantities, ang Today screen, login bawat supplier (SP-R6), daily digest, pag-check sa phone at sa 中文.

---

## 17. Progress hakbang 7 (2026-11-17): Purchase Order (list, detail, deposit, born-late rate)

**PO list:** urgency bawat PO (ang pinakamatindi sa mga shipment nito, mula sa Sorting Engine), filter na may bilang, ranking (Act now muna), at mga column na Order Date, Target, Forecast.

**PO detail:** "Feasibility at creation" (born late, shortfall, ang napiling option) at "Deposit" (paid at amount). Ang "Shipment tracking" card ay tinanggal sa utos ng owner (nasa Shipments tab na).

**Born-late rate (PO-R3):** sinusukat sa gate bago ang option; may API na bawat linggo at stat card sa PO list. **Binago:** dati ang `Born_Late` ay nagsasabi lang kung huli pa rin pagkatapos ng option; ngayon ay sinusunod nito ang spec (huli sa gate = born late).

**Hindi pa:** abiso sa sales agent para sa option B (walang role, kaya iisang tao pa rin ang tumatanggap ng alert), ang paghihigpit ng deposit ayon sa role, ang Books PO, ang block sa Dashboard, at ang PO documents at supplier messages sa iisang timeline.

---

## 18. Progress hakbang 8 (2026-11-17): Inquiry

**Server** (`inq-spec.mjs`): stamps at events (sent, first quote, supplier selected, estimate pushed); ang lead time na text ay nagiging araw (`Selected_Lead_Days`); ang line na Unavailable / Cannot Produce ay walang price at lead time; feasibility hint bawat quote kapag may needed-by date; alert sa buyer kapag kumpleto na ang quotes at kapag walang quote pagkalipas ng 2 araw (daily job); ang quote row na may supplier ID ay tinutugma sa ID.

**Widget** (Inquiry List): oldest first, Age column, at ang hint sa ilalim ng quote grid.

**Hindi pa:** ang "My inquiries" ng sales agent na walang presyo at ang pagtatago ng presyo ayon sa role (C12); ang Estimate na nagiging Sales Order at nagsasara ng Inquiry (INQ-R5, kailangan ng Books); ang abiso sa sales agent; ang daily digest sa supplier; ang role gate sa "Push Estimate".

---

## 19. Progress hakbang 9 (2026-11-17): Exceptions at Replacement Request

**Create RR:** ang dialog ay may "Other"; ang RR ay may napiling supplier, orihinal na supplier, at dahilan (kailangan kapag nagbago); `Target_Delivery` (orihinal kung nasa hinaharap, kung hindi ay ngayon + 21) at ang `Order_Date` ng orihinal na SO. Ang bagong RR ay nire-rank agad.

**Broken (RR-R4):** ang bukas na RR at ang replacement shipment nito ay nasa itaas ng lahat ng queue: Shipments, PO list, at RR list (oldest original Order Date muna, may Target at Forecast).

**Events at alert:** exception.raised, rr.created, rr.acknowledged, rr.replacement_received; alert kapag hindi na-acknowledge ang RR sa loob ng 1 araw (daily job).

**Report at Exception Control:** buwanang report ng mga replacement (dahilan, fault origin, supplier); mga filter at Age sa Exception Control.

**Na-verify:** ang HC System RR ay nakakagawa ng working replacement shipment (dating nakasulat na "hindi pa ported", mali iyon).

**Hindi pa:** Broken sa Fulfillment at Delivery; supplier photos sa Exception Control detail; ang rework rate (tinatantya lang); RR-R7 (stock replacement diretso sa package); ang abiso sa sales agent; ang pag-verify ng ladder sa replacement.

---

## 20. Acceptance checklist ng spec, isa-isa (2026-11-17)

Kinuha ko ang "Acceptance checklist" ng walong dokumento ng 02 Procurement (34 na item) at tiningnan ang bawat isa laban sa tunay na ebidensya (test o browser). ✅ = napatunayan; ⚠️ = bahagya; ⏸ = naka-hold (mga role); ❌ = hindi pa; ❔ = hindi pa na-verify.

| Dokumento | Item | Status | Ebidensya o dahilan |
|---|---|---|---|
| 01 Inquiry | Sales agent gumagawa ng inquiry na may custom item at photo; nakikita ng supplier sa portal | ⚠️ | Naka-copy sa portal ang inquiry; ang custom item at photo ay hindi ko pa nasubukan. |
| 01 Inquiry | Hindi nakikita ng sales agent ang price field | ⏸ | Naka-hold (mga role). |
| 01 Inquiry | Cannot Produce = walang price at lead time | ✅ | Test, at nakita sa browser. |
| 01 Inquiry | Push to Books = Estimate na tama ang lines | ❌ | Naka-disconnect ang Books; hindi nasubukan. |
| 02 PR | Void SO sa Books = naka-hold ang PR sa loob ng isang sync cycle, may dahilan | ⚠️ | Ang hook sa PR ay nasubukan; walang Books sync na nagpapadala ng void. |
| 02 PR | Ang held PR ay hindi maidaragdag sa PO | ✅ | Bagong test (nilaktawan at pinangalanan sa sagot). |
| 02 PR | Lead 20, LCL, target 15 araw: Impossible, shortfall, air option, earliest date | ✅ | Mga test gamit ang worked example ng spec. |
| 02 PR | Ang auto-priced PR ay napupunta sa Ready for PO nang walang tao | ❌ | Ang pricing tool ay nasa labas ng sistema. |
| 02 PR | Ipinapaliwanag ng rekomendasyon ng supplier ang pinili (presyo, lead time, feasibility) | ✅ | Test, at nakita sa browser. |
| 03 PO | Create PO na hindi aabot: shortfall at tatlong option bago mag-save | ✅ | Nakita sa browser: ang dialog ay nagsasabi ng "70 days late ... Earliest it can be delivered", may tatlong option (A air, B bagong target, C proceed) at tinatanggihan ang walang pinili (walang PO na nagawa). Pagkatapos pumili ng Air: PO Airfreight, born late, shortfall 70, may tala ng napili; ang LCL na line ay nasa hiwalay na PO. |
| 03 PO | Ang Air ay kinukuwenta ulit gamit ang 14 na araw na transit | ✅ | Test. |
| 03 PO | "Propose new target" = approval; hindi kusang nagbabago ang target | ⚠️ | Ang target ay hindi nagbabago hanggang tanggapin (nasubukan); ang approval ay napupunta sa Decisions at sa iisang alert address, hindi sa sales agent. |
| 03 PO | Walang field sa PO na tinatawag na "Order Date" maliban sa Order Date ng customer | ✅ | Ang PO ay may PO Date; pinalitan ko ang label ng `Earliest_Order_Date` bilang "Earliest Customer Order Date". |
| 03 PO | Lumalabas ang born-late rate sa dashboard | ✅ | May block sa Dashboard (50% sa sample: 1 sa 2 lines). |
| 04 Ship & Track | PO na ack ngunit walang production start sa PO+2: rung 1 at Act now | ✅ | Mga test ng ladder. |
| 04 Ship & Track | Ang Day 3 ay desisyon sa approval queue, hindi kusang cancel | ✅ | Test. |
| 04 Ship & Track | Hindi makakaalis sa Production ang shipment na walang production photo | ✅ | Test (pati sa supplier path). |
| 04 Ship & Track | Ang tracker ay walang natatanggap na cost o price data | ⏸ | Naka-hold (mga role). |
| 04 Ship & Track | Ang pag-update ng arrival ay nag-a-update ng forecast ng bawat SO sa shipment | ⚠️ | Ang forecast ay bawat shipment, at nire-rescore agad; hindi ko tiningnan bawat SO. |
| 04 Ship & Track | Ang pag-save ng isang row sa grouping ay hindi nagse-save ng edit ng ibang row | ✅ | Sa code: ang Edit / Save / Cancel ng PR Groups ay bawat row (`prgSaveSrp(id)` ay nagbabasa ng input ng row na iyon lang at nagpapadala ng `SRP_Approved_PR` ng PR na iyon). Hindi ko ito pinatakbo sa browser. |
| 05 Receiving | Tatlo sa lima, tapos dalawa pa = dalawang Purchase Receive sa Books | ❌ | Naka-hold ang Books. |
| 05 Receiving | Ang pag-bin sa huling line ay ginagawang Ready ang package sa loob ng isang minuto | ❌ | Ang Fulfillment ay nagbabasa ng `Pre_Order_FF` na "Received", na ginagawa ng "Create Receive" (kasama ang Books, naka-hold). Ang Receiving sa app na ito ay nagse-stamp ng binned at available, pero hindi pa ito nakakabit sa package. |
| 05 Receiving | Ang shipment na dumating 2 araw na ang nakaraan na walang bilang ay may alert | ✅ | Test (silence alerts). |
| 05 Receiving | Ang damage ay may production photos ng supplier sa tabi ng damage photos | ⚠️ | Link lang, at isang file bawat field. |
| 06 Exceptions at RR | Create RR: dialog; kailangan ng dahilan kapag nagbago ang supplier | ✅ | Test, at ang dialog ay nakita sa browser (hindi ko pa pinindot ang Create). |
| 06 Exceptions at RR | Ang RR para sa HC System ay gumagawa ng replacement na makakarating sa receiving | ✅ | Test. |
| 06 Exceptions at RR | Ang bagong RR ay nasa itaas ng Broken saanman, may target | ⚠️ | Procurement lang; hindi pa sa Fulfillment at Delivery. |
| 06 Exceptions at RR | Ipinapakita ng monthly report ang damage ayon sa fault origin | ✅ | Test, at tab sa browser. |
| 07 Supplier Portal | Ang user ng Tony Fan ay hindi nakakakita ng record ng Fenteng o pangalan ng customer | ⏸ | Naka-hold (login bawat supplier); may sariling form ang bawat supplier, pero ang lumang Shipments widget ay bumabasa pa ng Shipments ng buyer para sa gate. |
| 07 Supplier Portal | Ang pagpili ng "Cannot Produce" sa 中文 ay nag-iimbak ng English | ✅ | Sa code: ang value ng option ay English at ang label lang ang isinasalin. Hindi ko sinubukan sa browser. |
| 07 Supplier Portal | Ang Production finished na may nakaraang petsa ay nag-iimbak ng petsa at oras ng ulat | ✅ | Test. |
| 07 Supplier Portal | Gumagana ang portal sa phone | ✅ | Production page ng Tony Fan at Fenteng Lighting sa 390 pixel na lapad: walang pahalang na overflow, nagsasalansan ang mga card, at gumagana ang 中文. Ang ibang pahina ng portal ay hindi ko tiningnan. |
| 08 Dashboard | Ang born-late rate ay tugma sa manual count para sa isang linggo | ✅ | Test: 2 sa 6 na lines = 33.3% (hindi isinama ang cancelled at ang PO sa labas ng mga linggo). |
| 08 Dashboard | Ang pag-click sa bilang ay nagbubukas ng naka-filter na list | ✅ | Nasubukan sa browser: Act now (1 row = bilang), POs not acknowledged (2), PRs manual quote (1), Production (4 lines), at Born-late (PO-00005 lang). Ang Decisions at RR ay bukas ang buong page. |

**Bilang (na-update pagkatapos ng Dashboard):** ✅ 21, ⚠️ 6, ⏸ 3, ❌ 4, ❔ 0, kabuuan 34. Dati: ✅ 18, ❌ 7 (pagkatapos ng karagdagang pag-check), at ✅ 15, ⚠️ 7, ⏸ 3, ❌ 6, ❔ 3 sa simula.

---

## 21. Progress hakbang 10 (2026-11-17): Procurement Dashboard

Bagong seksyon sa tuktok ng Dashboard, ayon sa spec 08: **Today** (Act now, Tell the customer, Broken, decisions waiting, PRs na manual quote, POs na hindi ack), **Born-late rate** (weekly), **On-time arrival** (kabuuan at bawat supplier), **Supplier scorecard**, **Pipeline** (lines bawat stage na may pinakamatandang Order Date) at **Replacements**. Bawat numero ay link sa listahan sa likod nito. Ang dating Overview, Analytics, at Suppliers (mga bilang ng PR, PO, gastos) ay iniwan sa ibaba.

**Hindi pa:** ang pagtatago ng gastos ayon sa role (naka-hold); ang dating Overview ay hindi ko ginalaw at hindi ko sinuri laban sa spec.

---

## 22. Progress hakbang 11 (2026-11-17): ang tatlong bukas na tanong, sinagot ko ayon sa rekomendasyon (utos ng owner: huwag mag-conflict o makasira ng flow)

1. **SRP sa presyo ng PO line:** inalis. Ang `Item_Price` sa supplier copy ng PO ay ang presyo na ng supplier mismo (kapareho ng `Final_Price`); dati ay SRP, tapos catalog rate. Walang nagbabasa nito sa panig ng buyer, at hindi ito ipinapakita ng portal, kaya hindi nasisira ang flow.
2. **Fixed 12 / 67 / 47 araw sa portal:** pinalitan. Ang Estimated Warehouse Arrival ng shipout ng supplier ay ship date + transit + customs + receiving mula sa Procurement Settings, iisang makina na kasama ng plano ng Ship & Track. **Epekto:** ang LCL ay hindi na 67 araw kundi ang bilang sa settings, kaya mas maaga na ang "Delayed" na alert. Kung gusto ng owner ang dating 67, itakda ito sa Procurement Settings.
3. **Broken sa Fulfillment at Delivery:** hindi ginawa (sadya). Ibang module ang mga iyon at may sarili silang takbo, kaya ang pagbabago ay may panganib na makasira. Ang `Rr_Category` ng RR ay nandiyan na kung gusto itong gamitin ng mga module na iyon sa susunod.
4. **Dagdag:** ang Day-3 na desisyon ay nagsasabi na kung bayad ang deposit at magkano ("Deposit paid: 5000 on PO-00001"), o na wala.
