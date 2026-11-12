---
title: "Porting a Workflow"
tags:
  - guide
  - porting
  - deluge
  - workflows
---

# Porting a Zoho workflow to the app

How the next piece of Zoho logic (a form workflow or a custom API) moves into our server. Where things stand: [[00 - Current System]]. What is left: [[00 - Port Status]]. The order: [[Plan - Full Migration Off Zoho Creator]]. Worked example: the Inquiry stage, `server/workflows/inquiry.mjs`.

## 1. Decide if it needs a port

The Deluge for every workflow is in `zoho-export/parsed/workflows/form/<Form>/*.dg`, listed per form in `zoho-export/parsed/workflows.json`; functions and custom APIs are in `zoho-export/parsed/functions/*.dg`.

| Event in Zoho | Runs when a widget writes through the API? | Port |
|---|---|---|
| on validate | yes, before the save, can change or refuse the record | `before*` hook |
| on success | yes, after the save | `after*` hook |
| on load, field rules, on user input | no, they only drive Zoho's own forms | no (list it under `nativeFormOnly`) |
| inactive, or no script | no | no (list it under `notNeeded`) |

A custom API is not a workflow: it is a handler in `server/custom-apis.mjs` (Books ones in `server/books/`).

## 2. Write the hooks

In `server/workflows/<module>.mjs`, register hooks for the form and load the module from `server/workflows/all.mjs`:

```js
register('Purchase_Request1', {
  beforeAdd: [fn],  afterAdd: [fn],
  beforeUpdate: [fn], afterUpdate: [fn],
  beforeDelete: [fn], afterDelete: [fn],
});
```

A hook takes one object. Before hooks get `{ form, input, id?, previous?, store, books, user }`: change `input` to change what is saved, throw a `ZohoError` (from `server/criteria.mjs`) to refuse. After hooks get `{ form, id, record, previous?, store, books, user }`: `record` is the saved row with lookup fields as plain IDs, like Deluge's `input.Field`. A failing after hook is logged and does not undo the save (the same as "on success" in Zoho).

On an edit the widget sends only the changed fields, while Zoho's `input` is the whole record: build it as `{ ...previous, ...input }` first (see `checkReadiness` in `inquiry.mjs`).

Writes made through `store` inside a hook, and writes made by custom APIs, do **not** fire hooks again. This is assumed to match Zoho for Deluge-made writes; confirm it on Zoho Development.

## 3. Deluge to JavaScript

| Deluge | In a hook |
|---|---|
| `input.Field` | `record.Field` (after) or `input.Field` / merged record (before) |
| `insert into Form [...]` | `await store.addRecord('Form', { ... }, user)` |
| `update Form[ID == x] [...]` / `rec.Field = v` | `await store.updateRecord('Form', id, { ... }, { byForm: true })` |
| `Form[criteria]` | `await store.getRecords('Form', { criteria })` (use `lit()` from `deluge.mjs` to quote values) or `store.find('Form', row => ...)` |
| `delete from Form[...]` | `store.find(...)` then `store.deleteRecord('Form', id)` |
| `zoho.loginuser` | `user` |
| `"[" + id + "]"` in a text field, `removeFirstOccurence("[")` | `unbracket()` in `server/workflows/deluge.mjs` |
| `invokeurl ... connection:"zhbooks3"` | `ctx.books.books.get/post/put(path, ...)` (Books v3), `ctx.books.inventory...` (Inventory v1) |

Helpers in `server/workflows/deluge.mjs`: `idOf`, `idsOf`, `unbracket`, `truthy`, `blank`, `toNum`, `hasValue`, `sameValue`, `lower`, `inquiryNumber`, `round2`, `lit`, `stamp`.

Values from widgets and from the import are Zoho-style strings (`"true"`, `"12.50"`, `""`), so compare with `truthy()` and `toNum()`, not `===`.

## 4. Keep Zoho's quirks, and say so

Port the script as written, even where it looks odd (for example "ready for estimate" reading a flag from before the save). Cover each quirk with a test whose name starts "mirrors Zoho". Deviations are allowed only for a clear bug that would do harm, and are written in the module's header comment (see `server/books/estimates.mjs`).

## 5. Test

Tests run on PGlite (Postgres in WebAssembly), no database to start. Follow `tests/inquiry-workflows.test.js` for hooks and `tests/books-estimates.test.js` for Books APIs: Books is a stand-in object, so no test ever reaches Zoho Books. `npm test` must stay green.

## 6. Record it

- Add the workflow names to `server/workflows/ported.json` (`ported`, `nativeFormOnly` or `notNeeded`); `tests/workflow-ports.test.js` checks every name exists.
- Custom APIs: add the name to `apiToFn` and `ported` in `tools/build-module-readmes.mjs`, then run `node tools/build-module-readmes.mjs` to refresh [[00 - Port Status]].
- Add a line to [[00 - Change Log]] and tick the stage in [[Plan - Full Migration Off Zoho Creator]].

## 7. Check against Zoho

Create the same record in Zoho Development (read it back through `server/zoho/adapter.mjs`) and in our app (`npm run dev:pg`), and compare the derived fields. Zoho Development is the reference for anything the scripts leave unclear. A write to Zoho Development, even a test one, needs the owner's OK and is deleted afterwards. A write to Zoho Books is real data: no live Books call without the owner's OK.
