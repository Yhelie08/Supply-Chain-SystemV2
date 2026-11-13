---
title: "Plan - Module Folders and Team Split"
tags:
  - plan
  - team
  - git
status: restructure done 2026-11-12, in PR #3 waiting for review; owners and review rules still to be filled in (section 8)
date: 2026-11-12
---

> [!INFO] Where this fits
> How the team splits the work by module without stepping on each other. The migration: [[Plan - Full Migration Off Zoho Creator]]. How a branch reaches `main`: [[Plan - Branches and Pull Requests]]. The first module being finished: [[Plan - Finish Procurement]]. How to port one script: [[00 - Porting a Workflow]]. What is left, by section: [[00 - Port Checklist]].

# Plan: one folder per module, a shared core nobody edits casually

> [!SUCCESS] Status 2026-11-12
> The restructure of section 9 is done on branch `feature/postgres-data-layer` and waits in [PR #3](https://github.com/Yhelie08/Supply-Chain-SystemV2/pull/3) (PR #2 was merged earlier without it): `server/modules/<module>/` exists for all six sections, the server finds the modules by itself, `ported.json` is per module, the tests are in `tests/core/` and `tests/procurement/`, and `.github/CODEOWNERS` is in place (core to `@Yhelie08`, module lines commented until the usernames are known). It changed nothing in how the app behaves: 249 tests pass (245 before, plus 4 new ones for the modules). The only number that moved is the custom API count, 6 of 21 became 6 of 25, because four `approve_po_*` APIs that the Create PO button calls are now listed. The team can start once PR #3 is reviewed and merged (section 10).

## 1. Buod (Tagalog)
- Tama ang hati: **bawat tao ay may sariling module at sariling folder** para doon siya mag-edit. Ang mga module ay ang nasa dropdown ng app: Analytic, Procurement, Tony Fan, Fenteng Lighting, Fulfillment, Delivery Management.
- Pero **hindi sapat ang folder lang.** Ngayon, may 3 file na kailangang galawin ng *lahat*: `server/custom-apis.mjs`, `server/workflows/all.mjs` at `server/workflows/ported.json`. Magkakabanggaan sila sa pag-merge.
- Ang ayos: ilipat ang code ng bawat module sa `server/modules/<module>/`, at awtomatikong kunin ng server ang lahat ng nandoon. Kapag nagdagdag ka ng workflow o API, **sarili mong folder lang ang gagalawin mo.**
- Ang **core** (database, hooks, Books client) ay pinagsasaluhan: hindi ito ginagalaw ng lahat, at may magre-review sa bawat pagbabago.
- **Mauna ang pag-aayos na ito bago mag-clone ang iba**, para walang rebase. Isang PR, isang tao ang gagawa. Hindi nito babaguhin ang takbo ng app o ang mga test.
- **Bago mag-imbita ng kahit sino: gawing Private ang repo** (Public ito ngayon). Tingnan ang seksyon 2.

## 2. Before anyone is invited (do this first)
> [!WARNING] The GitHub repository is public today
> Anyone can read and clone it without an account. It tracks the raw Zoho export (`zoho-export/Supply_Chain_App.ds`, `zoho-export/parsed/raw/`), 659 vault notes, supplier contact emails in about 20 notes, and a **Geoapify API key** (in `SA_Geocode_Address.dg`, in the `.ds` and in one vault note).

The owner account (`Yhelie08`, the only admin) has to do these; the account used by Claude Code only has write access:
1. **Make the repository Private**: Settings, General, Danger Zone, Change visibility.
2. **Rotate the Geoapify key.** It is in the git history, so it must be replaced even after the repo is private.
3. **Each teammate uses their own GitHub account**, added at Settings, Collaborators, Add people, role *Write*. Never a shared login: GitHub does not allow it and nobody could tell who changed what.
4. **Protect `main`**: Settings, Branches, require a pull request and one approval, so Sir Yhel or Sir JV approve every merge.
5. Secrets never travel through GitHub: the Zoho credentials (`server/zoho-credentials.json`, `.env`) and the data backup (`data/zoho-backup`) are passed privately.

## 3. The problem to solve
| Shared file | Why it causes conflicts |
|---|---|
| `server/custom-apis.mjs` | One file holds the handlers (and the "not ported yet" placeholders) of all 25 custom APIs. Every module adds to it. |
| `server/workflows/all.mjs` | The list of modules that have workflows. Every module adds a line. |
| `server/workflows/ported.json` | The record of what is ported. Every module edits it. |
| `tools/build-port-checklist.mjs` (`FORMS`) | Says which forms belong to which section. |
| `tests/` (flat folder) | Not a conflict by itself, but hard to tell whose test is whose. |

The widgets are already one folder per tab (`modules/<Section>/<Tab>/app/`), so they are fine. The real work, porting Deluge to JavaScript, lives in `server/`, and that is what gets split.

## 4. The layout
```
server/
  pg/  workflows/index.mjs, deluge.mjs, suppliers.mjs  books/client.mjs  model.mjs  criteria.mjs
        ^ CORE: shared, changed only through a reviewed PR
  modules/
    procurement/            index.mjs  workflows.mjs  apis.mjs  ported.json
    tony-fan/               (same four files)
    fenteng-lighting/
    fulfillment/
    delivery-management/
    analytic/
tests/
  core/                     tests of the shared parts
  procurement/  fulfillment/  delivery-management/ ...   each module's own tests
modules/<Section>/<Tab>/app/   the widget source, unchanged
```
- `index.mjs` of each module registers its workflows and exports its custom APIs and the "not ported yet" placeholders for the APIs it owns.
- The server finds every `server/modules/*/index.mjs` by itself; `all.mjs` and `custom-apis.mjs` become thin and are never edited when a module grows.
- Each module has its own `ported.json`; Port Status and the Port Checklist read all of them.
- The test command becomes `tests/**/*.test.js`.

## 5. Who owns what
Sizes are from [[00 - Port Checklist]]. Fill in the Owner column.

| Section (app dropdown) | Folder | Workflows | Custom APIs still to port | Owner |
|---|---|---:|---|---|
| Procurement | `server/modules/procurement/` | 58 (22 ported) | 6, plus the 4 `approve_po_*` that the checklist does not list yet | |
| Tony Fan | `server/modules/tony-fan/` | 8 | `acknowledge_po_tony`, `approve_rr_tony` | |
| Fenteng Lighting | `server/modules/fenteng-lighting/` | 12 | `acknowledge_po_fenteng`, `approve_rr_fenteng` | |
| Fulfillment | `server/modules/fulfillment/` | 15 | `check_payment_status`, `create_package_ff` | |
| Delivery Management | `server/modules/delivery-management/` | 16 | `dms_reschedule` (522 lines, the scheduling engine), `create_shipment_order` (199, Inventory), `create_sales_return_books` (262, Inventory) | the person who asked for this split |
| Analytic | `server/modules/analytic/` | 0 | none: the page only reads data | |

Delivery Management already has 3 ported APIs (`confirm_dms_schedule_request`, `decline_dms_schedule_request`, `push_dms_message_to_cms`); they move into its folder. Its 13 widget tabs are in `modules/Delivery Management/`.

## 6. Where modules touch each other
These need a talk between the owners; none can be decided by one person alone.
- **Fulfillment to Delivery:** the order aggregation feeds the delivery queue and service requests. Agree on which records and fields cross the line.
- **`dms_reschedule`** is used by Analytic, Fulfillment and Delivery Management; its owner is Delivery Management.
- **Shared forms** used by several modules: `Items`, `Customer`, `Sales_Order`, `Projects`. Any change to how they are stored goes through the core.
- **`add_item_by_id`** is used by Procurement and Fulfillment; it stays with Procurement.
- **Books to app sync** (sales orders, payments, invoices) and the **forecast engine** serve several modules; each is its own piece of work with one named owner (see [[Plan - Finish Procurement]]).
- **Go-live is all at once**, so every module must be finished before staff switch; nobody's module is "live" on its own.

## 7. Working rules
1. One branch per person and module, from the latest `main`: `feature/delivery-management`, `feature/fulfillment`, and so on.
2. Edit only your own folder (`server/modules/<yours>/`, `tests/<yours>/`, your widgets, your notes). Anything in the core, or in someone else's folder, is a separate small PR that the owner approves.
3. Small pull requests, merged often into `main`, so branches never drift far apart. Rebase on `main` before opening a PR.
4. Before a PR: `npm test` passes, the workflow names are in your module's `ported.json`, and a line is added to [[00 - Change Log]].
5. `.github/CODEOWNERS` names the reviewer of each folder (needs the GitHub usernames).
6. **Generated notes** ([[00 - Port Status]], [[00 - Port Checklist]], the `modules/*/README.md` files) are never merged by hand: if they conflict, run `node tools/build-module-readmes.mjs && node tools/build-port-checklist.mjs` and commit the result.
7. Port with the method in [[00 - Porting a Workflow]], keep Zoho's quirks, and mark them "mirrors Zoho" until the comparison with Zoho Development confirms them.

## 8. Decisions needed from the team
| # | Question | Default | Answer |
|---|---|---|---|
| 1 | Who owns each section (table in section 5)? | One owner each; Delivery Management is the person who asked | |
| 2 | Who reviews changes to the core (database, hooks, Books client)? | Sir Yhel | |
| 3 | GitHub usernames of each teammate, for the invitation and for `CODEOWNERS` | | |
| 4 | Who owns the Books-to-app sync and the forecast engine, which several modules need? | The Procurement owner for the Books sync; forecast decided later | |
| 5 | Does the restructure go ahead before anyone clones the repo? | Yes: one PR, done first, by one person | |

## 9. The restructure itself (done)
Nothing about how the app behaves changes; files move and two registries become automatic.
1. Create `server/modules/<module>/` for the six sections, each with `index.mjs`, `workflows.mjs`, `apis.mjs` and `ported.json`.
2. Move the Inquiry and Purchase Request ports (`server/workflows/inquiry.mjs`, `purchase-request.mjs`) and the Books APIs (`server/books/apis.mjs`, `estimates.mjs`) into `procurement/`; move the three Delivery APIs out of `server/custom-apis.mjs` into `delivery-management/`; split the "not ported yet" placeholders by owner.
3. Make `server/workflows/all.mjs` and `server/custom-apis.mjs` load every `server/modules/*/index.mjs` by themselves.
4. Split `server/workflows/ported.json` into one file per module; teach `tools/build-module-readmes.mjs` and `tools/build-port-checklist.mjs` to read them (and to take each module's list of forms from its own folder).
5. Move the tests into `tests/core/` and `tests/<module>/`; change the `npm test` glob to `tests/**/*.test.js`.
6. Update [[00 - Current System]], [[00 - Porting a Workflow]] and the Port notes.

**Checks that it changed nothing:** `npm test` still passes with the same number of tests (245 at the time of writing); Port Status and the Port Checklist show the same counts (22 of 109 workflows, 6 of 25 APIs); `npm run dev:pg` starts and the report smoke test (`tools/smoke-zoho-reports.mjs`) still answers all 65 reports.

## 10. Order of work
1. Make the repo private, rotate the key, invite teammates ([[Plan - Module Folders and Team Split]] section 2).
2. Restructure (section 9), merged into the branch of [[Plan - Branches and Pull Requests]] or its own small PR.
3. Each owner creates their branch and starts on their module.
4. The owners meet on the touch points in section 6 before Fulfillment and Delivery are connected.
