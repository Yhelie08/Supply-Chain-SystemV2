# HomeCartel Supply Chain System: Specification Package

Version 1.4 · 16 Nov 2026 · Owner: Allan (HC Systems / HomeCartel)

This package describes the **new supply chain system** that replaces the Zoho Creator apps for Procurement, Fulfillment and Delivery. It is hosted on **Railway + Supabase**. Zoho Books stays as the accounting system.

This package is the **specification**: what to build and how it must behave. It is not code. A developer, or Claude, builds from it.

## How to read this package

| Folder | What it holds | Read it when |
|---|---|---|
| 00 Overview | System summary, stack, roles and access, decision log, defaults, build order | First, always |
| 01 Database | Every table and field, naming rules | Before writing any code |
| 02 Procurement | Inquiry, PR, Pricing, PO, Ship & Track, Receiving, Exceptions & Replacement, Supplier Portal, Dashboard | Building procurement |
| 03 Fulfillment | Packages, Order Readiness, Pick, QC, Rework, Crate, Order Aggregation & Pre-Delivery Gate, Warehouse Request, Transfer, Kanban, Scoreboard, SO Report | Building fulfillment |
| 04 Delivery | Service Request, Scheduling & Team Rotation, Appointment & Dispatch, Field App, Failure & Redelivery, Customer Notifications, Returns & Archive, Site Visits, Trucks, Analytics | Building delivery |
| 05 Shared Engines | Sorting engine, calculators, dates & forecast, timestamps, exceptions & alerts, notifications, Next Step, agent hooks, Control Panel | Before building any module (every module uses these) |
| 06 Integrations | Zoho Books, SMS / Viber / email, files & photos | Building sync and messaging |
| 07 Migration | Moving off Zoho Creator | Planning the switch |
| 08 Design Doc | The design discussion (English and Tagalog), kept as the record of *why* | When you need the reasoning behind a rule |

## Every module file has the same parts

1. **Purpose**: what the module is for, in one paragraph
2. **Fields**: what it stores (full detail in 01 Database)
3. **Screens**: what each user sees
4. **Rules**: how it must behave, numbered so they can be referred to (e.g. `PO-R3`)
5. **Timestamps**: which events are stamped and what fires them
6. **Notifications**: who is told what, and when
7. **Access**: who can see and do what
8. **Acceptance checklist**: tests that prove it works

## Words used in this package

| Word | Meaning |
|---|---|
| **[DEFAULT]** | A value or rule nobody has decided yet. It is filled in so building can start, and it can be changed later, usually as a setting. All defaults are listed in `03 Defaults and Open Items`. |
| **Setting** | A value stored in the `policy_settings` table and editable by Admin without code changes. |
| **Order Date** | The date of the customer's Sales Order in Zoho Books. Never the record creation date, never the PO date. |
| **Target Delivery** | The date promised to the customer. Changed only by a person, with a reason. |
| **Forecast Delivery** | The date the system calculates. It never overwrites Target Delivery. |
| **Stamp** | A server-set time recorded when a record enters a stage. Users can never type or edit one. |
| **Package** | The fulfillment work unit: the goods of one Sales Order prepared together. |
| **Job** | The delivery work unit: one visit to one site. |
| **Agent** | An AI helper that reads, drafts and suggests. It never ranks and never commits on its own unless a rule allows it. |

## The design doc and this spec

The design doc in folder 08 is a transcript of the discussion, so some early ideas in it were later replaced. **Where the design doc and this spec disagree, this spec wins.** `02 Decision Log` lists every replaced idea.
