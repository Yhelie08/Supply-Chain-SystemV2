# Where the Python app finds the data and static files it reads (plan Phase 4.3). Today they live in the old Node-side folders; each one can be
# moved with an environment variable, and a missing one stops the app at start with a message that says which variable to set, instead of
# serving a half-empty model (a missing spec-forms folder would silently drop columns).
#
#   HC_PARSED_DIR      zoho-export/parsed   the parsed Zoho forms and reports.json
#   HC_SPEC_FORMS_DIR  server/spec-forms    the v1.4 additions to the forms
#   HC_MODULES_DIR     modules              the widget folders (app/ + plugin-manifest.json)
#   HC_PUBLIC_DIR      server/public        login, account and index pages and the theme
#   HC_PAGES_JSON      server/pages.json    the menu (sections and tabs)
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def resolve(env_name: str, default: Path, *, is_file: bool = False, env=None) -> Path:
    """The path from the environment variable (or the default), checked to exist. Raises RuntimeError saying what to fix."""
    env = os.environ if env is None else env
    given = (env.get(env_name) or "").strip()
    path = Path(given).expanduser() if given else default
    ok = path.is_file() if is_file else path.is_dir()
    if not ok:
        what = "file" if is_file else "folder"
        where = f"{env_name}={given}" if given else f"the default {default}"
        raise RuntimeError(f"The {what} {path} does not exist ({where}). Set {env_name} to the right location.")
    return path


PARSED = resolve("HC_PARSED_DIR", ROOT / "zoho-export" / "parsed")
SPEC_FORMS = resolve("HC_SPEC_FORMS_DIR", ROOT / "server" / "spec-forms")
MODULES = resolve("HC_MODULES_DIR", ROOT / "modules")
PUBLIC = resolve("HC_PUBLIC_DIR", ROOT / "server" / "public")
PAGES_JSON = resolve("HC_PAGES_JSON", ROOT / "server" / "pages.json", is_file=True)
