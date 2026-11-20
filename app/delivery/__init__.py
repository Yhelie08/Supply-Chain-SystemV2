# Delivery Management. Each sub-module registers its own hooks/custom APIs on import; see
# app/procurement/apis.py for the established pattern this package will grow into across later
# phases.
# Phase 1 (Foundation): settings.py (Policy_Settings/Delivery_Roster hooks, 4 custom APIs).
# Phase 2 (Scheduling core): scheduling.py (schedule_slot, dms_reschedule -- no hooks of its own,
# but imported here anyway for the custom-API registration side effect), scheduling_engine.py,
# time_window.py, confirmation.py, delivery_scheduling_hooks.py (hook registration order below
# matches Node's own workflows.mjs import order for the forms this phase touches).
import app.delivery.settings  # noqa: F401 -- registers Policy_Settings/Delivery_Roster hooks and get_delivery_settings/preview_delivery_setting/get_delivery_roster/seed_delivery_roster
import app.delivery.scheduling  # noqa: F401 -- registers the dms_reschedule custom API
import app.delivery.scheduling_engine  # noqa: F401 -- registers Service_Appointment_Form's 4 scheduling-engine hooks
import app.delivery.time_window  # noqa: F401 -- registers Service_Appointment_Form's Time_Window strip/stamp hooks
import app.delivery.confirmation  # noqa: F401 -- registers Service_Appointment_Form's confirmation-stamp hook
import app.delivery.delivery_scheduling_hooks  # noqa: F401 -- registers Delivery_Scheduling's capacity warning hook
