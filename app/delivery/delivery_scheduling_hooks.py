# Delivery_Scheduling workflows, ported from zoho-export/parsed/workflows/form/Delivery_Scheduling/
# *.dg (via Node's delivery-scheduling.mjs). Only the events that run on API writes are here.
#
# Ported here: DS_Validate_Team_Capacity1.
# Ported elsewhere: ISCHED_Instant_Forecast (forecast-stamp.py, a later phase).
#
# DS_Validate_Team_Capacity: for each installer picked for a date, look for a Daily_Team_Availability
# record that is not "Not Available". Zoho only shows an alert ("Paalala: ...") and never cancels
# the save, which means a write through the API is never refused or changed by this script. It is
# ported as a warning in the server log.
import logging

from app.deluge import blank
from app.workflows import register

logger = logging.getLogger(__name__)


async def teams_without_availability(rec: dict, store) -> list[str]:
    if blank(rec.get("Date_field")) or blank(rec.get("Installer")):
        return []
    missing = []
    installers = rec["Installer"] if isinstance(rec["Installer"], list) else [rec["Installer"]]
    for installer in installers:
        free = await store.find("Daily_Team_Availability", lambda r: r.get("Availability_Date") == rec["Date_field"] and r.get("Installer") == installer and r.get("Availability_Status") != "Not Available")
        if not free:
            missing.append(installer)
    return missing


async def _warn_about_capacity(args: dict) -> None:
    input_, previous, store = args["input"], args.get("previous"), args["store"]
    merged = {**(previous or {}), **input_}
    missing = await teams_without_availability(merged, store)
    if missing:
        date_field = input_.get("Date_field", (previous or {}).get("Date_field"))
        logger.warning(f"[Delivery_Scheduling] no Daily Team Availability record for {', '.join(missing)} on {date_field}; the save goes ahead, as in Zoho.")


register("Delivery_Scheduling", {"beforeAdd": _warn_about_capacity, "beforeUpdate": _warn_about_capacity})
