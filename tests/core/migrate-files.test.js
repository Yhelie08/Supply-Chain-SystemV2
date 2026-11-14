// tests/core/migrate-files.test.js
// Unit tests for the Files & Media Migration Tool:
// Verifies URL detection, filename extraction, download simulation with retries,
// and database record update logic for SQLite, Postgres (PGlite), and Backup JSON.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';

import {
  DELIVERY_FORMS_WITH_MEDIA,
  isZohoFileUrl,
  extractZohoUrls,
  extractFilenameFromUrl,
  sanitizeFilename,
  resolveZohoUrl,
  createLimiter,
  downloadZohoMedia,
  replaceZohoUrlsInValue,
  migrateRecord,
  migrateSqliteDb,
  migratePgDb,
  migrateBackupDir,
} from '../../tools/migrate-zoho-files.mjs';

const TEST_TMP_DIR = path.resolve(import.meta.dirname, '..', '..', 'data', 'test-migrate-files');

before(() => {
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
});

after(() => {
  if (fs.existsSync(TEST_TMP_DIR)) {
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  }
});

describe('Delivery Management Forms and Media Fields', () => {
  test('all 13 delivery forms are present with their media fields', () => {
    const expectedForms = [
      'Field_Work',
      'Service_Appointment_Form',
      'Field_Service_Site_Visit_Form',
      'Sales_Returns_Form',
      'Daily_Checklist_for_Vehicle',
      'Dispatch_Checklist',
      'Evidence_Photos',
      'Site_Visit_Photos',
      'Exception_Control1',
      'Fuel_Entries',
      'Service_Entries',
      'Exception_Control_Media',
      'Pick_Up_Request_Form',
    ];

    for (const form of expectedForms) {
      assert.ok(DELIVERY_FORMS_WITH_MEDIA[form], `Missing form: ${form}`);
      assert.ok(Array.isArray(DELIVERY_FORMS_WITH_MEDIA[form]), `Form fields should be array: ${form}`);
      assert.ok(DELIVERY_FORMS_WITH_MEDIA[form].length > 0, `Form should have media fields: ${form}`);
    }
  });
});

describe('Zoho URL Detection', () => {
  test('correctly identifies relative and absolute Zoho file URLs', () => {
    const validUrls = [
      '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=1788841191493932_receiver_signature.png',
      '/api/v2/homecartel/supply-chain-app/report/All_Qc_Reports1/4662244000014006226/Signature/download?filepath=17857402927',
      '/creator/v2.1/data/homecartel/supply-chain-app/report/All_Items/4662244000014006010/Image/download',
      'https://creator.zoho.com/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=1788841191493932_receiver_signature.png',
      'https://creatorapp.zoho.com/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=1788841191493932_receiver_signature.png',
      'https://www.zohoapis.com/creator/v2.1/data/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=test.jpg',
    ];

    for (const url of validUrls) {
      assert.equal(isZohoFileUrl(url), true, `Expected valid Zoho URL: ${url}`);
    }
  });

  test('rejects local upload paths, external non-Zoho URLs, and empty values', () => {
    const invalidUrls = [
      '/uploads/1788841191493932_receiver_signature.png',
      'uploads/photo.jpg',
      'https://example.com/uploads/photo.png',
      'https://s3.amazonaws.com/bucket/image.png',
      '',
      '   ',
      null,
      undefined,
      12345,
      'Normal text without url',
    ];

    for (const url of invalidUrls) {
      assert.equal(isZohoFileUrl(url), false, `Expected invalid Zoho URL: ${url}`);
    }
  });

  test('extractZohoUrls extracts URLs from strings, arrays, objects, JSON strings, and subforms', () => {
    const sampleRecord = {
      ID: '4662244000015255257',
      Photo: '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=receiver_sig.png',
      Image_List: [
        '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=photo1.png',
        '/uploads/already_local.png',
      ],
      Video_Upload_Json: JSON.stringify([
        '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=video1.mp4',
      ]),
      SubForm: [
        {
          ID: '1',
          Attachment_of_Photo: '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=subform_img.jpg',
        },
      ],
      Unrelated_Field: 'Just some text',
    };

    const extracted = extractZohoUrls(sampleRecord);
    assert.equal(extracted.length, 4);
    assert.ok(extracted.some((u) => u.includes('receiver_sig.png')));
    assert.ok(extracted.some((u) => u.includes('photo1.png')));
    assert.ok(extracted.some((u) => u.includes('video1.mp4')));
    assert.ok(extracted.some((u) => u.includes('subform_img.jpg')));
    assert.ok(!extracted.some((u) => u.includes('already_local.png')));
  });
});

describe('Filename Extraction and Sanitization', () => {
  test('extractFilenameFromUrl extracts from filepath query parameter', () => {
    const url = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=1788841191493932_receiver_signature.png';
    const filename = extractFilenameFromUrl(url);
    assert.equal(filename, '4662244000015255257_1788841191493932_receiver_signature.png');
  });

  test('extractFilenameFromUrl decodes URL-encoded filenames', () => {
    const url = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000014006048/Photo/download?filepath=Screenshot%202026-06-04%20105803.png';
    const filename = extractFilenameFromUrl(url);
    assert.equal(filename, '4662244000014006048_Screenshot_2026-06-04_105803.png');
  });

  test('extractFilenameFromUrl falls back to record ID and field name when filepath missing', () => {
    const url = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download';
    const filename = extractFilenameFromUrl(url);
    assert.equal(filename, '4662244000015255257_Photo');
  });

  test('sanitizeFilename prevents directory traversal and illegal characters', () => {
    assert.equal(sanitizeFilename('../../../secret/passwords.txt'), 'passwords.txt');
    assert.equal(sanitizeFilename('bad_filename:with:colons*and?marks.png'), 'bad_filename_with_colons_and_marks.png');
    assert.equal(sanitizeFilename('path/to\\sub/folder\\my_file.jpg'), 'my_file.jpg');
    assert.equal(sanitizeFilename('   spaces   around.pdf  '), 'spaces_around.pdf');
  });

  test('resolveZohoUrl properly maps relative Zoho URLs to API domain', () => {
    const relUrl = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/123/Photo/download?filepath=photo.jpg';
    const resolved = resolveZohoUrl(relUrl, {
      apiDomain: 'https://www.zohoapis.com',
      owner: 'homecartel',
      app: 'supply-chain-app',
    });
    assert.equal(
      resolved,
      'https://www.zohoapis.com/creator/v2.1/data/homecartel/supply-chain-app/report/All_Evidence_Photos/123/Photo/download?filepath=photo.jpg'
    );
  });
});

describe('URL Replacement Logic', () => {
  test('replaceZohoUrlsInValue updates single string, array, and JSON values', () => {
    const urlA = '/api/v2.1/homecartel/supply-chain-app/report/All/1/Photo/download?filepath=a.jpg';
    const urlB = '/api/v2.1/homecartel/supply-chain-app/report/All/2/Photo/download?filepath=b.png';
    const mapping = {
      [urlA]: '/uploads/a.jpg',
      [urlB]: '/uploads/b.png',
    };

    assert.equal(replaceZohoUrlsInValue(urlA, mapping), '/uploads/a.jpg');
    assert.deepEqual(replaceZohoUrlsInValue([urlA, urlB], mapping), ['/uploads/a.jpg', '/uploads/b.png']);

    const jsonInput = JSON.stringify([urlA, urlB]);
    const jsonOutput = replaceZohoUrlsInValue(jsonInput, mapping);
    assert.deepEqual(JSON.parse(jsonOutput), ['/uploads/a.jpg', '/uploads/b.png']);

    const gridInput = [
      { ID: '10', Image: urlA, Status: 'OK' },
      { ID: '11', Image: urlB, Status: 'Pending' },
    ];
    const gridOutput = replaceZohoUrlsInValue(gridInput, mapping);
    assert.equal(gridOutput[0].Image, '/uploads/a.jpg');
    assert.equal(gridOutput[1].Image, '/uploads/b.png');
    assert.equal(gridOutput[0].Status, 'OK');
  });
});

describe('Download Simulation and Retry Logic', () => {
  test('downloads and saves file when fetch succeeds', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'downloads-success');
    const mockFileContent = Buffer.from('fake-image-binary-data');

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/png']]),
      arrayBuffer: async () => mockFileContent,
    });

    const zohoUrl = '/api/v2.1/homecartel/supply-chain-app/report/All/123/Photo/download?filepath=test_sig.png';
    const result = await downloadZohoMedia(zohoUrl, outDir, { fetchFn: mockFetch });

    assert.equal(result.success, true);
    assert.equal(result.localPath, '/uploads/123_test_sig.png');
    assert.ok(fs.existsSync(result.targetPath));
    assert.equal(fs.readFileSync(result.targetPath).toString(), 'fake-image-binary-data');
  });

  test('honors dry-run mode: does not write to disk or call fetch', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'dry-run');
    let fetchCalled = false;

    const mockFetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200 };
    };

    const zohoUrl = '/api/v2.1/homecartel/supply-chain-app/report/All/123/Photo/download?filepath=dry_run.png';
    const result = await downloadZohoMedia(zohoUrl, outDir, { fetchFn: mockFetch, dryRun: true });

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.localPath, '/uploads/123_dry_run.png');
    assert.equal(fetchCalled, false, 'Fetch must not be called during dry run');
    assert.equal(fs.existsSync(result.targetPath), false, 'File must not be created during dry run');
  });

  test('skips download if file already exists locally and force is false', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'cached-downloads');
    fs.mkdirSync(outDir, { recursive: true });
    const existingFile = path.join(outDir, '123_cached.jpg');
    fs.writeFileSync(existingFile, 'existing-data');

    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200 };
    };

    const zohoUrl = '/api/v2.1/homecartel/supply-chain-app/report/All/123/Photo/download?filepath=cached.jpg';
    const result = await downloadZohoMedia(zohoUrl, outDir, { fetchFn: mockFetch, force: false });

    assert.equal(result.success, true);
    assert.equal(result.cached, true);
    assert.equal(fetchCalled, false, 'Fetch should be skipped when file already exists');
  });

  test('retries on rate-limit (429) and transient server errors (500)', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'retry-test');
    fs.rmSync(outDir, { recursive: true, force: true });
    let attempts = 0;

    const mockFetch = async () => {
      attempts++;
      if (attempts === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Map([['retry-after', '0.05']]),
        };
      }
      if (attempts === 2) {
        return {
          ok: false,
          status: 500,
          headers: new Map(),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => Buffer.from('recovered-image'),
      };
    };

    const zohoUrl = '/api/v2.1/homecartel/supply-chain-app/report/All/123/Photo/download?filepath=retry.jpg';
    const result = await downloadZohoMedia(zohoUrl, outDir, { fetchFn: mockFetch, maxRetries: 3 });

    assert.equal(result.success, true);
    assert.equal(attempts, 3, 'Should succeed on the third attempt after retrying 429 and 500');
    assert.equal(fs.readFileSync(result.targetPath).toString(), 'recovered-image');
  });

  test('invalidates token on 401 response and retries', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'auth-retry-test');
    fs.rmSync(outDir, { recursive: true, force: true });
    let attempts = 0;
    let tokenInvalidated = false;

    const mockFetch = async () => {
      attempts++;
      if (attempts === 1) {
        return {
          ok: false,
          status: 401,
          headers: new Map(),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/png']]),
        arrayBuffer: async () => Buffer.from('authed-image'),
      };
    };

    const zohoUrl = '/api/v2.1/homecartel/supply-chain-app/report/All/123/Photo/download?filepath=auth_test.png';
    const result = await downloadZohoMedia(zohoUrl, outDir, {
      fetchFn: mockFetch,
      maxRetries: 2,
      invalidateToken: () => { tokenInvalidated = true; },
    });

    assert.equal(result.success, true);
    assert.equal(tokenInvalidated, true, 'invalidateToken should have been triggered');
    assert.equal(attempts, 2);
  });

  test('rate limiter throttles parallel requests properly', async () => {
    const limiter = createLimiter(2, 50);
    const start = Date.now();
    let currentActive = 0;
    let maxActive = 0;

    const task = async () => {
      currentActive++;
      maxActive = Math.max(maxActive, currentActive);
      await new Promise((r) => setTimeout(r, 40));
      currentActive--;
    };

    await Promise.all([limiter(task), limiter(task), limiter(task), limiter(task)]);
    assert.ok(maxActive <= 2, `Max concurrency exceeded: ${maxActive}`);
    assert.ok(Date.now() - start >= 80, 'Throttling delay should have been enforced');
  });
});

describe('Database Record Update Logic (SQLite)', () => {
  test('migrates records in SQLite: downloads files and updates column with /uploads/ path', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'sqlite-uploads');
    fs.rmSync(outDir, { recursive: true, force: true });
    const dbPath = path.join(TEST_TMP_DIR, 'test-sqlite.db');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const db = new DatabaseSync(dbPath);

    db.exec(`
      CREATE TABLE "Evidence_Photos" (
        "ID" INTEGER PRIMARY KEY,
        "Source_Form" TEXT,
        "Photo" TEXT
      );
      CREATE TABLE "Field_Work" (
        "ID" INTEGER PRIMARY KEY,
        "Status" TEXT,
        "Image" TEXT,
        "Video" TEXT
      );
    `);

    const remoteUrl1 = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/101/Photo/download?filepath=sig.png';
    const remoteUrl2 = '/api/v2.1/homecartel/supply-chain-app/report/All_Field_Work/202/Image/download?filepath=work.jpg';

    db.prepare('INSERT INTO "Evidence_Photos" ("ID", "Source_Form", "Photo") VALUES (?, ?, ?)').run(101, 'Field_Work', remoteUrl1);
    db.prepare('INSERT INTO "Field_Work" ("ID", "Status", "Image", "Video") VALUES (?, ?, ?, ?)').run(
      202,
      'Started',
      remoteUrl2,
      JSON.stringify(['/uploads/already_local.mp4'])
    );

    const mockFetch = async (url) => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/png']]),
      arrayBuffer: async () => Buffer.from(`data-for-${path.basename(url)}`),
    });

    const summary = await migrateSqliteDb(db, {
      forms: ['Evidence_Photos', 'Field_Work'],
      outDir,
      fetchFn: mockFetch,
    });

    assert.equal(summary.formsScanned, 2);
    assert.equal(summary.recordsScanned, 2);
    assert.equal(summary.filesMigrated, 2);
    assert.equal(summary.recordsUpdated, 2);

    const row1 = db.prepare('SELECT * FROM "Evidence_Photos" WHERE "ID" = 101').get();
    assert.equal(row1.Photo, '/uploads/101_sig.png');
    assert.ok(fs.existsSync(path.join(outDir, '101_sig.png')));

    const row2 = db.prepare('SELECT * FROM "Field_Work" WHERE "ID" = 202').get();
    assert.equal(row2.Image, '/uploads/202_work.jpg');
    assert.equal(row2.Video, JSON.stringify(['/uploads/already_local.mp4']));
    assert.ok(fs.existsSync(path.join(outDir, '202_work.jpg')));
  });
});

describe('Database Record Update Logic (Postgres / PGlite)', () => {
  test('migrates records in Postgres/PGlite: updates columns with /uploads/ path', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'pg-uploads');
    const db = new PGlite();

    await db.query(`
      CREATE TABLE "Evidence_Photos" (
        "ID" BIGINT PRIMARY KEY,
        "Source_Form" TEXT,
        "Photo" TEXT
      );
    `);

    const remoteUrl = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/4662244000015255257/Photo/download?filepath=evidence.png';
    await db.query('INSERT INTO "Evidence_Photos" ("ID", "Source_Form", "Photo") VALUES ($1::bigint, $2, $3)', [
      '4662244000015255257',
      'Field_Work',
      remoteUrl,
    ]);

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/png']]),
      arrayBuffer: async () => Buffer.from('pglite-evidence-data'),
    });

    const summary = await migratePgDb(db, {
      forms: ['Evidence_Photos'],
      outDir,
      fetchFn: mockFetch,
    });

    assert.equal(summary.recordsUpdated, 1);
    assert.equal(summary.filesMigrated, 1);

    const { rows } = await db.query('SELECT * FROM "Evidence_Photos" WHERE "ID" = $1::bigint', ['4662244000015255257']);
    assert.equal(rows[0].Photo, '/uploads/4662244000015255257_evidence.png');
    assert.ok(fs.existsSync(path.join(outDir, '4662244000015255257_evidence.png')));
  });
});

describe('Backup JSON Directory Migration', () => {
  test('migrates backup JSON files: downloads files and rewrites JSON files with local paths', async () => {
    const backupDir = path.join(TEST_TMP_DIR, 'sample-backup');
    const outDir = path.join(TEST_TMP_DIR, 'backup-uploads');
    fs.mkdirSync(backupDir, { recursive: true });

    const remoteUrl = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/999/Photo/download?filepath=backup_photo.jpg';
    const sampleRows = [
      {
        ID: '999',
        Source_Form: 'Field_Work',
        Photo: remoteUrl,
      },
    ];
    fs.writeFileSync(path.join(backupDir, 'Evidence_Photos.json'), JSON.stringify(sampleRows, null, 2));

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: async () => Buffer.from('backup-photo-data'),
    });

    const summary = await migrateBackupDir(backupDir, {
      forms: ['Evidence_Photos'],
      outDir,
      fetchFn: mockFetch,
    });

    assert.equal(summary.recordsUpdated, 1);
    assert.equal(summary.filesMigrated, 1);

    const updatedRows = JSON.parse(fs.readFileSync(path.join(backupDir, 'Evidence_Photos.json'), 'utf8'));
    assert.equal(updatedRows[0].Photo, '/uploads/999_backup_photo.jpg');
    assert.ok(fs.existsSync(path.join(outDir, '999_backup_photo.jpg')));
  });
});

describe('Failed downloads and dry runs are reported honestly', () => {
  const remoteUrl = '/api/v2.1/homecartel/supply-chain-app/report/All_Evidence_Photos/555/Photo/download?filepath=lost.jpg';
  const setup = (name) => {
    const backupDir = path.join(TEST_TMP_DIR, name);
    const outDir = path.join(TEST_TMP_DIR, `${name}-uploads`);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'Evidence_Photos.json'), JSON.stringify([{ ID: '555', Source_Form: 'Field_Work', Photo: remoteUrl }], null, 2));
    return { backupDir, outDir };
  };
  const readRow = (backupDir) => JSON.parse(fs.readFileSync(path.join(backupDir, 'Evidence_Photos.json'), 'utf8'))[0];

  test('a download that fails is counted as an error and the record keeps its Zoho URL', async () => {
    const { backupDir, outDir } = setup('failed-download');
    const notFound = async () => ({ ok: false, status: 404, statusText: 'Not Found', headers: new Map(), text: async () => 'Remote asset not found' });
    const summary = await migrateBackupDir(backupDir, { forms: ['Evidence_Photos'], outDir, fetchFn: notFound, maxRetries: 1, log: () => {} });
    assert.equal(summary.errors, 1, 'the failed file is an error, so the CLI exits with 1 instead of saying all went well');
    assert.equal(summary.filesMigrated, 0);
    assert.equal(summary.recordsUpdated, 0);
    assert.equal(readRow(backupDir).Photo, remoteUrl, 'the old URL is kept, nothing is lost');
  });

  test('a dry run says so, counts what it would do apart, and writes nothing', async () => {
    const { backupDir, outDir } = setup('dry-run-summary');
    let fetched = 0;
    const neverCalled = async () => { fetched += 1; throw new Error('a dry run must not download'); };
    const summary = await migrateBackupDir(backupDir, { forms: ['Evidence_Photos'], outDir, fetchFn: neverCalled, dryRun: true, log: () => {} });
    assert.equal(summary.dryRun, true);
    assert.equal(summary.filesToMigrate, 1);
    assert.equal(summary.recordsToUpdate, 1);
    assert.equal(summary.filesMigrated, 0, 'nothing was migrated');
    assert.equal(summary.recordsUpdated, 0, 'nothing was updated');
    assert.equal(summary.errors, 0);
    assert.equal(fetched, 0);
    assert.equal(readRow(backupDir).Photo, remoteUrl);
    assert.ok(!fs.existsSync(outDir) || fs.readdirSync(outDir).length === 0, 'no file was written');
  });
});

describe('Newly Added Delivery Management Forms', () => {
  test('includes Fuel_Entries, Service_Entries, Exception_Control_Media, and Pick_Up_Request_Form in DELIVERY_FORMS_WITH_MEDIA', () => {
    assert.ok(DELIVERY_FORMS_WITH_MEDIA['Fuel_Entries'], 'Fuel_Entries must be present');
    assert.deepEqual(DELIVERY_FORMS_WITH_MEDIA['Fuel_Entries'], ['Invoice_Receipt']);

    assert.ok(DELIVERY_FORMS_WITH_MEDIA['Service_Entries'], 'Service_Entries must be present');
    assert.deepEqual(DELIVERY_FORMS_WITH_MEDIA['Service_Entries'], ['Invoice_Receipt']);

    assert.ok(DELIVERY_FORMS_WITH_MEDIA['Exception_Control_Media'], 'Exception_Control_Media must be present');
    assert.deepEqual(DELIVERY_FORMS_WITH_MEDIA['Exception_Control_Media'], ['Media']);

    assert.ok(DELIVERY_FORMS_WITH_MEDIA['Pick_Up_Request_Form'], 'Pick_Up_Request_Form must be present');
    assert.deepEqual(DELIVERY_FORMS_WITH_MEDIA['Pick_Up_Request_Form'], [
      'Official_Receipt',
      'Receiver_s_Signature',
      'Dispatcher_s_Signature',
      'Proof_of_Receiving_the_Item',
    ]);

    assert.equal(Object.keys(DELIVERY_FORMS_WITH_MEDIA).length, 13);
  });
});

describe('--limit Option Behavior Across Backends', () => {
  test('migrateSqliteDb respects limit parameter by scanning and updating at most N records', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'sqlite-limit');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE "Items" ("ID" INTEGER PRIMARY KEY, "Image" TEXT)`);
    for (let i = 1; i <= 5; i++) {
      db.prepare(`INSERT INTO "Items" VALUES (?, ?)`).run(
        i,
        `/api/v2.1/homecartel/supply-chain-app/report/All/10${i}/Photo/download?filepath=img_${i}.jpg`
      );
    }

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: async () => Buffer.from('img-bytes'),
    });

    const summary = await migrateSqliteDb(db, { forms: ['Items'], limit: 2, outDir, fetchFn: mockFetch });
    assert.equal(summary.recordsScanned, 2);
    assert.equal(summary.recordsUpdated, 2);

    const rows = db.prepare('SELECT * FROM "Items" ORDER BY "ID"').all();
    assert.ok(rows[0].Image.startsWith('/uploads/'));
    assert.ok(rows[1].Image.startsWith('/uploads/'));
    assert.ok(rows[2].Image.startsWith('/api/v2.1/'));
    assert.ok(rows[3].Image.startsWith('/api/v2.1/'));
    assert.ok(rows[4].Image.startsWith('/api/v2.1/'));
  });

  test('migratePgDb respects limit parameter by scanning and updating at most N records', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'pg-limit');
    const db = new PGlite();
    await db.query(`CREATE TABLE "Items" ("ID" BIGINT PRIMARY KEY, "Image" TEXT)`);
    for (let i = 1; i <= 4; i++) {
      await db.query(`INSERT INTO "Items" VALUES ($1::bigint, $2)`, [
        String(i),
        `/api/v2.1/homecartel/supply-chain-app/report/All/20${i}/Photo/download?filepath=img_${i}.jpg`,
      ]);
    }

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: async () => Buffer.from('img-bytes'),
    });

    const summary = await migratePgDb(db, { forms: ['Items'], limit: 2, outDir, fetchFn: mockFetch });
    assert.equal(summary.recordsScanned, 2);
    assert.equal(summary.recordsUpdated, 2);

    const { rows } = await db.query('SELECT * FROM "Items" ORDER BY "ID"');
    assert.ok(rows[0].Image.startsWith('/uploads/'));
    assert.ok(rows[1].Image.startsWith('/uploads/'));
    assert.ok(rows[2].Image.startsWith('/api/v2.1/'));
    assert.ok(rows[3].Image.startsWith('/api/v2.1/'));
  });

  test('migrateBackupDir respects limit parameter and preserves unvisited records without data loss', async () => {
    const backupDir = path.join(TEST_TMP_DIR, 'backup-limit');
    const outDir = path.join(TEST_TMP_DIR, 'backup-limit-uploads');
    fs.mkdirSync(backupDir, { recursive: true });

    const records = [1, 2, 3, 4].map((i) => ({
      ID: String(i),
      Photo: `/api/v2.1/homecartel/supply-chain-app/report/All/30${i}/Photo/download?filepath=file_${i}.png`,
    }));
    fs.writeFileSync(path.join(backupDir, 'Items.json'), JSON.stringify(records, null, 2));

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/png']]),
      arrayBuffer: async () => Buffer.from('png-bytes'),
    });

    const summary = await migrateBackupDir(backupDir, { forms: ['Items'], limit: 2, outDir, fetchFn: mockFetch });
    assert.equal(summary.recordsScanned, 2);
    assert.equal(summary.recordsUpdated, 2);

    const updated = JSON.parse(fs.readFileSync(path.join(backupDir, 'Items.json'), 'utf8'));
    assert.equal(updated.length, 4, 'Backup file must retain all 4 records');
    assert.ok(updated[0].Photo.startsWith('/uploads/'));
    assert.ok(updated[1].Photo.startsWith('/uploads/'));
    assert.ok(updated[2].Photo.startsWith('/api/v2.1/'), 'Record 3 must remain untouched');
    assert.ok(updated[3].Photo.startsWith('/api/v2.1/'), 'Record 4 must remain untouched');
  });
});

describe('SQLite Transaction Handling and Error Rollback', () => {
  test('wraps updates in a transaction committing changes when all records succeed', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'sqlite-tx-commit');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE "Evidence_Photos" ("ID" INTEGER PRIMARY KEY, "Photo" TEXT)`);
    db.prepare(`INSERT INTO "Evidence_Photos" VALUES (?, ?)`).run(1, '/api/v2.1/homecartel/supply-chain-app/report/All/101/Photo/download?filepath=a.jpg');
    db.prepare(`INSERT INTO "Evidence_Photos" VALUES (?, ?)`).run(2, '/api/v2.1/homecartel/supply-chain-app/report/All/102/Photo/download?filepath=b.jpg');

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: async () => Buffer.from('img-data'),
    });

    const summary = await migrateSqliteDb(db, { forms: ['Evidence_Photos'], outDir, fetchFn: mockFetch });
    assert.equal(summary.recordsUpdated, 2);

    const rows = db.prepare('SELECT * FROM "Evidence_Photos" ORDER BY "ID"').all();
    assert.ok(rows[0].Photo.startsWith('/uploads/'));
    assert.ok(rows[1].Photo.startsWith('/uploads/'));
  });

  test('rolls back pending updates for a table when an update fails mid-migration', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'sqlite-tx-rollback');
    const db = new DatabaseSync(':memory:');
    // CHECK constraint that fails when row 2 attempts to write its updated value (/uploads/...fail_trigger...)
    db.exec(`
      CREATE TABLE "Evidence_Photos" (
        "ID" INTEGER PRIMARY KEY,
        "Photo" TEXT,
        CHECK ("Photo" NOT LIKE '%/uploads/%fail_trigger%')
      );
    `);

    const url1 = '/api/v2.1/homecartel/supply-chain-app/report/All/101/Photo/download?filepath=ok.jpg';
    const url2 = '/api/v2.1/homecartel/supply-chain-app/report/All/102/Photo/download?filepath=fail_trigger.jpg';
    db.prepare(`INSERT INTO "Evidence_Photos" VALUES (?, ?)`).run(1, url1);
    db.prepare(`INSERT INTO "Evidence_Photos" VALUES (?, ?)`).run(2, url2);

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: async () => Buffer.from('img-data'),
    });

    await assert.rejects(
      async () => {
        await migrateSqliteDb(db, { forms: ['Evidence_Photos'], outDir, fetchFn: mockFetch });
      },
      /CHECK constraint failed/
    );

    // Verify row 1 was rolled back to original remote URL
    const rows = db.prepare('SELECT * FROM "Evidence_Photos" ORDER BY "ID"').all();
    assert.equal(rows[0].Photo, url1, 'Row 1 update must be rolled back on error');
    assert.equal(rows[1].Photo, url2, 'Row 2 update must remain original value');
  });
});

describe('Filename Collision Prevention and URL Deduplication', () => {
  test('prevents collisions when different records reference identical generic filenames', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'collision-prevention');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE "Field_Work" ("ID" INTEGER PRIMARY KEY, "Receiver_s_Signature" TEXT)`);

    const urlRecord1 = '/api/v2.1/homecartel/supply-chain-app/report/All_Field_Work/1001/Receiver_s_Signature/download?filepath=signature.png';
    const urlRecord2 = '/api/v2.1/homecartel/supply-chain-app/report/All_Field_Work/2002/Receiver_s_Signature/download?filepath=signature.png';

    db.prepare(`INSERT INTO "Field_Work" VALUES (?, ?)`).run(1001, urlRecord1);
    db.prepare(`INSERT INTO "Field_Work" VALUES (?, ?)`).run(2002, urlRecord2);

    const downloadedContents = new Map();
    const mockFetch = async (url) => {
      const isRec1 = url.includes('1001');
      const content = Buffer.from(isRec1 ? 'SIGNATURE_CONTENT_1001' : 'SIGNATURE_CONTENT_2002');
      downloadedContents.set(url, content.toString());
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/png']]),
        arrayBuffer: async () => content,
      };
    };

    const summary = await migrateSqliteDb(db, { forms: ['Field_Work'], outDir, fetchFn: mockFetch });
    assert.equal(summary.recordsUpdated, 2);
    assert.equal(summary.filesMigrated, 2);

    const row1 = db.prepare('SELECT * FROM "Field_Work" WHERE "ID" = 1001').get();
    const row2 = db.prepare('SELECT * FROM "Field_Work" WHERE "ID" = 2002').get();

    // The two paths must be distinct
    assert.notEqual(row1.Receiver_s_Signature, row2.Receiver_s_Signature);
    assert.ok(row1.Receiver_s_Signature.includes('1001'));
    assert.ok(row2.Receiver_s_Signature.includes('2002'));

    // Verify both files exist on disk with independent contents
    const file1Name = row1.Receiver_s_Signature.replace('/uploads/', '');
    const file2Name = row2.Receiver_s_Signature.replace('/uploads/', '');
    assert.equal(fs.readFileSync(path.join(outDir, file1Name)).toString(), 'SIGNATURE_CONTENT_1001');
    assert.equal(fs.readFileSync(path.join(outDir, file2Name)).toString(), 'SIGNATURE_CONTENT_2002');
  });

  test('deduplicates identical URLs across records using urlCache without re-downloading', async () => {
    const outDir = path.join(TEST_TMP_DIR, 'dedup-cache');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE "Evidence_Photos" ("ID" INTEGER PRIMARY KEY, "Photo" TEXT)`);

    const sharedUrl = '/api/v2.1/homecartel/supply-chain-app/report/All/999/Photo/download?filepath=shared_logo.png';
    db.prepare(`INSERT INTO "Evidence_Photos" VALUES (?, ?)`).run(1, sharedUrl);
    db.prepare(`INSERT INTO "Evidence_Photos" VALUES (?, ?)`).run(2, sharedUrl);

    let fetchCalls = 0;
    const mockFetch = async () => {
      fetchCalls++;
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/png']]),
        arrayBuffer: async () => Buffer.from('shared-data'),
      };
    };

    const summary = await migrateSqliteDb(db, { forms: ['Evidence_Photos'], outDir, fetchFn: mockFetch });
    assert.equal(summary.recordsUpdated, 2);
    assert.equal(summary.filesMigrated, 2);
    assert.equal(fetchCalls, 1, 'Exact-URL must be downloaded only once via urlCache');

    const rows = db.prepare('SELECT * FROM "Evidence_Photos" ORDER BY "ID"').all();
    assert.equal(rows[0].Photo, rows[1].Photo, 'Both records should map to the same local file path');
  });
});
