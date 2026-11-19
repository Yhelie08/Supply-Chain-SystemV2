// What the Ship & Track engine and the Decisions screen share (spec 05 Shared Engines / 06 Approval Queue, 05 Alerts): the alert
// recipient, the in-app notification, and the preparing of Approval_Queue items. No hooks here, so ship-track.mjs can import it
// without a cycle (the hooks that APPLY a decision are in decisions.mjs).
import { zohoNow } from '../../criteria.mjs';
import { blank, addDays, ymd, dayDiff } from '../../workflows/deluge.mjs';
import { forecastChain, dateNeeded, leadDays } from './plan.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// Until roles exist (spec section 6) every alert goes to one address: the setting, else the env var, else the one the old shipment
// schedules used.
export const alertRecipient = (settings) => text(settings?.procurement_alert_email) || process.env.PROCUREMENT_ALERT_EMAIL || 'homecartelpacker@gmail.com';

// Same fallback pattern, scoped to "tell the customer" alerts: a separate address can be set until roles exist
// (spec: this should reach the sales agent, not whoever reads the general procurement alert).
export const salesAgentRecipient = (settings) => text(settings?.sales_agent_alert_email) || process.env.SALES_AGENT_ALERT_EMAIL || alertRecipient(settings);

export function notify(store, settings, { ship, type, message, page = 'Decisions', to }) {
  return store.addRecord('App_Notifications', {
    Recipient_Email: to || alertRecipient(settings), Notification_Type: type, Message: message, Created_On: zohoNow(), Read: false,
    Target_URL: `${process.env.APP_BASE_URL || ''}/#Page:${page}`, Source_Record_No: ship?.Shipment_No ?? '', Source_Record_ID: ship?.ID ?? '',
  });
}

const dueAt = (settings, now = new Date()) => zohoNow(new Date(now.getTime() + settings.approval_sla_hours * 3600000));

// Prepares one item for a person to decide (AQ-1). `payload` carries the facts the options use.
export async function prepareItem(store, settings, { kind, ship, summary, options, payload = {}, recordType = 'shipment', recordId, recordNo }) {
  return store.addRecord('Approval_Queue', {
    Kind: kind, Record_Type: recordType, Record_Id: String(recordId ?? ship.ID), Record_No: recordNo ?? ship.Shipment_No, Summary: summary, Options: JSON.stringify(options),
    Payload: JSON.stringify(payload), Prepared_By_Type: 'system', Status: 'pending', Due_At: dueAt(settings),
  });
}

// air_upgrade (spec 05/06): an Act now shipment still in production and not yet by air. Once per shipment: a decision, or a
// "keep the mode", is not asked again. rows = what the sorting engine just scored.
export async function syncAirUpgradeItems(store, settings, rows, today) {
  const items = await store.find('Approval_Queue', (i) => i.Kind === 'air_upgrade');
  let made = 0;
  for (const { s, scored, stage, mode, poDate, target } of rows) {
    if (scored.category !== 'act_now' || stage !== 'production' || mode === 'Airfreight') continue;
    if (items.some((i) => text(i.Record_Id) === String(s.ID))) continue;
    const air = forecastChain(settings, { poDate, productionDays: s.Required_Days_Lead, mode: 'Airfreight', today, actual: { production_started: s.Production_Started_At, production_finished: s.Production_Finished_At } });
    const needed = dateNeeded(settings, target);
    const saving = leadDays(settings, mode) - leadDays(settings, 'Airfreight');
    const airSlack = air && needed ? dayDiff(needed, air.pickable) : null;
    const current = forecastChain(settings, { poDate, productionDays: s.Required_Days_Lead, mode, today, actual: { production_started: s.Production_Started_At, production_finished: s.Production_Finished_At } });
    const proposed = current ? addDays(current.pickable, settings.fulfillment_days + settings.delivery_days) : null;
    await prepareItem(store, settings, {
      kind: 'air_upgrade', ship: s, options: ['upgrade_air', 'move_target', 'tell_customer'],
      summary: `${s.Shipment_No} (${text(s.Supplier)}) will miss the date needed (${scored.date_needed}). By air it would save ${saving} days: pickable ${air ? ymd(air.pickable) : '?'}`
        + (airSlack == null ? '.' : airSlack >= 0 ? ', which is on time.' : `, still ${-airSlack} days late.`) + ' The extra freight cost is the buyer\'s to weigh.',
      payload: { proposed_target: proposed ? ymd(proposed) : null, air_pickable: air ? ymd(air.pickable) : null, saving_days: saving, mode },
    });
    made++;
  }
  return made;
}

// AQ-4: an item whose record changed is stale and is removed from the list by itself. ships = Map(id -> shipment row).
export async function markStaleItems(store, ships, stageOf) {
  let n = 0;
  for (const it of await store.find('Approval_Queue', (i) => i.Status === 'pending' && (blank(i.Record_Type) || i.Record_Type === 'shipment'))) {
    const s = ships.get(text(it.Record_Id));
    let why = '';
    if (!s) why = 'the shipment no longer exists';
    else {
      const stage = stageOf(s);
      if (it.Kind === 'ladder_day3') {
        const payload = (() => { try { return JSON.parse(it.Payload || '{}'); } catch { return {}; } })();
        if (stage !== 'production') why = 'the shipment has shipped out';
        else if (payload.kind === 'production_start' && !blank(s.Production_Started_At)) why = 'production has started';
        else if (payload.kind === 'production_finish' && !blank(s.Production_Finished_At)) why = 'production has finished';
      } else if (it.Kind === 'air_upgrade') {
        if (stage !== 'production') why = 'the shipment has shipped out';
        else if (text(s.Shipment_Mode) === 'Airfreight') why = 'the shipment is already by air';
        else if (s.Category && s.Category !== 'act_now') why = 'it is no longer Act now';
      } else if (it.Kind === 'forecast_promise_change') {
        const p = (() => { try { return JSON.parse(it.Payload || '{}'); } catch { return {}; } })();
        if (stage === 'received') why = 'the shipment is received';
        else if (p.proposed_target && text(s.Target_Date) >= p.proposed_target) why = 'the target date already covers it';
      }
    }
    if (why) {
      await store.updateRecord('Approval_Queue', it.ID, { Status: 'stale', Result: `Removed by the system: ${why}.` }, { byForm: true });
      n++;
    }
  }
  return n;
}

// AQ-3: not decided within approval_sla_hours -> escalate to the supervisor, once.
export async function escalateOverdue(store, settings, now = new Date()) {
  let n = 0;
  for (const it of await store.find('Approval_Queue', (i) => i.Status === 'pending' && blank(i.Escalated_At))) {
    const due = parseZoho(it.Due_At);
    if (!due || due > now) continue;
    await store.updateRecord('Approval_Queue', it.ID, { Escalated_At: zohoNow(now) }, { byForm: true });
    await notify(store, settings, { ship: { Shipment_No: it.Record_No, ID: it.Record_Id }, type: 'Decision Escalated', message: `Not decided in ${settings.approval_sla_hours} hours, escalated to the supervisor: ${text(it.Summary)}` });
    n++;
  }
  return n;
}

// "2026-11-17 10:55:59 AM" or "2026-11-17" -> Date
export function parseZoho(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(text(v));
  if (!m) return null;
  let h = m[4] == null ? 0 : Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
}
