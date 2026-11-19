# Who may open or change what, beyond "signed in". Ported from server/access.mjs.
# Phase 1: tabs flagged "adminOnly" in the sections/pages config, and the forms behind them, are
# for admins only. Phase 2: row-level team scoping for field installer teams, configured per
# department (e.g. Delivery Management's own teamScoping data) rather than hard-coded here.
import posixpath

# Policy Settings: the form its widget writes to and the report it reads. Compared in lower case.
ADMIN_ONLY_FORMS = ["Policy_Settings", "All_Policy_Settings", "Procurement_Settings", "Procurement_Settings_History"]
# SDK operation -> the body field that names the form or report it touches.
WRITE_OPS = {"addRecords": "form_name", "updateRecordById": "report_name", "updateRecords": "report_name", "deleteRecordById": "report_name"}

DENIED = {"code": 403, "message": "Only admins can open or change Policy Settings."}

_DEFAULT_SCOPING = {
    "allowedWidgets": [
        "Delivery Management/Ongoing Service",
        "Delivery Management/Field Service Site Visits",
        "Delivery Management/Truck Maintenance",
    ],
    "allowedTabs": ["Ongoing_Service1", "Field_Service_Site_Visits1", "Truck_Maintenance"],
    "rules": None,  # None here means "use the hard-coded Service_Appointment/Field_Work defaults below"
}


def create_access(sections: list, widgets_root: str, scoping: dict | None = None):
    scoping = scoping if scoping is not None else _DEFAULT_SCOPING
    admin_forms = {n.lower() for n in ADMIN_ONLY_FORMS}

    def lower(p: str) -> str:
        # Windows file systems ignore case, so a URL in another case reaches the same folder.
        return p.lower()

    def resolve(widget: str) -> str:
        return lower(posixpath.normpath(posixpath.join(widgets_root, widget)))

    admin_dirs = [resolve(t["widget"]) for s in sections for t in s["tabs"] if t.get("adminOnly")]

    allowed_widgets = scoping.get("allowedWidgets") or _DEFAULT_SCOPING["allowedWidgets"]
    allowed_dirs = [resolve(w) for w in allowed_widgets]
    allowed_tab_set = set(scoping.get("allowedTabs") or _DEFAULT_SCOPING["allowedTabs"])

    rule_map: dict[str, str] = {}
    rules = scoping.get("rules")
    if rules:
        for r in rules:
            if r.get("form"):
                rule_map[r["form"].lower()] = r["field"]
            if r.get("report"):
                rule_map[r["report"].lower()] = r["field"]
    else:
        rule_map["service_appointment"] = "Installer"
        rule_map["service_appointment_form"] = "Installer"
        rule_map["field_work"] = "Assigned_to_Installer"
        rule_map["field_work_report"] = "Assigned_to_Installer"

    def is_admin(me: dict | None) -> bool:
        return bool(me and me.get("role") == "admin")

    def is_field_user(me: dict | None) -> bool:
        return not is_admin(me) and bool(me and me.get("team_name"))

    def touches_admin_form(name) -> bool:
        return str(name or "").lower() in admin_forms

    def visible_sections(me: dict | None) -> list:
        if is_admin(me):
            return sections
        if is_field_user(me):
            return [
                {**s, "tabs": [t for t in s["tabs"] if t["page"] in allowed_tab_set]}
                for s in sections if s["id"] == "delivery" or s["label"] == "Delivery Management"
            ]
        return [{**s, "tabs": [t for t in s["tabs"] if not t.get("adminOnly")]} for s in sections]

    def can_serve_file(me: dict | None, file: str) -> bool:
        if is_admin(me):
            return True
        f = lower(file)
        if is_field_user(me):
            return any(f.startswith(d + "/") or f == d for d in allowed_dirs)
        return not any(f.startswith(d + "/") for d in admin_dirs)

    def scope_criteria(me: dict | None, report_name: str | None, user_criteria: str | None) -> str:
        if is_admin(me) or not is_field_user(me) or not report_name:
            return user_criteria or ""
        field = rule_map.get(str(report_name or "").lower())
        if not field:
            return user_criteria or ""
        team = str(me["team_name"]).replace('"', '\\"')
        team_criteria = f'({field} == "{team}")'
        if not user_criteria or not str(user_criteria).strip():
            return team_criteria
        trimmed = str(user_criteria).strip()
        inner = trimmed if trimmed.startswith("(") and trimmed.endswith(")") else f"({trimmed})"
        return f"({team_criteria} && {inner})"

    def check_record_access(me: dict | None, form_or_report: str | None, record: dict | None):
        if is_admin(me) or not is_field_user(me) or not record:
            return None
        field = rule_map.get(str(form_or_report or "").lower())
        if not field:
            return None
        if record.get(field) != me["team_name"]:
            return {"code": 403, "message": "Access denied: record is not assigned to your team."}
        return None

    def check_call(me: dict | None, op: str, body: dict | None = None):
        if is_admin(me):
            return None
        body = body or {}
        field = WRITE_OPS.get(op)
        return DENIED if field and touches_admin_form(body.get(field)) else None

    def check_upload(me: dict | None, report):
        return DENIED if not is_admin(me) and touches_admin_form(report) else None

    class Access:
        pass

    a = Access()
    a.visible_sections = visible_sections
    a.can_serve_file = can_serve_file
    a.scope_criteria = scope_criteria
    a.check_record_access = check_record_access
    a.check_call = check_call
    a.check_upload = check_upload
    return a
