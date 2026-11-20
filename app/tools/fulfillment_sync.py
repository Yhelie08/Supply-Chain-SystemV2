# The Fulfillment catch-up, from the command line (replaces tools/fulfillment-sync.mjs):
#   DATABASE_URL=postgresql://... python -m app.tools.fulfillment_sync
# Carries all existing Fulfillment data on to the next module: paid + package -> Order Readiness, Released -> Pick, Marked picked ->
# Pack & QC, and brings every package's stage up to where its records show it is. Safe to run any time: it only acts where a step is
# missing. It writes through the plain store (no hooks), like the catch-up after a custom API call.
import asyncio
import sys

import app.fulfillment  # noqa: F401  (registers the Fulfillment hooks and APIs, as the server does)
from app.fulfillment.pipeline import reconcile_fulfillment
from app.schema import ensure_schema
from app.store import create_store
from app.tools._connect import connect, database_url, host_of


async def run(url: str, *, user: str = "fulfillment-sync") -> dict:
    conn = await connect(url)
    try:
        await ensure_schema(conn)
        return await reconcile_fulfillment(create_store(conn), user=user)
    finally:
        await conn.close()


def summary(done: dict) -> str:
    return f"Fulfillment catch-up: {done['gate']} package(s) sent to Readiness, {done['pick']} to Pick, {done['qc']} to Pack & QC, {done['stage']} stage change(s)."


def main(argv=None) -> int:
    url = database_url()
    print(f"Database host: {host_of(url) or '(none)'}")
    print(summary(asyncio.run(run(url))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
