# Editable Highlight Component

Drop-in blue "glisten" that marks which fields are actually editable, for any widget in
this app family that has a toggleable edit mode — a plain display view where clicking
Edit swaps specific fields for real inputs, then Save/Cancel swaps them back. Pure CSS,
no JS engine of its own (unlike `timeline_history_component`) — the host widget's
existing edit-mode toggle just needs to flip one class on `<body>`.

## 1. Include the stylesheet

In `<head>`:
```html
<link rel="stylesheet" href="editable-highlight_component/editable-highlight.css">
```

## 2. Mark editable fields

Add `class="is-editable"` to the **wrapper** element around each field that Edit mode
turns into an input — not to the `<input>`/`<select>`/`<textarea>` itself.

```html
<div class="detail-field">
  <div class="detail-label-sm">Quantity</div>
  <div class="detail-val is-editable" id="dvQty">${r.qty} ${r.unit}</div>
</div>
```

**Why the wrapper, not the input directly:** the highlight is painted as a `::after`
overlay, and replaced elements (`<input>`, `<select>`, `<textarea>`, `<img>`) don't
support generated content in any browser — putting `is-editable` directly on one of
those renders nothing. For a bare control with no natural wrapper (e.g. a radio button
in a table cell), add a thin `<span>` around it:
```html
<td><span class="is-editable" style="display:inline-flex;border-radius:50%">
  <input type="radio" ...>
</span></td>
```

If a field is only *sometimes* editable (e.g. locked once a record reaches some
downstream state), compute the class conditionally at render time instead of hardcoding
it — same pattern PRs/app uses for its converted-to-PO lock:
```js
const editableIfUnlocked = lockedNow ? '' : 'is-editable';
...
`<div class="detail-val ${editableIfUnlocked}" id="dvQty">...`
```

## 3. Toggle edit mode

The highlight is dormant by default (plain display view) and only glints once the page
carries `body.is-editing` — flip it in whichever functions already drive your Edit/
Cancel/Save flow:

```js
function enterEditMode(){
  document.body.classList.add('is-editing');
  // ...swap fields to real inputs...
}
function cancelEditMode(){
  document.body.classList.remove('is-editing');
  // ...re-render the plain display view...
}
function saveEdits(){
  // ...on success:
  document.body.classList.remove('is-editing');
}
```

Also clear it as a safety reset wherever the widget opens a *different* record while
one might still be mid-edit (e.g. the top of an `openDetailView(id)`-style function) —
otherwise a stale `is-editing` class can persist onto a record that was never actually
put into edit mode.

## Design notes / known gotchas

- **Dormant vs. active is intentional** — an earlier version of this glinted in the
  plain display view instead (a "you can Edit this" hint) and suppressed itself once
  Edit was clicked. Per user feedback that direction was confusing; the current
  behavior is the opposite: silent until Edit is clicked, then highlights exactly the
  fields that turned into live inputs.
- **Layout-safe by construction** — only `box-shadow`/`position:absolute` are used,
  never `border`/`padding`/`margin`, since fields marked `is-editable` carry very
  different markup across widgets (plain text, badges, pills, radios) and nothing here
  should reflow content.
- **Opaque badge children don't hide it** — painted as a `::after` overlay (paints on
  top of normal children in the same stacking context), not the element's own
  `background-color`, specifically because several real fields (status pills, colored
  badges) are opaque and would otherwise hide a background-color highlight completely.
- **Color is a plain hardcoded blue** (`rgba(37,99,235,*)`, matching this app family's
  `--blue: #2563EB` token) rather than themed via CSS custom properties like
  `timeline_history_component`'s `--tlhc-*` fallbacks — alpha-blended rgba() can't pull
  its color channels from a single CSS var without `color-mix()`. If a widget needs a
  different accent color, override the two `rgba(37,99,235,*)` values directly in the
  keyframes.
