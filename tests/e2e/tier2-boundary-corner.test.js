// tests/e2e/tier2-boundary-corner.test.js
// Tier 2: Boundary & Corner Cases (20 tests: 5 each for R1, R2, R3, R4)
// Validates boundary value conditions, edge inputs, fault tolerance, and unassigned/malformed inputs.

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { startE2EHarness } from './helpers/e2e-harness.mjs';
import { createBooksMock } from './helpers/books-mock.mjs';
import { ensureSchema, syncSequence, SEQ } from '../../server/pg/schema.mjs';
import { createPool } from '../../server/pg/pool.mjs';
import { exportZohoData } from '../../tools/export-zoho-data.mjs';

describe('Tier 2: Boundary & Corner Cases Suite (20 Tests across R1-R4)', () => {
  let harness;
  let booksMock;
  let team1Client;
  let adminClient;

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

    await harness.seedUser({ email: 'admin@fleet.local', password: 'AdminPassword123!', role: 'admin' });
    await harness.seedUser({ email: 'team1@fleet.local', password: 'Team1Password123!', role: 'user', team_name: 'Team 1' });
    await harness.seedUser({ email: 'ghost@fleet.local', password: 'GhostPassword123!', role: 'user', team_name: 'Team 99' });

    adminClient = (await harness.login('admin@fleet.local', 'AdminPassword123!')).client;
    team1Client = (await harness.login('team1@fleet.local', 'Team1Password123!')).client;
  });

  after(async () => {
    if (harness) await harness.stop();
    if (booksMock) await booksMock.stop();
  });

  beforeEach(async () => {
    for (const tbl of [
      'Service_Appointment_Form',
      'Field_Work',
      'Package_Shipments',
      'Sales_Returns_Form',
      'Fuel_Entries',
      'Evidence_Photos',
      'Daily_Checklist_for_Vehicle',
    ]) {
      await harness.clearTable(tbl);
    }
    booksMock.resetCalls();
  });

  // =========================================================================
  // R1: Row-Level Team Scoping - Boundary & Corner Cases (5 Tests)
  // =========================================================================
  describe('R1: Row-Level Scoping Boundary Cases (5 Tests)', () => {
    test('TEST-R1-T2-01: Unassigned Appointments Filtered Out for Field Teams', async () => {
      // Rec 401: NULL Installer, Rec 402: empty string Installer, Rec 403: Team 1
      await harness.seedRecord('Service_Appointment_Form', { ID: '401', Installer: null, Sales_Order: 'SO-UN1' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '402', Installer: '', Sales_Order: 'SO-UN2' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '403', Installer: 'Team 1', Sales_Order: 'SO-T1' });

      const res = await team1Client.getRecords('Service_Appointment');
      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.equal(res.data.data.length, 1);
      assert.equal(res.data.data[0].ID, '403');
      assert.equal(res.data.data[0].Installer, 'Team 1');

      const returnedIds = res.data.data.map((r) => r.ID);
      assert.ok(!returnedIds.includes('401'), 'NULL installer appointment must not be visible to field teams');
      assert.ok(!returnedIds.includes('402'), 'Empty installer appointment must not be visible to field teams');
    });

    test('TEST-R1-T2-02: Criteria Conjunction and Precedence Preservation', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '501', Installer: 'Team 1', Appointment_Status: 'Completed' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '502', Installer: 'Team 2', Appointment_Status: 'Completed' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '503', Installer: 'Team 1', Appointment_Status: 'Pending' });

      const res = await team1Client.getRecords('Service_Appointment', 'Appointment_Status == "Completed"');
      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.equal(res.data.data.length, 1);
      assert.equal(res.data.data[0].ID, '501');
      assert.equal(res.data.data[0].Appointment_Status, 'Completed');
    });

    test('TEST-R1-T2-03: Criteria Injection Resilience', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '601', Installer: 'Team 1', Appointment_Status: 'Pending' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '602', Installer: 'Team 2', Appointment_Status: 'Pending' });

      // Attempt injection with "|| 1==1"
      const res = await team1Client.getRecords('Service_Appointment', 'Appointment_Status == "Pending" || 1==1');
      assert.equal(res.status, 200);

      // Verify that NO Team 2 records are returned
      for (const rec of (res.data.data || [])) {
        assert.equal(rec.Installer, 'Team 1', 'Criteria injection must not leak records from other teams');
      }
    });

    test('TEST-R1-T2-04: Restricted Widget File Access via HTTP /w/', async () => {
      // Policy Settings widget is admin-only
      const res = await team1Client.getWidget('Delivery Management', 'Policy Settings', 'index.html');
      // Server must redirect unauthorized field team away from admin widget
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/');
    });

    test('TEST-R1-T2-05: Non-Existent Team Name Query Handling', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '701', Installer: 'Team 1', Sales_Order: 'SO-1' });
      await harness.seedRecord('Service_Appointment_Form', { ID: '702', Installer: 'Team 2', Sales_Order: 'SO-2' });

      const ghostClient = (await harness.login('ghost@fleet.local', 'GhostPassword123!')).client;
      const res = await ghostClient.getRecords('Service_Appointment');
      assert.equal(res.status, 200);
      assert.equal(res.data.code, 3000);
      assert.deepEqual(res.data.data, []);
    });
  });

  // =========================================================================
  // R2: Media Attachment Migration - Boundary & Corner Cases (5 Tests)
  // =========================================================================
  describe('R2: Media Migration Boundary Cases (5 Tests)', () => {
    test('TEST-R2-T2-01: Filename Collision Prevention Across Records', async () => {
      const url801 = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/801/Photo/download?filepath=invoice.jpg';
      const url802 = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/802/Photo/download?filepath=invoice.jpg';

      await harness.seedRecord('Evidence_Photos', { ID: '801', Photo: url801 });
      await harness.seedRecord('Evidence_Photos', { ID: '802', Photo: url802 });

      // Mock specific responses for 801 and 802
      booksMock.setRoute('GET', '/creator/v2.1/data/homecartel/supply-chain-app/report/All_Evidence_Photos/801/Photo/download', (req, res) => {
        res.setHeader('Content-Type', 'image/jpeg');
        res.end(Buffer.from('IMAGE_A_BYTES_801'));
      });
      booksMock.setRoute('GET', '/creator/v2.1/data/homecartel/supply-chain-app/report/All_Evidence_Photos/802/Photo/download', (req, res) => {
        res.setHeader('Content-Type', 'image/jpeg');
        res.end(Buffer.from('IMAGE_B_BYTES_802'));
      });

      const summary = await harness.migrateFiles({
        forms: ['Evidence_Photos'],
        config: { apiDomain: booksMock.baseUrl },
      });
      assert.equal(summary.filesMigrated, 2);

      const rows = await harness.query('SELECT "ID", "Photo" FROM "Evidence_Photos" WHERE "ID" IN (801, 802) ORDER BY "ID"');
      assert.ok(rows[0].Photo.startsWith('/uploads/'));
      assert.ok(rows[1].Photo.startsWith('/uploads/'));
      assert.notEqual(rows[0].Photo, rows[1].Photo, 'Different records must have distinct prefixed filenames');

      const file1 = path.join(harness.uploadsDir, path.basename(rows[0].Photo));
      const file2 = path.join(harness.uploadsDir, path.basename(rows[1].Photo));
      assert.ok(fs.existsSync(file1));
      assert.ok(fs.existsSync(file2));

      const c1 = fs.readFileSync(file1, 'utf8');
      const c2 = fs.readFileSync(file2, 'utf8');
      assert.equal(c1, 'IMAGE_A_BYTES_801');
      assert.equal(c2, 'IMAGE_B_BYTES_802');

      booksMock.removeRoute('GET', '/creator/v2.1/data/homecartel/supply-chain-app/report/All_Evidence_Photos/801/Photo/download');
      booksMock.removeRoute('GET', '/creator/v2.1/data/homecartel/supply-chain-app/report/All_Evidence_Photos/802/Photo/download');
    });

    test('TEST-R2-T2-02: Remote 404 / 500 Download Failure Handling', async () => {
      const brokenUrl = '/api/v2.1/homecartel/supply-chain-app/report/Field_Work_Report/901/Image/download?filepath=not_found.png';
      await harness.seedRecord('Field_Work', { ID: '901', Image: brokenUrl });

      booksMock.setRoute('GET', '/creator/v2.1/data/homecartel/supply-chain-app/report/Field_Work_Report/901/Image/download', (req, res) => {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 404, message: 'Remote asset not found' }));
      });

      const summary = await harness.migrateFiles({
        forms: ['Field_Work'],
        maxRetries: 1,
        config: { apiDomain: booksMock.baseUrl },
      });

      assert.equal(summary.errors, 1, 'Download error must be recorded');
      const rows = await harness.query('SELECT "Image" FROM "Field_Work" WHERE "ID" = 901');
      assert.equal(rows[0].Image, brokenUrl, 'Failed download must not corrupt or overwrite DB column');

      booksMock.removeRoute('GET', '/creator/v2.1/data/homecartel/supply-chain-app/report/Field_Work_Report/901/Image/download');
    });

    test('TEST-R2-T2-03: Idempotent Skip for Existing /uploads/ Records', async () => {
      await harness.seedRecord('Fuel_Entries', { ID: '1001', Invoice_Receipt: '/uploads/already_done_receipt.jpg' });

      const summary = await harness.migrateFiles({
        forms: ['Fuel_Entries'],
        config: { apiDomain: booksMock.baseUrl },
      });

      assert.equal(summary.filesMigrated, 0, 'Already local file must not be re-downloaded');
      assert.equal(summary.recordsUpdated, 0, 'No DB update should occur for local file');
    });

    test('TEST-R2-T2-04: CLI --dry-run Guarantees Zero Writes', async () => {
      const url = '/api/v2.1/homecartel/supply-chain-app/report/All_Daily_Checklist_for_Vehicles/1101/Odometer_Photo_Upload/download?filepath=odometer.jpg';
      await harness.seedRecord('Daily_Checklist_for_Vehicle', { ID: '1101', Odometer_Photo_Upload: url });

      const filesBefore = fs.readdirSync(harness.uploadsDir).length;
      const summary = await harness.migrateFiles({
        forms: ['Daily_Checklist_for_Vehicle'],
        dryRun: true,
        config: { apiDomain: booksMock.baseUrl },
      });

      assert.equal(summary.dryRun, true);
      assert.equal(summary.recordsUpdated, 0, 'Dry-run must not update records');
      const filesAfter = fs.readdirSync(harness.uploadsDir).length;
      assert.equal(filesBefore, filesAfter, 'Dry-run must write zero files to disk');

      const rows = await harness.query('SELECT "Odometer_Photo_Upload" FROM "Daily_Checklist_for_Vehicle" WHERE "ID" = 1101');
      assert.equal(rows[0].Odometer_Photo_Upload, url, 'Record must retain original URL');
    });

    test('TEST-R2-T2-05: Subform and Nested JSON Media URL Rewrite', async () => {
      const nestedUrl = '/api/v2.1/homecartel/supply-chain-app/report/Field_Work_Report/1151/photo/download?filepath=part_a.png';
      const initialSubform = [
        { item_name: 'Part A', photo: nestedUrl },
      ];
      await harness.seedRecord('Field_Work', { ID: '1151', SubForm: JSON.stringify(initialSubform) });

      const summary = await harness.migrateFiles({
        forms: ['Field_Work'],
        config: { apiDomain: booksMock.baseUrl },
      });

      assert.equal(summary.filesMigrated, 1);
      const rows = await harness.query('SELECT "SubForm" FROM "Field_Work" WHERE "ID" = 1151');
      const updatedSubform = typeof rows[0].SubForm === 'string' ? JSON.parse(rows[0].SubForm) : rows[0].SubForm;
      assert.ok(Array.isArray(updatedSubform));
      assert.ok(updatedSubform[0].photo.startsWith('/uploads/'));
      assert.ok(!updatedSubform[0].photo.includes('/api/v2.1/'));
    });
  });

  // =========================================================================
  // R3: Zoho Books/Inventory Payloads - Boundary & Corner Cases (5 Tests)
  // =========================================================================
  describe('R3: Zoho Books/Inventory Payloads Boundary Cases (5 Tests)', () => {
    test('TEST-R3-T2-01: Duplicate Shipment Creation Rejection', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '2001', Sales_Order: 'SO-DUP' });
      await harness.seedRecord('Package_Shipments', {
        ID: '2001',
        Sales_Order: 'SO-DUP',
        Package_Number: 'PKG-DUP',
        Shipment_Created: true,
        Shipment_Order_No: 'SH-EXISTING',
      });

      const res = await adminClient.invokeCustomApi('create_shipment_order', {
        recordId: '2001',
        packageShipmentId: '2001',
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.result.status, 'error');
      assert.ok(res.data.result.message.includes('Already sent — Shipment Order SH-EXISTING already exists'));
    });

    test('TEST-R3-T2-02: Missing or Blank Package Number Rejection', async () => {
      await harness.seedRecord('Service_Appointment_Form', { ID: '2002', Sales_Order: 'SO-NOPKG' });
      await harness.seedRecord('Package_Shipments', {
        ID: '2002',
        Sales_Order: 'SO-NOPKG',
        Package_Number: '',
        Shipment_Created: false,
      });

      const res = await adminClient.invokeCustomApi('create_shipment_order', {
        recordId: '2002',
        packageShipmentId: '2002',
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.result.status, 'error');
      assert.ok(res.data.result.message.includes('No Package Number on this record'));
    });

    test('TEST-R3-T2-03: Unmatched Return SKU Error Reporting', async () => {
      await harness.seedRecord('Sales_Returns_Form', {
        ID: '2003',
        Sales_Order: 'SO-6001',
        Books_SalesReturn_ID: null,
      });

      const res = await adminClient.invokeCustomApi('create_sales_return_books', {
        recordId: '2003',
        salesOrderNo: 'SO-6001',
        rmaVal: 'RMA-UNMATCH',
        dateVal: '2026-12-05',
        reasonVal: 'Defective',
        itemsJson: JSON.stringify({ items: [{ SKU: 'NONEXISTENT-SKU', Return_Quantity: 1 }] }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.result.status, 'error');
      assert.ok(res.data.result.message.includes('No returned item matched a real line on Sales Order SO-6001'));
      assert.ok(res.data.result.message.includes('Unmatched SKUs: [NONEXISTENT-SKU]'));
    });

    test('TEST-R3-T2-04: Stock Receive Step Failure Fault Tolerance', async () => {
      await harness.seedRecord('Sales_Returns_Form', {
        ID: '2004',
        Sales_Order: 'SO-6001',
        Books_SalesReturn_ID: null,
      });

      booksMock.setRoute('POST', '/inventory/v1/salesreturnreceives', (req, res) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 500, message: 'Warehouse storage locked for audit' }));
      });

      const res = await adminClient.invokeCustomApi('create_sales_return_books', {
        recordId: '2004',
        salesOrderNo: 'SO-6001',
        rmaVal: 'RMA-RCVFAIL',
        dateVal: '2026-12-05',
        reasonVal: 'Defective',
        itemsJson: JSON.stringify({ items: [{ SKU: 'CHAIR-BLK', Return_Quantity: 1 }] }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.result.status, 'success');
      assert.equal(res.data.result.receive_status, 'failed');
      assert.ok(res.data.result.message.includes('receive stock manually in Books'));

      // Verify that return record creation in DB is preserved
      const rows = await harness.query('SELECT "Books_SalesReturn_ID", "SR_CREATION_STATUS" FROM "Sales_Returns_Form" WHERE "ID" = 2004');
      assert.equal(rows[0].SR_CREATION_STATUS, 'CREATED');
      assert.equal(rows[0].Books_SalesReturn_ID, 'ret_7001');

      booksMock.removeRoute('POST', '/inventory/v1/salesreturnreceives');
    });

    test('TEST-R3-T2-05: Books Unconfigured / Offline Backend Error Handling', async () => {
      // Start offline harness without books configured
      const offlineHarness = await startE2EHarness({
        backend: 'pg',
        env: {
          ZOHO_BOOKS_CLIENT_ID: '',
          ZOHO_BOOKS_CLIENT_SECRET: '',
          ZOHO_BOOKS_REFRESH_TOKEN: '',
          ZOHO_BOOKS_ORG_ID: '',
        },
      });

      try {
        await offlineHarness.seedUser({ email: 'admin@offline.local', password: 'AdminPassword123!', role: 'admin' });
        await offlineHarness.seedRecord('Service_Appointment_Form', { ID: '3001', Sales_Order: 'SO-OFFLINE' });
        await offlineHarness.seedRecord('Package_Shipments', { ID: '3001', Sales_Order: 'SO-OFFLINE', Package_Number: 'PKG-OFFLINE' });

        const offlineClient = (await offlineHarness.login('admin@offline.local', 'AdminPassword123!')).client;
        const res = await offlineClient.invokeCustomApi('create_shipment_order', {
          recordId: '3001',
          packageShipmentId: '3001',
        });

        assert.equal(res.status, 200);
        assert.equal(res.data.result.status, 'error');
        assert.ok(
          res.data.result.message.includes('Zoho Books is not configured') ||
          res.data.result.message.includes('Zoho Books is not available in this backend'),
          'Expected informative unconfigured message'
        );
      } finally {
        await offlineHarness.stop();
      }
    });
  });

  // =========================================================================
  // R4: Database Export & Railway Deployment - Boundary Cases (5 Tests)
  // =========================================================================
  describe('R4: Database Export & Deployment Boundary Cases (5 Tests)', () => {
    // The export tool must never reach the real Zoho from a test (see tier1): use the local mock for the token and the report.
    const zohoMockEnv = () => {
      booksMock.setRoute('GET', '/creator/v2.1/data/homecartel/supply-chain-app/report/All_Policy_Settings', () => ({
        code: 3000, data: [{ ID: '1', Policy_Key: 'traffic_buffer_percent', Policy_Value: '15' }],
      }));
      return { ZOHO_ACCOUNTS_URL: booksMock.baseUrl, ZOHO_API_DOMAIN: booksMock.baseUrl, ZOHO_CLIENT_ID: 'mock', ZOHO_CLIENT_SECRET: 'mock', ZOHO_REFRESH_TOKEN: 'mock', ZOHO_ENV: 'development' };
    };

    test('TEST-R4-T2-01: Form Without List Report Graceful Skip', async () => {
      const dummyForm = { name: 'Form_Without_Report', fieldCount: 5 };
      const res = await exportZohoData({
        forms: [dummyForm],
        reports: [], // No matching reports
        dryRun: false,
        outDir: path.join(harness.tmpDir, 'test-export-no-report'),
      });

      assert.equal(res.manifest.forms.length, 1);
      assert.equal(res.manifest.forms[0].report, null);
      assert.ok(res.manifest.forms[0].notes.includes('no list report, cannot export'));
    });

    test('TEST-R4-T2-02: Missing or Invalid DATABASE_URL Exception', () => {
      assert.throws(
        () => createPool(''),
        /DATABASE_URL is not set/
      );
      assert.throws(
        () => createPool(undefined),
        /DATABASE_URL is not set/
      );
    });

    test('TEST-R4-T2-03: Idempotent Schema Synchronization Re-Execution', async () => {
      const memDb = new PGlite();
      try {
        await ensureSchema(memDb);
        const secondRunChanges = await ensureSchema(memDb);
        assert.equal(secondRunChanges, 0, 'Re-running ensureSchema on existing DB must execute 0 DDL statements');
      } finally {
        await memDb.close();
      }
    });

    test('TEST-R4-T2-04: Export Directory Recursive Creation', async () => {
      const deepOutDir = path.join(harness.tmpDir, 'deep', 'nested', 'export', 'target');
      assert.ok(!fs.existsSync(deepOutDir));

      const cliRes = await harness.runCli('tools/export-zoho-data.mjs', [
        '--only=Policy_Settings',
        `--out=${deepOutDir}`,
      ], zohoMockEnv());

      assert.equal(cliRes.code, 0);
      assert.ok(fs.existsSync(deepOutDir));
      assert.ok(fs.existsSync(path.join(deepOutDir, 'manifest.json')));
    });

    test('TEST-R4-T2-05: Sequence Synchronization Above Max ID', async () => {
      const memDb = new PGlite();
      try {
        await ensureSchema(memDb);
        // Seed high imported ID
        await memDb.query('INSERT INTO "Service_Appointment_Form" ("ID") VALUES ($1::bigint)', ['4662244000099999999']);

        await syncSequence(memDb);

        const res = await memDb.query(`SELECT nextval('${SEQ}') as val`);
        const nextVal = BigInt(res.rows[0].val);
        assert.ok(nextVal > 4662244000099999999n, 'Sequence must advance above imported max ID');
        assert.ok(nextVal >= 4900000000000000000n, 'Sequence must remain >= SEQ_START');
      } finally {
        await memDb.close();
      }
    });
  });
});
