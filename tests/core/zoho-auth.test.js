// tools/zoho/auth.mjs must keep server/zoho-credentials.json safe.
// On 2026-11-14 a test gave the tool test credentials through the environment; after the token refresh the tool wrote those
// values into the real credentials file and the real Zoho Creator credentials were gone. The save is now only done into the
// file the credentials came from. These tests use their own file (ZOHO_CREDENTIALS_FILE) and a local token server, never the real ones.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const AUTH_URL = pathToFileURL(path.resolve(import.meta.dirname, '..', '..', 'tools', 'zoho', 'auth.mjs')).href;
let server;
let accountsUrl;
let tmp;
let tokenCalls = 0;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zoho-auth-test-'));
  server = http.createServer((req, res) => {
    tokenCalls += 1;
    req.resume();
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ access_token: 'token-from-the-local-server', expires_in: 3600 }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  accountsUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Runs getAccessToken() in its own process (the module reads the environment when it loads).
function refresh(extraEnv) {
  const env = { ...process.env, ZOHO_ACCOUNTS_URL: accountsUrl };
  for (const k of ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCESS_TOKEN']) delete env[k];
  Object.assign(env, extraEnv);
  return new Promise((resolve) => {
    execFile(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(AUTH_URL)}); await m.getAccessToken();`],
      { env }, (error, stdout, stderr) => resolve({ code: error ? error.code || 1 : 0, stdout, stderr }));
  });
}

const realLooking = { client_id: '1000.REAL', client_secret: 'real-secret', refresh_token: 'real-refresh', access_token: 'old-token', api_domain: 'https://www.zohoapis.com' };
const writeCreds = (name) => { const file = path.join(tmp, name); fs.writeFileSync(file, JSON.stringify(realLooking, null, 2)); return file; };

describe('Zoho auth keeps the credentials file safe', () => {
  test('credentials from the environment never overwrite the file', async () => {
    const file = writeCreds('env-case.json');
    const before = fs.readFileSync(file, 'utf8');
    const res = await refresh({ ZOHO_CREDENTIALS_FILE: file, ZOHO_CLIENT_ID: 'mock', ZOHO_CLIENT_SECRET: 'mock', ZOHO_REFRESH_TOKEN: 'mock' });
    assert.equal(res.code, 0, res.stderr);
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'the file with the real credentials must stay byte for byte the same');
  });

  test('credentials from the file get the new access token and keep everything else', async () => {
    const file = writeCreds('file-case.json');
    const calls = tokenCalls;
    const res = await refresh({ ZOHO_CREDENTIALS_FILE: file });
    assert.equal(res.code, 0, res.stderr);
    assert.equal(tokenCalls, calls + 1, 'the token was refreshed once against the local server');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.access_token, 'token-from-the-local-server');
    assert.equal(saved.client_id, realLooking.client_id);
    assert.equal(saved.client_secret, realLooking.client_secret);
    assert.equal(saved.refresh_token, realLooking.refresh_token);
    assert.ok(saved.updated_at, 'it records when the token was saved');
  });
});
