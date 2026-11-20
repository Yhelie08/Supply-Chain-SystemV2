# Calculators

Three calculators, one per department. They are plain arithmetic in SQL functions, and every input is a **setting** or a measured number.

## 1. Fulfillment manpower calculator

```
backlog_days = open_boxes ÷ (people × boxes_per_hour × hours_per_day)
people_needed = open_boxes_due ÷ (boxes_per_hour × hours_per_day × days_available)
```

| Input | Source | Default |
|---|---|---|
| `open_boxes` | Sum of `packages.box_count` for packages not yet dispatched (ready, released, in stages) | — |
| `box_count` | Counted when the package is made up (Fulfillment 01). If not yet counted, estimate = sum of line quantities, marked `estimated`. | — |
| `people` | `capacity_days.people` for the date (who is on shift); entered by the fulfillment supervisor each morning, or copied from yesterday | **[DEFAULT: 4]** |
| `boxes_per_hour` | Boxes **finished** (through pick, QC and crate, ready to load) per person per hour, across the whole crew. Measured for one week by hand (boxes out ÷ people ÷ hours); later from stamps | **[DEFAULT: 8, replace after one week of counting]** |
| `hours_per_day` | Productive hours per person | **[DEFAULT: 7]** |

Uses:

- **Cut line:** today's capacity in boxes = `people × boxes_per_hour × hours_per_day`. The sorter releases ranked packages until this is used.
- **Backlog days** on the Fulfillment dashboard.
- **Crew sizing:** "To clear all Late and About-to-be-late packages in 3 days you need 6 people (you have 4)."
- **Assignment margin:** each picker gets batches of `assign_batch_boxes` **[DEFAULT: 20 boxes]**, not the whole day, so urgent work landing at 11am can still be fitted in.

## 2. Delivery backlog calculator

```
backlog_days  = open_jobs ÷ (teams_per_day × sites_per_team_per_day)
teams_needed  = open_jobs_due ÷ (sites_per_team_per_day × days_available)
```

A "site" is one visit, whether it is a drop-off or an installation. Teams normally manage **3 to 4 sites a day** across both.

| Input | Source | Default |
|---|---|---|
| `open_jobs` | Delivery jobs not yet done (drop-off and installation together), excluding third-party ones | — |
| `teams_per_day` | From `team_availability` (max 3: three field vehicles) | 3 |
| `sites_per_team_per_day` | Sites one team finishes in a day. From experience; later measured from job stamps | **[DEFAULT: 3]** (observed 3–4). With 3 teams that is about 9 sites a day. A day with several full-day installations will be fewer; the job durations below are what the scheduling engine actually uses, so this number is only for the backlog view |

Drop-offs are still shown separately, because they are the part that can be moved out:

- `dropoff_share = open_dropoffs ÷ open_jobs` (about 50/50 today).
- If the backlog is longer than the orders' slack, the suggestion is **"Book third party"** for the drop-offs, which frees close to half the own-team capacity for installations.
- The dashboard shows both: total backlog days, and what the backlog would be if every drop-off went to a third party.

## 3. Procurement feasibility calculator

```
planned_arrival  = PO_date + 1 (production starts)
                   + production_days
                   + consolidation_days
                   + transit_days(mode)
                   + receiving_days
feasible_by      = planned_arrival + fulfillment_days + delivery_days
shortfall_days   = feasible_by − target_delivery     (positive = will be late)
air_saving_days  = transit_days(sea) − transit_days(air)
```

| Input | Default (all settings, per supplier where noted) |
|---|---|
| `production_days` | Supplier default **[DEFAULT: 20]**, overridden by the quoted lead time |
| `consolidation_days` | Per supplier **[DEFAULT: 3]** |
| `transit_days` | LCL 30, FCL 30, Air 14 (so air saves **16 days**) |
| `receiving_days` | **[DEFAULT: 2]** (arrival to binned and pickable) |
| `fulfillment_days` | **[DEFAULT: 3]** |
| `delivery_days` | **[DEFAULT: 2]** |

Outputs, written on the PR and PO line:

| `feasibility` | Meaning |
|---|---|
| `feasible` | `shortfall_days ≤ 0` and slack ≥ `proc_watch_slack_days` |
| `at_risk` | `shortfall_days ≤ 0` but slack is small |
| `impossible` | `shortfall_days > 0`. Also writes `earliest_feasible_date` and the air option: "Air saves 16 days → feasible" or "Even by air, earliest is 4 Dec" |

The same function is reused for the **forecast** (05 / 03): once real events arrive (acknowledged, production started, shipped out), the planned values are replaced by actual dates and the rest of the chain is recalculated.

## Acceptance checklist

- [ ] Changing `boxes_per_hour` changes the cut line and backlog days immediately.
- [ ] A package without a counted box count shows "estimated" beside its boxes.
- [ ] A PR with target 20 days from today, supplier lead 20 days, LCL: shows `impossible`, shortfall 41 days (1 + 20 + 3 + 30 + 2 + 3 + 2 = 61 days needed), and the air option (still 25 days short).
- [ ] Delivery backlog shows installation and drop-off separately.
