# Customer Notifications and Tracking Page

## Purpose
Customers judge the delivery, not the dispatch board. Telling them clearly what is happening stops "where is my order" calls and reduces failed visits.

## Messages (SMS first; Viber later, which can carry the proof photo)
| Trigger (a real event, not a timer) | Message | Default |
|---|---|---|
| Job scheduled | "Your HomeCartel delivery is scheduled for Thu 20 Nov, 9am–12nn. Track: link" | On |
| Day before | Reminder with window + "Reply 1 to confirm, 2 to reschedule" | On |
| Team leaves for the stop before yours (or leaves the warehouse if you are first) | "Our team is on the way. Expected between 10:00 and 11:00." | On |
| Job done (complete) | "Delivered. Thank you!" + tracking link showing proof photo | On |
| Job partial | "Delivered X of Y items. We will contact you about the rest." | On |
| Job failed | "We could not complete today's visit (reason). Reply or call to rebook." | On |
| Remote signature | Single-use signing link | On |

| # | Rule |
|---|---|
| CN-R1 | Messages use approved templates in `message_templates`, editable by Admin. Customer first name, window and link only: **no prices**. |
| CN-R2 | Every message is logged in `outbound_messages` with status from the provider. |
| CN-R3 | Respect `sms_opt_out`. |
| CN-R4 | **The leaked SMS credentials in the old system must be rotated before the first message is sent.** Credentials live only in Railway environment variables. |
| CN-R5 | Windows, not exact times. ETA = now + travel estimate for the remaining stops + service time per stop, shown as a window. A wrong precise time is worse than an honest wide one. |
| CN-R6 | Procurement delays ("Tell the customer") go to the **sales agent** first, with a drafted message, not straight to the customer **[DEFAULT]**. |
| CN-R7 | Replies ("1", "2", free text) are stored in `inbound_messages` and matched to the job; "1" sets confirmed, "2" alerts the dispatcher. |

## Tracking page
- A public page per job at `/t/<token>`; the token is long and random, created with the job.
- Shows: order number, status, scheduled date and window, "You are stop 3 of 5" once dispatched, team first names, proof photo once done, and how to contact us.
- **No** prices, payment, live map or other customers' data.
- Expires `tracking_expiry_hours` **[DEFAULT: 48]** after the job is done.

## Acceptance checklist
- [ ] Scheduling a job sends the scheduled SMS with a working tracking link.
- [ ] Replying "1" marks the appointment confirmed.
- [ ] The tracking page never shows money.
- [ ] An opted-out customer receives no SMS.
