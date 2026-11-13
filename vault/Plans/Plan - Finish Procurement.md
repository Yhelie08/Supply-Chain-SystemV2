---
title: "Plan - Finish Procurement"
tags:
  - plan
  - procurement
  - migration
status: draft - open questions for the team (section 6)
date: 2026-11-12
---

> [!INFO] Where this fits
> This is the detailed plan for the first module we complete in our own app. The whole migration: [[Plan - Full Migration Off Zoho Creator]]. How things run today: [[00 - Current System]]. Counts: [[00 - Port Status]]. What is left, by section: [[00 - Port Checklist]]. How one script is moved: [[00 - Porting a Workflow]].

# Plan: finish Procurement, end to end

## 1. Buod (summary in Tagalog)
- Procurement ang unang module na tatapusin natin bago ang Fulfillment at Delivery. **Sabay-sabay ang paglipat ng staff sa dulo**, kapag tapos na ang lahat ng module. Kaya ang "pulidong Procurement" ay milestone sa paggawa, hindi pa paglabas sa staff.
- Ngayon: **22 sa 58** workflows ng Procurement ang tapos, **0 sa 20** sa mga portal ng Tony Fan at Fenteng. Inquiry at Purchase Request lang ang halos kumpleto.
- **Hindi pa gumagana ang Create PO.** Tumatawag ang Purchase Request tab ng 4 na function (`approve_po_main`, `approve_po_fenteng`, `approve_po_tony`, `Approve_P_O_H_C`) na wala pa sa server. Kaya 25 ang tunay na bilang ng custom API, hindi 21.
- **May malaking butas**: ang pagpasok ng Sales Order, bayad, at invoice mula sa Zoho Books ay ginagawa ng mga function sa loob ng Books (hindi sa Creator). Kapag iniwan ang Creator, wala nang magpapasok ng Sales Order, kaya walang Purchase Request. Kailangan natin itong gawing "poller" sa server natin.
- Ang mga tanong na kailangang sagutin ng team ay nasa **seksyon 6**, may numero, para madaling sagutin.

## 2. Decisions made so far (with the owner)
- Staff go live **all at once**, when every module is ported. No bridge to Zoho Creator is built.
- The **Tony Fan and Fenteng Lighting portals** are part of "Procurement done": they close the loop (supplier quotes, acknowledges the PO, approves a replacement).
- The **forecast** (Forecast Setting tab, the PR forecast stamp, the forecast schedules) is a separate milestone at the end, together with Fulfillment and Delivery, because they share one engine.
- Sales orders, payments and invoices from Zoho Books reach the app by **our server asking Books every few minutes** (polling). Nothing is changed inside Books.
- Emails: **in-app notifications only** for now. The four Zoho workflows that send email (Tony: PO, Replacement, Shipment; Delivery: site confirmation) are skipped and listed.
- The Zoho export (`zoho-export/Supply_Chain_App.ds`, generated 10-Nov-2026) is current and is the source of truth for the Creator side. The organization's time zone is Asia/Manila.

## 3. What "polished" means
1. Every active Zoho workflow that runs when someone saves a record is either ported, or listed as not needed with the reason (it only drives Zoho's own forms, is inactive, or has no script).
2. Every custom API a Procurement or portal tab calls exists in our server and has tests. A new test fails if a tab calls a name the server does not have.
3. Every tab works end to end in the browser on the local app: one walkthrough from an inquiry to a replacement shipment received.
4. Each stage has been compared with Zoho Development, or its differences are written down in [[00 - Change Log]].
5. Nothing is lost: data gaps closed, images and files moved, notification settings written down.

## 4. What we found that the first plan missed
| Finding | Why it matters |
|---|---|
| **Create PO is broken today.** The tab calls `approve_po_main` (286 lines), `approve_po_hc` (289), `approve_po_tony` (587, calls Books), `approve_po_fenteng` (593, calls Books). The server does not know them and the scanner behind Port Status missed them. | It is the core action of Procurement. The true number of custom APIs is 25, with 6 ported. |
| **The Books to app sync is in no count.** Sales orders, payments, invoices, items and customers reach Creator through functions that run **inside Zoho Books**: `so_creation_sync` (723 lines), `so_to_pr` (creates the Purchase Requests from sales orders, about 880 lines in the NewScripts version), `invoice_payment_status_to_so_fulfillment_sync` (474), `Payment` (351), `so_fulfillment_sync` (303 and 627), `readiness_gate_check_payment_status` (208). They exist only as pasted notes in this vault (see [[Zoho Books & Inventory Core Sync]]). | Without them no sales order, and so no Purchase Request, enters the app. They must be read and rebuilt as a poller. |
| **Time zone.** Zoho runs in Asia/Manila; the Railway server runs in UTC. | Remaining days, delay status and priority would be a day off around midnight. Set `TZ=Asia/Manila` for the server and the tests. |
| **Numbers can collide.** PR, PO, RR, EXC, shipment and receiving numbers are "highest existing + 1". | Two people saving at the same moment get the same number. Use a database sequence or a lock. |
| **Supplier logins.** The app only has admin and user accounts. | A supplier must see only its own portal. To be decided when the portals start (question 6). |
| **Notifications are in-app only.** | Tony and Fenteng will not get email, only the bell in their portal. |

## 5. Milestones, in order
Size is lines of Deluge. "Books" means the script calls Zoho Books.

| # | Milestone | What is in it | Size |
|---|---|---|---:|
| M0 | Corrections and safety net | Make the scanner see `callApprovePOApi`; a test that every API name a tab calls has a handler; `Proj_Code_AutoNumber` (project numbering); `TZ=Asia/Manila`; **one experiment on Zoho Development** (add an Inquiry and a Purchase Request, see what Zoho creates, and whether scripts that write records fire the form workflows again). It needs the owner's OK and the test records are deleted afterwards. | small |
| M1 | Purchase Order | 4 workflows (numbering, totals, mixed-supplier check, status times; 103) and the four `approve_po_*` APIs | ~1,860 |
| M2 | Shipments | 8 workflows: numbering, autofill from the PO, create Receiving rows, keep mode and status in step | ~320 |
| M3 | Receiving | 10 workflows (totals, quantity checks, automatic exception, receive status, bin and product sync, shipment arrived), `create_receiving_from_shipment` (104), `create_bin_receiving` (1,885, Books) | ~2,700 |
| M4 | Replacement and Exceptions | 8 workflows, `create_rr_main`, `create_rr_tony`, `create_rr_fenteng` (751), `clone_shipment_for_replacement` (433) | ~1,360 |
| M5 | Supplier copies | Supplier_1 and Supplier_2: 4 workflows (a supplier's reply updates the Inquiry's quotes) | ~300 |
| M6 | Tony Fan and Fenteng portals | 20 workflows, `acknowledge_po_tony` and `_fenteng` (617), `approve_rr_tony` and `_fenteng` (80) | see [[00 - Port Checklist]] |
| M7 | **Books inbound sync (poller)** | Ask Books for new and changed sales orders (and create their Purchase Requests), payments, invoices, items and customers; remember what was seen last so a restart does not repeat | ~3,000, to confirm after reading the scripts |
| M8 | Schedules and report buttons | Daily shipment checks (`Daily_Shipment_10_Day_Che`, `Shipment_Delay_Status_Dai`) and a small scheduler in the server; Zoho report buttons only where no widget button already does the job | small |
| M9 | Data, files, settings | The 2 forms with no readable report and the 34 forms that hide columns; Production export and a trial import; download images and files from Zoho into our storage; portal email addresses and the app address for notification links | medium |
| M10 | Verification and polish | Comparison with Zoho Development per stage; one live Books check with a test record deleted right after (needs the owner's OK and the Books OAuth client); the browser walkthrough; sequences for numbers; update these notes | - |
| later | Forecast | `fcStampPurchaseRequest` (458), `fcPrToPreOrder` (61), the Forecast Setting tab, the forecast schedules | with Fulfillment and Delivery |

## 6. Open questions for the team
Please answer by number. "Default" is what we will do if nobody decides.

| # | Question | Why it matters | Default | Answer |
|---|---|---|---|---|
| 1 | Who are the staff accounts, and do they sign in with the same emails as in Zoho? | The widgets' role rules (HC Purchasing, HC Systems, HC Damage Officer) read the signed-in email. | Same emails, one account each | |
| 2 | Target date to go live, and is there a pilot group? | Decides the order of work and when Production data is imported. | No fixed date; a week with 2-3 staff and one supplier first | |
| 3 | Who signs off the testing (UAT) for Procurement, and who plays Tony and Fenteng during it? | A stage is not done until someone from the business accepts it. Documents exist: `Tony Fan Portal UAT Test Plan`, `Supply Chain App UAT Manual`. | The owner signs off | |
| 4 | Books: who creates the OAuth client (scopes `ZohoBooks.fullaccess.all`, `ZohoInventory.FullAccess.all`)? Is there a Books **test** organization? Which workflow rules in Books call the sync functions today? | Needed for every live Books check and for the poller. The old rules must be switched off at go-live or orders enter twice. | The owner creates it; assume there is no test organization | |
| 5 | How far back should Production history be imported? | Size and time of the import; what staff can search. | Everything | |
| 6 | Supplier portals: who creates the Tony and Fenteng accounts, in which language does Tony work (guides exist in Chinese), and what must a supplier never see? | A supplier login must not open the staff screens. | Admin creates the accounts; suppliers see only their portal | |
| 7 | Email later: which provider and sender address, and which events must email? | Today none is sent. Tony's PO, Replacement and Shipment notices were emails in Zoho. | In-app only until decided | |
| 8 | Backups: is a daily Postgres backup on Railway enough, and who can restore it? | The new database becomes the only copy of the data. | Daily backup; the owner restores | |
| 9 | Has the Geoapify key hidden in `SA_Geocode_Address` been rotated? | It sits in the Zoho export. | Rotate it before go-live | |
| 10 | After go-live may Zoho Creator stay read-only for lookups for a while? | Gives a way back and a place to check old records. | Yes, untouched | |

## 7. How each stage is built
Read the Deluge for the stage; sort every workflow into runs-on-save, only-drives-Zoho's-own-forms, or inactive; write the hooks and handlers; write tests with Books replaced by a stand-in; record the result in `server/workflows/ported.json`; regenerate Port Status and the checklist; keep Zoho's quirks and mark them "mirrors Zoho" until the Zoho Development comparison confirms them. Details: [[00 - Porting a Workflow]].

## 8. Not in this plan
Fulfillment, Delivery Management, Analytic, the forecast engine, Railway setup, the deploy, merging to `main`, and the go-live itself.
