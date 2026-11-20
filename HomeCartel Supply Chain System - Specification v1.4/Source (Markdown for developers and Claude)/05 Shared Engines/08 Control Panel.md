# Control Panel

## Purpose
Every number in this system that could change — crew size, boxes per hour, sites per day, lead times, how many days late before the supplier ladder fires — is a **setting**, not code. The Control Panel is the screen where Admin and supervisors change them, see what effect the change has, and see who changed what.

This is what keeps the system from needing a developer every time the business changes. If you hire two more installers, buy a fourth truck or switch a supplier to a faster factory, you change a number here and every queue, cut line, forecast and alert follows the same day.

## Screens

| Screen | Who | What |
|---|---|---|
| **Control Panel** | Admin, supervisor | All settings, grouped by module (Sorting · Fulfillment · Procurement · Delivery · Notifications · Integrations · Agents). Each row: label in plain words, current value, default, who changed it last and when, and a short explanation of what it affects. |
| **Capacity** (the one used daily) | Fulfillment supervisor, dispatcher | The numbers that change most often, on one simple screen: people on shift today, boxes per hour, hours per day, teams available, sites per team per day, job durations. Shows the effect live: "Capacity today: 224 boxes · 9 sites". |
| **Change history** | Admin, supervisor | Every change: setting, old value, new value, who, when. Filter by module. |
| **People and teams** | Admin, dispatcher | Drivers, installers, pickers, checkers; who is active; vehicles; leave days. This is where the installer list lives (the one the old forms disagreed about). |
| **Lists** | Admin | The editable lists: failure reasons, exception reasons, suggested actions, QC and crate checklists, message templates, proof templates, next-step texts. |

## Rules

| # | Rule |
|---|---|
| CP-R1 | Every setting has: a key, a plain-language label, a type (number, days, hours, percent, yes/no, time, text, list), a default, a minimum and maximum, the module it belongs to, and one sentence saying what it affects. |
| CP-R2 | **No module reads a hard-coded number.** If a value could ever change, it is a setting. Code holds only the formulas. |
| CP-R3 | Changes take effect at the **next scoring run**, and the screen offers **Recalculate now** so the supervisor can see the result immediately. |
| CP-R4 | **Show the effect before saving.** Changing a capacity number shows the before and after: "Capacity 224 → 280 boxes · 6 more packages above the cut line today". Changing a lead time shows how many open orders change category. |
| CP-R5 | Every change is written to `policy_settings_history` (old value, new value, who, when) and appears in the change history screen. Nothing changes silently. |
| CP-R6 | Minimum and maximum guard against typing errors (a `boxes_per_hour` of 800 is refused). Out-of-range needs Admin and a reason. |
| CP-R7 | **Daily numbers** (people on shift, teams available, vehicles down) are entered on the Capacity screen each morning, or carried over from yesterday. They are stored per date (`capacity_days`, `team_availability`), so history stays true: a slow day last month still shows the crew it actually had. |
| CP-R8 | **Settings that are also measured** (boxes per hour, sites per day, job durations) show both: the value in use and what the system has measured from stamps over the last 30 days, side by side, with a **Use measured value** button. The system never overwrites your number by itself. |
| CP-R9 | Per-supplier settings (production days, consolidation days) are edited on the supplier record, and shown here as a list. Per-item settings (fragile, two-person, proof template) are edited on the item. |
| CP-R10 | Agent settings (on/off, suggest vs auto, which message types may auto-send) live here too, with each agent's accuracy report beside its switch. |
| CP-R12 | **Staff come and go often.** Admin or the dispatcher can add a person, change their role (driver, installer, picker, checker) or deactivate them at any time. A deactivated person drops out of all future rotation days and assignments; any future job they were on goes to the dispatcher's exception queue to be reassigned. Their name stays on past records. |
| CP-R11 | Only Admin may change settings that affect money, gates or access (payment gate, override rules, auto-cancel, agent auto-send). Supervisors may change capacity, durations, alert days and lists. |

## What is in the Control Panel

Everything in `00 Overview / 03 Defaults and Open Items`, section C, plus the daily capacity numbers. The main ones:

| Group | Settings |
|---|---|
| **Fulfillment capacity** | People on shift, boxes per hour per person, productive hours per day, assignment batch size |
| **Delivery capacity** | Teams per day, sites per team per day, job durations (drop-off, installation, full day), day buffer %, max hours and max jobs per team-day, scheduling window, soft hold minutes |
| **Sorting** | Primary sort key, at-risk slack days, procurement watch slack, aging alert days (7/14/21), nightly run time, urgency warning % |
| **Procurement** | Production days per supplier, consolidation days, transit days per mode (LCL/FCL/Air), receiving days, fulfillment days, delivery days, ladder days (1/2/3) and actions, acknowledgement window, auto-cancel on/off |
| **Dates** | Default promise days, replacement target days, forecast window |
| **Notifications** | Morning list time, SMS sending hours, which events notify which roles, supplier digest time |
| **Gates** | Which pre-delivery checks are on, payment grace when Books is unreachable, partial dispatch approver role |
| **Agents** | Per agent: off / suggest / auto for clear cases; which messages may auto-send |

## Acceptance checklist

- [ ] Changing people on shift from 4 to 6 changes the cut line and the suggested release list the same minute.
- [ ] Changing sites per team per day changes the delivery backlog and the earliest-date answer given to sales agents.
- [ ] Changing a supplier's production days re-forecasts every open order from that supplier and moves any that now miss their target into *Act now*.
- [ ] Every change appears in the history with the name of who made it.
- [ ] A typo (boxes per hour = 800) is refused with a plain message.
- [ ] Searching for a number used anywhere in the code finds no hard-coded business value.
