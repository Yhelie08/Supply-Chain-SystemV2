import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.delivery.settings  # noqa: F401 -- registers the Policy_Settings hooks
    return create_hooked_store(raw)


async def _row_of(raw, key):
    return (await raw.find("Policy_Settings", lambda r: r.get("Policy_Key") == key))[0]


async def test_setting_row_validated_outside_limits_refused(raw, store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError, match=r"outside the allowed range \(1 to 60\)"):
        await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "9000"})
    with pytest.raises(ZohoError, match="enter a number"):
        await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "abc"})
    with pytest.raises(ZohoError, match="enter a time like 8:00 AM"):
        await store.add_record("Policy_Settings", {"Policy_Key": "workday_start_time", "Value": "25:00"})
    assert len(await raw.find("Policy_Settings", lambda r: r.get("Policy_Key") == "max_days_scheduling_window")) == 0


async def test_a_non_catalogue_key_passes_through_untouched(raw, store):
    # settings.mjs's own comment: "A key that is NOT in the catalogue ... passes through untouched."
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "some_other_module_key", "Value": "whatever"})
    row = await raw.get_record_by_id("Policy_Settings", id_, raw=True)
    assert row["Value"] == "whatever"


async def test_a_second_row_for_the_same_key_is_refused(raw, store):
    from app.criteria import ZohoError
    await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "20"})
    with pytest.raises(ZohoError, match="already has a row"):
        await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "30"})


async def test_change_written_to_history_second_write_refused_no_op_write_logs_nothing(raw, store):
    # add itself logs a history row too (Node registers `history` on both afterAdd and
    # afterUpdate) -- "" -> "20" is row 1, "20" -> "25" is row 2, the final no-op write logs nothing.
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "20"})
    await store.update_record("Policy_Settings", id_, {"Value": "25", "Change_Reason": "more buffer"}, user="admin@x")
    await store.update_record("Policy_Settings", id_, {"Value": "25"})  # same value: no history row
    h = sorted(await raw.find("Delivery_Settings_History"), key=lambda x: int(x["ID"]))
    assert len(h) == 2
    assert h[0]["Old_Value"] == "14", "the add's own 'before' value is the default (14), since no row existed yet"
    assert h[0]["New_Value"] == "20"
    assert h[1]["Setting_Key"] == "max_days_scheduling_window"
    assert h[1]["Old_Value"] == "20"
    assert h[1]["New_Value"] == "25"
    assert h[1]["Changed_By"] == "admin@x"
    assert h[1]["Reason"] == "more buffer"
    assert h[1]["Effect"] == "", "preview == 'none' for this key: no engine side effect"


async def test_a_ranking_key_change_does_not_crash_even_though_rescoreall_is_not_ported_yet(raw, store):
    # default_promise_days has preview: 'ranking'. Phase 1 has not ported sorter.rescoreAll yet, so
    # this phase's _history hook must not call it -- Effect stays blank for a ranking key's history
    # row until Phase 3 lands and this call is added back.
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "default_promise_days", "Value": "20"})
    await store.update_record("Policy_Settings", id_, {"Value": "30"})
    h = sorted(await raw.find("Delivery_Settings_History", lambda x: x.get("Setting_Key") == "default_promise_days"), key=lambda x: int(x["ID"]))
    assert len(h) == 2
    assert h[-1]["New_Value"] == "30"


async def test_deleting_a_row_reverts_to_default_and_logs_history(raw, store):
    id_ = await store.add_record("Policy_Settings", {"Policy_Key": "archive_after_days", "Value": "5"})
    await store.delete_record("Policy_Settings", id_, user="admin@x")
    h = await raw.find("Delivery_Settings_History", lambda x: x.get("Reason") == "Back to the default")
    assert len(h) == 1
    assert h[0]["Setting_Key"] == "archive_after_days"
    assert h[0]["New_Value"] == "7"  # the default


async def test_get_settings_shows_source_default_and_saved_and_marks_an_out_of_range_saved_row(raw, store):
    from app.delivery.settings import get_settings
    out = await get_settings(raw)
    assert {g for g in out["groups"]} == {"Scheduling window and workday", "Ranking", "Capacity", "Team rotation", "Alerts and archive"}
    by_key = {s["key"]: s for s in out["settings"]}
    assert by_key["max_days_scheduling_window"]["source"] == "default"
    assert by_key["max_days_scheduling_window"]["is_default"] is True
    assert by_key["max_days_scheduling_window"]["value"] == 14
    assert by_key["max_days_scheduling_window"]["problem"] is None

    # a row saved through the raw store (bypassing this module's own validation) can be out of range
    await raw.add_record("Policy_Settings", {"Policy_Key": "max_days_scheduling_window", "Value": "9000"})
    out2 = await get_settings(raw)
    row2 = next(s for s in out2["settings"] if s["key"] == "max_days_scheduling_window")
    assert row2["source"] == "saved"
    assert row2["problem"] is not None and "outside the allowed range" in row2["problem"]


async def test_get_settings_includes_last_changed_by_and_at_from_history(raw, store):
    from app.delivery.settings import get_settings
    await store.add_record("Policy_Settings", {"Policy_Key": "approval_sla_hours", "Value": "48"}, user="dispatcher@x")
    out = await get_settings(raw)
    row = next(s for s in out["settings"] if s["key"] == "approval_sla_hours")
    assert row["last_changed_by"] == "dispatcher@x"
    assert row["last_changed_at"]


async def test_preview_setting_unknown_key_is_error(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "nonsense", "5")
    assert out["status"] == "error"
    assert "not a Delivery setting" in out["message"]


async def test_preview_setting_invalid_value_is_error_without_writing(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "max_days_scheduling_window", "9000")
    assert out["status"] == "error"
    assert "outside the allowed range" in out["message"]
    assert len(await raw.find("Policy_Settings")) == 0


async def test_preview_setting_none_branch_message_and_shared_note(raw, store):
    from app.delivery.settings import preview_setting
    from app.delivery.settings_defs import DEFS
    out = await preview_setting(raw, "traffic_buffer_percent", "25")
    assert out["status"] == "success"
    assert "No open job changes right now" in out["message"]
    assert DEFS["traffic_buffer_percent"]["affects"] in out["message"]


async def test_preview_setting_ranking_branch_is_stubbed(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "default_promise_days", "30")
    assert out["status"] == "error"
    assert "Phase 3" in out["message"] and "Sorter/Rotation" in out["message"]


async def test_preview_setting_backlog_branch_is_stubbed(raw, store):
    from app.delivery.settings import preview_setting
    out = await preview_setting(raw, "delivery_max_teams", "4")
    assert out["status"] == "error"
    assert "Phase 7" in out["message"] and "Analytics" in out["message"]


async def test_get_delivery_settings_and_preview_delivery_setting_custom_apis_are_registered(raw, store):
    from app.custom_apis import invoke_custom_api
    out = await invoke_custom_api("get_delivery_settings", {}, raw, {})
    assert out["status"] == "success"
    assert out["groups"]
    out2 = await invoke_custom_api("preview_delivery_setting", {"key": "traffic_buffer_percent", "value": "25"}, raw, {})
    assert out2["status"] == "success"


ROLES_FORM = "Delivery_Roster"


async def test_roster_row_requires_a_valid_role(raw, store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError, match="Role must be installer, driver or vehicle"):
        await store.add_record(ROLES_FORM, {"Role": "manager", "Name": "Jo"})


async def test_roster_row_requires_a_name_within_60_chars(raw, store):
    from app.criteria import ZohoError
    with pytest.raises(ZohoError, match="Enter a name"):
        await store.add_record(ROLES_FORM, {"Role": "installer", "Name": ""})
    with pytest.raises(ZohoError, match="too long"):
        await store.add_record(ROLES_FORM, {"Role": "installer", "Name": "x" * 61})


async def test_roster_row_rejects_a_duplicate_name_in_the_same_role(raw, store):
    from app.criteria import ZohoError
    await store.add_record(ROLES_FORM, {"Role": "installer", "Name": "Jo"})
    with pytest.raises(ZohoError, match="already on the installer roster"):
        await store.add_record(ROLES_FORM, {"Role": "installer", "Name": "jo"})  # case-insensitive


async def test_roster_at_least_one_active_per_role_enforced_on_update_and_delete(raw, store):
    from app.criteria import ZohoError
    only = await store.add_record(ROLES_FORM, {"Role": "driver", "Name": "Sam", "Active": True})
    with pytest.raises(ZohoError, match="At least one driver must stay active"):
        await store.update_record(ROLES_FORM, only, {"Active": False})
    with pytest.raises(ZohoError, match="At least one driver must stay active"):
        await store.delete_record(ROLES_FORM, only)


async def test_roster_write_logs_history(raw, store):
    id_ = await store.add_record(ROLES_FORM, {"Role": "installer", "Name": "Jo", "Active": True, "Sort_Order": 1})
    h = await raw.find("Delivery_Settings_History", lambda x: x.get("Setting_Key") == "roster:installer")
    assert len(h) == 1
    assert "Jo (active, order 1)" in h[0]["New_Value"]
    await store.update_record(ROLES_FORM, id_, {"Name": "Jo Cruz"})
    h2 = await raw.find("Delivery_Settings_History", lambda x: x.get("Setting_Key") == "roster:installer")
    assert len(h2) == 2


async def test_get_roster_and_seed_roster_are_stubbed_until_phase_3(raw, store):
    from app.delivery.settings import get_roster, seed_roster
    out = await get_roster(raw)
    assert out["status"] == "error"
    assert "Phase 3" in out["message"] and "Sorter/Rotation" in out["message"]
    out2 = await seed_roster(raw, "admin@x")
    assert out2["status"] == "error"
    assert "Phase 3" in out2["message"]


async def test_get_delivery_roster_and_seed_delivery_roster_custom_apis_are_registered(raw, store):
    from app.custom_apis import invoke_custom_api
    out = await invoke_custom_api("get_delivery_roster", {}, raw, {})
    assert out["status"] == "error"
    out2 = await invoke_custom_api("seed_delivery_roster", {}, raw, {"user": "admin@x"})
    assert out2["status"] == "error"
