---
title: "Customer_Form_Schema"
source_file: "Customer_Form_Schema.txt"
category: "_Shared/Deluge/Deluge"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 258
tags:
  - deluge
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
---

# Customer_Form_Schema

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `_Shared/Deluge/Deluge`
> - **Source File:** `Customer_Form_Schema.txt`
> - **Lines of Code:** 258
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Zoho Creator "Customer" form — real AppIDE field schema ==
== Confirmed live by user, 2026-09-14 ==
== Why this file exists: while building/fixing createBooksContact (see
   DelugeScripts\create_books_contact.txt and the loose createBooksContact file),
   needed to confirm exactly which fields genuinely exist on the Customer form before
   adding anything to its addRecords payload — this codebase's own established rule is
   that an insert/update with a field the form doesn't have silently aborts the WHOLE
   insert (see [[deluge_creator_gotchas]]). This is that confirmation, dumped straight
   from the Form Builder's own AppIDE view. ==

====================================================
REAL FIELDS ON Customer (confirmed 2026-09-14):
====================================================
  ID1              — text, displayname "ID" (this is the Books contact_id backfill
                      field used by createBooksContact — NOT the record's own native
                      Creator ID, that's a separate built-in ID field not shown here)
  customer_name    — text, displayname "Customer Name"
  Customer_Type    — text, displayname "Customer Type" (freetext, NOT a real Books
                      customer_sub_type — this app's own Designer/Enduser/Corporate/
                      Business Partner category, unrelated to Books' Business/
                      Individual concept)
  Email            — email, max 80 chars, personal data
  Phone_Number     — phonenumber, displayname "Phone", personal data
  Mobile           — phonenumber, default country PH, personal data
  Billing_Address  — compound address field: address_line_1, address_line_2,
                      district_city, state_province, postal_Code, country,
                      latitude/longitude (hidden, map-picker computed), personal data
  Shipping_Address — same compound shape as Billing_Address, personal data

====================================================
FIELDS THAT DO NOT EXIST HERE (confirmed, not assumed):
====================================================
  No Company_Name field
  No Attention field (on either address)
  No per-address Phone/Fax field
  No Business/Individual (customer_sub_type) field
  No Salutation/First Name/Last Name split — customer_name is the only name field

UPDATE 2026-09-14 (same day, later) — Customer_Type is a plain TEXT field here, not a
real Dropdown, so this native form never actually enforces the Designer/Enduser/
Corporate/Business Partner vocabulary the rest of the app assumes (an officer editing
a record directly in Zoho's native UI could type anything). Also discovered: Books'
OWN separate "Customer Type" CUSTOM FIELD (visible on the Contact's Custom Fields tab
in the native Books UI, a real dropdown: End User/Design Partner/Business Partner/
Corporate/Influencer) had never actually been receiving a value from this app at all —
`custType` was a dead parameter in createBooksContact this whole time. Now fixed (see
Widget\Proc\CLAUDE.md's own "real dead-parameter bug found" entry, 2026-09-14) — maps
our internal vocabulary onto Books' dropdown wording (Enduser->"End User", Designer->
"Design Partner", others pass through). If Customer_Type here is ever converted to a
real Dropdown, use the SAME 4 values already used everywhere else in this app
(Designer/Enduser/Corporate/Business Partner) — NOT Books' 5-word vocabulary — to avoid
breaking every other place that already checks this field's value.

This is exactly why the 2026-09-14 createBooksContact expansion (Company Name,
Attention, Business/Individual, Primary Contact Salutation/First/Last, per-address
Phone/Fax) was built as BOOKS-ONLY — passed straight through
createBooksContactFor() -> createBooksContact's own invokeurl call to Zoho Books,
never added to this form's own addRecords payload in Widget\Proc\Inquiry\app\
index.html. If any of these fields get added to this Customer form later, the
widget's saveNewCustomer() payload can be extended to also store them here —
not done now since they didn't exist at the time.

====================================================
RAW AppIDE SCHEMA DUMP (as given by user, verbatim):
====================================================
{
    success message = "Customer Added Successfully"
    Section
    (
        type = section
         row = 1
         column = 0
        width = medium
    )
    ID1
    (
        type = text
        displayname = "ID"
         row = 1
         column = 1
        width = medium
    )
    customer_name
    (
        type = text
        displayname = "Customer Name"
         row = 1
         column = 1
        width = medium
    )
    Customer_Type
    (
        type = text
        displayname = "Customer Type"
         row = 1
         column = 1
        width = medium
    )
    Email
    (
        type = email
        maxchar = 80
         row = 1
         column = 1
        width = medium
        personal data = true
    )
    Phone_Number
    (
        type = phonenumber
        displayname = "Phone"
         row = 1
         column = 1
        width = medium
        personal data = true
    )
    Mobile
    (
        type = phonenumber
        defaultcountry="ph"
         row = 1
         column = 1
        width = medium
        personal data = true
    )
    Billing_Address
    (
        type = address
        displayname = "Billing Address"
         capture_coordinates = true
         adjust_using_map = false
         address_line_1
         (
               type = address_line_1
               displayname = "Address Line 1"
         )
         address_line_2
         (
               type = address_line_2
               displayname = "Address Line 2"
         )
         district_city
         (
               type = district_city
               displayname = "City / District"
         )
         state_province
         (
               type = state_province
               displayname = "State / Province"
         )
         postal_Code
         (
               type = postal_Code
               displayname = "Postal Code"
         )
         country
         (
               type = country
               displayname = "Country"
         )
         latitude
         (
               type = latitude
               displayname = "latitude"
              visibility = false
         )
         longitude
         (
               type = longitude
               displayname = "longitude"
              visibility = false
         )
         row = 1
         column = 1
        width = medium
        personal data = true
    )
    Shipping_Address
    (
        type = address
        displayname = "Shipping Address"
         capture_coordinates = true
         adjust_using_map = false
         address_line_1
         (
               type = address_line_1
               displayname = "Address Line 1"
         )
         address_line_2
         (
               type = address_line_2
               displayname = "Address Line 2"
         )
         district_city
         (
               type = district_city
               displayname = "City / District"
         )
         state_province
         (
               type = state_province
               displayname = "State / Province"
         )
         postal_Code
         (
               type = postal_Code
               displayname = "Postal Code"
         )
         country
         (
               type = country
               displayname = "Country"
         )
         latitude
         (
               type = latitude
               displayname = "latitude"
              visibility = false
         )
         longitude
         (
               type = longitude
               displayname = "longitude"
              visibility = false
         )
         row = 1
         column = 1
        width = medium
        personal data = true
    )

    actions
    {
        on add
        {
            submit
            (
                   type = submit
                   displayname = "Submit"
            )
        }
        on edit
        {
            update
            (
                   type = submit
                   displayname = "Update"
            )
            cancel
            (
                   type = cancel
                   displayname = "Cancel"
            )
        }
    }
}
====================================================

````
