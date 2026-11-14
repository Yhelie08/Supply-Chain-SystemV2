// tools/zoho/reader.mjs must NOT send the Zoho "environment" header in production.
// Zoho Creator v2.1 answers 404 (code 2930) when the header says "production"; the production
// environment is read without that header. Development/stage keep the header. These tests run
// the reader in its own process against a local mock server that records the request headers.
// (Found on 2026-11-14 while checking the Production export: All_Policy_Settings was 200 without
// the header and 404 with environment: production.)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const READER_URL = pathToFileURL(path.resolve(import.meta.dirname, '..', '..', 'tools', 'zoho', 'reader.mjs')).href;
let server;
let serverUrl;
let tmp;
let dataRequests = 0;
let seenEnvironments = [];

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zoho-env-header-test-'));
  server = http.createServer((req, res) => {
    if (req.url === '/oauth/v2/token') {
      req.resume();
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ access_token: 'token-from-the-local-server', expires_in: 3600 }));
      });
      return;
    }
    // Any other request is a Zoho data API call; record whether the environment header was sent.
    dataRequests += 1;
    seenEnvironments.push(req.headers.environment);
    req.resume();
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ code: 3000, data: [] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Runs zohoReader.getRecords() in its own process with the given ZOHO_ENV (or the default).
// The module reads the environment when it loads, so a fresh process is needed per case.
function runReader(zohoEnv) {
  const env = { ...process.env, ZOHO_ACCOUNTS_URL: serverUrl, ZOHO_API_DOMAIN: serverUrl };
  for (const k of ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCESS_TOKEN', 'ZOHO_ENV']) delete env[k];
  env.ZOHO_CLIENT_ID = 'mock';
  env.ZOHO_CLIENT_SECRET = 'mock';
  env.ZOHO_REFRESH_TOKEN = 'mock';
  env.ZOHO_CREDENTIALS_FILE = path.join(tmp, 'mock-credentials.json'); // never touch the real credentials file
  if (zohoEnv) env.ZOHO_ENV = zohoEnv;
  return new Promise((resolve) => {
    execFile(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(READER_URL)}); const r = await m.zohoReader.getRecords({ report_name: 'Test_Report' }); if (r.code !== 3000) throw new Error('unexpected ' + JSON.stringify(r)); console.log('ok');`],
      { env }, (error, stdout, stderr) => resolve({ code: error ? error.code || 1 : 0, stdout, stderr }));
  });
}

describe('Zoho reader sends the environment header only for development/stage', () => {
  test('production: the environment header is never sent', async () => {
    const beforeCount = dataRequests;
    const res = await runReader('production');
    assert.equal(res.code, 0, res.stderr);
    assert.equal(dataRequests, beforeCount + 1, 'one data API call happened');
    const added = seenEnvironments.slice(beforeCount);
    assert.ok(added.every((v) => v === undefined), `no environment header expected, got: ${JSON.stringify(added)}`);
  });

  test('development: the environment header is sent', async () => {
    const beforeCount = dataRequests;
    const res = await runReader('development');
    assert.equal(res.code, 0, res.stderr);
    assert.equal(dataRequests, beforeCount + 1, 'one data API call happened');
    const added = seenEnvironments.slice(beforeCount);
    assert.ok(added.every((v) => v === 'development'), `environment: development expected, got: ${JSON.stringify(added)}`);
  });

  test('stage: the environment header is sent', async () => {
    const beforeCount = dataRequests;
    const res = await runReader('stage');
    assert.equal(res.code, 0, res.stderr);
    assert.equal(dataRequests, beforeCount + 1, 'one data API call happened');
    const added = seenEnvironments.slice(beforeCount);
    assert.ok(added.every((v) => v === 'stage'), `environment: stage expected, got: ${JSON.stringify(added)}`);
  });

  test('no ZOHO_ENV: defaults to development, so the header is sent', async () => {
    const beforeCount = dataRequests;
    const res = await runReader(null);
    assert.equal(res.code, 0, res.stderr);
    assert.equal(dataRequests, beforeCount + 1, 'one data API call happened');
    const added = seenEnvironments.slice(beforeCount);
    assert.ok(added.every((v) => v === 'development'), `default environment: development expected, got: ${JSON.stringify(added)}`);
  });
});
