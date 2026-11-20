# Delivery Analytics

## Purpose
Prove whether deliveries are getting better, and show where to act.

## The key numbers
| # | Number | Definition | Why |
|---|---|---|---|
| 1 | **On-time delivery %** | Jobs completed on or before Target Delivery ÷ jobs completed | The main goal of the whole system |
| 2 | **First-attempt full-delivery %** | Jobs where the **first** visit was complete (no short, damaged, refused, failed) ÷ first visits | A partial delivery is not a success |
| 3 | **Damage rate by category** | Damaged qty ÷ delivered qty, by item category, and split by fault origin | Mirrors and glass need their own number |
| 4 | **Failure reasons** | Count by reason code, by month | Each reason has a different fix |
| 5 | **Jobs per team-day** | Installation and drop-off separately | Delivery capacity; replaces the "sites per day" default |
| 6 | **Own team vs third party** | Count, on-time %, damage % | Is the third party working? |
| 7 | **Ship → Service Request gap** | Days from aggregated to scheduled | One of the two gaps nobody owns |
| 8 | **Forecast error** | Delivered date − last forecast | Tightens the defaults |
| 9 | **Late delivery days** | Average days late, for late jobs | How bad is late |

## Screens
- Dashboard with the nine numbers, weekly trend, and filters (date, team, job type, city, customer type, carrier).
- Every number drills down to the jobs behind it.
- Export to CSV.

## Rules
- Numbers are calculated from stamps and job results only, never typed.
- Per-person / per-team figures visible to dispatcher, supervisor and admin.

## Acceptance checklist
- [ ] On-time % for one week matches a manual check of 20 jobs.
- [ ] A job that failed first and succeeded on redelivery counts as on-time (if before target) but **not** first-attempt full.
