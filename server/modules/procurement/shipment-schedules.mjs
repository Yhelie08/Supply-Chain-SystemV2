// Daily shipment schedules, ported from zoho-export/parsed/workflows/schedule/_ (both daily at 08:00 Asia/Manila in Zoho).
// Run by server/schedules.mjs with the plain store (their writes do not fire the form workflows, like a Deluge schedule).
//
//   Daily_Shipment_10_Day_Che   every shipment not yet notified (Notified_10d false) with Remaining_Days <= 10 gets an
//                               App_Notifications record, and Notified_10d = true so it is told once.
//   Shipment_Delay_Status_Dai   every shipment that is not Delivered and has an Estimated_Warehouse_Arrival: past it -> "Delayed",
//                               within 7 days -> "Arriving in 1 Week". Today can be overridden by Schedule_Test_Settings.Test_Current_Date.
//
// Mirrors Zoho: Remaining_Days is the number stored on the shipment when it was made (copied from the PO line), not recounted
// here. A shipment with a blank Remaining_Days is skipped (Deluge: null <= 10 is not true).
// The status is never moved back (a Delayed shipment whose date is moved later stays Delayed), and "Arriving in 1 Week" is
// written with Zoho's spelling (the picklist option is "Arriving In 1 Week"; the widgets look for the script's spelling).
// Differences on purpose: Target_URL points at this app (APP_BASE_URL) instead of the Zoho Development URL; Added_User is blank.
import { zohoNow } from '../../criteria.mjs';
import { blank, truthy, toNum, parseDate, dayDiff, todayDate } from '../../workflows/deluge.mjs';

const text = (v) => (blank(v) ? '' : String(v));

export async function runShipment10DayCheck(store, { log = () => {} } = {}) {
  let notified = 0;
  // no criteria: a blank checkbox (an imported row) must count as false, which a SQL "== false" would miss
  for (const s of await store.find('Shipments', (r) => !truthy(r.Notified_10d))) {
    if (blank(s.Remaining_Days) || toNum(s.Remaining_Days) > 10) continue;
    await store.addRecord('App_Notifications', {
      Recipient_Email: 'homecartelpacker@gmail.com', Notification_Type: 'Shipment',
      Message: `Shipment ${text(s.Shipment_No)} has ${toNum(s.Remaining_Days)} day(s) left on its timeline.`, Created_On: zohoNow(), Read: false,
      Target_URL: `${process.env.APP_BASE_URL || ''}/#Page:Shipments1`, Source_Record_No: s.Shipment_No, Source_Record_ID: s.ID,
    });
    await store.updateRecord('Shipments', s.ID, { Notified_10d: true }, { byForm: true });
    notified++;
  }
  log(`${notified} shipment(s) notified`);
  return { notified };
}

export async function runShipmentDelayStatus(store, { log = () => {}, today = null } = {}) {
  let day = today ?? todayDate();
  for (const s of await store.find('Schedule_Test_Settings')) {
    const d = parseDate(s.Test_Current_Date);
    if (d) day = d;
  }
  const counts = { delayed: 0, arriving: 0, skippedDelivered: 0, checked: 0, changed: 0 };
  for (const sh of await store.find('Shipments')) {
    if (text(sh.Shipment_Status) === 'Delivered') { counts.skippedDelivered++; continue; }
    const eta = parseDate(sh.Estimated_Warehouse_Arrival);
    if (!eta) continue;
    counts.checked++;
    const diff = dayDiff(eta, day);
    let want = null;
    if (diff < 0) { want = 'Delayed'; counts.delayed++; } else if (diff <= 7) { want = 'Arriving in 1 Week'; counts.arriving++; }
    if (want && text(sh.Shipment_Status) !== want) {
      await store.updateRecord('Shipments', sh.ID, { Shipment_Status: want }, { byForm: true });
      counts.changed++;
    }
  }
  log(JSON.stringify(counts));
  return counts;
}
