# Next Step and the Approval Queue

## 1. Next Step on every record

Every record shows **where it is now, what happens next, and who does it**, for example:

> **Next:** Quality check · Checker

- **NS-1** One list per module in `next_steps` (module, status → next step text, role). Changing a process edits one list, not every screen.
- **NS-2** Display only. It does not block saving.
- **NS-3** Next Step answers *"what happens to this order"*; the sorting engine answers *"which order next"*. Both appear on every queue row.
- **NS-4** Procurement and Delivery show a whole-order view: one line per Sales Order showing the furthest stage reached by each part ("2 of 3 lines received · 1 in transit, ETA 20 Nov").

## 2. The approval queue

Everything the system or an agent **prepares** but a human must **decide** goes into one queue (`approval_queue`), shown as a "Decisions" inbox per role.

| Kind | Prepared by | Decided by | Options shown |
|---|---|---|---|
| `air_upgrade` | Feasibility gate / Act now | Buyer | Upgrade to air (saves N days, extra cost shown to buyer only) · Keep mode and move target · Keep and tell customer |
| `ladder_day3` | Supplier ladder | Buyer (+ supervisor for main suppliers) | Cancel and re-source (Taobao option, price, lead time) · Hold N more days |
| `forecast_promise_change` | Forecast engine | Sales agent or supervisor | Accept new target (and tell customer) · Keep target |
| `partial_dispatch` | Pre-delivery gate | Fulfillment supervisor | Dispatch partial with recorded consent · Hold until complete |
| `third_party_booking` | Delivery sorter | Dispatcher | Book third party · Keep own team on date X |
| `agent_message` | An agent | Owner of the record | Send as drafted · Edit and send · Discard |
| `agent_update` | An agent (e.g. dates read from a supplier email) | Buyer / tracker | Apply · Reject |
| `force_close` | Dispatcher action | Supervisor review after the fact | Confirm · Reopen |

Rules:

- **AQ-1** Each item shows a one-paragraph summary, the facts behind it (with links to the records) and one-click options.
- **AQ-2** Decisions are stamped and kept (who, when, which option). `decided_by_type` = human, or agent where a rule allows auto-approval.
- **AQ-3** Items not decided within `approval_sla_hours` **[DEFAULT: 24]** escalate to the supervisor.
- **AQ-4** An item whose underlying record changes (e.g. the supplier shipped) is marked stale and removed automatically.
