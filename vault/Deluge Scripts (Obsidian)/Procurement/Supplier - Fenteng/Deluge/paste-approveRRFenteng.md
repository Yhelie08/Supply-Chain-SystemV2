---
title: "paste-approveRRFenteng"
source_file: "paste-approveRRFenteng.txt"
category: "Procurement/Supplier - Fenteng/Deluge"
associated_widget: "[[Procurement/Supplier - Fenteng/Widget/Supplier Portal - Fenteng|Supplier Portal - Fenteng]]"
lines: 42
tags:
  - deluge
  - procurement
  - purchase-order
  - supplier-portal
---

# paste-approveRRFenteng

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Supplier - Fenteng/Widget/Supplier Portal - Fenteng|Supplier Portal - Fenteng]]
> - **Category:** `Procurement/Supplier - Fenteng/Deluge`
> - **Source File:** `paste-approveRRFenteng.txt`
> - **Lines of Code:** 42
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Supplier - Fenteng/Widget/Supplier Portal - Fenteng|Supplier Portal - Fenteng]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
map approveRRFenteng(String rrRecordId, String expectedShipDate, String eta)
{
	response = Map();
	r = Fenteng_Lighting_Replacement_Request[ID == rrRecordId.toLong()];
	if(r == null)
	{
		response.put("status","error");
		response.put("message","Replacement Request not found.");
		return response;
	}
	if(r.RR_Status != "Open")
	{
		response.put("status","error");
		response.put("message","Already approved.");
		return response;
	}
	if(expectedShipDate == null || expectedShipDate == "" || eta == null || eta == "")
	{
		response.put("status","error");
		response.put("message","Expected Ship Date and ETA are both required to approve.");
		return response;
	}

	r.RR_Status = "Acknowledged";
	r.Expected_Ship_Date = expectedShipDate;
	r.ETA = eta;
	r.Supplier_Acknowledgement1 = true;
	r.Supplier_Acknowledge_Date = zoho.currenttime;
	r.Last_Updated = zoho.currenttime;
	update Replacement_Request[RR_No == r.RR_No]
	[
		RR_Status = "Acknowledged"
		Expected_Ship_Date = expectedShipDate
		ETA = eta
		Supplier_Acknowledgement1 = true
		Supplier_Acknowledge_Date = zoho.currenttime
		Last_Updated = zoho.currenttime
	];
	response.put("status","success");
	response.put("message","Replacement Request approved — Expected Ship " + expectedShipDate + ", ETA " + eta + ".");
	return response;
}

````
