// Server-side version of Zoho's form workflows. Zoho ran them when a record was written through a
// form or the API; here they run when a widget writes through /api/* (see server/pg/api.mjs).
//
// Only the events that run for API writes are ported: "on validate" (before) and "on success" (after).
// "on load", "field rules" and "on user input" only drive Zoho's own forms, which are not used.
//
// A hook is a function taking one object:
//   before*  { form, input, id?, previous?, store, books, user }   input is the data about to be saved;
//            change it to alter what is saved, throw a ZohoError to refuse the write.
//   after*   { form, id, record, previous?, store, books, user }   record is the saved row with lookup
//            fields as plain IDs (like Deluge's input.Field); an error is logged and does not undo the write.
//
// Writes a hook makes through `store` are plain writes: they do not fire hooks again. (Assumed to match
// Zoho for writes done by Deluge scripts; check it against Zoho Development when porting a stage.)
import { formByName, formOfReport } from '../model.mjs';

const PHASES = ['beforeAdd', 'afterAdd', 'beforeUpdate', 'afterUpdate', 'beforeDelete', 'afterDelete'];

// The default registry the server uses; each module file (inquiry.mjs, ...) adds its forms here.
export const workflows = {};

// register(form, { afterAdd: fn | [fn], afterUpdate: fn, ... }) -> adds to `registry` (default: workflows).
export function register(form, hooks, registry = workflows) {
  formByName(form);
  const entry = (registry[form] ||= {});
  for (const [phase, fns] of Object.entries(hooks)) {
    if (!PHASES.includes(phase)) throw new Error(`Unknown workflow phase "${phase}" for ${form}`);
    (entry[phase] ||= []).push(...[].concat(fns));
  }
}

// Wraps a store so widget writes run the registered hooks. Reads are passed through untouched.
export function createHookedStore(store, registry = workflows, { books = null } = {}) {
  const has = (form, ...phases) => phases.some((p) => registry[form]?.[p]?.length);
  const run = async (form, phase, args, { swallow = false } = {}) => {
    for (const fn of registry[form]?.[phase] || []) {
      if (!swallow) { await fn(args); continue; }
      try { await fn(args); } catch (e) { console.error(`[workflow ${form}.${phase}]`, e); }
    }
  };
  const base = (user) => ({ store, books, user });

  return {
    ...store,

    async addRecord(formName, data, user = '') {
      const form = formByName(formName);
      const input = { ...data };
      await run(form, 'beforeAdd', { form, input, ...base(user) });
      const id = await store.addRecord(form, input, user);
      if (has(form, 'afterAdd')) {
        const record = await store.getRecordById(form, id, { raw: true });
        await run(form, 'afterAdd', { form, id, record, ...base(user) }, { swallow: true });
      }
      return id;
    },

    async updateRecord(reportOrForm, id, data, opts = {}) {
      const form = opts.byForm ? formByName(reportOrForm) : formOfReport(reportOrForm).form;
      const user = opts.user || '';
      const watched = has(form, 'beforeUpdate', 'afterUpdate');
      const previous = watched ? await store.getRecordById(form, id, { raw: true }) : null;
      const input = { ...data };
      await run(form, 'beforeUpdate', { form, id: String(id), input, previous, ...base(user) });
      const out = await store.updateRecord(reportOrForm, id, input, opts);
      if (has(form, 'afterUpdate')) {
        const record = await store.getRecordById(form, id, { raw: true });
        await run(form, 'afterUpdate', { form, id: String(id), record, previous, ...base(user) }, { swallow: true });
      }
      return out;
    },

    async deleteRecord(reportName, id, opts = {}) {
      const { form } = formOfReport(reportName);
      const user = opts.user || '';
      const watched = has(form, 'beforeDelete', 'afterDelete');
      const previous = watched ? await store.getRecordById(form, id, { raw: true }) : null;
      await run(form, 'beforeDelete', { form, id: String(id), previous, ...base(user) });
      const out = await store.deleteRecord(reportName, id);
      await run(form, 'afterDelete', { form, id: String(id), previous, ...base(user) }, { swallow: true });
      return out;
    },
  };
}
