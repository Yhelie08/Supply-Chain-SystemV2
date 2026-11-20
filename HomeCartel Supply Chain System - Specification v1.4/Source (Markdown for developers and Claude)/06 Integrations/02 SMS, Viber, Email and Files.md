# SMS, Viber, Email and Files

## 1. SMS
| # | Rule |
|---|---|
| SM-R1 | Provider: a local Philippine SMS aggregator **[DEFAULT: keep iTexMo]**. Wrapped in one Python adapter so the provider can be changed without touching modules. |
| SM-R2 | **Rotate the iTexMo credentials** that were hardcoded in the old `dms_site_confirmation` script before go-live. Credentials only in environment variables. |
| SM-R3 | Inbound replies are received by webhook (if the provider supports it) into `inbound_messages` **[DEFAULT]**; otherwise customers reply by call. |
| SM-R4 | All sends go through the job queue, logged in `outbound_messages`, with delivery status. |
| SM-R5 | Sending hours: 7am–9pm only **[DEFAULT]**; messages outside are held until 7am. |

## 2. Viber (later)
Viber Business Messages as a second channel: carries images (proof photo) and is widely used. Same adapter pattern. Not needed for go-live.

## 3. Email
| # | Rule |
|---|---|
| EM-R1 | Transactional email service **[DEFAULT: Resend or Postmark]** for supplier digests, internal notifications and escalations. |
| EM-R2 | One shared inbox address for supplier / forwarder emails (e.g. `procurement-inbox@…`), forwarded into `inbound_messages`: this is what agent A2 reads later. Until then, staff see them on the matching shipment. |
| EM-R3 | Supplier digests are bilingual where the supplier's language is Chinese. |

## 4. Files and photos
| # | Rule |
|---|---|
| FL-R1 | Stored in Supabase Storage, in private buckets; served by short-lived signed links. |
| FL-R2 | Accepted: JPG, PNG, HEIC, WebP, PDF; video MP4 (QC and site, max 3 minutes) **[DEFAULT]**; max 10 MB per photo after compression. |
| FL-R3 | The field app compresses photos on the phone (long side 1600 px **[DEFAULT]**). |
| FL-R4 | Every file records uploader, time, section and caption; removal only by the uploader or a role owner, and logged. |
| FL-R5 | Retention: proofs 3 years **[DEFAULT]**; others while the record exists. |

## Acceptance checklist
- [ ] Changing SMS provider requires changing only the adapter and settings.
- [ ] A photo link copied out of the app stops working after it expires.
- [ ] A message queued at 10pm is sent at 7am.
