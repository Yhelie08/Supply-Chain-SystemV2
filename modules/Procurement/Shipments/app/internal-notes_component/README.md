# Internal Conversation Component

Drop-in per-record private chat between a hardcoded allowlist of accounts, for Zoho
Creator custom widgets in this app family. Built as a stand-in for a real
roles/permissions system — per the request that led to this component: named accounts
(e.g. Purchasing, Sales) need to discuss a specific record between themselves, with
nobody else even aware the feature exists. When real roles/permissions eventually ship,
this component's `roleMap` is the one place that assumption lives — replace it with a
real lookup and nothing else about the component changes.

Started as a strict 1:1 pair, generalized per follow-up user request to an arbitrary
allowlist of any size — granting a new person access is just adding one more
`email: displayName` entry to `roleMap`, nothing else. `roleMap`'s values don't have to
be abstract role labels either; this app family uses each account's real name (e.g.
`HC Purchasing`, `HC Sales`) rather than a generic `Purchasing`/`Sales` tag.

Same self-contained "copy this folder into a new widget wholesale" philosophy as
`timeline_history_component` — and per user request, the same collapsed-by-default
card look: a persistent header (title + a small "with &lt;names&gt;" sub-label + a
Show/Hide toggle button) with the actual chat hidden underneath until toggled open,
right down to matching `timeline_history_component`'s own card/header CSS proportions
almost exactly. A host widget just needs a mount `<div>`, this folder's CSS/JS
included, a few config lines, and calls to `.open()`/`.close()` at the right points in
its own detail-view lifecycle.

**Status in this widget (Shipments): wired but DISABLED** — see
`INTERNAL_CONVERSATION_ENABLED` in `index.html`. Flip it to `true` once you've decided
which accounts belong in `roleMap` for Shipments specifically.

## 1. Create the Zoho form (once per app)

Pick a form link name that fits the parent form it's attached to — this app uses
`Shipment_Internal_Messages`. Fields:

| Field label | Field link name | Type | Notes |
|---|---|---|---|
| Shipment No | `Shipment_No` | Single Line | Plain text copy of the parent Shipment's number. **Not a lookup** — matched by value via a `getRecords` criteria string, not a relation. |
| Sender Email | `Sender_Email` | Single Line | The real account email that sent the message — this is what round-trips, not the display name. |
| Sender Role | `Sender_Role` | **Single Line, not Dropdown** | Whatever string is written here is compared verbatim against the viewer's own resolved `roleMap` name to decide "mine" vs "theirs" bubble styling. Use Single Line rather than Dropdown on purpose: a Dropdown's choice list would need manual upkeep every time `roleMap` gains a new participant (two places to keep in sync instead of one), and a Dropdown's own "valid choices" list doesn't actually prevent a `roleMap`/field mismatch anyway, since the JS never reads the field's configured choices — it just does a plain string comparison. Single Line means adding a new person to `roleMap` is the *only* thing that needs to change. |
| Message | `Message` | Multi Line | The note text itself. |
| Sent On | `Sent_On` | Date-Time | Written client-side by the component (`fmtDateTimeWrite(new Date())`) — same as `timeline_history_component`'s own `Logged_On`, a Date-Time field's "initial value" formula only fires on native-form submissions, not API writes. |

After creating the form, open its default **Report** (left sidebar → Reports, filtered by
the form) and check the report's own **Link Name** via its Rename/Properties panel —
display label and link name can differ, and it's the link name the API needs.

## 2. Include the component in the widget

In `<head>`:
```html
<link rel="stylesheet" href="internal-notes_component/internal-notes.css">
```
Right before the widget's main `<script>` block (so `InternalNotes` exists when that
code runs):
```html
<script src="internal-notes_component/internal-notes.js"></script>
```
Wherever the card should appear in the Detail view's markup, add a single mount point —
same placement convention as `timeline_history_component`'s own `tlhcMount` (right
under the Timeline History card in the same right rail):
```html
<div id="incMount"></div>
```

## 3. Wire it up

```js
var internalNotes = InternalNotes.init({
  mountId:          'incMount',
  appName:          function(){ return REAL_APP_NAME; },     // or a plain string
  formName:         'Shipment_Internal_Messages',
  reportName:       'Shipment_Internal_Messages_Report',      // exact report LINK NAME from step 1
  parentField:      'Shipment_No',                            // the field name from step 1's table
  currentUserEmail: function(){ return CURRENT_USER_EMAIL; }, // or a plain string — see step 4
  roleMap:          { 'homecartelpacker@gmail.com':'HC Purchasing', 'hcinvanalyst@gmail.com':'HC Sales' },
  mentionableMap:   { 'hcdamageofficer@gmail.com':'HC Damage Officer' },   // optional — see step 5
  title:            'Internal Conversation'
});

// whenever the Detail view opens a record (renderDetail(), alongside shipTimeline.open()):
internalNotes.open(r.Shipment_No);

// whenever the Detail view closes (back to the list, e.g. inside showList()):
internalNotes.close();

// if currentUserEmail() resolves asynchronously AFTER a record is already open
// (a real race — SDK init is a promise, detail views can open before it settles):
internalNotes.refresh();
```

To permanently grant someone full participant access (not just the per-record mention
grant from step 5), add one more entry to `roleMap` — nothing else needs to change.

`init()` returns an instance — a widget with more than one internal-conversation mount
(unlikely) can call `init()` again with a different `mountId`/`roleMap` for a second
independent instance.

## 4. Resolving `currentUserEmail`

This component doesn't own identity resolution — it just reads whatever
`currentUserEmail()` returns at the moment it's called, and looks it up in `roleMap`.
The host widget is responsible for actually finding the logged-in user's email. This
widget already resolves `REAL_APP_NAME`/`ACCOUNT_OWNER` via `ZOHO.CREATOR.UTIL.getInitParams()`
inside `loadList()` — `CURRENT_USER_EMAIL` is resolved the same way, in the same
callback. The known-working alternate approach in this app family (see
`INQs/app/index.html`'s `initWidget()`):

```js
var initData = await ZOHO.CREATOR.init();
CURRENT_USER_EMAIL = initData.loginUser || initData.login_user || initData.userEmail || initData.user || '';
```

**This key name isn't documented/guaranteed** — it's been observed to vary across SDK
versions and even across widgets in this same app family. Try both `ZOHO.CREATOR.init()`
and `ZOHO.CREATOR.UTIL.getInitParams()` defensively, behind `typeof ... === 'function'`
guards, and treat whichever resolves first as authoritative. If email resolution never
succeeds, `_role()` returns `null` for every viewer and the component simply never
shows itself — a safe failure mode, but worth confirming live rather than assuming it
works.

## 5. `@`-mention → grants access (optional)

Typing `@` in the message box pops up a small list of names from `cfg.mentionableMap`;
picking one (click, or Arrow keys + Enter/Tab) inserts `@Name ` into the message text,
same as any mention UI. **But per user request (2026-07-30), being mentioned this way
does more than insert text — it actually grants that email real access to this specific
record's conversation.** The next time that email opens this same record, `_checkMentionAccess()`
scans the thread's existing messages for `"@" + their mentionableMap name`; if found,
they're treated as a genuine participant for that record — same as a `roleMap` entry,
just scoped to the one record they were mentioned in rather than every record.

This needs a real email (unlike a plain name list) because access is granted per
*email*, not per display string. Leave it as the default empty object (or omit it) to
disable mentions entirely.

**Security note — read before relying on this**: any existing participant can grant a
`mentionableMap` person access to a specific record's thread just by mentioning them
once in a message. There's no separate approval step, and since messages are never
edited or deleted from this widget, the grant is effectively **permanent** once made —
the only way to revoke it is deleting the mentioning message directly in Zoho Creator's
own report view (outside this widget).

## Design notes / known gotchas

- **Dormant for anyone not in `roleMap`, on purpose** — not even the collapsed header
  renders for an unrecognized viewer (the whole `.inc-wrap` stays `display:none`). This
  is **not** connected to Zoho Creator's own profile/permission system in any way.
- **Not limited to exactly 2 participants** — `roleMap` can hold any number of
  `email: displayName` entries. `_otherNames()` returns a comma-joined list of every
  OTHER recognized participant's name (excluding whoever's viewing), plus any
  `mentionableMap` person who's actually earned access (`_grantedMentionNames()`,
  checked against `this.rows` — the server's own sent-message history, never a live
  unsent draft).
- **Header is 2 rows, not 1** — title+toggle on their own row (`.inc-header-top`), the
  "with &lt;names&gt;" sub-label on a full-width row below it, truncating with its own
  ellipsis instead of squeezing the title.
- **Always opens collapsed** — `.open()` resets to the collapsed state on every new
  record, same reset pattern as `timeline_history_component`'s own `.open()`.
- **Polling, not push** — same 5s-interval `setInterval` pattern as
  `timeline_history_component`; only runs while expanded.
- **`Sender_Role` values must match `roleMap` exactly** — see the form template above
  (and why it's Single Line, not Dropdown); this is a plain string comparison.
