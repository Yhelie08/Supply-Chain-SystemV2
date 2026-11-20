# The guard in conftest.py that keeps the Python tests off the shared Railway Postgres.
# Only the decision logic is tested, with fake URLs: no connection is ever opened.
import pytest

from conftest import check_test_database_url, host_of


@pytest.mark.parametrize("url", [
    "postgresql://postgres@localhost:5432/supply_chain_test",
    "postgresql://postgres:secret@127.0.0.1:54329/supply_chain_test",
    "postgresql://postgres@[::1]:5432/supply_chain_test",
    "postgresql://postgres@LOCALHOST/supply_chain_test",
    "postgres://user@localhost/db?sslmode=disable",
])
def test_a_local_host_is_allowed(url):
    assert check_test_database_url(url, allow_remote=False) is None


@pytest.mark.parametrize("url", [
    "postgresql://postgres:secret@viaduct.proxy.rlwy.net:12345/railway",
    "postgresql://postgres@10.0.0.5:5432/supply_chain_test",
    "postgresql://postgres@db.example.com/supply_chain_test",
    "postgresql://postgres@localhost.example.com/supply_chain_test",  # looks local, is not
    "postgresql://localhost@db.example.com/supply_chain_test",        # "localhost" only as the user name
    "postgresql:///supply_chain_test",                                 # no host at all (unix socket): not provably local
])
def test_a_remote_host_is_refused_with_a_clear_message(url):
    problem = check_test_database_url(url, allow_remote=False)
    assert problem is not None
    assert "Refusing to run the tests" in problem
    assert "ALLOW_REMOTE_TEST_DB=1" in problem
    assert "secret" not in problem  # the message never repeats the password


def test_the_refusal_names_the_host_but_not_the_whole_url():
    problem = check_test_database_url("postgresql://postgres:secret@db.example.com:5432/railway", allow_remote=False)
    assert "db.example.com" in problem
    assert "/railway" not in problem  # the database name is not repeated


def test_a_missing_url_is_refused():
    assert "TEST_DATABASE_URL" in check_test_database_url(None, allow_remote=True)
    assert "TEST_DATABASE_URL" in check_test_database_url("", allow_remote=False)


def test_allow_remote_test_db_1_lets_a_remote_host_through():
    assert check_test_database_url("postgresql://postgres@db.example.com/x", allow_remote=True) is None


def test_the_override_is_read_from_the_environment_and_only_the_value_1_counts(monkeypatch):
    url = "postgresql://postgres@db.example.com/x"
    monkeypatch.delenv("ALLOW_REMOTE_TEST_DB", raising=False)
    assert check_test_database_url(url) is not None
    monkeypatch.setenv("ALLOW_REMOTE_TEST_DB", "0")
    assert check_test_database_url(url) is not None
    monkeypatch.setenv("ALLOW_REMOTE_TEST_DB", "true")
    assert check_test_database_url(url) is not None
    monkeypatch.setenv("ALLOW_REMOTE_TEST_DB", "1")
    assert check_test_database_url(url) is None


def test_host_of_reads_the_host_only():
    assert host_of("postgresql://u:p@Example.COM:5432/db") == "example.com"
    assert host_of("postgresql://u@[::1]:5432/db") == "::1"
    assert host_of("not a url") == ""
