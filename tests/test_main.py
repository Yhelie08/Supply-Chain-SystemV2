import os

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(db_conn, monkeypatch):
    # Plain (non-async) fixture: Starlette's TestClient drives the ASGI app on its own dedicated
    # thread and event loop, entirely separate from pytest-asyncio's per-test loop that db_conn
    # runs on. Making this fixture itself async put TestClient's startup inside that other loop and
    # the asyncpg pool ended up split across loops -- login silently failed with no raised error.
    # db_conn's async setup/teardown still runs correctly; this fixture only consumes its result.
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "a-real-admin-password-1")
    url = os.environ["TEST_DATABASE_URL"]
    # main.py opens its own connection pool, separate from the db_conn fixture's single connection;
    # PG_SEARCH_PATH makes every connection the pool hands out default into the same "python_test"
    # schema db_conn already created/cleaned, so writes through the app land where teardown expects.
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("PG_SEARCH_PATH", "python_test")
    with TestClient(create_app()) as c:
        yield c


def _login(client, email="admin@example.com", password="a-real-admin-password-1"):
    resp = client.post("/login", data={"email": email, "password": password, "next": "/"}, follow_redirects=False)
    assert resp.status_code == 302
    cookie = resp.cookies.get("hc_session")
    assert cookie
    client.cookies.set("hc_session", cookie)
    if resp.headers["location"] == "/account?first=1":
        # The bootstrapped admin starts with mustChangePassword=True (matches Node's createUser
        # default); clear it the same way the real account page would, so write-op tests below can
        # exercise more than just that one gate.
        pw_resp = client.post("/api/account/password", json={"current": password, "next": "a-new-admin-password-2"})
        assert pw_resp.status_code == 200
        new_cookie = pw_resp.cookies.get("hc_session")
        if new_cookie:
            client.cookies.set("hc_session", new_cookie)
    return cookie


def test_unauthenticated_request_to_a_protected_api_route_gets_401(client):
    resp = client.post("/api/getRecords", json={"report_name": "Sales_Order_Fulfillment_Report"})
    assert resp.status_code == 401


def test_a_user_who_must_change_password_is_blocked_from_api_calls_until_they_do(client):
    resp = client.post("/login", data={"email": "admin@example.com", "password": "a-real-admin-password-1", "next": "/"}, follow_redirects=False)
    client.cookies.set("hc_session", resp.cookies.get("hc_session"))
    assert resp.headers["location"] == "/account?first=1"
    blocked = client.post("/api/getRecords", json={"report_name": "Sales_Order_Fulfillment_Report"})
    assert blocked.status_code == 403


def test_unknown_operation_name_gets_404(client):
    _login(client)
    resp = client.post("/api/notARealOperation", json={})
    assert resp.status_code == 404
    assert resp.json()["code"] == 404


def test_get_records_after_login_returns_200_with_code_3000_envelope(client):
    _login(client)
    resp = client.post("/api/getRecords", json={"report_name": "Sales_Order_Fulfillment_Report"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 3000
    assert isinstance(body["data"], list)


def test_application_error_still_returns_http_200_with_a_nonzero_code_in_the_body(client):
    _login(client)
    # No record exists at this id -- store.get_record_by_id raises ZohoError(9280, ...), which the
    # dispatcher must turn into an HTTP 200 with a nonzero code, never a 4xx/5xx status.
    resp = client.post("/api/getRecordById", json={"report_name": "Sales_Order_Fulfillment_Report", "id": "999999999"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] != 3000
    assert "message" in body


def test_add_record_then_get_records_round_trips_through_the_http_layer(client):
    _login(client)
    add_resp = client.post("/api/addRecords", json={"form_name": "Sales_Order_Fulfillment", "data": {"SO_No": "SO-HTTP-1"}})
    assert add_resp.status_code == 200
    add_body = add_resp.json()
    assert add_body["code"] == 3000
    record_id = add_body["data"]["ID"]
    assert isinstance(record_id, str)

    get_resp = client.post("/api/getRecordById", json={"report_name": "Sales_Order_Fulfillment_Report", "id": record_id})
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["SO_No"] == "SO-HTTP-1"


def test_update_record_by_id_round_trips(client):
    _login(client)
    record_id = client.post("/api/addRecords", json={"form_name": "Sales_Order_Fulfillment", "data": {"SO_No": "SO-HTTP-2"}}).json()["data"]["ID"]
    upd_resp = client.post("/api/updateRecordById", json={"report_name": "Sales_Order_Fulfillment_Report", "id": record_id, "data": {"Fulfillment_Stage": "Order Readiness"}})
    assert upd_resp.status_code == 200
    assert upd_resp.json()["message"] == "Data Updated Successfully!"

    get_resp = client.post("/api/getRecordById", json={"report_name": "Sales_Order_Fulfillment_Report", "id": record_id})
    assert get_resp.json()["data"]["Fulfillment_Stage"] == "Order Readiness"


def test_delete_record_by_id_removes_it(client):
    _login(client)
    record_id = client.post("/api/addRecords", json={"form_name": "Sales_Order_Fulfillment", "data": {"SO_No": "SO-HTTP-3"}}).json()["data"]["ID"]
    del_resp = client.post("/api/deleteRecordById", json={"report_name": "Sales_Order_Fulfillment_Report", "id": record_id})
    assert del_resp.status_code == 200
    assert del_resp.json()["message"] == "Record Deleted Successfully!"

    get_resp = client.post("/api/getRecordById", json={"report_name": "Sales_Order_Fulfillment_Report", "id": record_id})
    assert get_resp.json()["code"] != 3000


def test_invoke_custom_api_for_an_unregistered_name_reports_not_ported(client):
    _login(client)
    resp = client.post("/api/invokeCustomApi", json={"api_name": "something_unported", "payload": {}})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 3000
    assert body["result"]["status"] == "error"
    assert "not ported yet" in body["result"]["message"]


def test_api_pages_lists_sections_for_a_signed_in_user(client):
    _login(client)
    resp = client.get("/api/pages")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_api_me_reports_the_signed_in_user(client):
    _login(client)
    resp = client.get("/api/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "admin@example.com"
    assert body["dataSource"] == "Postgres"


def test_login_page_serves_html_when_signed_out(client):
    resp = client.get("/login")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]


def test_login_with_the_wrong_password_redirects_back_with_an_error_flag(client):
    resp = client.post("/login", data={"email": "admin@example.com", "password": "totally-wrong", "next": "/"}, follow_redirects=False)
    assert resp.status_code == 302
    assert "e=1" in resp.headers["location"]


def test_healthz_is_public_and_needs_no_session(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
