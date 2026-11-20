# Procurement module manifest. Ported from server/modules/procurement/{index,workflows}.mjs.
# Importing this package registers every hook below, via each submodule's own register(...)
# calls at import time.
#
# ship_track is imported BEFORE shipments, even though workflows.mjs's own import LIST reads
# shipments.mjs (line 8) before ship-track.mjs (line 10): confirmed by direct instrumentation of the
# real Node source (both hooks' real registration order, read off the live hooks array at
# runtime, not off the import statements) that ship-track.mjs's beforeSave hook actually RUNS
# first on a real Shipments add -- some transitive import (receiving.mjs / receiving-spec.mjs,
# both imported later in workflows.mjs, both importing ship-track.mjs) causes ship-track.mjs's
# module body, and therefore its register() call, to evaluate before workflows.mjs reaches its own
# `import './shipments.mjs'` line. This changes real behavior: ship-track's planPatch sees the
# widget's original Sales_Order before shipments.mjs's PO-autofill can blank it when the PO has no
# SO_No, so Order_Date still resolves correctly. Matching the textual order instead would silently
# break Order_Date on exactly this case. Confirmed by running the real
# tests/procurement-ship-track.test.js against both orders.
import app.procurement.inquiry  # noqa: F401
import app.procurement.inq_spec  # noqa: F401
import app.procurement.purchase_request  # noqa: F401
import app.procurement.pr_spec  # noqa: F401
import app.procurement.purchase_order  # noqa: F401
import app.procurement.ship_track  # noqa: F401
import app.procurement.shipments  # noqa: F401
import app.procurement.po_spec  # noqa: F401
import app.procurement.decisions  # noqa: F401
import app.procurement.settings_hooks  # noqa: F401
import app.procurement.receiving  # noqa: F401
import app.procurement.receiving_spec  # noqa: F401
import app.procurement.supplier_portal_workflows  # noqa: F401
import app.procurement.production_portal  # noqa: F401
import app.procurement.replacement_exceptions  # noqa: F401
import app.procurement.rr_spec  # noqa: F401
import app.procurement.projects  # noqa: F401
import app.forecast.pr_hooks  # noqa: F401 -- Node: workflows.mjs's own last import, ../../forecast/pr-hooks.mjs

import app.procurement.apis  # noqa: F401 -- registers CUSTOM_APIS, not a hook file, but must load for invoke_custom_api to find these names

FORMS = [
    "Inquiry_Form", "Purchase_Request1", "Purchase_Order", "Shipments", "Receiving",
    "Replacement_Request", "Exceptions", "Supplier_1", "Supplier_2", "Projects",
    "Ladder_Events", "Approval_Queue", "Procurement_Settings", "Procurement_Settings_History",
    "Target_Date_Changes",
]
