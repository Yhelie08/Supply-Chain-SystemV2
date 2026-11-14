// tools/migrate-zoho-files.mjs
// Files & Media Migration Tool:
// Inspects database records or backup JSON files for remote Zoho file URLs,
// downloads them to DATA_DIR/uploads/ with throttling and retry logic,
// and replaces the remote URLs with local relative paths: /uploads/<filename>.
//
// Usage:
//   node --env-file-if-exists=.env tools/migrate-zoho-files.mjs [options]
//
// Options:
//   --dry-run              Inspect and report what would be downloaded/updated without making changes
//   --backend=auto|sqlite|pg|backup
//                          Target backend (default: auto; uses BACKEND env or SQLite)
//   --backup-dir=<dir>     Path to backup directory if --backend=backup
//   --forms=A,B,C          Comma-separated form names to migrate (default: 13 Delivery Management forms)
//   --limit=<n>            Stop processing after scanning <n> records total
//   --all                  Migrate all forms found in the database/backup
//   --out-dir=<dir>        Local target directory for downloads (default: DATA_DIR/uploads)
//   --concurrency=<n>      Maximum parallel downloads (default: 3)
//   --delay=<ms>           Delay in ms between requests (default: 100)
//   --max-retries=<n>      Maximum download retries on transient errors (default: 3)
//   --force                Re-download files even if already present locally
//   --verbose              Detailed logging per field and file

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
export const DEFAULT_UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// The 13 Delivery Management forms with media/file upload fields
export const DELIVERY_FORMS_WITH_MEDIA = {
  Field_Work: [
    'Package_Order',
    'Shipment_Order',
    'SubForm',
    'Upload_PDf_of_Initial_Report',
    'Receiver_s_Signature',
    'Assignee_Signature',
    'Image',
    'Video',
    'Receiver_s_Signature_Upload',
    'Video_and_Status_of_Installed_Item',
  ],
  Service_Appointment_Form: [
    'Shipment_Order',
    'Shipment_Order_File',
    'Logistic_Notes1',
  ],
  Field_Service_Site_Visit_Form: [
    'Layout_Photo',
    'Surface_Condition_Photo',
    'Ceiling_Photo_if_possible',
    'Client_Representative_Signature',
    'Signature',
  ],
  Sales_Returns_Form: [
    'Image',
    'Video',
    'Signature',
  ],
  Daily_Checklist_for_Vehicle: [
    'Odometer_Photo_Upload',
    'Checker_s_Signature',
  ],
  Dispatch_Checklist: [
    'Signature_Dispatcher',
  ],
  Evidence_Photos: [
    'Photo',
  ],
  Site_Visit_Photos: [
    'Photo',
  ],
  Exception_Control1: [
    'Signature',
    'Image_max_10_JPG_JPEG_PNG',
    'Video_Upload_max_3_min_30_sec',
  ],
  Fuel_Entries: [
    'Invoice_Receipt',
  ],
  Service_Entries: [
    'Invoice_Receipt',
  ],
  Exception_Control_Media: [
    'Media',
  ],
  Pick_Up_Request_Form: [
    'Official_Receipt',
    'Receiver_s_Signature',
    'Dispatcher_s_Signature',
    'Proof_of_Receiving_the_Item',
  ],
};

export const DEFAULT_FORMS = Object.keys(DELIVERY_FORMS_WITH_MEDIA);

// MIME type to extension fallback
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'application/pdf': '.pdf',
  'application/json': '.json',
};

/**
 * Checks whether a given string is a Zoho file download URL.
 */
export function isZohoFileUrl(str) {
  if (typeof str !== 'string' || !str.trim()) return false;
  const s = str.trim();
  // Already converted to local /uploads/
  if (s.startsWith('/uploads/') || s.startsWith('uploads/')) return false;

  // Relative Zoho download endpoint: /api/v2.1/... or /api/v2/... or /creator/v2.1/data/...
  if (/^\/(?:api\/v2(?:\.1)?|creator\/v2\.1\/data)\/[^\s"'<>]+\/download(?:\?[^\s"'<>]*)?$/i.test(s)) {
    return true;
  }

  // Absolute Zoho download URL
  if (/^https?:\/\/[^\s"'<>]*(?:zoho\.com|zohoapis\.com)\/(?:(?:api\/v2(?:\.1)?|creator\/v2\.1\/data)\/[^\s"'<>]+\/download|\S*filepath=|\S*\/download(?:\?[^\s"'<>]*)?)/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Deep-scans an arbitrary value (string, array, or object) and extracts all Zoho file URLs.
 * Returns an array of unique Zoho file URLs found.
 */
export function extractZohoUrls(val) {
  const found = new Set();
  function walk(item) {
    if (item == null) return;
    if (typeof item === 'string') {
      const s = item.trim();
      if (isZohoFileUrl(s)) {
        found.add(s);
        return;
      }
      // Check if it's a JSON string representing an array or object
      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        try {
          walk(JSON.parse(s));
          return;
        } catch {
          // not valid JSON, proceed
        }
      }
      // Check for Zoho URL regex within longer text
      const regex = /(?:https?:\/\/[^\s"'<>]*zoho(?:apis)?\.com[^\s"'<>]*\/download(?:\?[^\s"'<>]*)?|\/(?:api\/v2(?:\.1)?|creator\/v2\.1\/data)\/[^\s"'<>]+\/download(?:\?[^\s"'<>]*)?)/gi;
      let m;
      while ((m = regex.exec(s)) !== null) {
        if (isZohoFileUrl(m[0])) {
          found.add(m[0]);
        }
      }
    } else if (Array.isArray(item)) {
      for (const elem of item) walk(elem);
    } else if (typeof item === 'object') {
      for (const v of Object.values(item)) walk(v);
    }
  }
  walk(val);
  return Array.from(found);
}

/**
 * Sanitizes a filename to make it safe for filesystems and web URLs.
 */
export function sanitizeFilename(name, defaultExt = '') {
  if (!name || typeof name !== 'string') return `file_${Date.now()}${defaultExt}`;
  // Safely take the last path segment across Unix and Windows slashes
  const lastSeg = name.trim().split(/[/\\]+/).pop() || '';
  let clean = lastSeg.replace(/[^\w.-]+/g, '_'); // replace spaces and special characters with underscore
  clean = clean.replace(/^_+|_+$/g, ''); // strip leading/trailing underscores
  if (!clean || clean === '.') clean = `file_${Date.now()}`;
  if (!path.extname(clean) && defaultExt) {
    clean += defaultExt.startsWith('.') ? defaultExt : `.${defaultExt}`;
  }
  return clean;
}

/**
 * Extracts a sensible local filename from a Zoho download URL.
 * Prefers the `filepath` query parameter if present.
 */
export function extractFilenameFromUrl(urlStr, { defaultBase = 'zoho_file', contentType = null } = {}) {
  let filename = '';
  let recordId = null;
  try {
    const parsed = new URL(urlStr, 'https://dummy.zoho.com');
    const segs = parsed.pathname.split('/').filter(Boolean);
    const downloadIdx = segs.indexOf('download');
    if (downloadIdx > 1) {
      recordId = segs[downloadIdx - 2];
    }
    const filepathParam = parsed.searchParams.get('filepath');
    if (filepathParam) {
      filename = decodeURIComponent(filepathParam);
    } else if (downloadIdx > 1) {
      const fieldName = segs[downloadIdx - 1];
      filename = `${recordId}_${fieldName}`;
    } else {
      const last = segs[segs.length - 1];
      if (last && last !== 'download') filename = last;
    }
  } catch {
    // If URL parsing fails, extract filepath= regex directly
    const m = /[?&]filepath=([^&]+)/i.exec(urlStr);
    if (m) {
      try { filename = decodeURIComponent(m[1]); } catch { filename = m[1]; }
    }
  }

  if (!filename) filename = defaultBase;

  // Prefix filename to guarantee uniqueness across records and URLs
  if (recordId) {
    if (!filename.startsWith(`${recordId}_`)) {
      filename = `${recordId}_${filename}`;
    }
  } else if (urlStr) {
    const hash = crypto.createHash('sha256').update(String(urlStr)).digest('hex').slice(0, 8);
    if (!filename.startsWith(`${hash}_`)) {
      filename = `${hash}_${filename}`;
    }
  }

  const defaultExt = contentType && MIME_EXT[contentType.toLowerCase()] ? MIME_EXT[contentType.toLowerCase()] : '';
  const sanitized = sanitizeFilename(filename, defaultExt);
  return sanitized;
}

/**
 * Resolves a relative or absolute Zoho download URL into a fully-qualified Zoho API download URL.
 */
export function resolveZohoUrl(urlStr, config = {}) {
  const apiDomain = config.apiDomain || process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  const owner = config.owner || process.env.ZOHO_OWNER || 'homecartel';
  const app = config.app || process.env.ZOHO_APP || 'supply-chain-app';

  let u = urlStr.trim();
  // Relative /api/v2.1/<owner>/<app>/... -> https://www.zohoapis.com/creator/v2.1/data/<owner>/<app>/...
  if (u.startsWith('/api/v2.1/') || u.startsWith('/api/v2/')) {
    u = u.replace(/^\/api\/v2(?:\.1)?\/[^\/]+\/[^\/]+/, `${apiDomain}/creator/v2.1/data/${owner}/${app}`);
  } else if (u.startsWith('/creator/v2.1/data/')) {
    u = `${apiDomain}${u}`;
  } else if (u.startsWith('https://creator.zoho.com/api/v2.1/') || u.startsWith('https://creatorapp.zoho.com/api/v2.1/')) {
    u = u.replace(/^https?:\/\/[^\/]+\/api\/v2(?:\.1)?\/[^\/]+\/[^\/]+/, `${apiDomain}/creator/v2.1/data/${owner}/${app}`);
  }
  return u;
}

/**
 * Creates a concurrency-limited execution queue with minimum delay between requests.
 */
export function createLimiter(concurrency = 3, minDelayMs = 100) {
  let active = 0;
  const queue = [];
  let lastRequestTime = 0;

  function runNext() {
    if (queue.length === 0 || active >= concurrency) return;
    const now = Date.now();
    const wait = Math.max(0, lastRequestTime + minDelayMs - now);

    setTimeout(() => {
      if (queue.length === 0 || active >= concurrency) return;
      const { fn, resolve, reject } = queue.shift();
      active++;
      lastRequestTime = Date.now();
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          active--;
          runNext();
        });
    }, wait);
  }

  return function enqueue(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
  };
}

/**
 * Downloads a media file with retry logic (handling rate limits, 5xx errors, token refresh)
 * and saves it to outDir/<filename>.
 */
export async function downloadZohoMedia(zohoUrl, outDir, options = {}) {
  const {
    fetchFn = globalThis.fetch,
    maxRetries = 3,
    dryRun = false,
    force = false,
    getAccessToken = null,
    invalidateToken = null,
    config = {},
    log = console.log,
  } = options;

  fs.mkdirSync(outDir, { recursive: true });

  const resolvedUrl = resolveZohoUrl(zohoUrl, config);
  let localFilename = extractFilenameFromUrl(zohoUrl);
  let targetPath = path.join(outDir, localFilename);

  // If dry-run, report and return simulated local path
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      filename: localFilename,
      localPath: `/uploads/${localFilename}`,
      targetPath,
      bytes: 0,
    };
  }

  // If local file already exists and not force, skip download
  if (!force && fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
    return {
      success: true,
      cached: true,
      filename: localFilename,
      localPath: `/uploads/${localFilename}`,
      targetPath,
      bytes: fs.statSync(targetPath).size,
    };
  }

  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      let token = null;
      if (typeof getAccessToken === 'function') {
        try {
          token = await getAccessToken();
        } catch (e) {
          log(`[Auth Warning] Could not get OAuth token: ${e.message}. Attempting unauthenticated GET...`);
        }
      }

      const headers = { Accept: '*/*' };
      if (token) headers['Authorization'] = `Zoho-oauthtoken ${token}`;
      // Same rule as tools/zoho/reader.mjs: production rejects the environment header
      // (404, code 2930), so send it only for development/stage.
      const env = config.env || process.env.ZOHO_ENV;
      if (env === 'development' || env === 'stage') headers['environment'] = env;

      const res = await fetchFn(resolvedUrl, { method: 'GET', headers });

      // Handle Rate Limiting (429)
      if (res.status === 429) {
        const retryAfterSec = Number(res.headers?.get?.('retry-after') || 2);
        const backoffMs = retryAfterSec * 1000 + Math.floor(Math.random() * 500);
        log(`[Rate Limit 429] Waiting ${backoffMs}ms before retry (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      // Handle Expired Token (401 or Zoho 1030 in response)
      if (res.status === 401 && typeof invalidateToken === 'function') {
        log(`[Token Expired 401] Invalidating cached token and retrying (attempt ${attempt}/${maxRetries})...`);
        invalidateToken();
        continue;
      }

      // Handle Transient Server Errors (500, 502, 503, 504)
      if (res.status >= 500) {
        const backoffMs = Math.pow(2, attempt) * 500;
        log(`[Server Error ${res.status}] Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      // If response is not OK, try reading json error
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const contentType = res.headers?.get?.('content-type') || '';

      // Check if body is a Zoho JSON error instead of binary media
      if (contentType.includes('application/json')) {
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = null; }
        if (json && (json.code === 1030 || json.code === 9280 || json.error)) {
          if (json.code === 1030 && typeof invalidateToken === 'function') {
            log(`[Zoho Code 1030] Invalidating token and retrying...`);
            invalidateToken();
            continue;
          }
          throw new Error(`Zoho API Error (${json.code || res.status}): ${json.message || json.description || text}`);
        }
        // If it was JSON, write it as text buffer
        const buf = Buffer.from(text, 'utf8');
        fs.writeFileSync(targetPath, buf);
        return {
          success: true,
          filename: localFilename,
          localPath: `/uploads/${localFilename}`,
          targetPath,
          bytes: buf.length,
        };
      }

      // If Content-Disposition header has a filename, update filename if it didn't have one
      const disp = res.headers?.get?.('content-disposition');
      if (disp && !path.extname(localFilename)) {
        const m = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i.exec(disp);
        if (m && m[1]) {
          const cdFilename = sanitizeFilename(m[1].replace(/['"]/g, ''));
          if (cdFilename) {
            localFilename = cdFilename;
            targetPath = path.join(outDir, localFilename);
          }
        }
      }

      // Buffer and write binary data
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      fs.writeFileSync(targetPath, buffer);

      return {
        success: true,
        filename: localFilename,
        localPath: `/uploads/${localFilename}`,
        targetPath,
        bytes: buffer.length,
      };
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries) break;
      const backoffMs = Math.pow(2, attempt) * 400;
      log(`[Download Error] ${err.message}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return {
    success: false,
    error: lastError ? lastError.message : 'Unknown download error',
    filename: localFilename,
    localPath: null,
    targetPath,
  };
}

/**
 * Replaces remote Zoho URLs with their local /uploads/... mappings in an arbitrary value.
 * Handles strings, arrays, objects, JSON strings, and subforms/grids recursively.
 */
export function replaceZohoUrlsInValue(val, urlMapping) {
  if (val == null) return val;

  if (typeof val === 'string') {
    const s = val.trim();
    if (urlMapping[s]) {
      return urlMapping[s];
    }
    // Check if it's a JSON string representing array or object
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        const parsed = JSON.parse(s);
        const replaced = replaceZohoUrlsInValue(parsed, urlMapping);
        return JSON.stringify(replaced);
      } catch {
        // Not valid JSON, proceed to string replacement
      }
    }
    // String replacement for embedded URLs
    let result = val;
    for (const [remoteUrl, localUrl] of Object.entries(urlMapping)) {
      if (result.includes(remoteUrl)) {
        result = result.replaceAll(remoteUrl, localUrl);
      }
    }
    return result;
  }

  if (Array.isArray(val)) {
    return val.map((elem) => replaceZohoUrlsInValue(elem, urlMapping));
  }

  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = replaceZohoUrlsInValue(v, urlMapping);
    }
    return out;
  }

  return val;
}

/**
 * Inspects a record, collects all Zoho URLs, downloads them (or looks up mapping),
 * and produces the updated record with /uploads/<filename> paths.
 */
export async function migrateRecord(form, record, options = {}) {
  const {
    urlCache = new Map(),
    outDir = DEFAULT_UPLOADS_DIR,
    limiter = null,
    log = console.log,
  } = options;

  const urls = extractZohoUrls(record);
  if (urls.length === 0) {
    return { record, changed: false, migratedUrls: [] };
  }

  const urlMapping = {};
  const migratedUrls = [];
  const failedUrls = []; // downloads that did not work: the record keeps its old URL for them, and the run counts them as errors

  for (const remoteUrl of urls) {
    if (urlCache.has(remoteUrl)) {
      urlMapping[remoteUrl] = urlCache.get(remoteUrl);
      migratedUrls.push({ remoteUrl, localPath: urlMapping[remoteUrl], cached: true });
      continue;
    }

    const downloadTask = () => downloadZohoMedia(remoteUrl, outDir, options);
    const result = limiter ? await limiter(downloadTask) : await downloadTask();

    if (result.success && result.localPath) {
      urlCache.set(remoteUrl, result.localPath);
      urlMapping[remoteUrl] = result.localPath;
      migratedUrls.push({ remoteUrl, localPath: result.localPath, bytes: result.bytes, cached: result.cached, dryRun: result.dryRun });
    } else {
      log(`[Migration Error] Failed to download ${remoteUrl}: ${result.error}`);
      failedUrls.push({ remoteUrl, error: result.error });
    }
  }

  if (Object.keys(urlMapping).length === 0) {
    return { record, changed: false, migratedUrls: [], failedUrls };
  }

  const updatedRecord = replaceZohoUrlsInValue(record, urlMapping);
  return { record: updatedRecord, changed: true, migratedUrls, failedUrls };
}

// A dry run changes nothing, so what it finds is counted apart (filesToMigrate, recordsToUpdate) and the real counters stay 0.
function newSummary(dryRun) {
  // filesToMigrate and recordsToUpdate only move in a dry run; in a real run they stay 0
  return { dryRun: Boolean(dryRun), formsScanned: 0, recordsScanned: 0, filesMigrated: 0, recordsUpdated: 0, filesToMigrate: 0, recordsToUpdate: 0, errors: 0 };
}
const countRecord = (summary, dryRun) => { if (dryRun) summary.recordsToUpdate++; else summary.recordsUpdated++; };
const countFiles = (summary, dryRun, n) => { if (dryRun) summary.filesToMigrate += n; else summary.filesMigrated += n; };

/**
 * Migrates backup JSON files in a directory.
 */
export async function migrateBackupDir(dir, options = {}) {
  const {
    forms = DEFAULT_FORMS,
    all = false,
    dryRun = false,
    limit = null,
    outDir = DEFAULT_UPLOADS_DIR,
    log = console.log,
  } = options;

  const parsedLimit = limit != null ? Number(limit) : null;

  if (!fs.existsSync(dir)) {
    throw new Error(`Backup directory not found: ${dir}`);
  }

  const allFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
  const targetForms = all ? allFiles.map((f) => f.replace(/\.json$/, '')) : forms;

  const limiter = createLimiter(options.concurrency || 3, options.delay || 100);
  const urlCache = new Map();
  const summary = newSummary(dryRun);

  for (const form of targetForms) {
    if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;

    const filePath = path.join(dir, `${form}.json`);
    if (!fs.existsSync(filePath)) continue;

    summary.formsScanned++;
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content || content === '[]') continue;

    let records;
    try { records = JSON.parse(content); } catch (e) {
      log(`[Skip] Cannot parse ${form}.json: ${e.message}`);
      summary.errors++;
      continue;
    }

    let formChanged = false;
    const updatedRecords = [...records];

    for (let i = 0; i < records.length; i++) {
      if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;

      const rec = records[i];
      summary.recordsScanned++;
      const { record: updated, changed, migratedUrls, failedUrls = [] } = await migrateRecord(form, rec, {
        ...options,
        outDir,
        urlCache,
        limiter,
      });

      summary.errors += failedUrls.length;
      if (changed) {
        formChanged = true;
        countRecord(summary, dryRun);
        countFiles(summary, dryRun, migratedUrls.length);
        updatedRecords[i] = updated;
      }
    }

    if (formChanged && !dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(updatedRecords, null, 2));
      log(`[Updated File] ${form}.json with local file paths`);
    }

    if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;
  }

  return summary;
}

/**
 * Migrates records stored in a SQLite database.
 */
export async function migrateSqliteDb(db, options = {}) {
  const {
    forms = DEFAULT_FORMS,
    all = false,
    dryRun = false,
    limit = null,
    outDir = DEFAULT_UPLOADS_DIR,
    log = console.log,
  } = options;

  const parsedLimit = limit != null ? Number(limit) : null;
  const q = (n) => `"${String(n).replace(/"/g, '""')}"`;
  const existingTables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name)
  );

  const targetForms = all ? Array.from(existingTables) : forms.filter((f) => existingTables.has(f));
  const limiter = createLimiter(options.concurrency || 3, options.delay || 100);
  const urlCache = new Map();
  const summary = newSummary(dryRun);

  for (const form of targetForms) {
    if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;

    summary.formsScanned++;
    const remaining = parsedLimit != null ? Math.max(0, parsedLimit - summary.recordsScanned) : null;
    if (remaining !== null && remaining <= 0) break;

    const query = remaining !== null
      ? `SELECT * FROM ${q(form)} ORDER BY "ID" LIMIT ?`
      : `SELECT * FROM ${q(form)} ORDER BY "ID"`;
    const rows = remaining !== null ? db.prepare(query).all(remaining) : db.prepare(query).all();
    if (!rows.length) continue;

    let inTx = false;
    if (!dryRun) {
      db.exec('BEGIN TRANSACTION');
      inTx = true;
    }

    try {
      for (const row of rows) {
        if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;

        summary.recordsScanned++;
        const { record: updated, changed, migratedUrls, failedUrls = [] } = await migrateRecord(form, row, {
          ...options,
          outDir,
          urlCache,
          limiter,
        });

        summary.errors += failedUrls.length;
      if (changed) {
          countRecord(summary, dryRun);
          countFiles(summary, dryRun, migratedUrls.length);

          if (!dryRun) {
            // Identify columns that changed
            const changedCols = [];
            const params = [];
            for (const [k, v] of Object.entries(updated)) {
              if (row[k] !== v) {
                changedCols.push(k);
                params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
              }
            }
            if (changedCols.length > 0) {
              params.push(row.ID);
              const setClause = changedCols.map((c) => `${q(c)} = ?`).join(', ');
              db.prepare(`UPDATE ${q(form)} SET ${setClause} WHERE "ID" = ?`).run(...params);
            }
          }
        }
      }

      if (inTx) {
        db.exec('COMMIT');
        inTx = false;
      }
    } catch (err) {
      if (inTx) {
        try {
          db.exec('ROLLBACK');
        } catch (rbErr) {
          log(`[Rollback Warning] ${rbErr.message}`);
        }
        inTx = false;
      }
      log(`[Transaction Error] Failed migrating table ${form}: ${err.message}`);
      summary.errors++;
      throw err;
    }

    if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;
  }

  return summary;
}

/**
 * Migrates records stored in a Postgres database (pool, client, or PGlite).
 */
export async function migratePgDb(db, options = {}) {
  const {
    forms = DEFAULT_FORMS,
    all = false,
    dryRun = false,
    limit = null,
    outDir = DEFAULT_UPLOADS_DIR,
    log = console.log,
  } = options;

  const parsedLimit = limit != null ? Number(limit) : null;
  const q = (n) => `"${String(n).replace(/"/g, '""')}"`;
  const { rows: tableRows } = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
  );
  const existingTables = new Set(tableRows.map((r) => r.table_name));

  const targetForms = all ? Array.from(existingTables) : forms.filter((f) => existingTables.has(f));
  const limiter = createLimiter(options.concurrency || 3, options.delay || 100);
  const urlCache = new Map();
  const summary = newSummary(dryRun);

  for (const form of targetForms) {
    if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;

    summary.formsScanned++;
    const remaining = parsedLimit != null ? Math.max(0, parsedLimit - summary.recordsScanned) : null;
    if (remaining !== null && remaining <= 0) break;

    const query = remaining !== null
      ? `SELECT * FROM ${q(form)} ORDER BY "ID" LIMIT $1`
      : `SELECT * FROM ${q(form)} ORDER BY "ID"`;
    const { rows } = remaining !== null ? await db.query(query, [remaining]) : await db.query(query);
    if (!rows.length) continue;

    for (const row of rows) {
      if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;

      summary.recordsScanned++;
      const { record: updated, changed, migratedUrls, failedUrls = [] } = await migrateRecord(form, row, {
        ...options,
        outDir,
        urlCache,
        limiter,
      });

      summary.errors += failedUrls.length;
      if (changed) {
        countRecord(summary, dryRun);
        countFiles(summary, dryRun, migratedUrls.length);

        if (!dryRun) {
          const changedCols = [];
          const params = [];
          for (const [k, v] of Object.entries(updated)) {
            if (row[k] !== v) {
              changedCols.push(k);
              params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
            }
          }
          if (changedCols.length > 0) {
            params.push(String(row.ID));
            const setClause = changedCols.map((c, i) => `${q(c)} = $${i + 1}`).join(', ');
            await db.query(`UPDATE ${q(form)} SET ${setClause} WHERE "ID" = $${params.length}::bigint`, params);
          }
        }
      }
    }

    if (parsedLimit != null && summary.recordsScanned >= parsedLimit) break;
  }

  return summary;
}

/**
 * Main entry point for CLI execution.
 */
export async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
  );

  const dryRun = Boolean(args['dry-run']);
  const backend = String(args.backend || 'auto');
  const all = Boolean(args.all);
  const formsArg = args.forms ? String(args.forms).split(',') : DEFAULT_FORMS;
  const outDir = path.resolve(String(args['out-dir'] || DEFAULT_UPLOADS_DIR));
  const concurrency = Number(args.concurrency || 3);
  const delay = Number(args.delay || 100);
  const maxRetries = Number(args['max-retries'] || 3);
  const force = Boolean(args.force);
  const verbose = Boolean(args.verbose);

  // Parse and validate --limit
  let limit = null;
  if (args.limit !== undefined) {
    if (args.limit === true || args.limit === '') {
      console.error('Error: --limit requires a positive integer value (e.g. --limit=100)');
      process.exit(1);
    }
    limit = Number(args.limit);
    if (!Number.isInteger(limit) || limit <= 0) {
      console.error(`Error: --limit must be a positive integer greater than 0, received: ${args.limit}`);
      process.exit(1);
    }
  }

  console.log('====================================================');
  console.log('   Supply Chain System V2 - Media & Files Migration  ');
  console.log('====================================================');
  console.log(`Mode:        ${dryRun ? 'DRY RUN (no changes written)' : 'LIVE MIGRATION'}`);
  console.log(`Backend:     ${backend}`);
  console.log(`Target Dir:  ${outDir}`);
  console.log(`Forms:       ${all ? 'ALL' : formsArg.join(', ')}`);
  console.log(`Limit:       ${limit ? `${limit} records` : 'none (all records)'}`);
  console.log(`Concurrency: ${concurrency} parallel requests (${delay}ms delay)`);
  console.log('----------------------------------------------------');

  let authManager = null;
  try {
    authManager = await import('./zoho/auth.mjs');
  } catch (e) {
    if (!dryRun) {
      console.warn('[Warning] Could not load tools/zoho/auth.mjs:', e.message);
    }
  }

  const migrationOptions = {
    forms: formsArg,
    all,
    dryRun,
    force,
    outDir,
    concurrency,
    delay,
    maxRetries,
    limit,
    getAccessToken: authManager?.getAccessToken || null,
    invalidateToken: authManager?.invalidateToken || null,
    config: authManager?.getConfig ? authManager.getConfig() : {},
    log: verbose ? console.log : () => {},
  };

  let summary = null;

  if (backend === 'backup' || args['backup-dir']) {
    let backupDir = args['backup-dir'];
    if (!backupDir) {
      const baseBackup = path.join(DATA_DIR, 'zoho-backup');
      if (fs.existsSync(baseBackup)) {
        const dirs = fs.readdirSync(baseBackup).filter((d) => fs.existsSync(path.join(baseBackup, d, 'manifest.json'))).sort();
        if (dirs.length) backupDir = path.join(baseBackup, dirs.at(-1));
      }
    }
    if (!backupDir) {
      console.error('Error: No backup directory found. Provide --backup-dir=<path>');
      process.exit(1);
    }
    console.log(`Migrating backup directory: ${backupDir}`);
    summary = await migrateBackupDir(backupDir, migrationOptions);
  } else if (backend === 'pg' || (backend === 'auto' && process.env.BACKEND === 'pg')) {
    console.log('Connecting to Postgres database...');
    const { createPool } = await import('../server/pg/pool.mjs');
    const pool = createPool();
    try {
      summary = await migratePgDb(pool, migrationOptions);
    } finally {
      await pool.end();
    }
  } else {
    // Default SQLite
    console.log(`Opening SQLite database at ${path.join(DATA_DIR, 'app.db')}...`);
    const { db } = await import('../server/db.mjs');
    summary = await migrateSqliteDb(db, migrationOptions);
  }

  console.log('----------------------------------------------------');
  console.log('Migration Completed:');
  console.log(`  Forms Scanned:    ${summary.formsScanned}`);
  console.log(`  Records Scanned:  ${summary.recordsScanned}`);
  if (summary.dryRun) {
    console.log(`  Files to migrate:  ${summary.filesToMigrate}  (dry run: nothing was downloaded)`);
    console.log(`  Records to update: ${summary.recordsToUpdate}  (dry run: nothing was written)`);
  } else {
    console.log(`  Files Migrated:   ${summary.filesMigrated}`);
    console.log(`  Records Updated:  ${summary.recordsUpdated}`);
  }
  console.log(`  Errors:           ${summary.errors}`);
  console.log('====================================================');

  if (summary.errors > 0) {
    process.exit(1);
  }
}

// Execute if run directly from node
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Fatal error during migration:', err);
    process.exit(1);
  });
}
