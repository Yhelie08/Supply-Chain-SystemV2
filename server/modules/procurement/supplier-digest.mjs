// Daily supplier digest (spec 05 Shared Engines / 03 Notifications): "One digest per supplier per day listing
// every overdue line and what is asked... plus portal notifications. Never one email per event."
//
// This writes the IN-APP half only: one collapsed Tony_Notifications / Fenteng_Notifications row per supplier
// per day (the same form the portal bell already reads, see modules/Tony Fan/*/app/notification_component).
// Actually emailing Recipient_Email needs a provider (Resend or Postmark); this system has not configured one
// yet (00 Overview/03 Defaults and Open Items.pdf still lists it as an open setting) and no SMTP/Resend/Postmark
// code exists anywhere in server/. Recipient_Email is stamped here anyway so a mailer can pick these rows up
// later without a schema or workflow change -- see Change Log 2026-11-21.
//
// "Needs action" per record type is copied verbatim from the Today screen widgets (modules/Tony Fan/Today,
// Fenteng Lighting/Today), which were themselves confirmed field-by-field against each item's own supplier
// widget -- not reinvented here.
import { SUPPLIERS } from '../../workflows/suppliers.mjs';
import { blank, ymd, todayDate } from '../../workflows/deluge.mjs';
import { zohoNow } from '../../criteria.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const MONTHS_NUM = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

// Dates on these forms come back as either ISO or Zoho's own "DD-MMM-YYYY" text -- same toISODate() pattern
// already established in modules/Procurement/Exceptions/app/index.html and the Today widgets.
function day(v) {
  const s = text(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return '';
  const mo = MONTHS_NUM[m[2].charAt(0).toUpperCase() + m[2].slice(1, 3).toLowerCase()];
  return mo ? `${m[3]}-${String(mo).padStart(2, '0')}-${m[1]}` : '';
}
const extractSubformRows = (raw) => (Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray(raw.data) ? raw.data : []));

const overdueInquiries = (rows) => rows.filter((r) => { const s = text(r.Response_Status) || 'Waiting'; return s === 'Waiting' || s === 'Submit Response'; });
const overduePr = (rows) => rows.filter((r) => { const s = text(r.Response_Status) || 'Waiting'; return s === 'Waiting' || s === 'Submit Response'; });
const overduePo = (rows, n) => rows.filter((r) => {
  const sentOn = r[`Sent_On_Supplier${n}`];
  const raw = text(r[`PO_Status_Supplier${n}`]);
  const status = raw === 'Confirmed' ? 'Confirmed' : (sentOn ? 'Sent' : 'Draft');
  return status === 'Sent';
});
const overdueRr = (rows) => rows.filter((r) => (text(r.RR_Status) || 'Open') === 'Open');
const overdueShipments = (rows, n) => rows.filter((r) => {
  const items = extractSubformRows(r[`Supplier${n}_Shipment_Details`]);
  const shipped = items.filter((it) => it.Synced === true || it.Synced === 'true').length;
  return items.length - shipped > 0;
});

// Every overdue line + what is asked, for one supplier, as of today. Returns null when there is nothing to
// tell them (spec: "a state that carries no action gets no notification" -- the digest is no exception).
export async function buildDigest(store, s) {
  const [inq, pr, po, rr, ship] = await Promise.all([
    store.find(s.form), store.find(s.prForm), store.find(s.poForm), store.find(s.rrForm), store.find(s.shipmentForm),
  ]);
  const counts = {
    inquiry: overdueInquiries(inq).length,
    pr: overduePr(pr).length,
    po: overduePo(po, s.n).length,
    rr: overdueRr(rr).length,
    shipment: overdueShipments(ship, s.n).length,
  };
  const total = counts.inquiry + counts.pr + counts.po + counts.rr + counts.shipment;
  if (!total) return null;
  const parts = [];
  if (counts.inquiry) parts.push(`${counts.inquiry} inquiry/inquiries need a quote`);
  if (counts.pr) parts.push(`${counts.pr} purchase request(s) need a quote`);
  if (counts.po) parts.push(`${counts.po} purchase order(s) need acknowledgement`);
  if (counts.rr) parts.push(`${counts.rr} replacement request(s) await your approval`);
  if (counts.shipment) parts.push(`${counts.shipment} shipment(s) have lines not yet reported`);
  return { total, message: `You have ${total} item(s) waiting: ${parts.join(', ')}.` };
}

// Daily (spec 05/03 "Morning list per role at 07:00 [DEFAULT]"): one digest row per supplier, collapsing every
// overdue line into ONE notification -- never one row per event (spec: "a supplier with 5 overdue lines gets
// one digest email, not five"). Skips a supplier a second time the same local day even if the job is re-run.
export async function runSupplierDigestDaily(store, { now = new Date(), log = () => {} } = {}) {
  const today = ymd(todayDate(now));
  let sent = 0;
  for (const s of SUPPLIERS) {
    const already = await store.find(s.notifications, (r) => text(r.Notification_Type) === 'Daily Digest' && day(r.Created_On) === today);
    if (already.length) continue;
    const digest = await buildDigest(store, s);
    if (!digest) continue;
    await store.addRecord(s.notifications, {
      Recipient_Email: process.env[s.emailEnv] || '',
      Notification_Type: 'Daily Digest',
      Message: digest.message,
      Created_On: zohoNow(now),
      Read: false,
      Target_URL: `${process.env.APP_BASE_URL || ''}/#Page:${s.page}`,
      Source_Record_No: '', Source_Record_ID: '', Deep_Link_Token: '',
    });
    sent++;
    log(`${s.name}: ${digest.message}`);
  }
  return { sent };
}
