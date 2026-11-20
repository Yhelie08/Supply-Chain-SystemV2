# Sample Fulfillment data, from the command line (the Fulfillment part of server/seed-ops.mjs, redone small and through the real hooks):
#   DATABASE_URL=postgresql://postgres@127.0.0.1:54329/supply_chain_test python -m app.tools.seed_fulfillment
# It writes seven sample Sales Orders (SO-90001 .. SO-90007, Added_User = sample-data) THROUGH THE HOOKED STORE, so the Gate rows, the Pick and
# QC rows, the Crate row, the stage log and the queue ranking all come from the real workflows, not from hand-written rows. One package for each
# place a person can be standing in the screens:
#   SO-90001  no package yet              Waiting For Package   (Blocked: items)
#   SO-90002  package, not paid           Need Approval         (Blocked: payment)
#   SO-90003  paid, 2 items               Order Readiness       (ready to release; has an approved urgency request)
#   SO-90004  paid, target date passed    Order Readiness       (Already late, ranks first)
#   SO-90005  released, one item picked   Pick / Pack & QC      (a QC row waits for the QC screen; its photo and signature are NOT there yet)
#   SO-90006  for crate, QC approved      Crate                 (a Crate row waits for the Crate screen; its photo, weight and size are NOT there yet)
#   SO-90007  paid, 25 days old, 1 item   Order Readiness       (an older order for the ranking)
# It refuses a database that already has Fulfillment rows, and (unless --allow-remote) any database that is not on this PC, so it can never be
# pointed at the shared Railway database by mistake.
import asyncio
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import app.fulfillment  # noqa: F401  (registers every Fulfillment hook)
from app.paths import ROOT
from app.schema import ensure_schema
from app.store import create_store
from app.tools._connect import connect, database_url, host_of, is_local
from app.workflows import create_hooked_store

USER = "sample-data"
SOF, GATE, PICK, QC, CRATE = "Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate", "Pick1", "Checker_Checklist", "Crate_Checklist"
GUARD_FORMS = (SOF, GATE, PICK, QC, CRATE, "Order_Aggregation1")
SAMPLE_SOS = [f"SO-9000{i}" for i in range(1, 8)]

# 1x1 PNG, so the sample evidence files open in the widgets
_PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201a5f645400000000049454e44ae426082")
CHECKS = {
    "Fixture_Body_Checklist": ["Walang yupi, gasgas, bitak o basag"], "LED_Checklist": ["Hindi kumukurap ang bulb"],
    "Uniformity": ["Kapag marami ang ilaw dapat pare-parehas ang sukat"],
}


def _iso(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


def _items(*rows) -> list:
    return [{"Item": name, "SKU": sku, "Quantity": str(qty), "Bin_Location": bin_} for name, sku, qty, bin_ in rows]


def _uploads() -> Path:
    folder = Path(os.environ.get("DATA_DIR", str(ROOT / "data"))) / "uploads"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _evidence_files() -> dict:
    """Writes the sample picture used as the photo and as the signature; returns their /uploads/ paths."""
    folder = _uploads()
    for name in ("sample-data-photo.png", "sample-data-signature.png"):
        (folder / name).write_bytes(_PNG)
    return {"photo": "/uploads/sample-data-photo.png", "signature": "/uploads/sample-data-signature.png"}


async def _refuse_if_not_empty(store) -> None:
    found = {form: len(await store.find(form)) for form in GUARD_FORMS}
    busy = {form: n for form, n in found.items() if n}
    if busy:
        raise SystemExit("Refusing to seed: this database already has Fulfillment rows (" + ", ".join(f"{f}: {n}" for f, n in busy.items()) + "). Use an empty database.")


async def seed(store, hooked) -> dict:
    """Writes the sample orders. `store` is the plain store (used to find rows), `hooked` runs the workflows."""
    await _refuse_if_not_empty(store)
    files = _evidence_files()
    customers = {
        "A": await hooked.add_record("Customer", {"customer_name": "Sample Customer A", "Customer_Type": "Homeowner", "Email": "sample.a@example.com", "Phone_Number": "0917 000 0001"}, user=USER),
        "B": await hooked.add_record("Customer", {"customer_name": "Sample Customer B", "Customer_Type": "Corporate", "Email": "sample.b@example.com", "Phone_Number": "0917 000 0002"}, user=USER),
    }
    if not await store.find("Capacity_Days", lambda r: r.get("Date") == _iso(0)):
        await hooked.add_record("Capacity_Days", {"Date": _iso(0), "People": "4", "Boxes_Per_Hour": "8", "Hours_Per_Day": "7"}, user=USER)

    def order(so, cust, *, created, target, items, package="", paid="Yes", crate=False, address="1 Sample St, Makati"):
        return {
            "SO_No": so, "Package": package, "Status": paid, "order_type": "Normal", "Delivery_Type": "Delivery Only", "For_Crate": crate,
            "Customer": customers[cust], "Customer_Type": "Corporate" if cust == "B" else "End User", "Contact_No": "0917 000 000" + so[-1],
            "Shipping_Address": address, "Billing_Address": address, "SO_Created_Date": _iso(created), "target_delivery_date": _iso(target),
            "Item_Details1": items, "SO_SKU_Key": f"{so}|{items[0]['SKU']}", "Fulfillment_Stage": "Waiting For Package", "Box_Count": "", "Box_Count_Source": "estimated",
        }

    lamp, shade, mirror, bulb = ("Sample Lamp", "SMP-L1", 2, "A-01"), ("Sample Shade", "SMP-S1", 4, "B-02"), ("Sample Mirror", "SMP-M1", 1, "C-03"), ("Sample Bulb", "SMP-B1", 10, "D-04")
    ids = {}
    ids["SO-90001"] = await hooked.add_record(SOF, order("SO-90001", "A", created=-3, target=20, items=_items(lamp), paid="No"), user=USER)
    ids["SO-90002"] = await hooked.add_record(SOF, order("SO-90002", "A", created=-6, target=18, items=_items(shade), package="PAC-90002", paid="No"), user=USER)
    ids["SO-90003"] = await hooked.add_record(SOF, order("SO-90003", "B", created=-10, target=15, items=_items(lamp, shade), package="PAC-90003"), user=USER)
    ids["SO-90004"] = await hooked.add_record(SOF, order("SO-90004", "A", created=-40, target=-5, items=_items(bulb), package="PAC-90004"), user=USER)
    ids["SO-90005"] = await hooked.add_record(SOF, order("SO-90005", "B", created=-8, target=12, items=_items(lamp, shade), package="PAC-90005"), user=USER)
    ids["SO-90006"] = await hooked.add_record(SOF, order("SO-90006", "B", created=-12, target=10, items=_items(mirror), package="PAC-90006", crate=True), user=USER)
    ids["SO-90007"] = await hooked.add_record(SOF, order("SO-90007", "A", created=-25, target=30, items=_items(bulb), package="PAC-90007"), user=USER)

    async def release_and_pick(so, *, mark):
        """Release every Gate row of the order to Pick (a picker named), then mark the wanted Pick rows picked. Goes through the hooks."""
        for g in sorted(await store.find(GATE, lambda r: r.get("sales_order_number") == so), key=lambda r: int(r["ID"])):
            await hooked.update_record(GATE, g["ID"], {"Assign_Picker": "Hendel", "Release": True, "Release_Log": f"Released by {USER} on {_iso(0)}"}, by_form=True, user=USER)
        picks = sorted(await store.find(PICK, lambda r: r.get("SO") == so), key=lambda r: int(r["ID"]))
        for i, p in enumerate(picks):
            if mark(i):
                await hooked.update_record(PICK, p["ID"], {"Marked": True}, by_form=True, user=USER)

    await release_and_pick("SO-90005", mark=lambda i: i == 0)   # one of two items picked: its QC row waits for the QC screen
    await release_and_pick("SO-90006", mark=lambda i: True)
    qc = (await store.find(QC, lambda r: r.get("SO") == "SO-90006"))[0]   # approved WITH its evidence (the rule needs it), so only the Crate row is left
    await hooked.update_record(QC, qc["ID"], {"QC_Status": "Approved", "Quality_Checker": "Sample Checker", "Date_Checked": _iso(0), "Location": "WH Banawe", **CHECKS,
                                              "Image_Upload_max_10_JPG_JPEG_PNG": files["photo"], "Signature": files["signature"]}, by_form=True, user=USER)

    request = await hooked.add_record("Urgency_Requests", {"SO_No": "SO-90003", "Reason": "Sample VIP customer", "Requested_By": "Sample Sales Agent"}, user=USER)
    await hooked.update_record("Urgency_Requests", request, {"Status": "Approved", "Approved_By": "Sample Supervisor"}, by_form=True, user=USER)

    stages = {r["SO_No"]: r["Fulfillment_Stage"] for r in await store.find(SOF, lambda r: r.get("SO_No") in SAMPLE_SOS)}
    return {"orders": stages, "gate": len(await store.find(GATE)), "pick": len(await store.find(PICK)), "qc": len(await store.find(QC)), "crate": len(await store.find(CRATE))}


async def run(url: str, *, allow_remote: bool = False) -> dict:
    if not is_local(url) and not allow_remote:
        raise SystemExit(f"Refusing to seed: the database host '{host_of(url) or '(none)'}' is not this PC. This tool writes sample data; use --allow-remote only if you really mean it.")
    conn = await connect(url)
    try:
        await ensure_schema(conn)
        store = create_store(conn)
        return await seed(store, create_hooked_store(store))
    finally:
        await conn.close()


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    url = database_url()
    print(f"Database host: {host_of(url) or '(none)'}")
    out = asyncio.run(run(url, allow_remote="--allow-remote" in argv))
    print("Sample Fulfillment data written (Added_User = sample-data):")
    for so, stage in sorted(out["orders"].items()):
        print(f"  {so}  {stage}")
    print(f"  {out['gate']} Gate row(s), {out['pick']} Pick, {out['qc']} QC, {out['crate']} Crate.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
