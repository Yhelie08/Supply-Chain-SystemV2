# FastAPI app: the /api/* contract that server/public/zoho-shim.js (unmodified) expects. Ported from
# server/index.mjs (BACKEND=pg path, i.e. server/pg/api.mjs's createPgApi/startPg). Every
# application-level error is HTTP 200 with {code, message} in the body; only "not authenticated"
# and "unknown operation" get a real HTTP error status (confirmed from the Node source).
import json
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote, urlsplit

import asyncpg
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response

from app import auth
from app.access import create_access
from app.akeneo.client import create_akeneo_api
from app.books.client import create_zoho_api
from app.criteria import ZohoError
from app.custom_apis import invoke_custom_api
from app.delivery.scoping import TEAM_SCOPING
from app.schema import ensure_schema
from app.shopify.client import create_shopify_api
from app.store import create_store
from app.workflows import create_hooked_store
import app.fulfillment  # noqa: F401 -- side effect: registers every Fulfillment hook and custom API
import app.procurement  # noqa: F401 -- side effect: registers every Procurement hook and custom API
import app.delivery  # noqa: F401 -- side effect: registers Delivery Management Phase 1's hooks and custom APIs
from app.fulfillment.apis import recalculate_fulfillment_queue, package_pick_status  # noqa: F401 -- names used below to gate the reconcile catch-up
from app.fulfillment.pipeline import reconcile_fulfillment

ROOT = Path(__file__).resolve().parent.parent
WIDGETS = ROOT / "modules"
PUBLIC = ROOT / "server" / "public"
UPLOADS = Path(os.environ.get("DATA_DIR", str(ROOT / "data"))) / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)

def _with_src(tab: dict) -> dict:
    widget_path = "/".join(quote(part, safe="") for part in tab["widget"].split("/"))
    return {**tab, "src": f"/w/{widget_path}/{quote(tab['entry'], safe='')}"}


_RAW_SECTIONS = json.loads((ROOT / "server" / "pages.json").read_text(encoding="utf-8"))
SECTIONS = [{**s, "tabs": [_with_src(t) for t in s["tabs"]]} for s in _RAW_SECTIONS]

MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4", ".pdf": "application/pdf",
}
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "frame-ancestors 'self'",
}

access = create_access(SECTIONS, str(WIDGETS), TEAM_SCOPING)


def _resp(status: int, body, content_type: str = "application/json") -> Response:
    headers = {"Cache-Control": "no-store", **SECURITY_HEADERS}
    if isinstance(body, (dict, list)):
        return JSONResponse(body, status_code=status, headers=headers)
    return Response(body, status_code=status, media_type=content_type, headers=headers)


def _inside(base: Path, rel: str) -> Path | None:
    f = (base / rel).resolve()
    try:
        f.relative_to(base.resolve())
    except ValueError:
        return None
    return f


def _serve_file(file: Path, transform=None) -> Response:
    if not file.is_file():
        return _resp(404, "Not found", "text/plain")
    ext = file.suffix.lower()
    body = file.read_bytes()
    if transform:
        body = transform(body.decode("utf-8")).encode("utf-8")
    return _resp(200, body, MIME.get(ext, "application/octet-stream"))


THEME_HEAD = (
    '<script src="/theme/theme-init.js"></script>'
    '<link rel="preload" href="/theme/fonts/overpass-latin.woff2" as="font" type="font/woff2" crossorigin>'
    '<link rel="stylesheet" href="/theme/theme.css">'
    '<link rel="stylesheet" href="/theme/views.css">'
    '<link rel="stylesheet" href="/theme/liquid.css">'
    '<script src="/theme/views.js" defer></script>'
)


def _apply_theme(html: str, line: str) -> str:
    kit = "dms" if "dms-tokens.css" in html else "tw" if "cdn.tailwindcss.com" in html else "legacy"
    attrs = f'data-hc-kit="{kit}" data-hc-line="{line}"'
    if re.search(r"<html\b", html, re.I):
        html = re.sub(r"<html\b", f"<html {attrs}", html, count=1, flags=re.I)
    else:
        html = f"<html {attrs}>{html}"
    if re.search(r"</head>", html, re.I):
        return re.sub(r"</head>", f"{THEME_HEAD}</head>", html, count=1, flags=re.I)
    return THEME_HEAD + html


def _plain_words(html: str) -> str:
    html = re.sub(r"Loading from Zoho Creator(…|\.\.\.)", r"Loading\1", html)
    html = html.replace("正在从 Zoho Creator 加载…", "正在加载…")
    html = html.replace("Loaded from Zoho Creator:", "Loaded from the local database:")
    html = html.replace("Failed to load records from Zoho Creator.", "Failed to load records.")
    html = re.sub(
        r"var mm=parseInt\(parts\[0\],10\), dd=parseInt\(parts\[1\],10\), yyyy=parseInt\(parts\[2\],10\);",
        "if (parts[0].length === 4) parts = [parts[1], parts[2], parts[0]]; "
        "var mm=parseInt(parts[0],10), dd=parseInt(parts[1],10), yyyy=parseInt(parts[2],10);",
        html,
    )
    return html


def _json_for_script(v) -> str:
    return json.dumps(v).replace("<", "\\u003c")


def _now_ms() -> int:
    return int(time.time() * 1000)


def _cookies(request: Request) -> dict:
    return request.cookies


def _is_https(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", "")
    return proto.split(",")[0].strip() == "https"


def _session_cookie_header(request: Request, token: str, max_age: int) -> str:
    secure = "; Secure" if _is_https(request) else ""
    return f"{auth.COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}"


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else ""


def _safe_next(n) -> str:
    return n if isinstance(n, str) and n.startswith("/") and not n.startswith("//") and not n.startswith("/login") else "/"


def _redirect(to: str, headers: dict | None = None) -> Response:
    resp = RedirectResponse(to, status_code=302, headers={"Cache-Control": "no-store", **SECURITY_HEADERS})
    for k, v in (headers or {}).items():
        resp.headers[k] = v
    return resp


def _data_source() -> str:
    return "Postgres"


def create_app() -> FastAPI:
    app = FastAPI()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        url = os.environ["DATABASE_URL"]
        host = urlsplit(url).hostname or ""
        plain = host in ("localhost", "127.0.0.1") or host.endswith(".railway.internal")
        ssl = False if (os.environ.get("PGSSL") == "disable" or plain) else "require"
        # Tests point this at a dedicated schema (conftest.py's "python_test") so the app's pool
        # never touches the real "public" schema while under test; production leaves it unset.
        # server_settings (a connection startup parameter), not a plain SET via an init callback:
        # asyncpg's default connection reset on release runs RESET ALL, which would wipe a search_path
        # set that way after the connection's first use -- server_settings survives reset because the
        # server reapplies it as part of the connection's own startup state.
        search_path = os.environ.get("PG_SEARCH_PATH")
        server_settings = {"search_path": search_path} if search_path else None

        pool = await asyncpg.create_pool(
            url, max_size=int(os.environ.get("PG_POOL_MAX", "10")), ssl=ssl, server_settings=server_settings,
        )
        async with pool.acquire() as conn:
            await ensure_schema(conn)
            await auth.ensure_schema(conn)
        _app.state.pool = pool
        _app.state.store = create_store(pool)
        books = create_zoho_api()
        print(f"[books] Zoho Books/Inventory {'configured' if books['is_configured']() else 'not configured (workflows and APIs that call Books will report it)'}")
        akeneo = create_akeneo_api()
        print(f"[akeneo] {'configured' if akeneo['is_configured']() else 'not configured (Items picker search will report it)'}")
        shopify = create_shopify_api()
        print(f"[shopify] {'configured' if shopify['is_configured']() else 'not configured (Akeneo item pick will skip the price lookup)'}")
        _app.state.hooked_store = create_hooked_store(_app.state.store, books=books)

        async def save_upload(name: str, buffer: bytes) -> str:
            file_name = f"{_now_ms()}_{re.sub(r'[^\\w.-]+', '_', str(name))}"
            (UPLOADS / file_name).write_bytes(buffer)
            return f"/uploads/{file_name}"

        _app.state.custom_api_ctx = {"books": books, "akeneo": akeneo, "shopify": shopify, "save_upload": save_upload}
        _app.state.auth = auth.create_auth(pool)
        note = await _app.state.auth.bootstrap_admin(os.environ)
        if note:
            print(note)
        yield
        await pool.close()

    app.router.lifespan_context = lifespan
    _register_routes(app)
    return app


def _register_routes(app: FastAPI) -> None:
    @app.get("/healthz")
    async def healthz():
        return _resp(200, {"ok": True})

    @app.get("/theme/{path:path}")
    async def theme_file(path: str):
        f = _inside(PUBLIC / "theme", path)
        return _serve_file(f) if f else _resp(404, "Not found", "text/plain")

    async def _current_user(request: Request):
        token = _cookies(request).get(auth.COOKIE)
        return await request.app.state.auth.user_for_token(token)

    @app.post("/login")
    async def login(request: Request):
        form = await request.form()
        store_auth = request.app.state.auth
        ip = _client_ip(request)
        next_ = _safe_next(form.get("next"))
        if store_auth.too_many_attempts(ip):
            return _redirect(f"/login?e=locked&next={next_}")
        result = await store_auth.sign_in(form.get("email"), form.get("password"), ip)
        if not result:
            return _redirect(f"/login?e=1&next={next_}")
        dest = "/account?first=1" if result["user"]["mustChangePassword"] else next_
        headers = {"Set-Cookie": _session_cookie_header(request, result["token"], store_auth.cookie_max_age)}
        return _redirect(dest, headers)

    @app.get("/login")
    async def login_page(request: Request):
        me = await _current_user(request)
        if me:
            return _redirect("/")
        return _serve_file(PUBLIC / "login.html")

    @app.post("/logout")
    async def logout(request: Request):
        token = _cookies(request).get(auth.COOKIE)
        await request.app.state.auth.sign_out(token)
        return _redirect("/login", {"Set-Cookie": _session_cookie_header(request, "", 0)})

    async def _account_api(request: Request, p: str, me: dict):
        store_auth = request.app.state.auth
        try:
            if p == "/api/me":
                return _resp(200, {**me, "dataSource": _data_source()})
            if p == "/api/account/password" and request.method == "POST":
                b = await request.json()
                await store_auth.change_own_password(me["id"], b.get("current"), b.get("next"))
                result = await store_auth.sign_in(me["email"], b.get("next"), _client_ip(request))
                resp = _resp(200, {"ok": True})
                resp.headers["Set-Cookie"] = _session_cookie_header(request, result["token"], store_auth.cookie_max_age)
                return resp
            if not p.startswith("/api/admin/"):
                return False
            if me["role"] != "admin":
                return _resp(403, {"message": "Only admins can manage users."})
            m = re.fullmatch(r"/api/admin/users(?:/(\d+)(/reset)?)?", p)
            if not m:
                return _resp(404, {"message": "Not found"})
            id_, reset = m.group(1), m.group(2)
            if not id_ and request.method == "GET":
                return _resp(200, await store_auth.list_users())
            if not id_ and request.method == "POST":
                b = await request.json()
                password = auth.new_password()
                user = await store_auth.create_user(
                    email=b.get("email"), name=b.get("name", ""), role=b.get("role", "user"),
                    team_name=b.get("team_name"), password=password, must_change=True,
                )
                return _resp(200, {"user": user, "password": password})
            if id_ and reset and request.method == "POST":
                password = auth.new_password()
                await store_auth.set_password(id_, password, must_change=True)
                return _resp(200, {"user": await store_auth.get_user(id_), "password": password})
            if id_ and request.method == "POST":
                b = await request.json()
                if int(id_) == me["id"]:
                    if b.get("role") == "user" or b.get("active") is False:
                        return _resp(400, {"message": "You cannot remove your own admin access."})
                    return _resp(200, await store_auth.update_user(id_, **b))
                return _resp(200, await store_auth.update_user(id_, **b))
            if id_ and request.method == "DELETE":
                if int(id_) == me["id"]:
                    return _resp(400, {"message": "You cannot delete your own account."})
                await store_auth.delete_user(id_)
                return _resp(200, {"ok": True})
            return _resp(405, {"message": "Method not allowed"})
        except ValueError as e:
            return _resp(400, {"message": str(e)})

    @app.post("/api/uploadFile")
    async def upload_file(request: Request):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        qs = dict(request.query_params)
        report, id_, field, name = qs.get("report"), qs.get("id"), qs.get("field"), qs.get("name")
        denied = access.check_upload(me, report)
        if denied:
            return _resp(200, denied)
        file_name = f"{_now_ms()}_{re.sub(r'[^\\w.-]+', '_', str(name))}"
        body = await request.body()
        (UPLOADS / file_name).write_bytes(body)
        file_url = f"/uploads/{file_name}"
        try:
            await request.app.state.hooked_store.update_record(report, id_, {field: file_url}, user=me["email"])
        except ZohoError as e:
            return _resp(200, {"code": e.code, "message": str(e)})
        return _resp(200, {"code": 3000, "data": {"filepath": file_url, "ID": id_}, "message": "File uploaded"})

    @app.post("/api/readFile")
    async def read_file(request: Request):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        b = await request.json()
        try:
            rec = await request.app.state.store.get_record_by_id(b["report_name"], b["id"])
        except ZohoError as e:
            return _resp(404, {"code": e.code, "message": str(e)})
        denied_rec = access.check_record_access(me, b["report_name"], rec)
        if denied_rec:
            return _resp(403, denied_rec)
        v = str(rec.get(b["field_name"]) or "")
        f = _inside(UPLOADS, v[len("/uploads/"):]) if v.startswith("/uploads/") else None
        if not f or not f.is_file():
            return _resp(404, {"code": 9280, "message": "File not found"})
        return _serve_file(f)

    OP_BODY_FIELD = {
        "addRecords": "form_name", "updateRecordById": "report_name",
        "updateRecords": "report_name", "deleteRecordById": "report_name",
    }

    async def _run_op(op_name: str, body: dict, user: str, hooked_store) -> dict:
        if op_name == "getRecords":
            # zoho-shim.js's getRecords body carries extra SDK fields (app_name, etc.) that Node's
            # loosely-typed JS object spread ignores; Python's **kwargs spread does not, so only the
            # fields get_records actually accepts are forwarded.
            kwargs = {k: body[k] for k in ("criteria", "page", "page_size", "max_records") if k in body}
            data = await hooked_store.get_records(body["report_name"], **kwargs, user=user)
            return {"code": 3000, "data": data}
        if op_name == "getRecordById":
            data = await hooked_store.get_record_by_id(body["report_name"], body["id"])
            return {"code": 3000, "data": data}
        if op_name == "addRecords":
            data = body.get("payload", {}).get("data") if body.get("payload") else body.get("data", {})
            if isinstance(data, list):
                result = []
                for d in data:
                    rid = await hooked_store.add_record(body["form_name"], d, user=user)
                    result.append({"code": 3000, "data": {"ID": rid}, "message": "Data Added Successfully!"})
                return {"code": 3000, "result": result, "data": [r["data"] for r in result]}
            rid = await hooked_store.add_record(body["form_name"], data, user=user)
            return {"code": 3000, "data": {"ID": rid}, "message": "Data Added Successfully!"}
        if op_name == "updateRecordById":
            data = body.get("payload", {}).get("data") if body.get("payload") else body.get("data", {})
            rid = await hooked_store.update_record(body["report_name"], body["id"], data, user=user)
            return {"code": 3000, "data": {"ID": rid}, "message": "Data Updated Successfully!"}
        if op_name == "updateRecords":
            crit = body.get("payload", {}).get("criteria") if body.get("payload") else body.get("criteria")
            recs = await hooked_store.get_records(body["report_name"], criteria=crit, page_size=1000, user=user)
            if not recs:
                raise ZohoError(9280, "No records found for the given criteria.")
            data = body.get("payload", {}).get("data") if body.get("payload") else body.get("data", {})
            result = []
            for r in recs:
                rid = await hooked_store.update_record(body["report_name"], r["ID"], data, user=user)
                result.append({"code": 3000, "data": {"ID": rid}, "message": "Data Updated Successfully!"})
            return {"code": 3000, "result": result}
        if op_name == "deleteRecordById":
            rid = await hooked_store.delete_record(body["report_name"], body["id"], user=user)
            return {"code": 3000, "data": {"ID": rid}, "message": "Record Deleted Successfully!"}
        raise LookupError(op_name)

    OPS = {"getRecords", "getRecordById", "addRecords", "updateRecordById", "updateRecords", "deleteRecordById", "invokeCustomApi"}

    @app.post("/api/{op_name}")
    async def api_dispatch(op_name: str, request: Request):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        if me["mustChangePassword"]:
            return _resp(403, {"code": 403, "message": "Set a new password first."})
        if op_name not in OPS:
            return _resp(404, {"code": 404, "message": f"Unknown operation /api/{op_name}"})

        body = await request.json()
        user = me["email"]
        denied = access.check_call(me, op_name, body)
        if denied:
            return _resp(200, denied)

        hooked_store = request.app.state.hooked_store
        raw_store = request.app.state.store

        try:
            if op_name == "getRecords" and body.get("report_name"):
                body["criteria"] = access.scope_criteria(me, body["report_name"], body.get("criteria"))
            elif op_name == "updateRecords" and body.get("report_name"):
                crit = body.get("payload", {}).get("criteria") if body.get("payload") else body.get("criteria")
                scoped = access.scope_criteria(me, body["report_name"], crit)
                if body.get("payload") and "criteria" in body["payload"]:
                    body["payload"]["criteria"] = scoped
                else:
                    body["criteria"] = scoped
                if me.get("team_name"):
                    data = body.get("payload", {}).get("data") if body.get("payload") else body.get("data", {})
                    if (data.get("Installer") and data["Installer"] != me["team_name"]) or \
                       (data.get("Assigned_to_Installer") and data["Assigned_to_Installer"] != me["team_name"]):
                        return _resp(200, {"code": 403, "message": "Cannot assign records to other teams."})
            elif op_name in ("updateRecordById", "deleteRecordById"):
                if me.get("team_name") and body.get("report_name") and body.get("id"):
                    try:
                        record = await raw_store.get_record_by_id(body["report_name"], body["id"])
                        denied_rec = access.check_record_access(me, body["report_name"], record)
                        if denied_rec:
                            return _resp(200, denied_rec)
                    except ZohoError:
                        pass  # let the op itself report not-found
                    if op_name == "updateRecordById":
                        data = body.get("payload", {}).get("data") if body.get("payload") else body.get("data", {})
                        if (data.get("Installer") and data["Installer"] != me["team_name"]) or \
                           (data.get("Assigned_to_Installer") and data["Assigned_to_Installer"] != me["team_name"]):
                            return _resp(200, {"code": 403, "message": "Cannot assign records to other teams."})

            if op_name == "invokeCustomApi":
                result = await invoke_custom_api(body.get("api_name"), body.get("payload"), raw_store, {**request.app.state.custom_api_ctx, "user": user})
                # A custom API's writes do not fire the workflow hooks, so what a Fulfillment one
                # wrote is carried on here (Readiness, Pick, QC) -- matches server/pg/api.mjs's own
                # catch-up after any Fulfillment custom API call.
                if body.get("api_name") in ("recalculate_fulfillment_queue", "package_pick_status", "check_payment_status", "create_package_ff"):
                    try:
                        await reconcile_fulfillment(raw_store)
                    except Exception as e:
                        print(f"[fulfillment] catch-up failed: {e}")
                response = {"code": 3000, "result": result}
            else:
                response = await _run_op(op_name, body, user, hooked_store)

            if op_name == "getRecordById" and me.get("team_name") and body.get("report_name") and response.get("data"):
                denied_rec = access.check_record_access(me, body["report_name"], response["data"])
                if denied_rec:
                    return _resp(404, {"code": 9280, "message": "No records found for the given criteria."})
            return _resp(200, response)
        except ZohoError as e:
            return _resp(200, {"code": e.code, "message": str(e)})
        except (KeyError, LookupError) as e:
            return _resp(200, {"code": 500, "message": str(e)})

    @app.get("/api/pages")
    async def pages(request: Request):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        return _resp(200, access.visible_sections(me))

    @app.get("/api/tables")
    async def tables(request: Request):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        return _resp(200, await request.app.state.store.table_counts())

    @app.get("/uploads/{path:path}")
    async def uploaded_file(request: Request, path: str):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        f = _inside(UPLOADS, path)
        return _serve_file(f) if f else _resp(404, "Not found", "text/plain")

    @app.get("/account")
    async def account_page(request: Request):
        me = await _current_user(request)
        if not me:
            return _redirect(f"/login?next={request.url.path}")
        return _serve_file(PUBLIC / "account.html")

    @app.get("/admin/users")
    async def admin_users_page(request: Request):
        me = await _current_user(request)
        if not me:
            return _redirect(f"/login?next={request.url.path}")
        return _redirect("/") if me["role"] != "admin" else _serve_file(PUBLIC / "users.html")

    @app.api_route("/api/me", methods=["GET"])
    async def me_route(request: Request):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        return await _account_api(request, "/api/me", me)

    @app.post("/api/account/password")
    async def account_password_route(request: Request):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        return await _account_api(request, "/api/account/password", me)

    @app.api_route("/api/admin/{rest:path}", methods=["GET", "POST", "DELETE"])
    async def admin_route(request: Request, rest: str):
        me = await _current_user(request)
        if not me:
            return _resp(401, {"code": 401, "message": "Sign in first."})
        if me["mustChangePassword"]:
            return _resp(403, {"code": 403, "message": "Set a new password first."})
        return await _account_api(request, f"/api/admin/{rest}", me)

    @app.get("/w/{path:path}")
    async def widget_file(request: Request, path: str):
        me = await _current_user(request)
        if not me:
            return _redirect("/")
        if me["mustChangePassword"]:
            return _redirect("/account?first=1")
        # /w/<Section>/<Tab>/<file>  ->  modules/<Section>/<Tab>/app/<file>
        rel = re.sub(r"^([^/]+/[^/]+)/", r"\1/app/", path, count=1)
        f = _inside(WIDGETS, rel)
        if not f:
            return _resp(404, "Not found", "text/plain")
        if not access.can_serve_file(me, str(f)):
            return _redirect("/")
        if not f.suffix.lower() == ".html":
            return _serve_file(f)

        def transform(html: str) -> str:
            who = f'<script>window.HC_USER={_json_for_script({"email": me["email"], "name": me["name"], "role": me["role"], "team_name": me.get("team_name")})}</script>'
            html = re.sub(r'<script[^>]*src="[^"]*widgetsdk[^"]*"[^>]*></script>', f'{who}<script src="/zoho-shim.js"></script>', html, count=1, flags=re.I)
            html = _plain_words(html)
            section_label = path.split("/")[0]
            section = next((s for s in SECTIONS if s["label"] == section_label), None)
            return _apply_theme(html, section["id"] if section else "analytic")

        return _serve_file(f, transform)

    @app.get("/")
    async def index(request: Request):
        me = await _current_user(request)
        if not me:
            return _redirect("/login")
        return _serve_file(PUBLIC / "index.html")

    @app.get("/{path:path}")
    async def static_public(request: Request, path: str):
        me = await _current_user(request)
        if not me:
            return _redirect(f"/login?next=/{path}")
        f = _inside(PUBLIC, path)
        return _serve_file(f) if f else _resp(404, "Not found", "text/plain")


app = create_app()
