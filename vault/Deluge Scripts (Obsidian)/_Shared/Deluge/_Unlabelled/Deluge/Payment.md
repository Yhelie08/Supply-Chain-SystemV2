---
title: "Payment"
source_file: "Payment"
category: "_Shared/Deluge/_Unlabelled/Deluge"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 351
tags:
  - deluge
  - fulfillment
  - order-aggregation
  - pack
  - procurement
  - purchase-order
  - readiness-gate
  - zoho-books
  - zoho-creator
---

# Payment

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `_Shared/Deluge/_Unlabelled/Deluge`
> - **Source File:** `Payment`
> - **Lines of Code:** 351
> - **Tags:** `#deluge`, `#fulfillment`, `#order-aggregation`, `#pack`, `#procurement`, `#purchase-order`, `#readiness-gate`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge

owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
config = Map();
invId = invoice.get("invoice_id") + "";
info "raw invoice trigger map: " + invoice;
info "invId resolved to: [" + invId + "]";
// ===== INVOICE DETAIL FETCH (para sa custom_fields/cf_paid AT sa SO linkage — muling
// kinukuha para sa reliability, parehong pattern gaya ng so_fulfillment_sync.txt) =====
invResp = zoho.books.getRecordsByID("invoices",orgId,invId);
invRec = invResp.get("invoice");
info "invoice detail fetch response: " + invResp;
if(invRec == null)
{
	info "Walang nakuhang invoice detail para sa invoice_id " + invId + " — tumigil.";
	return;
}
// ===== TEST GATE: WALA SA SCRIPT — nasa Workflow Rule CONDITION na mismo sa Zoho Books
// (parehong paraan ng pag-trigger gaya ng so_fulfillment_sync.txt, na walang in-script
// gate/test-check kahit anong uri). Tingnan ang Step 2 sa PAANO I-SETUP sa itaas. =====
// ===== KUNIN ANG CF_PAID VALUE =====
paidValRaw = "";
invCF = invRec.get("custom_fields");
for each  cf in invCF
{
	if(cf.get("api_name") + "" == "cf_paid")
	{
		paidValRaw = cf.get("value") + "";
	}
}
info "cf_paid value ng invoice na ito: [" + paidValRaw + "]";
// ===== HANAPIN ANG SO NA PINAGMULAN — SUBUKAN MUNA ANG DIRECT FIELDS SA INVOICE DETAIL.
// Kung mali ang hula sa field name, makikita ito sa "invoice detail fetch response" log
// sa itaas — i-adjust dito kung kailangan. =====
soId = invRec.get("salesorder_id") + "";
soNumber = invRec.get("salesorder_number") + "";
info "unang subok — soId: [" + soId + "] soNumber: [" + soNumber + "]";
if((soId == "" || soId == "null") && invRec.get("line_items") != null)
{
	// Fallback: baka nasa loob ng isang line item ang salesorder_id.
	for each  li in invRec.get("line_items")
	{
		liSoId = li.get("salesorder_id") + "";
		if(liSoId != "" && liSoId != "null" && soId == "")
		{
			soId = liSoId;
		}
	}
	info "fallback mula sa line_items — soId: [" + soId + "]";
}
if((soNumber == "" || soNumber == "null") && soId != "" && soId != "null")
{
	soDetailResp = zoho.books.getRecordsByID("salesorders",orgId,soId);
	soDetailRec = soDetailResp.get("salesorder");
	if(soDetailRec != null)
	{
		soNumber = soDetailRec.get("salesorder_number") + "";
	}
	info "kinuha ang soNumber via soId lookup: [" + soNumber + "]";
}
if(soNumber == "" || soNumber == "null")
{
	info "HINDI NA-RESOLVE ang Sales Order number mula sa invoice_id " + invId + " — walang ma-uupdate na Sales_Order_Fulfillment record. Tingnan ang 'invoice detail fetch response' log sa itaas, hanapin kung anong field talaga ang nagdadala ng SO link, at i-adjust ang script.";
	return;
}
// ===== KUNIN ULIT ANG BUONG SO DETAIL PARA SA LAHAT NG INVOICES NITO (aggregation —
// hindi lang batay dito sa isang invoice na nag-trigger; posibleng may 2+ invoice ang
// isang SO). Parehong PAYMENT STATUS aggregation algorithm gaya ng so_fulfillment_sync.txt =====
soId2 = soId;
if(soId2 == "" || soId2 == "null")
{
	soListResp = invokeurl
	[
		url :"https://www.zohoapis.com/books/v3/salesorders?organization_id=" + orgId + "&salesorder_number=" + soNumber
		type :GET
		connection:"zhbooks_fullaccessall"
	];
	info "salesorders list search (by number) response: " + soListResp;
	soListData = soListResp.get("salesorders");
	if(soListData != null)
	{
		for each  soListRec in soListData
		{
			if(soId2 == "")
			{
				soId2 = soListRec.get("salesorder_id") + "";
			}
		}
	}
}
soInvoicePaidValues = List();
if(soId2 != "" && soId2 != "null")
{
	soFullResp = zoho.books.getRecordsByID("salesorders",orgId,soId2);
	soFullRec = soFullResp.get("salesorder");
	if(soFullRec != null)
	{
		soInvoicesList = soFullRec.get("invoices");
		if(soInvoicesList != null)
		{
			for each  siv in soInvoicesList
			{
				sivId = siv.get("invoice_id") + "";
				sivStatus = siv.get("status") + "";
				if(sivStatus == "void")
				{
					continue;
				}
				sivResp = zoho.books.getRecordsByID("invoices",orgId,sivId);
				sivRec = sivResp.get("invoice");
				if(sivRec != null)
				{
					sivCF = sivRec.get("custom_fields");
					for each  cf2 in sivCF
					{
						if(cf2.get("api_name") + "" == "cf_paid")
						{
							soInvoicePaidValues.add(cf2.get("value") + "");
						}
					}
				}
			}
		}
	}
}
else
{
	// Wala talagang nahanap na soId — gamitin na lang ang cf_paid ng ISANG invoice na
	// ito bilang huling fallback, para hindi lang basta mag-fail nang walang update.
	if(paidValRaw != "")
	{
		soInvoicePaidValues.add(paidValRaw);
	}
	info "Hindi nahanap ang Books salesorder_id ng SO " + soNumber + " — one-invoice fallback na lang, hindi na-aggregate sa lahat ng invoice ng SO na ito.";
}
paymentStatus = "No";
hasPartial = false;
hasYes = false;
hasNo = false;
for each  paidVal in soInvoicePaidValues
{
	if(paidVal == "Partial")
	{
		hasPartial = true;
	}
	else if(paidVal == "Yes")
	{
		hasYes = true;
	}
	else if(paidVal == "No")
	{
		hasNo = true;
	}
}
if(hasPartial || hasYes && hasNo)
{
	paymentStatus = "Partial";
}
else if(hasYes)
{
	paymentStatus = "Yes";
}
info "Aggregated payment status para sa SO " + soNumber + ": " + paymentStatus + " (mula sa " + soInvoicePaidValues.size() + " non-void invoice value(s): " + soInvoicePaidValues + ")";
// ===== UPDATE LAHAT ng Sales_Order_Fulfillment records ng SO na ito (isang record per
// item — Creator REST API dahil Books custom function ito, hindi native Creator script,
// kaya HINDI puwede ang Form[criteria]/update na syntax dito) =====
// FIXED 2026-08-05 (v2) — nakumpirma sa Execution Result log na ang dating raw `invokeurl`
// GET papunta sa Creator cross-app REST endpoint ay nag-eerror ng generic/undocumented
// "code":2930 "Error Occurred. We are sorry for the inconvenience." (HINDI "walang record",
// totoong API-level failure ito) — kilalang isyu ang raw invokeurl papunta sa Creator v2.1
// REST endpoint mula sa loob ng Books custom function. Pinalitan ng NATIVE
// `zoho.creator.v2_1.getRecords` task (parehong opisyal/supported na paraan gaya ng
// `updateRecordById` na ginagamit na sa ibaba nito) — mas maaasahan, walang manual URL
// encoding ng criteria.
// FIXED 2026-08-05 (v3) — pareho pa ring nag-e-error ng generic "code":2930 kahit gamit
// na ang native getRecords task (v2), at kahit EKSAKTONG parehong criteria/URL format ang
// ginamit gaya ng confirmed-working query sa syncpackagetofulfillment.txt. Ibig sabihin
// hindi na code/syntax issue ito — base sa mga report ng ibang users sa Zoho Community,
// ang "2930 Error Occurred" ay isang generic, hindi-dokumentado, at madalas PANSAMANTALANG
// (intermittent) na error sa Zoho backend mismo, na kadalasang nawawala kapag sinubukan
// ulit. Dinagdagan ng isang RETRY (subukan ulit isang beses kapag hindi "code":3000 ang
// nabalik) bilang mitigation.
getParams = Map();
getParams.put("criteria","SO_No == \"" + soNumber + "\"");
getParams.put("field_config","all");
existingSOFResp = zoho.creator.v2_1.getRecords(owner,app,"Sales_Order_Fulfillment_Report",getParams,"supply_chain_app");
info "existingSOFResp raw response para sa SO " + soNumber + ": " + existingSOFResp;
// FIXED 2026-08-05: kapag tumatawag ng zoho.creator.v2_1.getRecords MULA SA LOOB ng isang
// BOOKS custom function (cross-app call), ang tunay na resulta ay NAKA-WRAP ng isa pang
// antas sa loob ng isang "response" key — {"response":{"code":3000,"data":[...]}} — hindi
// flat {"code":3000,"data":[...]} kagaya ng inaakala dati. Kaya lagi/palaging "null" ang
// nababalik sa .get("code")/.get("data") direkta kahit tama at may laman ang response —
// napagkamalang error/walang record kahit totoong nakita. Sini-check dito ang parehong
// hugis (may "response" wrapper o wala) para hindi umasa sa isang hulaan lang.
sofCode = existingSOFResp.get("code");
sofData = existingSOFResp.get("data");
if(existingSOFResp.get("response") != null)
{
	sofCode = existingSOFResp.get("response").get("code");
	sofData = existingSOFResp.get("response").get("data");
}
if(sofCode != 3000)
{
	info "Nag-error ang unang subok (code " + sofCode + ") — malamang pansamantalang Zoho backend hiccup. Susubukan ulit isang beses.";
	existingSOFResp = zoho.creator.v2_1.getRecords(owner,app,"Sales_Order_Fulfillment_Report",getParams,"supply_chain_app");
	info "existingSOFResp retry response para sa SO " + soNumber + ": " + existingSOFResp;
	sofCode = existingSOFResp.get("code");
	sofData = existingSOFResp.get("data");
	if(existingSOFResp.get("response") != null)
	{
		sofCode = existingSOFResp.get("response").get("code");
		sofData = existingSOFResp.get("response").get("data");
	}
}
updatedCount = 0;
if(sofData == null || sofData.size() == 0)
{
	info "WALANG NAHANAP na Sales_Order_Fulfillment record para sa SO " + soNumber + " — hindi dahil sa script na ito, ibig sabihin hindi pa nagagawa ang SOF record para sa SO na ito noong una (check so_fulfillment_sync.txt / Books Workflow Rule nito kung TALAGA itong tumakbo para sa SO na ito).";
}
if(sofData != null)
{
	for each  sofRec in sofData
	{
		sofId = sofRec.get("ID") + "";
		currentStatus = sofRec.get("Status") + "";
		if(currentStatus != paymentStatus)
		{
			updateData = Map();
			updateData.put("Status",paymentStatus);
			// FIXED: "zoho.creator.v2_1.updateRecord" ay HINDI totoong task — ang tamang
			// pangalan ay "updateRecordById", AT ang ikatlong parameter ay ang REPORT link
			// name (hindi ang form link name) — "Sales_Order_Fulfillment_Report", parehong
			// report na ginagamit na sa GET queries sa itaas ng file na ito. Confirmed via
			// official docs: zoho.com/deluge/help/update-record-by-id-v2.1.html
			updateResp = zoho.creator.v2_1.updateRecordById(owner,app,"Sales_Order_Fulfillment_Report",sofId,updateData,config,"supply_chain_app");
			info "Update response para sa Sales_Order_Fulfillment record " + sofId + ": " + updateResp;
			updatedCount = updatedCount + 1;
		}
	}
}
info "Na-update ang Status ng " + updatedCount + " Sales_Order_Fulfillment record(s) para sa SO " + soNumber + " tungong " + paymentStatus + ".";
// ===== ADDED 2026-08-05 — same aggregated paymentStatus, now also pushed onto
// Pre_Order1_Report (field "Status", matched by "SO") and
// Sales_Order_Readiness_Gate_Report (field "payment_status", matched by
// "sales_order_number") — same GET-then-conditional-updateRecordById pattern as the
// Sales_Order_Fulfillment_Report block above, same retry-once-on-error mitigation for
// the same known-intermittent Books-side "code":2930 issue. Writing directly to the
// real Creator record is also what makes this show up on the native form automatically
// — no separate native-side change needed, the widget/native form both read the same
// record this script updates. =====
// ----- Pre_Order1_Report -----
getParamsPO = Map();
getParamsPO.put("criteria","SO == \"" + soNumber + "\"");
getParamsPO.put("field_config","all");
existingPOResp = zoho.creator.v2_1.getRecords(owner,app,"Pre_Order1_Report",getParamsPO,"supply_chain_app");
info "existingPOResp raw response para sa SO " + soNumber + ": " + existingPOResp;
// FIXED 2026-08-05: parehong "response" wrapper gotcha — tingnan ang malaking komento sa
// itaas ng SOF block para sa buong paliwanag.
poCode = existingPOResp.get("code");
poData = existingPOResp.get("data");
if(existingPOResp.get("response") != null)
{
	poCode = existingPOResp.get("response").get("code");
	poData = existingPOResp.get("response").get("data");
}
if(poCode != 3000)
{
	info "Nag-error ang unang subok sa Pre_Order1_Report (code " + poCode + ") — susubukan ulit isang beses.";
	existingPOResp = zoho.creator.v2_1.getRecords(owner,app,"Pre_Order1_Report",getParamsPO,"supply_chain_app");
	info "existingPOResp retry response para sa SO " + soNumber + ": " + existingPOResp;
	poCode = existingPOResp.get("code");
	poData = existingPOResp.get("data");
	if(existingPOResp.get("response") != null)
	{
		poCode = existingPOResp.get("response").get("code");
		poData = existingPOResp.get("response").get("data");
	}
}
updatedCountPO = 0;
if(poData == null || poData.size() == 0)
{
	info "WALANG NAHANAP na Pre_Order1_Report record para sa SO " + soNumber + ".";
}
if(poData != null)
{
	for each  poRec in poData
	{
		poId = poRec.get("ID") + "";
		currentPOStatus = poRec.get("Status") + "";
		if(currentPOStatus != paymentStatus)
		{
			updateDataPO = Map();
			updateDataPO.put("Status",paymentStatus);
			updateRespPO = zoho.creator.v2_1.updateRecordById(owner,app,"Pre_Order1_Report",poId,updateDataPO,config,"supply_chain_app");
			info "Update response para sa Pre_Order1_Report record " + poId + ": " + updateRespPO;
			updatedCountPO = updatedCountPO + 1;
		}
	}
}
info "Na-update ang Status ng " + updatedCountPO + " Pre_Order1_Report record(s) para sa SO " + soNumber + " tungong " + paymentStatus + ".";
// ----- Sales_Order_Readiness_Gate_Report -----
getParamsRG = Map();
getParamsRG.put("criteria","sales_order_number == \"" + soNumber + "\"");
getParamsRG.put("field_config","all");
existingRGResp = zoho.creator.v2_1.getRecords(owner,app,"Sales_Order_Readiness_Gate_Report",getParamsRG,"supply_chain_app");
info "existingRGResp raw response para sa SO " + soNumber + ": " + existingRGResp;
// FIXED 2026-08-05: parehong "response" wrapper gotcha — tingnan ang malaking komento sa
// itaas ng SOF block para sa buong paliwanag.
rgCode = existingRGResp.get("code");
rgData = existingRGResp.get("data");
if(existingRGResp.get("response") != null)
{
	rgCode = existingRGResp.get("response").get("code");
	rgData = existingRGResp.get("response").get("data");
}
if(rgCode != 3000)
{
	info "Nag-error ang unang subok sa Sales_Order_Readiness_Gate_Report (code " + rgCode + ") — susubukan ulit isang beses.";
	existingRGResp = zoho.creator.v2_1.getRecords(owner,app,"Sales_Order_Readiness_Gate_Report",getParamsRG,"supply_chain_app");
	info "existingRGResp retry response para sa SO " + soNumber + ": " + existingRGResp;
	rgCode = existingRGResp.get("code");
	rgData = existingRGResp.get("data");
	if(existingRGResp.get("response") != null)
	{
		rgCode = existingRGResp.get("response").get("code");
		rgData = existingRGResp.get("response").get("data");
	}
}
updatedCountRG = 0;
if(rgData == null || rgData.size() == 0)
{
	info "WALANG NAHANAP na Sales_Order_Readiness_Gate_Report record para sa SO " + soNumber + ".";
}
if(rgData != null)
{
	for each  rgRec in rgData
	{
		rgId = rgRec.get("ID") + "";
		currentRGStatus = rgRec.get("payment_status") + "";
		if(currentRGStatus != paymentStatus)
		{
			updateDataRG = Map();
			updateDataRG.put("payment_status",paymentStatus);
			updateRespRG = zoho.creator.v2_1.updateRecordById(owner,app,"Sales_Order_Readiness_Gate_Report",rgId,updateDataRG,config,"supply_chain_app");
			info "Update response para sa Sales_Order_Readiness_Gate_Report record " + rgId + ": " + updateRespRG;
			updatedCountRG = updatedCountRG + 1;
		}
	}
}
info "Na-update ang payment_status ng " + updatedCountRG + " Sales_Order_Readiness_Gate_Report record(s) para sa SO " + soNumber + " tungong " + paymentStatus + ".";

````
