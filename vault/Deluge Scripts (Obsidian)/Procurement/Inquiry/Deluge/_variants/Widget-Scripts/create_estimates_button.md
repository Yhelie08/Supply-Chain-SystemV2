---
title: "create_estimates_button"
source_file: "DMS\DelugeScripts\create_estimates_button.txt"
category: "Procurement/Inquiry/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 476
tags:
  - delivery-management
  - deluge
  - dms
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
  - zoho-creator
---

# create_estimates_button

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Procurement/Inquiry/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\create_estimates_button.txt`
> - **Lines of Code:** 476
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Inquiry_Form → Books Estimate — auto-trigger via Trigger_Estimate (Decision Box) ==
== Trigger_Estimate = true -> runs the script, Estimate_Created stays true once set ==
== Trigger_Estimate = false -> script does not run at all ==
== Resetting Trigger_Estimate back to false is handled separately (already done) ==
== Trigger type is "Successful form submission" (2026-07-02) so it fires reliably from
   both native form UI AND the Inquiry widget's API-based updateRecordById call ==

====================================================
WORKFLOW SETUP
  Form: Inquiry_Form
  Trigger: Created or Edited > Successful form submission
  Action: Execute script (paste below)
  CHANGED 2026-07-02: was "User input of Trigger_Estimate" — switched because the
  Inquiry widget (InquiryBtn/app/Inq.html) sets Trigger_Estimate via
  ZOHO.CREATOR.DATA.updateRecordById (an API call), and "User input of X" ONLY fires
  on live in-form field interaction inside Creator's native rendered form — it never
  fires from API/SDK-driven updates. "Successful form submission" DOES fire reliably
  for API updates (same behavior confirmed for zoho.creator.v2_1.createRecord earlier
  in this project). If Trigger_Estimate is ever toggled by a human directly inside the
  native Inquiry_Form UI, this trigger now fires on Save instead of instantly on check
  — a minor UX difference, not a functional one.
====================================================

if(input.Trigger_Estimate == true)
{
	if(input.Ready_for_Estimates != true)
	{
		info "Skipped: Ready_for_Estimates=" + input.Ready_for_Estimates;
	}
	else
	{
		if(input.Projects == null || input.Projects == 0)
		{
			info "Skipped: No project assigned";
		}
		else
		{
			projRecs = Projects[ID == input.Projects];
			projName = "";
			projEstID = "";
			projEstNo = "";
			for each  p in projRecs
			{
				projName = p.Project_Name;
				projEstID = p.Books_Estimate_ID + "";
				projEstNo = p.Books_Estimate_No + "";
			}
			if(projEstID == "null")
			{
				projEstID = "";
			}
			if(projEstNo == "null")
			{
				projEstNo = "";
			}
			// ---- VALIDATE existing estimate ID before deciding UPDATE vs CREATE ----
			currentItems = List();
			if(projEstID != null && projEstID != "")
			{
				checkUrl = "https://www.zohoapis.com/books/v3/estimates/" + projEstID + "?organization_id=751117756";
				checkResp = invokeurl
				[
					url :checkUrl
					type :GET
					connection:"zhbooks3"
				];
				respCode = checkResp.get("code");
				if(respCode == 0 && checkResp.get("estimate") != null)
				{
					currentItems = checkResp.get("estimate").get("line_items");
				}
				else
				{
					// Stale/deleted estimate in Books - clear it and fall back to CREATE
					info "Existing estimate invalid/not found (code=" + respCode + "). Clearing stale ID and creating new estimate.";
					projEstID = "";
					projEstNo = "";
					staleProjRec = Projects[ID == input.Projects];
					for each  sp in staleProjRec
					{
						sp.Books_Estimate_ID = "";
						sp.Books_Estimate_No = "";
					}
				}
			}
			// --------------------------------------------------------------------
			custRecs = Customer[ID == input.Customer];
			custBookID = "";
			for each  c in custRecs
			{
				custBookID = c.ID1 + "";
			}
			if(custBookID == "null")
			{
				custBookID = "";
			}
			custTypeVal = input.Customer_Type + "";
			if(custTypeVal == "Enduser")
			{
				custTypeVal = "End User";
			}
			if(custTypeVal == "null")
			{
				custTypeVal = "";
			}
			salesOwnerVal = input.Sales_Owner + "";
			if(salesOwnerVal == "null")
			{
				salesOwnerVal = "";
			}
			designCompanyVal = input.Design_Company + "";
			if(designCompanyVal == "null")
			{
				designCompanyVal = "";
			}
			designerArchVal = input.Designer_Architect + "";
			if(designerArchVal == "null")
			{
				designerArchVal = "";
			}
			designPartnerVal = input.Design_Partner + "";
			if(designPartnerVal == "null")
			{
				designPartnerVal = "";
			}
			commissionVal = input.Commission + "";
			if(commissionVal == "null")
			{
				commissionVal = "";
			}
			orderTypeVal = input.Order_Type + "";
			if(orderTypeVal == "null")
			{
				orderTypeVal = "";
			}
			projectTypeVal = input.Project_Type + "";
			if(projectTypeVal == "null")
			{
				projectTypeVal = "";
			}
			forBiddingVal = input.For_Bidding + "";
			if(forBiddingVal == "null")
			{
				forBiddingVal = "";
			}
			addtlDiscVal = input.Addtl_Disc_Needed1 + "";
			if(addtlDiscVal == "null")
			{
				addtlDiscVal = "";
			}
			targetDateVal = input.target_date + "";
			if(targetDateVal == "null")
			{
				targetDateVal = "";
			}
			if(projEstID != null && projEstID != "")
			{
				lineItems = List();
				allINQNos = "";
				allInq = Inquiry_Form[quote_group == input.quote_group];
				for each  inq in allInq
				{
					if(inq.Ready_for_Estimates == true)
					{
						if(allINQNos != "")
						{
							allINQNos = allINQNos + ", ";
						}
						allINQNos = allINQNos + inq.INQ_No;
						sibItems = Items[SKU == inq.sku];
						sibBookID = "";
						for each  si in sibItems
						{
							sibBookID = si.ID1 + "";
						}
						if(sibBookID == "null")
						{
							sibBookID = "";
						}
						sibLine = Map();
						sibLine.put("item_id",sibBookID);
						sibLine.put("quantity",inq.quantity.toLong());
						sibLine.put("rate",inq.SRP_Approved1.toDecimal());
						existingLIID = "";
						for each  item in currentItems
						{
							if(item.get("item_id") + "" == sibBookID + "")
							{
								existingLIID = item.get("line_item_id") + "";
							}
						}
						if(existingLIID != "" && existingLIID != "null")
						{
							sibLine.put("line_item_id",existingLIID);
						}
						lineItems.add(sibLine);
					}
				}
				ucfList = List();
				ucf1 = Map();
				ucf1.put("label","Sales Agent");
				ucf1.put("value",salesOwnerVal);
				ucfList.add(ucf1);
				ucf2 = Map();
				ucf2.put("label","Project Name");
				ucf2.put("value",projName + "");
				ucfList.add(ucf2);
				ucf3 = Map();
				ucf3.put("label","Design Company");
				ucf3.put("value",designCompanyVal);
				ucfList.add(ucf3);
				ucf4 = Map();
				ucf4.put("label","Designer/ Architect");
				ucf4.put("value",designerArchVal);
				ucfList.add(ucf4);
				ucf5 = Map();
				ucf5.put("label","Design Partner");
				ucf5.put("value",designPartnerVal);
				ucfList.add(ucf5);
				ucf6 = Map();
				ucf6.put("label","Commission ");
				ucf6.put("value",commissionVal);
				ucfList.add(ucf6);
				ucf7 = Map();
				ucf7.put("label","Customer Type");
				ucf7.put("value",custTypeVal);
				ucfList.add(ucf7);
				ucf8 = Map();
				ucf8.put("label","Order Type");
				ucf8.put("value",orderTypeVal);
				ucfList.add(ucf8);
				ucf9 = Map();
				ucf9.put("label","Project Type:");
				ucf9.put("value",projectTypeVal);
				ucfList.add(ucf9);
				ucf10 = Map();
				ucf10.put("label","For Bidding? (✓ if yes)");
				ucf10.put("value",forBiddingVal);
				ucfList.add(ucf10);
				ucf11 = Map();
				ucf11.put("label","Additional discount needed");
				ucf11.put("value",addtlDiscVal);
				ucfList.add(ucf11);
				ucf12 = Map();
				ucf12.put("label","Target Delivery Date");
				ucf12.put("value",targetDateVal);
				ucfList.add(ucf12);
				ucf13 = Map();
				ucf13.put("label","INQ No");
				ucf13.put("value",allINQNos);
				ucfList.add(ucf13);
				updateBody = Map();
				updateBody.put("line_items",lineItems);
				updateBody.put("custom_fields",ucfList);
				updateBody.put("expiry_date",targetDateVal);
				bodyStr = updateBody.toString();
				putUrl = "https://www.zohoapis.com/books/v3/estimates/" + projEstID + "?organization_id=751117756";
				updateResp = invokeurl
				[
					url :putUrl
					type :PUT
					parameters:bodyStr
					headers:{"Content-Type":"application/json"}
					connection:"zhbooks3"
				];
				info "updateResp=" + updateResp.toString();
				if(updateResp != null && updateResp.get("code") == 0)
				{
					allInq2 = Inquiry_Form[quote_group == input.quote_group];
					for each  inq in allInq2
					{
						if(inq.Books_Estimate_ID == null || inq.Books_Estimate_ID == "")
						{
							recs = Inquiry_Form[INQ_No == inq.INQ_No];
							for each  r in recs
							{
								r.Books_Estimate_ID = projEstID;
								r.Books_Estimate_No = projEstNo;
								r.Estimate_Created = true;
							}
						}
					}
				}
				else
				{
					info "Books UPDATE failed: " + updateResp.toString();
				}
			}
			else
			{
				lineItems = List();
				allINQNos = "";
				itemRecs = Items[ID == input.Items];
				itemBookID = "";
				for each  i in itemRecs
				{
					itemBookID = i.ID1 + "";
				}
				if(itemBookID == "null")
				{
					itemBookID = "";
				}
				lineItem = Map();
				lineItem.put("item_id",itemBookID);
				lineItem.put("quantity",input.quantity.toLong());
				lineItem.put("rate",input.SRP_Approved1.toDecimal());
				lineItems.add(lineItem);
				allINQNos = input.INQ_No + "";
				allInq = Inquiry_Form[quote_group == input.quote_group];
				for each  inq in allInq
				{
					if(inq.INQ_No != input.INQ_No && inq.Ready_for_Estimates == true)
					{
						sibItems = Items[SKU == inq.sku];
						sibBookID = "";
						for each  si in sibItems
						{
							sibBookID = si.ID1 + "";
						}
						if(sibBookID == "null")
						{
							sibBookID = "";
						}
						sibLine = Map();
						sibLine.put("item_id",sibBookID);
						sibLine.put("quantity",inq.quantity.toLong());
						sibLine.put("rate",inq.SRP_Approved1.toDecimal());
						lineItems.add(sibLine);
						allINQNos = allINQNos + ", " + inq.INQ_No;
					}
				}
				cfList = List();
				cf1 = Map();
				cf1.put("label","Sales Agent");
				cf1.put("value",salesOwnerVal);
				cfList.add(cf1);
				cf2 = Map();
				cf2.put("label","Project Name");
				cf2.put("value",projName + "");
				cfList.add(cf2);
				cf3 = Map();
				cf3.put("label","Design Company");
				cf3.put("value",designCompanyVal);
				cfList.add(cf3);
				cf4 = Map();
				cf4.put("label","Designer/ Architect");
				cf4.put("value",designerArchVal);
				cfList.add(cf4);
				cf5 = Map();
				cf5.put("label","Design Partner");
				cf5.put("value",designPartnerVal);
				cfList.add(cf5);
				cf6 = Map();
				cf6.put("label","Commission ");
				cf6.put("value",commissionVal);
				cfList.add(cf6);
				cf7 = Map();
				cf7.put("label","Customer Type");
				cf7.put("value",custTypeVal);
				cfList.add(cf7);
				cf8 = Map();
				cf8.put("label","Order Type");
				cf8.put("value",orderTypeVal);
				cfList.add(cf8);
				cf9 = Map();
				cf9.put("label","Project Type:");
				cf9.put("value",projectTypeVal);
				cfList.add(cf9);
				cf10 = Map();
				cf10.put("label","For Bidding? (✓ if yes)");
				cf10.put("value",forBiddingVal);
				cfList.add(cf10);
				cf11 = Map();
				cf11.put("label","Additional discount needed");
				cf11.put("value",addtlDiscVal);
				cfList.add(cf11);
				cf12 = Map();
				cf12.put("label","Target Delivery Date");
				cf12.put("value",targetDateVal);
				cfList.add(cf12);
				cf13 = Map();
				cf13.put("label","INQ No");
				cf13.put("value",allINQNos);
				cfList.add(cf13);
				estimateBody = Map();
				estimateBody.put("customer_id",custBookID);
				estimateBody.put("line_items",lineItems);
				estimateBody.put("custom_fields",cfList);
				estimateBody.put("date",zoho.currentdate.toString("yyyy-MM-dd"));
				estimateBody.put("expiry_date",targetDateVal);
				bodyStr = estimateBody.toString();
				createUrl = "https://www.zohoapis.com/books/v3/estimates?organization_id=751117756";
				createResp = invokeurl
				[
					url :createUrl
					type :POST
					parameters:bodyStr
					headers:{"Content-Type":"application/json"}
					connection:"zhbooks3"
				];
				info "createResp=" + createResp.toString();
				if(createResp != null && createResp.get("code") == 0 && createResp.get("estimate") != null)
				{
					newEstID = createResp.get("estimate").get("estimate_id") + "";
					newEstNo = createResp.get("estimate").get("estimate_number") + "";
					rec = Inquiry_Form[ID == input.ID];
					for each  r in rec
					{
						r.Books_Estimate_ID = newEstID;
						r.Books_Estimate_No = newEstNo;
						r.Estimate_Created = true;
					}
					allInq2 = Inquiry_Form[quote_group == input.quote_group];
					for each  inq in allInq2
					{
						if(inq.INQ_No != input.INQ_No)
						{
							recs = Inquiry_Form[INQ_No == inq.INQ_No];
							for each  r in recs
							{
								r.Books_Estimate_ID = newEstID;
								r.Books_Estimate_No = newEstNo;
								r.Estimate_Created = true;
							}
						}
					}
					projRec = Projects[ID == input.Projects];
					for each  p in projRec
					{
						p.Books_Estimate_ID = newEstID;
						p.Books_Estimate_No = newEstNo;
					}
				}
				else
				{
					info "Books CREATE failed: " + createResp.toString();
				}
			}
		}
	}

	// ---- Consume the trigger: every run of the script resets Trigger_Estimate back to false ----
	resetRecs = Inquiry_Form[INQ_No == input.INQ_No];
	for each  rr in resetRecs
	{
		rr.Trigger_Estimate = false;
	}
	input.Trigger_Estimate = false;
}

====================================================
NOTES:
- Trigger_Estimate (Decision Box) replaces the old Action Item button as the run gate.
  Trigger type is "Successful form submission" (changed 2026-07-02 from "User input of
  Trigger_Estimate" — see WORKFLOW SETUP note above for why: API/SDK-driven updates,
  like the Inquiry widget's ZOHO.CREATOR.DATA.updateRecordById call, don't fire "User
  input of X" triggers, only live in-form UI interaction does).
- Every run of the script resets Trigger_Estimate back to false at the very end,
  regardless of which internal branch ran (Ready_for_Estimates skip, no-project skip,
  UPDATE, or CREATE) — one-shot flag, not tied to success/failure of the Books call.
  Fetches via Inquiry_Form[INQ_No == input.INQ_No] (string field, safe) and sets both
  rr.Trigger_Estimate (DB persist) and input.Trigger_Estimate (immediate UI reflect),
  same fetch-then-set-both pattern used elsewhere in this codebase for resetting
  booleans (e.g. Create_Estimate3 reset in lookatthis.txt / error.txt).
- Estimate_Created is NOT reset anywhere — it only ever gets set to true (on
  successful UPDATE/CREATE paths) and stays true permanently.
- All other logic (stale estimate ID validation, null-safety on every input.field + "",
  UPDATE vs CREATE branching) is unchanged from the hardened version already in place.
- Every record update in this script (Projects, Inquiry_Form) uses dot-notation
  (r.field = value; one statement per field) rather than multi-column `update r [...]`.
  This was originally REQUIRED under the old "User input of Trigger_Estimate" trigger
  (confirmed live 2026-07-01: "Update MultiColumn task isn't supported for action ''").
  Under the new "Successful form submission" trigger, multi-column update IS actually
  supported (confirmed elsewhere in this codebase, e.g. PR_Changed) — dot-notation was
  left as-is since it already works and there's no need to touch working code.
====================================================

````
