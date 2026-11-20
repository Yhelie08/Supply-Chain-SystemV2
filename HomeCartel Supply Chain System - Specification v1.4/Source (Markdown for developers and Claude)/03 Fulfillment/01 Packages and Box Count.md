# Packages (Pre-Order) and Box Count

## Purpose
A **package** is the fulfillment work unit: the goods of one Sales Order prepared together, from one warehouse. Everything in fulfillment is ranked and moved as packages, never as loose lines.

## Fields
`packages`, `package_lines` (01 Database). Key: package number, SO, warehouse, **box count** and its source, for-crate flag, stage, three dates, queue columns.

## Screens
| Screen | Who | What |
|---|---|---|
| Waiting for items | Fulfillment supervisor | SOs whose items are not all available, with what is missing and its procurement forecast (e.g. "2 of 3 lines in transit, ETA 20 Nov") |
| Package detail | Fulfillment staff | Lines, bins, box count, the three dates, stage timeline, exceptions |

## Rules
| # | Rule |
|---|---|
| PKG-R1 | A package is created automatically when an SO is confirmed in Books (stock items) or when its first purchased line is received. Its stage is `waiting_items` until every line is available (binned), then `ready`. |
| PKG-R2 | **Partial packages** are not created automatically. Splitting an SO into two packages (ship what we have) is a supervisor decision with a reason **[DEFAULT]**. |
| PKG-R3 | **Box count:** entered by the person who puts the package together (at pick completion or crate, whichever comes last) **[DEFAULT: at pick completion; updated at crate]**. One number: how many boxes leave the warehouse. Until then, the estimate is the sum of line quantities and is marked *estimated*. |
| PKG-R4 | Box count is **not** used for sorting. Only the capacity calculators and the cut line use it. |
| PKG-R5 | Replacement items get their own package linked to the RR, category Broken. |
| PKG-R6 | The package copies Order Date, Target, order type, delivery type and customer from the SO; changes in the SO flow down to open packages. |

## Timestamps
`package.created`, `package.ready` (all items available), `package.box_counted`.

## Acceptance checklist
- [ ] Binning the last missing line moves the package from Waiting for items to Ready automatically.
- [ ] A package without a counted box count shows "estimated" in every capacity figure.
- [ ] Splitting a package requires a supervisor and a reason.
