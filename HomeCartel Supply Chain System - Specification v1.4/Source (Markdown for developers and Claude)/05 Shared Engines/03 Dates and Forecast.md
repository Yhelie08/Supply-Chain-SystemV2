# Dates and Forecast

## Purpose

Every record that carries a customer order shows the same three dates, in the same order, everywhere:

| Date | What it is | Who sets it | How often it changes |
|---|---|---|---|
| **Order Date** | The Books Sales Order date: when the customer committed | Books sync | Only if Books changes it |
| **Target Delivery** | What the customer was promised | A person | Rarely, and always as a decision |
| **Forecast Delivery** | What the system calculates will really happen | The system | On every event |

**The gap between Forecast and Target is the warning.** Categories, Act now and alerts are all readings of `forecast − target`.

## Rules

| # | Rule |
|---|---|
| DT-1 | **Order Date** comes from Books. It is copied to every downstream record (PR, PO line, shipment, receiving, package, job, exception, RR, sales return) and never typed. Records with several SOs show the earliest and list each in their lines. |
| DT-2 | If Books changes an SO date, the new date is copied to **open** records only. Delivered and archived records keep theirs. A re-score and forecast recompute follow immediately. |
| DT-3 | **Order Age** = today − Order Date, shown beside it on every list and card. It stops counting at delivery. |
| DT-4 | **Target Delivery** is set when the SO is created (from Books or entered by the sales agent). Changing it requires a reason and records old value, new value, who and whether the customer was told (`target_date_changes`). |
| DT-5 | **The forecast never overwrites the target.** The system may *propose* a new target (approval queue, kind `forecast_promise_change`); a person commits it. |
| DT-6 | A **replacement** (RR) gets a Target Delivery when it is created: the original order's target if that is still in the future, otherwise creation date + `rr_default_days` **[DEFAULT: 21 days]**; editable by a supervisor (same as RR-R3). |
| DT-7 | The **quotation date** is stored beside the Order Date for reference. It is not used for sorting. |
| DT-8 | Display order everywhere: **Order Date · Target Delivery · Forecast Delivery**, then Order Age and "slipped N days" / "moved up N days". |

## How the forecast is calculated

The forecast follows the order through its chain and uses **actual** dates where they exist and **planned** dates where they do not.

| Where the order is | Forecast Delivery |
|---|---|
| Not yet on a PO | today + full chain (Calculators 3) |
| On a PO, in production or transit | latest actual or planned arrival + receiving + fulfillment + delivery days |
| Received, in the warehouse | today + remaining fulfillment days (from the cut line position: how many days until its turn) + delivery days |
| Scheduled for delivery | The scheduled date (a confirmed appointment replaces the estimate) |
| Delivered | Frozen at the actual delivery date. The difference from the last forecast is kept as **forecast error**. |

- **FC-1** Recompute on every stage event for that order, and in the nightly run.
- **FC-2** Every change is kept in `forecast_history` with the event that caused it.
- **FC-3** `forecast_window` shows a range when uncertain (e.g. while at sea: ± 3 days **[DEFAULT]**).
- **FC-4** Forecast error by stage is reported monthly, so the defaults can be tightened.

## Where the dates appear

PR, PO and PO lines (so the buyer knows what the goods are for), Ship & Track, Receiving, Order Readiness and every fulfillment stage, Service Request and scheduling, the field app (target only, no money), the Sales Order view for sales agents, the customer tracking page (window only).

## Acceptance checklist

- [ ] Every module that carries an order shows Order Date, Order Age, Target and Forecast, in that order.
- [ ] A PO with items from two SOs shows the earlier Order Date and lists both.
- [ ] Changing a shipment's arrival date changes the forecast of every SO on it within one minute.
- [ ] The forecast never changes Target Delivery; a promise change needs a reason and appears in history.
- [ ] Confirming an appointment sets the forecast to the appointment date.
- [ ] Delivering freezes the forecast and records the forecast error.
