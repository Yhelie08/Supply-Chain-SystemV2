---
title: "notification_urls_ready_to_paste"
source_file: "notification_urls_ready_to_paste.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 804
tags:
  - deluge
  - fulfillment
  - inquiry
  - notification
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - readiness-gate
  - supplier-portal
  - zoho-creator
---

# notification_urls_ready_to_paste

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `notification_urls_ready_to_paste.txt`
> - **Lines of Code:** 804
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#notification`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#readiness-gate`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
NOTIFICATION TARGET_URL FIXES — READY-TO-PASTE (BUONG WORKFLOW, may wrapper na)
=====================================================================
UPDATE 2026-08-06: unang bersyon ng file na ito ay INNER SCRIPT lang ang laman (yung
laman ng "custom deluge script ( ... )" block) — nag-error ito sa Zoho ("Syntax error...
at line number 1") dahil kapag na-delete ang BUONG laman ng editor (kasama ang wrapper:
"WorkflowName as "..." { type=form ... on success { actions { custom deluge script (...) }
} }") at inner script lang ang ipinalit, walang na-iwang valid na workflow declaration.
NAKUMPIRMA NG USER na gumana ang FULL-WRAPPER na bersyon. Ngayon, BUONG workflow na
(kasama wrapper) ang laman ng bawat entry sa baba — I-SELECT-ALL ANG BUONG LAMAN NG
EDITOR (hindi lang yung insert statement), I-DELETE, I-PASTE ANG BUONG BLOCK SA BABA.


[x] 1. Notify_on_Created_Excepti ("Notify on Created Exception") — Form: Exceptions
--------------------------------------------------------------------------------------
Notify_on_Created_Excepti as "Notify on Created Exception"
{
	type =  form
	form = Exceptions

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				insert into App_Notifications
				[
					Recipient_Email="homecartelpacker@gmail.com"
					Notification_Type="Exception"
					Message="A new exception " + input.Exception_No + " was created."
					Created_On=zoho.currenttime
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Exceptions1"
					Source_Record_No=input.Exception_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 2. Notify_Fenteng_on_Purchas ("Notify Fenteng on Purchase Order added") — Form: Fenteng_Lighting_Purchase_Order
--------------------------------------------------------------------------------------
Notify_Fenteng_on_Purchas as "Notify Fenteng on Purchase Order added"
{
	type =  form
	form = Fenteng_Lighting_Purchase_Order

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				targetUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Fenteng_Lighting_PO?fentengpoid=" + input.PO_No_Supplier1;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@Fentenglighting.com"
					Notification_Type="Purchase Order added"
					Message="New purchase order " + input.PO_No_Supplier1 + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.PO_No_Supplier1
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 3. Notify_Fenteng_on_Purchas1 ("Notify Fenteng on Purchase Request added") — Form: Fenteng_Lighting_Purchase_Request
--------------------------------------------------------------------------------------
Notify_Fenteng_on_Purchas1 as "Notify Fenteng on Purchase Request added"
{
	type =  form
	form = Fenteng_Lighting_Purchase_Request

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				targetUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Fenteng_Lighting_PR?fentengprid=" + input.PR_No_Supplier1;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@Fentenglighting.com"
					Notification_Type="Purchase Request added"
					Message="New purchase request " + input.PR_No_Supplier1 + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.PR_No_Supplier1
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 4. Notify_Fenteng_on_Replace ("Notify Fenteng on Replacement Request added") — Form: Fenteng_Lighting_Replacement_Request
--------------------------------------------------------------------------------------
Notify_Fenteng_on_Replace as "Notify Fenteng on Replacement Request added"
{
	type =  form
	form = Fenteng_Lighting_Replacement_Request

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				targetUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Replacement_Request_Fenteng?fentengrrid=" + input.RR_No;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@Fentenglighting.com"
					Notification_Type="Replacement Request added"
					Message="New replacement request " + input.RR_No + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.RR_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 5. Notify_Fenteng_on_Shipmen ("Notify Fenteng on Shipment Added") — Form: Fenteng_Shipment
--------------------------------------------------------------------------------------
Notify_Fenteng_on_Shipmen as "Notify Fenteng on Shipment Added"
{
	type =  form
	form = Fenteng_Shipment

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				targetUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Fenteng_Shipments?fentengshipmentid=" + input.Shipment_No;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@Fentenglighting.com"
					Notification_Type="Shipment added"
					Message="New shipment " + input.Shipment_No + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.Shipment_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 6. Notify_on_supplier_Inquir ("Notify on supplier Inquiry response") — Form: Inquiry_Messages
--------------------------------------------------------------------------------------
Notify_on_supplier_Inquir as "Notify on supplier Inquiry response"
{
	type =  form
	form = Inquiry_Messages

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				if(input.Sender_Role == "Supplier")
				{
					insert into App_Notifications
					[
						Recipient_Email="homecartelpacker@gmail.com"
						Notification_Type="Supplier Inquiry Conversation"
						Message=input.Supplier + " sent a message on " + input.INQ_No + "."
						Created_On=zoho.currenttime
						Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Inquiry"
						Source_Record_No=input.INQ_No
						Source_Record_ID=input.ID
						Added_User=zoho.loginuser
					]
				}
			)
		}
	}

}


[ ] 7. OrderAgg_Notify_New_Recor ("OrderAgg_Notify_New_Record") — Form: Order_Aggregation1
--------------------------------------------------------------------------------------
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
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Order_Aggregation2?orderAggRecordId=" + input.ID
					Source_Record_No=input.SO
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 8. Pack_Notify_New_Record ("Pack_Notify_New_Record") — Form: Pack
--------------------------------------------------------------------------------------
Pack_Notify_New_Record as "Pack_Notify_New_Record"
{
	type =  form
	form = Pack

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				insert into Pack_Notifications
				[
					Recipient_Email="homecartelff@gmail.com"
					Notification_Type="Pack Record Created"
					Message="New item ready for packing — " + input.SO + " (" + input.Item_Name + "). Click to open it."
					Created_On=zoho.currenttime
					Read=false
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Pack1?packRecordId=" + input.ID
					Source_Record_No=input.SO
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 9. Pick1_Notify_New_Record ("Pick1_Notify_New_Record") — Form: Pick1
--------------------------------------------------------------------------------------
Pick1_Notify_New_Record as "Pick1_Notify_New_Record"
{
	type =  form
	form = Pick1

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				insert into Pick_Notifications
				[
					Recipient_Email="homecartelff@gmail.com"
					Notification_Type="Pick Record Created"
					Message="New item ready for picking — " + input.SO + " (" + input.Item_Name + "). Click to open it."
					Created_On=zoho.currenttime
					Read=false
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Pick2?pickRecordId=" + input.ID
					Source_Record_No=input.SO
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 10. Notify_on_Purchase_Reques1 ("Notify on Purchase Request - Add") — Form: Purchase_Request1
--------------------------------------------------------------------------------------
Notify_on_Purchase_Reques1 as "Notify on Purchase Request - Add"
{
	type =  form
	form = Purchase_Request1

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				notifId1 = insert into App_Notifications
				[
					Recipient_Email="hcinvanalyst@gmail.com"
					Notification_Type="Purchase Request added"
					Message="Purchase Request " + input.PR_No + " was added"
					Created_On=zoho.currenttime
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Purchase_Request"
					Source_Record_No=input.PR_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				];
				notifId2 = insert into App_Notifications
				[
					Recipient_Email="homecartelpacker@gmail.com"
					Notification_Type="Purchase Request added"
					Message="Purchase Request " + input.PR_No + " was added"
					Created_On=zoho.currenttime
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Purchase_Request"
					Source_Record_No=input.PR_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				];
			)
		}
	}

}


[ ] 11. Notify_on_Receiving_Compl ("Notify on Receiving Completed") — Form: Receiving
--------------------------------------------------------------------------------------
Notify_on_Receiving_Compl as "Notify on Receiving Completed"
{
	type =  form
	form = Receiving

	record event = on edit

	on success
	{
		actions
		{
			custom deluge script
			(
				if(input.Receive_Status == "Completed")
				{
					insert into App_Notifications
					[
						Recipient_Email="homecartelpacker@gmail.com"
						Notification_Type="Receiving"
						Message="Receiving " + input.Receive_No1 + " has been completed."
						Created_On=zoho.currenttime
						Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Receiving1"
						Source_Record_No=input.Receive_No1
						Source_Record_ID=input.ID
						Added_User=zoho.loginuser
					]
				}
			)
		}
	}

}


[ ] 12. Notify_on_Receiving_Quant ("Notify on Receiving Quantity Mismatch") — Form: Receiving
--------------------------------------------------------------------------------------
Notify_on_Receiving_Quant as "Notify on Receiving Quantity Mismatch"
{
	type =  form
	form = Receiving

	record event = on add or edit

	on success
	{
		actions
		{
			custom deluge script
			(
				if(input.Total_Accepted_Qty != input.Total_Expected_Qty)
				{
					insert into App_Notifications
					[
						Recipient_Email="homecartelpacker@gmail.com"
						Notification_Type="Receiving Quantity Mismatch"
						Message="Received quantity for " + input.Receive_No1 + " does not match expected quantity."
						Created_On=zoho.currenttime
						Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Receiving1"
						Source_Record_No=input.Receive_No1
						Source_Record_ID=input.ID
						Added_User=zoho.loginuser
					]
				}
			)
		}
	}

}


[ ] -- WALANG KAILANGAN AYUSIN -- Notify_Tony_on_Inquiry_ad ("Notify Tony on Inquiry added") — Form: Supplier_2
--------------------------------------------------------------------------------------
TAMA NA ITO, huwag nang galawin — tamang Production URL na ang page_base_url dito.


[ ] 13. Notify_Tony_on_Purchase_O ("Notify Tony on Purchase Order added") — Form: Tony_Fan_Purchase_Order
--------------------------------------------------------------------------------------
Notify_Tony_on_Purchase_O as "Notify Tony on Purchase Order added"
{
	type =  form
	form = Tony_Fan_Purchase_Order

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
				ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
				deep_link_token = "PO-" + input.ID + "-" + ts;
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="Purchase Order added"
					Message="A new purchase order " + input.PO_No_Supplier2 + " was added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=page_base_url + "/#Page:Tony_Fan_PO?tonypoid=" + deep_link_token
					Source_Record_No=input.PO_No_Supplier2
					Source_Record_ID=input.ID
					Deep_Link_Token=deep_link_token
					Added_User=zoho.loginuser
				]
				sendmail
				[
					from :zoho.adminuserid
					to :"184319330@qq.com"
					cc:""
					bcc :""
					reply to :zoho.adminuserid
					subject :"Purchase Order added"
					message :"A new purchase order has been added in your portal."
					content type :Plain Text
				]
			)
		}
	}

}


[ ] 14. Notify_Tony_on_Purchase_R ("Notify Tony on Purchase Request added") — Form: Tony_Fan_Purchase_Request
--------------------------------------------------------------------------------------
Notify_Tony_on_Purchase_R as "Notify Tony on Purchase Request added"
{
	type =  form
	form = Tony_Fan_Purchase_Request

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
				ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
				deep_link_token = "PR-" + input.ID + "-" + ts;
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="Purchase Request added"
					Message="A new purchase request " + input.PR_No_Supplier2 + " was added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=page_base_url + "/#Page:Tony_Fan_PR?tonyprid=" + deep_link_token
					Source_Record_No=input.PR_No_Supplier2
					Source_Record_ID=input.ID
					Deep_Link_Token=deep_link_token
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[ ] 15. Notify_Tony_on_Replacemen ("Notify Tony on Replacement Request Added") — Form: Tony_Fan_Replacement_Request
--------------------------------------------------------------------------------------
Notify_Tony_on_Replacemen as "Notify Tony on Replacement Request Added"
{
	type =  form
	form = Tony_Fan_Replacement_Request

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
				ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
				deep_link_token = "RR-" + input.ID + "-" + ts;
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="Replacement Request added"
					Message="A new replacement request " + input.RR_No + " was added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=page_base_url + "/#Page:Replacement_Request_Tony?tonyrrid=" + deep_link_token
					Source_Record_No=input.RR_No
					Source_Record_ID=input.ID
					Deep_Link_Token=deep_link_token
					Added_User=zoho.loginuser
				]
				sendmail
				[
					from :zoho.adminuserid
					to :"184319330@qq.com"
					cc:""
					bcc :""
					reply to :zoho.adminuserid
					subject :"Replacement Request added"
					message :"A new replacement request has been added in your portal."
					content type :Plain Text
				]
			)
		}
	}

}


[ ] 16. Notify_Tony_on_Shipment_a ("Notify Tony on Shipment added") — Form: Tony_Shipment
--------------------------------------------------------------------------------------
Notify_Tony_on_Shipment_a as "Notify Tony on Shipment added"
{
	type =  form
	form = Tony_Shipment

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
				ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
				deep_link_token = "SHP-" + input.ID + "-" + ts;
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="Shipment added"
					Message="Shipment " + input.Shipment_No + " was added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=page_base_url + "/#Page:Tony_Shipments?tonyshipmentid=" + deep_link_token
					Source_Record_No=input.Shipment_No
					Source_Record_ID=input.ID
					Deep_Link_Token=deep_link_token
					Added_User=zoho.loginuser
				]
				sendmail
				[
					from :zoho.adminuserid
					to :"184319330@qq.com"
					cc:""
					bcc :""
					reply to :zoho.adminuserid
					subject :"Shipment added"
					message :"A new shipment has been added in your portal."
					content type :Plain Text
				]
			)
		}
	}

}


[x] 17. checker_checklist_qc_approved_sync.txt — ExceptionControl_Notifications (5
        occurrences) — NA-FIX NA sa local file (ibang mekanismo ito, Zoho FORM workflow
        na naka-store sa local .txt, hindi kailangan ng full-wrapper paste dito, i-paste
        na lang ang buong laman ng file sa Checker_Checklist workflow gaya ng dati).


[ ] 18. Notify_on_PR_supplier_rep ("Notify on PR supplier reply") — Form: PR_Messages
--------------------------------------------------------------------------------------
Notify_on_PR_supplier_rep as "Notify on PR supplier reply"
{
	type =  form
	form = PR_Messages

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				if(input.Sender_Role == "Supplier")
				{
					insert into App_Notifications
					[
						Recipient_Email="hcinvanalyst@gmail.com"
						Notification_Type="Supplier Purchase Request Conversation"
						Message=input.Supplier + " sent a message on " + input.PR_No + "."
						Created_On=zoho.currenttime
						Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Purchase_Request"
						Source_Record_No=input.PR_No
						Source_Record_ID=input.ID
						Added_User=zoho.loginuser
					]
					insert into App_Notifications
					[
						Recipient_Email="homecartelpacker@gmail.com"
						Notification_Type="Supplier Purchase Request Conversation"
						Message=input.Supplier + " sent a message on " + input.PR_No + "."
						Created_On=zoho.currenttime
						Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Purchase_Request"
						Source_Record_No=input.PR_No
						Source_Record_ID=input.ID
						Added_User=zoho.loginuser
					]
				}
			)
		}
	}

}


[ ] 19. PreOrderFF_Notify_New_Rec ("PreOrderFF_Notify_New_Record") — Form: Pre_Order_FF
--------------------------------------------------------------------------------------
PreOrderFF_Notify_New_Rec as "PreOrderFF_Notify_New_Record"
{
	type =  form
	form = Pre_Order_FF

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				insert into PreOrder_Notifications
				[
					Recipient_Email="homecartelff@gmail.com"
					Notification_Type="Pre-Order Record Created"
					Message="New Pre-Order record — " + input.SO + " (" + input.Item_Name + "). Click to open it."
					Created_On=zoho.currenttime
					Read=false
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Pre_Order2?preOrderRecordId=" + input.ID
					Source_Record_No=input.SO
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[x] 20. SO_Notify_New_Record — Notification_Type "SO Record Created" — Form: Sales_Order_Fulfillment
--------------------------------------------------------------------------------------
FOUND 2026-09-05, per user report (screenshot, SO Report widget's own notification
bell) — still showing "SO Record Created" notifications with a dev URL. Never located
in a prior session (see the old PENDING note this replaced). CONFIRMED same day — user
pasted back the REAL live script content, which matched this file's own reconstruction
almost exactly (workflow name/shape/page/param all correct) except the Message field
really reads `input.PR_No`, not `input.Customer` as first guessed — the blank "()"
seen live is simply a genuinely-blank PR_No on that record (SO_No has no PR yet), not a
stringification bug. Only Target_URL needed changing — same environment/development
fix as every other entry in this file.

SO_Notify_New_Record as "SO_Notify_New_Record"
{
	type =  form
	form = Sales_Order_Fulfillment

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				insert into SO_Notifications
				[
					Recipient_Email="homecartelff@gmail.com"
					Notification_Type="SO Record Created"
					Message="New Sales Order Fulfillment record — " + input.SO_No + " (" + input.PR_No + "). Click to open it."
					Created_On=zoho.currenttime
					Read=false
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:SOR?soRecordId=" + input.ID
					Source_Record_No=input.SO_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}


[x] 21. ReadinessGate_Notify_New_Record — Notification_Type "Readiness Gate Record Created" — Form: Sales_Order_Readiness_Gate
--------------------------------------------------------------------------------------
FIXED 2026-09-05, per user (opened this exact live inner-script content directly, same
pattern as item #20 — pasted at root as `ReadinessGate_Notify_New_Record`, no wrapper,
same "inner content only, breadcrumb already scopes form/trigger/event" native-form
action-editor shape). Only Target_URL changed, dev -> production.

insert into ReadinessGate_Notifications
[
	Recipient_Email="homecartelff@gmail.com"
	Notification_Type="Readiness Gate Record Created"
	Message="New Sales Order Readiness Gate record — " + input.sales_order_number + " (" + input.Item_Name + "). Click to open it."
	Created_On=zoho.currenttime
	Read=false
	Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Order_Readiness1?readinessGateRecordId=" + input.ID
	Source_Record_No=input.sales_order_number
	Source_Record_ID=input.ID
	Added_User=zoho.loginuser
]


[x] 22. QC_Notify_New_Record — Notification_Type "QC Record Created" — Form: Checker_Checklist (assumed, matches Quality_Check page)
--------------------------------------------------------------------------------------
FIXED 2026-09-05, per user (same pattern as items #20/#21 — opened the live inner-script
content directly at root as `QC_Notify_New_Record`). Only Target_URL changed, dev ->
production.

insert into QC_Notifications
[
	Recipient_Email="homecartelff@gmail.com"
	Notification_Type="QC Record Created"
	Message="New QC record for review — " + input.SO + " (" + input.Item_Name + "). Click to open it."
	Created_On=zoho.currenttime
	Read=false
	Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Quality_Check?qcRecordId=" + input.ID
	Source_Record_No=input.SO
	Source_Record_ID=input.ID
	Added_User=zoho.loginuser
]


HINDI PA NAKITA/PENDING:
[ ] Notify_Suppliers_on_Inqui ("Notify Suppliers on Inquiry Added", form Inquiry_Form) —
    NAKA-INACTIVE, may hiwalay na bug pa — huwag i-activate/ayusin muna

````
