// Policy Settings is for admins only: the page, the menu entry and every write to its form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAccess, DENIED } from '../../server/access.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const WIDGETS = path.join(ROOT, 'modules');
const sections = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'pages.json'), 'utf8'));
const access = createAccess(sections, WIDGETS);
const admin = { role: 'admin', email: 'a' };
const user = { role: 'user', email: 'u' };
const policyFile = path.join(WIDGETS, 'Delivery Management', 'Policy Settings', 'app', 'index.html');
const otherFile = path.join(WIDGETS, 'Delivery Management', 'Service Appointment', 'app', 'index.html');

test('pages.json flags Policy Settings and nothing else', () => {
  const flagged = sections.flatMap((s) => s.tabs).filter((t) => t.adminOnly).map((t) => t.widget);
  assert.deepEqual(flagged, ['Delivery Management/Policy Settings']);
});

test('the Policy Settings page is served to admins only', () => {
  assert.equal(access.canServeFile(admin, policyFile), true);
  assert.equal(access.canServeFile(user, policyFile), false);
  assert.equal(access.canServeFile(user, otherFile), true);
  assert.equal(access.canServeFile(user, policyFile.toUpperCase()), false, 'case must not matter (Windows)');
  // the path a ..%2F..%2F request resolves to is judged by where it lands, not by the URL
  const viaOtherTab = path.resolve(WIDGETS, 'Delivery Management', 'Service Appointment', 'app', '..', '..', 'Policy Settings', 'app', 'index.html');
  assert.equal(access.canServeFile(user, viaOtherTab), false);
});

test('the menu hides admin-only tabs from users, not from admins', () => {
  const labels = (me) => access.visibleSections(me).flatMap((s) => s.tabs).map((t) => t.label);
  assert.ok(labels(admin).includes('Policy Settings'));
  assert.ok(!labels(user).includes('Policy Settings'));
  assert.equal(labels(user).length, labels(admin).length - 1);
});

test('a user cannot write Policy Settings through any SDK write, by form or report name', () => {
  for (const [op, body] of [
    ['addRecords', { form_name: 'Policy_Settings', payload: { data: { Value: '1' } } }],
    ['updateRecordById', { report_name: 'All_Policy_Settings', id: '1' }],
    ['updateRecords', { report_name: 'All_Policy_Settings' }],
    ['deleteRecordById', { report_name: 'All_Policy_Settings', id: '1' }],
    ['updateRecordById', { report_name: 'all_policy_settings', id: '1' }],
  ]) {
    assert.deepEqual(access.checkCall(user, op, body), DENIED, `${op} ${JSON.stringify(body)}`);
    assert.equal(access.checkCall(admin, op, body), null, `admin ${op}`);
  }
  assert.deepEqual(access.checkUpload(user, 'All_Policy_Settings'), DENIED);
  assert.equal(access.checkUpload(admin, 'All_Policy_Settings'), null);
});

test('a user can still read Policy Settings and write every other form', () => {
  assert.equal(access.checkCall(user, 'getRecords', { report_name: 'All_Policy_Settings' }), null);
  assert.equal(access.checkCall(user, 'getRecordById', { report_name: 'All_Policy_Settings', id: '1' }), null);
  assert.equal(access.checkCall(user, 'updateRecordById', { report_name: 'All_Service_Appointments', id: '1' }), null);
  assert.equal(access.checkCall(user, 'addRecords', { form_name: 'Service_Appointment_Form' }), null);
  assert.equal(access.checkCall(user, 'addRecords', {}), null, 'a body with no form name must not throw');
  assert.equal(access.checkUpload(user, 'All_Service_Appointments'), null);
});
