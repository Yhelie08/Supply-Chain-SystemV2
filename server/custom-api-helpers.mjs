// Small helpers shared by the custom API handlers of every module (server/modules/<module>/apis.mjs).
export const ok = (message, extra = {}) => ({ status: 'success', message, ...extra });
export const fail = (message) => ({ status: 'error', message });

// A custom API that still only runs inside Zoho. The returned handler answers with a clear error, and carries
// `.notPorted = <Deluge function>` so tools (Port Status, Port Checklist) can tell it from a ported handler.
export function notPorted(fn) {
  const handler = () => fail(`"${fn}" is not ported yet — it still only runs inside Zoho. See zoho-export/parsed/functions/${fn}.dg`);
  handler.notPorted = fn;
  return handler;
}

// Builds a module's `apis` from `functions` (custom API name -> Deluge function): the ported handlers you pass in,
// and a "not ported yet" placeholder for every other name in `functions`.
export function withPlaceholders(functions, implemented = {}) {
  return {
    ...Object.fromEntries(Object.entries(functions).filter(([name]) => !(name in implemented)).map(([name, fn]) => [name, notPorted(fn)])),
    ...implemented,
  };
}
