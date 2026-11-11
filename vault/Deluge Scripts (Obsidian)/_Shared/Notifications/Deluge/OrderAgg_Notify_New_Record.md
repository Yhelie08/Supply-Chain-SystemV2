---
title: "OrderAgg_Notify_New_Record"
source_file: "Deluge Script/Notification\OrderAgg_Notify_New_Record.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]"
lines: 30
tags:
  - deluge
  - fulfillment
  - notification
  - order-aggregation
---

# OrderAgg_Notify_New_Record

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\OrderAgg_Notify_New_Record.txt`
> - **Lines of Code:** 30
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#order-aggregation`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
OrderAgg_Notify_New_Recor as "OrderAgg_Notify_New_Record"
{
	type =  form
	form = Order_Aggregation1

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					insert into OrderAgg_Notifications
				[
					Recipient_Email="homecartelff@gmail.com"
					Notification_Type="Order Aggregation Record Created"
					Message="New Order Aggregation record — " + input.SO + " (" + input.Customer_Name + "). Click to open it."
					Created_On=zoho.currenttime
					Read=false
					Target_URL="https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Order_Aggregation2?orderAggRecordId=" + input.ID
					Source_Record_No=input.SO
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
