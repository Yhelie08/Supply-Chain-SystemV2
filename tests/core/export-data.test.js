// tests/core/export-data.test.js
// Automated verification for Zoho Creator database export tool (tools/export-zoho-data.mjs).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  pickReport,
  buildExportPlan,
  exportZohoData,
  loadFormsAndReports,
} from '../../tools/export-zoho-data.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TEST_TMP_DIR = path.join(ROOT, 'data', 'test-export-data');

before(() => {
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
});

after(() => {
  if (fs.existsSync(TEST_TMP_DIR)) {
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  }
});

describe('Export CLI Subprocess Execution', () => {
  test('executes tools/export-zoho-data.mjs --dry-run with exit code 0 and evaluates all 90 forms', () => {
    const stdout = execFileSync(
      process.execPath,
      [path.join(ROOT, 'tools', 'export-zoho-data.mjs'), '--dry-run'],
      { cwd: ROOT, encoding: 'utf8' }
    );

    assert.ok(stdout.includes('Environment: development (dry run, no API calls)'));
    const lines = stdout.trim().split(/\r?\n/).slice(1);
    assert.equal(lines.length, 90, 'All 90 forms in parsed export must be evaluated');

    const pickUpLine = lines.find((l) => l.startsWith('Pick_Up_Request_Form'));
    assert.ok(pickUpLine, 'Pick_Up_Request_Form should be present');
    assert.match(pickUpLine, /-- no report: cannot export/);

    const shipmentLine = lines.find((l) => l.startsWith('Shipment_Order_Form'));
    assert.ok(shipmentLine, 'Shipment_Order_Form should be present');
    assert.match(shipmentLine, /-- no report: cannot export/);

    const preOrderLine = lines.find((l) => l.startsWith('Pre_Order_FF'));
    assert.ok(preOrderLine, 'Pre_Order_FF should be present');
    assert.match(preOrderLine, /Pre_Order1_Report\s+\[FILTERED\]/);
  });

  test('executes tools/export-zoho-data.mjs --dry-run with --only filter', () => {
    const stdout = execFileSync(
      process.execPath,
      [
        path.join(ROOT, 'tools', 'export-zoho-data.mjs'),
        '--dry-run',
        '--only=Pick_Up_Request_Form,Shipment_Order_Form,Pre_Order_FF,Customer',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );

    const lines = stdout.trim().split(/\r?\n/).slice(1);
    assert.equal(lines.length, 4, 'Only 4 specified forms should be evaluated');
    assert.ok(lines.some((l) => l.startsWith('Pick_Up_Request_Form')));
    assert.ok(lines.some((l) => l.startsWith('Shipment_Order_Form')));
    assert.ok(lines.some((l) => l.startsWith('Pre_Order_FF')));
    assert.ok(lines.some((l) => l.startsWith('Customer')));
  });
});

describe('Report Selection Ranking & Plan Logic', () => {
  const { forms, reports } = loadFormsAndReports();

  test('pickReport favors unfiltered list reports over filtered ones', () => {
    const mockReports = [
      { name: 'Filtered_Report', form: 'Test_Form', type: 'list', criteria: 'Status == "Active"', columns: ['A', 'B', 'C'] },
      { name: 'Unfiltered_Report', form: 'Test_Form', type: 'list', criteria: null, columns: ['A'] },
    ];
    const picked = pickReport({ name: 'Test_Form' }, mockReports);
    assert.equal(picked.name, 'Unfiltered_Report');
  });

  test('pickReport favors reports with more columns among unfiltered list reports', () => {
    const mockReports = [
      { name: 'Small_Report', form: 'Test_Form', type: 'list', criteria: null, columns: ['A'] },
      { name: 'Big_Report', form: 'Test_Form', type: 'list', criteria: null, columns: ['A', 'B', 'C', 'D'] },
    ];
    const picked = pickReport({ name: 'Test_Form' }, mockReports);
    assert.equal(picked.name, 'Big_Report');
  });

  test('pickReport favors default reports when criteria and column counts are equal', () => {
    const mockReports = [
      { name: 'NonDefault_Report', form: 'Test_Form', type: 'list', criteria: null, columns: ['A', 'B'], isDefault: false },
      { name: 'Default_Report', form: 'Test_Form', type: 'list', criteria: null, columns: ['A', 'B'], isDefault: true },
    ];
    const picked = pickReport({ name: 'Test_Form' }, mockReports);
    assert.equal(picked.name, 'Default_Report');
  });

  test('pickReport returns null when form has no list reports', () => {
    const mockReports = [
      { name: 'Grid_Report', form: 'Test_Form', type: 'grid', columns: ['A'] },
    ];
    assert.equal(pickReport({ name: 'Test_Form' }, mockReports), null);
    assert.equal(pickReport({ name: 'Missing_Form' }, mockReports), null);
  });

  test('buildExportPlan correctly maps all 90 forms with expected reports and exclusions', () => {
    const plan = buildExportPlan(forms, reports);
    assert.equal(plan.length, 90);

    const unexportable = plan.filter((p) => !p.report).map((p) => p.form.name).sort();
    assert.deepEqual(unexportable, ['Pick_Up_Request_Form', 'Shipment_Order_Form']);

    const filtered = plan.filter((p) => p.report?.criteria).map((p) => p.form.name);
    assert.deepEqual(filtered, ['Pre_Order_FF']);
  });
});

describe('Manifest Generation and Summarize Logic with Mock Reader', () => {
  test('exportZohoData generates manifest.json and form JSON files correctly with exit code 0 when unexportable forms are skipped', async () => {
    const mockForms = [
      { name: 'Form_Normal', fieldCount: 3 },
      { name: 'Form_Fewer_Fields', fieldCount: 5 },
      { name: 'Form_Filtered', fieldCount: 2 },
      { name: 'Form_No_Report', fieldCount: 2 },
    ];
    const mockReports = [
      { name: 'Normal_Report', form: 'Form_Normal', type: 'list', criteria: null, columns: ['a', 'b', 'c'] },
      { name: 'Fewer_Fields_Report', form: 'Form_Fewer_Fields', type: 'list', criteria: null, columns: ['a'] },
      { name: 'Filtered_Report', form: 'Form_Filtered', type: 'list', criteria: 'Active == true', columns: ['a', 'b'] },
    ];

    const mockReader = {
      getRecords: async ({ report_name }) => {
        if (report_name === 'Normal_Report') {
          return { data: [{ a: 1, b: 2, c: 3 }, { a: 4, b: 5, c: 6 }] };
        }
        if (report_name === 'Fewer_Fields_Report') {
          return { data: [{ a: 1 }] };
        }
        if (report_name === 'Filtered_Report') {
          return { data: [{ a: 10, b: 20 }] };
        }
        throw new Error('Unknown report');
      },
    };

    const outDir = path.join(TEST_TMP_DIR, 'mock-export-success');
    const result = await exportZohoData({
      forms: mockForms,
      reports: mockReports,
      reader: mockReader,
      env: 'test-env',
      outDir,
      log: () => {},
    });

    assert.equal(result.exitCode, 0, 'Exit code should be 0 because unexportable forms are cleanly skipped, not errors');
    const manifestPath = path.join(outDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must be created');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.environment, 'test-env');
    assert.ok(manifest.startedAt);
    assert.ok(manifest.finishedAt);
    assert.equal(manifest.forms.length, 4);

    const normalEntry = manifest.forms.find((f) => f.form === 'Form_Normal');
    assert.equal(normalEntry.rows, 2);
    assert.equal(normalEntry.fieldsSeen, 3);
    assert.deepEqual(normalEntry.notes, []);

    const fewerEntry = manifest.forms.find((f) => f.form === 'Form_Fewer_Fields');
    assert.equal(fewerEntry.rows, 1);
    assert.equal(fewerEntry.fieldsSeen, 1);
    assert.ok(fewerEntry.notes.includes('fewer fields than the form: report may hide columns'));

    const filteredEntry = manifest.forms.find((f) => f.form === 'Form_Filtered');
    assert.equal(filteredEntry.rows, 1);
    assert.ok(filteredEntry.notes.includes('report is filtered: not all records'));

    const unexportableEntry = manifest.forms.find((f) => f.form === 'Form_No_Report');
    assert.equal(unexportableEntry.report, null);
    assert.ok(unexportableEntry.notes.includes('no list report, cannot export'));

    // Verify written data files
    const normalJson = JSON.parse(fs.readFileSync(path.join(outDir, 'Form_Normal.json'), 'utf8'));
    assert.equal(normalJson.length, 2);
    assert.equal(normalJson[0].a, 1);
  });

  test('exportZohoData returns exit code 1 when an actual reader API error occurs', async () => {
    const mockForms = [
      { name: 'Form_Normal', fieldCount: 3 },
      { name: 'Form_Error', fieldCount: 2 },
    ];
    const mockReports = [
      { name: 'Normal_Report', form: 'Form_Normal', type: 'list', criteria: null, columns: ['a', 'b', 'c'] },
      { name: 'Error_Report', form: 'Form_Error', type: 'list', criteria: null, columns: ['a', 'b'] },
    ];

    const mockReader = {
      getRecords: async ({ report_name }) => {
        if (report_name === 'Normal_Report') {
          return { data: [{ a: 1, b: 2, c: 3 }] };
        }
        if (report_name === 'Error_Report') {
          throw new Error('API Rate Limit Exceeded (429)');
        }
        throw new Error('Unknown report');
      },
    };

    const outDir = path.join(TEST_TMP_DIR, 'mock-export-error');
    const result = await exportZohoData({
      forms: mockForms,
      reports: mockReports,
      reader: mockReader,
      env: 'test-env',
      outDir,
      log: () => {},
    });

    assert.equal(result.exitCode, 1, 'Exit code must be 1 when a form experiences an actual fetch error');
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
    const errorEntry = manifest.forms.find((f) => f.form === 'Form_Error');
    assert.equal(errorEntry.error, 'API Rate Limit Exceeded (429)');
  });
});
