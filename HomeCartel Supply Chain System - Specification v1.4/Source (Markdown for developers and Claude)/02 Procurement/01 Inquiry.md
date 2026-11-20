# Inquiry (Request for Quotation)

## Purpose
A sales agent needs a price and lead time for an item, often custom or not in stock. The Inquiry collects supplier quotes so the buyer can select one and the quote can become an Estimate in Zoho Books.

## Fields
`inquiries` and `inquiry_lines` (01 Database): customer, requested by, needed-by date, lines (catalog item or custom description, quantity, specs, reference photos), status. `supplier_quotes`: per supplier per line: availability, lead time (visible to sales); prices in `supplier_quote_prices` (buyer only).

## Screens
| Screen | Who | What |
|---|---|---|
| New Inquiry | Sales agent, buyer | Customer, needed-by date, lines (search catalog, "+ Add item by Books ID", or custom description with photos) |
| Inquiry list | Buyer | All inquiries, oldest first, with status and age; filter by agent, supplier, status |
| Inquiry detail | Buyer | Lines × suppliers quote grid, internal notes, timeline; select supplier per line; push Estimate to Books |
| My inquiries | Sales agent | Own inquiries: status, availability and lead time per line, selected option. **No costs.** |
| Supplier view | Supplier (portal) | See Supplier Portal module |

## Rules
| # | Rule |
|---|---|
| INQ-R1 | Sending an inquiry makes it visible in the selected suppliers' portals and adds it to their daily digest. |
| INQ-R2 | If a supplier marks a line Unavailable or Cannot Produce, the lead time and price fields are disabled for that line. |
| INQ-R3 | The buyer selects one supplier per line. The selected lead time becomes the production days used by the feasibility calculator later. |
| INQ-R4 | "Push Estimate to Books" creates the Estimate in Books with the selected prices and markups (buyer only) and stores the Books estimate ID. |
| INQ-R5 | When Books converts the Estimate to a Sales Order, the SO links back to the Inquiry, and the Inquiry closes. |
| INQ-R6 | Supplier name matching uses one supplier ID, never free text (the old "Tony" vs "Tony Fan" bug must not return). |
| INQ-R7 | If the sales agent gives a needed-by date, the screen shows a feasibility hint per quote: "Lead 20 days + sea → earliest about 18 Jan" (05 / 02). |

## Timestamps
`inquiry.sent`, `inquiry.first_quote_received`, `inquiry.supplier_selected`, `inquiry.estimate_pushed`.

## Notifications
Suppliers: new inquiry in their digest. Buyer: all quotes received, or no quote after `inquiry_quote_days` **[DEFAULT: 2 days]**. Sales agent: supplier selected / estimate ready.

## Access
Sales agent: create and view own. Buyer: all. Supplier: own lines in the portal. Prices: buyer, supervisor, admin only.

## Acceptance checklist
- [ ] A sales agent creates an inquiry with a custom item and photo; the supplier sees it in the portal.
- [ ] The sales agent never sees a price field.
- [ ] Marking a line Cannot Produce disables its price and lead-time fields.
- [ ] Pushing to Books creates an Estimate with the right lines.
