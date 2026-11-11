# Modules

One folder per section of the app's section dropdown, in the same order as the app menu. Each tab folder is the widget's source as uploaded to Zoho Creator (`app/` + `plugin-manifest.json`).

| Section | Tabs | Forms | Deluge functions | Workflows |
|---|---|---|---|---|
| [Analytic](Analytic/README.md) | 1 | 8 | 5 | 47 |
| [Procurement](Procurement/README.md) | 9 | 44 | 12 | 142 |
| [Tony Fan](Tony%20Fan/README.md) | 5 | 19 | 4 | 96 |
| [Fenteng Lighting](Fenteng%20Lighting/README.md) | 5 | 19 | 4 | 100 |
| [Fulfillment](Fulfillment/README.md) | 10 | 36 | 8 | 111 |
| [Delivery Management](Delivery%20Management/README.md) | 12 | 23 | 9 | 26 |

Regenerate after a new `.ds` export or widget import:

```
node tools/parse-ds.mjs
node tools/import-widgets.mjs
node tools/build-module-readmes.mjs
```
