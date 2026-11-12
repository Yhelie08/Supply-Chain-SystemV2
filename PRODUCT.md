# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Confirmed by the owner (2026-11-11):

- **Home Cartel staff** — Purchasing, Sales, Systems, Damage Officer, warehouse (pick, pack, QC, crate) and delivery schedulers. Desktop, in the office and warehouse, all day; the app is their main work tool.
- **Suppliers** — Tony Fan and Fenteng Lighting, companies in China. They use their own supplier portal to answer inquiries, respond to purchase requests, acknowledge purchase orders, ship, and handle replacement requests.
- **Delivery and installation crews** — installers and drivers recording field service site visits, photos and signatures, often on a phone at the customer's site.
- **Management** — reads the Analytic and dashboard screens to see how orders move and where they stall.

## Product Purpose

Run Home Cartel's whole order journey for lighting fixtures and ceiling fans in one system: client inquiry → purchase request → purchase order to a supplier → shipment → receiving → sales-order fulfillment (pre-order, readiness, pick, pack & QC, crate, to ship) → delivery scheduling, service appointments, installation, returns and exceptions.

**Goal: fully replace Zoho Creator.** Every daily operation moves out of Zoho onto this app with the same functions. Success means staff, suppliers and crews do their work here and Zoho Creator can be switched off.

## Positioning

An internal operations system, not a product sold to others. What it does that a generic tool cannot: one order is traced end to end across Home Cartel's own stages and roles — from a client inquiry, through sourcing from its Chinese suppliers, the warehouse's QC and crating, to a scheduled delivery and installation in Metro Manila — with each party (staff, supplier, crew) working on the same record.

## Operating Context

- Six sections, matching the current app menu: Analytic; Procurement; Tony Fan and Fenteng Lighting (supplier portals); Fulfillment; Delivery Management. 42 pages in total (`modules/README.md`).
- Records carry SO, PR, PO, INQ, PAC, RR numbers; suppliers price in CNY, sales are in PHP.
- Time zone Asia/Manila, dates `yyyy-MM-dd`, 12-hour time (from the Zoho export).
- Delivery work follows Metro Manila cities (Pasig, Las Piñas, Taguig, Makati…) and delivery types (Delivery Only, Delivery and Installation, Site Visit, Multi-Day Install).

## Capabilities and Constraints

- **Parity source:** the Zoho export `zoho-export/Supply_Chain_App.ds` (90 forms, 94 reports, 43 Deluge functions, 187 workflows) and the original widget code in `modules/`.
- **Current build:** a local Node + SQLite server (`server/`) runs the original widgets unchanged through a Zoho SDK stand-in. 3 of 24 custom APIs are ported; form workflows are not yet ported.
- **Integrations to replace or keep (undecided):** Zoho Books (sales orders, estimates, contacts, items, sales returns) and the separate CMS app (schedule requests).
- **Undecided:** where it is hosted, how users sign in, and whether data is migrated from Zoho's Development or Production environment.

## Brand Commitments

- Name: **Supply Chain App** (Home Cartel). Role names in use: HC Purchasing, HC Sales, HC Systems, HC Damage Officer.
- Staff-facing instructions are already written in Taglish in places; keep that voice where staff use it.

## Evidence on Hand

- Zoho export and parsed specs: `zoho-export/` (forms, reports, functions, workflows).
- Widget sources for all 42 pages: `modules/<Section>/<Page>/`.
- Deluge notes in Obsidian: `vault/Deluge Scripts (Obsidian)/`.
- No real operating data has been imported yet; screens must not be filled with invented customers, orders or numbers.

## Product Principles

1. **Parity before novelty.** Every Zoho function keeps working the same way until it is deliberately replaced; a redesign never removes a function.
2. **One order, one trail.** Any screen can lead to the same order's earlier and later stages.
3. **Each role sees its own job first.** Staff, suppliers, crews and management each land on what they must act on.
4. **Speak the user's language.** English everywhere, Taglish where staff already use it, Chinese for suppliers.
5. **Nothing invented.** Customers, orders, prices and dates only come from real records.

## Accessibility & Inclusion

- Three languages: English (all screens), Tagalog/Taglish (staff), Chinese 中文 (supplier portals, which already have an EN / 中 switch).
- Crews use phones on site, so their screens must work at phone width with touch input.
