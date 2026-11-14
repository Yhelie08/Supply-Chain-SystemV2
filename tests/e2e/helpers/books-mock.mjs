// tests/e2e/helpers/books-mock.mjs
// Lightweight mock server mimicking Zoho Books & Inventory API contracts for offline E2E testing.
import http from 'node:http';
import net from 'node:net';

export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

export async function createBooksMock(options = {}) {
  const port = options.port || (await freePort());
  const calls = [];
  const customHandlers = new Map();

  const defaultRoutes = {
    'POST /oauth/v2/token': () => ({
      access_token: 'mock_zoho_books_access_token_e2e',
      api_domain: `http://127.0.0.1:${port}`,
      token_type: 'Bearer',
      expires_in: 3600,
    }),
    'GET /inventory/v1/packages': (req, url) => {
      const soNum = url.searchParams.get('salesorder_number');
      return {
        code: 0,
        message: 'success',
        packages: [
          { package_id: 'p5001', package_number: 'PKG-5001', salesorder_id: 'so5001', salesorder_number: soNum || 'SO-5001' },
          { package_id: 'p1', package_number: 'PAC-1', salesorder_id: 's1', salesorder_number: soNum || 'SO-1' },
          { package_id: 'p_apex', package_number: 'PACK-8801', salesorder_id: 'so_8801', salesorder_number: soNum || 'SO-8801' },
          { package_id: 'p_carlos', package_number: 'PACK-4001', salesorder_id: 'so_4001', salesorder_number: soNum || 'SO-4001' },
        ],
      };
    },
    'POST /inventory/v1/shipmentorders': (req, url, body) => ({
      code: 0,
      message: 'success',
      shipmentorder: {
        shipment_id: 'sh_9001',
        shipment_number: 'SH-9001',
      },
    }),
    'GET /inventory/v1/salesorders': (req, url) => {
      const soNum = url.searchParams.get('salesorder_number');
      return {
        code: 0,
        message: 'success',
        salesorders: [
          { salesorder_id: 'so_6001', salesorder_number: soNum || 'SO-6001' },
          { salesorder_id: 'so_4001', salesorder_number: soNum || 'SO-4001' },
        ],
      };
    },
    'GET /inventory/v1/salesorders/so_6001': () => ({
      code: 0,
      message: 'success',
      salesorder: {
        salesorder_id: 'so_6001',
        salesorder_number: 'SO-6001',
        line_items: [
          { line_item_id: 'li_1', item_id: 'item_1', sku: 'CHAIR-BLK', name: 'Black Chair', quantity: 1 },
          { line_item_id: 'l_a', item_id: 'item_light', sku: 'LIGHT-01', name: 'Light Fixture', quantity: 1 },
          { line_item_id: 'l_b', item_id: 'item_light', sku: 'LIGHT-01', name: 'Light Fixture', quantity: 2 },
          { line_item_id: 'li_wood', item_id: 'item_desk', sku: 'DESK-WOOD', name: 'Wooden Desk', quantity: 1 },
        ],
      },
    }),
    'GET /inventory/v1/salesorders/so_4001': () => ({
      code: 0,
      message: 'success',
      salesorder: {
        salesorder_id: 'so_4001',
        salesorder_number: 'SO-4001',
        line_items: [
          { line_item_id: 'li_l1', item_id: 'item_l1', sku: 'L-1', name: 'Light Fixture L1', quantity: 5 },
          { line_item_id: 'li_s1', item_id: 'item_s1', sku: 'S-1', name: 'Mounting Bracket S1', quantity: 2 },
        ],
      },
    }),
    'POST /inventory/v1/salesreturns': (req, url, body) => ({
      code: 0,
      message: 'success',
      salesreturn: {
        salesreturn_id: 'ret_7001',
        salesreturn_number: 'SR-7001',
        line_items: (body?.line_items || []).map((li, i) => ({
          line_item_id: `r_li_${i + 1}`,
          salesorder_item_id: li.salesorder_item_id,
          quantity: li.quantity,
        })),
      },
    }),
    'POST /inventory/v1/salesreturnreceives': () => ({
      code: 0,
      message: 'success',
      salesreturnreceive: {
        id: 'rec_8001',
      },
    }),
  };

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, `http://127.0.0.1:${port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();
    const routeKey = `${method} ${pathname}`;

    // Read body if any
    let body = null;
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }

    const callRecord = {
      method,
      pathname,
      query: Object.fromEntries(parsedUrl.searchParams),
      body,
      headers: req.headers,
      timestamp: Date.now(),
    };
    calls.push(callRecord);

    // 1. Check custom handler
    if (customHandlers.has(routeKey)) {
      const handler = customHandlers.get(routeKey);
      try {
        const out = await handler(req, res, parsedUrl, body);
        if (res.writableEnded) return;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(out));
      } catch (err) {
        res.statusCode = err.status || 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ code: err.code || 500, message: err.message }));
      }
    }

    // 2. Check mock media download simulation (e.g. for migrate-zoho-files)
    if (pathname.includes('/download') || pathname.endsWith('.pdf') || pathname.endsWith('.jpg') || pathname.endsWith('.png')) {
      const isPdf = pathname.endsWith('.pdf') || (parsedUrl.searchParams.get('filepath') || '').endsWith('.pdf');
      const isPng = pathname.endsWith('.png') || (parsedUrl.searchParams.get('filepath') || '').endsWith('.png');
      const contentType = isPdf ? 'application/pdf' : (isPng ? 'image/png' : 'image/jpeg');
      const mockPayload = Buffer.from(`MOCK_MEDIA_CONTENT_${pathname}_${Date.now()}`);
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      return res.end(mockPayload);
    }

    // 3. Check default routes
    if (defaultRoutes[routeKey]) {
      const handler = defaultRoutes[routeKey];
      try {
        const result = await handler(req, parsedUrl, body);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = err.status || 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ code: err.code || 500, message: err.message }));
      }
    }

    // 4. Wildcard matching for dynamic IDs: e.g. GET /inventory/v1/salesorders/:id
    if (method === 'GET' && pathname.startsWith('/inventory/v1/salesorders/')) {
      const soId = pathname.replace('/inventory/v1/salesorders/', '');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        code: 0,
        message: 'success',
        salesorder: {
          salesorder_id: soId,
          salesorder_number: 'SO-' + soId,
          line_items: [
            { line_item_id: 'li_1', item_id: 'item_1', sku: 'CHAIR-BLK', name: 'Black Chair', quantity: 1 },
            { line_item_id: 'l_a', item_id: 'item_light', sku: 'LIGHT-01', name: 'Light Fixture', quantity: 1 },
            { line_item_id: 'l_b', item_id: 'item_light', sku: 'LIGHT-01', name: 'Light Fixture', quantity: 2 },
            { line_item_id: 'li_l1', item_id: 'item_l1', sku: 'L-1', name: 'Light Fixture L1', quantity: 5 },
            { line_item_id: 'li_s1', item_id: 'item_s1', sku: 'S-1', name: 'Mounting Bracket S1', quantity: 2 },
          ],
        },
      }));
    }

    // Default fallback: 404
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ code: 404, message: `Mock route not found: ${routeKey}` }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    baseUrl,
    calls,
    setRoute: (method, path, handler) => {
      customHandlers.set(`${method.toUpperCase()} ${path}`, typeof handler === 'function' ? handler : () => handler);
    },
    removeRoute: (method, path) => {
      customHandlers.delete(`${method.toUpperCase()} ${path}`);
    },
    resetCalls: () => {
      calls.length = 0;
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
