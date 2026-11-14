// Inbound integration router for the external CMS (Customer Service Zoho Creator App).
// Handles incoming delivery schedule requests and chat messages, authenticating with CMS_API_KEY.
// These endpoints run before user session checks so external webhooks can push without a browser cookie.
import { upsertDmsScheduleRequest, addDmsScheduleRequestMessage } from '../modules/delivery-management/cms-sync.mjs';

function verifyApiKey(req) {
  const expected = process.env.CMS_API_KEY;
  if (!expected || expected.trim() === '') {
    return { ok: false, status: 503, message: 'CMS integration is not configured on this server (CMS_API_KEY unset).' };
  }
  const authHeader = req.headers['x-api-key']
    || (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : null);

  if (!authHeader || authHeader !== expected.trim()) {
    return { ok: false, status: 401, message: 'Unauthorized: Invalid or missing API key.' };
  }
  return { ok: true };
}

export async function handleCmsIntegration(req, res, pathname, store, readJson, send) {
  const authResult = verifyApiKey(req);
  if (!authResult.ok) {
    return send(res, authResult.status, { status: 'error', message: authResult.message });
  }

  // Health / ping check for webhook configuration verification
  if (pathname === '/api/integrations/cms/health' && req.method === 'GET') {
    return send(res, 200, { status: 'ok', service: 'cms-integration' });
  }

  // Create or update a delivery schedule request
  if (pathname === '/api/integrations/cms/schedule-request' && req.method === 'POST') {
    try {
      const payload = await readJson(req);
      if (!payload || typeof payload !== 'object') {
        return send(res, 400, { status: 'error', message: 'Invalid JSON payload.' });
      }
      const result = await upsertDmsScheduleRequest(store, payload, { user: 'cms_integration' });
      const httpCode = result.status === 'success' ? 200 : 400;
      return send(res, httpCode, result);
    } catch (e) {
      return send(res, 400, { status: 'error', message: e.message || 'Error processing schedule request.' });
    }
  }

  // Add a message/chat note to a schedule request
  if (pathname === '/api/integrations/cms/message' && req.method === 'POST') {
    try {
      const payload = await readJson(req);
      if (!payload || typeof payload !== 'object') {
        return send(res, 400, { status: 'error', message: 'Invalid JSON payload.' });
      }
      const result = await addDmsScheduleRequestMessage(store, payload, { user: 'cms_integration' });
      const httpCode = result.status === 'success' ? 200 : 400;
      return send(res, httpCode, result);
    } catch (e) {
      return send(res, 400, { status: 'error', message: e.message || 'Error processing message.' });
    }
  }

  return send(res, 404, { status: 'error', message: `Unknown CMS endpoint: ${pathname}` });
}
