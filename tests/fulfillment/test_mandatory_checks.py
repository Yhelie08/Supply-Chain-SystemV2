# Mandatory checks the SERVER enforces (spec v1.4, 03 Fulfillment / 03 Pick, QC, Rework and Crate), owner decision 2026-11-20:
#   QC-R2  Approved needs the checklist, at least one photo and the signature.
#   QC-R3  Rejected needs a reason (Remarks) and at least one photo.
#   CR-R2  Crating Done needs the checklist, at least one photo, the crate weight (kg) and the dimensions (cm).
# "Checklist" for QC = each of the 3 checkbox groups (Fixture body, LED, Uniformity) has at least one line ticked (owner's choice).
# The photo and the signature are files, so they have to be on the record BEFORE the status is saved (the widgets upload first).
# Only the save that CHANGES the status is checked; a later save of an already Approved / Done record is not.
import pytest

from app.criteria import ZohoError
from app.schema import ensure_schema
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401  (registers every Fulfillment hook, including the mandatory checks)

QC, CRATE = "Checker_Checklist", "Crate_Checklist"
PHOTO, SIGNATURE = "Image_Upload_max_10_JPG_JPEG_PNG", "Signature"
CHECKS = {"Fixture_Body_Checklist": ["Walang yupi, gasgas, bitak o basag"], "LED_Checklist": ["Hindi kumukurap ang bulb"], "Uniformity": ["Kapag marami ang ilaw dapat pare-parehas ang sukat"]}
GOOD_QC = {**CHECKS, PHOTO: "/uploads/1_lamp.jpg", SIGNATURE: "/uploads/2_sig.png"}
GOOD_CRATE = {"Crating_Checklist": ["Maayos at matibay ang pagkaka-crate"], "Photo_Documentation": "/uploads/3_crate.jpg", "Crate_Weight_Kg": "12.5", "Crate_Dimensions_Cm": "120 x 60 x 40"}


@pytest.fixture
async def raw_store(db_conn):
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def hooked_store(raw_store):
    return create_hooked_store(raw_store)


async def _qc(raw_store, **fields):
    return await raw_store.add_record(QC, {"SO": "SO-1", "PAC": "PAC-1", "SKU": "L-1", "Item_Name": "Lamp", "Quantity": "2", **fields})


async def _refused(hooked_store, form, id_, data) -> str:
    with pytest.raises(ZohoError) as e:
        await hooked_store.update_record(form, id_, data, by_form=True)
    return e.value.message


async def _status(raw_store, form, id_, field) -> str:
    return (await raw_store.get_record_by_id(form, id_, raw=True)).get(field) or ""


# ---------- QC-R2: Approved ----------
async def test_qc_approved_is_accepted_when_the_checklist_photo_and_signature_are_there(hooked_store, raw_store):
    id_ = await _qc(raw_store, **GOOD_QC)
    await hooked_store.update_record(QC, id_, {"QC_Status": "Approved"}, by_form=True)
    assert await _status(raw_store, QC, id_, "QC_Status") == "Approved"


async def test_qc_approved_with_nothing_on_the_record_is_refused_and_lists_every_missing_thing_at_once(hooked_store, raw_store):
    id_ = await _qc(raw_store)
    msg = await _refused(hooked_store, QC, id_, {"QC_Status": "Approved"})
    for word in ("Fixture Body", "LED", "Uniformity", "photo", "signature"):
        assert word in msg
    assert await _status(raw_store, QC, id_, "QC_Status") == ""


@pytest.mark.parametrize("missing,word", [(PHOTO, "photo"), (SIGNATURE, "signature"), ("Fixture_Body_Checklist", "Fixture Body"), ("LED_Checklist", "LED"), ("Uniformity", "Uniformity")])
async def test_qc_approved_is_refused_when_just_one_thing_is_missing(hooked_store, raw_store, missing, word):
    id_ = await _qc(raw_store, **{k: v for k, v in GOOD_QC.items() if k != missing})
    msg = await _refused(hooked_store, QC, id_, {"QC_Status": "Approved"})
    assert word in msg
    assert await _status(raw_store, QC, id_, "QC_Status") == ""


async def test_an_empty_checklist_group_does_not_count_as_ticked(hooked_store, raw_store):
    id_ = await _qc(raw_store, **{**GOOD_QC, "LED_Checklist": []})
    assert "LED" in await _refused(hooked_store, QC, id_, {"QC_Status": "Approved"})


async def test_the_evidence_can_arrive_in_the_same_save_as_the_status(hooked_store, raw_store):
    id_ = await _qc(raw_store)
    await hooked_store.update_record(QC, id_, {"QC_Status": "Approved", **GOOD_QC}, by_form=True)
    assert await _status(raw_store, QC, id_, "QC_Status") == "Approved"


async def test_uploading_the_photo_file_to_a_pending_record_is_not_blocked(hooked_store, raw_store):
    # what /api/uploadFile does: a plain update of the file field only, status untouched
    id_ = await _qc(raw_store)
    await hooked_store.update_record(QC, id_, {PHOTO: "/uploads/9_a.jpg"}, by_form=True)
    await hooked_store.update_record(QC, id_, {SIGNATURE: "/uploads/9_s.png"}, by_form=True)
    assert await _status(raw_store, QC, id_, PHOTO) == "/uploads/9_a.jpg"


async def test_a_later_save_of_an_already_approved_record_is_not_checked_again(hooked_store, raw_store):
    id_ = await _qc(raw_store, QC_Status="Approved")   # e.g. a record imported before this rule
    await hooked_store.update_record(QC, id_, {"Remarks": "ok"}, by_form=True)
    await hooked_store.update_record(QC, id_, {"QC_Status": "Approved", "Remarks": "ok again"}, by_form=True)
    assert await _status(raw_store, QC, id_, "Remarks") == "ok again"


async def test_a_split_save_rejected_first_then_approved_checks_each_step(hooked_store, raw_store):
    # the widget writes Rejected (reason + photo) and then Approved (checklist + photo + signature) on the same record
    id_ = await _qc(raw_store, **{PHOTO: "/uploads/1_lamp.jpg", "Remarks": "chipped"})
    await hooked_store.update_record(QC, id_, {"QC_Status": "Rejected", "Quantity": "1"}, by_form=True)
    msg = await _refused(hooked_store, QC, id_, {"QC_Status": "Approved", "Quantity": "1"})   # no signature, no checklist yet
    assert "signature" in msg and "photo" not in msg
    await hooked_store.update_record(QC, id_, {"QC_Status": "Approved", "Quantity": "1", **CHECKS, SIGNATURE: "/uploads/2_sig.png"}, by_form=True)
    assert await _status(raw_store, QC, id_, "QC_Status") == "Approved"


async def test_a_new_qc_row_created_already_approved_without_evidence_is_refused(hooked_store):
    with pytest.raises(ZohoError):
        await hooked_store.add_record(QC, {"SO": "SO-2", "PAC": "PAC-2", "SKU": "L-2", "QC_Status": "Approved", "Quantity": "1"})


# ---------- QC-R3: Rejected ----------
async def test_qc_rejected_is_accepted_with_a_reason_and_a_photo(hooked_store, raw_store):
    id_ = await _qc(raw_store, **{PHOTO: "/uploads/1_lamp.jpg", "Remarks": "glass is cracked"})
    await hooked_store.update_record(QC, id_, {"QC_Status": "Rejected"}, by_form=True)
    assert await _status(raw_store, QC, id_, "QC_Status") == "Rejected"


async def test_qc_rejected_needs_a_reason_and_a_photo(hooked_store, raw_store):
    id_ = await _qc(raw_store)
    msg = await _refused(hooked_store, QC, id_, {"QC_Status": "Rejected"})
    assert "reason" in msg and "photo" in msg
    id2 = await _qc(raw_store, **{PHOTO: "/uploads/1_lamp.jpg"})
    assert "reason" in await _refused(hooked_store, QC, id2, {"QC_Status": "Rejected"})
    id3 = await _qc(raw_store, Remarks="cracked")
    assert "photo" in await _refused(hooked_store, QC, id3, {"QC_Status": "Rejected"})


async def test_a_blank_remarks_made_of_spaces_is_not_a_reason(hooked_store, raw_store):
    id_ = await _qc(raw_store, **{PHOTO: "/uploads/1_lamp.jpg", "Remarks": "   "})
    assert "reason" in await _refused(hooked_store, QC, id_, {"QC_Status": "Rejected"})


async def test_a_pending_status_needs_no_evidence(hooked_store, raw_store):
    id_ = await _qc(raw_store)
    await hooked_store.update_record(QC, id_, {"QC_Status": "", "Remarks": "later"}, by_form=True)


# ---------- CR-R2: Crating Done ----------
async def _crate(raw_store, **fields):
    return await raw_store.add_record(CRATE, {"SO": "SO-1", "Package_Order": "PAC-1", "SKU": "M-1", "Item_Name": "Mirror", "Quantity": "1", **fields})


async def test_crating_done_is_accepted_with_checklist_photo_weight_and_dimensions(hooked_store, raw_store):
    id_ = await _crate(raw_store, **GOOD_CRATE)
    await hooked_store.update_record(CRATE, id_, {"Crating_Status1": "Done"}, by_form=True)
    assert await _status(raw_store, CRATE, id_, "Crating_Status1") == "Done"


async def test_crating_done_with_nothing_is_refused_and_lists_everything_missing(hooked_store, raw_store):
    id_ = await _crate(raw_store)
    msg = await _refused(hooked_store, CRATE, id_, {"Crating_Status1": "Done"})
    for word in ("checklist", "photo", "weight", "dimensions"):
        assert word in msg
    assert await _status(raw_store, CRATE, id_, "Crating_Status1") == ""


@pytest.mark.parametrize("missing,word", [("Crating_Checklist", "checklist"), ("Photo_Documentation", "photo"), ("Crate_Weight_Kg", "weight"), ("Crate_Dimensions_Cm", "dimensions")])
async def test_crating_done_is_refused_when_just_one_thing_is_missing(hooked_store, raw_store, missing, word):
    id_ = await _crate(raw_store, **{k: v for k, v in GOOD_CRATE.items() if k != missing})
    assert word in await _refused(hooked_store, CRATE, id_, {"Crating_Status1": "Done"})


@pytest.mark.parametrize("weight", ["0", "-3", "abc", ""])
async def test_a_crate_weight_that_is_not_a_positive_number_is_refused(hooked_store, raw_store, weight):
    id_ = await _crate(raw_store, **{**GOOD_CRATE, "Crate_Weight_Kg": weight})
    assert "weight" in await _refused(hooked_store, CRATE, id_, {"Crating_Status1": "Done"})


async def test_crating_still_pending_needs_nothing_and_a_done_crate_is_not_checked_again(hooked_store, raw_store):
    id_ = await _crate(raw_store)
    await hooked_store.update_record(CRATE, id_, {"Crating_Status1": "Pending", "Assign_Crater": "Lito"}, by_form=True)
    done = await _crate(raw_store, Crating_Status1="Done")   # imported before this rule
    await hooked_store.update_record(CRATE, done, {"Assign_Crater": "Lito"}, by_form=True)


async def test_the_crate_weight_and_dimensions_columns_exist(raw_store):
    id_ = await _crate(raw_store, Crate_Weight_Kg="7.25", Crate_Dimensions_Cm="30 x 30 x 90")
    r = await raw_store.get_record_by_id(CRATE, id_, raw=True)
    assert str(r["Crate_Weight_Kg"]) in ("7.25", "7.250000") or float(r["Crate_Weight_Kg"]) == 7.25
    assert r["Crate_Dimensions_Cm"] == "30 x 30 x 90"
