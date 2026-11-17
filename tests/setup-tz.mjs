// Loaded via `node --test --import=./tests/setup-tz.mjs` before any test file, so the whole suite runs in
// Zoho's org time zone (Asia/Manila) regardless of the host TZ (CI / Railway are UTC). Mirrors server/tz.mjs.
process.env.TZ = 'Asia/Manila';