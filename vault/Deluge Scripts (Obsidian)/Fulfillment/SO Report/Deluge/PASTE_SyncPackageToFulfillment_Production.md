---
title: "PASTE_SyncPackageToFulfillment_Production"
source_file: "NEw/PASTE_SyncPackageToFulfillment_Production.txt"
category: "Fulfillment/SO Report/Deluge"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 358
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - kanban
  - pack
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
  - zoho-creator
---

# PASTE_SyncPackageToFulfillment_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `Fulfillment/SO Report/Deluge`
> - **Source File:** `NEw/PASTE_SyncPackageToFulfillment_Production.txt`
> - **Lines of Code:** 358
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#kanban`, `#pack`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
config = Map();
pkgNo = package.get("package_number") + "";
soId = package.get("salesorder_id") + "";
soNumber = package.get("salesorder_number") + "";
pkgDate = package.get("date") + "";
// ===== TEST GATE: WALA SA SCRIPT — nasa Workflow Rule CONDITION na mismo sa Zoho Books
// (parehong paraan ng pag-trigger gaya ng so_fulfillment_sync.txt, na walang in-script
// gate/test-check kahit anong uri). Sa Workflow Rule setup (Settings -> Automation ->
// Workflow Rules -> itong rule na tumatawag sa Custom Function na ito), magdagdag ng
// CONDITION: "Customer.Customer Name is (TEST ORDER) BY CPY PAM TAN" — hindi na tatakbo
// ang buong Custom Function kung hindi tugma, kaya walang extra invokeurl/getRecordsByID
// calls na nasasayang. Tanggalin/i-adjust ang Condition na ito sa Workflow Rule mismo
// (hindi sa script) kapag tapos na ang testing. =====
info "raw package trigger map: " + package;
// ===== SO DETAIL FETCH — kailangan lang para sa live packages[] list (STALE-RECORD
// CLEANUP sa ibaba). =====
soResp = zoho.books.getRecordsByID("salesorders",orgId,soId);
soRec = soResp.get("salesorder");
// ADDED 2026-08-07, per the replacement-package redesign — this SO detail was already
// being fetched for the stale-record cleanup below; reused here to resolve the real
// Books customer_id so a freshly-INSERTED Sales_Order_Fulfillment record (Step 4 below,
// needed when a 2nd package exists for a SKU that already has one) can carry real
// Customer/address context instead of leaving it permanently blank.
custBookIdSof = "";
custCreatorIdSof = "";
custTypeSof = "";
if(soRec != null)
{
	custBookIdSof = soRec.get("customer_id") + "";
}
if(custBookIdSof != "" && custBookIdSof != "null")
{
	custRespSof = invokeurl
	[
		url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Customers?criteria=ID1%3D%3D%22" + custBookIdSof + "%22&field_config=all"
		type :GET
		connection:"supply_chain"
	];
	if(custRespSof.get("data") != null && custRespSof.get("data").size() > 0)
	{
		custRecMapSof = custRespSof.get("data").get(0);
		custCreatorIdSof = custRecMapSof.get("ID") + "";
		custTypeSof = custRecMapSof.get("Customer_Type") + "";
		if(custTypeSof == "null")
		{
			custTypeSof = "";
		}
	}
}
livePackageNumbers = List();
if(soRec != null)
{
	// SO detail's own "packages" array is the LIVE/current list of packages that still
	// exist for this SO right now (confirmed live 2026-07-10 — the /packages LIST
	// endpoint's salesorder_id/package_number filter params are both silently ignored,
	// always return the unfiltered default list even for a fake package number, so this
	// embedded array is the only reliable way to know which packages are still real).
	soPackages = soRec.get("packages");
	if(soPackages != null)
	{
		for each  sp in soPackages
		{
			livePackageNumbers.add(sp.get("package_number") + "");
		}
	}
}
// ===== STALE-RECORD CLEANUP (per user's company workflow: "update a package" =
// delete old + create new, always within the same SO — see this file's own top NOTES).
// Books workflow rules don't support an On-Delete trigger for Packages, so this
// self-heals instead: every time a NEW package is created for an SO, delete any
// Sales_Order_Fulfillment record for that SAME SO whose Package number is no longer in
// the SO's live packages[] list above — its package was deleted in Books. Records for
// packages that ARE still live (legitimate sibling/split-shipment packages) are left
// untouched — this does NOT blanket-delete by SO_No. Also doubles as the source data
// for the Package/Package_Date/Delivery_Type UPDATE loop further down — fetched once,
// used twice, no extra query needed. =====
// FIXED 2026-08-05, real bug found live (SO-16399/SKU JF-001 skipped even though the
// Sales_Order_Fulfillment record genuinely existed in Production) — ang raw invokeurl GET
// papunta sa parehong Creator cross-app REST endpoint ay kumpirmadong minsan nag-e-error ng
// generic "code":2930 SA HALIP na data, walang "data" key man lang — at basta
// `existingResp.get("data") != null` lang ang tinitignan dati, kaya ang error response ay
// nagmumukhang "walang record" kahit meron talaga. Pinalitan ng native
// `zoho.creator.v2_1.getRecords` task na may isang retry kapag hindi "code":3000 ang balik,
// kasama ang raw response logging.
getParamsPkg = Map();
getParamsPkg.put("criteria","SO_No == \"" + soNumber + "\"");
getParamsPkg.put("field_config","all");
existingResp = zoho.creator.v2_1.getRecords(owner,app,"Sales_Order_Fulfillment_Report",getParamsPkg,"supply_chain");
info "existingResp raw response: " + existingResp;
// FIXED 2026-08-05 (2nd bug found same retest, on top of the environment-literal fix
// above) — a Books custom function's zoho.creator.v2_1.getRecords() wraps its real
// response one level deeper than same-app native calls do: {"response":{"code":3000,
// "data":[...]}}, not the flat {"code":3000,"data":[...]} this file's own
// .get("code")/.get("data") calls assumed. Confirmed live: raw response logged real
// matching data for SO-16399/JF-001 every time, but .get("code") still read null,
// permanently misdiagnosing it as "error, retry" then "no record found" — same exact
// bug class already fixed in payment_status_to_kanban (Temp.txt) days ago, just never
// carried over to this file when it got its own environment-literal fix. sofCode/
// sofData below unwrap via .get("response") first, falling back to the flat shape
// (defensive — in case a future/different call in this same file isn't wrapped).
sofCode = existingResp.get("code");
sofData = existingResp.get("data");
if(existingResp.get("response") != null)
{
	sofCode = existingResp.get("response").get("code");
	sofData = existingResp.get("response").get("data");
}
if(sofCode != 3000)
{
	info "Nag-error ang unang subok (code " + sofCode + ") — malamang pansamantalang Zoho backend hiccup. Susubukan ulit isang beses.";
	existingResp = zoho.creator.v2_1.getRecords(owner,app,"Sales_Order_Fulfillment_Report",getParamsPkg,"supply_chain");
	info "existingResp retry response: " + existingResp;
	sofCode = existingResp.get("code");
	sofData = existingResp.get("data");
	if(existingResp.get("response") != null)
	{
		sofCode = existingResp.get("response").get("code");
		sofData = existingResp.get("response").get("data");
	}
}
alreadyHasThisPackage = false;
if(sofData != null)
{
	for each  existingRec in sofData
	{
		existingPkgNo = existingRec.get("Package") + "";
		existingId = existingRec.get("ID") + "";
		if(existingPkgNo == pkgNo)
		{
			alreadyHasThisPackage = true;
		}
		else if(existingPkgNo != "" && existingPkgNo != "null" && !livePackageNumbers.contains(existingPkgNo))
		{
			info "Package " + existingPkgNo + " no longer exists on SO " + soNumber + " — deleting stale Sales_Order_Fulfillment record " + existingId;
			delResp = invokeurl
			[
				url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report/" + existingId
				type :DELETE
				connection:"supply_chain"
			];
			info "delete resp: " + delResp;
		}
	}
}
// ===== DUPLICATE GUARD (this exact package already synced — re-trigger safety) =====
if(alreadyHasThisPackage == true)
{
	info "Sales_Order_Fulfillment already stamped with Package " + pkgNo + " — skipping.";
	return;
}
// ===== PACKAGE-LEVEL CUSTOM FIELD (delivery type) =====
// Creator's `delivery_type` is plain Single Line — passes through Books' raw
// `cf_delivery_type` value as-is (e.g. "Delivery - Metro Manila").
deliveryTypeRaw = "";
pkgCF = package.get("custom_fields");
for each  cf in pkgCF
{
	if(cf.get("api_name") + "" == "cf_delivery_type")
	{
		deliveryTypeRaw = cf.get("value") + "";
	}
}
deliveryType = deliveryTypeRaw;
// ===== ITEM MATCH + UPDATE (Package / Package_Date / Delivery_Type / Bin_Location) =====
// RESTORED 2026-08-05: Bin_Location idinagdag pabalik, per user — hindi na lang Package/
// Package_Date/Delivery_Type gaya ng 2026-07-29 simplification.
// Matches each package line by SKU against the ALREADY-fetched existingResp
// (Sales_Order_Fulfillment records so_kanban created at SO-creation time, one per
// item, one row in Item_Details1 each) — no new query needed.
pkgLineItems = package.get("line_items");
for each  li in pkgLineItems
{
	skuValLi = li.get("sku") + "";
	matchedRecId = "";
	matchedExistingPkg = "";
	// ADDED 2026-08-07 — tracks whether ANY Sales_Order_Fulfillment record exists for
	// this SKU at all (any package), separately from matchedRecId (which now only ever
	// holds a record whose OWN Package is blank or already equal to pkgNo — see the
	// widened match below). Needed to decide UPDATE vs INSERT further down.
	anyExistingForSku = false;
	// RESTORED 2026-08-05, per user — kinukuha ang Bin_Location mula sa package line
	// item's OWN "storages" array (ang totoong storage/bin kung saan galing ang item para
	// sa SPECIFIC package na ito — mas tumpak kaysa sa speculative bin lookup noong SO-
	// creation time sa so_fulfillment_sync.txt, na batay pa lang sa general na stock
	// availability, hindi pa sa aktwal na pinag-source ng package). Comma-joined kung
	// maramihan, parehong convention gaya ng so_fulfillment_sync.txt's allBinNames.
	binLocationNames = List();
	liStorages = li.get("storages");
	if(liStorages != null)
	{
		for each  st in liStorages
		{
			stName = st.get("storage_name") + "";
			if(stName != "" && stName != "null" && !binLocationNames.contains(stName))
			{
				binLocationNames.add(stName);
			}
		}
	}
	binLocationVal = "";
	binLocFirst = true;
	for each  bn in binLocationNames
	{
		if(binLocFirst == true)
		{
			binLocationVal = bn;
			binLocFirst = false;
		}
		else
		{
			binLocationVal = binLocationVal + ", " + bn;
		}
	}
	matchedItemName = "";
	matchedSKU = "";
	if(sofData != null)
	{
		for each  existingRec in sofData
		{
			existingItemsSof = existingRec.get("Item_Details1");
			if(existingItemsSof != null)
			{
				for each  eiRow in existingItemsSof
				{
					if(eiRow.get("SKU") + "" == skuValLi)
					{
						anyExistingForSku = true;
						// FIXED 2026-08-07, real bug (part of the replacement-package
						// redesign): this used to match ANY record for this SO+SKU
						// regardless of its own Package — meaning a 2nd real package for
						// the same SKU (a replacement's fresh package) would either get
						// silently skipped (via the "already has a Package" guard further
						// down) or, worse, get its data merged into the WRONG (original)
						// record. Now only treated as "the" match if this record's own
						// Package is blank (a genuinely unpackaged Sales_Order_Fulfillment
						// row still waiting for ITS package) or already equals THIS
						// package's number (a safe re-sync of the same package). A record
						// already tied to a DIFFERENT package is left alone entirely —
						// Step 4 below inserts a brand new record for this package instead.
						eiRowPkg = existingRec.get("Package") + "";
						if(eiRowPkg == "" || eiRowPkg == "null" || eiRowPkg == pkgNo)
						{
							matchedRecId = existingRec.get("ID") + "";
							matchedItemName = eiRow.get("Item") + "";
							matchedSKU = eiRow.get("SKU") + "";
						}
					}
				}
			}
		}
	}
	if(matchedRecId == "")
	{
		if(anyExistingForSku == true)
		{
			// FIXED 2026-08-07, real gap (replacement-package redesign): every
			// existing Sales_Order_Fulfillment record for this SKU already belongs to
			// a DIFFERENT package (e.g. the original item's own package) — this is a
			// genuinely NEW package for the same SKU (a replacement's fresh package),
			// so it needs its OWN Sales_Order_Fulfillment record, not a skip. Carries
			// only SO_No/Package/Package_Date/Delivery_Type/Customer/Customer_Type/
			// Item_Details1 — minus everything else so_kanban_sync.txt's own fresh
			// insert sets (Fulfillment_Stage/SO_Status/For_Crate/SO_Created_Date/
			// Billing_Address/Shipping_Address/Contact_No/Status/RR_No/PR_No/
			// target_delivery_date/Shipment_Mode) — this script has no computed value
			// for those (see this task's own header note in the plan).
			insertDataSof = Map();
			insertDataSof.put("SO_No",soNumber);
			insertDataSof.put("Package",pkgNo);
			if(pkgDate != "" && pkgDate != "null")
			{
				insertDataSof.put("Package_Date",pkgDate);
			}
			if(deliveryType != "")
			{
				insertDataSof.put("Delivery_Type",deliveryType);
			}
			if(custCreatorIdSof != "")
			{
				insertDataSof.put("Customer",custCreatorIdSof);
			}
			if(custTypeSof != "")
			{
				insertDataSof.put("Customer_Type",custTypeSof);
			}
			liItemNameSof = li.get("name") + "";
			liQtySof = li.get("quantity") + "";
			insRowSof = Map();
			insRowSof.put("Item",liItemNameSof);
			insRowSof.put("SKU",skuValLi);
			insRowSof.put("Quantity",liQtySof);
			if(binLocationVal != "")
			{
				insRowSof.put("Bin_Location",binLocationVal);
			}
			insRowsSof = List();
			insRowsSof.add(insRowSof);
			insertDataSof.put("Item_Details1",insRowsSof);
			info "Inserting NEW Sales_Order_Fulfillment record for SO " + soNumber + " / SKU " + skuValLi + " / Package " + pkgNo + " (every existing record for this SKU already belongs to a different package): " + insertDataSof;
			insertRespSof = zoho.creator.v2_1.createRecord(owner,app,"Sales_Order_Fulfillment",insertDataSof,config,"supply_chain");
			info "createRecord response: " + insertRespSof;
		}
		else
		{
			info "No existing Sales_Order_Fulfillment record found for SO " + soNumber + " / SKU " + skuValLi + " — skipping (so_kanban should have created it at SO-creation time).";
		}
		continue;
	}
	updateData = Map();
	updateData.put("Package",pkgNo);
	if(pkgDate != "" && pkgDate != "null")
	{
		updateData.put("Package_Date",pkgDate);
	}
	if(deliveryType != "")
	{
		updateData.put("Delivery_Type",deliveryType);
	}
	// RETRIED 2026-08-05, 2nd attempt — first attempt included an "ID" key inside the
	// rebuilt subform row Map (trying to target the existing row) and the whole update
	// call failed with code 2930. Official Zoho docs (update-records-v2.1.html /
	// update-specific-record.html) show a real subform-update example payload with NO
	// "ID" key in the row Map at all — just field values — and don't list subforms in
	// the excluded-field-types list. Retrying WITHOUT the "ID" key, matching the
	// documented shape exactly, in case that key itself (not subforms generally) was
	// what the API rejected. Still UNCONFIRMED whether this replaces the row in place
	// or appends a duplicate — needs a live test either way.
	if(binLocationVal != "" && matchedSKU != "")
	{
		// FIXED 2026-08-07, real live bug found during Task 10 verification (SO-16415
		// replacement test): Quantity was sourced from matchedQty — the EXISTING record's
		// OWN already-stored subform value — not from THIS trigger's actual package. Was
		// invisible before the replacement-package redesign (a record only ever matched
		// its own single package, so the value never differed); now that a genuinely
		// blank-Package record can legitimately match ANY new package (see the widened
		// guard above), re-copying the old value left Quantity stuck at whatever
		// so_kanban_sync.txt guessed at SO-creation time (the full un-split SO line qty)
		// instead of this specific package's real line-item quantity. Use li.get("quantity")
		// — the CURRENT triggering package's own value, same source the insert path above
		// already uses correctly — instead.
		liQtySofUpd = li.get("quantity") + "";
		newItemRow = Map();
		newItemRow.put("Item",matchedItemName);
		newItemRow.put("SKU",matchedSKU);
		newItemRow.put("Quantity",liQtySofUpd);
		newItemRow.put("Bin_Location",binLocationVal);
		newItemRows = List();
		newItemRows.add(newItemRow);
		updateData.put("Item_Details1",newItemRows);
	}
	updateCriteria = "ID==" + matchedRecId;
	info "updating Sales_Order_Fulfillment " + matchedRecId + " for SKU " + skuValLi + ": " + updateData;
	updateResp = zoho.creator.v2_1.updateRecords(owner,app,"Sales_Order_Fulfillment_Report",updateCriteria,updateData,config,"supply_chain");
	info "updateRecords response: " + updateResp;
}

````
