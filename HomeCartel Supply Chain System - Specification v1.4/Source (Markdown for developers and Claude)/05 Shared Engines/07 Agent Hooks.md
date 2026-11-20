# Agent Hooks

## Purpose

About 80% of what fixes late deliveries is arithmetic (sorting, dates, capacity). That stays plain code. Agents do the other 20%, work that today depends on people **chasing, reading and reminding**: reading supplier messages, texting customers, writing chases, spotting stuck orders.

The system is built **agent-ready from day one**. Agents plug into the same gates, tables and approval queue later, with no rebuild.

## What is NOT an agent

Sorting, categories, calculators, dates, timestamps, money and payment status, and the final decision on cancellations, refunds and promise changes. These must give the same answer every time and be provable.

## Guardrails for every agent

| # | Rule |
|---|---|
| AG-1 | **Propose, never commit**, until a rule allows it. Output goes to `approval_queue` or a draft. An agent mistake is a rejected suggestion, never a corrupted record. |
| AG-2 | **Cite the record.** Every claim names the PO, SO, shipment or job it came from, with a link. |
| AG-3 | **Never invent a date or a number.** If a message is unclear, the agent says it is unclear and asks. |
| AG-4 | **The rules win.** If an agent and the sorting engine disagree, the engine's answer stands and the disagreement is logged. |
| AG-5 | Every action is logged in `agent_actions` with inputs, output, model and cost, and shown on the record's timeline as "by agent". |
| AG-6 | Agents use the same role limits as a person in that job: the site-confirmation agent cannot see costs or payment amounts. |
| AG-7 | Each agent has an **on/off switch** and a **mode** setting: `off` → `suggest` (human approves each) → `auto_clear_cases` (auto for cases matching explicit rules; everything else still goes to a human). A supervisor moves an agent up a mode only after reviewing its accuracy report. |
| AG-8 | Customer-facing and supplier-facing messages always use approved templates as a base and stay in suggest mode until Allan approves auto-send for that message type. |

## The hooks built in from step 0

| Hook | Table / feature |
|---|---|
| Who decided | `decided_by_type` (system / human / agent) on every decision record |
| Agent log | `agent_actions` |
| Human approval | `approval_queue` with kind `agent_message` / `agent_update` |
| Inbound reading | `inbound_messages` (forwarded supplier / forwarder / customer emails; later Viber/WeChat exports) |
| Outbound sending | `outbound_messages` with `approved_by` |
| Accuracy report | Per agent: proposed, approved unchanged, edited, rejected, % per week |

## Agent Phase 2 (first agents)

### A1. Supplier chaser
- **Reads:** overdue PO lines, ladder rung, supplier language, previous chases and replies.
- **Does:** drafts the rung-1 message (call script + written message), rung-2 discount request and the rung-3 decision summary (deposit paid, custom vs standard, Taobao alternative with price and lead time if found).
- **Needs approval:** every message; every day-3 decision stays human.
- **Logged as:** `agent_message` and `ladder_day3` prepared by agent.

### A2. Shipment inbox reader
- **Reads:** supplier and forwarder emails (and pasted chat text) in `inbound_messages`.
- **Does:** matches the message to a PO / shipment, extracts production dates, partial quantities, booking, vessel/flight, arrival notices, and proposes the stage updates with both times (when it happened, when we were told).
- **Needs approval:** shipment tracker applies each proposed update with one click. Auto mode later only for unambiguous forwarder arrival notices.
- **Value:** production dates currently die in prose and WeChat; this turns them into data.

### A3. Site confirmation
- **Reads:** jobs scheduled in the next 1–3 days, site checklist answers, contact details.
- **Does:** sends the confirmation message (SMS/Viber) asking the customer to confirm date, window, site readiness, permit, someone on site; reads replies and photos; fills the checklist and marks Confirmed / Needs reschedule; proposes a reschedule when the site is not ready.
- **Needs approval:** suggest mode first (dispatcher approves the outgoing message and each status change). Auto later for "customer replied YES, nothing else changed".
- **Cannot see:** prices or payment.

### A4. Pre-delivery qualification
- **Reads:** the pre-delivery gate results (Fulfillment 06), exceptions, site checklist, payment status (as pass/fail only), customer replies.
- **Does:** for packages due in the next days, prepares the qualification: which checks pass, which fail, and what to do about each ("contact number missing: ask agent Lyn"; "payment re-check failed: invoice voided in Books"). Chases the missing items with the owner.
- **Needs approval:** suggest mode; the gate itself (plain rules) stays authoritative. Later: auto-pass when every Tier 1 rule passes and the site is confirmed.

## Agent Phase 3 (later agents)

| Agent | Reads | Does | Approval |
|---|---|---|---|
| A5 Customer late notice | Procurement *Tell the customer* list, forecast changes | Drafts the customer update for the sales agent, with the new forecast window | Sales agent approves |
| A6 Stuck-order nudger | Aging and silence alerts | Pings the owner with what is stuck and why, escalates if nothing moves | Auto (internal only) |
| A7 Complaint intake | Customer messages about broken or wrong items | Opens a draft exception / Sales Return / RR, attaches photos, sets category Broken | Supervisor approves |
| A8 Proof-of-delivery check | Close-out proofs | Checks photos and signature are present and match the template; flags missing or unclear proof before the job closes | Auto flag; dispatcher resolves |
| A9 Daily supervisor brief | Everything the engine scored | Writes the morning brief: capacity vs work, what slipped, patterns ("3 Fenteng POs slipped twice, same SKU family") | Auto (read-only) |
| A10 Data cleaner | Records and Books | Finds missing fields, mismatches with Books, duplicates; proposes fixes | Admin approves |
| A11 QC photo check | QC and production photos | Compares photos with the product; flags likely damage or wrong item | Checker decides |

## Acceptance checklist (for when agents are added)

- [ ] Turning an agent off stops all its actions within one minute; nothing else breaks.
- [ ] Every agent suggestion links to the records it cites.
- [ ] A rejected agent suggestion changes no business data.
- [ ] The accuracy report shows approval rate per agent per week.
- [ ] An agent in suggest mode never sends a customer or supplier message without approval.
