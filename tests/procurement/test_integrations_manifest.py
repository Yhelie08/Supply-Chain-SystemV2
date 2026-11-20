# Confirms the six Books/Akeneo/Shopify custom APIs are wired through app.procurement.apis, the same
# way the manifest test in test_module_manifest.py already confirms the rest of Procurement's own
# custom APIs (this file is intentionally narrower in scope: it checks the six *new* names only).
def test_books_and_akeneo_custom_apis_are_registered():
    import app.procurement.apis  # noqa: F401 -- import registers every handler as a side effect
    from app.custom_apis import CUSTOM_APIS
    for name in ["create_books_contact", "add_item_by_id", "fetch_customer_from_books", "search_items_akeneo", "fetch_item_from_akeneo", "create_estimate"]:
        assert name in CUSTOM_APIS, name


def test_remaining_placeholders_are_still_unregistered():
    # create_bin_receiving (a genuine Node placeholder) must still fall through to the generic
    # "not ported yet" answer -- confirms this task did not accidentally register something it
    # shouldn't have.
    import app.procurement.apis  # noqa: F401
    from app.custom_apis import CUSTOM_APIS
    assert "create_bin_receiving" not in CUSTOM_APIS
