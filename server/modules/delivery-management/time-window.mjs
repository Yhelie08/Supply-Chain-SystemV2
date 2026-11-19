// Time window, not exact time (spec v1.4, Delivery 03 "Time window (hindi exact time)"): the customer is promised a
// window, never the minute. The scheduling engine still books an exact start (Confirmed_Time_Slot) because that is
// what the team-day capacity math needs; this adds a computed, server-only `Time_Window` next to it, which the
// widgets (and, later, the customer messages) show instead of the exact time.
//
// The window is a half day, cut at 12:00 NN: "Morning (<workday start>-12:00 NN)" for a slot that starts before
// noon, "Afternoon (12:00 NN-<workday end>)" from noon on. The spec's own text only gives "9am-12nn" as an example,
// so half-days from the Control Panel's workday_start_time / workday_end_time are this app's reading, not a quote.
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { SA, clock, policyReader } from './scheduling.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const NOON = 12 * 60;

// "8:00 AM" / "08:00:00 AM" -> "8:00 AM"
function pretty(v) {
  const c = clock(text(v));
  if (!c) return text(v);
  const h = c.hour % 12 || 12;
  return `${h}:${String(c.minute).padStart(2, '0')} ${c.hour >= 12 ? 'PM' : 'AM'}`;
}

// Pure. `start`/`end` are the workday texts (defaults 8:00 AM / 5:00 PM). '' when the slot is not a clock time.
export function windowFor(slot, start = '8:00 AM', end = '5:00 PM') {
  const c = clock(text(slot));
  if (!c) return '';
  return c.hour * 60 + c.minute < NOON ? `Morning (${pretty(start)}–12:00 NN)` : `Afternoon (12:00 NN–${pretty(end)})`;
}

async function stamp({ id, record, store }) {
  const policy = await policyReader(store);
  const want = windowFor(record.Confirmed_Time_Slot, policy('workday_start_time') || '8:00 AM', policy('workday_end_time') || '5:00 PM');
  if (text(record.Time_Window) === want) return;
  await store.updateRecord(SA, id, { Time_Window: want }, { byForm: true });
}

// Server-only: a widget cannot write Time_Window. It is recomputed after every save (and the engine's own writes of
// Confirmed_Time_Slot are covered the same way), only when it actually differs, so it never loops.
register(SA, {
  beforeAdd: ({ input }) => { delete input.Time_Window; },
  beforeUpdate: ({ input }) => { delete input.Time_Window; },
  afterAdd: stamp,
  afterUpdate: stamp,
});
