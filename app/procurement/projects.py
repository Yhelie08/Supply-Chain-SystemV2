# Projects workflows, ported from zoho-export/parsed/workflows/form/Projects:
#   Proj_Code_AutoNumber (on add, on validate)  Project_Code = PRJ-nnnnn, one more than the highest
#   existing code.
# Like Zoho it always sets the code on add (a code sent by the widget is replaced). The number comes
# from the locked, concurrency-safe series (app/store.py's next_number), so two projects saved at
# the same moment do not get the same code. Ported from server/modules/procurement/projects.mjs.
from app.workflows import register


async def _before_add(args: dict) -> None:
    input_, store = args["input"], args["store"]
    input_["Project_Code"] = await store.next_number("Projects", "Project_Code", "PRJ-")


register("Projects", {"beforeAdd": _before_add})
