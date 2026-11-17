// Purchase Request of the spec v1.4 (server/modules/procurement/pr-spec.mjs), on PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { addDays, ymd, todayDate } from '../server/workflows/deluge.mjs';

const FORMS = ['Purchase_Request1', 'Suppliers', 'Sales_Order', 'Sales_Order_Fulfillment', 'Stage_Events', 'App_Notifications', 'Procurement_Settings', 'Procurement_Settings_History', 'Forecast_Settings', 'Tony_Fan_Purchase_Request', 'Fenteng_Lighting_Purchase_Request', 'Approval_Queue'];
let db, raw, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
// the spec's worked numbers (LCL 30, fulfillment 3, delivery 2) as saved settings, so the arithmetic below is the spec's
const SPEC = { transit_lcl_min_days: 30, transit_lcl_max_days: 30, transit_air_min_days: 14, transit_air_max_days: 14, customs_lcl_min_days: 0, customs_lcl_max_days: 0, customs_air_min_days: 0, customs_air_max_days: 0, fulfillment_days: 3, delivery_days: 2 };
beforeEach(async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
  await db.query('DELETE FROM _number_series');
  for (const [k, v] of Object.entries(SPEC)) await raw.addRecord('Procurement_Settings', { Setting_Key: k, Value: String(v) });
});

const today = todayDate();
const day = (n) => ymd(addDays(today, n));
const rejects = (fn, re) => assert.rejects(fn, (e) => re.test(e.message));
async function supplier(name, extra = {}) { return raw.addRecord('Suppliers', { Supplier_Name: { first_name: name, last_name: '' }, Handles_All: true, Max_Capacity: 50, ...extra }); }
const quote = (id, name, price, lead) => ({ Supplier_ID: id, Suppliers: name, Availability: 'Confirmed', Initial_Price: price, Lead_Time: lead });
async function pr({ so = 'SO-1', soDays = -30, target = 70, quotes = [], extra = {} } = {}) {
  if (so) await raw.addRecord('Sales_Order_Fulfillment', { SO_No: so, SO_Created_Date: day(soDays) });
  return store.addRecord('Purchase_Request1', { Sales_Order: so, Target_Delivery: target == null ? '' : day(target), Shipment_Mode: 'LCL', category: 'Chandeliers', Supplier_Selected: quotes, ...extra });
}
const get = (id) => raw.getRecordById('Purchase_Request1', id, { raw: true });
const events = async (id) => (await raw.find('Stage_Events', (e) => e.Record_Type === 'pr' && String(e.Record_Id) === String(id))).sort((a, b) => Number(a.ID) - Number(b.ID)).map((e) => e.Event);

test('the recommendation weighs price AND lead time against the target, and says why in words (PR-R4)', async () => {
  const a = await supplier('Cheapo'), b = await supplier('Steady');
  const id = await pr({ target: 70, quotes: [quote(a, 'Cheapo', 50, 60), quote(b, 'Steady', 80, 20)] });
  const p = await get(id);
  assert.equal(p.Recommended_Supplier_Id, b, 'the cheaper supplier would be late, so the one that arrives in time wins');
  assert.match(p.Recommendation_Reason, /Steady: CNY 80, lead 20 days, arrives in time/);
  assert.match(p.Recommendation_Reason, /Cheapo is cheaper \(CNY 50\) but would be \d+ days late/);
  const rows = p.Supplier_Load_Balancing;
  assert.equal(rows.find((r) => String(r.Suppliers) === String(b) || r.Suppliers?.ID === b || r.Suppliers?.display_value === 'Steady').Eligible_Supplier, 'Recommended');
});

test('when both can make it, the cheaper wins; when none can, the closest does and the reason says so', async () => {
  const a = await supplier('Cheapo'), b = await supplier('Steady');
  const ok = await pr({ target: 120, quotes: [quote(a, 'Cheapo', 50, 25), quote(b, 'Steady', 80, 20)] });
  assert.equal((await get(ok)).Recommended_Supplier_Id, a);
  const none = await pr({ so: 'SO-2', target: 20, quotes: [quote(a, 'Cheapo', 50, 60), quote(b, 'Steady', 80, 20)] });
  const p = await get(none);
  assert.equal(p.Recommended_Supplier_Id, b);
  assert.match(p.Recommendation_Reason, /No supplier can make the date\. Steady is the closest/);
});

test('every PR carries its feasibility: feasible, at risk, or impossible with the shortfall, the earliest date and the air option (PR-R6)', async () => {
  const a = await supplier('Steady');
  const q = [quote(a, 'Steady', 80, 20)];
  const feasible = await get(await pr({ so: 'SO-A', target: 90, quotes: q }));
  assert.equal(feasible.Feasibility, 'feasible');
  const risk = await get(await pr({ so: 'SO-B', target: 63, quotes: q }));
  assert.equal(risk.Feasibility, 'at_risk');
  const late = await get(await pr({ so: 'SO-C', target: 20, quotes: q }));
  assert.equal(late.Feasibility, 'impossible');
  assert.equal(Number(late.Shortfall_Days), 41); // 61 days needed, the spec's worked example
  assert.equal(late.Earliest_Feasible_Date, day(61));
  assert.match(late.Air_Option, /Even by air/);
});

test('the server fields cannot be typed by a widget', async () => {
  const a = await supplier('Steady');
  const id = await pr({ quotes: [quote(a, 'Steady', 80, 20)] });
  const before = await get(id);
  await store.updateRecord('Purchase_Request1', id, { Feasibility: 'feasible', Pr_Category: 'on_track', Queue_Rank: 1, Order_Date: '2001-01-01', Pr_State: 'converted', Description1: 'ok' });
  const p = await get(id);
  assert.equal(p.Description1, 'ok');
  assert.equal(p.Order_Date, before.Order_Date);
  assert.equal(p.Pr_State, before.Pr_State);
  assert.equal(p.Feasibility, before.Feasibility);
});

test('the selected supplier is kept by ID, not only by name', async () => {
  const a = await supplier('Steady');
  const id = await pr({ quotes: [{ ...quote(a, 'Steady', 80, 20), Selected: true }] });
  const p = await get(id);
  assert.equal(p.Selected_Supplier_Id, a);
});

test('Order Date comes from the Sales Order; a manual PR (no customer order) uses the day it was created (DT-1)', async () => {
  const withSo = await get(await pr({ so: 'SO-9', soDays: -12 }));
  assert.equal(withSo.Order_Date, day(-12));
  const manual = await get(await pr({ so: '' }));
  assert.equal(manual.Order_Date, day(0));
});

test('pricing status: needs a manual quote when nobody has priced it (the buyer is told once), priced when a final price exists (PR-R5)', async () => {
  const id = await pr({ so: 'SO-Q' });
  assert.equal((await get(id)).Pricing_Status, 'needs_manual_quote');
  assert.equal((await raw.find('App_Notifications', (n) => n.Notification_Type === 'PR Needs Manual Quote')).length, 1);
  await store.updateRecord('Purchase_Request1', id, { Description1: 'again' });
  assert.equal((await raw.find('App_Notifications', (n) => n.Notification_Type === 'PR Needs Manual Quote')).length, 1, 'told once');
  const a = await supplier('Steady');
  const quoted = await get(await pr({ so: 'SO-R', quotes: [quote(a, 'Steady', 80, 20)] }));
  assert.equal(quoted.Pricing_Status, 'needs_pricing');
  const priced = await get(await pr({ so: 'SO-S', quotes: [quote(a, 'Steady', 80, 20)], extra: { SRP_Approved_PR: 900 } }));
  assert.equal(priced.Pricing_Status, 'auto_priced');
});

test('hold, resume and cancel need a reason and are stamped; a cancelled PR stays cancelled; a PR is never deleted (PR-R7)', async () => {
  const id = await pr();
  await rejects(() => store.updateRecord('Purchase_Request1', id, { Hold_Status: 'On Hold' }), /reason is required/);
  await store.updateRecord('Purchase_Request1', id, { Hold_Status: 'On Hold', Hold_Reason: 'Client stopped order' }, { user: 'buyer@x' });
  assert.equal((await get(id)).Pr_State, 'on_hold');
  assert.equal((await get(id)).Held_By, 'buyer@x');
  await store.updateRecord('Purchase_Request1', id, { Hold_Status: 'Active' });
  assert.equal((await get(id)).Pr_State, 'open');
  await store.updateRecord('Purchase_Request1', id, { Hold_Status: 'Cancelled', Hold_Reason: 'Client confirmed cancel' });
  await rejects(() => store.updateRecord('Purchase_Request1', id, { Hold_Status: 'Active' }), /stays cancelled/);
  await rejects(() => store.deleteRecord('All_Purchase_Request', id), /never deleted/);
  assert.deepEqual(await events(id), ['pr.created', 'pr.held', 'pr.resumed', 'pr.cancelled']);
});

test('Books voids the Sales Order: its open PRs go on hold at once, with the reason (PR-R2)', async () => {
  const so = await raw.addRecord('Sales_Order', { Sales_Order_Number: 'SO-V', Order_Status: 'open' });
  const a = await pr({ so: 'SO-V' });
  const b = await pr({ so: 'SO-V' });
  const other = await pr({ so: 'SO-OTHER' });
  await store.updateRecord('Sales_Order', so, { Order_Status: 'void' });
  for (const id of [a, b]) {
    const p = await get(id);
    assert.equal(p.Pr_State, 'on_hold');
    assert.equal(p.Hold_Reason, 'SO voided in Books');
    assert.equal(p.Pr_Category, 'blocked');
  }
  assert.notEqual((await get(other)).Pr_State, 'on_hold');
  assert.ok((await events(a)).includes('pr.held'));
});

test('the queue: oldest Sales Order first inside a category, impossible = Act now, blocked has its reason (SE-1..5)', async () => {
  const s = await supplier('Steady');
  const q = [quote(s, 'Steady', 80, 20)];
  const young = await pr({ so: 'SO-NEW', soDays: -3, target: 20, quotes: q });
  const old = await pr({ so: 'SO-OLD', soDays: -50, target: 20, quotes: q });
  const calm = await pr({ so: 'SO-CALM', soDays: -90, target: 200, quotes: [{ ...quote(s, 'Steady', 80, 20), Selected: true, Final_Price: 80 }] });
  const open = await pr({ so: 'SO-OPEN', soDays: -10, target: 80 }); // no quote at all
  const [y, o, c, n] = [await get(young), await get(old), await get(calm), await get(open)];
  assert.equal(y.Pr_Category, 'act_now');
  assert.equal(o.Pr_Category, 'act_now');
  assert.ok(Number(o.Queue_Rank) < Number(y.Queue_Rank), 'the older order is first');
  assert.equal(c.Pr_Category, 'on_track');
  assert.equal(n.Pr_Category, 'blocked');
  assert.match(n.Blocked_Reason, /no supplier selected|no price/);
  assert.match(o.Priority_Reason, /SO dated/);
  assert.ok(o.Suggested_Action);
});
