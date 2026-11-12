// Runs the "on success, after add" hooks of a form for a record that a script just inserted.
//
// In Zoho an `insert into Form [...]` made by a Deluge script runs that form's workflows like any other save (to be
// confirmed on Zoho Development). Here the writes of a hook or a custom API are plain store writes that do not run
// hooks (server/workflows/index.mjs), so a port that creates a record calls this right after the insert. Like the
// framework does for "on success", an error in a hook is logged and does not undo the insert.
// Only the after hooks are run: the "on validate" ones can only refuse, and a record that code builds is complete.
import { workflows } from '../../workflows/index.mjs';

export async function fireAfterAdd(store, form, id, user = '') {
  const hooks = workflows[form]?.afterAdd || [];
  if (!hooks.length) return;
  const record = await store.getRecordById(form, id, { raw: true });
  for (const fn of hooks) {
    try { await fn({ form, id, record, store, user }); } catch (e) { console.error(`[workflow ${form}.afterAdd]`, e); }
  }
}
