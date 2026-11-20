# Field App (drivers and installers)

## Purpose
The team's phone app for the day: where to go, what to deliver, what the site needs, and how to record exactly what happened, **item by item**, even with no signal. It replaces Ongoing Service and the Field Portal.

## Technology
React + TypeScript **PWA**, installed from the browser on Android. **Offline-first:** today's jobs, checklists and item lists are downloaded when the day is dispatched and refreshed at check-in; every action is saved on the phone first (IndexedDB) and sent when a signal returns. Photos are **compressed on the phone** before upload.

## What the team must never see
Prices, costs, what the customer paid or owes, invoice balances, other teams' jobs. The field API returns only `field_jobs_v` (01 Database §9).

## Screens
| # | Screen | Content |
|---|---|---|
| 1 | **Check-in** | Team, vehicle, odometer, vehicle checklist. Submitting it = **left warehouse** stamp and starts the day. |
| 2 | **Today** | Stops in order (from the day plan), one card per job: stop number, customer first name, city, window, job type, boxes, flags (fragile, two-person, permit). Driver may reorder (DP-R4). "Navigate" opens **Waze** (or Google Maps). |
| 3 | **Stop** | Address, contact (tap to call), access notes (gate, floor, lift, guard), site checklist answers (read-only), full item list with quantities, what proof is required. The **first action at the site** (first photo, or opening the item results or the failed-visit screen) = **arrived** stamp. |
| 4 | **Per-item results** | For each line: delivered / short / damaged / refused, each with a quantity. Damaged or refused needs a photo and a reason. Serial scan where the proof template requires it. **The heart of the app.** |
| 5 | **Close-out** | Installation photos (if installation), overall condition photos, receiver name and **signature** (or the remote-signature flow), customer rating and feedback (optional). Submitting = **done** stamp. |
| 6 | **Failed visit** | If the job cannot be done: failure reason code (Delivery 05), photo where useful (gate closed, site not ready), notes. Submitting = done with outcome failed. |

## Rules
| # | Rule |
|---|---|
| FA-R1 | **The job outcome is calculated from the item results**, never chosen: all lines fully delivered → **complete**; anything short, damaged or refused → **partial**; nothing delivered → **failed** (with a reason code). |
| FA-R2 | **Proof required per item type** comes from `proof_templates` (e.g. mirror: condition photo + signature; tiles: quantity count; lighting installation: serial scan and installed photo). Close-out is refused until the job's combined requirements are met; the screen lists what is missing. |
| FA-R3 | **Three status stamps, no buttons for time:** left warehouse = check-in submitted; arrived = first action at the site; done = close-out or failed submitted. Each stores device time (`occurred_at`) and server time (`reported_at`), and location if available. No continuous GPS tracking. |
| FA-R4 | Every action has a `client_event_id`, so a retry after lost signal never creates duplicates. |
| FA-R5 | Signatures cannot be edited after saving. |
| FA-R6 | **Remote signature (customer not on site):** (1) confirm by call or message that the customer wants the item left; (2) photos before leaving are required (condition, quantity, placement); (3) if left with a guard, relative or neighbour, record name and relation; (4) the app generates a **single-use signature link** sent by SMS/Viber; (5) the job is `awaiting_customer_confirmation`, not complete; (6) the **customer** opens the link (no login) and signs. **No ID upload** (decided: too much friction). The link is single-use and sent only to the customer's phone number on the Sales Order, which is what ties the signature to the customer. The person the goods were left with gives only their name and relation. If the customer named an authorised representative on the Service Request (e.g. their site engineer or contractor), the link may go to that person's number instead **[DEFAULT]**. Link expiry `signature_link_hours` **[DEFAULT: 72]**. Not signed in time → dispatcher follows up; still not signed after `unsigned_escalation_days` **[DEFAULT: 7]** → supervisor decides: close as delivered-unsigned (with reason) or open a dispute. This gives the job a final state and an owner. |
| FA-R6b | Line 1 of the site checklist (wiring ready) is shown at the top of every installation stop. If the team finds the wiring not ready on arrival, they record a failed visit with reason `site_not_ready` and a photo. |
| FA-R7 | Pull-out jobs (returns) use the same item screen with "collected" quantities and photos. |
| FA-R8 | The app shows the target window, never the target date discussion or payment. |
| FA-R9 | Language English **[DEFAULT]**; large buttons; works one-handed; photo capture opens the camera directly. |

## Write-back (must ship with the app)
When a job is done, the server immediately:
- posts delivered quantities to Zoho Books against the SO (delivered / shipment status),
- returns **short** and **damaged-not-delivered** quantities to stock (bin: returns area),
- opens an **exception** for damaged and refused lines (found at site, with photos) and a CS follow-up,
- creates the **redelivery** job for anything short / refused that must still be delivered (Delivery 05),
- recomputes the order's forecast and category, and sends the customer message (Delivery 06).

## Acceptance checklist
- [ ] With the phone in airplane mode, a full job (results, photos, signature) can be completed and syncs correctly later, without duplicates.
- [ ] Marking 2 of 10 tiles short makes the outcome partial automatically and creates a redelivery proposal.
- [ ] A mirror job cannot close without a condition photo and a signature.
- [ ] No API response to the field app contains a price, cost or payment field.
- [ ] Remote signature: the job stays "awaiting customer confirmation" until the link is signed.
- [ ] Completing a job updates Books without anyone retyping it.
