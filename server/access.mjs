// Who may open or change what, beyond "signed in".
// Phase 1: tabs flagged "adminOnly" in pages.json (Delivery's Policy Settings) and the forms behind them are for admins.
// Phase 2: row-level team scoping for field installer teams.
import path from 'node:path';
import { teamScoping as defaultScoping } from './modules/delivery-management/scoping.mjs';

// Policy Settings: the form its widget writes to and the report it reads. Compared in lower case.
const ADMIN_ONLY_FORMS = ['Policy_Settings', 'All_Policy_Settings'];
// SDK operation -> the body field that names the form or report it touches.
const WRITE_OPS = { addRecords: 'form_name', updateRecordById: 'report_name', updateRecords: 'report_name', deleteRecordById: 'report_name' };

export const DENIED = { code: 403, message: 'Only admins can open or change Policy Settings.' };

export function createAccess(sections, widgetsRoot, scoping = defaultScoping) {
  const adminForms = new Set(ADMIN_ONLY_FORMS.map((n) => n.toLowerCase()));
  const lower = (p) => p.toLowerCase(); // Windows file systems ignore case, so a URL in other case reaches the same folder
  const adminDirs = sections.flatMap((s) => s.tabs).filter((t) => t.adminOnly).map((t) => lower(path.resolve(widgetsRoot, t.widget)));

  const allowedWidgets = scoping?.allowedWidgets || [
    'Delivery Management/Ongoing Service',
    'Delivery Management/Field Service Site Visits',
    'Delivery Management/Truck Maintenance',
  ];
  const allowedDirs = allowedWidgets.map((w) => lower(path.resolve(widgetsRoot, w)));
  const allowedTabSet = new Set(scoping?.allowedTabs || ['Ongoing_Service1', 'Field_Service_Site_Visits1', 'Truck_Maintenance']);

  const ruleMap = new Map();
  if (scoping?.rules) {
    for (const r of scoping.rules) {
      if (r.form) ruleMap.set(r.form.toLowerCase(), r.field);
      if (r.report) ruleMap.set(r.report.toLowerCase(), r.field);
    }
  } else {
    ruleMap.set('service_appointment', 'Installer');
    ruleMap.set('service_appointment_form', 'Installer');
    ruleMap.set('field_work', 'Assigned_to_Installer');
    ruleMap.set('field_work_report', 'Assigned_to_Installer');
  }

  const isAdmin = (me) => me?.role === 'admin';
  const isFieldUser = (me) => !isAdmin(me) && Boolean(me?.team_name);
  const touchesAdminForm = (name) => adminForms.has(String(name ?? '').toLowerCase());

  return {
    // The sections shown in the menu:
    // - Admins see all sections and tabs
    // - Field users see only Delivery Management with the 3 allowed tabs
    // - Regular users see all sections with adminOnly tabs removed
    visibleSections: (me) => {
      if (isAdmin(me)) return sections;
      if (isFieldUser(me)) {
        return sections
          .filter((s) => s.id === 'delivery' || s.label === 'Delivery Management')
          .map((s) => ({
            ...s,
            tabs: s.tabs.filter((t) => allowedTabSet.has(t.page)),
          }));
      }
      return sections.map((s) => ({ ...s, tabs: s.tabs.filter((t) => !t.adminOnly) }));
    },

    // `file` is the resolved path of a widget file. Checking the path, not the URL, also covers
    // ../ tricks such as /w/<Other Tab>/..%2F..%2FPolicy Settings/app/index.html.
    canServeFile: (me, file) => {
      if (isAdmin(me)) return true;
      const f = lower(file);
      if (isFieldUser(me)) {
        return allowedDirs.some((d) => f.startsWith(d + path.sep) || f === d);
      }
      return !adminDirs.some((d) => f.startsWith(d + path.sep));
    },

    // Criteria injection for row-level scoping
    scopeCriteria: (me, reportName, userCriteria) => {
      if (isAdmin(me) || !isFieldUser(me) || !reportName) return userCriteria ?? '';
      const field = ruleMap.get(String(reportName || '').toLowerCase());
      if (!field) return userCriteria ?? '';
      const team = String(me.team_name).replace(/"/g, '\\"');
      const teamCriteria = `(${field} == "${team}")`;
      if (!userCriteria || !String(userCriteria).trim()) return teamCriteria;
      const trimmed = String(userCriteria).trim();
      const inner = trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed : `(${trimmed})`;
      return `(${teamCriteria} && ${inner})`;
    },

    // Record ownership check for single record reads or updates
    checkRecordAccess: (me, formOrReport, record) => {
      if (isAdmin(me) || !isFieldUser(me) || !record) return null;
      const field = ruleMap.get(String(formOrReport || '').toLowerCase());
      if (!field) return null;
      const recordTeam = record[field];
      if (recordTeam !== me.team_name) {
        return { code: 403, message: 'Access denied: record is not assigned to your team.' };
      }
      return null;
    },

    // Returns null when the call may go ahead, or the error body to send back.
    checkCall: (me, op, body = {}) => {
      if (isAdmin(me)) return null;
      const field = WRITE_OPS[op];
      return field && touchesAdminForm(body[field]) ? DENIED : null;
    },

    // /api/uploadFile writes a field of a record in ?report=...
    checkUpload: (me, report) => (!isAdmin(me) && touchesAdminForm(report) ? DENIED : null),
  };
}
