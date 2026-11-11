# Timeline History Component

Drop-in per-record activity log for Zoho Creator custom widgets in this app family. The card
is injected entirely by JS — a host widget just needs a mount `<div>`, this folder's CSS/JS
included, a few config lines, and calls to `.log(...)` wherever an action happens. No copying
the whole implementation into every widget by hand.

## 1. Create the Zoho form (once per app)

Pick a form link name that fits the parent form it's logging for, e.g. `Inquiry_Timeline`,
`PR_Timeline`. Fields:

| Field label | Field link name | Type | Notes |
|---|---|---|---|
| (parent ref, e.g. "INQ No") | matches the parent form's key, e.g. `INQ_No` | Single Line | Plain text copy of the parent record's number/key. **Not a lookup** — matched by value via a `getRecords` criteria string, not a relation. |
| Action | `Action_Title` | Single Line | The headline text (e.g. "Updated Target Date"). **Do not link-name this field literally `Action`** — it's a reserved word in Zoho Creator. Creator doesn't error on it; it silently gives the field a different real link name (observed: auto-suffixed to `Action1`), so anything written under the key `Action` never reaches the field, and reads never find it either — confirmed live 2026-07-28 on `Inquiry_Timeline`, symptom was every entry displaying its fallback title after a reload. |
| Action Type | `Action_Type` | Dropdown | Choices: `Created`, `Updated`, `Approval`, `Estimate`, `Message`, `Deleted` — **all of these must actually be added as real choices on the field**, even the ones a given widget doesn't call `.log()` with yet. A Dropdown's write is validated server-side against its configured choice list; sending a value that isn't one of the configured choices gets the whole `addRecords` call rejected, not just that one field — confirmed live 2026-07-29 on `Exception_Timeline`, symptom was every entry staying stuck showing "unsaved" forever (and reads failing too, since the report legitimately had zero successfully-written rows). Extend the choice list per widget as needed; unrecognized *incoming* values (e.g. read from an older/differently-configured report) just render with the generic "updated" dot color, so adding more choices later is always safe — it's only a missing choice that breaks writes. |
| Changes | `Changes` | Multi Line | One `Label: old → new` (or `Label: value`) per line — this is what the component parses back into the chip list under each entry. Written/read by the component; don't hand-edit the format. |
| Actor | `Actor` | Single Line | Who did it. |
| Logged On | `Logged_On` | Date-Time | Written client-side by the component (`Logged_On: fmtDateTimeWrite(new Date())`) — a Date-Time field's "initial value" formula only fires on native-form submissions, not API writes, so it has to be sent explicitly either way. |

After creating the form, open its default **Report** (left sidebar → Reports, filtered by the
form) and check the report's own **Link Name** via its Rename/Properties panel — display
label and link name can differ, and it's the link name the API needs. It won't always match
the form's name (Creator has been observed suffixing it, e.g. `Inquiry_Timeline_Report`).

## 2. Include the component in the widget

In `<head>`:
```html
<link rel="stylesheet" href="timeline_history_component/timeline-history.css">
```
Right before the widget's main `<script>` block (so `TimelineHistory` exists when that code runs):
```html
<script src="timeline_history_component/timeline-history.js"></script>
```
Wherever the card should appear in the Detail view's markup, add a single mount point:
```html
<div id="tlhcMount"></div>
```

## 3. Wire it up

```js
var timeline = TimelineHistory.init({
  mountId:     'tlhcMount',
  appName:     function(){ return REAL_APP_NAME; },  // or a plain string
  formName:    'Inquiry_Timeline',
  reportName:  'Inquiry_Timeline_Report',             // exact report LINK NAME from step 1
  parentField: 'INQ_No',                              // the field name from step 1's table
  actor:       function(){ return CURRENT_USER; },    // or a plain string
  title:       'Timeline History',
  maxVisible:  5,                                     // entries visible before the card scrolls
  maxHeight:   420                                    // pixel cap too — a few multi-field entries
                                                       // (several chips each) can get tall enough
                                                       // to need scrolling well before maxVisible
                                                       // entries have even been reached
});

// whenever the Detail view opens a record:
timeline.open(val(record.INQ_No));

// whenever an action happens:
timeline.log(val(record.INQ_No), 'SRP approved', 'Approval', [
  { label:'SRP Amount', from:'₱0.00', to:'₱4,000.00' }
]);
```

`init()` returns an instance — a widget with more than one timeline card (unlikely, but
possible) can call `init()` again with a different `mountId`/config for a second independent
instance.

## Building a diff instead of hand-writing every entry

For a straight field-by-field diff of a save payload against the record it's overwriting:
```js
var changes = TimelineHistory.diffFlat(currentRecord, payload, FIELD_LABELS, SKIP_FIELDS, NUMERIC_FIELDS);
if(changes.length) timeline.log(inqNo, TimelineHistory.titleFor(changes, 'Updated record'), 'Updated', changes);
```
- `FIELD_LABELS` — `{ payloadKey: 'Human Label' }`. Only keys present here get logged; every
  other key in the payload is silently skipped (derived/internal fields don't need a label).
- `SKIP_FIELDS` — `{ payloadKey: 1 }`. For fields that are recomputed from other data on every
  save (e.g. a "ready" checkbox derived from other columns) — logging them would double-report
  a change the rest of the diff already describes in plain terms.
- `NUMERIC_FIELDS` — `{ payloadKey: 1 }`. Compared as numbers instead of strings, so `"1500"`
  vs `1500` (or a formatted vs. raw amount) isn't reported as a false change.
- `TimelineHistory.changed(from, to, blankDefaults)` and `TimelineHistory.norm(v)` /
  `.normNumeric(v)` are exported too, for hand-rolled diffs of nested data (grids/subforms)
  the same way `app/index.html`'s own `tlDiffQuotes` does for the Supplier Quotes grid — that
  function is app-specific (it understands what a "supplier quote row" is) and intentionally
  lives in the host widget, not in this component.

## Preview without a live Zoho connection

```js
timeline.seed('INQ-00001', [
  { Action_Title:'Inquiry created', Action_Type:'Created', Actor:'HC Sales 1', Logged_On:'2026-06-24 10:00:00',
    Changes:'Item: Sample Item\nCustomer: Sample Customer' }
]);
```
Seeded rows only ever show when the Creator SDK genuinely isn't available (standalone/demo
mode, same as this app's own `loadDemoData()`) — the instant a real connection exists, seeded
data is ignored in favor of the actual report, so it can never mask real data.

## Design notes / known gotchas

- **`Action` is reserved** — see the form template above. If a future field ever silently
  stops round-tripping while its neighbors work fine, that's the first thing to suspect:
  check the field's real link name in its Field Properties panel, it may differ from what
  you typed.
- **`Action_Type`'s Dropdown choices must all be configured, not just the ones a widget
  currently uses** — a write with a value outside the field's configured choice list fails
  the entire `addRecords` call (not just that field), which looks identical to a
  connectivity problem: entries stay stuck on "unsaved" and the report reads back as
  reachable-but-empty. If entries never confirm as saved, check this before anything else.
- **AM/PM parsing** — `Logged_On` can come back from Creator in 12-hour format with a
  trailing `AM`/`PM` marker depending on the field's display format setting. The component's
  `parseWhen()` detects and converts that; if you ever see times shift by 12 hours after a
  reload, that parsing is the place to check first.
- **Scroll-after-N** is measured against the actual rendered DOM (`getBoundingClientRect()`
  on the Nth item), not a fixed pixel height — entry height varies a lot with chip count, so
  a fixed height would either clip a short 5th entry or leave too much blank space.
