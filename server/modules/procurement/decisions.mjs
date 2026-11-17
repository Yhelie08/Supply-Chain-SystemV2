// The Decisions list (spec 05 Shared Engines / 06 Approval Queue): the system prepares, a person decides with one click.
//   AQ-1  each item has a summary and one-click options (the Decisions tab shows them)
//   AQ-2  the decision is stamped: who, when, which option, decided_by_type (set here, never typed)
//   AQ-3  not decided within approval_sla_hours -> escalated (daily job)   AQ-4  a record that changed makes its item stale
// Applying an option does exactly what the option says and nothing more: "cancel and re-source" is recorded for the buyer; the
// system never cancels a PO line by itself (decision D15, LD-R2).
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { loadSettings } from './plan.mjs';
import { prepareItem, notify } from './decisions-core.mjs';
import { planPatch, rescoreShipments } from './ship-track.mjs';
import { logEvent } from './events.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
// What a widget may never write: everything but the decision itself.
const SERVER_ONLY = ['Kind', 'Record_Type', 'Record_Id', 'Record_No', 'Summary', 'Options', 'Payload', 'Prepared_By_Type', 'Status', 'Due_At', 'Escalated_At', 'Decided_By', 'Decided_By_Type', 'Decided_At', 'Result'];

register('Approval_Queue', {
  beforeAdd: () => { throw new ZohoError(2001, 'Decisions are prepared by the system, not typed.'); },
  beforeDelete: () => { throw new ZohoError(2001, 'A decision is kept for the record: it cannot be deleted.'); },
  beforeUpdate: ({ input, previous, user }) => {
    for (const f of SERVER_ONLY) delete input[f];
    if (blank(input.Decision)) { delete input.Decision; return; }
    if (previous.Status !== 'pending') throw new ZohoError(2001, previous.Status === 'stale' ? 'This item is stale (the record changed). It was removed from the list.' : 'This has already been decided.');
    const options = parse(previous.Options, []);
    if (!options.includes(input.Decision)) throw new ZohoError(2001, `"${input.Decision}" is not one of the options: ${options.join(', ')}.`);
    Object.assign(input, { Status: 'decided', Decided_By: user || '', Decided_By_Type: 'human', Decided_At: zohoNow() });
  },
  afterUpdate: async ({ id, record, previous, store }) => {
    if (previous?.Status !== 'pending' || record.Status !== 'decided') return;
    const result = await apply(store, record);
    if (result) await store.updateRecord('Approval_Queue', id, { Result: result }, { byForm: true });
  },
});

// Changes the shipment to air (the buyer's decision; the extra freight cost is theirs to weigh), and plans the dates again.
async function upgradeToAir(store, ship, settings, who) {
  const patch = { Shipment_Mode: 'Airfreight' };
  await store.updateRecord('Shipments', ship.ID, { ...patch, ...(await planPatch(store, { ...ship, ...patch }, settings)) }, { byForm: true });
  await logEvent(store, { recordType: 'shipment', recordId: ship.ID, recordNo: ship.Shipment_No, event: 'shipment.mode_upgraded', occurredAt: zohoNow(), source: 'user', actor: who, note: `${text(ship.Shipment_Mode) || 'LCL'} -> Airfreight` });
}

// A target change proposed for a PR (Create PO option B): accepting it changes the PR's target date and logs why.
async function applyPr(store, item) {
  const pr = await store.getRecordById('Purchase_Request1', item.Record_Id, { raw: true }).catch(() => null);
  if (!pr) return 'The PR no longer exists.';
  const payload = parse(item.Payload, {});
  if (item.Decision === 'accept_target' && payload.proposed_target) {
    await store.updateRecord('Purchase_Request1', pr.ID, { Target_Delivery: payload.proposed_target }, { byForm: true });
    await store.addRecord('Target_Date_Changes', { Record_Type: 'pr', Record_Id: String(pr.ID), Record_No: pr.PR_No, Old_Date: text(pr.Target_Delivery), New_Date: payload.proposed_target, Reason: 'Accepted a proposed change from Create PO', Changed_By: item.Decided_By, Customer_Told: false, Changed_At: zohoNow(), Via: 'approval_queue' });
    return `Target changed to ${payload.proposed_target}. Tell the customer.`;
  }
  return 'Target kept.';
}

async function apply(store, item) {
  if (item.Record_Type === 'pr') return applyPr(store, item);
  const settings = await loadSettings(store);
  const ship = await store.getRecordById('Shipments', item.Record_Id, { raw: true }).catch(() => null);
  if (!ship) return 'The shipment no longer exists.';
  const payload = parse(item.Payload, {});
  const who = item.Decided_By;
  let result = '';
  if (item.Kind === 'ladder_day3') {
    for (const l of await store.find('Ladder_Events', (e) => text(e.Record_Id) === text(item.Record_Id) && Number(e.Rung) === 3 && e.Kind === payload.kind)) {
      await store.updateRecord('Ladder_Events', l.ID, { Decision: item.Decision, Decided_By: who, Decided_At: zohoNow() }, { byForm: true });
    }
    if (item.Decision === 'upgrade_mode') { await upgradeToAir(store, ship, settings, who); result = 'Changed to air and the dates were planned again.'; }
    else if (item.Decision === 'cancel_resource') result = 'Recorded: cancel and re-source. Nothing was cancelled by the system: cancel the PO line and re-source it yourself.';
    else result = 'Recorded: hold.';
    await logEvent(store, { recordType: 'shipment', recordId: ship.ID, recordNo: ship.Shipment_No, event: 'shipment.ladder_decision', occurredAt: zohoNow(), source: 'user', actor: who, note: item.Decision });
  } else if (item.Kind === 'air_upgrade') {
    if (item.Decision === 'upgrade_air') { await upgradeToAir(store, ship, settings, who); result = 'Changed to air and the dates were planned again.'; }
    else if (item.Decision === 'move_target') {
      if (payload.proposed_target) {
        await prepareItem(store, settings, { kind: 'forecast_promise_change', ship, options: ['accept_target', 'keep_target'], payload: { proposed_target: payload.proposed_target, from: 'air_upgrade' },
          summary: `${ship.Shipment_No}: the forecast says the goods can be delivered by ${payload.proposed_target}, not ${text(ship.Target_Date) || 'the current target'}. Accept the new target (and tell the customer), or keep it.` });
        result = 'Kept the mode. A target change was sent for approval.';
      } else result = 'Kept the mode. There is no forecast date to propose yet.';
    } else {
      await notify(store, settings, { ship, type: 'Tell The Customer', message: `${ship.Shipment_No}: keep the mode and tell the customer it will be late (pickable about ${payload.air_pickable || 'later'} by air, later by sea).` });
      result = 'Kept the mode. The alert recipient was asked to tell the customer.';
    }
  } else if (item.Kind === 'forecast_promise_change') {
    if (item.Decision === 'accept_target' && payload.proposed_target) {
      await store.updateRecord('Shipments', ship.ID, { Target_Date: payload.proposed_target }, { byForm: true });
      await store.addRecord('Target_Date_Changes', { Record_Type: 'shipment', Record_Id: String(ship.ID), Record_No: ship.Shipment_No, Old_Date: text(ship.Target_Date), New_Date: payload.proposed_target, Reason: 'Accepted a proposed change from the forecast', Changed_By: who, Customer_Told: false, Changed_At: zohoNow(), Via: 'approval_queue' });
      result = `Target changed to ${payload.proposed_target}. Tell the customer.`;
    } else result = 'Target kept.';
  }
  await rescoreShipments(store);
  return result;
}
