# Zoho Books Integration

## Principle
**Zoho Books stays the system of record for money and stock:** customers, items, Sales Orders, invoices, payments, purchase orders, purchase receives, credit notes. The new system is the system of record for **the work**: stages, stamps, schedules, proofs, exceptions.

**Books and Inventory:** "Books" in this package means HomeCartel's Zoho Books / Zoho Inventory organisation. Purchase receives, transfer orders, packages and stock on hand are Zoho Inventory functions. Step 0 of the build confirms which API each call uses.

## Read from Books (sync in)
| Data | How often | Used for |
|---|---|---|
| Sales Orders (header, lines, date, status incl. void/cancel, customer, salesperson, delivery address) | Webhook if available, plus poll every 10 minutes **[DEFAULT]** | Order Date, PR creation, packages, categories |
| Invoices and payments → `so_payment_status` | Every 10 minutes, and **live re-check at dispatch** (gate G3) | Payment gate |
| Customers, contacts, credit terms | Hourly | Contacts, payment gate |
| Items (catalog) | Hourly; "+ Add item by Books ID" pulls one at once | Inquiry, PR, packages |
| Estimates → SO conversion | With SO sync | Linking Inquiry to SO |
| Credit notes | Hourly | Sales Returns status |
| Stock on hand per item and warehouse → `stock_levels` | Every 10 minutes | The "items available" gate for stock items; stock replacements |

## Write to Books (write-back)
| Event | Books action |
|---|---|
| Inquiry: push estimate | Create Estimate |
| PO sent | Create Purchase Order **[DEFAULT: as today]** |
| Receiving save | Create Purchase Receive **for the delta quantity only** |
| Transfer sent / received | Transfer order **[DEFAULT]** |
| Job done | Mark delivered quantities (package / shipment delivered) against the SO |
| Return received back | Draft credit note / sales return |
| Tracking link created | Store the link on the SO (custom field) **[DEFAULT]** |

## Rules
| # | Rule |
|---|---|
| ZB-R1 | Every Books call goes through the **job queue** with retries (back-off) and is logged; a failed write-back shows on the record ("Books update pending / failed") and alerts Admin after 3 failures. |
| ZB-R2 | Every write is **idempotent**: the system stores the Books ID it created and never creates twice (e.g. the delta check on receives). |
| ZB-R3 | Respect Books API limits with a rate limiter; large backfills run at night. |
| ZB-R4 | Books IDs are kept in our tables (`books_so_id`, `books_po_id`, …). Lookups use the stored ID, never names. |
| ZB-R5 | If Books voids an SO: open PRs go on hold (PR-R2), open packages are Blocked ("SO voided") and the owner is notified. |
| ZB-R6 | If Books changes an SO date or target: copy to open records, re-score, re-forecast (DT-2). |
| ZB-R7 | OAuth tokens live only in Railway environment variables / Supabase secrets, refreshed automatically. |

## Acceptance checklist
- [ ] A new SO in Books appears with the correct Order Date within 10 minutes.
- [ ] Voiding an SO holds its PRs and blocks its packages.
- [ ] A Books outage queues write-backs and completes them when Books returns, with no duplicates.
- [ ] A completed delivery is reflected in Books without anyone retyping it.
