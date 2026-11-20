# Supplier Portal

## Purpose
Suppliers (Fenteng, Tony Fan, and others later) see what we need from them and report back directly, so dates and photos arrive as data instead of chat messages.

## Screens (all with an EN / 中文 toggle; the choice is remembered)
| Screen | What the supplier does |
|---|---|
| Inquiries | See lines to quote; set availability (Confirmed / Pending / Unavailable / Cannot Produce), lead time, price |
| Purchase Requests | Quote PR lines that need pricing |
| Purchase Orders | See new POs; **Acknowledge** (or raise a question) |
| Production | For each PO line: report **production started**, **production finished** (with actual date), upload **production photos**; report partial quantities and delays with a new date |
| Shipments | Report booking and **ship date**, upload **shipment photos**, add packing list |
| Replacement Requests | Same flow as POs for RRs |
| Messages | Thread per PO / RR with our buyer |
| Today | One list of everything overdue or asked of them, oldest first (mirrors the daily digest) |

## Rules
| # | Rule |
|---|---|
| SP-R1 | Supplier users see only their own supplier's records, through portal views. **No customer names, addresses or customer prices.** They see the item, quantity, specs, dates we need, and our PO price to them. |
| SP-R2 | A shipment shows in the supplier's portal only after its PO is acknowledged. Stock-item or RR shipments with no PO show without that check. |
| SP-R3 | Dropdown values are stored in English whatever language is displayed (the label is translated, the stored value is not). |
| SP-R4 | Every supplier report stores when it happened (the date they enter) and when they told us (server time). |
| SP-R5 | A "delay" report requires a new expected date and a reason; it updates planned dates and triggers re-forecast. |
| SP-R6 | Login per supplier user (Supabase Auth, role `supplier_user` linked to a supplier). Deep links in digest emails open the right record after login. |
| SP-R7 | Mobile-friendly: suppliers often update from a phone in the factory. |
| SP-R8 | Suppliers with no portal login (Taobao sellers, HC System local, one-off suppliers): the buyer enters their updates for them, with the date it happened. The ladder and silence alerts work the same. |

## Timestamps
All supplier actions are events on the PO / shipment (`po.acknowledged`, `shipment.production_started`, …) with `source = supplier`.

## Notifications
Daily digest per supplier (05 / 05). In-portal notification for new POs, inquiries, RRs and messages.

## Access
Supplier users: own supplier only. Buyer: can view the portal "as supplier" (read-only) to help them.

## Acceptance checklist
- [ ] A Tony Fan user cannot see any Fenteng record or any customer name.
- [ ] Switching to 中文 and saving "Cannot Produce" stores the English value.
- [ ] Reporting production finished with a past date stores both the date and the report time.
- [ ] The portal works on a phone screen.
