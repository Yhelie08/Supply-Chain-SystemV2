from app.fulfillment.where import eq


def test_eq_builds_a_zoho_criteria_string():
    assert eq("SO_No", "SO-1") == '(SO_No == "SO-1")'


def test_eq_escapes_backslashes_and_quotes():
    assert eq("SO_No", 'a "quoted" \\ value') == '(SO_No == "a \\"quoted\\" \\\\ value")'


def test_eq_treats_none_as_an_empty_string():
    assert eq("SO_No", None) == '(SO_No == "")'
