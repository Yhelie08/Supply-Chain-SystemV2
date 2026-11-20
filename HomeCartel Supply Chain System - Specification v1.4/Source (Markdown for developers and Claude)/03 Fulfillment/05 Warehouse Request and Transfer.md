# Warehouse Request and Transfer

## 1. Warehouse Request

**Purpose:** other departments (mostly sales) ask the warehouse for something about an item: actual photos or video, a check of condition, a measurement, a stock count.

| Field | Detail |
|---|---|
| Type | Photo / video request, condition check, measurement, stock check, other **[DEFAULT list]** |
| Requested by, date, item(s), request text, reference image | From the requester |
| Assigned to | Fulfillment staff (suggested: least loaded; supervisor confirms) |
| Result | Actual photos, videos, remarks |
| Status | Requested → Assigned → Done / Cannot do |

| # | Rule |
|---|---|
| WR-R1 | Requests are ranked oldest first, separate from package work. |
| WR-R2 | Silence alert if not done within `warehouse_request_hours` **[DEFAULT: 24 working hours]**. |
| WR-R3 | The requester is notified when done, with the files. |

Stamps: `warehouse_request.created`, `assigned`, `done`.

## 2. Transfer (WH1 Banawe ↔ WH3 Baesa)

**Purpose:** move stock between warehouses with a clear record of what left and what arrived.

| # | Rule |
|---|---|
| TR-R1 | A transfer lists items, quantities, from and to bins. |
| TR-R2 | **Sent** stamps when the sender confirms loading; **Received** stamps when the receiver confirms quantities and **signs**. Differences create an exception. |
| TR-R3 | Stock moves in Zoho Books (transfer order) are posted at Sent and Received **[DEFAULT: as Books supports]**. |
| TR-R4 | A package can be fulfilled from either warehouse; if its items are split, the supervisor either transfers or splits the package (PKG-R2). |

Stamps: `transfer.sent`, `transfer.received`.

## Acceptance checklist
- [ ] A sales agent's photo request reaches the warehouse and returns photos to the agent.
- [ ] A transfer received short creates an exception with the difference.
