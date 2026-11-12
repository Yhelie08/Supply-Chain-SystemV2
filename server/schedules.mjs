// The runner for Zoho's scheduled workflows. A module lists its schedules in its index.mjs:
//   schedules: [{ name, at: 'HH:MM', timeZone: 'Asia/Manila', run: async (store, { log }) => result }]
// (the name is the Zoho schedule's name, so Port Status can tell which are ported).
//
// How it works: every minute it looks at each schedule in the order listed; a schedule is DUE when the local time in its zone has
// reached `at` and it has not been tried on that local date. The day is recorded in the table `_schedule_runs` when the run
// STARTS, so a run that fails is logged and is not retried until tomorrow (a job that fails every minute would be worse than
// one that waits a day). A server that was down at 01:00 runs the job when it comes back that day: the jobs are safe to repeat.
// Two server instances (a deploy overlap, or two replicas) never run the same job at once: a Postgres advisory lock is taken per
// schedule, and an instance that cannot get it skips that schedule this minute.
//
// It is OFF unless SCHEDULES=on, so a PC running `npm run dev:pg`, and the tests, never run a job by surprise.
// The jobs get the plain store: like a Deluge schedule, their writes do not fire the form workflows.

// "2026-11-12" and the minutes since local midnight, for a moment in a time zone.
export function localParts(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const atMinutes = (at) => { const [h, m] = String(at).split(':').map(Number); return h * 60 + (m || 0); };

export async function ensureRunTable(db) {
  await db.query('CREATE TABLE IF NOT EXISTS "_schedule_runs" (name text PRIMARY KEY, last_date text, started_at text, finished_at text, result text)');
}

// A lock that is held on one connection of the pool until released; null when somebody else has it.
export function pgAdvisoryLock(pool) {
  if (typeof pool.connect !== 'function') return async () => () => {}; // a single-connection database (PGlite): no one else to exclude
  return async (name) => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [`schedule:${name}`]);
      if (!rows[0].ok) { client.release(); return null; }
    } catch (e) { client.release(); throw e; }
    return async () => { try { await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`schedule:${name}`]); } finally { client.release(); } };
  };
}

// One look at the clock: runs what is due. Returns the names it ran.
export async function runDueSchedules({ db, store, schedules, now = new Date(), acquire = async () => () => {}, log = console.log }) {
  await ensureRunTable(db);
  const ran = [];
  for (const s of schedules) {
    const local = localParts(now, s.timeZone || 'Asia/Manila');
    if (local.minutes < atMinutes(s.at)) continue;
    const { rows } = await db.query('SELECT last_date FROM "_schedule_runs" WHERE name = $1', [s.name]);
    if (rows[0]?.last_date === local.date) continue;
    const release = await acquire(s.name);
    if (!release) { log(`[schedule ${s.name}] another instance is running it`); continue; }
    try {
      // check again under the lock: the other instance may have finished while we waited
      const again = await db.query('SELECT last_date FROM "_schedule_runs" WHERE name = $1', [s.name]);
      if (again.rows[0]?.last_date === local.date) continue;
      await db.query('INSERT INTO "_schedule_runs" (name, last_date, started_at) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET last_date = $2, started_at = $3, finished_at = NULL, result = NULL', [s.name, local.date, new Date().toISOString()]);
      log(`[schedule ${s.name}] start ${local.date}`);
      let result;
      try { result = JSON.stringify(await s.run(store, { log: (m) => log(`[schedule ${s.name}] ${m}`) })); } catch (e) { result = `FAILED: ${e.message}`; console.error(`[schedule ${s.name}]`, e); }
      await db.query('UPDATE "_schedule_runs" SET finished_at = $2, result = $3 WHERE name = $1', [s.name, new Date().toISOString(), result]);
      log(`[schedule ${s.name}] done: ${result}`);
      ran.push(s.name);
    } finally { await release(); }
  }
  return ran;
}

export function startSchedules({ pool, store, schedules, env = process.env, log = console.log, intervalMs = 60000 }) {
  if (env.SCHEDULES !== 'on') { log(`[schedules] off (set SCHEDULES=on to run ${schedules.map((s) => s.name).join(', ') || 'none'})`); return { stop() {} }; }
  const acquire = pgAdvisoryLock(pool);
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await runDueSchedules({ db: pool, store, schedules, acquire, log }); } catch (e) { console.error('[schedules]', e); } finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 15000).unref?.();
  log(`[schedules] on: ${schedules.map((s) => `${s.name} at ${s.at} ${s.timeZone || 'Asia/Manila'}`).join(', ')}`);
  return { stop: () => clearInterval(timer) };
}
