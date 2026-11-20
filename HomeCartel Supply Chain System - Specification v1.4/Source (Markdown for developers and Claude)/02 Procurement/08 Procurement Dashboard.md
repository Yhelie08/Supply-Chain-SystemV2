# Procurement Dashboard

## Purpose
One screen for the buyer and supervisor: what needs action today, and whether procurement is getting better.

## Content
| Block | Shows |
|---|---|
| Today | Counts and lists: **Act now**, **Tell the customer**, decisions waiting (air upgrades, day-3 ladder), PRs needing manual quote, POs not acknowledged |
| Born-late rate | % of PO lines raised with a shortfall, weekly trend. **Main procurement number.** |
| On-time arrival | % of lines arriving by planned arrival, by supplier |
| Supplier scorecard | Per supplier: lead time planned vs actual, late starts, ladder rungs fired, reporting lag (days between event and report), damage rate by fault origin = supplier |
| Pipeline | Lines by stage (production / shipout / transit / receive) with the oldest Order Date in each |
| Replacements | Open RRs, oldest first, and rework rate |

## Rules
- Costs and spend widgets show only to buyer, supervisor, admin. The shipment tracker has no dashboard access **[DEFAULT]** beyond Ship & Track.
- Every number links to the list behind it.

## Acceptance checklist
- [ ] Born-late rate matches a manual count for one week of POs.
- [ ] Clicking any count opens the matching filtered list.
