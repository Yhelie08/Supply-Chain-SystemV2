---
title: "Fulfillment Pipeline - Readiness to Pack and QC"
tags:
  - fulfillment
  - workflow
  - port
  - status
date: 2026-11-13
---

# Fulfillment pipeline: Sales Order -> Order Readiness -> Pick -> Pack & QC

Written 2026-11-13. The rule of this work: **only Fulfillment is touched** (see the shared files at the end). Related: [[00 - Port Status]], [[00 - Change Log]], [[00 - Porting a Workflow]].

## The flow, as it works now

| Step | What happens | What is written to the database | Stage after |
|---|---|---|---|
| A package is **paid and has a package number** | One Readiness Gate record per item line | `Sales_Order_Readiness_Gate` | **Order Readiness** |
| Not paid (No / Partial), or no package yet | Nothing is created; the package waits | none | Waiting For Package |
| **Release** (picker assigned first) | The item's Pick record, plus a notification | `Pick1`, `Pick_Notifications` | **Picking** |
| **Mark as Picked** | The item's QC record (no checker yet; the Pack & QC page assigns it) | `Checker_Checklist` | **Pack & QC** |

Rules that hold at every step:

- **Paid means `Status = Yes`.** Partial and No stay in Waiting For Package. Paying later and saving again moves the package in, with no duplicates.
- **Per item.** A sibling item that is not released stays out of Pick.
- **Nothing is changed on the way.** SO, PR, RR, Demo, package, order and delivery type, For Crate, target date, item, SKU, quantity, bin, customer, address and forecast are copied as they are from one form to the next. A value that comes out empty never blanks one that is already there (customer name and address, forecast).
- **Stages only move forward.** Saving a Gate or Pick record of a package that is further along does not pull it back (Zoho's Gate script set "Order Readiness" on every save and did).
- **No duplicates.** Saving again updates the record that is there. An approved or rejected QC record is history and is never reopened; an item that comes back through Pick gets a new one.
- **QC record carries the customer's contact:** city, e-mail and phone, from the package record and its Customer record.

## Stages

`Pack` and `Quality Checking` are now **one stage, "Pack & QC"**. The Fulfillment_Stage picklist is: Waiting For Package, Order Readiness, Picking, **Pack & QC**, Crate, For Delivery. The old Pack form (`Pack`) and its notifications (`Pack_Notifications`) are removed: from the code, the model and the Railway database (both were empty).

## Where the code is

| File | What it holds |
|---|---|
| `server/modules/fulfillment/workflows.mjs` | The paid + package rule for the Waiting For Package / Order Readiness stage |
| `server/modules/fulfillment/pipeline.mjs` | The three ports (`soToReadiness`, `releaseToPick`, `pickedToQc`) and the catch-up (`reconcileFulfillment`) |
| `tests/fulfillment-readiness-gate.test.js`, `tests/fulfillment-pipeline.test.js` | 17 tests on PGlite, including data written with no hook and a second run that changes nothing |
| `tools/fulfillment-sync.mjs` (`npm run fulfillment:sync`) | The catch-up, on demand |

Ported from: `SO_to_Readiness` (Sales_Order_Fulfillment), `Release_Records_to_Pick1` (Sales_Order_Readiness_Gate), `Pick1_Marked_to_QC_Sync` (Pick1). `Pick1_Marked_to_Pack_Sync` is retired with the Pack form.

## Important: the hooks run only on the Postgres backend, and only in a restarted server

- The hooks are workflow hooks of the **hooked store** (`BACKEND=pg`, Railway). The local SQLite mode has none.
- A server loads them **at startup**. After changing this code, **restart the server** (`npm run dev`). Releases and Mark Picked done before a restart write only the Release / Marked flag, with no Pick or QC record.
- **Catch-up.** Data that arrives without a hook (a custom API, an import, a direct write, anything saved before a restart) is carried on by `reconcileFulfillment`: it finds what is missing (Gate, Pick, QC) and brings every stage forward. It only acts where a step is missing, so a second run changes nothing. It runs after a Fulfillment custom API (`check_payment_status`, `create_package_ff`) and by hand with `npm run fulfillment:sync` (the Railway tunnel must be open). It is **not** run at every server start: that would write to the shared database on each restart (open decision).

## Checked on the real database (2026-11-13)

Through the same API the widgets use (`addRecords` / `updateRecords` on `Sales_Order_Readiness_Gate_Report`, `Pick1_Report`), on a throwaway order that was deleted afterwards: paid + package -> 1 Gate record (Order Readiness); Release -> 1 Pick record + 1 notification (Picking); Mark as Picked -> 1 QC record (Pack & QC), listed by the Pack & QC page's report `All_Qc_Reports1`.

## Order Readiness and Pick pages (widget fixes of the same day)

- The Release button stays in its own column and enables when a picker is assigned (it used to land in the Last Modified column).
- **Added Time** and **Last Modified** are the last two columns, side by side; Last Modified updates when a picker is assigned and on Release.
- The confirm dialogs ("Release this order?", "Check Payment Status", "Mark this as picked?") have a solid background. The glass theme made every `bg-white rounded-2xl` card see-through, so the rows behind showed. Not done yet for the same dialogs in Pack & QC, To Ship, Transfer Item and Kanban.
- Sales Order Report and Fulfillment Dashboard use the single "Pack & QC" stage (one stat card, one step in the stepper).

## Not ported yet

QC approve -> Crate / Order Aggregation (`QC_Approved_sync_to_Crate`, 1,081 lines, mostly RR replacement logic), Crating done (`Crating_Done_sync_to_Orde`), Dispatch -> For Delivery (`Sync_Fulfillment_Stage_on`), the Fulfillment custom APIs `create_package_ff` and `check_payment_status`, and the forecast engine (`fcStampBySoNo`; the forecast is copied, not computed).

## Outside Fulfillment, left alone on purpose

- **Analytic** (`Supply Chain Analytic`) and Procurement **Forecast Setting** still list the old stages `Pack` and `Quality Checking`, so they will not count records in "Pack & QC".
- The Zoho `.dg` workflows (for example `SO_to_Readiness`, `PACK_SEND_TO_QC`) are not edited. They still write the old stage names and do not run in the local app.
- Shared files touched only where the Pack removal or the pipeline needed it: `zoho-export/parsed` (the Pack and Pack_Notifications forms and reports, the stage picklist), `server/pages.json`, `tools/import-widgets.mjs`, `server/seed-ops.mjs`, `server/pg/api.mjs` (the catch-up after a Fulfillment custom API), `package.json` (the sync script).
- Generated index files (`forms.json`, `INDEX.md`, `menu.json`, `widget-map.json`) still mention Pack; they are rebuilt by `npm run parse-ds`.

## Sample data on Railway

Five sample orders tagged `Added_User = sample-data` (SO-90001 to SO-90005, customers "Home Cartel Sales" and "Shopify - Customer", not real customers). They have been through Release and Mark as Picked, so they sit in Picking and Pack & QC. To remove them, delete the rows with that tag in `Sales_Order_Fulfillment`, `Sales_Order_Readiness_Gate`, `Pick1`, `Checker_Checklist` and `Pick_Notifications`.
