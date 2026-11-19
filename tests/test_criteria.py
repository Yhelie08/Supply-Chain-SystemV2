import re

import pytest

from app.criteria import ZohoError, compile_criteria, zoho_now, today


def test_equality_on_a_string_field():
    pred = compile_criteria('(Status == "Yes")', {})
    assert pred({"Status": "Yes"}) is True
    assert pred({"Status": "No"}) is False


def test_inequality():
    pred = compile_criteria('(Status != "Yes")', {})
    assert pred({"Status": "No"}) is True


def test_and_or_combination_with_parentheses():
    pred = compile_criteria('(Status == "Yes" || Has_Credit_Terms == true)', {})
    assert pred({"Status": "No", "Has_Credit_Terms": True}) is True
    assert pred({"Status": "No", "Has_Credit_Terms": False}) is False


def test_blank_criteria_matches_everything():
    pred = compile_criteria("", {})
    assert pred({"anything": "at all"}) is True
    pred2 = compile_criteria(None, {})
    assert pred2({}) is True


def test_zoho_error_carries_a_code():
    e = ZohoError(9230, "not found")
    assert e.code == 9230
    assert str(e) == "not found"


def test_zoho_now_format():
    assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (AM|PM)$", zoho_now())


def test_today_format():
    assert re.match(r"^\d{4}-\d{2}-\d{2}$", today())


def test_numeric_comparison_operators():
    pred_gt = compile_criteria("(Quantity > 5)", {})
    assert pred_gt({"Quantity": "10"}) is True
    assert pred_gt({"Quantity": "3"}) is False

    pred_lt = compile_criteria("(Quantity < 5)", {})
    assert pred_lt({"Quantity": "3"}) is True

    pred_gte = compile_criteria("(Quantity >= 5)", {})
    assert pred_gte({"Quantity": "5"}) is True

    pred_lte = compile_criteria("(Quantity <= 5)", {})
    assert pred_lte({"Quantity": "5"}) is True


def test_negation():
    pred = compile_criteria('(!(Status == "Yes"))', {})
    assert pred({"Status": "No"}) is True
    assert pred({"Status": "Yes"}) is False


def test_contains_starts_with_ends_with():
    pred_contains = compile_criteria('(SO_No.contains("SO-1"))', {})
    assert pred_contains({"SO_No": "SO-123"}) is True
    assert pred_contains({"SO_No": "XX-999"}) is False

    pred_starts = compile_criteria('(Status.startsWith("Y"))', {})
    assert pred_starts({"Status": "Yes"}) is True
    assert pred_starts({"Status": "No"}) is False

    pred_ends = compile_criteria('(SO_No.endsWith("3"))', {})
    assert pred_ends({"SO_No": "SO-123"}) is True
    assert pred_ends({"SO_No": "SO-124"}) is False


def test_compound_expression_with_contains_and_startswith():
    pred = compile_criteria('(SO_No.contains("SO-1") && Status.startsWith("Y"))', {})
    assert pred({"SO_No": "SO-123", "Status": "Yes"}) is True
    assert pred({"SO_No": "SO-123", "Status": "No"}) is False
    assert pred({"SO_No": "XX-123", "Status": "Yes"}) is False


def test_id_field_is_coerced_to_a_number_for_comparison():
    pred = compile_criteria("(ID == 123)", {})
    assert pred({"ID": "123"}) is True
    assert pred({"ID": "124"}) is False


def test_a_lookup_field_stored_as_an_object_is_compared_by_its_id():
    pred = compile_criteria('(Customer == "4900000000000000001")', {})
    assert pred({"Customer": {"ID": "4900000000000000001", "display_value": "Acme"}}) is True


def test_blank_or_missing_field_reads_as_null():
    pred = compile_criteria("(Package == null)", {})
    assert pred({"Package": ""}) is True
    assert pred({}) is True
    assert pred({"Package": "PAC-1"}) is False


def test_zoho_currentdate_and_loginuser_substitution():
    pred_date = compile_criteria("(Order_Date == zoho.currentdate)", {})
    assert pred_date({"Order_Date": today()}) is True

    pred_user = compile_criteria("(Added_User == zoho.loginuser)", {"user": "alice@example.com"})
    assert pred_user({"Added_User": "alice@example.com"}) is True
    assert pred_user({"Added_User": "bob@example.com"}) is False


def test_unsupported_token_raises_zoho_error_3330():
    with pytest.raises(ZohoError) as exc:
        compile_criteria("(Field ~~ 1)", {})
    assert exc.value.code == 3330
