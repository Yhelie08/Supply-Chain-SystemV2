# Accounts and sign-in. Ported from server/auth.mjs. Node's version picks a storage backend
# (SQLite or Postgres) at module load; this port only ever targets Postgres (asyncpg), and is
# instance-based (create_auth(conn)) rather than a module-level singleton, so tests can run
# against an isolated connection/schema and FastAPI (Task 8) can inject it as a dependency.
import base64
import hashlib
import os
import re
import time

COOKIE = "hc_session"
SESSION_DAYS = 14
SESSION_TTL_SECONDS = 30  # how long a resolved session is cached in-process before re-checking the DB


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _norm_email(e) -> str:
    return str(e or "").strip().lower()


_EMAIL_OR_USERNAME_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$|^[a-z0-9._-]{3,32}$")


def is_email(e) -> bool:
    return bool(_EMAIL_OR_USERNAME_RE.match(_norm_email(e)))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    hashed = hashlib.scrypt(str(password).encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f"scrypt${salt.hex()}${hashed.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    parts = str(stored).split("$")
    if len(parts) != 3:
        return False
    _, salt_hex, hash_hex = parts
    if not salt_hex or not hash_hex:
        return False
    hashed = hashlib.scrypt(str(password).encode(), salt=bytes.fromhex(salt_hex), n=16384, r=8, p=1, dklen=64)
    return hashed == bytes.fromhex(hash_hex)


def new_password() -> str:
    return base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")


def password_problem(p) -> str | None:
    return "Use at least 10 characters." if len(str(p or "")) < 10 else None


def _public_user(u) -> dict | None:
    if not u:
        return None
    return {
        "id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"],
        "team_name": u["team_name"], "active": bool(u["active"]),
        "mustChangePassword": bool(u["must_change_password"]),
        "createdAt": u["created_at"], "lastLogin": u["last_login"],
    }


async def ensure_schema(conn) -> None:
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _users (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
            team_name TEXT DEFAULT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            must_change_password INTEGER NOT NULL DEFAULT 1,
            created_at TEXT, last_login TEXT
        )
    """)
    await conn.execute("ALTER TABLE _users ADD COLUMN IF NOT EXISTS team_name TEXT DEFAULT NULL")
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES _users(id) ON DELETE CASCADE,
            expires_at BIGINT NOT NULL
        )
    """)


def create_auth(conn):
    failures: dict[str, dict] = {}  # ip -> {"n": int, "until": epoch_ms}
    session_cache: dict[str, dict] = {}  # token hash -> {"user": dict, "until": epoch_ms}

    def now_ms() -> int:
        return int(time.time() * 1000)

    def zoho_now() -> str:
        from app.criteria import zoho_now as _zn
        return _zn()

    def forget_sessions() -> None:
        session_cache.clear()

    def too_many_attempts(ip: str) -> bool:
        f = failures.get(ip)
        return bool(f) and f["n"] >= 8 and f["until"] > now_ms()

    def note_failure(ip: str) -> None:
        f = failures.get(ip)
        n = f["n"] + 1 if f and f["until"] > now_ms() else 1
        failures[ip] = {"n": n, "until": now_ms() + 15 * 60 * 1000}

    async def admin_count() -> int:
        row = await conn.fetchrow("SELECT COUNT(*) AS n FROM _users WHERE role = 'admin' AND active = 1")
        return row["n"]

    async def create_user(*, email, name="", role="user", team_name=None, password, must_change=True) -> dict:
        email = _norm_email(email)
        if not is_email(email):
            raise ValueError("Enter a valid email or username (3-32 letters, digits, . _ -).")
        if await conn.fetchrow("SELECT 1 FROM _users WHERE email = $1", email):
            raise ValueError(f"{email} already has an account.")
        team = str(team_name).strip() if team_name else None
        row = await conn.fetchrow(
            "INSERT INTO _users (email, name, password_hash, role, team_name, must_change_password, created_at) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
            email, str(name).strip(), hash_password(password), "admin" if role == "admin" else "user",
            team, 1 if must_change else 0, zoho_now(),
        )
        return _public_user(row)

    async def list_users() -> list:
        rows = await conn.fetch("SELECT * FROM _users ORDER BY email")
        return [_public_user(r) for r in rows]

    async def get_user(id_) -> dict | None:
        row = await conn.fetchrow("SELECT * FROM _users WHERE id = $1", int(id_))
        return _public_user(row)

    async def update_user(id_, *, name=None, role=None, team_name=None, active=None) -> dict:
        forget_sessions()
        u = await conn.fetchrow("SELECT * FROM _users WHERE id = $1", int(id_))
        if not u:
            raise ValueError("User not found.")
        next_name = name if name is not None else u["name"]
        next_role = role if role is not None else u["role"]
        next_team = (str(team_name).strip() if team_name else None) if team_name is not None else u["team_name"]
        next_active = u["active"] if active is None else (1 if active else 0)
        if u["role"] == "admin" and (next_role != "admin" or not next_active) and await admin_count() <= 1:
            raise ValueError("Keep at least one active admin.")
        await conn.execute(
            "UPDATE _users SET name = $1, role = $2, team_name = $3, active = $4 WHERE id = $5",
            str(next_name).strip(), "admin" if next_role == "admin" else "user", next_team, next_active, u["id"],
        )
        if not next_active:
            await conn.execute("DELETE FROM _sessions WHERE user_id = $1", u["id"])
        return await get_user(u["id"])

    async def delete_user(id_) -> None:
        forget_sessions()
        u = await conn.fetchrow("SELECT * FROM _users WHERE id = $1", int(id_))
        if not u:
            raise ValueError("User not found.")
        if u["role"] == "admin" and u["active"] and await admin_count() <= 1:
            raise ValueError("Keep at least one active admin.")
        await conn.execute("DELETE FROM _sessions WHERE user_id = $1", u["id"])
        await conn.execute("DELETE FROM _users WHERE id = $1", u["id"])

    async def set_password(id_, password, *, must_change=False) -> None:
        forget_sessions()
        await conn.execute(
            "UPDATE _users SET password_hash = $1, must_change_password = $2 WHERE id = $3",
            hash_password(password), 1 if must_change else 0, int(id_),
        )
        await conn.execute("DELETE FROM _sessions WHERE user_id = $1", int(id_))

    async def change_own_password(id_, current, next_password) -> None:
        forget_sessions()
        u = await conn.fetchrow("SELECT * FROM _users WHERE id = $1", int(id_))
        if not u or not _verify_password(current, u["password_hash"]):
            raise ValueError("Your current password is not correct.")
        problem = password_problem(next_password)
        if problem:
            raise ValueError(problem)
        await set_password(u["id"], next_password)

    async def sign_in(email, password, ip) -> dict | None:
        u = await conn.fetchrow("SELECT * FROM _users WHERE email = $1", _norm_email(email))
        if u:
            ok = _verify_password(password, u["password_hash"])
        else:
            _verify_password(password, hash_password("x"))  # hash even on a miss: equal timing either way
            ok = False
        if not ok or not u["active"]:
            note_failure(ip)
            return None
        failures.pop(ip, None)
        token = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
        await conn.execute("DELETE FROM _sessions WHERE expires_at < $1", now_ms())
        await conn.execute(
            "INSERT INTO _sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
            _sha256(token), u["id"], now_ms() + SESSION_DAYS * 86400 * 1000,
        )
        await conn.execute("UPDATE _users SET last_login = $1 WHERE id = $2", zoho_now(), u["id"])
        return {"token": token, "user": _public_user(u)}

    async def _lookup_user_for_token(token) -> dict | None:
        row = await conn.fetchrow(
            "SELECT u.* FROM _sessions s JOIN _users u ON u.id = s.user_id "
            "WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.active = 1",
            _sha256(token), now_ms(),
        )
        return _public_user(row)

    async def user_for_token(token) -> dict | None:
        if not token:
            return None
        key = _sha256(token)
        hit = session_cache.get(key)
        if hit and hit["until"] > now_ms():
            return hit["user"]
        user = await _lookup_user_for_token(token)
        if user:
            if len(session_cache) > 500:
                session_cache.clear()
            session_cache[key] = {"user": user, "until": now_ms() + SESSION_TTL_SECONDS * 1000}
        else:
            session_cache.pop(key, None)
        return user

    async def sign_out(token) -> None:
        forget_sessions()
        if token:
            await conn.execute("DELETE FROM _sessions WHERE token_hash = $1", _sha256(token))

    async def bootstrap_admin(env: dict) -> str | None:
        row = await conn.fetchrow("SELECT COUNT(*) AS n FROM _users")
        if row["n"]:
            return None
        if not env.get("ADMIN_EMAIL") or not env.get("ADMIN_PASSWORD"):
            return "No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart to create the first admin."
        await create_user(email=env["ADMIN_EMAIL"], name=env.get("ADMIN_NAME", "Admin"), role="admin", password=env["ADMIN_PASSWORD"], must_change=True)
        return f"Created admin account {_norm_email(env['ADMIN_EMAIL'])}."

    class AuthStore:
        pass

    s = AuthStore()
    s.create_user = create_user
    s.list_users = list_users
    s.get_user = get_user
    s.update_user = update_user
    s.delete_user = delete_user
    s.set_password = set_password
    s.change_own_password = change_own_password
    s.sign_in = sign_in
    s.user_for_token = user_for_token
    s.sign_out = sign_out
    s.bootstrap_admin = bootstrap_admin
    s.too_many_attempts = too_many_attempts
    s.cookie_max_age = SESSION_DAYS * 86400
    return s
