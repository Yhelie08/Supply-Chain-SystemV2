---
title: Differences from the Zoho system
tags: [guide, context]
---

# Differences from the Zoho system

> [!WARNING] This is the earlier prototype
> These notes describe the React prototype in `src/`. The real system now runs the original Zoho widgets on our own server, with a database, sign-in and users, hosted on Railway. See `vault/Deluge Scripts (Obsidian)/00 - Current System.md` and `00 - Port Status.md`.

The live system runs on Zoho Creator (Deluge scripts and widgets) with Zoho Books and Inventory behind it. This app is a standalone React model of the same flow. It is not connected to any of that.

| Live system | This app |
| --- | --- |
| Separate forms for Gate, Pick, Pack, QC, Crate and Order Aggregation, each synced by a script | One item record whose `stage` changes. No sync scripts, so none can drift or fail silently. |
| Estimates, invoices, packages and stock in Books and Inventory | Estimate and package numbers are generated locally. There is no accounting. |
| Rules scattered across Deluge scripts and widget code | 118 rules in one file, enforced in one place, shown in the app. |
| Many people, with roles | One browser, no sign-in, no roles. |
| Scheduled jobs (shipment delay, forecast) | None. Nothing happens by itself over time. |
| Supplier portals for Fenteng and Tony Fan | The two sections and all ten tabs are in the menu as placeholders. Suppliers are names on records, and their steps (quote, acknowledge, approve replacement) are done from the buyer side for now. |
| Delivery forecast, urgency levels, PR on-hold plan, supplier load balancing | PR hold/cancel is built. The others are not. |
The flow, the status names and the main gates follow the documentation of the live system. The set of rules here is smaller than the live system's.
