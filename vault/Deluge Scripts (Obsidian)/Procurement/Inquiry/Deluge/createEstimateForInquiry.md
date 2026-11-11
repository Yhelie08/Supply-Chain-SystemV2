---
title: "createEstimateForInquiry"
source_file: "createEstimateForInquiry"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 434
tags:
  - delivery-management
  - deluge
  - dms
  - inquiry
  - procurement
  - purchase-order
  - zoho-books
---

# createEstimateForInquiry

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `createEstimateForInquiry`
> - **Lines of Code:** 434
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#inquiry`, `#procurement`, `#purchase-order`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
map createEstimateForInquiry(String inqNo)
{
	response = Map();
	recs = Inquiry_Form[INQ_No == inqNo];
	found = false;
	for each  rec in recs
	{
		found = true;
		if(rec.Ready_for_Estimates != true)
		{
			response.put("status","error");
			response.put("message","Ready_for_Estimates must be true first");
			return response;
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
				projEstID = "";
				projEstNo = "";
				staleProjRec = Projects[ID == rec.Projects];
				for each  sp in staleProjRec
				{
					sp.Books_Estimate_ID="";
					sp.Books_Estimate_No="";
				}
			}
		}
		custRecs = Customer[ID == rec.Customer];
		custBookID = "";
		for each  c in custRecs
		{
			custBookID = c.ID1 + "";
		}
		if(custBookID == "null")
		{
			custBookID = "";
		}
		custTypeVal = rec.Customer_Type + "";
		if(custTypeVal == "Enduser")
		{
			custTypeVal = "End User";
		}
		if(custTypeVal == "null")
		{
			custTypeVal = "";
		}
		salesOwnerVal = rec.Sales_Owner + "";
		if(salesOwnerVal == "null")
		{
			salesOwnerVal = "";
		}
		designCompanyVal = rec.Design_Company + "";
		if(designCompanyVal == "null")
		{
			designCompanyVal = "";
		}
		designerArchVal = rec.Designer_Architect + "";
		if(designerArchVal == "null")
		{
			designerArchVal = "";
		}
		designPartnerVal = rec.Design_Partner + "";
		if(designPartnerVal == "null")
		{
			designPartnerVal = "";
		}
		commissionVal = rec.Commission + "";
		if(commissionVal == "null")
		{
			commissionVal = "";
		}
		orderTypeVal = rec.Order_Type + "";
		if(orderTypeVal == "null")
		{
			orderTypeVal = "";
		}
		projectTypeVal = rec.Project_Type + "";
		if(projectTypeVal == "null")
		{
			projectTypeVal = "";
		}
		forBiddingVal = rec.For_Bidding + "";
		if(forBiddingVal == "null")
		{
			forBiddingVal = "";
		}
		addtlDiscVal = rec.Addtl_Disc_Needed1 + "";
		if(addtlDiscVal == "null")
		{
			addtlDiscVal = "";
		}
		targetDateVal = rec.target_date + "";
		if(targetDateVal == "null")
		{
			targetDateVal = "";
		}
		if(projEstID != null && projEstID != "")
		{
			lineItems = List();
			allINQNos = "";
			allInq = Inquiry_Form[quote_group == rec.quote_group];
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
			if(updateResp != null && updateResp.get("code") == 0)
			{
				allInq2 = Inquiry_Form[quote_group == rec.quote_group];
				for each  inq in allInq2
				{
					if(inq.Books_Estimate_ID == null || inq.Books_Estimate_ID == "")
					{
						irecs = Inquiry_Form[INQ_No == inq.INQ_No];
						for each  ir in irecs
						{
							ir.Books_Estimate_ID=projEstID;
							ir.Books_Estimate_No=projEstNo;
							ir.Estimate_Created=true;
						}
					}
				}
				response.put("status","success");
				response.put("message","Estimate updated");
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
			lineItems = List();
			allINQNos = "";
			itemRecs = Items[ID == rec.Items];
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
			lineItem.put("quantity",rec.quantity.toLong());
			lineItem.put("rate",rec.SRP_Approved1.toDecimal());
			lineItems.add(lineItem);
			allINQNos = rec.INQ_No + "";
			allInq = Inquiry_Form[quote_group == rec.quote_group];
			for each  inq in allInq
			{
				if(inq.INQ_No != rec.INQ_No && inq.Ready_for_Estimates == true)
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
			if(createResp != null && createResp.get("code") == 0 && createResp.get("estimate") != null)
			{
				newEstID = createResp.get("estimate").get("estimate_id") + "";
				newEstNo = createResp.get("estimate").get("estimate_number") + "";
				selfRecs = Inquiry_Form[INQ_No == rec.INQ_No];
				for each  sr in selfRecs
				{
					sr.Books_Estimate_ID=newEstID;
					sr.Books_Estimate_No=newEstNo;
					sr.Estimate_Created=true;
				}
				allInq2 = Inquiry_Form[quote_group == rec.quote_group];
				for each  inq in allInq2
				{
					if(inq.INQ_No != rec.INQ_No)
					{
						irecs = Inquiry_Form[INQ_No == inq.INQ_No];
						for each  ir in irecs
						{
							ir.Books_Estimate_ID=newEstID;
							ir.Books_Estimate_No=newEstNo;
							ir.Estimate_Created=true;
						}
					}
				}
				projRec2 = Projects[ID == rec.Projects];
				for each  p2 in projRec2
				{
					p2.Books_Estimate_ID=newEstID;
					p2.Books_Estimate_No=newEstNo;
				}
				response.put("status","success");
				response.put("message","Estimate created");
				response.put("estimateId",newEstID);
				response.put("estimateNo",newEstNo);
			}
			else
			{
				response.put("status","error");
				response.put("message","Books CREATE failed: " + createResp.toString());
			}
		}
		break;
	}
	if(found == false)
	{
		response.put("status","error");
		response.put("message","INQ not found: " + inqNo);
	}
	return response;
}
````
