# System Overview

## 1. Why this system exists

HomeCartel has two problems: **customers receive orders late**, and **throughput is too low**. The old system made both worse because:

- Every queue was sorted **newest first**, so old orders were buried under new ones (*natatabunan*).
- No person can read hundreds of orders every morning and decide what matters.
- About three out of four orders were already late on the day the PO was raised, because nobody compared supplier lead time with the customer's promised date.
- There were no stage timestamps, so nobody could see where time was lost.

The new system's job: **the system scans, sorts and suggests; humans supervise and decide.**

## 2. The operating contract

| The system does | Humans do |
|---|---|
| Scan every open record, every day and on every change | Assign named people (picker, installer, team) |
| Put each record in a category and sort it (oldest Sales Order first) | Approve or change suggestions |
| Calculate dates, capacity, backlog and feasibility | Make decisions that cost money or a relationship (cancel a supplier, change a promise, partial delivery) |
| Write a reason and a suggested action on every record | Mark manual urgency, with a name and reason |
| Stamp the time a record enters each stage | Do the physical work |
| Raise an alert when something goes silent | Clear blocks they own |
| Draft messages (agents) | Approve messages before they go out (until a rule allows auto-send) |

## 3. Scope

One system, three departments, plus a supplier portal and a field app.

| Department | Flow |
|---|---|
| **Procurement** | Inquiry → PR → PO → Production → Ship out → Received |
| **Fulfillment** | Package ready → Order Readiness → Pick → QC → (Rework if needed) → Crate (if needed) → Order Aggregation → Pre-Delivery Gate |
| **Delivery** | Service Request → Scheduled → Confirmed → Dispatched → On site → Done (Complete / Partial / Failed) → Archive |

Old modules included: Inquiry, Purchase Request, PR Forecast, Purchase Order, Shipments (Ship & Track), Receiving, Exceptions, Replacement, Supplier portals (Fenteng, Tony Fan), Procurement Dashboard, Pre-Order / Packages, Order Readiness, Pick, QC Checklist, Crate, Order Aggregation, Exception Control, Kanban, Scoreboard, SO Report, Warehouse Request, Transfer Item, Initial Scheduling, Service Request, Service Appointment, Schedule Requests, Ongoing Service, Archived, DMS Exception Queue, Sales Returns, Daily Team Availability, Policy Settings, Field Service Site Visits, Truck Maintenance, Delivery Analytics.

**Retired:** the Pack stage (Pick goes straight to QC). Paint is not a planned stage; it is **rework**.

**Outside this system:** Zoho Books / Zoho Inventory (accounting, invoices, payments, stock quantities and valuation), Shopify, Akeneo, the pricing tool. The system reads from and writes to Books (see 06 Integrations).

## 4. Technology stack

Chosen for easy maintenance by one developer plus Claude.

| Part | Choice | Why |
|---|---|---|
| Backend and API | **Python 3.12, FastAPI, Pydantic** | One language for API, jobs, sync and agents. Pydantic rejects bad data at the door. |
| Database | **Supabase Postgres** | Managed Postgres with auth, storage and row-level security built in |
| Sorting, categories, calculators | **SQL views and functions in Postgres** | Rules live in one place, are fast, and every screen reads the same answer |
| Database changes | **Alembic migrations** (or Supabase migrations) in the repo | Every schema change is versioned and reviewable |
| Office screens | **Server-rendered HTML (Jinja2) + HTMX + a little Alpine.js** | Simple pages, no heavy front-end build, easy to change |
| Field app (drivers, installers) | **React + TypeScript PWA, offline-first** (IndexedDB queue, service worker) | Works with no signal at sites, basements, provinces; installs from the browser on Android |
| Login and roles | **Supabase Auth** + roles table + **Postgres row-level security (RLS)** | Access rules enforced by the database, not only by screens |
| Files and photos | **Supabase Storage**, compressed on the device before upload | Photos are the largest data volume |
| Scheduled jobs | **Railway cron** running Python commands (nightly scan, daily rotation, sync, alerts) | Simple, logged |
| Background work | A **jobs table in Postgres** processed by a Python worker on Railway | No Redis needed at this volume |
| Hosting | **Railway**: `web` service (FastAPI), `worker` service (jobs + cron), field PWA served as static files | Already familiar |
| AI agents | **Python + Claude API**, writing only to the approval queue | Same language as the rest |
| SMS | Local Philippine SMS aggregator (current: iTexMo; **rotate the leaked credentials first**); Viber later | Cheaper and more reliable than international routes |
| Email | Transactional email service **[DEFAULT: Resend or Postmark; Zoho Mail SMTP acceptable]** | Supplier digests, notifications |

**Time zone:** all stamps are stored in UTC and shown in **Philippine time (UTC+8)**. Display format: `13 Nov 2026 14:05`.

**UI language:** English for office screens. Supplier portal has an **EN / 中文** toggle (as today). Field app English **[DEFAULT]**, with Tagalog labels optional later.

## 5. How the parts fit

| From | Talks to | What flows |
|---|---|---|
| Zoho Books | Railway worker (sync job) → Supabase | Sales Orders, invoices, payments, voids, customers, items |
| Railway worker | Zoho Books | Write-back: estimates, POs, purchase receives, delivered quantities, draft credit notes |
| Office screens, supplier portal (HTMX) | FastAPI web service → Supabase | All office work, through role-checked API routes |
| Field PWA (offline) | FastAPI field API → Supabase | Today's jobs down; results, photos, signatures, status pings up |
| Railway worker (cron + job queue) | Supabase, SMS, email, Claude API | Nightly scan, rotation, alerts, messages, agents |
| Supabase Postgres | — | Tables, views, RLS, sorting and calculator functions, event log, file storage |

## 6. Roles and access

Access is enforced in the database (RLS) **and** hidden on screens. A user may hold more than one role.

| Role | Can see | Can do | Must never see |
|---|---|---|---|
| **Admin** | Everything | Everything, including settings, users and roles | — |
| **Supervisor** | Everything | Approve, override, assign, change promises, manual urgency | — |
| **Buyer** (Procurement) | All of Procurement, including costs | Inquiry, PR, PO, supplier choice, ladder decisions, RR | — |
| **Shipment tracker** | Ship & Track only | Update shipment stages, dates, photos, forwarder info | **Costs, prices, markups, SRP, margins** |
| **Receiver / warehouse receiving** **[DEFAULT: part of Fulfillment staff]** | Receiving | Count, inspect, bin, raise exception | Costs and prices |
| **Fulfillment staff** | Fulfillment modules only | Pick, QC, rework, crate, aggregate, flag exceptions | Procurement and Delivery screens, costs |
| **Fulfillment supervisor** | Fulfillment + read-only Procurement arrivals | Assign pickers, release, approve partial dispatch | Costs |
| **Dispatcher / delivery office** | Delivery only, **including payment status** | Schedule, confirm, dispatch, third-party booking, force-close | Product costs and prices (does see third-party delivery fees) |
| **Driver / installer** | **Field app only, own jobs only** | Check-in, per-line results, photos, signatures, failure reasons | **What the customer paid or owes**, prices, costs, other teams' jobs |
| **Sales agent** | Own customers' orders: status, the three dates, category, next step | Create Inquiry, create Service Request, check earliest delivery date, request urgency (supervisor approves), change a promise (with reason) on own orders | Costs, warehouse screens, scheduling screens, other agents' customers **[DEFAULT]** |
| **Supplier** (Fenteng, Tony Fan) | Supplier portal: own inquiries, PRs for quotation, POs, shipments, RRs | Quote, acknowledge PO, report production start/end, upload photos, ship date | Customer names and prices, other suppliers |
| **Customer** | Tracking page for own job only (link with secret token) | Sign remotely through a single-use link | Everything else |

**Field rules for sensitive data:**

- Cost, price, SRP, margin and markup fields are **column-restricted**: only Admin, Supervisor and Buyer can read them. They are stored in separate tables (`*_costing`) so RLS can protect them cleanly.
- Payment status and balance are readable by Admin, Supervisor, Dispatcher and Sales agent (own orders). **Never** by drivers and installers.

## 7. Goals and how they are measured

| Goal | Main number | Where it is shown |
|---|---|---|
| Fewer late deliveries | **On-time delivery %** (delivered on or before Target Delivery) | Home dashboard, Delivery Analytics |
| Fewer born-late orders | **Born-late %** (PO raised when feasible date > target) | Procurement Dashboard |
| Higher throughput | **Boxes per day** out of fulfillment; **installation jobs per day** | Scoreboard, Delivery Analytics |
| Less rework | **Rework rate** and **first-attempt full-delivery %** | Fulfillment and Delivery Analytics |
| Faster flow | Days in each stage, from stamps | Every module (“in this stage since”) |
