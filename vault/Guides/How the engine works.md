---
title: How the engine works
tags: [guide, architecture]
---

# How the engine works

**Everything the app can do is a function in `src/domain/actions.js`.** The screens only collect input and call it.

## One step

1. `run(db, name, payload)` takes a deep copy of the whole database.
2. The step function changes the copy and returns a message.
3. If any guard fails it throws a `RuleError` carrying a rule id. The copy is discarded, so a refused step changes nothing.
4. On success the copy becomes the new database, is saved to `localStorage`, and an audit line is added.

That is why the tests can assert "a refused step leaves the database untouched" and mean it.

## Rules are data

Every refusal names a rule from `src/domain/rules.js`. The [[Rules Index]] and every rule note come from that file, and the app's Rules page shows the same list.

## The seed is built by the engine

The sample data is not typed in. `src/domain/seed.js` creates it by running real steps ([[inquiryCreate]], [[prConvert]], [[receive]], [[dispatch]] and so on). Every sample record therefore sits in a state the rules would allow, and the seed breaks loudly if a rule changes.

## One screen from one declaration

`src/ui/Screen.jsx` turns a list of columns, tabs, stats and steps into a working page: table, search, detail drawer, forms for the inputs a step needs, and CSV export. Adding a page means writing a declaration in `src/pages/screens.jsx` and a line in `src/nav.js`.

## The scheduling engine

[[srSchedule]] searches up to 14 days from the initial date (or today, if that has passed). It skips Sundays and any day a team is off, ignores teams already at capacity, and picks the least-loaded team. If nothing is free it refuses with [[DMS.FULL]] instead of overbooking. Pick Up jobs skip the engine entirely ([[DMS.PICKUP]]).

## Payment

An item's payment is settled when it is Paid, on Credit, or covered by an override that has not expired. The same check guards both [[gateRelease]] and [[dispatch]].
