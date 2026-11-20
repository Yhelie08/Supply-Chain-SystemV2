# Order Aggregation and the Pre-Delivery Gate

## Purpose
**Order Aggregation** brings the finished packages of a delivery together at the loading area. The **Pre-Delivery Gate** is the last check before goods physically leave: today there is no check at that point, so partial deliveries, unpaid orders and missing contacts leave the warehouse with nobody deciding.

## Order Aggregation

| # | Rule |
|---|---|
| OA-R1 | Packages arrive here from QC (or Crate). The list is ranked like every stage and grouped by **delivery job / scheduled date** once scheduled. |
| OA-R2 | Marking a package **Aggregated** confirms all its boxes are at the loading area (box count shown). |
| OA-R3 | The delivery **Service Request** already exists by this point: it is created when the package passes QC (Delivery 01, SR-R1), so scheduling runs while the package is being crated and aggregated. Aggregation marks it ready to load. Customer details are read from the SO (the old Order_Aggregation form had no contact fields). |
| OA-R4 | Aggregated packages without a scheduled job for more than `aggregation_wait_days` **[DEFAULT: 2]** raise an alert: the gap "Ship → Service request" is one of the two gaps nobody owns. |

Stamps: `package.aggregated`.

## The Pre-Delivery Gate

**Dispatch** is a gated action. It runs when the dispatcher dispatches a job (Delivery 03) and checks every package on it. **All failures are shown at once**, not one at a time.

### Tier 1: build first (blocking)
| # | Check | Passes when |
|---|---|---|
| G1 | Order complete | Every line of the SO is in the package(s) on this job, **or** a partial dispatch is approved |
| G2 | Contact details | Delivery address and a contact number exist |
| G3 | Payment re-checked **at dispatch** | Books says paid, or credit terms, or an approved override (the invoice may have been voided since release). If Books cannot be reached, the last synced status is used when it is under 60 minutes old **[DEFAULT]**; older than that fails the check |
| G4 | No open exception | No open exception on any item of the SO |
| G5 | DR number | Delivery Receipt number recorded |
| G6 | Loading check | SO number and SKUs match; box count loaded = package box count; boxes in acceptable condition |
| G7 | Site ready | Site checklist lines 1–11 answered; permit not "Required + Pending" |
| G8 | Signatures | Driver and dispatcher signatures captured (third-party job: dispatcher signature and the provider's booking reference) |
| G9 | Who and when | `dispatched_by` and `dispatched_at` stamped automatically (not a check the user can fail) |

### Tier 2 (blocking, built with QC and Crate)
QC approved with checklist, photo and signature (QC-R2); Crate Done with checklist and photo (CR-R2).

### Tier 3 (process, later)
Credit limit (not only credit terms); start site-confirmation outreach at QC Approved (agent A3).

### Rules
| # | Rule |
|---|---|
| GT-R1 | A failed gate cannot be saved around. The only bypasses are **recorded overrides**: partial dispatch (bypasses G1 only) and payment override (G3, existing approver pattern). |
| GT-R2 | **Partial dispatch** is an explicit decision: `partial_dispatch_approved`, reason, approver (fulfillment supervisor or supervisor), and customer consent noted. The remaining lines stay as an open package with their own category and age, and a follow-up job is created when they are ready. |
| GT-R3 | Each gate run is saved in `dispatch_checks` with every result and `decided_by_type` (system / human / agent). |
| GT-R4 | **Agent-ready:** agent A4 (pre-delivery qualification) will run the same checks a day or two ahead and chase the failures. The gate itself stays plain rules and has the final say. |
| GT-R5 | The gate shows payment only as **pass / fail** to the dispatcher's field-facing printouts; amounts appear only on office screens for roles allowed to see them. |

Stamps: `package.dispatched` (on gate pass), `dispatch_check.failed` (each failed attempt, for reporting).

## Access
Fulfillment staff: aggregate. Dispatcher: run the gate and dispatch. Fulfillment supervisor / supervisor: approve partial dispatch and overrides.

## Acceptance checklist
- [ ] Dispatching a job with one package missing a line fails G1 and lists every other failure at the same time.
- [ ] A voided invoice since release fails G3 at dispatch.
- [ ] Partial dispatch with an approver and reason passes G1 only; G2–G8 still apply.
- [ ] Loading 9 boxes for a 10-box package fails G6.
- [ ] Every gate attempt is stored with its results.
