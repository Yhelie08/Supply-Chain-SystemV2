---
title: "get_subform_file_custom_api"
source_file: "get_subform_file_custom_api.txt"
category: "_Shared/Deluge/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 282
tags:
  - custom-api
  - deluge
  - fulfillment
  - pack
  - procurement
  - purchase-order
  - zoho-books
  - zoho-creator
---

# get_subform_file_custom_api

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `_Shared/Deluge/Deluge`
> - **Source File:** `get_subform_file_custom_api.txt`
> - **Lines of Code:** 282
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-order`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Deluge Custom Function (getSubformFileBase64) + Custom API setup — wraps the REST
   "Download File from Subform" endpoint (api/v2.1/download-file-from-subform.html,
   confirmed live via official docs 2026-07-13) so a widget can preview a subform row's
   File/Image field, since that field is structurally excluded from getRecords/
   getRecordById entirely (confirmed real platform limit, no Configure Fields fix
   possible — see CLAUDE.md Deluge Gotchas) and the widget-SDK-level readFile() needs an
   internal system-generated filename that uploadFile()'s response never exposes (also
   confirmed live, dead end — see receiving_widget_custom_api.txt / CLAUDE.md).
   GENERIC — takes reportName/recordId/subformField/subformRecordId as arguments so it
   works for BOTH Damage_Missing_Details.Photo (Receiving_Report) and
   Product_Context1.Photo (Exceptions_Report) from one function, not two near-duplicate
   ones (unlike the create_rr_*/acknowledge_po_* family, which mirror separate native
   Actions 1:1 — this one has no native counterpart to mirror, it's calling a generic
   REST endpoint that already takes the same 4 pieces of info regardless of form). ==

====================================================
CUSTOM FUNCTION SETUP:
  Name: getSubformFileBase64
  Arguments: String reportName, String recordId, String subformField, String subformRecordId
  Paste FULL block below INCLUDING the `map getSubformFileBase64(...)` signature line —
  Creator Custom Functions need the full signature (established convention, see
  CLAUDE.md Deluge Gotchas).
====================================================

map getSubformFileBase64(String reportName, String recordId, String subformField, String subformRecordId)
{
	response = Map();
	owner = "homecartel";
	app = "supply-chain-app";

	/* REMOVED 2026-07-16, per user ("that method is too api call consuming... do we
	   have another method") — this function used to make a SECOND invokeurl call
	   here (a record GET, purely to extract a `filepath` for multi-file fields, via
	   a subformName/fieldName split of the incoming `subformField` arg) before the
	   actual download call below. Already confirmed dead code as of the 2026-07-16
	   NOTES further down this file: subform Image/File fields return literal `null`
	   on ANY REST read regardless of single- vs multi-file, so this lookup could
	   NEVER find a filepath — it was silently a no-op on every single call, just
	   burning a 2nd invokeurl hit against the shared 2,000/day quota for zero
	   benefit. Since the architecture moved to single-file `Photo_1`..`Photo_5`
	   fields (confirmed via the docs' own proven example: a single-file subform
	   field downloads fine with plain row+field addressing, no filepath ever
	   needed), this lookup was never necessary for the current design at all. Fully
	   removed rather than just left dead — this function now makes exactly ONE
	   invokeurl call per photo preview instead of two, halving quota consumption
	   for this feature immediately. */
	url = "https://www.zohoapis.com/creator/v2.1/data/" + owner + "/" + app + "/report/" + reportName + "/" + recordId + "/" + subformField + "/" + subformRecordId + "/download";
	response.put("debug_url", url);
	invokeErrMsg = "";
	fileResp = null;
	try
	{
		fileResp = invokeurl
		[
			url: url
			type: GET
			connection: "zcreator"
			headers: {"environment":"development"}
		];
	}
	catch(eInvoke)
	{
		invokeErrMsg = "" + eInvoke;
	}
	response.put("debug_invoke_error", invokeErrMsg);
	response.put("debug_fileResp_isnull", fileResp == null);
	debugRaw = "";
	try
	{
		debugRaw = "" + fileResp;
	}
	catch(eRaw)
	{
		debugRaw = "stringify-failed: " + eRaw;
	}
	debugRawTrunc = debugRaw;
	if(debugRaw.length() > 500)
	{
		debugRawTrunc = debugRaw.subString(0,500);
	}
	response.put("debug_fileResp_raw", debugRawTrunc);
	if(fileResp == null)
	{
		response.put("status","error");
		response.put("message","No file returned from download endpoint.");
		return response;
	}
	fileNameVal = "";
	base64Val = "";
	errMsg1 = "";
	errMsg2 = "";
	try
	{
		fileNameVal = fileResp.getFileName();
	}
	catch(e)
	{
		errMsg1 = "" + e;
	}
	try
	{
		base64Val = zoho.encryption.base64Encode(fileResp);
	}
	catch(e2)
	{
		errMsg2 = "" + e2;
	}
	response.put("status","success");
	response.put("filename", fileNameVal);
	response.put("base64", base64Val);
	response.put("debug_err_getFileName", errMsg1);
	response.put("debug_err_base64Encode", errMsg2);
	return response;
}

====================================================
CUSTOM API SETUP:
  Creator → Settings → Custom APIs → New Custom API
  Name: get_subform_file
  Function: getSubformFileBase64
  Method: POST
  Arguments (all String): reportName, recordId, subformField, subformRecordId
  Same Draft-state gotcha already hit twice in this app — confirm it's Enabled, not
  left in Draft, before testing.
  After creation, copy the public key into UI/EndUser/Receiving/app/index.html's
  CUSTOM_API_GET_SUBFORM_FILE_KEY (replace REPLACE_WITH_KEY).
====================================================

NOTES:
- CHANGED 2026-07-16, per user (real live test via UI/EndUser/Receiving's own diagnostic
  logging, added same day): `get_subform_file` was returning `{"code":3790,"message":
  "File path is mandatory for downloading files"}` — the EXACT same error code the
  original `readFile()` dead end hit, but this time from the "Download File from
  Subform" REST endpoint itself, which this whole function exists specifically to use
  INSTEAD of readFile(). Confirmed via WebSearch/WebFetch of the official docs (not
  guessed, not from memory) that this is a real, documented distinction: multi-file
  upload fields (Photo here has `file count > 1`) need an explicit `filepath` value —
  normally sourced from a plain Get Records/Get Record response — passed into the
  download request; the single-file-field example in the base docs page never needed
  this, which is why the original build (tested against the docs' own shape, not a
  real multi-file field) missed it. Also worth noting: this app's own earlier finding
  ("Photo key completely absent from getRecords/getRecordById", 2026-07-13) was from
  the WIDGET's JS SDK specifically — genuinely unconfirmed whether the raw
  SERVER-SIDE REST record-fetch (this function's own new invokeurl, different code
  path entirely) exposes the same thing or something richer; that's exactly what the
  new diagnostic call finds out for real instead of assuming either old finding still
  applies here.
- FIX: function now does a SECOND invokeurl first — a plain record GET
  (`.../report/{reportName}/{recordId}?field_config=all`, `zcreator` connection, same
  as the existing download call) — finds the matching subform row by ID, reads the
  raw value of the target field, and TRIES to extract a `filepath` off the first
  entry (expected shape: List of Maps, one per uploaded file, each with a `filepath`
  key — UNCONFIRMED exact key name, defensive try/catch around the extraction so a
  wrong-shape guess degrades to "filePathVal stays blank" rather than crashing the
  whole function). If a filepath was found, appends `?filepath=<value>` to the
  download URL; if not, the download call proceeds exactly as before (unchanged
  behavior for a genuinely single-file field, if this function is ever reused for
  one).
- NEW debug fields for this diagnostic pass: `debug_record_url`,
  `debug_record_invoke_error`, `debug_subform_photo_field_raw` (the raw stringified
  field value straight from the record fetch — THE thing to look at first if this is
  still broken, tells us exactly what shape Zoho actually returns instead of guessing
  again), `debug_filepath_extracted`. Kept alongside the existing `debug_url`/
  `debug_invoke_error`/`debug_fileResp_raw` — remove all of these once the whole
  feature is confirmed working end-to-end, same plan as before.
- UNTESTED — needs re-pasting into the live Custom Function editor, then a fresh
  retest from either UI/EndUser/Receiving or UI/EndUser/Exception. If `filepath`
  extraction still doesn't work, `debug_subform_photo_field_raw` in the response will
  show the real raw shape live — read that before trying another blind variation.
- SUPERSEDED same day, confirmed via live test: `debug_subform_photo_field_raw` came
  back the literal string `"null"` even for this direct server-side REST record fetch
  — confirming subform File/Image fields are COMPLETELY excluded from ANY read (REST
  API level, not just the widget JS SDK as the 2026-07-13 finding assumed) regardless
  of single- vs multi-file. So the `filepath`-extraction dance above can never
  actually find anything for a SUBFORM field and is now effectively dead code (harmless
  — just an extra no-op invokeurl call per request) — kept in place rather than ripped
  out, since it's not wrong, just currently unreachable. Per user decision, the REAL
  fix was architectural instead: `Damage_Missing_Details.Photo`/`Product_Context1.Photo`
  (both multi-file) replaced with 5 discrete SINGLE-file fields each, `Photo_1`..
  `Photo_5` (native fields confirmed added, see `UI/EndUser/Receiving/`'s own
  2026-07-16 NOTES) — a single-file subform field downloads fine with plain row+field
  addressing per the docs' own proven example, no filepath ever needed, so this
  function needs no further change at all for the new architecture — `subformField`
  just gets called once per slot (`Damage_Missing_Details.Photo_1` through `_5`,
  `Product_Context1.Photo_1` through `_5`) by the callers instead of once per row.
- BUG caught on first paste: originally used `connection: "supply_chain"` (copied
  by habit from Books custom functions, which use it to call BACK into Creator) — errored
  live `"Connection supply_chain does not exists"`. Real reason, not a typo: that
  connection is only configured in BOOKS' own connections list — this is a CREATOR
  custom function calling Creator's OWN REST API, a genuinely different context with no
  prior precedent in this codebase (every other Creator-side need was satisfiable with
  native Deluge tasks, e.g. `Exceptions[ID==...]`, no invokeurl/connection required —
  this file exists specifically because there's no native task for "download file from
  subform"). Fixed by reusing an EXISTING already-connected Creator-scoped connection
  instead of creating a new one — `zoho_creator_connection` ("Zoho Creator Connection",
  confirmed Connected via a live screenshot of Settings → Connections, several Creator-
  scoped options existed: `zoho_creator_connection`, `zoho_creator_connection_dev`,
  `zcreator`). If this one lacks the `ZohoCreator.report.READ` scope this endpoint
  needs, try `zcreator` or `zoho_creator_connection_dev` next, or check/edit this
  connection's granted scopes in Settings → Connections.
  SETTLED ON `zcreator` 2026-07-13: hit a second, different connection error —
  `"Connection 'zcreator' access is disabled for this application. Enable it to save
  the changes."` — a separate PER-APPLICATION enable toggle, distinct from the
  account-wide "Connected" status shown in the Connections list. Fixed by enabling
  `zcreator` specifically for Supply Chain App. Function saves now.
  User then manually switched to `zoho_creator_connection` — first real live test (with
  debug fields added, see below) returned `debug_fileResp_isnull:false` but
  `debug_fileResp_raw:'{"code":2894,"message":"No report named \'Receiving Report\'
  found. Please check and try again."}'` — the invokeurl call itself succeeded (no
  exception) but Zoho's API genuinely couldn't resolve `Receiving_Report` under THIS
  connection, even though that exact report name works fine for every other call in the
  widget (via the SDK's own built-in auth, a different pathway than an explicit
  Deluge connection). Most likely explanation: `zoho_creator_connection` isn't actually
  authorized against Supply Chain App specifically (same class of per-app scoping issue
  already confirmed once for `zcreator`, just manifesting as "report not found" instead
  of an explicit "access is disabled" error this time). Switched back to `zcreator`
  (already confirmed enabled for this app) rather than debugging `zoho_creator_
  connection`'s scope further. Diagnostic debug fields (`debug_url`/
  `debug_fileResp_isnull`/`debug_fileResp_raw`/`debug_err_*`) proved essential for this
  — kept in the function permanently for now, remove once the whole feature is
  confirmed working end-to-end.
- Deliberately generic (4 args) instead of hardcoding form/field names, so the SAME
  function/API can later be reused by the Exceptions widget for Product_Context1.Photo
  without building a second copy — pass different reportName/subformField values from
  whichever widget is calling it.
- `zoho.encryption.base64Encode(<file_variable>)` confirmed via official docs as the
  correct function for encoding a file object fetched via invokeurl — NOT
  `.getFileContent()`, which the docs explicitly warn returns "junk values" for
  binary/image files (only reliable for plain text files like .txt/.csv). This
  distinction was checked before writing this function, not guessed.
- UNCONFIRMED, the single biggest open question: `Photo` is a MULTI-file field (up to
  10 files), but the Download-File-from-Subform endpoint's URL has no per-file
  component at all (`.../<subform>.<field>/<subform_record_ID>/download`) — completely
  unclear from official docs whether this returns just the first file, all files
  bundled as a zip, or something else for a multi-file field. This function currently
  assumes "download returns one File value" and doesn't unpack anything — first live
  test will reveal the real behavior; if it's a zip, the widget/function will need
  updating to unzip and return multiple base64 entries instead of one.
- `try/catch` around `.getFileName()` and `base64Encode()` are defensive — exact
  behavior of both on a subform-download invokeurl response is unconfirmed, this way a
  failure returns a clean {status:"error", message} instead of a raw script crash.
- Untested end-to-end. Needs live Custom Function + Custom API setup, then a real photo
  fetch attempt from the Receiving widget.
- DRIFT FOUND + FIXED 2026-07-13: the LIVE function in Creator had `connection:
  "zoho_creator_connection"` even though this reference file (and the settled decision)
  said `zcreator` — someone manually switched it while testing and it never got
  switched back (see the `zoho_creator_connection`/`get_subform_file` connection saga
  earlier in CLAUDE.md/project memory). Confirmed via a live screenshot of the function
  editor. Fixed by editing the live connection value back to `zcreator` directly.
  Lesson: when a script file and the live Creator editor can drift, a live screenshot
  of the actual pasted code is more trustworthy than any doc's "settled on X" note —
  check the live version first when a persistent, unexplained failure doesn't match
  what the reference file says should be there.
- CONNECTION FIX DIDN'T RESOLVE IT — same generic 500/9430 persisted afterward, AND a
  totally unrelated Custom API (`get_receiving_bin_choices`, different function,
  different connection, different logic) started failing the exact same way at the
  same time — ruling out anything specific to this function's own connection/code as
  the sole cause. STRONG NEW SUSPECT: the `invokeurl` block never set
  `headers:{"environment":"development"}` — this app's Creator data lives ONLY in the
  Development database (confirmed project-wide convention, every other invokeurl/
  v2_1.* call into this Creator app from Books or elsewhere explicitly sets this
  header). Without it, the call resolves against LIVE, where `Receiving_Report`
  (and everything else) doesn't exist — plausible that this makes `invokeurl` itself
  throw, crashing the whole function before ANY of its own try/catch or debug-field
  code can run, which would surface as exactly this kind of generic, response-less
  9430 at the Custom API layer. ADDED 2026-07-13: `headers:{"environment":"development"}`
  on the invokeurl call, plus wrapped the invokeurl itself in try/catch
  (`debug_invoke_error`) as a second line of defense — if this WASN'T the cause, this
  at least finally surfaces the real underlying error message instead of a blind
  guess. RESULT: the environment-header theory was wrong, but the try/catch
  immediately paid off — `debug_invoke_error` came back
  `"Error at line : 14, Total number of Webhook call exceeded."` — this is Zoho's
  `invokeurl` daily quota (2,000/day per user, shared account-wide — see API Limits in
  CLAUDE.md), exhausted by the sheer volume of repeated testing across this whole
  debugging session. THIS was the real cause all along, not a code/connection bug —
  explains perfectly why `get_receiving_bin_choices` (a totally unrelated function,
  no shared code/connection) failed the exact same way at the same time: both draw
  from the same account-wide invokeurl pool. Nothing left to fix code-side — resolves
  itself on the next daily quota reset. Keep the environment header (harmless,
  arguably correct anyway) and the try/catch (now proven valuable for exactly this
  kind of diagnosis) in place permanently.
====================================================

````
