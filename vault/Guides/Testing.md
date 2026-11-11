---
title: Testing
tags: [guide]
---

# Testing

`npm test` runs three files with Node's built-in runner. No test framework is installed.

| File | What it proves |
| --- | --- |
| tests/workflow.test.js | The rules: each gate refuses what it should, a refused step leaves the data untouched, replacements close the loop, the scheduler never overbooks. |
| tests/render.test.js | Every page renders from the real store and sample data with no "undefined", "[object Object]" or NaN in the output. |
| tests/vault.test.js | This vault builds, every link resolves, and nothing is orphaned. |
## What is not tested

- Clicking. The render test is server-side, so button handlers, forms and the drawer are untested.
- A real browser. Nobody has looked at the layout at phone width or in dark mode.
- Anything against Zoho. There is no Zoho connection in this app. See [[Differences from the Zoho system]].
