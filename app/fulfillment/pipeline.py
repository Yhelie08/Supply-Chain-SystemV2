# Fulfillment pipeline, first part: Sales Order -> Order Readiness -> Pick -> Pack & QC. The rest
# of this file (advance_stage, so_to_readiness, release_to_pick, picked_to_qc,
# all_picked_for_package, reconcile_fulfillment) is added in Task 11 -- STAGE_ORDER is created here
# because app/fulfillment/sorter.py (Task 9) needs it and Node's own sorter.mjs imports it from
# pipeline.mjs the same way.

# The pipeline, in order (Crate is skipped by packages that are not for crating, so it is only a
# position here).
STAGE_ORDER = ["Waiting For Package", "Need Approval", "Order Readiness", "Picking", "Pack & QC", "Crate", "Order Aggregation", "For Delivery"]
