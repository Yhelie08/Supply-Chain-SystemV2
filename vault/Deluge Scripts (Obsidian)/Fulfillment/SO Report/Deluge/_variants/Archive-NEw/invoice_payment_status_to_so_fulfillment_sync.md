---
title: "invoice_payment_status_to_so_fulfillment_sync"
source_file: "Deluge Script/invoice_payment_status_to_so_fulfillment_sync.txt"
category: "Fulfillment/SO Report/Deluge/_variants/Archive-NEw"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 356
tags:
  - deluge
  - fulfillment
  - order-aggregation
  - pick
  - procurement
  - purchase-order
  - zoho-books
  - zoho-creator
---

# invoice_payment_status_to_so_fulfillment_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `Fulfillment/SO Report/Deluge/_variants/Archive-NEw`
> - **Source File:** `Deluge Script/invoice_payment_status_to_so_fulfillment_sync.txt`
> - **Lines of Code:** 356
> - **Tags:** `#deluge`, `#fulfillment`, `#order-aggregation`, `#pick`, `#procurement`, `#purchase-order`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
INVOICE CREATED/EDITED (PAID STATUS) -> SYNC "Status" SA Sales_Order_Fulfillment
==============================================================================
Goal: Ganito ang buong flow — nagawa na ang Sales Order (SO), tapos gagawa ng Invoice
laban dito (nagsisimula itong "Draft", walang pang bayad). Sa Invoice mismo (hindi sa SO)
ie-edit ng staff ang "Paid" na custom field (cf_paid: Yes/No/Partial) kung nabayaran na ba
o hindi. Kailangan, sa sandaling gumawa o mag-edit ang staff ng Invoice (lalo na kapag
binago ang Paid status nito), ma-reflect agad ito sa "Status" field (Yes/No/Partial
picklist) ng lahat ng Sales_Order_Fulfillment record na kabilang sa parehong SO — dati,
ang Status field na ito ay puro sa SO-creation time lang (so_fulfillment_sync.txt)
kinukuha, at halos palaging "No" pa lang doon dahil wala pang Invoice kapag bagong likha
pa lang ang SO.

Ito ay HIWALAY na BAGONG Books Custom Function, naka-trigger sa INVOICE module (hindi sa
Sales Order module) — dahil ang pagbabago ng "Paid" na status ay nangyayari sa Invoice, at
kailangan nating "makinig" doon mismo, hindi lang sa paggawa ng SO.

MAHALAGANG PAALALA — HINDI PA 100% KUMPIRMADO ANG EXACT FIELD NAME NA NAGDADALA NG SO
LINK SA LOOB NG INVOICE (`salesorder_id` / `salesorder_number`) — GINAWANG DIAGNOSTIC-
FIRST ITO: sinusubukan munang kunin ang `salesorder_id` at `salesorder_number` mula sa
Invoice detail fetch, pero HINDI pa ito na-verify laban sa totoong live Zoho Books API
response ng org na ito (walang existing script dito na gumagawa nito mula sa Invoice
pabalik sa SO — palaging kabaligtaran, mula sa SO pasulong sa mga Invoice nito, ang
ginagawa ng existing code, hal. so_fulfillment_sync.txt's `soRec.get("invoices")`). Kaya
may extensive `info` logging dito na magpapakita ng BUONG raw invoice detail sa Execution
Result — kung mali ang hula sa field name, makikita agad doon ang tamang field, i-
screenshot at sabihin para ma-tama.

BUOD NG LOGIC:
1. Kunin ang invoice_id mula sa trigger, kunin ang buong invoice detail (para makuha ang
   custom_fields nito, particular ang cf_paid).
2. Hanapin ang Sales Order na pinagmulan ng Invoice na ito (salesorder_id/salesorder_number
   sa invoice detail).
3. Kapag nahanap ang SO, kunin ang BUONG SO detail (parehong pattern gaya ng
   so_fulfillment_sync.txt) para makuha ang LAHAT ng invoices nito (hindi lang itong isang
   invoice na nag-trigger) — kasi posibleng may 2+ invoice ang isang SO (partial
   invoicing), kaya kailangang i-aggregate LAHAT, hindi lang ibase sa isang invoice.
4. I-aggregate ang cf_paid values ng lahat ng non-void invoices ng SO na iyon, PAREHONG
   ALGORITHM gaya ng so_fulfillment_sync.txt's sariling PAYMENT STATUS block (kung may
   Partial kahit saan, o magkahalong Yes+No = "Partial"; kung lahat/may Yes lang = "Yes";
   default "No").
5. Hanapin LAHAT ng Sales_Order_Fulfillment record kung saan SO_No == SO number na ito
   (isang record per item, posibleng higit sa isa), i-update ang "Status" field ng bawat
   isa tungo sa aggregated payment status — SKIP kung pareho na ang value (walang
   kailangang i-update).

Direktang pass-through lang ang paglipat ng value (walang translation) — kumpirmado na
noon (so_fulfillment_sync.txt's sariling comment) na parehong Yes/No/Partial ang values ng
Books' cf_paid AT ng Sales_Order_Fulfillment's Status picklist.

SAKLAW NA HINDI PA HAWAK NG SCRIPT NA ITO (flagged, hindi pa aksyon): kung ang isang
Invoice ay ginawa mula sa MARAMIHANG Sales Order (posible sa Zoho Books, i.e. combined
invoice), ang script na ito ay tatanggap lang ng UNANG/tanging salesorder_id na makukuha —
hindi pa ito sinusuportahan para sa multi-SO invoices. Sabihin kung kailangan ito.

TEST GATE — NASA WORKFLOW RULE CONDITION, HINDI SA SCRIPT (FIXED 2026-07-28, per user:
"kasi sa so_fulfillment_sync, nag titrigger agad siya based kung sino yung customer" —
kumpirmadong walang in-script test-check si so_fulfillment_sync.txt, sa Workflow Rule
Condition mismo sa Books nakalagay ang customer restriction). Tingnan ang Step 2 sa PAANO
I-SETUP sa ibaba para sa Condition na idadagdag. Mas mabuti rin ito dahil hindi na tatakbo
ang buong Custom Function (walang extra API calls) kung hindi tugma ang customer, imbes
na tumakbo lahat tapos mag-e-early-return na lang sa gitna.


PAANO I-SETUP (Zoho BOOKS Workflow Rule + Custom Function, HINDI Zoho Creator workflow)
------------------------------------------------------------------------------------
Step 1 — Gumawa ng Custom Function sa Zoho Books:
  1. Sa Zoho Books, pumunta sa Settings -> Automation -> Custom Functions -> "+ New Custom
     Function".
  2. Module: Invoices
  3. Pangalan: Sync Invoice Paid Status to Sales Order Fulfillment
  4. I-paste ang Deluge script sa ibaba.
  5. Save.

Step 2 — Gumawa ng Workflow Rule na tatawag dito:
  1. Settings -> Automation -> Workflow Rules -> "+ New Workflow Rule".
  2. Module: Invoices
  3. When this rule should trigger: "Record Created or Edited" (kailangan pareho — Created
     para sa unang sync, Edited para sa sandaling baguhin ang Paid status pagkatapos)
  4. CONDITION (habang tinetest pa, tanggalin/i-adjust kapag tapos na): "Customer Name is
     (TEST ORDER) BY CPY PAM TAN" — parehong pattern ng pag-gate gaya ng so_fulfillment_
     sync.txt (nasa Workflow Rule Condition mismo, HINDI sa loob ng Deluge script).
  5. Action: Custom Function -> piliin ang "Sync Invoice Paid Status to Sales Order
     Fulfillment" na ginawa sa Step 1.
  6. Save at i-Enable.

(Ginamit ang parehong connection na `zhbooksfullaccessall` gaya ng ibang bahagi ng
so_fulfillment_sync.txt, at `supply_chain` connection papunta sa Creator — parehong
existing connections, walang bagong kailangang gawin.)


Deluge script (i-paste sa Custom Function):
------------------------------------------------

owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
config = Map();
config.put("environment","development");

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
		connection:"zhbooksfullaccessall"
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
if(hasPartial || (hasYes && hasNo))
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
existingSOFResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report?criteria=SO_No%3D%3D%22" + soNumber + "%22"
	type :GET
	headers:{"environment":"development"}
	connection:"supply_chain"
];
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
// this one doesn't go unnoticed again. This does NOT fix WHY that one record's
// update was rejected (Zoho's own code:3001 gives no field-level detail) — still
// needs checking the native Sales_Order_Fulfillment record for that ID directly in
// Zoho Creator's form editor for a validation error on some other field, since a
// server-side field validation failing on ANY field blocks an update to EVERY
// field, not just the one being changed.
failedCount = 0;
failedIds = List();
if(existingSOFResp.get("data") != null)
{
	for each  sofRec in existingSOFResp.get("data")
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
			updateResp = zoho.creator.v2_1.updateRecordById(owner,app,"Sales_Order_Fulfillment_Report",sofId,updateData,config,"supply_chain");
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
	info "BABALA: " + failedCount + " Sales_Order_Fulfillment record(s) para sa SO " + soNumber + " ang NABIGONG i-update tungong " + paymentStatus + " — record ID(s): " + failedIds + ". Suriin ang mismong native record na ito sa Zoho Creator para sa possible validation error sa ibang field (isang na-violate na field validation ay humaharang sa update kahit ibang field lang ang binabago).";
}


PAANO I-TEST
-------------
1. Gawin ang Custom Function + Workflow Rule sa itaas sa Zoho Books.
2. Kumuha ng isang SO na may kaukulang Sales_Order_Fulfillment record(s) na sa Creator
   (Status field dapat "No" pa).
3. Gumawa ng Invoice laban sa SO na iyon (o gamitin ang existing Draft invoice nito).
4. Buksan ang Execution Result / Deluge log ng Custom Function pagkatapos ma-save ang
   Invoice — TIGNAN MUNA ang "invoice detail fetch response" at "unang subok — soId...
   soNumber..." lines. Kung blangko ang soId/soNumber doon, kailangang ayusin ang field
   name (i-screenshot ang buong raw invoice detail JSON para malaman ang tamang field).
5. Kung nahanap ang SO number, i-edit ang Invoice, palitan ang "Paid" custom field tungong
   "Yes" (o "Partial"), i-save.
6. Balikan ang Sales_Order_Fulfillment report sa Creator -> dapat naging "Yes" (o
   "Partial") na ang Status ng LAHAT ng item-record ng SO na iyon.
7. Kung may error o mali ang resulta, i-screenshot ang buong Execution Result log para
   ma-diagnose — sadyang maraming diagnostic info line dito dahil bagong-bago pa ang
   invoice->SO linkage na ito, hindi pa kasing-tested ng ibang script sa codebase.

Sources:
- https://www.zoho.com/deluge/help/data-access/update-multiple-fields.html
- https://www.zoho.com/deluge/help/update-record-by-id-v2.1.html
- https://www.zoho.com/books/api/v3/invoices/

````
