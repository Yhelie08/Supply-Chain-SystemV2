---
title: "create_estimates_inq_action"
source_file: "create_estimates_inq_action.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 442
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
  - zoho-books
---

# create_estimates_inq_action

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `create_estimates_inq_action.txt`
> - **Lines of Code:** 442
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Create_Estimates_Inq — native Report Action Item, "Create Estimates" button ==
== THIRD, separate Books-estimate-creation mechanism in this app, alongside
   create_estimates_button.txt (Trigger_Estimate-gated form workflow) and
   create_estimate_custom_api.txt (Custom Function/API called from InquiryBtn/app/Inq.html).
   Found live 2026-07-08, never saved to a file before — CLAUDE.md's SyncItemsCust entry
   already referenced its existence ("Quote_Groups ... Has 'Create Estimates' Action Item
   (same script as All_Inquiries)") but the body was never captured until now. ==

====================================================
WORKFLOW SETUP — Create_Estimates_Inq
  Form: Inquiry_Form
  Location: Report Action Item ("On click of action item") on All_Inquiries (and
  Quote_Groups, per existing CLAUDE.md note — same script both places)
====================================================

// Check readiness resiliently
collateralComplete = true;
colList = List();
colList.add(input.Product_Sample);
colList.add(input.D_Image);
colList.add(input.Specification);
colList.add(input.Technical_Drawing);
for each  cVal in colList
{
	if(cVal != "Completed" && cVal != "N/A")
	{
		collateralComplete = false;
	}
}
srpApproved = (input.SRP_Approved == true || input.SRP_Status == "Approved" || (input.SRP_Approved1 != null && input.SRP_Approved1 > 0));
supplierSelected = (input.Supplier_Selected == true);
availability = (input.Availability == true);
finalPriceExists = (input.Final_Price_Exists == true || (input.Select_Final_Cost != null && input.Select_Final_Cost > 0) || (input.SRP_Approved1 != null && input.SRP_Approved1 > 0));
isReady = (input.Ready_for_Estimates == true) || (supplierSelected && availability && finalPriceExists && collateralComplete && srpApproved);

if(!isReady)
{
	success message "Hindi pa kumpleto ang Readiness Checklist. Hindi maaaring gawa ng Estimate.";
}
else
{
	if(input.Ready_for_Estimates != true)
	{
		input.Ready_for_Estimates = true;
	}
	if(input.Projects == null || input.Projects == 0)
	{
		success message "No project assigned. Assign a project first.";
	}
	else
	{
		projRecs = Projects[ID == input.Projects];
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

		custRecs = Customer[ID == input.Customer];
		custBookID = "";
		custNameVal = "";
		for each  c in custRecs
		{
			custBookID = c.ID1 + "";
			custNameVal = c.customer_name + "";
		}
		if((custBookID == "" || custBookID == "null") && projCustID != null && projCustID != 0)
		{
			pCustRecs = Customer[ID == projCustID];
			for each  pc in pCustRecs
			{
				custBookID = pc.ID1 + "";
				custNameVal = pc.customer_name + "";
				input.Customer = projCustID;
			}
		}
		if(custBookID == "null") { custBookID = ""; }
		if(custNameVal == "null") { custNameVal = ""; }

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
					if(input.Customer != null && input.Customer != 0)
					{
						updCust = Customer[ID == input.Customer];
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

		if(projEstID != null && projEstID != "")
		{
			getUrl = "https://www.zohoapis.com/books/v3/estimates/" + projEstID + "?organization_id=751117756";
			fullEstimate = invokeurl
			[
				url :getUrl
				type :GET
				connection:"zhbooks3"
			];
			currentItems = List();
			if(fullEstimate.get("code") == 0 && fullEstimate.get("estimate") != null)
			{
				currentItems = fullEstimate.get("estimate").get("line_items");
				realEstNo = fullEstimate.get("estimate").get("estimate_number") + "";
				if(realEstNo != "" && realEstNo != "null")
				{
					projEstNo = realEstNo;
				}
			}
			else
			{
				projEstID = "";
				projEstNo = "";
			}
			lineItems = List();
			allINQNos = "";
			allInq = Inquiry_Form[Projects == input.Projects || quote_group == input.quote_group];
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
						sibBookID = si.ID1;
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
							existingLIID = item.get("line_item_id");
						}
					}
					if(existingLIID != "")
					{
						sibLine.put("line_item_id",existingLIID);
					}
					lineItems.add(sibLine);
				}
			}
			ucfList = List();
			ucf1 = Map();
			ucf1.put("label","Sales Agent");
			ucf1.put("value",input.Sales_Owner + "");
			ucfList.add(ucf1);
			ucf2 = Map();
			ucf2.put("label","Project Name");
			ucf2.put("value",projName + "");
			ucfList.add(ucf2);
			ucf3 = Map();
			ucf3.put("label","Design Company");
			ucf3.put("value",input.Design_Company + "");
			ucfList.add(ucf3);
			ucf4 = Map();
			ucf4.put("label","Designer/ Architect");
			ucf4.put("value",input.Designer_Architect + "");
			ucfList.add(ucf4);
			ucf5 = Map();
			ucf5.put("label","Design Partner");
			ucf5.put("value",input.Design_Partner + "");
			ucfList.add(ucf5);
			ucf6 = Map();
			ucf6.put("label","Commission ");
			ucf6.put("value",input.Commission + "");
			ucfList.add(ucf6);
			ucf7 = Map();
			ucf7.put("label","Customer Type");
			ucf7.put("value",input.Customer_Type + "");
			ucfList.add(ucf7);
			ucf8 = Map();
			ucf8.put("label","Order Type");
			ucf8.put("value",input.Order_Type + "");
			ucfList.add(ucf8);
			ucf9 = Map();
			ucf9.put("label","Project Type:");
			ucf9.put("value",input.Project_Type + "");
			ucfList.add(ucf9);
			ucf10 = Map();
			ucf10.put("label","For Bidding? (✓ if yes)");
			ucf10.put("value",input.For_Bidding + "");
			ucfList.add(ucf10);
			ucf11 = Map();
			ucf11.put("label","Additional discount needed");
			ucf11.put("value",input.Addtl_Disc_Needed1 + "");
			ucfList.add(ucf11);
			ucf12 = Map();
			ucf12.put("label","Target Delivery Date");
			ucf12.put("value",input.target_date + "");
			ucfList.add(ucf12);
			ucf13 = Map();
			ucf13.put("label","INQ No");
			ucf13.put("value",allINQNos);
			ucfList.add(ucf13);
			updateBody = Map();
			updateBody.put("line_items",lineItems);
			updateBody.put("custom_fields",ucfList);
			updateBody.put("expiry_date",input.target_date + "");
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
			allInq2 = Inquiry_Form[Projects == input.Projects || quote_group == input.quote_group];
			updEstNo = updateResp.get("estimate").get("estimate_number") + "";
			if(updEstNo != "" && updEstNo != "null")
			{
				projEstNo = updEstNo;
			}
			for each  inq in allInq2
			{
				recs = Inquiry_Form[INQ_No == inq.INQ_No];
				for each  r in recs
				{
					update r
					[
						Books_Estimate_ID=projEstID
						Books_Estimate_No=projEstNo
						Estimate_Created=true
						Ready_for_Estimates=true
					];
				}
			}
			projRec = Projects[ID == input.Projects];
			for each  p in projRec
			{
				update p
				[
					Books_Estimate_ID=projEstID
					Books_Estimate_No=projEstNo
				];
			}
			success message "Estimate " + projEstNo + " updated";
		}
		else
		{
			lineItems = List();
			allINQNos = "";
			itemRecs = Items[ID == input.Items];
			itemBookID = "";
			for each  i in itemRecs
			{
				itemBookID = i.ID1;
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
						sibBookID = si.ID1;
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
			cf1.put("value",input.Sales_Owner + "");
			cfList.add(cf1);
			cf2 = Map();
			cf2.put("label","Project Name");
			cf2.put("value",projName + "");
			cfList.add(cf2);
			cf3 = Map();
			cf3.put("label","Design Company");
			cf3.put("value",input.Design_Company + "");
			cfList.add(cf3);
			cf4 = Map();
			cf4.put("label","Designer/ Architect");
			cf4.put("value",input.Designer_Architect + "");
			cfList.add(cf4);
			cf5 = Map();
			cf5.put("label","Design Partner");
			cf5.put("value",input.Design_Partner + "");
			cfList.add(cf5);
			cf6 = Map();
			cf6.put("label","Commission ");
			cf6.put("value",input.Commission + "");
			cfList.add(cf6);
			cf7 = Map();
			cf7.put("label","Customer Type");
			cf7.put("value",input.Customer_Type + "");
			cfList.add(cf7);
			cf8 = Map();
			cf8.put("label","Order Type");
			cf8.put("value",input.Order_Type + "");
			cfList.add(cf8);
			cf9 = Map();
			cf9.put("label","Project Type:");
			cf9.put("value",input.Project_Type + "");
			cfList.add(cf9);
			cf10 = Map();
			cf10.put("label","For Bidding? (✓ if yes)");
			cf10.put("value",input.For_Bidding + "");
			cfList.add(cf10);
			cf11 = Map();
			cf11.put("label","Additional discount needed");
			cf11.put("value",input.Addtl_Disc_Needed1 + "");
			cfList.add(cf11);
			cf12 = Map();
			cf12.put("label","Target Delivery Date");
			cf12.put("value",input.target_date + "");
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
			estimateBody.put("expiry_date",input.target_date + "");
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
			newEstID = createResp.get("estimate").get("estimate_id") + "";
			newEstNo = createResp.get("estimate").get("estimate_number") + "";
			allInq2 = Inquiry_Form[Projects == input.Projects || quote_group == input.quote_group];
			for each  inq in allInq2
			{
				recs = Inquiry_Form[INQ_No == inq.INQ_No];
				for each  r in recs
				{
					update r
					[
						Books_Estimate_ID=newEstID
						Books_Estimate_No=newEstNo
						Estimate_Created=true
						Ready_for_Estimates=true
					];
				}
			}
			projRec = Projects[ID == input.Projects];
			for each  p in projRec
			{
				update p
				[
					Books_Estimate_ID=newEstID
					Books_Estimate_No=newEstNo
				];
			}
			success message "Estimate " + newEstNo + " created with " + lineItems.size() + " items";
		}
	}
}

====================================================
NOTES:
- Found live 2026-07-08, shown to Claude to clarify that THIS is the actual native
  "Create Estimates" button in daily use — separate from `create_estimates_button.txt`
  (Trigger_Estimate-gated Inquiry_Form workflow) and separate from the InquiryBtn
  widget's Custom API path (`create_estimate_custom_api.txt`). Three independent
  Books-estimate-creation mechanisms now exist in this app; this NOTES section exists
  to keep them straight, not to imply they should be merged.
- GATE: `Ready_for_Estimates` (the Inquiry Readiness Checklist master flag, see
  `inquiry_check_readiness.txt` / `INQ_Check_Readiness`) — NOT `Trigger_Estimate`. This
  means deleting the `Trigger_Estimate` field (done by user 2026-07-08, "no purpose
  now") does NOT affect this script. It only affects `create_estimates_button.txt`'s
  workflow, which references `input.Trigger_Estimate` directly and needs separate
  checking/disabling if it's still Enabled live.
- CREATE vs UPDATE branch (mirrors create_estimates_button.txt's own logic, same
  project-grouping pattern): if the Project already has a `Books_Estimate_ID`, GET the
  existing estimate then PUT a rebuild (matches existing line_item_ids by item_id,
  filters siblings to `Ready_for_Estimates == true` only); else POST a new estimate
  using only `input`'s own item as the initial line (siblings with `Ready_for_Estimates
  == true` still get merged in immediately in the same create call, unlike the
  Trigger_Estimate version's separate CREATE/UPDATE structure — not independently
  verified against that file's exact behavior, just noting the visible difference).
- Standalone-comment-free, no `//` lines except the block markers this file's own header
  format doesn't use — script itself has none, so the known `//`-miscounts-error-lines
  gotcha doesn't apply here.
- UNTESTED note: relies on `Ready_for_Estimates` being correctly computed by
  `INQ_Check_Readiness` before this button is ever clicked — since that script was only
  just merged onto a Created-or-Edited trigger this same session (previously
  Edited-only), this button's behavior on a genuinely brand-new, never-edited Inquiry
  is part of what still needs a live retest.
====================================================

````
