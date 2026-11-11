---
title: "invoice_payment_status_to_so_fulfillment_sync"
source_file: "invoice_payment_status_to_so_fulfillment_sync.txt"
category: "Fulfillment/SO Report/Deluge"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 474
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - readiness-gate
  - zoho-books
  - zoho-creator
---

# invoice_payment_status_to_so_fulfillment_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `Fulfillment/SO Report/Deluge`
> - **Source File:** `invoice_payment_status_to_so_fulfillment_sync.txt`
> - **Lines of Code:** 474
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#readiness-gate`, `#zoho-books`, `#zoho-creator`

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
// ===== INVOICE DETAIL FETCH (para sa REAL invoice status AT sa SO linkage — muling
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
// ===== CHANGED 2026-08-28, per user request ("sa Invoice payment status dapat natin
// kukunin yun") + live evidence (SO-16567/INV-16668's Execution Log same day): the
// manual "cf_paid" custom field dropdown can sit stale/wrong (that invoice was
// genuinely Books-status "paid", balance ₱0, while cf_paid was still "No" — staff
// simply never flipped the dropdown) — SO-14889's live "Payment Status: Pending" bug
// (user screenshot) is the same root cause. Switched to Books' own real, accounting-
// driven invoice "status" field instead (confirmed via Zoho Books API docs — Invoices
// > status: sent/draft/overdue/paid/void/unpaid/partially_paid/viewed) — this can
// never drift out of sync with actual payment the way a manual dropdown can. Mapped
// to this app's existing Yes/No/Partial Payment Status picklist: paid->Yes,
// partially_paid->Partial, void->excluded (not counted at all, same as before),
// everything else (draft/sent/overdue/unpaid/viewed)->No. cf_paid is no longer read
// anywhere in this file — kept the "paidValRaw" variable name unchanged below so the
// one-invoice fallback branch further down didn't need touching.
paidValRaw = "";
invStatusRaw = invRec.get("status") + "";
if(invStatusRaw == "paid")
{
	paidValRaw = "Yes";
}
else if(invStatusRaw == "partially_paid")
{
	paidValRaw = "Partial";
}
else if(invStatusRaw == "void")
{
	paidValRaw = "";
	// hindi dapat mabilang — parehong panuntunan gaya ng void invoices sa ibaba
}
else
{
	paidValRaw = "No";
}
info "Invoice status ng invoice na ito: [" + invStatusRaw + "] -> mapped Payment Status: [" + paidValRaw + "]";
// ===== ADDED 2026-09-03, per direct user request — kung ang invoice ay may TUNAY na
// credit Terms (Net 15/30/45/60, hindi "Due on Receipt"), hindi dapat kailangan pa ng
// manual "Approve Dispatch" override sa Order Readiness bago maka-release ang item na
// ito kahit hindi pa Yes ang payment_status — inaasahan talaga na hindi pa bayad kapag
// may agreed credit terms, hindi ito red flag. Books' own "payment_terms" field ay
// NUMBER OF DAYS (0 = Due on Receipt, 15/30/45/60 = Net 15/30/45/60) — hindi ito
// ginagamit kahit saan pa sa file na ito bago ito, kaya walang existing pattern na
// susundan; sinundan na lang ang parehong "invoice detail" na fetch (invRec) na
// ginagamit na ng buong file para sa status. Nakasulat sa bagong field na Has_Credit_
// Terms sa Sales_Order_Readiness_Gate LANG (hindi sa Sales_Order_Fulfillment o
// Pre_Order1_Report) — doon lang kasi mismo ginagamit ang bypass na ito (Order
// Readiness widget's own "Approve Dispatch" queue). =====
paymentTermsDaysRaw = invRec.get("payment_terms") + "";
hasCreditTermsVal = false;
if(paymentTermsDaysRaw != "" && paymentTermsDaysRaw != "null" && paymentTermsDaysRaw != "0")
{
	hasCreditTermsVal = true;
}
info "Payment terms (days) ng invoice na ito: [" + paymentTermsDaysRaw + "] -> Has_Credit_Terms: [" + hasCreditTermsVal + "]";
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
					// CHANGED 2026-08-28 — same real-status switch as invStatusRaw above,
					// applied here too so aggregation across a SO's multiple invoices is
					// consistent (both paths used to read cf_paid, now both read the real
					// Books "status" field).
					sivStatusRaw = sivRec.get("status") + "";
					if(sivStatusRaw == "paid")
					{
						soInvoicePaidValues.add("Yes");
					}
					else if(sivStatusRaw == "partially_paid")
					{
						soInvoicePaidValues.add("Partial");
					}
					else if(sivStatusRaw == "void")
					{
						// hindi dapat mabilang — sana hindi na ito maabot dahil na-skip na
						// ang void sa itaas base sa siv.get("status") mula sa SO's own list,
						// pero sinisigurado pa rin dito kung sakaling naiba ang status sa
						// pagitan ng dalawang fetch na ito.
					}
					else
					{
						soInvoicePaidValues.add("No");
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
// FIXED 2026-09-03, real bug found live (SO-16457, Piper | Wall Light record ID
// 4662244000015176970) — updatedCount used to increment unconditionally the moment
// an update was ATTEMPTED, regardless of whether zoho.creator.v2_1.updateRecordById
// actually succeeded. That record's own update came back code:3001 "Failed to
// update data" while its 5 sibling records (same SO, same {Status: paymentStatus}
// payload shape) all succeeded with code:3000 — but the old summary line still
// claimed "Na-update ang Status ng 6 record(s)", silently absorbing the one real
// failure into a falsely-reassuring count. Now tracks successes and failures
// separately, and lists which record IDs actually failed so a stuck record like
// this one doesn't go unnoticed again. Same fix applied to all 3 update blocks in
// this file (SOF/Pre_Order1_Report/Readiness Gate below) — does NOT fix WHY that
// one record's update was rejected (Zoho's own code:3001 gives no field-level
// detail) — still needs checking the native Sales_Order_Fulfillment record for
// that ID directly in Zoho Creator's form editor for a validation error on some
// OTHER field, since a server-side field validation failing on ANY field blocks
// an update to EVERY field, not just the one being changed.
failedCount = 0;
failedIds = List();
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
			if(updateResp != null && updateResp.get("code") == 3000)
			{
				updatedCount = updatedCount + 1;
			}
			else
			{
				failedCount = failedCount + 1;
				failedIds.add(sofId);
			}
		}
	}
}
info "Na-update ang Status ng " + updatedCount + " Sales_Order_Fulfillment record(s) para sa SO " + soNumber + " tungong " + paymentStatus + ".";
if(failedCount > 0)
{
	info "BABALA: " + failedCount + " Sales_Order_Fulfillment record(s) para sa SO " + soNumber + " ang NABIGONG i-update tungong " + paymentStatus + " — record ID(s): " + failedIds + ". Suriin ang mismong native record na ito sa Zoho Creator para sa possible validation error sa ibang field.";
}
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
// FIXED 2026-09-03 — same success-vs-attempt counting bug as the SOF block above.
failedCountPO = 0;
failedIdsPO = List();
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
			if(updateRespPO != null && updateRespPO.get("code") == 3000)
			{
				updatedCountPO = updatedCountPO + 1;
			}
			else
			{
				failedCountPO = failedCountPO + 1;
				failedIdsPO.add(poId);
			}
		}
	}
}
info "Na-update ang Status ng " + updatedCountPO + " Pre_Order1_Report record(s) para sa SO " + soNumber + " tungong " + paymentStatus + ".";
if(failedCountPO > 0)
{
	info "BABALA: " + failedCountPO + " Pre_Order1_Report record(s) para sa SO " + soNumber + " ang NABIGONG i-update tungong " + paymentStatus + " — record ID(s): " + failedIdsPO + ".";
}
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
// FIXED 2026-09-03 — same success-vs-attempt counting bug as the SOF block above.
failedCountRG = 0;
failedIdsRG = List();
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
		// ADDED 2026-09-03 — see hasCreditTermsVal's own comment above. Compared as a
		// string (both sides) since a Zoho Creator checkbox field's raw GET value
		// comes back as the string "true"/"false", not a real boolean.
		currentRGHasCreditTerms = rgRec.get("Has_Credit_Terms") + "";
		if(currentRGStatus != paymentStatus || currentRGHasCreditTerms != hasCreditTermsVal + "")
		{
			updateDataRG = Map();
			updateDataRG.put("payment_status",paymentStatus);
			updateDataRG.put("Has_Credit_Terms",hasCreditTermsVal);
			updateRespRG = zoho.creator.v2_1.updateRecordById(owner,app,"Sales_Order_Readiness_Gate_Report",rgId,updateDataRG,config,"supply_chain_app");
			info "Update response para sa Sales_Order_Readiness_Gate_Report record " + rgId + ": " + updateRespRG;
			if(updateRespRG != null && updateRespRG.get("code") == 3000)
			{
				updatedCountRG = updatedCountRG + 1;
			}
			else
			{
				failedCountRG = failedCountRG + 1;
				failedIdsRG.add(rgId);
			}
		}
	}
}
info "Na-update ang payment_status ng " + updatedCountRG + " Sales_Order_Readiness_Gate_Report record(s) para sa SO " + soNumber + " tungong " + paymentStatus + ".";
if(failedCountRG > 0)
{
	info "BABALA: " + failedCountRG + " Sales_Order_Readiness_Gate_Report record(s) para sa SO " + soNumber + " ang NABIGONG i-update tungong " + paymentStatus + " — record ID(s): " + failedIdsRG + ".";
}

````
