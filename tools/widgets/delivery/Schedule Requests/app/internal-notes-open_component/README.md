# Internal Conversation Component — OPEN ACCESS variant

Forked from `UI/complaint-form/app/internal-notes_component/` 2026-08-28 for the
cross-app Schedule Request <-> Supply Chain App connection. See that folder's own
README for the original gated design this diverges from.

**Real difference**: no `roleMap`/`mentionableMap` — this module is deliberately
open to anyone with access to the module (explicit user decision, see
`docs/superpowers/specs/2026-08-28-schedule-request-supply-chain-connection-design.md`).
Access is granted to ANY resolved `(currentUserEmail, currentUserName)` pair, not
a fixed list. Field key is `Sender_Name` (a real display name), not `Sender_Role`.
Mention autocomplete is built from distinct `Sender_Name` values already seen in
the current thread, not a fixed map.

**Host is responsible for identity resolution** — pass `currentUserEmail`/
`currentUserName` as functions. Both CMS (`request-schedule.html`) and Supply
Chain App (`dms-schedule-request.html`) resolve identity the same way: try
`ZOHO.CREATOR.UTIL.getInitParams()` first (real login), fall back to
`ZOHO.CREATOR.init()`, fall back to a one-time "What's your name?" prompt
remembered in `localStorage`. See each widget's own identity-resolution code
for the exact chain.

**This is a genuinely separate copy from `internal-notes_component`** — not a
config variant of it. Any future fix to the gated original does NOT
automatically apply here; check both if a shared bug is found (same
"each host keeps an independent copy" convention this component family
already follows).
