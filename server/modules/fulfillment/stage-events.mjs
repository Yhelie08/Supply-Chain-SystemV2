// Fulfillment stage event log (spec: HomeCartel v1.4, 01 Database §8 stage_events; D13 one stamp per stage
// entry). Write-only this slice — logs a Stage_Events row whenever Sales_Order_Fulfillment.Fulfillment_Stage
// actually changes. One generic hook catches every current and future write site (pipeline.mjs's advanceStage
// and reconcileFulfillment, workflows.mjs's stageOnSave and stageOnGateSave — five as of this writing) rather
// than a logging call added at each one individually.
import { blank } from '../../workflows/deluge.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// 'Pack & QC' -> 'pack_qc'. Derived from the stage string itself, not a hand-listed table, so it can never
// drift from pipeline.mjs's STAGE_ORDER.
export function stageSlug(stage) {
  return text(stage).toLowerCase().replace(/&/g, ' ').trim().replace(/\s+/g, '_');
}
