# The command line tools (plan Phase 4): app/tools/seed_fulfillment.py, app/tools/fulfillment_sync.py, and the configurable data paths (app/paths.py).
import os

import pytest

from app.paths import resolve
from app.schema import ensure_schema
from app.store import create_store
from app.tools import fulfillment_sync, seed_fulfillment
from app.tools._connect import database_url, is_local

SOF, GATE = "Sales_Order_Fulfillment", "Sales_Order_Readiness_Gate"


@pytest.fixture
def local_url(monkeypatch, tmp_path):
    """The test database, reached the way the tools reach it (DATABASE_URL + PG_SEARCH_PATH), with the sample picture files going to a temp folder."""
    url = os.environ["TEST_DATABASE_URL"]
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("PG_SEARCH_PATH", "python_test")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    return url


@pytest.fixture
async def store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


# ---------- seed_fulfillment ----------
async def test_the_seed_writes_the_seven_sample_orders_through_the_workflows(local_url, store):
    out = await seed_fulfillment.run(local_url)
    assert out["orders"] == {
        "SO-90001": "Waiting For Package", "SO-90002": "Need Approval", "SO-90003": "Order Readiness", "SO-90004": "Order Readiness",
        "SO-90005": "Pack & QC", "SO-90006": "Crate", "SO-90007": "Order Readiness",
    }
    assert (out["gate"], out["pick"], out["qc"], out["crate"]) == (8, 3, 2, 1)
    rows = await store.find(SOF)
    assert {r["Added_User"] for r in rows} == {"sample-data"}


async def test_the_seed_leaves_the_qc_and_crate_rows_waiting_for_their_screens_without_evidence(local_url, store):
    await seed_fulfillment.run(local_url)
    pending_qc = [q for q in await store.find("Checker_Checklist") if q["SO"] == "SO-90005"]
    assert len(pending_qc) == 1 and (pending_qc[0].get("QC_Status") or "") == "" and not pending_qc[0].get("Signature")
    crate = (await store.find("Crate_Checklist"))[0]
    assert (crate.get("Crating_Status1") or "Pending") == "Pending" and not crate.get("Photo_Documentation")


async def test_the_seed_ranks_the_late_order_first_blocks_the_waiting_ones_and_marks_the_urgent_one(local_url, store):
    await seed_fulfillment.run(local_url)
    by_so = {r["SO_No"]: r for r in await store.find(SOF)}
    assert by_so["SO-90004"]["Category"] == "late" and by_so["SO-90004"]["Queue_Rank"] == "1"
    assert (by_so["SO-90001"]["Category"], by_so["SO-90001"]["Blocked_Reason"]) == ("blocked", "Items not available yet (no package)")
    assert (by_so["SO-90002"]["Category"], by_so["SO-90002"]["Blocked_Owner"]) == ("blocked", "Sales agent")
    assert by_so["SO-90003"]["Urgent"] is True
    assert all(r["Scored_At"] for r in by_so.values())


async def test_the_seed_writes_the_stage_events_of_the_whole_flow(local_url, store):
    await seed_fulfillment.run(local_url)
    crate = next(r for r in await store.find(SOF) if r["SO_No"] == "SO-90006")
    events = [e["Event"] for e in sorted(await store.find("Stage_Events", lambda e: e["Record_Id"] == str(crate["ID"])), key=lambda e: int(e["ID"]))]
    # the spec v1.4 names (2026-11-20): created, ready, released (Picking), picker assigned, picked (Pack & QC), QC passed, then the Crate stage
    assert events == ["package.created", "package.ready", "package.released", "package.picker_assigned", "package.picked", "package.qc_passed", "package.crate"]


async def test_the_seed_refuses_a_database_that_already_has_fulfillment_rows(local_url, store):
    await store.add_record(SOF, {"SO_No": "SO-1"})
    with pytest.raises(SystemExit) as e:
        await seed_fulfillment.run(local_url)
    assert "already has Fulfillment rows" in str(e.value)
    assert len(await store.find(SOF)) == 1   # nothing was added


async def test_the_seed_refuses_a_second_run(local_url, store):
    await seed_fulfillment.run(local_url)
    with pytest.raises(SystemExit):
        await seed_fulfillment.run(local_url)


async def test_the_seed_refuses_a_database_that_is_not_on_this_pc_before_connecting_to_it():
    with pytest.raises(SystemExit) as e:
        await seed_fulfillment.run("postgresql://user:secret@db.example.com:5432/railway")
    assert "not this PC" in str(e.value) and "secret" not in str(e.value)   # the password is never printed


# ---------- fulfillment_sync ----------
async def test_the_sync_sends_a_paid_package_with_no_gate_to_readiness(local_url, store):
    await store.add_record(SOF, {"SO_No": "SO-1", "Package": "PAC-1", "Status": "Yes", "Fulfillment_Stage": "Waiting For Package", "Shipping_Address": "1 Main St",
                                 "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}]})
    done = await fulfillment_sync.run(local_url)
    assert (done["gate"], done["stage"]) == (1, 1)
    assert len(await store.find(GATE)) == 1
    assert (await store.find(SOF))[0]["Fulfillment_Stage"] == "Order Readiness"
    assert fulfillment_sync.summary(done) == "Fulfillment catch-up: 1 package(s) sent to Readiness, 0 to Pick, 0 to Pack & QC, 1 stage change(s)."


async def test_running_the_sync_again_changes_nothing(local_url, store):
    await store.add_record(SOF, {"SO_No": "SO-1", "Package": "PAC-1", "Status": "Yes", "Fulfillment_Stage": "Waiting For Package", "Shipping_Address": "1 Main St",
                                 "Item_Details1": [{"Item": "Lamp", "SKU": "L-1", "Quantity": "2", "Bin_Location": "A-01"}]})
    await fulfillment_sync.run(local_url)
    again = await fulfillment_sync.run(local_url)
    assert again == {"gate": 0, "pick": 0, "qc": 0, "stage": 0}
    assert len(await store.find(GATE)) == 1


# ---------- the connection helpers ----------
def test_database_url_must_be_set():
    with pytest.raises(SystemExit):
        database_url({})
    assert database_url({"DATABASE_URL": " postgresql://x@localhost/db "}) == "postgresql://x@localhost/db"


def test_is_local_knows_this_pc_from_railway():
    assert is_local("postgresql://postgres@127.0.0.1:5432/x") and is_local("postgresql://postgres@localhost/x")
    assert not is_local("postgresql://u:p@postgres.railway.internal:5432/railway") and not is_local("postgresql://u:p@x.proxy.rlwy.net:1/railway")


# ---------- configurable paths (4.3) ----------
def test_a_path_can_be_moved_with_an_environment_variable(tmp_path):
    other = tmp_path / "forms"
    other.mkdir()
    assert resolve("HC_PARSED_DIR", tmp_path / "default", env={"HC_PARSED_DIR": str(other)}) == other


def test_the_default_is_used_when_the_variable_is_not_set(tmp_path):
    assert resolve("HC_PARSED_DIR", tmp_path, env={}) == tmp_path


def test_a_missing_folder_stops_loudly_and_names_the_variable_to_set(tmp_path):
    with pytest.raises(RuntimeError) as e:
        resolve("HC_SPEC_FORMS_DIR", tmp_path / "nowhere", env={})
    assert "HC_SPEC_FORMS_DIR" in str(e.value) and "nowhere" in str(e.value)
    with pytest.raises(RuntimeError) as e2:
        resolve("HC_SPEC_FORMS_DIR", tmp_path, env={"HC_SPEC_FORMS_DIR": str(tmp_path / "typo")})
    assert "typo" in str(e2.value)


def test_a_file_path_is_checked_as_a_file_not_a_folder(tmp_path):
    pages = tmp_path / "pages.json"
    pages.write_text("[]")
    assert resolve("HC_PAGES_JSON", pages, is_file=True, env={}) == pages
    with pytest.raises(RuntimeError):
        resolve("HC_PAGES_JSON", tmp_path, is_file=True, env={})   # a folder is not the menu file


def test_the_real_defaults_exist_in_this_repo():
    from app import paths
    assert paths.PARSED.is_dir() and paths.SPEC_FORMS.is_dir() and paths.MODULES.is_dir() and paths.PUBLIC.is_dir() and paths.PAGES_JSON.is_file()
