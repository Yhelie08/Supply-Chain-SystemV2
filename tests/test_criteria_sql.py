from app.criteria_sql import criteria_to_sql


def test_simple_equality_translates_to_a_parameterized_condition():
    result = criteria_to_sql('(Status == "Yes")', "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "$1" in result["sql"]
    assert result["params"] == ["Yes"]


def test_offset_shifts_the_placeholder_numbers():
    result = criteria_to_sql('(Status == "Yes")', "Sales_Order_Fulfillment", {}, 2)
    assert "$3" in result["sql"]


def test_blank_criteria_returns_true_with_no_params():
    result = criteria_to_sql("", "Sales_Order_Fulfillment", {}, 0)
    assert result == {"sql": "TRUE", "params": []}


def test_and_or_combination():
    result = criteria_to_sql('(Release == true || Has_Credit_Terms == true)', "Sales_Order_Readiness_Gate", {}, 0)
    assert result is not None
    assert "OR" in result["sql"].upper()


def test_unsupported_criteria_returns_none_not_an_exception():
    result = criteria_to_sql("(SomeField.someUnsupportedThing())", "Sales_Order_Fulfillment", {}, 0)
    assert result is None


def test_id_equality_casts_to_bigint():
    result = criteria_to_sql("(ID == 123)", "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "::bigint" in result["sql"]
    assert result["params"] == ["123"]


def test_id_compared_to_null_is_always_false_for_equality_true_for_inequality():
    # Node's own output wraps the primary expression: {"sql": "(FALSE)", ...} / "(TRUE)" (confirmed
    # by running the real server/pg/criteria-sql.mjs directly), not the bare literal.
    eq_result = criteria_to_sql("(ID == null)", "Sales_Order_Fulfillment", {}, 0)
    assert eq_result == {"sql": "(FALSE)", "params": []}
    ne_result = criteria_to_sql("(ID != null)", "Sales_Order_Fulfillment", {}, 0)
    assert ne_result == {"sql": "(TRUE)", "params": []}


def test_text_field_equals_null_checks_null_or_empty_string():
    result = criteria_to_sql("(Package == null)", "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "IS NULL" in result["sql"]
    assert result["params"] == []


def test_contains_uses_strpos():
    result = criteria_to_sql('(SO_No.contains("SO-1"))', "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "strpos" in result["sql"]
    assert result["params"] == ["SO-1"]


def test_starts_with_uses_left():
    result = criteria_to_sql('(SO_No.startsWith("SO"))', "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "left(" in result["sql"]


def test_ends_with_uses_right():
    result = criteria_to_sql('(SO_No.endsWith("1"))', "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "right(" in result["sql"]


def test_contains_on_the_id_field_is_unsupported():
    result = criteria_to_sql('(ID.contains("1"))', "Sales_Order_Fulfillment", {}, 0)
    assert result is None


def test_boolean_field_equality():
    result = criteria_to_sql("(For_Crate == true)", "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "::boolean" in result["sql"]
    assert result["params"] == [True]


def test_numeric_field_equality():
    result = criteria_to_sql("(Queue_Rank == 5)", "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert "::numeric" in result["sql"]
    assert result["params"] == ["5"]


def test_negation_wraps_in_not():
    # Node's own output: "(NOT ((...)))" -- confirmed by running the real
    # server/pg/criteria-sql.mjs directly -- the outer parens come from the primary() grouping rule.
    result = criteria_to_sql('(!(Status == "Yes"))', "Sales_Order_Fulfillment", {}, 0)
    assert result is not None
    assert result["sql"].startswith("(NOT (")


def test_unknown_field_name_is_unsupported():
    result = criteria_to_sql('(Totally_Made_Up_Field == "x")', "Sales_Order_Fulfillment", {}, 0)
    assert result is None


def test_trailing_garbage_after_a_valid_expression_is_unsupported():
    result = criteria_to_sql('(Status == "Yes") extra', "Sales_Order_Fulfillment", {}, 0)
    assert result is None
