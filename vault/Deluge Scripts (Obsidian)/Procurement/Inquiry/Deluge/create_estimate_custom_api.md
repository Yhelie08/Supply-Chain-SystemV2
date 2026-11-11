---
title: "create_estimate_custom_api"
source_file: "create_estimate_custom_api.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 643
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# create_estimate_custom_api

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `create_estimate_custom_api.txt`
> - **Lines of Code:** 643
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Inquiry -> Books Estimate, via Creator Custom API (replaces Trigger_Estimate/updateRecordById) ==
== Called directly from InquiryBtn/app/Inq.html's Create Estimate button ==

====================================================
WHY THIS REPLACES create_estimates_button.txt's TRIGGER MECHANISM
====================================================
The widget's button called ZOHO.CREATOR.DATA.updateRecordById({Trigger_Estimate:true})
and relied on a workflow ("User input of Trigger_Estimate") to pick it up. That trigger
type only fires on live in-form field interaction inside Creator's native rendered form
— never from API/SDK updates — so the button silently did nothing. Switching the
workflow to "Successful form submission" (already done, see create_estimates_button.txt)
fixes that specific bug, but it's still an indirect flow: set a field, hope a workflow
catches it, poll/guess whether it worked.

Custom API is the proper direct mechanism: the widget calls a Deluge function directly
and gets a real synchronous response (success/fail/estimate ID) instead of blind-firing
a field update. This file converts create_estimates_button.txt's body into a standalone
Custom Function callable that way. create_estimates_button.txt / Trigger_Estimate can be
retired once this is confirmed working (kept for now as a fallback / for any other native
form usage).

====================================================
STEP 1 — CREATE THE DELUGE CUSTOM FUNCTION
  Creator: Workflows (or Functions area) -> New Custom Function
  Name: createEstimateForInquiry
  Argument: String inqNo
  Paste the FULL block below, including the "map createEstimateForInquiry(...)" line
  and outer {}. Unlike Books custom functions (paste-body-only), THIS editor is a
  blank canvas — it does not pre-generate the signature, confirmed live 2026-07-02
  ("Expected 'VOID','INT',... but found 'response'" when body-only was pasted).
  Return type must be `map` (lowercase, matching the dropdown you already set to
  "map") — not `void`, that was also tried and failed ("Improper Statement").
====================================================

map createEstimateForInquiry(String inqNo)
{
	response = Map();
	recs = Inquiry_Form[INQ_No == inqNo];
	found = false;
	for each  rec in recs
	{
		found = true;

		// --- Resilient Readiness Verification ---
		// Direct condition evaluation to prevent blocking on stale database rollup flags
		collateralComplete = true;
		colList = List();
		colList.add(rec.Product_Sample);
		colList.add(rec.D_Image);
		colList.add(rec.Specification);
		colList.add(rec.Technical_Drawing);
		for each  cVal in colList
		{
			if(cVal != "Completed" && cVal != "N/A")
			{
				collateralComplete = false;
			}
		}
		srpApproved = (rec.SRP_Approved == true || rec.SRP_Status == "Approved" || (rec.SRP_Approved1 != null && rec.SRP_Approved1 > 0));
		supplierSelected = (rec.Supplier_Selected == true);
		availability = (rec.Availability == true);
		finalPriceExists = (rec.Final_Price_Exists == true || (rec.Select_Final_Cost != null && rec.Select_Final_Cost > 0) || (rec.SRP_Approved1 != null && rec.SRP_Approved1 > 0));

		isReady = (rec.Ready_for_Estimates == true) || (supplierSelected && availability && finalPriceExists && collateralComplete && srpApproved);

		if(!isReady)
		{
			response.put("status","error");
			response.put("message","Inquiry " + inqNo + " is not yet ready for estimate. Please verify readiness checklist.");
			return response;
		}
		// Heal the database flag if it was stale
		if(rec.Ready_for_Estimates != true)
		{
			rec.Ready_for_Estimates = true;
		}

		if(rec.Projects == null || rec.Projects == 0)
		{
			response.put("status","error");
			response.put("message","No project assigned");
			return response;
		}
		projRecs = Projects[ID == rec.Projects];
		projName = "";
		projEstID = "";
		projEstNo = "";
		projCustID = null;
		for each  p in projRecs
		{
			projName = p.Project_Name;
			projEstID = p.Books_Estimate_ID + "";
			projEstNo = p.Books_Estimate_No + "";
			projCustID = p.Customer;
		}
		if(projEstID == "null") { projEstID = ""; }
		if(projEstNo == "null") { projEstNo = ""; }

		// --- Robust Customer Resolution ---
		custRecs = Customer[ID == rec.Customer];
		custBookID = "";
		custNameVal = "";
		for each  c in custRecs
		{
			custBookID = c.ID1 + "";
			custNameVal = c.customer_name + "";
		}
		// Fallback to Project's Customer if Inquiry's Customer is empty
		if((custBookID == "" || custBookID == "null") && projCustID != null && projCustID != 0)
		{
			pCustRecs = Customer[ID == projCustID];
			for each  pc in pCustRecs
			{
				custBookID = pc.ID1 + "";
				custNameVal = pc.customer_name + "";
				// Heal Inquiry's Customer lookup
				rec.Customer = projCustID;
			}
		}
		if(custBookID == "null") { custBookID = ""; }
		if(custNameVal == "null") { custNameVal = ""; }

		// Search Books by name if ID1 is not yet set
		if(custBookID == "" && custNameVal != "")
		{
			searchUrl = "https://www.zohoapis.com/books/v3/contacts?organization_id=751117756&contact_name=" + zoho.encryption.urlEncode(custNameVal);
			searchResp = invokeurl
			[
				url :searchUrl
				type :GET
				connection :"zhbooks3"
			];
			if(searchResp.get("code") == 0 && searchResp.get("contacts") != null)
			{
				contactList = searchResp.get("contacts");
				if(contactList.size() > 0)
				{
					firstContact = contactList.get(0);
					custBookID = firstContact.get("contact_id") + "";
					// Backfill ID1 on Creator Customer record
					if(rec.Customer != null && rec.Customer != 0)
					{
						updCust = Customer[ID == rec.Customer];
						for each  uc in updCust { uc.ID1 = custBookID; }
					}
					else if(projCustID != null && projCustID != 0)
					{
						updCust = Customer[ID == projCustID];
						for each  uc in updCust { uc.ID1 = custBookID; }
					}
				}
			}
		}

		if(custBookID == "")
		{
			response.put("status","error");
			if(custNameVal != "")
			{
				response.put("message","Customer '" + custNameVal + "' is not linked to Zoho Books (missing contact ID).");
			}
			else
			{
				response.put("message","No customer assigned on inquiry or project. Please select a customer.");
			}
			return response;
		}

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
				realEstNo = checkResp.get("estimate").get("estimate_number") + "";
				if(realEstNo != "" && realEstNo != "null")
				{
					projEstNo = realEstNo;
				}
			}
			else
			{
				projEstID = "";
				projEstNo = "";
				staleProjRec = Projects[ID == rec.Projects];
				for each  sp in staleProjRec
				{
					sp.Books_Estimate_ID = "";
					sp.Books_Estimate_No = "";
				}
			}
		}

		custTypeVal = rec.Customer_Type + "";
		if(custTypeVal == "Enduser") { custTypeVal = "End User"; }
		if(custTypeVal == "null") { custTypeVal = ""; }
		salesOwnerVal = rec.Sales_Owner + "";
		if(salesOwnerVal == "null") { salesOwnerVal = ""; }
		designCompanyVal = rec.Design_Company + "";
		if(designCompanyVal == "null") { designCompanyVal = ""; }
		designerArchVal = rec.Designer_Architect + "";
		if(designerArchVal == "null") { designerArchVal = ""; }
		designPartnerVal = rec.Design_Partner + "";
		if(designPartnerVal == "null") { designPartnerVal = ""; }
		commissionVal = rec.Commission + "";
		if(commissionVal == "null") { commissionVal = ""; }
		orderTypeVal = rec.Order_Type + "";
		if(orderTypeVal == "null") { orderTypeVal = ""; }
		projectTypeVal = rec.Project_Type + "";
		if(projectTypeVal == "null") { projectTypeVal = ""; }
		forBiddingVal = rec.For_Bidding + "";
		if(forBiddingVal == "null") { forBiddingVal = ""; }
		addtlDiscVal = rec.Addtl_Disc_Needed1 + "";
		if(addtlDiscVal == "null") { addtlDiscVal = ""; }
		targetDateVal = rec.target_date + "";
		if(targetDateVal == "null") { targetDateVal = ""; }

		if(projEstID != null && projEstID != "")
		{
			// ==========================================
			// UPDATE PATH: Estimate already exists in Books
			// ==========================================
			lineItems = List();
			allINQNos = "";
			allInq = Inquiry_Form[Projects == rec.Projects || quote_group == rec.quote_group];
			for each  inq in allInq
			{
				// Check sibling readiness
				sibColComplete = true;
				sibColList = List();
				sibColList.add(inq.Product_Sample);
				sibColList.add(inq.D_Image);
				sibColList.add(inq.Specification);
				sibColList.add(inq.Technical_Drawing);
				for each  scVal in sibColList
				{
					if(scVal != "Completed" && scVal != "N/A") { sibColComplete = false; }
				}
				sibSrpApproved = (inq.SRP_Approved == true || inq.SRP_Status == "Approved" || (inq.SRP_Approved1 != null && inq.SRP_Approved1 > 0));
				sibFinalPrice = (inq.Final_Price_Exists == true || (inq.Select_Final_Cost != null && inq.Select_Final_Cost > 0) || (inq.SRP_Approved1 != null && inq.SRP_Approved1 > 0));
				sibReady = (inq.Ready_for_Estimates == true) || (inq.Supplier_Selected == true && inq.Availability == true && sibFinalPrice && sibColComplete && sibSrpApproved);

				if(sibReady)
				{
					if(allINQNos != "") { allINQNos = allINQNos + ", "; }
					allINQNos = allINQNos + inq.INQ_No;
					sibBookID = "";
					sibNameVal = "";
					sibItems = Items[ID == inq.Items];
					for each  si in sibItems { sibBookID = si.ID1 + ""; sibNameVal = si.item_name + ""; }
					if(sibBookID == "" || sibBookID == "null")
					{
						skuItems = Items[SKU == inq.sku];
						for each  ski in skuItems { sibBookID = ski.ID1 + ""; if(sibNameVal == "") { sibNameVal = ski.item_name + ""; } }
					}
					if(sibBookID == "null") { sibBookID = ""; }
					if(sibNameVal == "" && inq.sku != null) { sibNameVal = inq.sku + ""; }

					sibLine = Map();
					if(sibBookID != "") { sibLine.put("item_id",sibBookID); }
					if(sibNameVal != "") { sibLine.put("name",sibNameVal); }
					if(inq.description != null && inq.description != "") { sibLine.put("description",inq.description); }
					sQty = if(inq.quantity != null, inq.quantity.toLong(), 1);
					sRate = if(inq.SRP_Approved1 != null, inq.SRP_Approved1.toDecimal(), 0.0);
					sibLine.put("quantity",sQty);
					sibLine.put("rate",sRate);

					existingLIID = "";
					for each  item in currentItems
					{
						if(sibBookID != "" && item.get("item_id") + "" == sibBookID + "")
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
			ucf1 = Map(); ucf1.put("label","Sales Agent"); ucf1.put("value",salesOwnerVal); ucfList.add(ucf1);
			ucf2 = Map(); ucf2.put("label","Project Name"); ucf2.put("value",projName + ""); ucfList.add(ucf2);
			ucf3 = Map(); ucf3.put("label","Design Company"); ucf3.put("value",designCompanyVal); ucfList.add(ucf3);
			ucf4 = Map(); ucf4.put("label","Designer/ Architect"); ucf4.put("value",designerArchVal); ucfList.add(ucf4);
			ucf5 = Map(); ucf5.put("label","Design Partner"); ucf5.put("value",designPartnerVal); ucfList.add(ucf5);
			ucf6 = Map(); ucf6.put("label","Commission "); ucf6.put("value",commissionVal); ucfList.add(ucf6);
			ucf7 = Map(); ucf7.put("label","Customer Type"); ucf7.put("value",custTypeVal); ucfList.add(ucf7);
			ucf8 = Map(); ucf8.put("label","Order Type"); ucf8.put("value",orderTypeVal); ucfList.add(ucf8);
			ucf9 = Map(); ucf9.put("label","Project Type:"); ucf9.put("value",projectTypeVal); ucfList.add(ucf9);
			ucf10 = Map(); ucf10.put("label","For Bidding? (✓ if yes)"); ucf10.put("value",forBiddingVal); ucfList.add(ucf10);
			ucf11 = Map(); ucf11.put("label","Additional discount needed"); ucf11.put("value",addtlDiscVal); ucfList.add(ucf11);
			ucf12 = Map(); ucf12.put("label","Target Delivery Date"); ucf12.put("value",targetDateVal); ucfList.add(ucf12);
			ucf13 = Map(); ucf13.put("label","INQ No"); ucf13.put("value",allINQNos); ucfList.add(ucf13);
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
			if(updateResp != null && updateResp.get("code") == 0)
			{
				if(updateResp.get("estimate") != null)
				{
					updEstNo = updateResp.get("estimate").get("estimate_number") + "";
					if(updEstNo != "" && updEstNo != "null")
					{
						projEstNo = updEstNo;
					}
				}
				allInq2 = Inquiry_Form[Projects == rec.Projects || quote_group == rec.quote_group];
				for each  inq in allInq2
				{
					irecs = Inquiry_Form[INQ_No == inq.INQ_No];
					for each  ir in irecs
					{
						ir.Books_Estimate_ID = projEstID;
						ir.Books_Estimate_No = projEstNo;
						ir.Estimate_Created = true;
						ir.Ready_for_Estimates = true;
					}
				}
				projRecUpd = Projects[ID == rec.Projects];
				for each  pu in projRecUpd
				{
					pu.Books_Estimate_ID = projEstID;
					pu.Books_Estimate_No = projEstNo;
				}
				response.put("status","success");
				response.put("message","Estimate updated (" + projEstNo + ")");
				response.put("estimateId",projEstID);
				response.put("estimateNo",projEstNo);
			}
			else
			{
				response.put("status","error");
				response.put("message","Books UPDATE failed: " + updateResp.toString());
			}
		}
		else
		{
			// ==========================================
			// CREATE PATH: Fresh Estimate in Books
			// ==========================================
			lineItems = List();
			allINQNos = "";
			itemRecs = Items[ID == rec.Items];
			itemBookID = "";
			itemNameVal = "";
			for each  i in itemRecs { itemBookID = i.ID1 + ""; itemNameVal = i.item_name + ""; }
			if(itemBookID == "" || itemBookID == "null")
			{
				skuItems = Items[SKU == rec.sku];
				for each  si in skuItems { itemBookID = si.ID1 + ""; if(itemNameVal == "") { itemNameVal = si.item_name + ""; } }
			}
			if(itemBookID == "null") { itemBookID = ""; }
			if(itemNameVal == "" && rec.sku != null) { itemNameVal = rec.sku + ""; }

			lineItem = Map();
			if(itemBookID != "") { lineItem.put("item_id",itemBookID); }
			if(itemNameVal != "") { lineItem.put("name",itemNameVal); }
			if(rec.description != null && rec.description != "") { lineItem.put("description",rec.description); }
			rQty = if(rec.quantity != null, rec.quantity.toLong(), 1);
			rRate = if(rec.SRP_Approved1 != null, rec.SRP_Approved1.toDecimal(), 0.0);
			lineItem.put("quantity",rQty);
			lineItem.put("rate",rRate);
			lineItems.add(lineItem);
			allINQNos = rec.INQ_No + "";

			allInq = Inquiry_Form[Projects == rec.Projects || quote_group == rec.quote_group];
			for each  inq in allInq
			{
				if(inq.INQ_No != rec.INQ_No)
				{
					// Check sibling readiness
					sibColComplete = true;
					sibColList = List();
					sibColList.add(inq.Product_Sample);
					sibColList.add(inq.D_Image);
					sibColList.add(inq.Specification);
					sibColList.add(inq.Technical_Drawing);
					for each  scVal in sibColList
					{
						if(scVal != "Completed" && scVal != "N/A") { sibColComplete = false; }
					}
					sibSrpApproved = (inq.SRP_Approved == true || inq.SRP_Status == "Approved" || (inq.SRP_Approved1 != null && inq.SRP_Approved1 > 0));
					sibFinalPrice = (inq.Final_Price_Exists == true || (inq.Select_Final_Cost != null && inq.Select_Final_Cost > 0) || (inq.SRP_Approved1 != null && inq.SRP_Approved1 > 0));
					sibReady = (inq.Ready_for_Estimates == true) || (inq.Supplier_Selected == true && inq.Availability == true && sibFinalPrice && sibColComplete && sibSrpApproved);

					if(sibReady)
					{
						sibBookID = "";
						sibNameVal = "";
						sibItems = Items[ID == inq.Items];
						for each  si in sibItems { sibBookID = si.ID1 + ""; sibNameVal = si.item_name + ""; }
						if(sibBookID == "" || sibBookID == "null")
						{
							skuItems = Items[SKU == inq.sku];
							for each  ski in skuItems { sibBookID = ski.ID1 + ""; if(sibNameVal == "") { sibNameVal = ski.item_name + ""; } }
						}
						if(sibBookID == "null") { sibBookID = ""; }
						if(sibNameVal == "" && inq.sku != null) { sibNameVal = inq.sku + ""; }

						sibLine = Map();
						if(sibBookID != "") { sibLine.put("item_id",sibBookID); }
						if(sibNameVal != "") { sibLine.put("name",sibNameVal); }
						if(inq.description != null && inq.description != "") { sibLine.put("description",inq.description); }
						sQty = if(inq.quantity != null, inq.quantity.toLong(), 1);
						sRate = if(inq.SRP_Approved1 != null, inq.SRP_Approved1.toDecimal(), 0.0);
						sibLine.put("quantity",sQty);
						sibLine.put("rate",sRate);
						lineItems.add(sibLine);
						allINQNos = allINQNos + ", " + inq.INQ_No;
					}
				}
			}
			cfList = List();
			cf1 = Map(); cf1.put("label","Sales Agent"); cf1.put("value",salesOwnerVal); cfList.add(cf1);
			cf2 = Map(); cf2.put("label","Project Name"); cf2.put("value",projName + ""); cfList.add(cf2);
			cf3 = Map(); cf3.put("label","Design Company"); cf3.put("value",designCompanyVal); cfList.add(cf3);
			cf4 = Map(); cf4.put("label","Designer/ Architect"); cf4.put("value",designerArchVal); cfList.add(cf4);
			cf5 = Map(); cf5.put("label","Design Partner"); cf5.put("value",designPartnerVal); cfList.add(cf5);
			cf6 = Map(); cf6.put("label","Commission "); cf6.put("value",commissionVal); cfList.add(cf6);
			cf7 = Map(); cf7.put("label","Customer Type"); cf7.put("value",custTypeVal); cfList.add(cf7);
			cf8 = Map(); cf8.put("label","Order Type"); cf8.put("value",orderTypeVal); cfList.add(cf8);
			cf9 = Map(); cf9.put("label","Project Type:"); cf9.put("value",projectTypeVal); cfList.add(cf9);
			cf10 = Map(); cf10.put("label","For Bidding? (✓ if yes)"); cf10.put("value",forBiddingVal); cfList.add(cf10);
			cf11 = Map(); cf11.put("label","Additional discount needed"); cf11.put("value",addtlDiscVal); cfList.add(cf11);
			cf12 = Map(); cf12.put("label","Target Delivery Date"); cf12.put("value",targetDateVal); cfList.add(cf12);
			cf13 = Map(); cf13.put("label","INQ No"); cf13.put("value",allINQNos); cfList.add(cf13);
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
			if(createResp != null && createResp.get("code") == 0 && createResp.get("estimate") != null)
			{
				newEstID = createResp.get("estimate").get("estimate_id") + "";
				newEstNo = createResp.get("estimate").get("estimate_number") + "";
				selfRecs = Inquiry_Form[INQ_No == rec.INQ_No];
				for each  sr in selfRecs
				{
					sr.Books_Estimate_ID = newEstID;
					sr.Books_Estimate_No = newEstNo;
					sr.Estimate_Created = true;
					sr.Ready_for_Estimates = true;
				}
				allInq2 = Inquiry_Form[Projects == rec.Projects || quote_group == rec.quote_group];
				for each  inq in allInq2
				{
					if(inq.INQ_No != rec.INQ_No)
					{
						irecs = Inquiry_Form[INQ_No == inq.INQ_No];
						for each  ir in irecs
						{
							ir.Books_Estimate_ID = newEstID;
							ir.Books_Estimate_No = newEstNo;
							ir.Estimate_Created = true;
							ir.Ready_for_Estimates = true;
						}
					}
				}
				projRec2 = Projects[ID == rec.Projects];
				for each  p2 in projRec2
				{
					p2.Books_Estimate_ID = newEstID;
					p2.Books_Estimate_No = newEstNo;
				}
				response.put("status","success");
				response.put("message","Estimate created (" + newEstNo + ")");
				response.put("estimateId",newEstID);
				response.put("estimateNo",newEstNo);
			}
			else
			{
				response.put("status","error");
				response.put("message","Books CREATE failed: " + createResp.toString());
			}
		}
		break; // only one Inquiry_Form record expected per INQ_No
	}
	if(found == false)
	{
		response.put("status","error");
		response.put("message","INQ not found: " + inqNo);
	}
	return response;
}

====================================================
STEP 2 — CREATE THE CUSTOM API
  Creator: Microservices -> Custom API -> + Create Custom API
====================================================
Basic Details:
  Name: CreateEstimate (link name e.g. create_estimate)
Request:
  HTTP Method: POST
  Content-Type: application/json, "Key and Value" (so inqNo arrives as a plain function arg)
  Authentication: PublicKey (matches the existing create_inquiry Custom API pattern
    already in this project — see InquiryBtn/app/Inq.html CUSTOM_API_URL constant)
  Parameter: inqNo (String) — matches the createEstimateForInquiry(String inqNo) arg
Function:
  App: supply-chain-app
  Function: createEstimateForInquiry
Response:
  Custom response — the function already returns a Map with status/message/estimateId/
  estimateNo; configure the Response tab to pass that Map through as the response body
  (exact mapping UI varies by Creator version — map "status"=="success" to HTTP 200,
  "status"=="error" to a 4xx/5xx, or just pass the whole Map through if "Standard
  response" ends up simpler — either way the widget JS below reads response.status /
  response.message defensively).
Summary: Save. DONE 2026-07-02 — actual values:
  Endpoint: https://www.zohoapis.com/creator/custom/homecartel/create_estimate
  Public Key: b4SfvN6qTfWKM5jXTfa8V8yAF
  Full URL (already set in Inq.html's CUSTOM_API_URL_ESTIMATE):
  https://www.zohoapis.com/creator/custom/homecartel/create_estimate?publickey=b4SfvN6qTfWKM5jXTfa8V8yAF
  Note: domain is www.zohoapis.com, NOT creator.zoho.com like the existing create_inquiry
  API — both are valid Zoho Custom API domains, just confirm you use the exact one Creator
  gives you on the Summary screen rather than assuming they match.

====================================================
STEP 3 — UPDATE THE WIDGET (InquiryBtn/app/Inq.html) — DONE 2026-07-02, revised
====================================================
Originally used a raw fetch() to the Custom API endpoint (mirroring the existing but
UNUSED CUSTOM_API_URL constant in this file). That failed live with "Failed to fetch".
Root cause confirmed via browser DevTools console (2026-07-02): it's a CSP violation,
not CORS — plugin-manifest.json's cspDomains.connect-src only whitelists
"https://creator.zoho.com" and "http://localhost:3000", not zohoapis.com, so the
browser blocks the fetch before it's even sent ("violates the following Content
Security Policy directive: 'connect-src ...'"). This likely explains why CUSTOM_API_URL
was declared but never actually called anywhere else in this file — probably an earlier
abandoned attempt at the same pattern that hit the same wall.

FIX: use ZOHO.CREATOR.DATA.invokeCustomApi (the Widget SDK's own method) instead of a
raw fetch(). The actual network call is issued by Zoho's own SDK bridge running in the
parent page context, not the widget iframe's own script, so it isn't subject to the
widget's own connect-src CSP list — same as every other ZOHO.CREATOR.DATA.* call
already proven working in this file (getRecords, updateRecordById, etc. all reach Zoho
API endpoints the same way without ever needing zohoapis.com in connect-src).

FALLBACK if invokeCustomApi still hits a CSP/connect error: add
"https://www.zohoapis.com" to plugin-manifest.json's cspDomains.connect-src array and
re-upload the widget ZIP to Creator (Settings -> Developer Space -> Widgets).

Constant added near CUSTOM_API_URL (~line 1124):

  var CUSTOM_API_PUBLIC_KEY_ESTIMATE = 'b4SfvN6qTfWKM5jXTfa8V8yAF';

triggerCreateEstimate() (~line 3169) — the two ZOHO.CREATOR.DATA.updateRecordById calls
setting Trigger_Estimate/Ready_for_Estimates were replaced with:

  var resp = await ZOHO.CREATOR.DATA.invokeCustomApi({
    api_name: 'create_estimate',
    http_method: 'POST',
    content_type: 'application/json',
    payload: { inqNo: record.INQ_No },
    public_key: CUSTOM_API_PUBLIC_KEY_ESTIMATE
  });
  var result = (resp && resp.data) ? resp.data : resp;
  if(result && result.status === 'success'){
    toast(result.message || 'Estimate created', 4000);
    return true;
  }
  toast('Failed: ' + (result && result.message || zohoErrMsg(resp)), 6000);
  return false;

NOTE: the exact shape of invokeCustomApi's resolved response (whether the function's
returned Map lands at resp.data vs directly on resp) is UNCONFIRMED — the fallback
`(resp && resp.data) ? resp.data : resp` handles both shapes defensively, but check the
browser console response on first real test and simplify once the real shape is known.

====================================================
NOTES:
- CUSTOM FUNCTION EDITOR GOTCHAS (App Builder, 2026-07-02 — different from workflow/Books
  Deluge editors used everywhere else in this project):
  - Paste the FULL function including signature + outer braces (`map funcName(...) { ... }`)
    — this editor does NOT auto-generate a wrapper, unlike Books custom functions.
  - Declared return type keyword in the pasted signature must match the dropdown exactly
    (e.g. `map`, not `void`) or you get a misleading "Improper Statement" error.
  - Do NOT explicitly type local variables (`Map response = Map();`, `List recs = ...`)
    — that also throws "Improper Statement". Plain untyped assignment (`response = Map();`)
    is correct here too, same as every other Deluge context in this project.
  - DANGER: clicking the left-sidebar helper buttons (Fetch Records, Set Variable, etc.)
    while your real code is in the editor INSERTS A LITERAL PLACEHOLDER
    (e.g. `<variable> = <expression> ;`) directly into the script at the cursor position —
    not just a preview. This silently corrupts the buffer and causes confusing errors on
    lines that look syntactically fine. If you want to see a snippet's generated syntax,
    do it in a throwaway/empty function, not your real one.
- Deliberately reuses the fetch()+publickey pattern already declared in this widget
  (CUSTOM_API_URL, currently unused) rather than ZOHO.CREATOR.DATA.invokeCustomApi() —
  keeps one consistent calling convention in this file, and works even when the widget
  runs standalone/outside the actual Creator SDK context (isStandalone() checks
  scattered through this file suggest that matters for local dev/testing here).
- Public key auth means the endpoint is callable by anyone with the key/URL — same
  exposure level as the existing create_inquiry Custom API, so no new security posture
  introduced, but don't paste this URL anywhere public.
- rec.Items / rec.Customer / rec.Projects used directly on a FETCHED record here
  (rec = a row from Inquiry_Form[INQ_No == inqNo]) — this is normally the BIGINT-error
  pattern documented in CLAUDE.md Deluge Gotchas ("Items[ID == inq.Items] on fetched
  record causes BIGINT error"). UNTESTED whether that restriction applies the same way
  inside a Custom Function (vs a workflow Action Item script) — Custom Functions may
  behave differently. If Items[ID==rec.Items] / Customer[ID==rec.Customer] /
  Projects[ID==rec.Projects] error with BIGINT, the fix is the same as elsewhere: match
  by a string field instead (Items[SKU==...], though Customer/Projects don't have an
  obvious string equivalent here — would need re-deriving IDs via rec.INQ_No lookups or
  similar).
- This function does NOT touch Trigger_Estimate at all — no more flag-and-wait. The
  Trigger_Estimate/create_estimates_button.txt workflow can stay in place as a fallback
  for native form usage, or be retired once this is confirmed working end-to-end.
- Response contract (status/message/estimateId/estimateNo) is this function's own
  design, not a Zoho-mandated shape — adjust Step 2's Response tab config and Step 3's
  JS together if a different shape ends up easier to wire in the actual Custom API
  builder UI.
====================================================

````
