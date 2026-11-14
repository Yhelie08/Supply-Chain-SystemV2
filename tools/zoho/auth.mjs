// Zoho Service Account authentication and automatic token refresh manager
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import fs from 'node:fs';
import path from 'node:path';

// ZOHO_CREDENTIALS_FILE lets a test use its own file; the real one is never touched by a test that sets it.
const CREDENTIALS_FILE = process.env.ZOHO_CREDENTIALS_FILE || path.resolve(import.meta.dirname, '..', '..', 'server', 'zoho-credentials.json');

// Configuration from environment or credentials file
const OWNER = process.env.ZOHO_OWNER || 'homecartel';
const APP = process.env.ZOHO_APP || 'supply-chain-app';
const ENV = process.env.ZOHO_ENV || 'development'; // 'development' or 'production'
const API_DOMAIN = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
const ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';

let cachedToken = null;
let tokenExpiresAt = 0;
let credsFromFile = false; // true only when the credentials were read from CREDENTIALS_FILE (see the save below)

function loadCredentials() {
  credsFromFile = false;
  if (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN) {
    return {
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      access_token: process.env.ZOHO_ACCESS_TOKEN || null,
      api_domain: API_DOMAIN,
    };
  }
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const fromFile = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
      credsFromFile = true;
      return fromFile;
    } catch (e) {
      console.error('[Zoho Auth] Failed to read credentials file:', e);
    }
  }
  throw new Error('Missing Zoho credentials! Set ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN or create server/zoho-credentials.json');
}

export async function getAccessToken() {
  const now = Date.now();
  // Return cached token if valid for at least 3 more minutes
  if (cachedToken && tokenExpiresAt > now + 3 * 60 * 1000) {
    return cachedToken;
  }

  const creds = loadCredentials();

  console.log('[Zoho Auth] Refreshing access token via Zoho Accounts...');
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('client_id', creds.client_id);
  params.append('client_secret', creds.client_secret);
  params.append('refresh_token', creds.refresh_token);

  const res = await fetch(`${ACCOUNTS_URL}/oauth/v2/token`, {
    method: 'POST',
    body: params,
  });

  const data = await res.json();
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(`Failed to refresh Zoho token: ${data.error || res.statusText}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + ((data.expires_in || 3600) * 1000);

  // Persist the new access_token, but only into the file the credentials came from. When they came from the environment
  // (ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN) the file must stay as it is: writing the env values into it replaced the real
  // credentials with test values on 2026-11-14.
  if (credsFromFile && fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const updated = { ...creds, access_token: cachedToken, updated_at: new Date().toISOString() };
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(updated, null, 2));
    } catch {}
  }

  console.log('[Zoho Auth] Access token successfully refreshed. Expires in', data.expires_in, 'seconds.');
  return cachedToken;
}

// Forget the cached token so the next getAccessToken() refreshes (used when Zoho answers 1030).
export function invalidateToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

export function getConfig() {
  return {
    owner: OWNER,
    app: APP,
    env: ENV,
    baseUrl: `${API_DOMAIN}/creator/v2.1/data/${OWNER}/${APP}`,
  };
}
