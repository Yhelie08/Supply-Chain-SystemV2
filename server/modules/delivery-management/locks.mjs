// A queue per key: work with the same key runs one after the other, never at the same time.
//
// Why: two people can press the same button at the same moment (two dispatchers confirming the same slot, one person
// double-clicking Confirm). Each request reads the database, decides, and then writes; with two at once, both can read the
// old picture and both write, so the second one overwrites or doubles the first. With a queue the second one starts only after
// the first has written, so it reads the new picture.
//
// Limit, on purpose: this is inside ONE server process. It is enough while the app runs as one instance (as on Railway today).
// If the app is ever run as several instances, the same idea needs a database lock (a Postgres advisory lock), as the
// schedule runner does (server/schedules.mjs). A callback that waits on another callback of the same key would wait forever,
// so do not nest the same key.
const tails = new Map();

export function withLock(key, fn) {
  const previous = tails.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  tails.set(key, tail);
  tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
  return run;
}
