# Tony Notification Component

Drop-in bottom-right notification bell, purpose-built for Tony's own supplier portal
widgets (`Tony-Inquiries`, `Tony-PR`, `Tony-PO`, `Tony-RR`, `Tony-Shipment`). **Not the
same component as the internal `notification_component`** used in `Procurement/*`, nor
Fenteng's own copy (`Suppliers/Fenteng-*/app/notification_component`) — this one reads
an isolated `Tony_Notifications` form, exclusively Tony's own data, mirroring Fenteng's
exact same design. There's no `roleMap`/multi-viewer gating here (nothing to
distinguish) and no `currentUserEmail` config, since nothing here is scoped by who's
logged in.

## 1. `Tony_Notifications` form

Already created (mirrors `Fenteng_Notifications`' own field schema — see that
component's own README for the field guide if it ever needs recreating):

| Field label | Field link name | Type | Notes |
|---|---|---|---|
| Recipient Email | `Recipient_Email` | Single Line | Tony's own portal account email. Not read by this component (no per-viewer filtering). |
| Notification Type | `Notification_Type` | Single Line | e.g. "Shipment added". |
| Message | `Message` | Multi Line | Notification body text. |
| Created On | `Created_On` | Date-Time | Written by whichever Deluge workflow inserts the row. |
| Read | `Read` | Decision box (Yes/No) | Defaults unchecked. |
| Target URL | `Target_URL` | Single Line | The Tony-* widget page to open on click. Leave blank for no navigation. |
| Source Record No | `Source_Record_No` | Single Line | Read by both `dedupeByMessage()` and this widget's `onNotificationClick` as the primary match key. |
| Source Record ID | `Source_Record_ID` | Single Line | Read by `dedupeByMessage()` as the primary dedupe key. |
| Deep Link Token | `Deep_Link_Token` | Single Line | Opaque token used in `Target_URL`'s page-variable query string INSTEAD OF the raw `Source_Record_No` — so a cross-page click can't be turned into "type a different business number, browse a different record." Generated once by the Deluge workflow that inserts the row (see §4), looked up by `checkDeepLinkParam()` on the receiving page. |
| Added User | `Added_User` | Single Line | `zoho.loginuser` at insert time — whoever/whatever triggered the source-form event. Not read by this component; recordkeeping only. |

Open the form's default **Report**, confirm its **Link Name** — that's what `reportName`
needs, not the form's own name.

## 2. Include the component in a Tony-* widget

```html
<link rel="stylesheet" href="notification_component/notification.css">
<script src="notification_component/notification.js"></script>
<div id="tonyNotifMount"></div>
```

## 3. Wire it up

```js
var tonyNotifications = TonyNotifications.init({
  mountId:    'tonyNotifMount',
  appName:    'supply-chain-app',
  reportName: 'Tony_Notifications_Report',
  title:      'Notifications'
});
```

No `currentUserEmail`, no `.refresh()` call needed on identity resolution — starts
polling immediately on `init()` (every `pollMs`, default 5s) and just keeps running.

### Optional: handle a notification type locally instead of navigating

```js
onNotificationClick: function(n){
  if(n.Notification_Type === 'Shipment added' && n.Source_Record_No){
    var match = ALL_ROWS.find(function(r){ return r.shipmentNo === n.Source_Record_No; });
    if(match){ openDetail(match.id); return true; }
  }
  return false;   // not this widget's type — fall through to normal Target_URL navigation
}
```

### Deep link from a cross-page click (page variable)

When `Target_URL` points at this widget's own Creator Page, the page is built with a
**Page Variable** named `tonyshipmentid` (Page Builder -> Variables tab) carrying an
opaque `Deep_Link_Token` — **not** the raw Shipment_No, so the URL itself can't be
hand-edited into a different business number to browse someone else's shipment. On
load, once `ALL_ROWS` finishes loading (including the Acknowledged-PO filter this
widget's own `loadFromCreator()` runs), `checkDeepLinkParam()` reads that token via
`ZOHO.CREATOR.UTIL.getQueryParams()`, looks it up against `Tony_Notifications_Report`
(`Deep_Link_Token == "<token>"`) to recover the real `Source_Record_No`, matches THAT
against `ALL_ROWS` (not the raw record ID, so a deleted/recreated shipment record
doesn't break the link either), and opens that row's detail view directly.

## 4. Deluge workflow — populating `Tony_Notifications`

**Environment auto-detection** — `thisapp.environment.type`, see Tony-Inquiries' own
`notification_component/README.md` §4 for the full explanation/citation (`zoho.deploymentmode`
errored live, dropped). Run `info thisapp.environment.type;` once to confirm the exact
string before relying on it.

`REPORT_NAME` here is `'Tony_Shipment_Report'` — this widget's own comment block notes
the record is pre-created by `shipments_auto_create_supplier_shipment.txt` at
`PR_Approved` time (that script inserts directly into the `Tony_Shipment` form), well
before the supplier ever sees it here. A plain **On Add** workflow on `Tony_Shipment`
still fires from that programmatic insert the same as a user-driven one would — Zoho
Creator's own form triggers run regardless of who/what created the row — so no special
handling is needed here beyond the same On Add pattern as the other four widgets:

| Trigger | Form | Condition | Record No/ID source |
|---|---|---|---|
| Shipment added | `Tony_Shipment`, **On Add** | none — fires every time a row is created (including the programmatic insert from `shipments_auto_create_supplier_shipment.txt`) | `input.Shipment_No` / `input.ID` (both confirmed field names, read by this widget's own `mapRow()`) |

**On Success Action — Deluge script (same confirmed-working pattern as Tony-Inquiries):**
```
page_base_url = "";
if(thisapp.environment.type == "production")
{
	page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
}
else
{
	page_base_url = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app";
}

// Deep_Link_Token: input.ID is already a long, non-sequential platform-generated
// number (nothing like SHP-00019) — concatenating it with a millisecond-precision
// timestamp is enough to stop "just type a different one" enumeration, without
// depending on zoho.encryption.generateHash (NOT available in Creator's Deluge
// engine — confirmed live 2026-08-04, "Not able to find 'generateHash' function").
// Set as part of this SAME insert, no second "update record" step needed.
ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
deep_link_token = "SHP-" + input.ID + "-" + ts;

insert into Tony_Notifications
[
	Recipient_Email = "<Tony's portal account email>"
	Notification_Type = "Shipment added"
	Message = "Shipment " + input.Shipment_No + " was added."
	Created_On = zoho.currenttime
	Read = false
	Target_URL = page_base_url + "/#Page:<Tony-Shipment Creator Page Name>?tonyshipmentid=" + deep_link_token
	Source_Record_No = input.Shipment_No
	Source_Record_ID = input.ID
	Deep_Link_Token = deep_link_token
	Added_User = zoho.loginuser
]
```
Only uses `zoho.currenttime`, string concatenation, and `.replaceAll()` — all already
proven working elsewhere in this app family's own Deluge, unlike the encryption
namespace call this replaced.

The `?tonyshipmentid=...` query string is what `checkDeepLinkParam()` in
`app/index.html` reads via `ZOHO.CREATOR.UTIL.getQueryParams()`, then resolves against
`Tony_Notifications_Report` to recover the real record, to auto-open the right record
when this notification is clicked from a different page. Note this widget's own
`loadFromCreator()` additionally filters `ALL_ROWS` down to only PO-Acknowledged
shipments (see its `filterByPoAcknowledged()` gate) — a shipment notified here but not
yet showing in the list means the supplier hasn't acknowledged the PO yet;
`checkDeepLinkParam()` runs after that filter settles, so it correctly reports "not
found" rather than erroring in that case.

## Design notes

- **Global variable is `window.TonyNotifications`, not `window.FentengNotifications`**
  — deliberately different so this can coexist with Fenteng's own copy if a page ever
  needs both, and so it doesn't misname itself inside a Tony widget.
- **Orange accent** (`var(--orange,#EA580C)`), matching Tony-*'s own brand palette —
  swap the `rgba(234,88,12,*)`/`var(--orange...)` values in `notification.css` directly
  if this ever needs a different accent.
- **Demo fallback** — same "keep it previewable before the real form exists" stance as
  every other component in this app family (`_loadDemo()`).
