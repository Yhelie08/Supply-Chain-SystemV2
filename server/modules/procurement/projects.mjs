// Projects workflows, ported from zoho-export/parsed/workflows/form/Projects:
//   Proj_Code_AutoNumber (on add, on validate)  Project_Code = PRJ-nnnnn, one more than the highest existing code.
// Like Zoho it always sets the code on add (a code sent by the widget is replaced). The number comes from the locked,
// concurrency-safe series (workflows/numbering.mjs), so two projects saved at the same moment do not get the same code.
import { register } from '../../workflows/index.mjs';
import { nextNumber } from '../../workflows/numbering.mjs';

register('Projects', {
  beforeAdd: async ({ input, store }) => { input.Project_Code = await nextNumber(store, 'Projects', 'Project_Code', 'PRJ'); },
});
