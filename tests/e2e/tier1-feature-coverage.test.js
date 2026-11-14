// tests/e2e/tier1-feature-coverage.test.js
// Tier 1: Feature Coverage (20 tests: 5 each for R1, R2, R3, R4)
// Opaque-box requirements verification using live server child process, PGlite socket, and mock services.

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { startE2EHarness } from './helpers/e2e-harness.mjs';
import { createBooksMock } from './helpers/books-mock.mjs';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createPool } from '../../server/pg/pool.mjs';

describe('Tier 1: Feature Coverage Suite (20 Tests across R1-R4)', () => {
  let harness;
  let booksMock;
  let team1Client;
  let team2Client;
  let team3Client;
  let adminClient;
  let regularClient;

  before(async () => {
    booksMock = await createBooksMock();

    harness = await startE2EHarness({
      backend: 'pg',
      env: {
        ZOHO_BOOKS_CLIENT_ID: 'mock_books_client_id',
        ZOHO_BOOKS_CLIENT_SECRET: 'mock_books_secret',
        ZOHO_BOOKS_REFRESH_TOKEN: 'mock_books_refresh',
        ZOHO_BOOKS_ORG_ID: 'mock_books_org',
        ZOHO_API_DOMAIN: booksMock.baseUrl,
        ZOHO_ACCOUNTS_URL: booksMock.baseUrl,
      },
    });

    // Seed test users with must_change_password: 0
    await harness.seedUser({ email: 'admin@fleet.local', password: 'AdminPassword123!', role: 'admin' });
    await harness.seedUser({ email: 'team1@fleet.local', password: 'Team1Password123!', role: 'user', team_name: 'Team 1' });
    await harness.seedUser({ email: 'team2@fleet.local', password: 'Team2Password123!', role: 'user', team_name: 'Team 2' });
    await harness.seedUser({ email: 'team3@fleet.local', password: 'Team3Password123!', role: 'user', team_name: 'Team 3' });
    await harness.seedUser({ email: 'regular@fleet.local', password: 'RegularPassword123!', role: 'user', team_name: null });

    // Authenticate and obtain opaque clients
    adminClient = (await harness.login('admin@fleet.local', 'AdminPassword123!')).client;
    team1Client = (await harness.login('team1@fleet.local', 'Team1Password123!')).client;
    team2Client = (await harness.login('team2@fleet.local', 'Team2Password123!')).client;
    team3Client = (await harness.login('team3@fleet.local', 'Team3Password123!')).client;
    regularClient = (await harness.login('regular@fleet.local', 'RegularPassword123!')).client;
  });

  after(async () => {
    if (harness) await harness.stop();
    if (booksMock) await booksMock.stop();
  });

  beforeEach(async () => {
    // Clear application tables between tests to guarantee test isolation
    for (const tbl of [
      'Service_Appointment_Form',
      'Field_Work',
      'Package_Shipments',
      'Sales_Returns_Form',
      'Fuel_Entries',
      'Service_Entries',
      'Exception_Control_Media',
      'DMS_Schedule_Request',
    ]) {
      await harness.clearTable(tbl);
    }
    booksMock.resetCalls();
  });

  // =========================================================================
  // R1: Row-Level Team Scoping (5 Tests)
  // =========================================================================
  describe('R1: Row-Level Team Scoping (5 Tests)', () => {
    test('TEST-R1-T1-01: Team 1 Appointment Isolation on /api/getRecords', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '101', Installer: 'Team 1', Sales_Order: 'SO-001' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '102', Installer: 'Team 2', Sales_Order: 'SO-002' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '103', Installer: 'Team 3', Sales_Order: 'SO-003' });

      const res = await team1Client.getRecords('Service_Appointment');
      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.ok(Array.isArray(res.data.data), 'Expected records array');
      assert.equal(res.data.data.length, 1);
      assert.equal(res.data.data[0].ID, '101');
      assert.equal(res.data.data[0].Installer, 'Team 1');

      const returnedIds = res.data.data.map((r) => r.ID);
      assert.ok(!returnedIds.includes('102'), 'Team 2 appointment must not leak to Team 1');
      assert.ok(!returnedIds.includes('103'), 'Team 3 appointment must not leak to Team 1');
    });

    test('TEST-R1-T1-02: Team 2 Field Work Scoping on /api/getRecords', async () => {
      await harness.seedRecord('Field_Work', { ID: '201', Assigned_to_Installer: 'Team 1', Sales_Order: 'WO-101' });
      await harness.seedRecord('Field_Work', { ID: '202', Assigned_to_Installer: 'Team 2', Sales_Order: 'WO-102' });

      const res = await team2Client.getRecords('Field_Work_Report');
      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.ok(Array.isArray(res.data.data));
      assert.equal(res.data.data.length, 1);
      assert.equal(res.data.data[0].ID, '202');
      assert.equal(res.data.data[0].Assigned_to_Installer, 'Team 2');
    });

    test('TEST-R1-T1-03: Team 3 Bulk Update Scoping on /api/updateRecords', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '301', Installer: 'Team 3', Appointment_Status: 'Pending' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '302', Installer: 'Team 1', Appointment_Status: 'Pending' });

      const res = await team3Client.updateRecords('Service_Appointment', 'Appointment_Status == "Pending"', { Appointment_Status: 'In Progress' });
      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);

      // Verify DB mutations
      const rows = await harness.query('SELECT "ID", "Appointment_Status" FROM "Service_Appointment_Form" ORDER BY "ID"');
      const rec301 = rows.find((r) => String(r.ID) === '301');
      const rec302 = rows.find((r) => String(r.ID) === '302');
      assert.equal(rec301.Appointment_Status, 'In Progress', 'Team 3 record should be updated');
      assert.equal(rec302.Appointment_Status, 'Pending', 'Team 1 record must remain unmodified');
    });

    test('TEST-R1-T1-04: Admin Full Access Unscoped on /api/getRecords', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '401', Installer: 'Team 1', Sales_Order: 'SO-A1' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '402', Installer: 'Team 2', Sales_Order: 'SO-A2' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '403', Installer: 'Team 3', Sales_Order: 'SO-A3' });

      const res = await adminClient.getRecords('Service_Appointment');
      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.equal(res.data.data.length, 3);
      const installers = new Set(res.data.data.map((r) => r.Installer));
      assert.deepEqual(installers, new Set(['Team 1', 'Team 2', 'Team 3']));
    });

    test('TEST-R1-T1-05: Non-Team User Baseline Navigation and API Access', async () => {
      const res = await regularClient.getPages();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data));

      const deliverySection = res.data.find((s) => s.id === 'delivery' || s.label === 'Delivery Management');
      assert.ok(deliverySection, 'Delivery Management section must be present');

      const tabLabels = deliverySection.tabs.map((t) => t.label);
      assert.ok(!tabLabels.includes('Policy Settings'), 'Policy Settings must be excluded for non-admin');
      assert.ok(deliverySection.tabs.length > 3, 'Regular non-team user should see more than the 3 field tabs');
    });
  });

  // =========================================================================
  // R2: Media Attachment Migration (5 Tests)
  // =========================================================================
  describe('R2: Media Attachment Migration (5 Tests)', () => {
    test('TEST-R2-T1-01: End-to-End Media Download and DB Update for Fuel_Entries', async () => {
      const remoteUrl = '/api/v2.1/homecartel/supply-chain-app/report/All_Fuel_Entries/601/Invoice_Receipt/download?filepath=fuel_receipt.jpg';
      await harness.seedRecord('Fuel_Entries', { ID: '601', Invoice_Receipt: remoteUrl });

      const summary = await harness.migrateFiles({
        forms: ['Fuel_Entries'],
        config: { apiDomain: booksMock.baseUrl },
      });
      assert.equal(summary.errors, 0);
      assert.equal(summary.filesMigrated, 1);
      assert.equal(summary.recordsUpdated, 1);

      const rows = await harness.query('SELECT "Invoice_Receipt" FROM "Fuel_Entries" WHERE "ID" = 601');
      assert.equal(rows.length, 1);
      assert.ok(rows[0].Invoice_Receipt.startsWith('/uploads/'), 'DB record should be updated to local /uploads/ path');

      const filename = path.basename(rows[0].Invoice_Receipt);
      const localFilePath = path.join(harness.uploadsDir, filename);
      assert.ok(fs.existsSync(localFilePath), `File must exist at ${localFilePath}`);
      const content = fs.readFileSync(localFilePath, 'utf8');
      assert.ok(content.includes('MOCK_MEDIA_CONTENT'), 'File content should match downloaded mock bytes');
    });

    test('TEST-R2-T1-02: End-to-End Media Download and DB Update for Service_Entries', async () => {
      const remoteUrl = '/api/v2.1/homecartel/supply-chain-app/report/All_Service_Entries/602/Invoice_Receipt/download?filepath=maintenance_inv.pdf';
      await harness.seedRecord('Service_Entries', { ID: '602', Invoice_Receipt: remoteUrl });

      const summary = await harness.migrateFiles({
        forms: ['Service_Entries'],
        config: { apiDomain: booksMock.baseUrl },
      });
      assert.equal(summary.errors, 0);
      assert.equal(summary.filesMigrated, 1);

      const rows = await harness.query('SELECT "Invoice_Receipt" FROM "Service_Entries" WHERE "ID" = 602');
      assert.ok(rows[0].Invoice_Receipt.startsWith('/uploads/'));
      assert.ok(fs.existsSync(path.join(harness.uploadsDir, path.basename(rows[0].Invoice_Receipt))));
    });

    test('TEST-R2-T1-03: End-to-End Media Download and DB Update for Exception_Control_Media', async () => {
      const remoteUrl = '/creator/v2.1/data/homecartel/supply-chain-app/report/All_Exception_Media/603/Media/download?filepath=broken_crate.png';
      await harness.seedRecord('Exception_Control_Media', { ID: '603', Media: remoteUrl });

      const summary = await harness.migrateFiles({
        forms: ['Exception_Control_Media'],
        config: { apiDomain: booksMock.baseUrl },
      });
      assert.equal(summary.errors, 0);
      assert.equal(summary.filesMigrated, 1);

      const rows = await harness.query('SELECT "Media" FROM "Exception_Control_Media" WHERE "ID" = 603');
      assert.ok(rows[0].Media.startsWith('/uploads/'));
      assert.ok(fs.existsSync(path.join(harness.uploadsDir, path.basename(rows[0].Media))));
    });

    test('TEST-R2-T1-04: CLI --limit=1 Chunked Execution', async () => {
      for (let i = 1; i <= 5; i++) {
        const url = `/api/v2.1/homecartel/supply-chain-app/report/All_Fuel_Entries/${700 + i}/Invoice_Receipt/download?filepath=fuel_${i}.jpg`;
        await harness.seedRecord('Fuel_Entries', { ID: String(700 + i), Invoice_Receipt: url });
      }

      const summary = await harness.migrateFiles({
        forms: ['Fuel_Entries'],
        limit: 1,
        config: { apiDomain: booksMock.baseUrl },
      });
      assert.equal(summary.recordsScanned, 1);
      assert.equal(summary.filesMigrated, 1);

      const rows = await harness.query('SELECT "ID", "Invoice_Receipt" FROM "Fuel_Entries" WHERE "ID" BETWEEN 701 AND 705 ORDER BY "ID"');
      const migrated = rows.filter((r) => r.Invoice_Receipt.startsWith('/uploads/'));
      const unmigrated = rows.filter((r) => r.Invoice_Receipt.startsWith('/api/'));

      assert.equal(migrated.length, 1, 'Exactly 1 record should be migrated under limit: 1');
      assert.equal(unmigrated.length, 4, 'Remaining 4 records must remain unmigrated');
    });

    test('TEST-R2-T1-05: Migrated Media HTTP Readback via /api/readFile', async () => {
      const fileName = '701_so_manifest.pdf';
      const fileBytes = Buffer.from('%PDF-1.4 Mock PDF Content For E2E Readback Verification');
      fs.writeFileSync(path.join(harness.uploadsDir, fileName), fileBytes);

      await harness.seedRecord('Service_Appointment_Form', {
        ID: '701',
        Installer: 'Team 1',
        Shipment_Order_File: `/uploads/${fileName}`,
      });

      const res = await team1Client.readFile('Service_Appointment', '701', 'Shipment_Order_File');
      assert.equal(res.status, 200);
      assert.equal(res.contentType, 'application/pdf');
      assert.ok(res.buffer, 'Expected binary buffer response');
      assert.deepEqual(res.buffer, fileBytes);
    });
  });

  // =========================================================================
  // R3: Zoho Books/Inventory Payloads (5 Tests)
  // =========================================================================
  describe('R3: Zoho Books/Inventory Payloads (5 Tests)', () => {
    test('TEST-R3-T1-01: Full Successful create_shipment_order via /api/invokeCustomApi', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '1201', Sales_Order: 'SO-5001', Type_of_Delivery: 'Delivery Only' });
      await harness.seedRecord('Package_Shipments', { ID: '1201', Sales_Order: 'SO-5001', Package_Number: 'PKG-5001', Shipment_Created: false });

      const res = await adminClient.invokeCustomApi('create_shipment_order', {
        recordId: '1201',
        packageShipmentId: '1201',
        shipDate: '2026-12-01',
        deliveryDate: '2026-12-02',
        carrier: 'Fleet Alpha',
        shippingCharge: '150',
        ceilingMaterial: 'Concrete',
        ceilingHeight: '3.5m',
        siteWiringReady: 'Yes',
        preparedBy: 'Warehouse Lead',
        deliveryTeam: 'Team 1',
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.equal(res.data.result.status, 'success');
      assert.equal(res.data.result.shipmentorder_id, 'sh_9001');
      assert.equal(res.data.result.shipmentorder_no, 'SH-9001');

      // Verify DB record update
      const rows = await harness.query('SELECT "Shipment_Created", "Shipment_Order_No", "Shipment_Order_ID" FROM "Package_Shipments" WHERE "ID" = 1201');
      assert.equal(rows[0].Shipment_Created, true);
      assert.equal(rows[0].Shipment_Order_No, 'SH-9001');
      assert.equal(rows[0].Shipment_Order_ID, 'sh_9001');
    });

    test('TEST-R3-T1-02: Full Successful create_sales_return_books', async () => {
      await harness.seedRecord('Sales_Returns_Form', {
        ID: '1301',
        Sales_Order: 'SO-6001',
        Books_SalesReturn_ID: null,
        SR_CREATION_STATUS: 'PENDING',
      });

      const res = await adminClient.invokeCustomApi('create_sales_return_books', {
        recordId: '1301',
        salesOrderNo: 'SO-6001',
        rmaVal: 'RMA-6001',
        dateVal: '2026-12-05',
        reasonVal: 'Defective',
        subReasonVal: 'Broken Leg',
        returnedByVal: 'Customer Direct',
        itemsJson: JSON.stringify({ items: [{ SKU: 'CHAIR-BLK', Return_Quantity: 1 }] }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.equal(res.data.result.status, 'success');
      assert.equal(res.data.result.salesreturn_id, 'ret_7001');
      assert.equal(res.data.result.salesreturn_no, 'SR-7001');
      assert.equal(res.data.result.receive_status, 'success');

      // Verify DB record update
      const rows = await harness.query('SELECT "Books_SalesReturn_ID", "Books_SalesReturn_No", "SR_CREATION_STATUS" FROM "Sales_Returns_Form" WHERE "ID" = 1301');
      assert.equal(rows[0].Books_SalesReturn_ID, 'ret_7001');
      assert.equal(rows[0].Books_SalesReturn_No, 'SR-7001');
      assert.equal(rows[0].SR_CREATION_STATUS, 'CREATED');
    });

    test('TEST-R3-T1-03: confirm_dms_schedule_request Custom API', async () => {
      await harness.seedRecord('DMS_Schedule_Request', {
        ID: '1401',
        Status: 'Pending',
        Sales_Order_Number: 'SO-7001',
        Customer_Name: 'John Doe',
      });

      const res = await adminClient.invokeCustomApi('confirm_dms_schedule_request', {
        dmsRecordId: '1401',
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.equal(res.data.result.status, 'success');
      assert.ok(res.data.result.serviceAppointmentId, 'Service appointment ID should be returned');

      // Verify DMS_Schedule_Request updated to Confirmed
      const rows = await harness.query('SELECT "Status", "Service_Appointment_Record_ID" FROM "DMS_Schedule_Request" WHERE "ID" = 1401');
      assert.equal(rows[0].Status, 'Confirmed');
      assert.equal(rows[0].Service_Appointment_Record_ID, res.data.result.serviceAppointmentId);

      // Verify new Service_Appointment_Form record exists
      const saRows = await harness.query('SELECT "ID", "Sales_Order" FROM "Service_Appointment_Form" WHERE "ID" = $1::bigint', [res.data.result.serviceAppointmentId]);
      assert.equal(saRows.length, 1);
      assert.equal(saRows[0].Sales_Order, 'SO-7001');
    });

    test('TEST-R3-T1-04: Multi-Item Sales Return Line Allocation', async () => {
      await harness.seedRecord('Sales_Returns_Form', {
        ID: '1501',
        Sales_Order: 'SO-6001',
        Books_SalesReturn_ID: null,
      });

      const res = await adminClient.invokeCustomApi('create_sales_return_books', {
        recordId: '1501',
        salesOrderNo: 'SO-6001',
        rmaVal: 'RMA-6001',
        dateVal: '2026-12-05',
        reasonVal: 'Defective',
        subReasonVal: 'Faulty Wiring',
        returnedByVal: 'Tech A',
        itemsJson: JSON.stringify({
          items: [
            { SKU: 'LIGHT-01', Return_Quantity: 1 },
            { SKU: 'LIGHT-01', Return_Quantity: 2 },
          ],
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.result.status, 'success');

      // Verify mock calls received two distinct salesorder_item_ids
      const returnPostCall = booksMock.calls.find((c) => c.pathname === '/inventory/v1/salesreturns' && c.method === 'POST');
      assert.ok(returnPostCall, 'Sales returns POST endpoint must be invoked');
      const lines = returnPostCall.body.line_items;
      assert.equal(lines.length, 2);
      assert.equal(lines[0].salesorder_item_id, 'l_a');
      assert.equal(lines[1].salesorder_item_id, 'l_b');
    });

    test('TEST-R3-T1-05: Shipment Order typeOfDelivery Payload Override', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '1601', Sales_Order: 'SO-5001', Type_of_Delivery: 'Delivery Only' });
      await harness.seedRecord('Package_Shipments', { ID: '1601', Sales_Order: 'SO-5001', Package_Number: 'PKG-5001', Shipment_Created: false });

      const res = await adminClient.invokeCustomApi('create_shipment_order', {
        recordId: '1601',
        packageShipmentId: '1601',
        shipDate: '2026-12-01',
        deliveryDate: '2026-12-02',
        carrier: 'Fleet Beta',
        shippingCharge: '0',
        ceilingMaterial: 'Concrete',
        ceilingHeight: '3m',
        siteWiringReady: 'Yes',
        preparedBy: 'Dispatcher',
        deliveryTeam: 'Team 2',
        typeOfDelivery: 'With Installation',
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.result.status, 'success');

      // Verify Books received the mapped delivery type from payload override ('Deliver & Install')
      const shipPostCall = booksMock.calls.find((c) => c.pathname === '/inventory/v1/shipmentorders' && c.method === 'POST');
      assert.ok(shipPostCall);
      const customFields = shipPostCall.body.shipmentorder_custom_fields;
      const typeField = customFields.find((f) => f.customfield_id === '2680178000000440145');
      assert.ok(typeField);
      assert.equal(typeField.value, 'Deliver & Install');
    });
  });

  // =========================================================================
  // R4: Database Export & Railway Deployment (5 Tests)
  // =========================================================================
  describe('R4: Database Export & Railway Deployment (5 Tests)', () => {
    // The export tool must never reach the real Zoho from a test (it would refresh the real token on every run and
    // fail offline or when Zoho rate-limits). Point it at the local mock: a token route and one report.
    const zohoMockEnv = () => {
      booksMock.setRoute('GET', '/creator/v2.1/data/homecartel/supply-chain-app/report/All_Policy_Settings', () => ({
        code: 3000, data: [{ ID: '1', Policy_Key: 'traffic_buffer_percent', Policy_Value: '15' }],
      }));
      return { ZOHO_ACCOUNTS_URL: booksMock.baseUrl, ZOHO_API_DOMAIN: booksMock.baseUrl, ZOHO_CLIENT_ID: 'mock', ZOHO_CLIENT_SECRET: 'mock', ZOHO_REFRESH_TOKEN: 'mock', ZOHO_ENV: 'development' };
    };

    test('TEST-R4-T1-01: Export Tool CLI --dry-run Against All 90 Forms', async () => {
      const cliRes = await harness.runCli('tools/export-zoho-data.mjs', ['--dry-run']);
      assert.equal(cliRes.code, 0);
      assert.ok(cliRes.stdout.includes('dry run, no API calls'));
      assert.ok(cliRes.stdout.includes('Service_Appointment_Form'));
      assert.ok(cliRes.stdout.includes('Field_Work'));
    });

    test('TEST-R4-T1-02: Selective Form Export CLI Execution', async () => {
      const outDir = path.join(harness.tmpDir, 'test-export-selective');
      const cliRes = await harness.runCli('tools/export-zoho-data.mjs', [
        '--only=Policy_Settings',
        `--out=${outDir}`,
      ], zohoMockEnv());
      assert.equal(cliRes.code, 0);

      assert.ok(fs.existsSync(path.join(outDir, 'Policy_Settings.json')));
      assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
    });

    test('TEST-R4-T1-03: Backup manifest.json Schema and Metrics Validation', async () => {
      const outDir = path.join(harness.tmpDir, 'test-export-manifest');
      await harness.runCli('tools/export-zoho-data.mjs', [
        '--only=Policy_Settings',
        `--out=${outDir}`,
      ], zohoMockEnv());

      const manifestPath = path.join(outDir, 'manifest.json');
      assert.ok(fs.existsSync(manifestPath));
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      assert.ok(typeof manifest.environment === 'string');
      assert.ok(!isNaN(Date.parse(manifest.startedAt)));
      assert.ok(!isNaN(Date.parse(manifest.finishedAt)));
      assert.ok(Array.isArray(manifest.forms));
      assert.ok(manifest.forms.length > 0);

      const entry = manifest.forms[0];
      assert.equal(entry.form, 'Policy_Settings');
      assert.ok(typeof entry.rows === 'number');
      assert.ok(typeof entry.fieldsSeen === 'number');
      assert.ok(typeof entry.formFieldCount === 'number');
      assert.ok(Array.isArray(entry.notes));
    });

    test('TEST-R4-T1-04: PostgreSQL Boot-Time Schema Synchronization (ensureSchema)', async () => {
      const memDb = new PGlite();
      try {
        const changes = await ensureSchema(memDb);
        assert.ok(changes > 0, 'Initial ensureSchema should create tables');

        // Check sequence
        const seqRes = await memDb.query("SELECT nextval('record_id_seq') AS val");
        assert.ok(BigInt(seqRes.rows[0].val) >= 4900000000000000000n);

        // Check tables created
        const tblRes = await memDb.query("SELECT count(*) as count FROM information_schema.tables WHERE table_schema = current_schema()");
        assert.ok(Number(tblRes.rows[0].count) >= 88, 'All 88 form tables should exist (Pack and Pack_Notifications removed)');
      } finally {
        await memDb.close();
      }
    });

    test('TEST-R4-T1-05: Railway Connection Pool SSL and Host Classification', () => {
      const localPool = createPool('postgresql://postgres:pass@127.0.0.1:5432/test');
      assert.equal(localPool.options.ssl, false, 'Localhost should bypass SSL');

      const railwayInternalPool = createPool('postgresql://postgres:pass@postgres.railway.internal:5432/railway');
      assert.equal(railwayInternalPool.options.ssl, false, 'Railway internal network should bypass SSL');

      const proxyPool = createPool('postgresql://postgres:pass@viaduct.proxy.rlwy.net:12345/railway');
      assert.deepEqual(proxyPool.options.ssl, { rejectUnauthorized: false }, 'Public proxy should use rejectUnauthorized: false');
    });
  });
});
