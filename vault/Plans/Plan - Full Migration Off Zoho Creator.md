---
title: "Plan - Full Migration Off Zoho Creator"
tags:
  - plan
  - zoho
  - migration
  - postgres
status: active - decisions made 2026-11-12, Phase 1 started
date: 2026-11-12
---

> [!INFO] Where this fits
> This is the current plan. It replaces the end state of [[Plan - Cloud Front Door (Zoho Backend)]] (Zoho as backend was only a bridge). Current state: [[00 - Current System]]. What is still only in Zoho: [[00 - Port Status]]. How to port a script: [[00 - Porting a Workflow]]. History: [[00 - Change Log]].

# Goal
The supply chain app in Zoho Creator stops being used. Our cloud app (Railway) becomes the only system where staff and suppliers work, and the system of record for all new data. Zoho Books and Zoho Inventory stay; our server talks to them directly instead of through Deluge. The old Creator app is left untouched as a fallback (whether it is ever deleted is not decided).

## Decisions (owner, 2026-11-12)
- Zoho Creator supply chain app: no longer used. Books and Inventory: stay.
- Business data: **Postgres on Railway**. Users and sessions stay as they are for now.
- Build **module by module**, but staff go live **all at once** when every module is ported (decided later the same day). No bridge to Zoho Creator is built.
- **Admin side first**, but the Tony Fan and Fenteng portals are part of "Procurement done", not a later phase: see [[Plan - Finish Procurement]].
- Order: Procurement (Inquiry → PR → PO → Shipments → Receiving), then Fulfillment, then Delivery.
- Sales orders, payments and invoices come from Zoho Books by our server **polling Books**; today they are pushed by functions inside Books that are not in the Creator export (see the plan note).
- Emails: **in-app notifications only** for now.
- The server runs with time zone **Asia/Manila**, like the Zoho organization.

## Size of the port
| Part | Total | Ported |
|---|---:|---:|
| Deluge functions | 43 | 2 |
| Custom APIs called by widgets | 21 | 3 |
| Form workflows | 165 | 0 |
| Scheduled workflows | 6 | 0 |
| Report-button functions | 16 | 0 |

Known gap: `invokeCustomApi` in `server/zoho/adapter.mjs` calls the local port in `server/custom-apis.mjs`, not Zoho, so 18 of 21 custom APIs answer "not ported yet" with `BACKEND=zoho`, and the 3 ported ones write to the local SQLite store, not to Zoho.

# Phases

## Phase 1 - Data safety (started)
- [x] Read-only export script `tools/export-zoho-data.mjs` (writes to `data/zoho-backup/`, gitignored).
- [x] Export of the **Development** environment: 88 of 90 forms, 3,663 rows (Items 2,660; Service_Request1 620). Looks like test data only.
- [ ] 2 forms have no report the API can read: `Pick_Up_Request_Form`, `Shipment_Order_Form`.
- [ ] 34 forms may be missing columns, because a report only returns the columns it shows. Fix with fuller reports in Zoho or another export method, then re-check against the form field counts.
- [ ] Export **Production** (read-only) before the cutover of each module. Needs the owner to confirm Production access.

## Phase 2 - Foundation
- [x] Postgres service on Railway created (empty). [ ] Connection string in the `supply-chain-app` variables (`DATABASE_URL` = `${{Postgres.DATABASE_URL}}`) and a TCP proxy on the Postgres service so the import can run from a PC.
- [x] Schema for the 90 forms generated from the parsed export (`server/pg/schema.mjs`).
- [x] Import tool `tools/import-zoho-backup.mjs`, **keeping Zoho record IDs**; verified on the Development backup (48 forms loaded, counts match, 0 failed).
- [x] Postgres store behind the same shim API (`BACKEND=pg`): SQL filtering, batched lookups, async. Verified over HTTP: all 65 widget reports answer, writes work, 19-digit IDs exact.
- [ ] Load the Development backup into the Railway Postgres and run the app on Railway with `BACKEND=pg` (needs the two items above and the owner's OK to deploy).
- [ ] Books and Inventory client in the server (new Zoho API client with Books/Inventory scopes, created by the owner).
- [ ] Storage for files and product images (Creator hosts them today).
- [ ] Railway variables set: Zoho credentials, `ZOHO_ENV`, database URL, `BACKEND`.

## Phase 3 - Procurement (admin screens)
What is left, by section: [[00 - Port Checklist]]. Detailed plan for the first module and the questions for the team: [[Plan - Finish Procurement]]. How the work reaches `main`: [[Plan - Branches and Pull Requests]]. Status 2026-11-12: workflow hooks, Books/Inventory client, the Inquiry stage and the Purchase Request stage are built and tested (mocks); the PR forecast stamp (`PR1_Forecast_Stamp`) waits for the forecast engine. Open: Books credentials from the owner, an oracle comparison against Zoho Development, then PO, Shipments, Receiving, Replacement, Exceptions.

Port in pipeline order, because each stage creates the records the next one uses.

| Stage | Workflows | To port |
|---|---:|---|
| Inquiry | 19 | `create_estimate`, `create_books_contact`, `add_item_by_id` |
| Purchase Request | 21 | `fcStampPurchaseRequest`, `fcPrToPreOrder`, SO-to-PR scripts |
| Purchase Order | 5 | `approvePOMain` and related |
| Shipments | 11 | shipment workflows |
| Receiving | 13 | `create_receiving_from_shipment`, `create_bin_receiving` |
| Replacement, Exceptions, Forecast Setting, Dashboard | 4 + 6 + - | `create_rr_main`, `clone_shipment_for_replacement` |

Definition of done per stage: every workflow and custom API of its forms is ported, the same action done in Zoho Development and in our app gives the same records, tests added.

## Phase 4 - Fulfillment
Readiness Gate → Pick → Pack → QC → Crate → Order Aggregation, then Exception Control, Kanban, Pre-Order, Transfer, To Ship. Custom APIs: `create_package_ff`, `check_payment_status`.

## Phase 5 - Delivery Management
Scheduling engine and `dms_reschedule` first (the most scripts), then Ongoing Service, Exception Queue, Site Visits, Sales Returns, Truck Maintenance, Team Availability. Custom APIs: `create_shipment_order`, `create_sales_return_books`.

## Phase 6 - Suppliers and roles
Tony Fan and Fenteng logins, role-based landing pages, and the supplier-side workflows (`acknowledge_po_*`, `approve_rr_*`, `create_rr_*`).

## Phase 7 - Cutover and hardening
- [ ] Final **Production** export and import per module, pilot of 2-3 staff for a week, then everyone.
- [ ] Audit log of who did what (replaces `zoho.loginuser` stamps).
- [ ] Rotate the Geoapify key hardcoded in `SA_Geocode_Address`.
- [ ] Deploy from GitHub with a staging environment; commit and push all work so far.

# Open questions
| # | Question | Status |
|---|---|---|
| 1 | Will the Creator app ever be deleted, or just left unused? | **answered**: left as is, unused. The Production export is therefore not urgent, but it must be repeated at each cutover (see Phase 7). |
| 2 | Deadline for the cutover | open |
| 3 | Who creates the Books/Inventory API client and gives the scopes? | open |
| 4 | Do Creator workflows send emails or notifications that our app must also send? | to check in `workflows.json` |
| 5 | Production access for the export | open |

# Verification
- `npm test` stays green; each ported function gets a test.
- Headless check of all 45 pages against Postgres: no errors, real records visible.
- Row counts per form: Postgres equals the export manifest.
- For each stage: same action in Zoho Development vs our app, compare the records created.
