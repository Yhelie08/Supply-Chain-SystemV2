import json
import pytest
from datetime import datetime, timedelta

from app.procurement.decisions_core import alert_recipient, sales_agent_recipient, prepare_item, escalate_overdue, parse_zoho


def test_alert_recipient_reads_the_procurement_alert_email_setting():
    settings = {"procurement_alert_email": "buyer@example.test"}
    assert alert_recipient(settings) == "buyer@example.test"


# Node: 'the "tell the customer" alert goes to the sales-agent setting, not the general procurement one'
def test_sales_agent_recipient_prefers_the_sales_agent_setting():
    settings = {"procurement_alert_email": "general@example.test", "sales_agent_alert_email": "sales@example.test"}
    assert sales_agent_recipient(settings) == "sales@example.test"


# Node: 'with no sales-agent setting, "tell the customer" falls back to the general alert recipient'
def test_sales_agent_recipient_falls_back_to_the_general_alert_email():
    settings = {"procurement_alert_email": "general@example.test"}
    assert sales_agent_recipient(settings) == "general@example.test"


def test_parse_zoho_reads_a_timestamp_with_am_pm_and_a_bare_date():
    d = parse_zoho("2026-11-17 10:55:59 AM")
    assert (d.year, d.month, d.day, d.hour, d.minute, d.second) == (2026, 11, 17, 10, 55, 59)
    d2 = parse_zoho("2026-11-17")
    assert (d2.year, d2.month, d2.day) == (2026, 11, 17)
    assert parse_zoho("") is None


# Node: 'an Act now shipment still in production gets one air_upgrade decision, with the numbers, once'
@pytest.mark.asyncio
async def test_prepare_item_creates_a_pending_row_with_options_summary_and_due_at(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    settings = {"procurement_alert_email": "buyer@example.test", "approval_sla_hours": 24}
    row_id = await prepare_item(
        store, settings, kind="air_upgrade", ship={"ID": "1", "Shipment_No": "SHP-1"},
        summary="By air it would save 16 days", options=["upgrade_air", "move_target", "tell_customer"],
    )
    row = await store.get_record_by_id("Approval_Queue", row_id, raw=True)
    assert row["Status"] == "pending"
    assert json.loads(row["Options"]) == ["upgrade_air", "move_target", "tell_customer"]
    assert "By air it would save 16 days" in row["Summary"]
    assert row["Due_At"]
    assert row["Record_Id"] == "1"
    assert row["Record_No"] == "SHP-1"


# Node: 'AQ-3: not decided within the hours it escalates once, with an alert'
@pytest.mark.asyncio
async def test_escalate_overdue_fires_once_after_the_window(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store

    await ensure_schema(db_conn)
    store = create_store(db_conn)
    settings = {"procurement_alert_email": "buyer@example.test", "approval_sla_hours": 24}
    now = datetime.now()
    row_id = await prepare_item(store, settings, kind="air_upgrade", ship={"ID": "1", "Shipment_No": "SHP-1"}, summary="s", options=[])
    # Due_At is now + 24h; before that window, nothing escalates.
    assert await escalate_overdue(store, settings, now) == 0
    later = now + timedelta(hours=25)
    assert await escalate_overdue(store, settings, later) == 1
    row = await store.get_record_by_id("Approval_Queue", row_id, raw=True)
    assert row["Escalated_At"]
    assert await escalate_overdue(store, settings, later) == 0, "once"
