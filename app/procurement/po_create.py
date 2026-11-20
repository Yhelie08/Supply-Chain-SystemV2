# "Create PO" (custom API approve_po_main), from the HomeCartel spec v1.4 (02 Procurement / 03
# Purchase Order and Feasibility Gate):
#   PO-R4  one PO = one supplier = one mode: the ready PRs are grouped by supplier ID + mode (several
#          Sales Orders can share a PO); lines of another mode, or another supplier, go on their own
#          PO. The supplier is found by ID (name, other name, or a careful whole-word start), never
#          by a part of a name (INQ-R6)
#   PO-R1  the feasibility gate: warn and suggest, do not block. A line that cannot arrive in time
#          needs an option before anything is written: A) air  B) propose a new target (goes to the
#          Decisions list, the target changes only if it is accepted)  C) proceed
#   PO-R3  born_late, shortfall_days and a note on the PO; the born-late rate is read from these
#   DT-1   earliest Order Date and target on the PO; production planned start = PO date + 1 (was:
#          the same day)
# Everything else is the port of approve_po_main (PRs of the same PR_No are never added twice; hold /
# cancelled / override rules unchanged). Not done here: the PO in Zoho Books when sent (PO-R6, on
# hold with the Books calls). Ported from server/modules/procurement/po-create.mjs.
from app.criteria import zoho_now
from app.deluge import add_days, blank, id_of, to_num, today_date, truthy, ymd
from app.procurement.decisions_core import prepare_item
from app.procurement.events import log_event
from app.procurement.plan import feasibility, load_settings, norm_mode, resolve_supplier, supplier_days_from

PO = "Purchase_Order"
PR = "Purchase_Request1"
CHOICES = ["air", "move_target", "proceed"]


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _today() -> str:
    return ymd(today_date())


def _round0(v) -> int:
    return round(to_num(v))


def _ok(message: str, **extra) -> dict:
    return {"status": "success", "message": message, **extra}


def _fail(message: str) -> dict:
    return {"status": "error", "message": message}


async def _by_id(store, form, ref):
    id_ = id_of(ref)
    if id_ == "":
        return None
    try:
        return await store.get_record_by_id(form, id_, raw=True)
    except Exception:
        return None


async def approve_po_main(payload: dict, store, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    payload = payload or {}
    so_no = _text(payload.get("soNo"))
    wanted = [_text(x) for x in (payload.get("prNos") if isinstance(payload.get("prNos"), list) else []) if _text(x)]
    if so_no == "" and not wanted:
        return _fail("soNo (or a list of PR numbers) is required.")
    choices = payload.get("lateChoices") if isinstance(payload.get("lateChoices"), dict) else {}

    def _ready(p) -> bool:
        return not truthy(p.get("PR_Approved")) and truthy(p.get("PR_READY_FOR_PO"))

    if so_no != "":
        found = await store.find(PR, lambda p: _text(p.get("Sales_Order")) == so_no and _ready(p))
    else:
        found = await store.find(PR, lambda p: _text(p.get("PR_No")) in wanted and _ready(p))

    skipped = ""
    eligible = []
    for pr in found:
        if _text(pr.get("Hold_Status")) in ("On Hold", "Cancelled"):
            skipped += f"{pr.get('PR_No')} ({pr.get('Hold_Status')}), "
            continue
        if _text(pr.get("Followed_Recommendation")) == "No" and _text(pr.get("Override_Reason")) == "":
            skipped += f"{pr.get('PR_No')}, "
            continue
        eligible.append(pr)
    label = so_no if so_no != "" else ", ".join(wanted)
    if not eligible and skipped == "":
        return {"status": "empty", "message": f"No eligible PRs found for {label}"}

    settings = await load_settings(store)
    supplier_rows = await store.find("Suppliers")

    async def evaluate(pr: dict) -> dict:
        eff = {**settings, **(await supplier_days_from(supplier_rows, _text(pr.get("Selected_Supplier"))))}
        lead = to_num(pr.get("Required_Days_Lead")) if to_num(pr.get("Required_Days_Lead")) > 0 else None
        return feasibility(eff, po_date=today_date(), production_days=lead, mode=norm_mode(pr.get("Shipment_Mode")), target=pr.get("Target_Delivery"))

    # ---- the feasibility gate: nothing is written until every late line has an option ----
    late = []
    late_f: dict = {}  # PR_No -> feasibility at the gate
    for pr in eligible:
        if _text(pr.get("Target_Delivery")) == "":
            continue
        f = await evaluate(pr)
        if f.get("feasibility") == "impossible":
            late.append(pr)
            late_f[_text(pr.get("PR_No"))] = f
    late_pr_nos = {_text(pr.get("PR_No")) for pr in late}
    pending = [pr for pr in late if choices.get(_text(pr.get("PR_No"))) not in CHOICES]
    if pending:
        lines = []
        for pr in late:
            f = late_f[_text(pr.get("PR_No"))]
            lines.append({"pr_no": _text(pr.get("PR_No")), "supplier": _text(pr.get("Selected_Supplier")), "mode": norm_mode(pr.get("Shipment_Mode")), "target": _text(pr.get("Target_Delivery")),
                          "shortfall_days": f["shortfall_days"], "earliest_feasible_date": f["earliest_feasible_date"], "air_option": f.get("air_option") or "",
                          "can_air": norm_mode(pr.get("Shipment_Mode")) != "Airfreight", "chosen": choices.get(_text(pr.get("PR_No")), "")})
        return {"status": "needs_choice", "message": f"{len(pending)} line(s) cannot arrive in time for the customer's promise. Choose an option for each one, then create the PO.", "lines": lines}

    notes = []
    born_late: dict = {}  # PR_No -> shortfall left after the choice
    gate_late: dict = {}  # PR_No -> shortfall AT THE GATE, before any option (spec: born late = late when the PO is raised)
    for i, pr in enumerate(eligible):
        choice = choices.get(_text(pr.get("PR_No")))
        if _text(pr.get("PR_No")) not in late_pr_nos:
            continue
        before = late_f[_text(pr.get("PR_No"))]
        if choice == "air":
            await store.update_record(PR, pr["ID"], {"Shipment_Mode": "Airfreight", "Shipment_Days": 14}, by_form=True)
            eligible[i] = await store.get_record_by_id(PR, pr["ID"], raw=True)
            pr = eligible[i]
        elif choice == "move_target":
            await prepare_item(store, settings, kind="forecast_promise_change", record_type="pr", record_id=pr["ID"], record_no=pr.get("PR_No"), options=["accept_target", "keep_target"],
                                payload={"proposed_target": before["earliest_feasible_date"], "from": "create_po"},
                                summary=f"{pr.get('PR_No')}: it cannot arrive in time for {_text(pr.get('Target_Delivery'))}. The earliest it can be delivered is {before['earliest_feasible_date']}. Accept that as the new target (and tell the customer), or keep the target.")
        gate_late[_text(pr.get("PR_No"))] = before["shortfall_days"]
        after = await evaluate(pr)
        left = after["shortfall_days"] if after.get("feasibility") == "impossible" else 0
        if left > 0:
            born_late[_text(pr.get("PR_No"))] = left
        chose_text = (f"air ({f'still {left} days late' if left > 0 else 'on time'})" if choice == "air" else ("propose a new target" if choice == "move_target" else "proceed as is"))
        notes.append(f"{pr.get('PR_No')}: {before['shortfall_days']} days late; chose {chose_text}")

    # ---- group by supplier ID + mode ----
    groups: dict = {}
    unmatched = set()
    for pr in eligible:
        name = _text(pr.get("Selected_Supplier"))
        resolved = resolve_supplier(supplier_rows, name)
        if not resolved and name != "":
            unmatched.add(name)
        mode = "" if _text(pr.get("Shipment_Mode")) == "" else norm_mode(pr.get("Shipment_Mode"))
        key = f"{resolved['row']['ID'] if resolved else f'name:{name.lower()}'}|{mode}"
        groups.setdefault(key, {"name": name, "row": resolved["row"] if resolved else None, "mode": mode, "prs": []})
        groups[key]["prs"].append(pr)

    approved = ""
    created = []
    for g in groups.values():
        # a PR that already has its line on a PO is only linked (nothing is made twice)
        fresh = []
        for pr in g["prs"]:
            already_list = await store.find(PO, lambda p: any(_text(ln.get("PR_No")) == _text(pr.get("PR_No")) for ln in (p.get("PO_Line_Items") or [])))
            already = already_list[0] if already_list else None
            if already:
                await store.update_record(PR, pr["ID"], {"PR_Status": "Converted to PO", "Link_PO_No": already.get("PO_No"), "PR_Approved": True}, by_form=True)
                approved += f"{pr.get('PR_No')} -> {already.get('PO_No')}; "
            else:
                fresh.append(pr)
        if not fresh:
            continue

        first = fresh[0]
        customers = []
        for pr in fresh:
            c_rec = await _by_id(store, "Customer", pr.get("Customer"))
            c = _text((c_rec or {}).get("customer_name"))
            if c and c not in customers:
                customers.append(c)
        so_matches = await store.find("Sales_Order", lambda s: _text(s.get("Sales_Order_Number")) == _text(first.get("Sales_Order")))
        so_rec = so_matches[0] if so_matches else None
        so_id = so_rec["ID"] if so_rec else await store.add_record("Sales_Order", {"Sales_Order_Number": first.get("Sales_Order")}, ctx.get("user", ""))
        orders = sorted(x for x in (_text(p.get("Order_Date")) for p in fresh) if x)
        targets = sorted(x for x in (_text(p.get("Target_Delivery")) for p in fresh) if x)
        gate = [gate_late.get(_text(p.get("PR_No")), 0) for p in fresh]
        po_no = await store.next_number(PO, "PO_No", "PO-")
        id_ = await store.add_record(PO, {
            "PO_No": po_no, "Customer": (customers[0] if len(customers) <= 1 else f"{len(customers)} customers") if customers else "", "Customer_Type": first.get("Customer_Type"), "Sales_Owner": first.get("Sales_Owner"),
            "PO_Date": _today(), "PO_Status": "Draft", "SO_No": so_id, "Supplier_Id": str(g["row"]["ID"]) if g["row"] else "", "Supplier_Name": g["name"], "Shipment_Mode": g["mode"],
            "Earliest_Order_Date": orders[0] if orders else "", "Earliest_Target": targets[0] if targets else "", "Born_Late": any(n > 0 for n in gate), "Shortfall_Days": max([0, *gate]), "Lines_Raised": len(fresh), "Lines_Born_Late": len([n for n in gate if n > 0]),
            "Feasibility_Note": "\n".join(n for n in notes if any(n.startswith(f"{p.get('PR_No')}:") for p in fresh)), "Po_State": "sent",
        }, ctx.get("user", ""))
        created.append(po_no)

        lines = []
        srp_rate = None
        for pr in fresh:
            item = await _by_id(store, "Items", pr.get("Items"))
            rate = 0 if blank(pr.get("Selcted_Final_Cost")) else to_num(pr.get("Selcted_Final_Cost"))
            qty = _round0(pr.get("quantity"))
            line = {
                "PR_No": pr.get("PR_No"), "Supplier": g["name"], "Item": _text((item or {}).get("item_name")), "SKU": pr.get("sku"), "QTY": qty, "Unit": pr.get("unit"), "Final_Price": rate, "Line_Total": qty * _round0(rate),
                "Shipping_Mode": pr.get("Shipment_Mode"), "Target_Delivery": pr.get("Target_Delivery"), "supplier_target_date": pr.get("supplier_target_date"), "Delay_Status": pr.get("Delay_Status"),
                "Required_Days_Lead": pr.get("Required_Days_Lead"), "Remaining_Days": pr.get("Remaining_Days"), "Followed_Recommendation": pr.get("Followed_Recommendation"),
                "Override_Reason": pr.get("Override_Reason"), "Priority": pr.get("Priority"), "Production_Date": ymd(add_days(today_date(), 1)),  # production starts PO date + 1 (spec PO-R5)
            }
            if item and to_num(item.get("Rate")) != 0:
                line["SRP_Rate_PO"] = _round0(item.get("Rate"))
                if srp_rate is None:
                    srp_rate = _round0(item.get("Rate"))
            if item and not blank(item.get("Image")):
                line["Item_Image"] = item["Image"]
            lines.append(line)
        mine = g["row"]
        await store.update_record(PO, id_, {
            "Sales_Owner": first.get("Sales_Owner"), **({"SRP_Rate": srp_rate} if srp_rate is not None else {}), "PO_Line_Items": lines,
            "Total_PO_Value": sum(0 if blank(l.get("Line_Total")) else to_num(l.get("Line_Total")) for l in lines), "Total_Lines": len(lines), "Sent_On": zoho_now(), "Is_Locked": True,
            "Supplier_Load_At_PO": to_num(mine.get("Active_PO_Count")) if mine else 0,
        }, by_form=True)
        for pr in fresh:
            await store.update_record(PR, pr["ID"], {"PR_Status": "Converted to PO", "Link_PO_No": po_no, "Production_Date": ymd(add_days(today_date(), 1)), "PR_Approved": True, "Last_Update": zoho_now(), "Pr_State": "converted"}, by_form=True)
            await log_event(store, record_type="pr", record_id=pr["ID"], record_no=pr.get("PR_No"), event="pr.converted", occurred_at=zoho_now(), source="user", actor=ctx.get("user", ""), note=po_no)
            approved += f"{pr.get('PR_No')} -> {po_no}; "
        await log_event(store, record_type="po", record_id=id_, record_no=po_no, event="po.created", occurred_at=zoho_now(), source="user", actor=ctx.get("user", ""))
        await log_event(store, record_type="po", record_id=id_, record_no=po_no, event="po.sent", occurred_at=zoho_now(), source="user", actor=ctx.get("user", ""))

        if mine:  # the supplier's load: how many open PO lines it has now (found by supplier ID)
            active = 0
            for po in await store.find(PO, lambda p: _text(p.get("PO_Status")) not in ("Completed", "Cancelled")):
                if _text(po.get("Supplier_Id")) != "":
                    po_supplier = str(po.get("Supplier_Id")) == str(mine["ID"])
                else:
                    first_line = (po.get("PO_Line_Items") or [{}])[0] if po.get("PO_Line_Items") else {}
                    resolved = resolve_supplier(supplier_rows, _text(first_line.get("Supplier")))
                    po_supplier = bool(resolved) and resolved["row"]["ID"] == mine["ID"]
                if po_supplier:
                    active += len(po.get("PO_Line_Items") or [])
            await store.update_record("Suppliers", mine["ID"], {"Active_PO_Count": active}, by_form=True)

    if approved == "" and skipped == "":
        return {"status": "empty", "message": f"No eligible PRs found for {label}"}
    message = f"Approved: {approved}"
    if skipped != "":
        message += f" | Skipped (needs Override Reason, or On Hold/Cancelled): {skipped}"
    if unmatched:
        message += f" | Supplier not in the Suppliers list (add it, or an other name for it): {', '.join(unmatched)}"
    return _ok(message, pos=created, born_late=list(born_late.keys()), unmatched_suppliers=list(unmatched))
