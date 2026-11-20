import re
import pytest
from app.deluge import add_days, ymd, today_date
from app.procurement.plan import parse_lead_days

TODAY = today_date()


def day(n: int) -> str:
    return ymd(add_days(TODAY, n))


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("TONY_PORTAL_EMAIL", "tony@example.test")
    monkeypatch.setenv("FENTENG_PORTAL_EMAIL", "fenteng@example.test")


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.inquiry  # noqa: F401
    import app.procurement.inq_spec  # noqa: F401
    return create_hooked_store(raw)


@pytest.fixture
async def seed(raw):
    from app.procurement.suppliers import SUPPLIERS
    tony_s, fenteng_s = SUPPLIERS[0], SUPPLIERS[1]
    tony = await raw.add_record("Suppliers", {"Supplier_ID": tony_s["books_id"], "Supplier_Name": {"first_name": "Tony Fan"}})
    fenteng = await raw.add_record("Suppliers", {"Supplier_ID": fenteng_s["books_id"], "Supplier_Name": {"first_name": "Fenteng Lighting"}})
    item = await raw.add_record("Items", {"SKU": "LAMP-1", "item_name": "Lamp"})
    return {"tony": tony, "fenteng": fenteng, "item": item}


def base(seed, **extra):
    return {"sku": "LAMP-1", "quantity": 3, "unit": "pcs", "target_date": day(60), "description": "A lamp", "Items": seed["item"], "Suppliers": [seed["tony"], seed["fenteng"]], **extra}


async def _inq(raw, id_):
    return await raw.get_record_by_id("Inquiry_Form", id_, raw=True)


async def _events(raw, id_):
    rows = sorted(await raw.find("Stage_Events", lambda e: e.get("Record_Type") == "inquiry" and str(e.get("Record_Id")) == str(id_)), key=lambda e: int(e["ID"]))
    return rows


async def _notes(raw, type_):
    return await raw.find("App_Notifications", lambda n: n.get("Notification_Type") == type_)


async def _quote(raw, store, seed, id_, who, patch):
    rec = await _inq(raw, id_)
    target = seed["tony"] if who == "tony" else seed["fenteng"]
    rows = [{**q, **patch} if q.get("Supplier_ID") == f"[{target}]" else q for q in rec["Supplier_Quotes"]]
    await store.update_record("Inquiry_Form", id_, {"Supplier_Quotes": rows})


# Node: 'INQ-R3: a lead time typed as text is read as days (a range takes the larger number)'
def test_inq_r3_lead_time_text_read_as_days():
    cases = [("20", 20), ("20 days", 20), ("3 weeks", 21), ("2-3 weeks", 21), ("1 month", 30), ("20天", 20), ("2周", 14), ("", 0), ("soon", 0), (None, 0), ("12.5 days", 13)]
    for text, days in cases:
        assert parse_lead_days(text) == days, str(text)


# Node: 'inquiry.sent: the stamp and the event are made when the inquiry goes to its suppliers; the stamps cannot be typed'
@pytest.mark.asyncio
async def test_inquiry_sent_stamp_and_event_stamps_cannot_be_typed(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed, Sent_At="2000-01-01 01:00:00 AM", Selected_Lead_Days=99))
    rec = await _inq(raw, id_)
    assert rec["Sent_At"] and not rec["Sent_At"].startswith("2000")
    assert not rec.get("Selected_Lead_Days")
    ev = await _events(raw, id_)
    assert [e["Event"] for e in ev] == ["inquiry.sent"]
    assert ev[0]["Note"] == "2 supplier(s)"
    await store.update_record("Inquiry_Form", id_, {"description": "edited"})
    assert len(await _events(raw, id_)) == 1, "a plain edit does not log it again"


# Node: 'first quote: stamped once; the buyer is told once when every supplier has quoted'
@pytest.mark.asyncio
async def test_first_quote_stamped_once_buyer_told_once(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    await _quote(raw, store, seed, id_, "tony", {"Availability": "Confirmed", "Initial_Price": 100, "Lead_Time": "20"})
    rec = await _inq(raw, id_)
    assert rec["First_Quote_At"]
    first = rec["First_Quote_At"]
    assert len(await _notes(raw, "Inquiry Quotes Complete")) == 0, "one supplier is still missing"
    await _quote(raw, store, seed, id_, "fenteng", {"Availability": "Confirmed", "Initial_Price": 90, "Lead_Time": "3 weeks"})
    rec = await _inq(raw, id_)
    assert rec["First_Quote_At"] == first, "the first stamp stays"
    n = await _notes(raw, "Inquiry Quotes Complete")
    assert len(n) == 1
    assert re.search(r"INQ-\d+: every supplier has quoted", n[0]["Message"])
    await _quote(raw, store, seed, id_, "fenteng", {"Initial_Price": 95})
    assert len(await _notes(raw, "Inquiry Quotes Complete")) == 1, "not again"
    assert len([e for e in await _events(raw, id_) if e["Event"] == "inquiry.first_quote_received"]) == 1


# Node: 'INQ-R3 / INQ-R6: the selected quote gives the lead days as a number and the supplier ID; every change of the choice is an event'
@pytest.mark.asyncio
async def test_selected_quote_gives_lead_days_and_id_every_change_is_event(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    await _quote(raw, store, seed, id_, "tony", {"Availability": "Confirmed", "Initial_Price": 100, "Lead_Time": "20 days"})
    await _quote(raw, store, seed, id_, "fenteng", {"Availability": "Confirmed", "Initial_Price": 90, "Lead_Time": "3 weeks"})
    await _quote(raw, store, seed, id_, "fenteng", {"Selected": True})
    rec = await _inq(raw, id_)
    assert rec["Selected_Supplier_Id"] == str(seed["fenteng"])
    assert int(float(rec["Selected_Lead_Days"])) == 21
    at = rec["Selected_At"]
    assert at
    await _quote(raw, store, seed, id_, "fenteng", {"Selected": False})
    await _quote(raw, store, seed, id_, "tony", {"Selected": True})
    rec = await _inq(raw, id_)
    assert rec["Selected_Supplier_Id"] == str(seed["tony"])
    assert int(float(rec["Selected_Lead_Days"])) == 20
    assert rec["Selected_At"] == at, "the first stamp stays"
    sel = [e for e in await _events(raw, id_) if e["Event"] == "inquiry.supplier_selected"]
    assert [(e["Note"], int(e["Visit_No"])) for e in sel] == [("Fenteng Lighting", 1), ("Tony Fan", 2)]


# Node: 'INQ-R2: a line the supplier cannot supply has no price and no lead time'
@pytest.mark.asyncio
async def test_inq_r2_unavailable_line_has_no_price_or_lead_time(raw, store, seed):
    from app.procurement.inq_spec import clear_unavailable
    id_ = await store.add_record("Inquiry_Form", base(seed))
    await _quote(raw, store, seed, id_, "tony", {"Availability": "Cannot Produce", "Initial_Price": 100, "Negotiated": 90, "Final_Price": 90, "Lead_Time": "20"})
    row = next(q for q in (await _inq(raw, id_))["Supplier_Quotes"] if q.get("Supplier_ID") == f"[{seed['tony']}]")
    assert [row.get("Availability") or "", row.get("Initial_Price") or "", row.get("Negotiated") or "", row.get("Final_Price") or "", row.get("Lead_Time") or ""] == ["Cannot Produce", "", "", "", ""]
    assert clear_unavailable([{"Availability": "Confirmed", "Initial_Price": 5}])["changed"] is False


# Node: 'INQ-R7: with a needed-by date each quote gets a hint ("Lead 20 days + sea -> earliest about ..."); without one there is none'
@pytest.mark.asyncio
async def test_inq_r7_feasibility_hints_with_and_without_target(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed, target_date=day(30)))
    await _quote(raw, store, seed, id_, "tony", {"Availability": "Confirmed", "Initial_Price": 100, "Lead_Time": "20"})
    rec = await _inq(raw, id_)
    assert re.match(r"^Tony Fan: Lead 20 days \+ sea -> earliest about \d+ [A-Z][a-z]{2}", rec["Feasibility_Hints"])
    assert re.search(r"days after the \d+ [A-Z][a-z]{2} you need; by air about", rec["Feasibility_Hints"]), "a sea quote that misses the date says what air would do"
    await _quote(raw, store, seed, id_, "fenteng", {"Availability": "Unavailable"})
    rec = await _inq(raw, id_)
    assert len(rec["Feasibility_Hints"].split("\n")) == 1, "a line that cannot be supplied has no hint"
    far = await store.add_record("Inquiry_Form", base(seed, target_date=day(300)))
    await _quote(raw, store, seed, far, "tony", {"Availability": "Confirmed", "Initial_Price": 100, "Lead_Time": "20"})
    assert "in time for" in (await _inq(raw, far))["Feasibility_Hints"]
    none_id = await store.add_record("Inquiry_Form", base(seed, target_date=""))
    await _quote(raw, store, seed, none_id, "tony", {"Availability": "Confirmed", "Initial_Price": 100, "Lead_Time": "20"})
    assert ((await _inq(raw, none_id))["Feasibility_Hints"] or "") == ""


# Node: 'inquiry.estimate_pushed is stamped once when the Estimate is made'
@pytest.mark.asyncio
async def test_estimate_pushed_stamped_once(raw, store, seed):
    id_ = await store.add_record("Inquiry_Form", base(seed))
    await store.update_record("Inquiry_Form", id_, {"Estimate_Created": True, "Books_Estimate_No": "EST-9"})
    rec = await _inq(raw, id_)
    assert rec["Estimate_Pushed_At"]
    ev = [e for e in await _events(raw, id_) if e["Event"] == "inquiry.estimate_pushed"]
    assert [e["Note"] for e in ev] == ["EST-9"]


# Node: 'no quote after inquiry_quote_days (2): the buyer gets one alert naming the supplier that has not answered; none when all answered'
@pytest.mark.asyncio
async def test_no_quote_after_days_alerts_once_naming_unanswered_supplier(raw, store, seed):
    from app.procurement.inq_spec import run_inquiry_daily
    late = await store.add_record("Inquiry_Form", base(seed))
    fresh = await store.add_record("Inquiry_Form", base(seed))
    done = await store.add_record("Inquiry_Form", base(seed))
    await _quote(raw, store, seed, late, "tony", {"Availability": "Confirmed", "Initial_Price": 100, "Lead_Time": "20"})
    await _quote(raw, store, seed, done, "tony", {"Availability": "Confirmed", "Initial_Price": 100, "Lead_Time": "20"})
    await _quote(raw, store, seed, done, "fenteng", {"Availability": "Unavailable"})
    old = f"{day(-3)} 09:00:00 AM"
    await raw.update_record("Inquiry_Form", late, {"Sent_At": old}, by_form=True)
    await raw.update_record("Inquiry_Form", done, {"Sent_At": old}, by_form=True)
    await raw.update_record("Inquiry_Form", fresh, {"Sent_At": f"{day(-1)} 09:00:00 AM"}, by_form=True)
    r = await run_inquiry_daily(raw)
    assert r["alerted"] == 1
    n = await _notes(raw, "Inquiry No Quote")
    assert len(n) == 1
    assert "no quote from Fenteng Lighting after 2 days" in n[0]["Message"]
    assert (await run_inquiry_daily(raw))["alerted"] == 0, "once per inquiry"
