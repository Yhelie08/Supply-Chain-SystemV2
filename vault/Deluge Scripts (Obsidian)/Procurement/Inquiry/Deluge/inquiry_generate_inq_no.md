---
title: "inquiry_generate_inq_no"
source_file: "inquiry_generate_inq_no.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 91
tags:
  - deluge
  - inquiry
  - procurement
  - purchase-order
  - zoho-books
---

# inquiry_generate_inq_no

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `inquiry_generate_inq_no.txt`
> - **Lines of Code:** 91
> - **Tags:** `#deluge`, `#inquiry`, `#procurement`, `#purchase-order`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Inquiry_Form — server-side INQ_No generation, new 2026-08-03 ==
== Per real incident, same day: a client-side max+1 scan (INQsv2's own
   computeNextInqNo(), scanned only CURRENTLY-EXISTING Inquiry_Form rows) reused
   "INQ-00001" for a brand-new test Inquiry after the ORIGINAL Inquiry that once
   held that number was deleted — Creator's own per-record uniqueness check
   passed fine (no other live Creator row had it), but Zoho BOOKS still
   remembered it via a real, still-existing estimate (QUO-14446, from the
   now-gone "Dry Run 4" project) whose own "INQ No" custom field is enforced
   UNIQUE on the Books side — Create Estimate failed with code 120303. User
   deleted the stale estimate to unblock, then asked how to prevent this for
   good — see chat, 2026-08-03. ==
== Real research done before building (WebSearch, official Zoho Creator docs):
   Creator's native Auto Number field type is a genuine platform-level
   monotonic counter — once assigned, a number is NEVER reused, even if the
   record holding it is later deleted (unlike a client-side "scan what's
   currently there" max+1, which has no memory of deleted history). This is
   the exact guarantee needed. BUT: confirmed the native Auto Number field only
   ever stores/produces a BARE INTEGER — no built-in text prefix ("INQ-") or
   zero-padding ("00007") support (checked both the "Add an Auto Number Field"
   and "Understand Auto Number Field" official help pages, neither mentions
   prefix/padding options at all). So the existing "INQ-00001"-style text field
   (INQ_No) stays exactly as-is, untouched — a NEW, separate Auto Number field
   (INQ_Seq) is added purely as the atomic counter, and this workflow formats
   its raw integer into the real INQ_No text the rest of the app already reads
   everywhere. Existing INQ_No values (INQ-00002 through INQ-00006, several
   already baked into real still-active Books estimates) are NEVER touched by
   this — INQ_Seq is a brand-new field on brand-new records only. ==

PREREQUISITE (user creates manually in Form Builder — NOT via AppIDE, per this
app's own documented "cannot add certain field types via source-paste" gotcha
for anything beyond the basic type list already confirmed working):
  Field: INQ_Seq
  Type: Auto Number
  Start Index: 7
    (chosen live 2026-08-03 — confirmed via a direct Books API scan that the
    highest INQ_No still in real/active use across non-deleted estimates is
    INQ-00006; starting at 7 avoids colliding with any of those. If more
    Inquiries get created/estimated between now and when this field is added,
    re-check the real max first — same live scan, SyncItemsCust, before
    finalizing Start Index.)
  Section: same section as INQ_No (Header / wherever INQ_No currently lives)
  Not required to be visible to users — the officer never types into it, only
  the Deluge workflow below reads it.

============================================================
WORKFLOW — Inquiry_Form, Created > Successful form submission
Name: INQ_Generate_Number
============================================================

seqVal = input.INQ_Seq;
paddedSeq = "";
if(seqVal < 10) { paddedSeq = "0000" + seqVal; }
else if(seqVal < 100) { paddedSeq = "000" + seqVal; }
else if(seqVal < 1000) { paddedSeq = "00" + seqVal; }
else if(seqVal < 10000) { paddedSeq = "0" + seqVal; }
else { paddedSeq = seqVal + ""; }

newInqNo = "INQ-" + paddedSeq;

update Inquiry_Form[ID == input.ID]
[
	INQ_No = newInqNo
];

NOTES:
- Same 5-tier zero-pad if/else-if chain already proven elsewhere in this
  codebase (create_rr_button.txt's RR_No generation, Exception_Control1's
  Exception_Number generation) — no while loop (confirmed unsupported in this
  app's own Deluge Gotchas), no ternary (also confirmed unsupported).
- Runs on EVERY Created submission, unconditionally — no guard needed, since
  INQ_Seq itself only exists at all on a genuinely new record (Auto Number
  assigns exactly once, at creation, deterministically).
- Real, already-documented risk in this app: a cross-form OR same-form
  post-create write from a Successful-form-submission workflow doesn't always
  reflect back to the CALLER (widget) instantly in the same round-trip — the
  widget side (see UI/EndUser/INQsv2's own updated submit handler) polls
  getRecordById a few times after create, waiting for INQ_No to show up
  non-blank, rather than assuming it's there immediately.

MANUAL STEPS:
1. Add the INQ_Seq field (Form Builder, Auto Number, Start Index 7) to
   Inquiry_Form.
2. Paste this workflow as a new Created > Successful form submission action on
   Inquiry_Form, named INQ_Generate_Number.
3. Re-upload UI/EndUser/INQsv2.zip (submit flow no longer pre-sends INQ_No,
   and now polls for the real assigned value after create — see that widget's
   own row in CLAUDE.md).

UNTESTED — first time this workflow has been written. Needs a live New Inquiry
create to confirm INQ_Seq auto-assigns, this workflow fires, and the real
INQ_No lands correctly (e.g. "INQ-00007") without colliding with anything.

````
