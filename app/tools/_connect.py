# One way for the command line tools to open the database: DATABASE_URL, with the same SSL rule as the server (no SSL for localhost and
# *.railway.internal). The tools use a single connection, which the store accepts like a pool.
import os
from urllib.parse import urlsplit

import asyncpg

LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


def host_of(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


def is_local(url: str) -> bool:
    return host_of(url) in LOCAL_HOSTS


def database_url(env=None) -> str:
    env = os.environ if env is None else env
    url = (env.get("DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit("Set DATABASE_URL to the database to use (for example postgresql://postgres@127.0.0.1:54329/supply_chain_test).")
    return url


async def connect(url: str):
    host = host_of(url)
    plain = host in LOCAL_HOSTS or host.endswith(".railway.internal")
    ssl = False if (os.environ.get("PGSSL") == "disable" or plain) else "require"
    search_path = os.environ.get("PG_SEARCH_PATH")
    return await asyncpg.connect(url, ssl=ssl, server_settings={"search_path": search_path} if search_path else None)
