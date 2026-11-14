// tests/core/team-scoping.test.js
// Comprehensive test suite for Milestone 1: Phase 2 Row-Level Team Scoping.
// Verifies UI tab visibility, widget file isolation, criteria scoping,
// row-level query isolation under BACKEND=pg (PGlite), criteria combination, and write isolation.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createAccess, DENIED } from '../../server/access.mjs';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { criteriaToSql } from '../../server/pg/criteria-sql.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const WIDGETS = path.join(ROOT, 'modules');
const sections = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'pages.json'), 'utf8'));
const access = createAccess(sections, WIDGETS);

// User Fixtures
const admin = { id: 1, role: 'admin', email: 'admin@homecartel.com' };
const standardUser = { id: 2, role: 'user', email: 'dispatcher@homecartel.com' }; // No team_name
const team1 = { id: 10, role: 'user', email: 'team1@homecartel.com', team_name: 'Team 1' };
const team2 = { id: 20, role: 'user', email: 'team2@homecartel.com', team_name: 'Team 2' };
const team3 = { id: 30, role: 'user', email: 'team3@homecartel.com', team_name: 'Team 3' };

// --------------------------------------------------------------------------------------
// Suite 1: UI Tab Navigation Scoping (visibleSections)
// --------------------------------------------------------------------------------------
describe('Suite 1: UI Tab Navigation Scoping (visibleSections)', () => {
  test('1.1: Admin and standard user navigation visibility (Policy Settings admin-only)', () => {
    const adminVisible = access.visibleSections(admin);
    assert.equal(adminVisible.length, 6, 'Admin must see all 6 sections');
    const adminDelivery = adminVisible.find((s) => s.id === 'delivery');
    assert.ok(adminDelivery, 'Delivery section must exist');
    assert.equal(adminDelivery.tabs.length, 12, 'Admin must see all 12 delivery tabs (Schedule Requests removed: CMS now enters Service Request)');
    assert.ok(adminDelivery.tabs.some((t) => t.page === 'Policy_Setting'));

    const userVisible = access.visibleSections(standardUser);
    assert.equal(userVisible.length, 6, 'Standard user sees all 6 sections');
    const userDelivery = userVisible.find((s) => s.id === 'delivery');
    assert.equal(userDelivery.tabs.length, 11, 'Policy Settings hidden from standard user');
    assert.ok(!userDelivery.tabs.some((t) => t.page === 'Policy_Setting'));
    assert.ok(userDelivery.tabs.some((t) => t.page === 'Service_Appointment1'));
    assert.ok(userDelivery.tabs.some((t) => t.page === 'Initial_Scheduling1'));
  });

  test('1.2: Team 1 field user sees ONLY Delivery Management with the 3 allowed tabs', () => {
    const visible = access.visibleSections(team1);
    assert.equal(visible.length, 1, 'Field user must only see 1 section');
    assert.equal(visible[0].id, 'delivery');
    assert.equal(visible[0].label, 'Delivery Management');

    const tabPages = visible[0].tabs.map((t) => t.page);
    const expectedPages = ['Ongoing_Service1', 'Field_Service_Site_Visits1', 'Truck_Maintenance'];
    assert.deepEqual(tabPages.sort(), expectedPages.sort(), 'Field user must only see the 3 allowed tabs');
  });

  test('1.3: Team 2 and Team 3 field users see identical 3 allowed tabs', () => {
    for (const teamUser of [team2, team3]) {
      const visible = access.visibleSections(teamUser);
      assert.equal(visible.length, 1);
      const tabPages = visible[0].tabs.map((t) => t.page);
      assert.deepEqual(tabPages.sort(), ['Field_Service_Site_Visits1', 'Ongoing_Service1', 'Truck_Maintenance']);
    }
  });
});

// --------------------------------------------------------------------------------------
// Suite 2: Widget File Serving Isolation (canServeFile)
// --------------------------------------------------------------------------------------
describe('Suite 2: Widget File Serving Isolation (canServeFile)', () => {
  const ongoingServiceFile = path.join(WIDGETS, 'Delivery Management', 'Ongoing Service', 'app', 'index.html');
  const siteVisitsFile = path.join(WIDGETS, 'Delivery Management', 'Field Service Site Visits', 'app', 'index.html');
  const truckMaintenanceFile = path.join(WIDGETS, 'Delivery Management', 'Truck Maintenance', 'app', 'index.html');
  const serviceAppointmentFile = path.join(WIDGETS, 'Delivery Management', 'Service Appointment', 'app', 'index.html');
  const policyFile = path.join(WIDGETS, 'Delivery Management', 'Policy Settings', 'app', 'index.html');
  const fulfillmentKanbanFile = path.join(WIDGETS, 'Fulfillment', 'Kanban', 'app', 'index.html');

  test('2.1: Field team user is allowed to access files in the 3 allowed widget directories', () => {
    assert.equal(access.canServeFile(team1, ongoingServiceFile), true);
    assert.equal(access.canServeFile(team1, siteVisitsFile), true);
    assert.equal(access.canServeFile(team1, truckMaintenanceFile), true);
    assert.equal(access.canServeFile(team2, ongoingServiceFile), true);
    assert.equal(access.canServeFile(team3, truckMaintenanceFile), true);
  });

  test('2.2: Field team user is blocked from files in disallowed widget directories', () => {
    assert.equal(access.canServeFile(team1, serviceAppointmentFile), false);
    assert.equal(access.canServeFile(team1, policyFile), false);
    assert.equal(access.canServeFile(team1, fulfillmentKanbanFile), false);
  });

  test('2.3: Traversal tricks blocked, case insensitivity, and admin/standard user access', () => {
    // Directory traversal attempt landing outside allowed tabs
    const traversal = path.resolve(WIDGETS, 'Delivery Management', 'Ongoing Service', 'app', '..', '..', 'Service Appointment', 'app', 'index.html');
    assert.equal(access.canServeFile(team1, traversal), false, 'Traversal must be blocked');

    // Case insensitivity (Windows parity)
    assert.equal(access.canServeFile(team1, ongoingServiceFile.toUpperCase()), true);
    assert.equal(access.canServeFile(team1, serviceAppointmentFile.toUpperCase()), false);

    // Admin and standard user access parity
    assert.equal(access.canServeFile(admin, policyFile), true);
    assert.equal(access.canServeFile(admin, serviceAppointmentFile), true);
    assert.equal(access.canServeFile(standardUser, serviceAppointmentFile), true);
    assert.equal(access.canServeFile(standardUser, policyFile), false);
  });
});

// --------------------------------------------------------------------------------------
// Suite 3: Criteria Scoping Generation Unit Tests (scopeCriteria)
// --------------------------------------------------------------------------------------
describe('Suite 3: Criteria Scoping Generation Unit Tests (scopeCriteria)', () => {
  test('3.1: Generates correct criteria for Service_Appointment', () => {
    assert.equal(access.scopeCriteria(team1, 'Service_Appointment', ''), '(Installer == "Team 1")');
    assert.equal(access.scopeCriteria(team2, 'Service_Appointment', null), '(Installer == "Team 2")');
    assert.equal(access.scopeCriteria(team3, 'Service_Appointment', undefined), '(Installer == "Team 3")');
  });

  test('3.2: Generates correct criteria for Field_Work_Report', () => {
    assert.equal(access.scopeCriteria(team1, 'Field_Work_Report', ''), '(Assigned_to_Installer == "Team 1")');
    assert.equal(access.scopeCriteria(team2, 'Field_Work_Report', ''), '(Assigned_to_Installer == "Team 2")');
  });

  test('3.3: Returns userCriteria unaltered for Admin, Standard Users, and unscoped forms', () => {
    assert.equal(access.scopeCriteria(admin, 'Service_Appointment', '(Status == "Open")'), '(Status == "Open")');
    assert.equal(access.scopeCriteria(admin, 'Service_Appointment', ''), '');
    assert.equal(access.scopeCriteria(standardUser, 'Service_Appointment', '(Status == "Open")'), '(Status == "Open")');
    assert.equal(access.scopeCriteria(team1, 'Customer', '(City == "Manila")'), '(City == "Manila")');
    assert.equal(access.scopeCriteria(team1, 'Projects', ''), '');
  });
});

// --------------------------------------------------------------------------------------
// Suite 4: Row-Level Query Scoping Database Tests (getRecords under BACKEND=pg)
// --------------------------------------------------------------------------------------
describe('Suite 4: Row-Level Query Scoping Database Tests (getRecords under BACKEND=pg)', () => {
  let db, store;

  before(async () => {
    db = new PGlite();
    await ensureSchema(db);
    store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });

    // Seed 8 appointments: 2 Team 1, 2 Team 2, 2 Team 3, 2 Unassigned
    await db.query(`
      INSERT INTO "Service_Appointment_Form" ("ID", "Delivery_ID", "Installer", "Appointment_Status", "Shipment_Order_No") VALUES
        (101, 101, 'Team 1', 'Confirmed', 'DEL-T1-1'),
        (102, 102, 'Team 1', 'Completed', 'DEL-T1-2'),
        (201, 201, 'Team 2', 'Confirmed', 'DEL-T2-1'),
        (202, 202, 'Team 2', 'Completed', 'DEL-T2-2'),
        (301, 301, 'Team 3', 'Confirmed', 'DEL-T3-1'),
        (302, 302, 'Team 3', 'Completed', 'DEL-T3-2'),
        (901, 901, NULL, 'Pending', 'DEL-UN-1'),
        (902, 902, '', 'Pending', 'DEL-UN-2');
    `);
  });

  test('4.1: Team 1 query returns EXACTLY the 2 Team 1 appointments (zero leak of Team 2/3/unassigned)', async () => {
    const criteria = access.scopeCriteria(team1, 'Service_Appointment', '');
    const records = await store.getRecords('Service_Appointment', { criteria });
    assert.equal(records.length, 2);
    const ids = records.map((r) => r.Shipment_Order_No).sort();
    assert.deepEqual(ids, ['DEL-T1-1', 'DEL-T1-2']);
    assert.ok(!records.some((r) => r.Installer === 'Team 2'));
    assert.ok(!records.some((r) => r.Installer === 'Team 3'));
    assert.ok(!records.some((r) => !r.Installer));
  });

  test('4.2: Team 2 and Team 3 queries return only their respective appointments', async () => {
    const criteria2 = access.scopeCriteria(team2, 'Service_Appointment', '');
    const records2 = await store.getRecords('Service_Appointment', { criteria: criteria2 });
    assert.equal(records2.length, 2);
    assert.deepEqual(records2.map((r) => r.Shipment_Order_No).sort(), ['DEL-T2-1', 'DEL-T2-2']);

    const criteria3 = access.scopeCriteria(team3, 'Service_Appointment', '');
    const records3 = await store.getRecords('Service_Appointment', { criteria: criteria3 });
    assert.equal(records3.length, 2);
    assert.deepEqual(records3.map((r) => r.Shipment_Order_No).sort(), ['DEL-T3-1', 'DEL-T3-2']);
  });

  test('4.3: Admin and standard user queries return all 8 appointments', async () => {
    const adminCriteria = access.scopeCriteria(admin, 'Service_Appointment', '');
    const adminRecords = await store.getRecords('Service_Appointment', { criteria: adminCriteria });
    assert.equal(adminRecords.length, 8);

    const userCriteria = access.scopeCriteria(standardUser, 'Service_Appointment', '');
    const userRecords = await store.getRecords('Service_Appointment', { criteria: userCriteria });
    assert.equal(userRecords.length, 8);
  });
});

// --------------------------------------------------------------------------------------
// Suite 5: Criteria Combination Testing
// --------------------------------------------------------------------------------------
describe('Suite 5: Criteria Combination Testing', () => {
  let db, store;

  before(async () => {
    db = new PGlite();
    await ensureSchema(db);
    store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });

    await db.query(`
      INSERT INTO "Service_Appointment_Form" ("ID", "Delivery_ID", "Installer", "Appointment_Status", "Shipment_Order_No") VALUES
        (101, 101, 'Team 1', 'Confirmed', 'DEL-T1-1'),
        (102, 102, 'Team 1', 'Completed', 'DEL-T1-2'),
        (201, 201, 'Team 2', 'Confirmed', 'DEL-T2-1'),
        (202, 202, 'Team 2', 'Completed', 'DEL-T2-2');
    `);
  });

  test('5.1: Combined criteria filters both by team and by Appointment_Status == "Completed"', async () => {
    const userCriteria = '(Appointment_Status == "Completed")';
    const combined = access.scopeCriteria(team1, 'Service_Appointment', userCriteria);
    assert.equal(combined, '((Installer == "Team 1") && (Appointment_Status == "Completed"))');

    // Verify it translates to Postgres SQL cleanly
    const sqlTranslation = criteriaToSql(combined, 'Service_Appointment_Form');
    assert.ok(sqlTranslation, 'Combined criteria must be valid SQL');

    const records = await store.getRecords('Service_Appointment', { criteria: combined });
    assert.equal(records.length, 1);
    assert.equal(records[0].Shipment_Order_No, 'DEL-T1-2');
    assert.equal(records[0].Appointment_Status, 'Completed');
    assert.equal(records[0].Installer, 'Team 1');
  });

  test('5.2: Combined disjunctive criteria ((Installer == "Team 1") && (Status == A || Status == B))', async () => {
    const userCriteria = '(Appointment_Status == "Confirmed" || Appointment_Status == "Completed")';
    const combined = access.scopeCriteria(team1, 'Service_Appointment', userCriteria);
    const records = await store.getRecords('Service_Appointment', { criteria: combined });
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((r) => r.Shipment_Order_No).sort(), ['DEL-T1-1', 'DEL-T1-2']);
  });
});

// --------------------------------------------------------------------------------------
// Suite 6: Write Isolation Testing (checkRecordAccess / updateRecordById)
// --------------------------------------------------------------------------------------
describe('Suite 6: Write Isolation Testing (checkRecordAccess / updateRecordById)', () => {
  const team1Appointment = { ID: '101', Installer: 'Team 1', Appointment_Status: 'Confirmed' };
  const team2Appointment = { ID: '201', Installer: 'Team 2', Appointment_Status: 'Confirmed' };
  const unassignedAppointment = { ID: '901', Installer: null, Appointment_Status: 'Pending' };

  test('6.1: Field team cannot update another team or unassigned appointments', () => {
    const deniedOther = access.checkRecordAccess(team1, 'Service_Appointment_Form', team2Appointment);
    assert.ok(deniedOther, 'Updating Team 2 appointment must be denied');
    assert.equal(deniedOther.code, 403);

    const deniedUnassigned = access.checkRecordAccess(team1, 'Service_Appointment_Form', unassignedAppointment);
    assert.ok(deniedUnassigned, 'Updating unassigned appointment must be denied');
    assert.equal(deniedUnassigned.code, 403);
  });

  test('6.2: Field team can update own appointment, admin/dispatcher can reassign any appointment', () => {
    const allowedOwn = access.checkRecordAccess(team1, 'Service_Appointment_Form', team1Appointment);
    assert.equal(allowedOwn, null, 'Updating own appointment must be permitted');

    assert.equal(access.checkRecordAccess(admin, 'Service_Appointment_Form', team2Appointment), null);
    assert.equal(access.checkRecordAccess(admin, 'Service_Appointment_Form', unassignedAppointment), null);
    assert.equal(access.checkRecordAccess(standardUser, 'Service_Appointment_Form', team2Appointment), null);
    assert.equal(access.checkRecordAccess(standardUser, 'Service_Appointment_Form', unassignedAppointment), null);
  });
});
