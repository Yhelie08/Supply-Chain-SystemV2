# Purchase Request, from the HomeCartel spec v1.4 (02 Procurement / 02 Purchase Request and Pricing,
# 05 Shared Engines 01, 03, 04). Added on top of the ported Zoho workflows (purchase_request.py), after them:
#   PR-R4  the supplier recommendation looks at price AND lead time against the target, and says why
#          in words
#   PR-R5  pricing status: needs_pricing / auto_priced / needs_manual_quote (the buyer is told when a
#          manual quote is needed)
#   PR-R6  feasibility on every PR: feasible / at_risk / impossible, the shortfall, the earliest date,
#          the air option
#   PR-R7  hold / resume / cancel need a reason and are stamped (Stage_Events); a PR is never deleted
#          (cancel it)
#   PR-R2  a Sales Order that Books voids puts its open PRs on hold at once
#   one state (Pr_State), Order Date (DT-1), and the sorting engine's category / rank / reason /
#   action on every open PR (SE-1..5)
# Ported from server/modules/procurement/pr-spec.mjs.
#
# Imports purchase_request first (not just logically, structurally): both modules register
# beforeAdd/beforeUpdate hooks on Purchase_Request1, and this file's recommend()/_before_save()
# read Supplier_Load_Balancing/Supplier_Selected fields that only exist once purchase_request.py's
# own validate() has run first on the same save (matches Node's workflows.mjs import order exactly:
# `import './purchase-request.mjs'` before `import './pr-spec.mjs'`). Without this explicit import,
# whichever module some other code path happens to import first (e.g. ship_track.py's lazy import of
# rollup_pr_forecast) silently decides the hook order for the rest of the process.
import app.procurement.purchase_request  # noqa: F401,E402

from app.criteria import ZohoError, zoho_now
from app.deluge import add_days, blank, day_diff, id_of, num_text, parse_date, to_num, today_date, truthy, ymd
from app.procurement.decisions_core import notify
from app.procurement.events import log_event, parse_when
from app.procurement.plan import feasibility, load_settings, norm_mode, parse_lead_days, supplier_days_from
from app.procurement.sorting import rank
from app.procurement.suppliers import supplier_index
from app.workflows import register

PR = "Purchase_Request1"
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _text(v) -> str:
    return "" if (blank(v) or str(v) == "null") else str(v)


def _to_day(v):
    w = parse_when(v)
    if w:
        return w["date"].date()
    return parse_date(v)


def _dm(d) -> str:
    return f"{d.day} {_MON[d.month - 1]}"


# What only the server may write.
PR_SERVER_ONLY = ["Order_Date", "Pr_State", "Pricing_Status", "Feasibility", "Shortfall_Days", "Earliest_Feasible_Date", "Air_Option", "Recommended_Supplier_Id",
                  "Recommendation_Reason", "Recommended_Supplier", "Selected_Supplier_Id", "Pr_Category", "Blocked_Reason", "Queue_Rank", "Priority_Reason", "Suggested_Action", "Scored_At", "Pr_Forecast_Pickable"]


def pr_state(r: dict) -> str:
    if _text(r.get("Hold_Status")) == "Cancelled":
        return "cancelled"
    if _text(r.get("PR_Status")) == "Converted to PO":
        return "converted"
    if _text(r.get("Hold_Status")) == "On Hold":
        return "on_hold"
    if truthy(r.get("PR_READY_FOR_PO")):
        return "ready_for_po"
    return "open"


async def order_date_of(store, pr: dict):
    so = _text(pr.get("Sales_Order"))
    if so == "":
        return _to_day(pr.get("Added_Time")) or today_date()  # a manual PR (stock, no customer order): its creation date is the Order Date (spec, review #19)
    best = None
    for r in await store.find("Sales_Order_Fulfillment", lambda x: _text(x.get("SO_No")) == so):
        d = _to_day(r.get("SO_Created_Date"))
        if d and (not best or d < best):
            best = d
    return best or _to_day(pr.get("Added_Time")) or today_date()


# ---------- the supplier recommendation (PR-R4) ----------
def _price_of(q: dict):
    if to_num(q.get("Negotiated")) > 0:
        return to_num(q.get("Negotiated"))
    if to_num(q.get("Initial_Price")) > 0:
        return to_num(q.get("Initial_Price"))
    return None


# rows = the Supplier_Selected quotes, lb = the eligible suppliers. Returns {winner_id, reason, cands}.
async def recommend(*, lb: list, sel: list, names: dict, settings: dict, supplier_rows: list, target, mode, today) -> dict:
    cands = []
    for r in lb:
        if r.get("Match_Category") != "Match":
            continue
        sid = id_of(r.get("Suppliers"))
        q = next((x for x in sel if _text(x.get("Supplier_ID")) == sid and _text(x.get("Availability")) not in ("Unavailable", "Cannot Produce")), None)
        price = _price_of(q) if q else None
        lead = parse_lead_days(q.get("Lead_Time")) if (q and parse_lead_days(q.get("Lead_Time")) > 0) else None
        if price is None:
            continue
        name = names.get(sid, sid)
        if target:
            f = feasibility({**settings, **(await supplier_days_from(supplier_rows, name))}, po_date=today, production_days=lead, mode=mode, target=target)
        else:
            f = {"feasibility": None}
        cands.append({"id": sid, "name": name, "price": price, "lead": lead, "f": f})
    if not cands:
        return {"winner_id": "", "reason": "No supplier has quoted a price yet.", "cands": cands}
    known = [c for c in cands if c["f"].get("feasibility")]
    in_time = [c for c in known if c["f"]["shortfall_days"] <= 0]

    def _cheapest(lst):
        return sorted(lst, key=lambda c: (c["price"], c["lead"] if c["lead"] is not None else 1e9))[0]

    if not known:
        w = _cheapest(cands)
        lead_text = f", lead {w['lead']} days" if w["lead"] else ""
        return {"winner_id": w["id"], "reason": f"{w['name']}: CNY {num_text(w['price'])}{lead_text}. There is no target date to compare with, so it is chosen on price and lead time.", "cands": cands}
    if in_time:
        w = _cheapest(in_time)
        late = [f"{c['name']} is cheaper (CNY {num_text(c['price'])}) but would be {c['f']['shortfall_days']} days late" for c in known if c["f"]["shortfall_days"] > 0 and c["price"] < w["price"]]
        late_text = f" {'; '.join(late)}." if late else ""
        return {"winner_id": w["id"], "reason": f"{w['name']}: CNY {num_text(w['price'])}, lead {w['lead'] if w['lead'] is not None else 'not quoted'} days, arrives in time ({w['f']['slack_days']} days of slack).{late_text}", "cands": cands}
    w = sorted(known, key=lambda c: (c["f"]["shortfall_days"], c["price"]))[0]
    air_text = f" {w['f']['air_option']}." if w["f"].get("air_option") else ""
    return {"winner_id": w["id"], "reason": f"No supplier can make the date. {w['name']} is the closest: {w['f']['shortfall_days']} days late (earliest {w['f']['earliest_feasible_date']}), CNY {num_text(w['price'])}, lead {w['lead'] if w['lead'] is not None else 'not quoted'} days.{air_text}", "cands": cands}


# ---------- before the save ----------
async def _before_save(args: dict) -> None:
    input_, previous, store, user = args["input"], args.get("previous"), args["store"], args.get("user", "")
    for f in PR_SERVER_ONLY:
        input_.pop(f, None)
    rec = {**(previous or {}), **input_}
    # PR-R7: hold / cancel need a reason; a held PR cannot be grouped, a cancelled one is closed
    was, now = _text((previous or {}).get("Hold_Status")), _text(rec.get("Hold_Status"))
    if now != was and now in ("On Hold", "Cancelled") and _text(rec.get("Hold_Reason")).strip() == "":
        raise ZohoError(2001, f"A reason is required to {'cancel' if now == 'Cancelled' else 'put on hold'} this PR.")
    if was == "Cancelled" and now != "Cancelled":
        raise ZohoError(2001, "A cancelled PR stays cancelled. Raise a new PR.")
    if now != was and now in ("On Hold", "Cancelled"):
        if blank(input_.get("Hold_Date")):
            input_["Hold_Date"] = ymd(today_date())
        if blank(input_.get("Held_By")):
            input_["Held_By"] = user or ""

    settings = await load_settings(store)
    today = today_date()
    suppliers = await supplier_index(store)
    supplier_rows = await store.find("Suppliers")
    names = {s["id"]: s["display_name"] for s in suppliers.values()}
    mode = norm_mode(rec.get("Shipment_Mode"))
    target = _to_day(rec.get("Target_Delivery"))

    # the recommendation, in words (the winner of the ported rule is replaced: it chose the cheapest
    # whatever the date)
    lb = [dict(r) for r in (rec.get("Supplier_Load_Balancing") or [])]
    sel = rec.get("Supplier_Selected") or []
    r = await recommend(lb=lb, sel=sel, names=names, settings=settings, supplier_rows=supplier_rows, target=target, mode=mode, today=today)
    for row in lb:
        if row.get("Match_Category") == "Match":
            row["Eligible_Supplier"] = "Recommended" if id_of(row.get("Suppliers")) == r["winner_id"] else "Available"
    if lb:
        input_["Supplier_Load_Balancing"] = lb
    input_["Recommended_Supplier_Id"] = r["winner_id"]
    input_["Recommended_Supplier"] = names.get(r["winner_id"], "") if r["winner_id"] else ""
    input_["Recommendation_Reason"] = r["reason"]

    # the selected supplier by ID, never by name (spec INQ-R6)
    chosen_rows = [q for q in sel if truthy(q.get("Selected"))]
    chosen = chosen_rows[-1] if chosen_rows else None
    input_["Selected_Supplier_Id"] = _text(chosen.get("Supplier_ID")) if chosen else ""

    # feasibility on every PR (PR-R6): the selected supplier's lead time, else the recommended one's
    lead_sel = to_num(rec.get("Required_Days_Lead")) if to_num(rec.get("Required_Days_Lead")) > 0 else next((c["lead"] for c in r["cands"] if c["id"] == r["winner_id"]), None) or 0
    supplier_name = _text(rec.get("Selected_Supplier")) or names.get(r["winner_id"], "") or ""
    po_date = add_days(_to_day(rec.get("Production_Date")), -1) if (_text(rec.get("PR_Status")) == "Converted to PO" and _to_day(rec.get("Production_Date"))) else today
    f = feasibility({**settings, **(await supplier_days_from(supplier_rows, supplier_name))}, po_date=po_date, production_days=lead_sel or None, mode=mode, target=target)
    if f.get("feasibility"):
        input_.update({"Feasibility": f["feasibility"], "Shortfall_Days": f["shortfall_days"], "Earliest_Feasible_Date": f.get("earliest_feasible_date") or "", "Air_Option": f.get("air_option") or ""})
    else:
        input_.update({"Feasibility": "", "Shortfall_Days": "", "Earliest_Feasible_Date": "", "Air_Option": ""})

    # pricing status (PR-R5): the pricing tool is outside this system; a price from an SRP / final
    # cost / inquiry counts as priced
    priced = truthy(rec.get("Final_price_confirmed")) or to_num(rec.get("SRP_Approved_PR")) > 0 or to_num(rec.get("Selcted_Final_Cost")) > 0 or not blank(rec.get("inquiry_reference"))
    input_["Pricing_Status"] = "auto_priced" if priced else ("needs_pricing" if r["cands"] else "needs_manual_quote")

    order_date = await order_date_of(store, rec)
    input_["Order_Date"] = ymd(order_date) if order_date else ""
    input_["Pr_State"] = pr_state({**rec, **input_})


# ---------- after the save ----------
_EVENT_OF = {"held": "pr.held", "resumed": "pr.resumed", "cancelled": "pr.cancelled", "converted": "pr.converted", "ready_for_po": "pr.ready_for_po"}


async def _after_save(args: dict) -> None:
    id_, record, previous, store, user = args.get("id"), args["record"], args.get("previous"), args["store"], args.get("user", "")

    async def log(event: str, note: str = "") -> None:
        await log_event(store, record_type="pr", record_id=id_, record_no=record.get("PR_No"), event=event, occurred_at=zoho_now(), source="user", actor=user or "", note=note)

    if not previous:
        await log_event(store, record_type="pr", record_id=id_, record_no=record.get("PR_No"), event="pr.created", occurred_at=_text(record.get("Added_Time")) or zoho_now(), source="user", actor=user or "")
    before = pr_state(previous) if previous else None
    after = pr_state(record)
    if before != after:
        if after == "on_hold":
            await log(_EVENT_OF["held"], _text(record.get("Hold_Reason")))
        elif after == "cancelled":
            await log(_EVENT_OF["cancelled"], _text(record.get("Hold_Reason")))
        elif before == "on_hold":
            await log(_EVENT_OF["resumed"])
        if after == "ready_for_po" and before != "ready_for_po":
            await log(_EVENT_OF["ready_for_po"])
        if after == "converted":
            await log(_EVENT_OF["converted"], _text(record.get("Link_PO_No")))
    if _text(record.get("Pricing_Status")) == "needs_manual_quote" and _text((previous or {}).get("Pricing_Status")) != "needs_manual_quote":
        await notify(store, await load_settings(store), ship={"Shipment_No": record.get("PR_No"), "ID": id_}, type="PR Needs Manual Quote", message=f"{record.get('PR_No')} has no price: it needs a manual quote.")
    await rescore_prs(store)


# The supplier's answer reaches the buyer's PR through the server's own write (no hooks): work out
# the spec fields (recommendation in words, feasibility, pricing status, state) at once, not at the
# buyer's next save.
async def refresh_pr_spec(store, pr_id) -> None:
    previous = await store.get_record_by_id(PR, pr_id, raw=True)
    input_: dict = {}
    await _before_save({"input": input_, "previous": previous, "id": pr_id, "store": store, "user": ""})
    diff = {k: v for k, v in input_.items() if v != previous.get(k)}
    if diff:
        await store.update_record(PR, pr_id, diff, by_form=True)
    await rescore_prs(store)


async def _before_delete(args: dict) -> None:
    raise ZohoError(2001, "A PR is never deleted: cancel it with a reason (Hold Status = Cancelled).")


register(PR, {
    "beforeAdd": _before_save, "beforeUpdate": _before_save, "afterAdd": _after_save, "afterUpdate": _after_save,
    "beforeDelete": _before_delete,
})


# PR-R2: Books voids or cancels the Sales Order -> its open PRs go on hold at once, with the reason.
async def _hold_for_voided_so(args: dict) -> None:
    record, previous, store = args["record"], args.get("previous"), args["store"]

    def _status(v) -> str:
        return _text(v).lower()

    def _is_void(v) -> bool:
        return _status(v) in ("void", "voided", "cancelled", "canceled")

    if not _is_void(record.get("Order_Status")) or _is_void((previous or {}).get("Order_Status")):
        return
    so = _text(record.get("Sales_Order_Number"))
    if so == "":
        return
    held = 0
    for pr in await store.find(PR, lambda p: _text(p.get("Sales_Order")) == so and pr_state(p) not in ("converted", "cancelled", "on_hold")):
        await store.update_record(PR, pr["ID"], {"Hold_Status": "On Hold", "Hold_Reason": "SO voided in Books", "Hold_Date": ymd(today_date()), "Held_By": "books_sync", "Pr_State": "on_hold"}, by_form=True)
        await log_event(store, record_type="pr", record_id=pr["ID"], record_no=pr.get("PR_No"), event="pr.held", occurred_at=zoho_now(), source="sync", note="SO voided in Books")
        held += 1
    if held:
        await rescore_prs(store)


register("Sales_Order", {"afterUpdate": _hold_for_voided_so})


# ---------- the sorting engine for PRs ----------
def categorise_pr(pr: dict, settings: dict, today) -> dict:
    order_date = _to_day(pr.get("Order_Date")) or _to_day(pr.get("Added_Time"))
    target = _to_day(pr.get("Target_Delivery"))
    out = {"category": "on_track", "blocked_reason": "", "priority_reason": "", "suggested_action": ""}
    parts = [f"SO dated {_dm(order_date)} ({day_diff(today, order_date)} days)" if order_date else "no order date"]
    state = pr_state(pr)
    reasons = []
    if state == "on_hold":
        reasons.append(f"on hold: {_text(pr.get('Hold_Reason')) or 'no reason'}")
    else:
        if not truthy(pr.get("Selected_Supplier1")):
            reasons.append("no supplier selected")
        if not truthy(pr.get("Final_price_confirmed")):
            reasons.append("no price")
        if not truthy(pr.get("Shipping_mode_selected")):
            reasons.append("no shipment mode")
        if not truthy(pr.get("Target_date_exists")):
            reasons.append("no target date")
    f = _text(pr.get("Feasibility"))
    if state == "on_hold":
        out["category"] = "blocked"
        out["blocked_reason"] = ", ".join(reasons)
        out["suggested_action"] = "Resume or cancel it"
    elif f == "impossible":
        out["category"] = "act_now"
        out["suggested_action"] = f"{pr.get('Air_Option')}; or move the target to {_text(pr.get('Earliest_Feasible_Date'))}" if pr.get("Air_Option") else f"Choose a faster supplier or move the target to {_text(pr.get('Earliest_Feasible_Date'))}"
    elif reasons:
        out["category"] = "blocked"
        out["blocked_reason"] = ", ".join(reasons)
        out["suggested_action"] = "Get a manual quote" if _text(pr.get("Pricing_Status")) == "needs_manual_quote" else f"Complete it: {', '.join(reasons)}"
    elif f == "at_risk":
        out["category"] = "watch"
        out["suggested_action"] = "Raise the PO soon: little slack"
    elif state == "ready_for_po":
        out["suggested_action"] = "Ready: add it to a PO"
    if f:
        parts.append(f"{_text(pr.get('Shortfall_Days'))} days late if raised today" if f == "impossible" else ("little slack" if f == "at_risk" else "feasible"))
    if out["blocked_reason"]:
        parts.append(f"blocked: {out['blocked_reason']}")
    out["priority_reason"] = " · ".join(parts)
    return {**out, "order_date": order_date, "target": target}


# Re-scores every open PR (the whole list, SE-3) and writes only what changed.
async def rescore_prs(store, *, today=None) -> dict:
    today = today or today_date()
    settings = await load_settings(store)
    open_prs = await store.find(PR, lambda p: pr_state(p) not in ("converted", "cancelled"))
    scored = [{"p": p, "c": categorise_pr(p, settings, today)} for p in open_prs]
    ranks = rank([{"id": str(x["p"]["ID"]), "no": x["p"].get("PR_No"), "category": x["c"]["category"], "order_date": x["c"]["order_date"], "target": x["c"]["target"]} for x in scored])
    changed = 0
    for x in scored:
        p, c = x["p"], x["c"]
        want = {"Pr_Category": c["category"], "Blocked_Reason": c["blocked_reason"], "Queue_Rank": ranks.get(str(p["ID"]), ""), "Priority_Reason": c["priority_reason"], "Suggested_Action": c["suggested_action"]}
        diff = {k: v for k, v in want.items() if _text(v) != _text(p.get(k))}
        if not diff:
            continue
        await store.update_record(PR, p["ID"], {**diff, "Scored_At": zoho_now()}, by_form=True)
        changed += 1
    return {"scored": len(scored), "changed": changed}


# An arrival/ladder update on a shipment re-forecasts the whole shipment, but a shipment can carry
# lines of several Sales Orders (several PRs grouped onto one PO, PO-R4). Spec 05 Shared Engines 03:
# the forecast must reach every Sales Order behind the shipment, not just the shipment record, so it
# also lands on each PR named in the shipment's PO_Shipments lines (PR_No). When a PR's lines are
# split across more than one shipment, the latest pickable date wins (the same "worst case shown"
# rule rollup_po_categories already uses for a PO's own shipments).
async def rollup_pr_forecast(store, ships: list) -> int:
    by_pr: dict = {}
    for s in ships:
        forecast = _text(s.get("Forecast_Pickable"))[:10]
        if not forecast:
            continue
        for l in s.get("PO_Shipments") or []:
            pr_no = _text(l.get("PR_No"))
            if not pr_no:
                continue
            if pr_no not in by_pr or by_pr[pr_no] < forecast:
                by_pr[pr_no] = forecast
    if not by_pr:
        return 0
    changed = 0
    for p in await store.find(PR, lambda x: _text(x.get("PR_No")) in by_pr):
        forecast = by_pr.get(_text(p.get("PR_No")), "")
        if _text(p.get("Pr_Forecast_Pickable")) == forecast:
            continue
        await store.update_record(PR, p["ID"], {"Pr_Forecast_Pickable": forecast}, by_form=True)
        changed += 1
    return changed
