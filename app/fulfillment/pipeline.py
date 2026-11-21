# Fulfillment pipeline, first part: Sales Order -> Order Readiness -> Pick -> Pack & QC. Ported
# from server/modules/fulfillment/pipeline.mjs.
#   Sales_Order_Fulfillment     SO_to_Readiness
#   Sales_Order_Readiness_Gate  Release_Records_to_Pick1
#   Pick1                       Pick1_Marked_to_QC_Sync
# all "on add or edit, on success". Not ported yet (later Fulfillment slices): QC approve -> Crate /
# Order Aggregation, Crating done, Dispatch -> For Delivery (those are qc_routing.py and
# crate_dispatch.py, Tasks 12-13).
#
# A Sales_Order_Fulfillment record (one per package) with a Package creates one
# Sales_Order_Readiness_Gate record per item line, with the customer name/address, whatever the
# payment: the payment status is copied onto the Gate record and existing Gate records are only
# refreshed (payment, address, quantity), so paying later and saving again updates them without
# duplicates. A Gate record saved with Release checked creates/updates its Pick1 record, adds a
# Pick_Notifications row for a new one, and the package's stage becomes "Picking". A Pick1 record
# saved with Marked checked creates/updates its Checker_Checklist record and the item's Pack & QC
# line, stage becomes "Pack & QC".
#
# Values are copied as they are from one form to the next: nothing is renamed, rounded or
# recalculated. A value that comes out empty never blanks one that is already there.
#
# Differences from Zoho, on purpose: a stage only moves FORWARD. Writes made here do not run the
# workflows again (an insert/update through the raw store does not on Zoho either).
from app.criteria import zoho_now
from app.deluge import blank, truthy
from app.fulfillment.stage import set_stage
from app.fulfillment.where import eq
from app.fulfillment.workflows import needs_payment_approval, package_stage
from app.workflows import register

# The pipeline, in order (Crate is skipped by packages that are not for crating, so it is only a
# position here).
STAGE_ORDER = ["Waiting For Package", "Need Approval", "Order Readiness", "Picking", "Pack & QC", "Crate", "Order Aggregation", "For Delivery"]

SOF = "Sales_Order_Fulfillment"
GATE = "Sales_Order_Readiness_Gate"
PICK = "Pick1"


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


# QC-R5: "a second QC after rework is visit 2; both visits are kept." A Checker_Checklist (QC) record
# is never overwritten across a recheck (exception_recheck.py always adds a new row instead), so this
# just numbers them in creation order per SO+SKU+PAC. Every place that creates a QC record stamps
# Visit_No itself via this helper -- it can't be a QC-form beforeAdd hook, because a hook-to-hook write
# goes through the raw store (app/workflows.py: "they do not fire hooks again").
async def next_visit_no(store, so, sku, pac) -> str:
    existing = await store.find("Checker_Checklist", lambda c: _text(c.get("SO")) == so and _text(c.get("SKU")) == sku and _text(c.get("PAC")) == pac, criteria=eq("SO", so))
    return str(len(existing) + 1)


async def advance_stage(store, so, item_name, sku, stage) -> None:
    target = STAGE_ORDER.index(stage)
    for sof in await store.find(SOF, lambda r: r.get("SO_No") == so, criteria=eq("SO_No", so)):
        holds_item = any(_text(row.get("Item")) == _text(item_name) and _text(row.get("SKU")) == _text(sku) for row in sof.get("Item_Details1") or [])
        if not holds_item:
            continue
        current_stage = sof.get("Fulfillment_Stage")
        if current_stage == stage or (current_stage in STAGE_ORDER and STAGE_ORDER.index(current_stage) > target):
            continue
        await set_stage(store, sof, stage)


# ---------- Sales order package -> Readiness Gate ----------
async def so_to_readiness(args: dict) -> None:
    sof, store, user = args["record"], args["store"], args.get("user", "")
    so = _text(sof.get("SO_No"))
    pkg = _text(sof.get("Package"))
    if pkg == "":
        return

    customer_name = ""
    if not blank(sof.get("Customer")):
        try:
            customer = await store.get_record_by_id("Customer", str(sof["Customer"]), raw=True)
            customer_name = _text(customer.get("customer_name"))
        except Exception:
            pass
    address = _text(sof.get("Shipping_Address")) if _text(sof.get("Shipping_Address")) != "" else _text(sof.get("Billing_Address"))
    common = {
        "Order_Type": sof.get("order_type"), "Package_Order": pkg, "Delivery_Type": sof.get("Delivery_Type"), "For_Crate": truthy(sof.get("For_Crate")),
        "Target_Delivery_Date": sof.get("target_delivery_date"), "payment_status": sof.get("Status"), "customer_name": customer_name,
        "customer_type": sof.get("Customer_Type"), "customer_address": address, "pr_number": _text(sof.get("PR_No")), "rr_number": _text(sof.get("RR_No")),
        "Forecast_Delivery": _text(sof.get("Forecast_Delivery")), "Forecast_Window": _text(sof.get("Forecast_Window")), "Forecast_Status": _text(sof.get("Forecast_Status")),
    }
    keep_if_empty = {"customer_name", "customer_address", "Forecast_Delivery", "Forecast_Window", "Forecast_Status"}

    def refresh(gate: dict, values: dict) -> dict:
        return {k: v for k, v in values.items() if not (k in keep_if_empty and v == "" and not blank(gate.get(k)))}

    for row in sof.get("Item_Details1") or []:
        item = {"Item_Name": _text(row.get("Item")), "SKU": _text(row.get("SKU")), "Quantity": _text(row.get("Quantity")), "Bin_Location": _text(row.get("Bin_Location"))}
        existing = await store.find(GATE, lambda g: g.get("sales_order_number") == so and g.get("SKU") == item["SKU"] and g.get("Package_Order") == pkg, criteria=eq("sales_order_number", so))
        for gate in existing:
            await store.update_record(GATE, gate["ID"], refresh(gate, {**common, **item}), by_form=True)
            if truthy(gate.get("Release")):
                for pick in await store.find(PICK, lambda p: p.get("SO") == so and p.get("SKU") == item["SKU"] and p.get("Item_Name") == item["Item_Name"] and p.get("Package_Order") == pkg, criteria=eq("SO", so)):
                    await store.update_record(PICK, pick["ID"], {
                        "Package_Order": pkg, "PR_if_any": common["pr_number"], "RR": common["rr_number"], "Delivery_Type": common["Delivery_Type"],
                        "Order_Type": common["Order_Type"], "Target_Delivery_Date": common["Target_Delivery_Date"], "For_Crate": common["For_Crate"],
                        "Item_Name": item["Item_Name"], "Bin_Location": item["Bin_Location"], "SKU": item["SKU"], "Quantity_to_Pick": item["Quantity"],
                        "Customer_Name": customer_name or pick.get("Customer_Name"), "Customer_Address": address or pick.get("Customer_Address"),
                        "Customer_Type": common["customer_type"], "Forecast_Delivery": common["Forecast_Delivery"] or pick.get("Forecast_Delivery"),
                        "Forecast_Window": common["Forecast_Window"] or pick.get("Forecast_Window"), "Forecast_Status": common["Forecast_Status"] or pick.get("Forecast_Status"),
                    }, by_form=True)
        if not existing:
            await store.add_record(GATE, {"sales_order_number": so, **common, **item}, user)


register(SOF, {"afterAdd": so_to_readiness, "afterUpdate": so_to_readiness})


# ---------- Readiness Gate (Release) -> Pick ----------
async def release_to_pick(args: dict) -> None:
    gate, store, user = args["record"], args["store"], args.get("user", "")
    so = _text(gate.get("sales_order_number"))
    if not truthy(gate.get("Release")):
        return

    for g in await store.find(GATE, lambda r: r.get("sales_order_number") == so and truthy(r.get("Release")) and not needs_payment_approval(r), criteria=eq("sales_order_number", so)):
        rr = _text(g.get("rr_number"))
        fields = {
            "Picker": g.get("Assign_Picker"), "Package_Order": g.get("Package_Order"), "PR_if_any": g.get("pr_number"), "RR": g.get("rr_number"),
            "Demo": g.get("Demo"), "Delivery_Type": g.get("Delivery_Type"), "Order_Type": g.get("Order_Type"), "Target_Delivery_Date": g.get("Target_Delivery_Date"),
            "For_Crate": g.get("For_Crate"), "Item_Name": g.get("Item_Name"), "Bin_Location": g.get("Bin_Location"), "SKU": g.get("SKU"),
            "Quantity_to_Pick": g.get("Quantity"), "Customer_Name": g.get("customer_name"), "Customer_Address": g.get("customer_address"), "Customer_Type": g.get("customer_type"),
            "Forecast_Delivery": g.get("Forecast_Delivery"), "Forecast_Window": g.get("Forecast_Window"), "Forecast_Status": g.get("Forecast_Status"),
        }
        found = await store.find(PICK, lambda p: p.get("SO") == so and p.get("SKU") == g.get("SKU") and p.get("Item_Name") == g.get("Item_Name") and p.get("Package_Order") == g.get("Package_Order") and _text(p.get("RR")) == rr, criteria=eq("SO", so))
        if found:
            for p in found:
                await store.update_record(PICK, p["ID"], fields, by_form=True)
        else:
            pick_id = await store.add_record(PICK, {"SO": so, **fields}, user)
            await store.add_record("Pick_Notifications", {
                "Recipient_Email": "homecartelff@gmail.com", "Notification_Type": "Pick Record Created",
                "Message": f"New item ready for picking — {so} ({g.get('Item_Name')}).", "Created_On": zoho_now(),
                "Read": False, "Target_URL": "", "Source_Record_No": so, "Source_Record_ID": pick_id,
            }, user)
        await advance_stage(store, so, g.get("Item_Name"), g.get("SKU"), "Picking")


register(GATE, {"afterAdd": release_to_pick, "afterUpdate": release_to_pick})


# ---------- Pick (Marked) -> Pack & QC ----------
QC = "Checker_Checklist"


async def _customer_contact(store, so, item_name, sku) -> dict:
    out = {}
    matches = await store.find(SOF, lambda r: r.get("SO_No") == so and any(_text(row.get("Item")) == _text(item_name) and _text(row.get("SKU")) == _text(sku) for row in r.get("Item_Details1") or []), criteria=eq("SO_No", so))
    if not matches:
        return out
    sof = matches[0]
    if _text(sof.get("Contact_No")) != "":
        out["Contact"] = _text(sof.get("Contact_No"))
    if not blank(sof.get("Customer")):
        try:
            c = await store.get_record_by_id("Customer", str(sof["Customer"]), raw=True)
            if _text(c.get("Email")) != "":
                out["Email"] = _text(c.get("Email"))
            if "Contact" not in out and _text(c.get("Phone_Number")) != "":
                out["Contact"] = _text(c.get("Phone_Number"))
            billing = c.get("Billing_Address")
            city = _text(billing.get("district_city")) if isinstance(billing, dict) else ""
            if city != "":
                out["City"] = city
        except Exception:
            pass
    return out


async def all_picked_for_package(store, so, pkg) -> bool:
    picks = await store.find(PICK, lambda p: _text(p.get("SO")) == _text(so) and _text(p.get("Package_Order")) == _text(pkg), criteria=eq("SO", so))
    return len(picks) > 0 and all(truthy(p.get("Marked")) for p in picks)


async def picked_to_qc(args: dict) -> None:
    pick, store, user = args["record"], args["store"], args.get("user", "")
    so = _text(pick.get("SO"))
    if not truthy(pick.get("Marked")):
        await advance_stage(store, so, pick.get("Item_Name"), pick.get("SKU"), "Picking")
        return

    pac = _text(pick.get("Package_Order"))
    rr = _text(pick.get("RR"))
    fields = {
        "PR": pick.get("PR_if_any"), "Demo": pick.get("Demo"), "RR": pick.get("RR"), "Delivery_Type": pick.get("Delivery_Type"),
        "Order_Type": pick.get("Order_Type"), "Target_Delivery_Date": pick.get("Target_Delivery_Date"), "For_Crate": pick.get("For_Crate"),
        "Customer_Name": pick.get("Customer_Name"), "Customer_Address": pick.get("Customer_Address"), "Customer_Type": pick.get("Customer_Type"),
        "Item_Name": pick.get("Item_Name"), "Quantity": pick.get("Quantity_to_Pick"), "Bin_Location": pick.get("Bin_Location"),
        "Forecast_Delivery": pick.get("Forecast_Delivery"), "Forecast_Window": pick.get("Forecast_Window"), "Forecast_Status": pick.get("Forecast_Status"),
        **(await _customer_contact(store, so, pick.get("Item_Name"), pick.get("SKU"))),
    }
    pending = await store.find(QC, lambda c: c.get("SO") == so and c.get("SKU") == _text(pick.get("SKU")) and c.get("PAC") == pac and _text(c.get("RR")) == rr and _text(c.get("QC_Status")) == "" and not isinstance(c.get("Recheck_Exceptions"), list), criteria=eq("SO", so))
    if pending:
        for c in pending:
            await store.update_record(QC, c["ID"], fields, by_form=True)
    else:
        qc_sku = _text(pick.get("SKU"))
        visit_no = await next_visit_no(store, so, qc_sku, pac)
        await store.add_record(QC, {"SO": so, "PAC": pac, "SKU": qc_sku, "Visit_No": visit_no, **fields}, user)
    await advance_stage(store, so, pick.get("Item_Name"), pick.get("SKU"), "Pack & QC")


register(PICK, {"afterAdd": picked_to_qc, "afterUpdate": picked_to_qc})


# ---------- Catch-up for everything that did not come through a hook ----------
async def reconcile_fulfillment(store, *, user: str = "system") -> dict:
    done = {"gate": 0, "pick": 0, "qc": 0, "stage": 0}

    def same_item(sof, name, sku) -> bool:
        return any(_text(row.get("Item")) == _text(name) and _text(row.get("SKU")) == _text(sku) for row in sof.get("Item_Details1") or [])

    sofs = await store.find(SOF)
    gates = await store.find(GATE)
    for sof in sofs:
        pkg = _text(sof.get("Package"))
        if pkg == "":
            continue
        missing = any(not any(g.get("sales_order_number") == _text(sof.get("SO_No")) and g.get("SKU") == _text(row.get("SKU")) and g.get("Package_Order") == pkg for g in gates) for row in sof.get("Item_Details1") or [])
        if missing:
            await so_to_readiness({"record": sof, "store": store, "user": user})
            done["gate"] += 1
        stage = await package_stage(store, sof)
        if stage is not None and stage != sof.get("Fulfillment_Stage"):
            await set_stage(store, sof, stage, rescore=False)
            done["stage"] += 1

    picks0 = await store.find(PICK)
    gates = await store.find(GATE)
    for g in gates:
        if not truthy(g.get("Release")):
            continue
        has = any(p.get("SO") == g.get("sales_order_number") and p.get("SKU") == g.get("SKU") and p.get("Item_Name") == g.get("Item_Name") and p.get("Package_Order") == g.get("Package_Order") and _text(p.get("RR")) == _text(g.get("rr_number")) for p in picks0)
        if not has:
            await release_to_pick({"record": g, "store": store, "user": user})
            done["pick"] += 1

    picks = await store.find(PICK)
    qcs = await store.find(QC)
    for p in picks:
        if not truthy(p.get("Marked")):
            continue
        has = any(c.get("SO") == p.get("SO") and c.get("SKU") == _text(p.get("SKU")) and c.get("PAC") == _text(p.get("Package_Order")) and _text(c.get("RR")) == _text(p.get("RR")) for c in qcs)
        if not has:
            await picked_to_qc({"record": p, "store": store, "user": user})
            done["qc"] += 1

    sofs = await store.find(SOF)
    gate_rows = await store.find(GATE)
    pick_rows = await store.find(PICK)
    for sof in sofs:
        want = sof.get("Fulfillment_Stage")

        def at(stage):
            nonlocal want
            if STAGE_ORDER.index(stage) > STAGE_ORDER.index(want):
                want = stage

        for row in sof.get("Item_Details1") or []:
            if any(p.get("SO") == sof.get("SO_No") and same_item(sof, p.get("Item_Name"), p.get("SKU")) and truthy(p.get("Marked")) for p in pick_rows):
                at("Pack & QC")
            elif any(p.get("SO") == sof.get("SO_No") and same_item(sof, p.get("Item_Name"), p.get("SKU")) for p in pick_rows):
                at("Picking")
            elif any(g.get("sales_order_number") == sof.get("SO_No") and g.get("SKU") == _text(row.get("SKU")) and truthy(g.get("Release")) for g in gate_rows):
                at("Picking")
        if want != sof.get("Fulfillment_Stage"):
            await set_stage(store, sof, want, rescore=False)
            done["stage"] += 1

    if done["stage"]:
        from app.fulfillment.sorter import rescore_all   # once for the whole sweep, not once per package
        await rescore_all(store)
    return done
