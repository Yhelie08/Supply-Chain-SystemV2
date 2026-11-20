# Python Integrations Port (Books / Akeneo / Shopify) — Design

## Goal

Port the six remaining "not ported yet" custom-API placeholders in `app/procurement/apis.py` to real Python, reproducing the Node implementation's current behavior exactly (parity first, not the fuller HomeCartel spec v1.4). These are the last real Node source files left in `server/modules/procurement/` and `server/{books,akeneo,shopify}/` that this port has not yet touched.

## Scope

**In scope — six files, all with real, working Node source to port from:**

| Node source | Python target | What it is |
|---|---|---|
| `server/books/client.mjs` (112 lines) | `app/books/client.py` | OAuth refresh-token client for Zoho Books v3 + Zoho Inventory v1. Concurrency cap (4 in flight), 429 exponential backoff (1s/2s/4s, 3 tries), 401 → refresh-once-and-retry, Books' own `{code, message}` envelope treated as an error whenever `code !== 0` even on HTTP 200. |
| `server/akeneo/client.mjs` (97 lines) | `app/akeneo/client.py` | OAuth2 password-grant client for Akeneo PIM. Product search (identifier, falls back to name), single product fetch, media download (product images), 401 → re-authenticate-once-and-retry. |
| `server/shopify/client.mjs` (45 lines) | `app/shopify/client.py` | Minimal Shopify Admin GraphQL client. One query: exact-SKU variant price lookup. Read-only. |
| `server/modules/procurement/books-apis.mjs` (151 lines) | `app/procurement/books_apis.py` | Custom APIs `create_books_contact`, `add_item_by_id`, `fetch_customer_from_books`. |
| `server/modules/procurement/akeneo-apis.mjs` (118 lines) | `app/procurement/akeneo_apis.py` | Custom APIs `search_items_akeneo`, `fetch_item_from_akeneo` (depends on the Shopify client for a price lookup). |
| `server/modules/procurement/estimates.mjs` (159 lines) | `app/procurement/estimates.py` | Custom API `create_estimate` — one Zoho Books estimate per project, built from every "ready" Inquiry of that project. |

**Wiring:** all six custom-API names (`create_books_contact`, `add_item_by_id`, `fetch_customer_from_books`, `search_items_akeneo`, `fetch_item_from_akeneo`, `create_estimate`) already exist in `app/procurement/apis.py`'s implicit placeholder list — they currently fall through to `invoke_custom_api`'s generic "not ported yet" answer. This task registers the six real handlers over them, the same `CUSTOM_APIS[name] = handler` mechanism every other custom API in this port already uses.

**Explicitly out of scope (nothing real exists to port):**
- The PO-approval "books the PO in Zoho Books" second half (`po-approval.mjs`'s own comment: *"Not ported: the second half of the Tony / Fenteng functions, which books the PO in Zoho Books (on hold)."*) — Node itself never built this. Parity-first means there is nothing here to port.
- `ZB-R1`'s job-queue-with-retries infrastructure from the spec v1.4 Zoho Books Integration doc — confirmed by searching the whole Node server tree that no such queue exists (`server/modules/delivery-management/exception-queue.mjs` and `job-status.mjs` are a different, unrelated delivery-management concept). This is spec text describing a future requirement, not implemented Node behavior.
- Any live credential wiring, `.env` changes, or real network call to Zoho Books, Akeneo, or Shopify. The user explicitly asked that Books stay untouched in the sense of "never calls out live" — every client function stays fully pluggable (`fetch`/`sleep`/`env` injectable, exactly as Node's own client constructors already are) so tests run with zero network access, matching how Node's own test suite verifies this code today.

## Testing approach

**Books** (`client.py`, `books_apis.py`, `estimates.py`): full test coverage, ported from the three real Node test files that already exist and pass:
- `tests/core/books-client.test.js` → `tests/books/test_client.py` — the OAuth/retry/concurrency/error-envelope behavior, with a fake `fetch` (no network).
- `tests/procurement/books-apis.test.js` → `tests/procurement/test_books_apis.py`
- `tests/procurement/books-estimates.test.js` → `tests/procurement/test_estimates.py`

All three Node files already use a fully mocked HTTP layer (a fake `fetch` callable recording calls and returning scripted responses) — directly portable to Python via a pluggable `fetch_impl` callable on `create_zoho_api()`, matching this port's established pattern of constructor-injectable I/O for testability (see `app/store.py`'s `db` parameter, `app/forecast/*`'s injectable `today`).

**Akeneo and Shopify** (`akeneo_apis.py`, `akeneo/client.py`, `shopify/client.py`): ported as working code with no new test files. Confirmed by searching the entire Node `tests/` tree that no `.test.js` file exercises `akeneo-apis.mjs`, `akeneo/client.mjs`, or `shopify/client.mjs` at all — Node itself has zero coverage here. Per explicit user decision, the Python port matches that exactly rather than inventing verification Node never had. The code is still written to the same injectable-dependency shape as the Books client, so tests can be added later without a rewrite.

## Error-handling convention (ported verbatim from Node)

Every client exposes an `is_configured()` check and raises a typed error (`BooksError`, `AkeneoError`, `ShopifyError` — matching Node's own three error classes) carrying `status`/`code`/`details` when relevant. Every custom-API handler catches its own client's error type and returns `{"status": "error", "message": ...}` rather than raising — matching the `{status, message, ...}` envelope every other custom API in this port already returns. A missing/unconfigured client is answered with a clear "X is not available in this backend" message, never a crash — this is how a Procurement widget on a machine with no Books credentials behaves identically in Node today, and must behave identically here.

## File-by-file behavior notes (from reading the real Node source in full)

- **`books/client.mjs`**: `request()` acquires a concurrency slot (max 4), refreshes the OAuth token on demand (shared in-flight refresh, not one-per-caller), retries once on HTTP 401, retries up to 3 times on HTTP 429 with exponential backoff, and treats a non-zero Books `code` field as an error even when the HTTP status is 200. Binary downloads (`download()`) skip JSON parsing and return `{buffer, contentType}`.
- **`books-apis.mjs`**: `create_books_contact` maps this app's `Customer_Type` values onto Books' own "Customer Type" custom field dropdown (`Enduser` → `End User`, `Designer` → `Design Partner`), uses `firstName`/`lastName` if given else splits the whole customer name into the first-name slot, and links the created Books contact id back onto `Customer.ID1` (swallowing a 9280 "not found" error on that link-back). `add_item_by_id` upserts into `Items` matched by `ID1`, computes `Warehouse` from warehouses with nonzero actual stock, computes `Bin_location` per a fixed three-warehouse list (`BIN_WAREHOUSES`) by calling Books' storage-locations endpoint per warehouse, and fetches the item's image only once (never re-fetched on a later update if the record already has one). `fetch_customer_from_books` is a read-only refresh of `Email`/`Phone_Number`/`Mobile`/addresses/`Customer_Type` from a linked Books contact, triggered on customer pick in the UI (not bulk, to protect API quota).
- **`akeneo/client.mjs`**: password-grant OAuth, one shared token (not per-request), 401 → re-authenticate once and retry. `searchItems` tries an identifier-contains search first; if that returns fewer than `limit` results it also tries a name-contains search and merges, deduped by identifier, capped at `limit` — single page, no `search_after` follow-up (a live dropdown search fires on every typing pause, so this never paginates).
- **`akeneo-apis.mjs`**: `fetch_item_from_akeneo` strips Akeneo's rich-text HTML `description` to plain text, builds a `Dimension` string from four metric attributes (`Length2`/`Width`/`Height2`/`Diameter`, each `{amount, unit}` with unit shortened via a fixed map), looks up `Rate` from Shopify by SKU (Akeneo's own "Costing" attribute is a bucketed cost-tier range, not a precise sellable price — explicitly not used for `Rate`), upserts `Items` matched by `ID1` (Akeneo's `identifier` doubles as `ID1` here, since it's also the SKU), and fetches the product image only once per item, same "fetch once, cache forever" rule as `add_item_by_id`.
- **`shopify/client.mjs`**: a single GraphQL query (`productVariants` by exact SKU), returns `null` (not an error) when nothing is listed under that SKU — most Akeneo items have no Shopify listing yet, and that is an expected, non-error outcome.
- **`estimates.mjs`**: one Books Estimate per Project. The *first* "Create estimate" call for a project creates it from every currently-ready Inquiry of that project (and its `quote_group` siblings); later calls update the same estimate, preserving each line's Books `line_item_id` where the SKU still matches. Readiness is **recomputed from the inquiry's own fields** (`is_ready()`), not read off a possibly-stale `Ready_for_Estimates` flag, so a flag that drifted out of sync never silently blocks or wrongly allows an estimate. If Books reports the stored estimate id no longer exists (404 / Books code 1002), the stored id is cleared and a new estimate is created — but a genuine Books *outage* (any other error) must **not** be mistaken for "the estimate is gone": the call stops with an error instead of risking a duplicate estimate.

## Interfaces

```python
# app/books/client.py
class BooksError(Exception):
    def __init__(self, message: str, *, status: int = 0, code=None, details=None): ...

def create_zoho_api(*, env=None, fetch_impl=None, sleep=None, now=None) -> ZohoApi: ...
# ZohoApi exposes: .books (service), .inventory (service), .is_configured() -> bool
# each service exposes: .get(path, *, query=None) / .post(path, body=None, *, query=None) /
#                        .put(path, body=None, *, query=None) / .delete(path, *, query=None) /
#                        .download(path, *, query=None) -> {"buffer": bytes, "content_type": str}

# app/akeneo/client.py
class AkeneoError(Exception):
    def __init__(self, message: str, *, status: int = 0, details=None): ...

def create_akeneo_api(*, env=None, fetch_impl=None) -> AkeneoApi: ...
# AkeneoApi exposes: .search_items(text, *, limit=20) -> list
#                     .get_item(identifier) -> dict
#                     .download_media(url) -> {"buffer": bytes, "content_type": str}
#                     .is_configured() -> bool

# app/shopify/client.py
class ShopifyError(Exception):
    def __init__(self, message: str, *, status: int = 0, details=None): ...

def create_shopify_api(*, env=None, fetch_impl=None) -> ShopifyApi: ...
# ShopifyApi exposes: .price_for_sku(sku) -> {"price": str, "product_title": str} | None
#                      .is_configured() -> bool

# app/procurement/books_apis.py
async def create_books_contact(payload: dict, store, ctx: dict) -> dict: ...
async def add_item_by_id(payload: dict, store, ctx: dict) -> dict: ...
async def fetch_customer_from_books(payload: dict, store, ctx: dict) -> dict: ...
# ctx carries: books (a ZohoApi or None), user (str), save_upload (async callable or None)

# app/procurement/akeneo_apis.py
async def search_items_akeneo(payload: dict, store, ctx: dict) -> dict: ...
async def fetch_item_from_akeneo(payload: dict, store, ctx: dict) -> dict: ...
# ctx carries: akeneo (an AkeneoApi or None), shopify (a ShopifyApi or None), user, save_upload

# app/procurement/estimates.py
async def create_estimate(payload: dict, store, ctx: dict) -> dict: ...
# ctx carries: books (a ZohoApi or None)
```

Every handler keeps the exact `(payload, store, ctx)` three-arg shape `app/custom_apis.py`'s `invoke_custom_api` already calls every custom API with, confirmed against the real dispatcher signature (not the `(payload, data, ctx)` Node destructures its own second parameter as — same underlying value, Python just calls it `store` to match this port's own naming throughout).

## Open questions resolved during brainstorming

- **Live credentials**: not wired. No `.env` changes. All three clients stay fully pluggable for testing; nothing in this task ever calls a real Zoho Books, Akeneo, or Shopify endpoint.
- **Akeneo/Shopify test gap**: ported with no new tests, matching Node's own current state. Confirmed via a full-repo search of `tests/` for `akeneo`/`shopify` — zero matches.
- **PO-approval Books-booking half**: confirmed out of scope — no real Node code exists for it.
