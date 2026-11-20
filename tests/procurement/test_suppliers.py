import pytest
from app.procurement.suppliers import SUPPLIERS, portal_of, quote_books_id


def test_suppliers_list_has_tony_and_fenteng():
    keys = {s["key"] for s in SUPPLIERS}
    assert keys == {"tony", "fenteng"}


# Node: '"Tony" and "Tony Fan" are one supplier, "Fenteng" and "Fenteng Lighting" are one; part of a word and other names are not'
def test_portal_of_matches_tony_by_name_or_whole_word_start_case_and_space_insensitive():
    for n in ["Tony", "Tony Fan", "TONY FAN", " tony  fan "]:
        assert portal_of(n) is not None and portal_of(n)["key"] == "tony", n


def test_portal_of_matches_fenteng_by_name_or_whole_word_start():
    for n in ["Fenteng", "Fenteng Lighting", "fenteng lighting"]:
        assert portal_of(n) is not None and portal_of(n)["key"] == "fenteng", n


def test_portal_of_returns_none_for_a_partial_word_or_unrelated_name():
    for n in ["Fentengxyz", "Antony", "Stony Co", "HC System", "Steady Co", "", None]:
        assert portal_of(n) is None, str(n)


# supplier_index / quote_books_id: source-derived (no dedicated Node test file exercises these beyond
# portalOf, which is covered above) -- behavioral smoke tests, not an oracle match.
@pytest.mark.asyncio
async def test_supplier_index_builds_id_keyed_map(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    from app.procurement.suppliers import supplier_index

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    idx = await supplier_index(store)
    assert isinstance(idx, dict)


def test_quote_books_id_looks_up_by_unbracketed_supplier_id():
    suppliers = {"1": {"books_id": "books-1"}}
    assert quote_books_id({"Supplier_ID": "[1]"}, suppliers) == "books-1"
    assert quote_books_id({"Supplier_ID": "9"}, suppliers) == ""
