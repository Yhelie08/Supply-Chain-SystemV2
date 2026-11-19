# Python Foundation — Design

Date: 2026-11-19
Scope: Sub-project 1 of the Node→Python backend conversion. Pure plumbing: no business logic from any department. Proven by serving one existing widget (Order Readiness) unmodified against this new backend.
Source repo for parity: `HCCsDev/Supply-Chain-SystemV2` (Node), branch `jv-update` at commit `b5c45cb`.
Target: this repo (`HCCsDev/Supply-Chain-SystemV2-Python`), `main`.

## 1. Purpose

The current Node backend's entire widget-facing contract is a thin `zoho-shim.js` on the client, posting to a handful of `/api/*` routes that echo Zoho Creator's own SDK response shape (`{code, data, message}`). Every one of the ~90 existing widget HTML files is written against that shim and must keep working **completely unmodified** — the conversion is backend-only, confirmed by the user. This sub-project builds the Python side of that contract plus the generic data layer every department module will be ported onto, with zero department-specific logic.

Decision (confirmed with the user before this doc): reproduce `jv-update`'s current behavior first; HomeCartel spec v1.4 gaps (sorting engine refinements, pre-delivery gate, etc. — the slices already designed and partly built in the Node repo) are added **after** parity, as their own sub-projects, not folded into this conversion.

## 2. The contract Foundation must serve

Read directly from `server/public/zoho-shim.js` (Node repo) — this file itself never changes; everything behind it does:

| Shim call | HTTP | Node handler (for behavior reference) |
|---|---|---|
| `ZOHO.CREATOR.DATA.getRecords(cfg)` | `POST /api/getRecords` | `server/pg/api.mjs` `getRecords` |
| `ZOHO.CREATOR.DATA.getRecordById(cfg)` | `POST /api/getRecordById` | same file, `getRecordById` |
| `ZOHO.CREATOR.DATA.addRecords(cfg)` | `POST /api/addRecords` | same file, `addRecords` |
| `ZOHO.CREATOR.DATA.updateRecordById(cfg)` | `POST /api/updateRecordById` | same file, `updateRecordById` |
| `ZOHO.CREATOR.DATA.updateRecords(cfg)` | `POST /api/updateRecords` (bulk, by criteria) | same file, `updateRecords` |
| `ZOHO.CREATOR.DATA.deleteRecordById(cfg)` | `POST /api/deleteRecordById` | same file, `deleteRecordById` |
| `ZOHO.CREATOR.DATA.invokeCustomApi(cfg)` | `POST /api/invokeCustomApi` | same file, `invokeCustomApi`, dispatching into `server/custom-apis.mjs` |
| `ZOHO.CREATOR.FILE.uploadFile(cfg)` | `POST /api/uploadFile?report=&id=&field=&name=` (raw body) | `server/index.mjs` inline handler |
| `ZOHO.CREATOR.FILE.readFile(cfg)` | `POST /api/readFile` (binary response) | same file, inline handler |
| `ZOHO.CREATOR.UTIL.getInitParams()` | no network call — reads `window.HC_USER`, injected server-side into the page | n/a |
| page load | `GET /api/me`, `GET /api/pages` | `server/index.mjs` |

Every JSON response's envelope is `{code, message, data}` on success (`code: 3000`) or `{code, message}` on failure — this exact shape is non-negotiable since `zoho-shim.js` branches on `res.code !== 3000` to decide success vs. throw.

## 3. Architecture

Five layers, each with a direct Node-file counterpart to port from (not transpile — redesigned in Python terms, same responsibility):

1. **Schema/model loader** (`server/model.mjs` → `app/model.py`): parses `zoho-export/parsed/forms/*.json` (unchanged, reused as data — these are just JSON files, language-agnostic) into a `{form_name: {column_name: {type, kind}}}` map. Also loads `server/spec-forms/*.json`'s extension mechanism (fields layered onto an existing parsed form, immune to a future `parse-ds` re-export) — ported as the same two-pass loader, since Fulfillment's `Category`/`Queue_Rank`/`Box_Count`/`Stage_Events` etc. (built this session) depend on it existing.
2. **Store abstraction** (`server/pg/store.mjs` → `app/store.py`): generic `find(form, predicate=None, criteria_str=None)`, `get_record_by_id`, `add_record`, `update_record`, `delete_record` — operating over the dynamic column map from layer 1, not typed ORM models (the schema spans ~90 forms with Zoho-originated column sets; a generic table-row abstraction matches what the Node code actually does, rather than hand-writing 90 SQLAlchemy model classes). Built on SQLAlchemy Core (`sqlalchemy.Table` reflection/construction) or raw `asyncpg` — decided in the implementation plan once connection-pooling and the async-FastAPI fit are compared concretely, not guessed here.
3. **Criteria parser** (`server/criteria.mjs`'s `compileCriteria` → `app/criteria.py`): Zoho criteria strings (`(ID == 123)`, `(Status == "Yes" || Has_Credit_Terms == true)`) compiled to a SQL `WHERE` fragment plus params. Pure string/AST logic — the most directly portable piece in the whole system, since it has no I/O.
4. **Workflow/hook system** (`server/workflows/index.mjs` → `app/workflows.py`): `register(form, {beforeAdd, afterAdd, beforeUpdate, afterUpdate, beforeDelete, afterDelete})` and `create_hooked_store(raw_store, registry)` — a wrapping store whose `add_record`/`update_record`/`delete_record` run the registered phase functions around the raw store's own calls, exactly mirroring the Node version's behavior (hook args always carry the *raw* store, confirmed in this session's own Node work, to prevent hook-triggered re-entrancy — this invariant must be preserved, not just incidentally true).
5. **HTTP layer** (`server/index.mjs`'s routing → FastAPI app + routers): the `/api/*` endpoints from §2, session-cookie auth (`server/auth.mjs`/`access.mjs` ported as the same cookie-based session model — not re-architected to JWT or anything else, since the widgets' cookie-carrying `fetch` calls are unchanged), and the two binary endpoints.

## 4. What this sub-project does NOT include

- Any department's business logic: no Fulfillment pipeline/sorter, no Procurement, no Delivery scheduling, no supplier portals. `invokeCustomApi`'s dispatch table (layer 5) exists and is wired, but every entry in it is a placeholder (mirroring Node's own `notPorted()` pattern in `custom-api-helpers.mjs`) until that module's own sub-project builds it.
- Zoho Books / Akeneo / Shopify clients — cross-cutting integrations, their own later sub-project, built alongside whichever department first needs them (Fulfillment needs none of the three directly; Procurement needs all three).
- Scheduled jobs (`server/schedules.mjs`'s nightly runner) — needs real module hooks registered to be worth building; comes with whichever module first needs a schedule (Fulfillment's `Recalculate_Fulfillment_Queue` would be the first real consumer).
- Any UI change. The existing widget HTML/JS files are copied into this repo unmodified (same `modules/` tree) — this sub-project's only UI-adjacent work is making sure `server/public/zoho-shim.js`, `index.html`, `login.html`, `account.html` and the theme JS under `server/public/theme/` are served byte-identical to the Node version.

## 5. Proof of done

A single widget — **Order Readiness** (chosen because it already exercises `getRecords` with criteria, `updateRecords` bulk-by-criteria, and at least implicitly the custom-API path once Fulfillment's sub-project adds `recalculate_fulfillment_queue`) — loads, lists records, releases a package, and shows the capacity bar, running against the Python server with **zero changes to its own HTML/JS file**. Since Order Readiness's custom API isn't built yet in this sub-project, the proof narrows to: sign-in, `getRecords`/`getRecordById`/`updateRecords` round-trip through the generic store, and the criteria parser handling the exact criteria strings Order Readiness already sends today (confirmed from the Node widget's own code, not invented).

## 6. Acceptance checklist

- [ ] `POST /api/getRecords` with a `criteria` string identical to one the Node version accepts returns the same rows (compared against a snapshot from the Node server on the same test data).
- [ ] `POST /api/updateRecords` with a bulk criteria match updates every matching row, same as Node's `updateRecords` handler.
- [ ] A hook registered via `register(form, {afterAdd: fn})` fires on `add_record` and receives the **raw** store, not the hooked one (re-entrancy safety, carried over from the Node invariant).
- [ ] Session cookie auth: an unauthenticated request to any `/api/*` route (except `/api/me` pre-login semantics, matching Node's own exception list) gets a 401 in the same envelope shape.
- [ ] `server/spec-forms/`-style field extension loads and merges into the base parsed form's column map, matching the Node repo's `model.mjs` extension logic.
- [ ] Order Readiness's widget file, copied byte-for-byte from the Node repo, loads and lists/updates records against the Python server with no edits.

## 7. Open question carried to the implementation plan

Store layer's exact Python library (SQLAlchemy Core vs. raw asyncpg) is deferred to the plan, where connection pooling, async driver maturity, and the criteria-parser's SQL-fragment output format can be compared against real code rather than decided in the abstract here.
