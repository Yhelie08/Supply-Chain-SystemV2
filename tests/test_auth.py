import pytest

from app import auth


@pytest.fixture
async def auth_store(db_conn):
    await auth.ensure_schema(db_conn)
    return auth.create_auth(db_conn)


def test_hash_password_then_verify_round_trips():
    hashed = auth.hash_password("correct-horse-battery-staple")
    assert hashed.startswith("scrypt$")
    assert auth._verify_password("correct-horse-battery-staple", hashed) is True
    assert auth._verify_password("wrong-password", hashed) is False


def test_is_email_accepts_a_real_email_or_a_short_username():
    assert auth.is_email("someone@example.com") is True
    assert auth.is_email("hcadmin") is True  # 3-32 chars, letters/digits/._- , confirmed from the Node regex
    assert auth.is_email("a") is False  # too short
    assert auth.is_email("has spaces") is False


def test_password_problem_flags_a_short_password():
    assert auth.password_problem("short") is not None
    assert auth.password_problem("longenoughpassword") is None


@pytest.mark.asyncio
async def test_create_user_then_sign_in_round_trips(auth_store):
    await auth_store.create_user(email="alice@example.com", name="Alice", password="a-real-password-1")
    result = await auth_store.sign_in("alice@example.com", "a-real-password-1", "127.0.0.1")
    assert result is not None
    assert result["user"]["email"] == "alice@example.com"
    assert "token" in result


@pytest.mark.asyncio
async def test_sign_in_with_the_wrong_password_returns_none(auth_store):
    await auth_store.create_user(email="bob@example.com", name="Bob", password="a-real-password-1")
    result = await auth_store.sign_in("bob@example.com", "totally-wrong", "127.0.0.1")
    assert result is None


@pytest.mark.asyncio
async def test_sign_in_for_an_unknown_email_returns_none_not_an_error(auth_store):
    result = await auth_store.sign_in("nobody@example.com", "whatever", "127.0.0.1")
    assert result is None


@pytest.mark.asyncio
async def test_sign_in_for_a_deactivated_user_returns_none(auth_store):
    user = await auth_store.create_user(email="carol@example.com", name="Carol", password="a-real-password-1")
    await auth_store.update_user(user["id"], active=False)
    result = await auth_store.sign_in("carol@example.com", "a-real-password-1", "127.0.0.1")
    assert result is None


@pytest.mark.asyncio
async def test_too_many_failed_attempts_blocks_further_sign_ins_from_that_ip(auth_store):
    await auth_store.create_user(email="dave@example.com", name="Dave", password="a-real-password-1")
    ip = "10.0.0.99"
    for _ in range(8):
        await auth_store.sign_in("dave@example.com", "wrong", ip)
    assert auth_store.too_many_attempts(ip) is True


@pytest.mark.asyncio
async def test_user_for_token_resolves_a_valid_session(auth_store):
    await auth_store.create_user(email="erin@example.com", name="Erin", password="a-real-password-1")
    signed_in = await auth_store.sign_in("erin@example.com", "a-real-password-1", "127.0.0.1")
    user = await auth_store.user_for_token(signed_in["token"])
    assert user is not None
    assert user["email"] == "erin@example.com"


@pytest.mark.asyncio
async def test_user_for_token_returns_none_for_an_unknown_token(auth_store):
    user = await auth_store.user_for_token("not-a-real-token")
    assert user is None


@pytest.mark.asyncio
async def test_sign_out_invalidates_the_session(auth_store):
    await auth_store.create_user(email="frank@example.com", name="Frank", password="a-real-password-1")
    signed_in = await auth_store.sign_in("frank@example.com", "a-real-password-1", "127.0.0.1")
    await auth_store.sign_out(signed_in["token"])
    user = await auth_store.user_for_token(signed_in["token"])
    assert user is None


@pytest.mark.asyncio
async def test_change_own_password_requires_the_correct_current_password(auth_store):
    user = await auth_store.create_user(email="grace@example.com", name="Grace", password="old-password-1")
    with pytest.raises(ValueError):
        await auth_store.change_own_password(user["id"], "wrong-current", "new-password-1")
    await auth_store.change_own_password(user["id"], "old-password-1", "new-password-1")
    result = await auth_store.sign_in("grace@example.com", "new-password-1", "127.0.0.1")
    assert result is not None


@pytest.mark.asyncio
async def test_cannot_deactivate_the_last_active_admin(auth_store):
    admin = await auth_store.create_user(email="admin@example.com", name="Admin", password="a-real-password-1", role="admin")
    with pytest.raises(ValueError):
        await auth_store.update_user(admin["id"], active=False)


@pytest.mark.asyncio
async def test_cannot_delete_the_last_active_admin(auth_store):
    admin = await auth_store.create_user(email="admin2@example.com", name="Admin", password="a-real-password-1", role="admin")
    with pytest.raises(ValueError):
        await auth_store.delete_user(admin["id"])


@pytest.mark.asyncio
async def test_bootstrap_admin_creates_the_first_admin_from_env(auth_store):
    msg = await auth_store.bootstrap_admin({"ADMIN_EMAIL": "boss@example.com", "ADMIN_PASSWORD": "a-real-password-1"})
    assert "boss@example.com" in msg
    result = await auth_store.sign_in("boss@example.com", "a-real-password-1", "127.0.0.1")
    assert result is not None


@pytest.mark.asyncio
async def test_bootstrap_admin_does_nothing_once_a_user_already_exists(auth_store):
    await auth_store.create_user(email="first@example.com", name="First", password="a-real-password-1")
    msg = await auth_store.bootstrap_admin({"ADMIN_EMAIL": "second@example.com", "ADMIN_PASSWORD": "a-real-password-1"})
    assert msg is None
