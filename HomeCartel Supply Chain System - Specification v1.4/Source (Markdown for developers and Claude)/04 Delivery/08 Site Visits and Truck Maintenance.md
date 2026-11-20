# Field Service Site Visits and Truck Maintenance

## 1. Field Service Site Visits

**Purpose:** an ocular / measurement visit before a big installation or a quote, so the installation day does not fail.

| # | Rule |
|---|---|
| SV-R1 | Created as a Service Request of type **site_visit** (by a sales agent or dispatcher), scheduled like any job with duration `site_visit_minutes` **[DEFAULT: 90]**. Uses a team-day slot (an installer usually goes). |
| SV-R2 | The visit fills the **same 12-line site checklist** plus measurements, photos and findings. These carry over to the later installation SR automatically. |
| SV-R3 | Findings that block installation (no support, permit needed) are listed on the SO for the sales agent. |

Stamps: `site_visit.done`.

## 2. Vehicle check-in and Truck Maintenance

**Purpose:** keep the three field vehicles running and make breakdowns visible to scheduling.

| # | Rule |
|---|---|
| TK-R1 | Daily **vehicle check-in** in the field app (odometer, tyres, lights, fuel, cleanliness, notes, photo if a problem) is also the "left warehouse" stamp. |
| TK-R2 | Maintenance schedule per vehicle: by date or kilometres (e.g. oil change every 5,000 km **[DEFAULT]**). The system warns `maintenance_warn_days` **[DEFAULT: 7]** before due. |
| TK-R3 | A vehicle marked **down** (problem found at check-in, or in the shop) removes its team-days from scheduling until marked fixed; affected jobs go to the dispatcher's exception queue. |
| TK-R4 | Maintenance records: type, date, km, shop, cost (restricted to admin, supervisor), receipts. |

Stamps: `vehicle.checked`, `vehicle.serviced`, `vehicle.down`, `vehicle.fixed`.

## Acceptance checklist
- [ ] Site visit findings appear on the later installation SR without retyping.
- [ ] Marking a vehicle down removes its future team-days and lists the affected jobs.
- [ ] A vehicle due for service by km shows a warning a week ahead.
