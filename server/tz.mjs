// Zoho's org time zone is Asia/Manila; Railway runs UTC. Set TZ before any date helper runs so zohoNow(),
// today() and all date math (Remaining_Days, delay, priority) match Zoho — a midnight save must not be a day off.
// Imported first by the server entries; Node honours process.env.TZ at runtime (verified on Node 24).
process.env.TZ = 'Asia/Manila';