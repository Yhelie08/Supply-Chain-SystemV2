---
title: "create_books_contact"
source_file: "create_books_contact.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 264
tags:
  - custom-api
  - deluge
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
  - zoho-creator
---

# create_books_contact

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `create_books_contact.txt`
> - **Lines of Code:** 264
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Creator "New Customer" modal (INQs widget) — also create the customer in Zoho Books ==
== New 2026-07-10, per user request: "i need that new customer to also be created in
   books". This is a CREATOR Custom Function (called by UI/EndUser/INQs/app/Inq.html
   AFTER it has already successfully created the Customer record in Creator via
   ZOHO.CREATOR.DATA.addRecords — see that file's saveNewCustomer()), NOT a Books-side
   function. Deliberately a 2-step flow instead of one function doing both creates:
   Creator's Customer.Billing_Address/Shipping_Address are a compound "Address" field
   type (confirmed live 2026-07-10, see CLAUDE.md Deluge Gotchas) that's only proven
   writable via the REST API's nested-Map shape (already working in the widget's own
   addRecords call) — there's no proven native `insert into Customer[...]` syntax for
   compound fields in this codebase, so rather than risk that unproven path, the
   Creator record keeps using its already-working creation path untouched, and this
   function only handles the NEW work (Books contact + backfilling ID1 via a plain
   native update, which IS proven for ordinary text fields). ==

====================================================
CUSTOM FUNCTION SETUP (Creator side — Settings → Custom Functions):
  Name: createBooksContact
  Return type: map
  Arguments (all type: string) — yes, this is a lot of individual argument rows to add
  one by one in the editor, no shortcut found; add exactly these, in any order (names
  must match exactly, case-sensitive, since the body below reads them by name):
    customerId, custName, custType, custEmail, custPhone, custMobile, companyName,
    custSubType, salutation, firstName, lastName,
    billAddress, billCity, billState, billZip, billCountry, billAttention, billPhone, billFax,
    shipAddress, shipCity, shipState, shipZip, shipCountry, shipAttention, shipPhone, shipFax
  (27 arguments total.)
  UPDATED 2026-09-14 (2nd round, same day): added custSubType/salutation/firstName/
  lastName/billPhone/billFax/shipPhone/shipFax (8 more arguments, on top of the 3
  companyName/billAttention/shipAttention added earlier the same day) — per user
  request (screenshot of Books' own native New Customer form: Business/Individual
  toggle, Primary Contact Salutation/First/Last Name, and per-address Phone/Fax all
  present there, missing here). ALL of these are OPTIONAL — none validated/required on
  the widget side, per explicit user instruction ("wag na gawing mandatory").
  If this function was already created live, you must add ALL new argument rows to the
  EXISTING function (don't just re-paste the body — Creator Custom Functions need their
  argument list edited separately from the body in this editor). The Custom API in
  Step 2 below is Function-linked (not a manually maintained parameter list), so it
  should pick up new arguments automatically once added to the function — but double-
  check its own Request/Parameters tab shows all 27 before assuming it's fine.
  CORRECTED 2026-07-10: unlike Books custom functions (body only, no wrapper — the
  convention this file wrongly copied at first), CREATOR custom functions need the
  FULL block pasted INCLUDING the `map functionName(args) { ... }` signature line —
  confirmed live via a real "Expected 'VOID','INT',...'MAP' or 'LIST' but found
  'response'" error on first paste attempt, same convention already proven working for
  every other Creator Custom Function this project built (getReceivingBinChoices,
  acknowledgePOFenteng, etc. — all pasted WITH their signature line). Paste the WHOLE
  block below, starting at `map createBooksContact(...)` through the final closing `}`.
====================================================

map createBooksContact(String customerId, String custName, String custType, String custEmail, String custPhone, String custMobile, String companyName, String custSubType, String salutation, String firstName, String lastName, String billAddress, String billCity, String billState, String billZip, String billCountry, String billAttention, String billPhone, String billFax, String shipAddress, String shipCity, String shipState, String shipZip, String shipCountry, String shipAttention, String shipPhone, String shipFax)
{
response = Map();
orgId = "751117756";

if(customerId == null || customerId == "")
{
	response.put("status","error");
	response.put("message","No customerId provided — cannot backfill ID1.");
	return response;
}

// FIXED 2026-09-14, per user (screenshot of Books' own Primary Contact fields) —
// if the officer filled in First/Last Name, use those properly instead of always
// dumping the whole Customer Name into first_name with no last_name.
personFirstName = custName;
personLastName = "";
if(firstName != null && firstName != "")
{
	personFirstName = firstName;
	personLastName = lastName;
}

contactPerson = Map();
contactPerson.put("salutation", salutation);
contactPerson.put("first_name", personFirstName);
contactPerson.put("last_name", personLastName);
contactPerson.put("email", custEmail);
contactPerson.put("phone", custPhone);
contactPerson.put("mobile", custMobile);
contactPerson.put("is_primary_contact", true);
contactPersonsList = List();
contactPersonsList.add(contactPerson);

billMap = Map();
billMap.put("attention", billAttention);
billMap.put("address", billAddress);
billMap.put("city", billCity);
billMap.put("state", billState);
billMap.put("zip", billZip);
billMap.put("country", billCountry);
billMap.put("phone", billPhone);
billMap.put("fax", billFax);

shipMap = Map();
shipMap.put("attention", shipAttention);
shipMap.put("address", shipAddress);
shipMap.put("city", shipCity);
shipMap.put("state", shipState);
shipMap.put("zip", shipZip);
shipMap.put("country", shipCountry);
shipMap.put("phone", shipPhone);
shipMap.put("fax", shipFax);

contactBody = Map();
contactBody.put("contact_name", custName);
contactBody.put("company_name", companyName);
custSubTypeVal = "business";
if(custSubType == "individual") { custSubTypeVal = "individual"; }
contactBody.put("customer_sub_type", custSubTypeVal);
contactBody.put("contact_type", "customer");
contactBody.put("email", custEmail);
contactBody.put("phone", custPhone);
contactBody.put("mobile", custMobile);
contactBody.put("contact_persons", contactPersonsList);
contactBody.put("billing_address", billMap);
contactBody.put("shipping_address", shipMap);

// FIXED 2026-09-14, per user (screenshot of Books' own "Customer Type" CUSTOM FIELD,
// a real dropdown: End User / Design Partner / Business Partner / Corporate /
// Influencer) — `custType` was ALREADY being passed into this function this whole
// time but never actually used anywhere in the body, a dead parameter. Every Books
// contact created here left its own Customer Type custom field blank. Now maps our
// internal Customer_Type value (Designer/Enduser/Corporate/Business Partner) onto
// Books' real dropdown option text — same "Enduser" -> "End User" translation
// already proven in create_estimate_custom_api.txt for the Estimate custom field of
// the same name, plus "Designer" -> "Design Partner" (semantic match, Books has no
// bare "Designer" option). "Corporate"/"Business Partner" pass through unchanged —
// already exact matches. Books has no Creator-side equivalent for "Influencer" —
// left as an option only ever chosen manually in Books itself, never sent by us.
custTypeBooks = custType;
if(custTypeBooks == "Enduser") { custTypeBooks = "End User"; }
if(custTypeBooks == "Designer") { custTypeBooks = "Design Partner"; }
if(custTypeBooks != null && custTypeBooks != "")
{
	cfList = List();
	cf1 = Map();
	cf1.put("label","Customer Type");
	cf1.put("value",custTypeBooks);
	cfList.add(cf1);
	contactBody.put("custom_fields", cfList);
}

createResp = invokeurl
[
	url: "https://www.zohoapis.com/books/v3/contacts?organization_id=" + orgId
	type: POST
	parameters: contactBody.toString()
	headers: {"Content-Type":"application/json"}
	connection: "zhbooks3"
];
info "Books contact create resp: " + createResp;

// FIXED 2026-09-14, per user report (customer created here still ended up needing
// a manual "New Customer" in Books' own New Estimate screen later) — the old code
// called createResp.get("contact") unconditionally, which throws if createResp
// itself is null (a total invokeurl failure, e.g. connection/network issue) instead
// of returning a graceful error — the officer would never see WHY linking failed.
// Also now surfaces Books' OWN real error message (e.g. "Contact name already
// exists.") instead of a generic string, so the widget's toast can show the actual
// reason instead of just "see console" (this app is tested via live UI, not
// DevTools — see [[user_workflow_style]]).
if(createResp == null)
{
	response.put("status","error");
	response.put("message","Books contact creation — no response at all from Books (connection/network issue).");
	return response;
}

if(createResp.get("contact") == null)
{
	errMsgFromBooks = createResp.get("message") + "";
	if(errMsgFromBooks == "null" || errMsgFromBooks == "") { errMsgFromBooks = createResp.toString(); }
	response.put("status","error");
	response.put("message","Books contact creation failed — " + errMsgFromBooks);
	return response;
}

newContactId = createResp.get("contact").get("contact_id") + "";

custRecs = Customer[ID == customerId.toLong()];
for each  cr in custRecs
{
	cr.ID1 = newContactId;
}

response.put("status","success");
response.put("contactId", newContactId);
response.put("message","Books contact created and linked (ID1=" + newContactId + ")");
return response;
}

====================================================
CUSTOM API SETUP:
  Settings → Custom APIs → New Custom API
  Name: create_books_contact
  Method: POST
  Function: createBooksContact
  Response: Standard
  Auth: PublicKey
  Save → ENABLE (don't leave in Draft — same gotcha as every other Custom API in this
  project)
  Copy the public key into UI/EndUser/INQs/app/Inq.html — search REPLACE_WITH_
====================================================

NOTES:
- Books' own contact JSON shape (confirmed live via a read-only GET on the existing
  test customer contact, 2026-07-10) has billing_address/shipping_address as
  `{address, street2, city, state, zip, country, phone, fax, attention}` — ONE
  "address" string, not separate line1/line2 like Creator's compound Address field.
  The widget merges Creator's address_line_1 + address_line_2 into one string before
  sending here (see Inq.html's saveNewCustomer()) — matches Books' real shape instead
  of inventing a mismatched one.
- `email`/`phone`/`mobile` are set BOTH at the top level of the contact AND inside
  `contact_persons[0]` — the top-level ones showed up as populated on a real live
  contact's GET response (mirroring the primary contact person), but since this is the
  first time this codebase has ever CREATED a Books contact (only ever read/updated
  existing ones before), it's unconfirmed whether Books' CREATE endpoint actually
  accepts writing them at the top level too, or silently ignores them and only the
  contact_persons values take — setting both is the defensive choice, not proof either
  path definitely works. Check the Books execution log's `createResp` on first test.
- `contact_persons[0].last_name` intentionally left unset — the whole customer name
  goes into `first_name` since `contact_name` (the field used everywhere else in this
  project to match/search customers, e.g. `contact_name_contains`) is set separately
  and correctly either way; splitting a business/individual name into first/last isn't
  reliable to guess and isn't needed for anything downstream in this app.
- Backfilling `ID1` uses a plain native `Customer[ID==...].ID1 = newContactId` update —
  this is NOT the compound Address field, just an ordinary Single Line text field, so
  the native `for each cr in custRecs { cr.ID1 = ...; }` pattern (already proven
  throughout this whole project for simple field backfills) is safe here, unlike the
  address fields.
- If Books contact creation fails (or the whole Custom API call fails/times out from
  the widget side), the Creator Customer record STILL EXISTS from the widget's own
  earlier `addRecords` call — this function only adds the Books linkage on top, it's
  not transactional with the Creator create. A failure here just means ID1 stays
  blank, same as the already-documented "known gap" — nothing is lost, worth a retry
  or manual Books contact creation + manual ID1 paste later.
- UNTESTED — first time this codebase has ever created (not just read) a Books
  contact. Likely first failure points to watch for: (1) whether `parameters:
  contactBody.toString()` correctly serializes the nested `contact_persons`/
  `billing_address`/`shipping_address` — this codebase has proven ONE level of nested
  List-of-Maps (custom_fields) and one level of nested Map (storages inside
  line_items), but never a contact_persons-List-of-Maps alongside two separate nested
  address Maps all in the same top-level body before; (2) whether `contact_type:
  "customer"` is actually required/accepted at create time the way it reads on GET.
- 2026-09-14 real symptom, not yet confirmed root-caused: a customer created via this
  path still ended up needing a manual "New Customer" inside Books' own New Estimate
  screen later (create_estimate_custom_api.txt sends customer_id=Customer.ID1 when
  creating the Books Estimate — if THIS function silently failed, ID1 stays blank and
  Books has nothing to pre-fill). Most likely cause, given Books' Contacts API
  rejects a duplicate `contact_name`: the officer's "new" customer already exists as
  a Books contact under the same/similar name (very plausible — many Books contacts
  predate this whole Creator integration) — if this function then tries to CREATE it
  again, Books returns "contact already exists" and createResp.get("contact") stays
  null. HOW TO CONFIRM: after the 2026-09-14 fix below, re-test and check the
  function's own Execution Log (Creator: App Builder / Workflows → Custom Functions →
  createBooksContact → Execution History) for the `info "Books contact create resp:"`
  line — it now also flows Books' own real error text into the widget's toast
  directly (no more "see console"), so the officer should be able to just read it off
  screen. NOT YET FIXED: if this duplicate-name theory is confirmed, the real fix is
  to SEARCH Books for an existing contact by name first and just link its ID (skip
  create) instead of always attempting a fresh create — not built yet, needs the
  real error text first to confirm before building a search-and-link path blind.
====================================================

````
