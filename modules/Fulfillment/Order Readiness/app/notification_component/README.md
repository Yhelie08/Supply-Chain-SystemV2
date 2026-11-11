# Notification System Component

Drop-in bottom-right notification bell, for any widget in this app family. Unlike
`timeline_history_component`/`internal-notes_component`, this one is **not** scoped to
a parent record — every widget's instance reads the SAME shared, app-wide report, so a
notification created from any form (or Supplier Portal) shows up no matter which widget
the viewer currently has open.

**Why this has to be embedded in each widget rather than uploaded as its own separate
Zoho Creator widget:** confirmed live (2026-07-31) — placing it as a second widget
alongside an existing one on the same page rendered as its own blank panel/section, with
the bell pinned to that panel's own bottom-right corner, not the page's. Each Zoho
Creator widget runs in its own iframe; `position:fixed` only anchors to the iframe it's
running in. Getting a bell that floats over the host widget's actual content requires
the bell's code to run inside that same document — same reason the other two components
in this family are copy-in folders instead of standalone widgets.

## 1. Create the Zoho form (once, shared across every widget — not per-app)

Since every widget in this app family already resolves to the same underlying Zoho
Creator app, one form/report works for all of them — pick a link name like
`App_Notifications`. Fields:

| Field label | Field link name | Type | Notes |
|---|---|---|---|
| Recipient Email | `Recipient_Email` | Single Line | The account this notification is for. **Not a lookup** — matched by value via a `getRecords` criteria string, same reasoning as `internal-notes_component`'s parent-ref field. |
| Notification Type | `Notification_Type` | Single Line | Short label shown in bold in the panel, e.g. "Purchase Request added". |
| Message | `Message` | Multi Line | The notification body text. |
| Created On | `Created_On` | Date-Time | Written by whatever creates the row (a Deluge workflow on the source form) — used for sorting and the relative "5m ago" display. |
| Read | `Read` | Decision box (Yes/No) | Defaults unchecked/No. Flipped to Yes by this component when the viewer opens a notification, or via "Mark all read". |
| Target URL | `Target_URL` | Single Line | The real Zoho Creator **page** URL to open when this notification is clicked (get it from the browser address bar while viewing that page live). Leave blank for a notification about the page the viewer is already on — clicking it then just marks it read, no navigation. Points at a specific PAGE only, not a specific record on it; see the gotcha below. |
| Source Record No | `Source_Record_No` | Single Line | The human-readable number of the record this is about (e.g. `PR-00042`, `INQ-00007`) — **not read by this component today**, but every Deluge workflow below has it on hand for free (`input.PR_No`, `input.INQ_No`, etc.) and it costs nothing to store now for de-duplication (see the qty-mismatch workflow) and future record-level deep-linking. |
| Source Record ID | `Source_Record_ID` | Single Line | The record's actual Zoho `ID` (`input.ID`), **not** its human No — this is what a `#Record:<report>/<ID>` deep link needs (same scheme `creatorRecordUrl()` already uses elsewhere in this app family). Store it now even though nothing reads it yet; it's the field a future record-level `Target_URL` upgrade would need. |

After creating the form, open its default **Report** and check its own **Link Name** —
that's what the API needs, not the form's link name.

**This component only reads/updates rows** — it never creates them. Population is the
host app's responsibility: a Deluge workflow (On Add/On Edit action, or a Schedule for
time-based conditions like "10 days left") on each source form inserts a row here. See
the notification matrix this was built from for which forms/conditions need one.

### Detection mechanics per notification type (the "Purchasing" rows, HC Systems stand-in)

Every workflow below lives **on the source form itself** (PR form, Shipment form,
Receiving form, Inquiry form) — that's what actually gives it the specific record's own
number/ID for free, via `input.<field>`, with no separate lookup step:

| Notification | Trigger | Condition | Where the record's own No/ID comes from |
|---|---|---|---|
| Purchase Request added | PR form, **On Add** | none — fires every time | `input.PR_No` / `input.ID`, straight off the record being created |
| Purchase Request — supplier responded | PR form, **On Edit** | the field the Supplier Portal writes when it responds flips from blank/old value to set (criteria compares old vs new) | `input.PR_No` / `input.ID` |
| Receiving — item received | Receiving form, **On Edit** | status field changes to "Received" | `input.Receiving_No` / `input.ID` |
| Receiving — expected qty mismatch | Receiving form, **On Add or On Edit** | `input.Received_Qty != input.Expected_Qty` — a field-to-field comparison, so this needs a **Deluge script** action rather than the plain GUI criteria builder (which mostly compares a field to a fixed value) | `input.Receiving_No` / `input.ID` |
| Inquiry — supplier responded | Inquiry form, **On Edit** | same shape as the PR one — whatever field marks a supplier response flips | `input.INQ_No` / `input.ID` |
| Shipment — 10 days left | **no On Add/Edit trigger exists for this** — a shipment just sitting untouched can't fire a record-event workflow when a date threshold passes days later | a daily **Schedule** (Deluge script, cron-like) that queries the Shipment report for `(Target_Delivery_Date - today) == 10`, looping the matches itself — the record's No/ID comes from each row `r` in that loop (`r.Shipment_No`/`r.ID`), not from an `input` |

Each of those inserts one `App_Notifications` row, e.g. (Receiving qty-mismatch, as a
Deluge script On Success Action):
```
if(input.Received_Qty != input.Expected_Qty)
{
  App_Notifications.insert({
    "Recipient_Email"   : "hcinvanalyst@gmail.com",   // HC Systems stand-in, see index.html's own roleMap comment
    "Notification_Type" : "Receiving",
    "Message"            : "Received quantity for " + input.PO_No + " does not match expected quantity.",
    "Created_On"         : zoho.currenttime,
    "Read"               : false,
    "Target_URL"         : "<Receiving page URL for the current environment>",
    "Source_Record_No"   : input.Receiving_No,
    "Source_Record_ID"   : input.ID
  });
}
```
The Shipment schedule is the odd one out — it needs a **de-dupe guard** (e.g. a
`Notified_10d` checkbox on the Shipment form, set `true` right after inserting) so the
same shipment doesn't get a fresh notification every single day it continues to sit at
"10 days left or fewer" once already flagged.

## 2. Include the component in the widget

In `<head>`:
```html
<link rel="stylesheet" href="notification_component/notification.css">
```
Right before the widget's main `<script>` block (so `NotificationSystem` exists when
that code runs):
```html
<script src="notification_component/notification.js"></script>
```
Add a mount point anywhere in the body — position doesn't matter, the bell/panel are
`position:fixed` and don't depend on where their container sits in the DOM:
```html
<div id="notifMount"></div>
```

## 3. Wire it up

```js
var notifications = NotificationSystem.init({
  mountId:          'notifMount',
  appName:          function(){ return REAL_APP_NAME; },      // or a plain string
  reportName:       'App_Notifications_Report',                // exact report LINK NAME from step 1
  currentUserEmail: function(){ return CURRENT_USER_EMAIL; },  // or a plain string — see step 4
  environment:      function(){ return ZC_ENV; },              // or a plain string — see "Design notes" re: dev vs prod URLs
  roleMap:          { 'homecartelpacker@gmail.com':'HC Purchasing', 'hcinvanalyst@gmail.com':'HC Systems' },
  fullAccessRoles:  ['HC Systems'],                             // these roles see EVERY row, no Recipient_Email filter
  title:            'Notifications'
});

// if currentUserEmail() resolves asynchronously AFTER init() already ran
// (a real race — SDK init is a promise):
notifications.refresh();
```

No `.open()`/`.close()` calls needed anywhere — unlike Timeline History/Internal
Conversation, this bell isn't tied to a record being viewed. It starts polling on
`init()` and keeps running for the widget's entire lifetime.

## 4. Resolving `currentUserEmail`

Same approach as `internal-notes_component` — see that component's own README section 4
for the full `ZOHO.CREATOR.init()` / `ZOHO.CREATOR.UTIL.getInitParams()` fallback chain
and its caveats. If email never resolves, the criteria in `_load()` is just left blank,
which means every viewer would see every recipient's notifications — worth confirming
resolution actually works live before relying on this in front of real users.

## Design notes / known gotchas

- **Dormant for anyone not in `roleMap`, same stance as `internal-notes_component`** —
  the whole bell/panel stays `display:none` for an unrecognized viewer (`_applyVisibility()`),
  not even a collapsed/empty icon. `_load()` also bails immediately if `_role()` is
  null, so an unrecognized viewer never even fires the fetch.
- **`fullAccessRoles` — a role in this list sees every row, not just its own** — per
  user request (2026-07-31), HC Systems has this "solo account, access to everything by
  default" status the same way it already does in `internal-notes_component`'s own
  `roleMap`. `_seesAll()` checks this and skips the `Recipient_Email` criteria entirely
  when true. Anyone in `roleMap` but NOT in `fullAccessRoles` (e.g. HC Purchasing) only
  ever sees rows whose `Recipient_Email` matches their own.
- **Demo-data fallback, same stance as every other widget in this family** —
  `_load()` tries `getRecords`; if the report doesn't exist yet (or any error other than
  "no records match"), it falls back to 4 sample rows (`_loadDemo()`) instead of a blank
  or broken bell. Once `App_Notifications` is actually built and reachable, real rows
  take over automatically — nothing else here needs to change.
- **9220/9280 are treated as a real empty state, not a fallback trigger** — those codes
  mean "no records match the criteria" (the report is fine, this viewer just has zero
  notifications right now), same distinction `internal-notes_component` makes. Getting
  this wrong would permanently show demo data to a real user with a genuinely empty
  inbox instead of "No notifications yet."
- **RESOLVED (2026-07-31) — `max_records` must be 200, 500, or 1000, nothing else.**
  The original `max_records: 50` was silently rejected, surfacing as inconsistent
  401/2945/2894-style errors across different test attempts rather than one clear
  message — only once other things were also stripped out of the request did Zoho
  finally return the actual reason: `{"code":9250,"message":"Please enter a valid input
  for 'max_records' key. The possible values are 200, 500, 1000."}`. Every earlier theory
  in this file about role/permission gaps, stale OAuth grants, or report-name mismatches
  was chasing a red herring — the request was simply malformed. `internal-notes_component`
  never hit this because it already used `500`. Lesson: if `getRecords`/`addRecords`
  ever fails with a vague or inconsistent error, try stripping the request down to its
  minimum valid shape (drop criteria, use a known-valid `max_records`) before assuming
  it's a permissions/auth problem.
- **Polling, not push** — 5s `setInterval` by default (`pollMs`, matches
  `internal-notes_component`'s own interval per user request, so a notification created
  by one user's action shows up for every other viewer within one poll cycle). Runs
  continuously regardless of whether the panel is open or collapsed, unlike Internal
  Conversation's polling (which only runs while expanded) — the unread badge needs to
  stay current even with the panel closed.
- **`updateRecordById` writes are best-effort** — a demo row (`ID` starting with
  `demo-`) never attempts a remote write; a real row's failed write just leaves the
  local "read" state as-is until the next poll overwrites it, no retry logic.
- **Click-through navigates the real page, not the widget's own iframe** — clicking a
  notification calls `ZOHO.CREATOR.UTIL.navigateParentURL({action:'open', url, window:
  'same'})`, Zoho's own API for redirecting the actual browser tab from inside a widget
  (a plain `window.location` would only redirect the iframe, leaving the visible page
  unchanged). Falls back to a plain same-tab redirect outside Zoho.
- **Demo rows carry BOTH a dev and a production URL, real rows carry only one** — see
  `_loadDemo()`: `Target_URL_Dev`/`Target_URL_Prod`, picked via `_isProd()` reading
  `cfg.environment` (pass `ZC_ENV`, same variable this app family's own
  `creatorRecordUrl()` already resolves). This split only exists because the demo rows
  are hand-written stand-ins with no Deluge workflow behind them yet — a real
  `App_Notifications` row only ever needs a single `Target_URL`, since whatever Deluge
  workflow writes it only runs in one environment at a time and can bake in the correct
  URL itself at creation. Don't carry the dual-field pattern into the real form schema.
  The prod URL swap itself (`creatorapp.zoho.com/.../environment/<env>/...` →
  `creator.zoho.com/...`, no environment segment) mirrors `creatorRecordUrl()` exactly
  but wasn't independently confirmed live — nothing's published to production yet.
- **Navigation is page-level only, not record-level** — `Target_URL` takes the viewer to
  the right widget/page, but not to one specific record on it (e.g. a PR-added
  notification opens the PR list, not that exact PR pre-selected). Deep-linking into a
  specific record would need the target widget to read a URL parameter/hash on load and
  auto-open that record — not built here; a real gap if per-record navigation turns out
  to matter once this is live.
