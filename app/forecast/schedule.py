# The two daily forecast schedules, ported from server/forecast/schedule.mjs (itself from
# zoho-export/parsed/workflows/schedule/_/Forecast_Stamp_Daily and Backfill_PreOrder_Forecas, both
# 01:00 Asia/Manila in Node). NOT wired to any scheduler in this plan (see Global Constraints) --
# both functions below are plain async callables a later slice's cron wiring can call directly.
#
# Forecast_Stamp_Daily does what fc_stamp_by_so_no does on save, for EVERY order, but PER ITEM (one
# Sales_Order_Fulfillment row is one item, identified by PR + SKU via SO_SKU_Key). Forms with no SKU
# (Receiving, Order Aggregation, Service Request, Service Appointment) get the roll-up of the order:
# the LATEST date and WORST status across its items.
from datetime import date

from app.deluge import today_date
from app.forecast.engine import bucket_of, compute_forecast, finish
from app.forecast.forecast_settings import forecast_settings
from app.forecast.stamp import to_date, txt

_RANK = {"No Start Date": 1, "No Client Date": 2, "On Track": 3, "At Risk": 4, "Will Miss": 5, "Overdue": 6}


def _blank(v) -> bool:
    return v is None or v == ""


def _day_str(v) -> str:
    d = None if _blank(v) else to_date(v)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}" if d else ""


def _norm_sku(v) -> str:
    s = txt(v).strip().upper()
    if s == "NULL":
        s = ""
    if s.startswith("SKU:"):
        s = s.replace("SKU:", "").strip()
    return s


def _group(rows: list, key: str) -> dict:
    out: dict = {}
    for r in rows:
        out.setdefault(r.get(key), []).append(r)
    return out


async def _put(store, form: str, rows: list, f: dict) -> None:
    for row in rows:
        changes = {}
        want = f.get("delivery") or ""
        if _day_str(row.get("Forecast_Delivery")) != want:
            changes["Forecast_Delivery"] = want
        if (row.get("Forecast_Window") or "") != f["window"]:
            changes["Forecast_Window"] = f["window"]
        if (row.get("Forecast_Status") or "") != f["status"]:
            changes["Forecast_Status"] = f["status"]
        if changes:
            await store.update_record(form, row["ID"], changes, by_form=True)
            row.update(changes)


async def run_forecast_stamp_daily(store, *, today: date | None = None, log=lambda s: None) -> dict:
    settings = await forecast_settings(store)
    today = today or today_date()
    for s in await store.find("Schedule_Test_Settings"):
        if not _blank(s.get("Test_Current_Date")):
            today = to_date(s.get("Test_Current_Date")) or today

    ships = await store.find("Shipments")
    ship_by_id = {s["ID"]: s for s in ships}
    ship_by_pr: dict = {}
    for sh in ships:
        for row in sh.get("Supplier_Shipment_Details") or []:
            if _blank(row.get("PR_No")):
                continue
            pk = txt(row.get("PR_No"))
            ds = None if _blank(row.get("Date_Shipped")) else to_date(row.get("Date_Shipped"))
            cur = ship_by_pr.get(pk)
            if not cur or (ds and (not cur["date"] or ds < cur["date"])):
                ship_by_pr[pk] = {"id": sh["ID"], "date": ds, "status": txt(sh.get("Shipment_Status")), "mode": "" if _blank(row.get("Shipment_Mode")) else str(row.get("Shipment_Mode"))}

    sofs = await store.find("Sales_Order_Fulfillment")
    prs = await store.find("Purchase_Request1")
    gates = await store.find("Sales_Order_Readiness_Gate")
    picks = await store.find("Pick1")
    qcs = await store.find("Checker_Checklist")
    oas = await store.find("Order_Aggregation1")
    crates = await store.find("Crate_Checklist")
    receivings = await store.find("Receiving")
    srs = await store.find("Service_Request1")
    sas = await store.find("Service_Appointment_Form")

    pr_by_no = _group(prs, "PR_No")
    gate_by_so = _group(gates, "sales_order_number")
    pick_by_so = _group(picks, "SO")
    qc_by_so = _group(qcs, "SO")
    oa_by_so = _group(oas, "SO")
    crate_by_so = _group(crates, "SO")
    rcv_by_so = _group(receivings, "SO_No")
    sr_by_so = _group(srs, "Sales_Order")
    sa_by_so = _group(sas, "Sales_Order")

    sof_count = stamp_count = no_date_count = 0
    touched: set = set()
    best: dict = {}
    best_win: dict = {}
    worst: dict = {}
    worst_rank: dict = {}

    for sof in sofs:
        sof_count += 1
        so_no = txt(sof.get("SO_No"))
        pr_no = txt(sof.get("PR_No")).strip()
        if pr_no == "null":
            pr_no = ""
        has_pr = pr_no != ""
        key = txt(sof.get("SO_SKU_Key")).strip()
        if key == "null":
            key = ""
        sof_sku = ""
        if key != "":
            sof_sku = key.replace(f"{so_no}_", "", 1) if so_no != "" else key
            sof_sku = sof_sku.strip().upper()
            if sof_sku.startswith("SKU:"):
                sof_sku = sof_sku.replace("SKU:", "").strip()
        client_target = None if _blank(sof.get("target_delivery_date")) else to_date(sof.get("target_delivery_date"))

        pr_added = None
        sourcing = ""
        sup_lead = 0
        mode_val = txt(sof.get("Shipment_Mode"))
        if has_pr:
            pr_rows = pr_by_no.get(pr_no) or []
            if pr_rows:
                pr = pr_rows[0]
                if not _blank(pr.get("Added_Time")):
                    pr_added = to_date(pr.get("Added_Time"))
                sourcing = txt(pr.get("Sourcing_Type"))
                if not _blank(pr.get("Required_Days_Lead")):
                    try:
                        sup_lead = int(float(pr.get("Required_Days_Lead")))
                    except (TypeError, ValueError):
                        sup_lead = 0
                if _blank(mode_val):
                    mode_val = txt(pr.get("Shipment_Mode"))
        if not pr_added and not _blank(sof.get("SO_Created_Date")):
            pr_added = to_date(sof.get("SO_Created_Date"))

        date_shipped = None
        ship_status = ""
        ship_id = None
        ship = ship_by_pr.get(pr_no) if has_pr else None
        if ship:
            ship_id, date_shipped, ship_status = ship["id"], ship["date"], ship["status"]
            if _blank(mode_val):
                mode_val = ship["mode"]

        gate_recs = gate_by_so.get(so_no) or []
        pick_recs = pick_by_so.get(so_no) or []
        qc_recs = qc_by_so.get(so_no) or []
        oa_recs = oa_by_so.get(so_no) or []
        crate_recs = crate_by_so.get(so_no) or []

        def _hit(rows):
            return sof_sku != "" and any(_norm_sku(r.get("SKU")) == sof_sku for r in rows)

        sku_hit = {"gate": _hit(gate_recs), "pick": _hit(pick_recs), "qc": _hit(qc_recs), "crate": _hit(crate_recs)}

        def _matches(row, which, pr_field):
            if sku_hit[which]:
                return _norm_sku(row.get("SKU")) == sof_sku
            return not (has_pr and not _blank(row.get(pr_field)) and row.get(pr_field) != pr_no)

        m_gate = [r for r in gate_recs if _matches(r, "gate", "pr_number")]
        m_pick = [r for r in pick_recs if _matches(r, "pick", "PR_if_any")]
        m_qc = [r for r in qc_recs if _matches(r, "qc", "PR")]
        m_crate = [r for r in crate_recs if _matches(r, "crate", "PR_if_any")]

        prep_start = None
        for r in [*m_gate, *m_pick, *m_qc, *m_crate]:
            d = None if _blank(r.get("Added_Time")) else to_date(r.get("Added_Time"))
            if d and (not prep_start or d < prep_start):
                prep_start = d

        c = compute_forecast({
            "today": today, "settings": settings, "stage": txt(sof.get("Fulfillment_Stage")), "stockOnHand": not has_pr,
            "modeVal": mode_val, "sourcing": sourcing, "supLead": sup_lead, "prAdded": pr_added, "prepStart": prep_start,
            "prepFound": bool(prep_start), "dateShipped": date_shipped, "shipStatus": ship_status, "clientTarget": client_target,
        })
        f = {"delivery": None, "window": "Walang panimulang petsa", "status": "No Start Date"} if c["skip"] else {"delivery": c["delivery"], "window": c["window"], "status": c["status"]}
        if c["skip"]:
            no_date_count += 1
        else:
            stamp_count += 1

        rank = _RANK.get(f["status"], 0)
        row_win = f"{f['window']} | item {sof_sku}" if sof_sku != "" else f["window"]
        fresh = so_no not in touched
        roll_changed = fresh
        if fresh:
            touched.add(so_no)
            best_win[so_no] = row_win
            worst[so_no] = f["status"]
            worst_rank[so_no] = rank
            if f["delivery"] is not None:
                best[so_no] = f["delivery"]
        else:
            if f["delivery"] is not None:
                if so_no not in best:
                    best[so_no] = f["delivery"]
                    best_win[so_no] = row_win
                    roll_changed = True
                elif f["delivery"] > best[so_no]:
                    best[so_no] = f["delivery"]
                    best_win[so_no] = row_win
                    roll_changed = True
            if rank > worst_rank[so_no]:
                worst_rank[so_no] = rank
                worst[so_no] = f["status"]
                roll_changed = True
        roll = {"delivery": best.get(so_no, f["delivery"]), "window": best_win[so_no], "status": worst[so_no]}

        await _put(store, "Sales_Order_Fulfillment", [sof], f)
        if has_pr:
            await _put(store, "Purchase_Request1", pr_by_no.get(pr_no) or [], f)
        if ship_id is not None and ship_id in ship_by_id:
            await _put(store, "Shipments", [ship_by_id[ship_id]], f)
        if roll_changed and so_no != "":
            await _put(store, "Receiving", rcv_by_so.get(so_no) or [], roll)
        await _put(store, "Sales_Order_Readiness_Gate", m_gate, f)
        await _put(store, "Pick1", m_pick, f)
        await _put(store, "Checker_Checklist", m_qc, f)
        if roll_changed:
            await _put(store, "Order_Aggregation1", oa_recs, roll)
        await _put(store, "Crate_Checklist", m_crate, f)
        if roll_changed and so_no != "":
            await _put(store, "Service_Request1", sr_by_so.get(so_no) or [], roll)
            await _put(store, "Service_Appointment_Form", sa_by_so.get(so_no) or [], roll)

    sof_prs = {s.get("PR_No") for s in sofs}
    pr_only_count = 0
    for pr in prs:
        pr_no = txt(pr.get("PR_No"))
        if pr_no in sof_prs:
            continue
        pr_only_count += 1
        b = bucket_of(settings, txt(pr.get("Sourcing_Type")), txt(pr.get("Shipment_Mode")))
        t_min, t_max, c_min, c_max, bucket = b["tMin"], b["tMax"], b["cMin"], b["cMax"], b["bucket"]
        anchor = today
        found = False
        if not _blank(pr.get("Added_Time")) and to_date(pr.get("Added_Time")):
            anchor = to_date(pr.get("Added_Time"))
            found = True
        position = "Procurement"
        s_min = t_min + c_min + settings["prepMin"] + settings["delMin"]
        s_max = t_max + c_max + settings["prepMax"] + settings["delMax"]
        sh = ship_by_pr.get(pr_no)
        if settings["reAnchor"] and sh:
            if sh["status"] == "Delivered":
                anchor, found = today, True
                s_min, s_max = settings["prepMin"] + settings["delMin"], settings["prepMax"] + settings["delMax"]
                position = "At WH"
            elif sh["date"]:
                anchor, found, position = sh["date"], True, "In transit"
        elif settings["addSupLead"] and not _blank(pr.get("Required_Days_Lead")):
            try:
                lead = int(float(pr.get("Required_Days_Lead")))
            except (TypeError, ValueError):
                lead = 0
            s_min += lead
            s_max += lead
        if found:
            fin = finish({"today": today, "anchor": anchor, "sumMin": s_min, "sumMax": s_max, "bucket": bucket, "position": position, "clientTarget": None, "variance": False})
            f = {"delivery": fin["delivery"], "window": fin["window"], "status": fin["status"]}
        else:
            f = {"delivery": None, "window": "Walang panimulang petsa", "status": "No Start Date"}
        await _put(store, "Purchase_Request1", [pr], f)
        if sh and sh["id"] in ship_by_id:
            await _put(store, "Shipments", [ship_by_id[sh["id"]]], f)

    summary = {"sofCount": sof_count, "stampCount": stamp_count, "noDateCount": no_date_count, "prOnlyCount": pr_only_count, "today": _day_str(today)}
    log(f"FORECAST STAMP — {summary['today']} | SOF: {sof_count} | stamped: {stamp_count} | no start date: {no_date_count} | PR without SOF: {pr_only_count}")
    return summary


async def run_backfill_pre_order(store, *, log=lambda s: None) -> dict:
    forecast_by_pr: dict = {}
    for pr in await store.find("Purchase_Request1"):
        pr_no = txt(pr.get("PR_No"))
        if pr_no != "" and not _blank(pr.get("Forecast_Delivery")):
            forecast_by_pr[pr_no] = {"delivery": _day_str(pr.get("Forecast_Delivery")), "window": txt(pr.get("Forecast_Window")), "status": txt(pr.get("Forecast_Status"))}

    filled = no_pr = no_forecast = 0
    for po in await store.find("Pre_Order_FF"):
        pr_no = txt(po.get("PR"))
        if pr_no == "":
            no_pr += 1
        elif pr_no not in forecast_by_pr:
            no_forecast += 1
        else:
            await _put(store, "Pre_Order_FF", [po], forecast_by_pr[pr_no])
            filled += 1

    summary = {"prSeen": len(forecast_by_pr), "filled": filled, "noPr": no_pr, "noForecast": no_forecast}
    log(f"FORECAST PRE-ORDER BACKFILL — {summary['prSeen']} PR with a forecast | {filled} pre-order rows stamped | {no_pr} without PR | {no_forecast} PR without a forecast")
    return summary
