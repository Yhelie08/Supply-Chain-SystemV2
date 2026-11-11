import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('tools/screenshots/procurement');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const getTargetPage = async () => {
  const res = await fetch('http://localhost:9222/json');
  const data = await res.json();
  const pages = data.filter((p) => p.type === 'page');
  const target = pages.find((p) => p.url.includes('creatorapp') || p.url.includes('zoho'));
  if (!target) throw new Error('No Zoho Creator page found in Chrome');
  return target;
};

class CdpCrawler {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.widgetSessions = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = async () => {
        await this.send('Page.enable');
        await this.send('Runtime.enable');
        await this.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true
        });
        resolve();
      };
      this.ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Target.attachedToTarget') {
          const { sessionId, targetInfo } = msg.params;
          if (targetInfo.url.includes('sigmacdncontent')) {
            this.widgetSessions.set(sessionId, targetInfo);
            try {
              await this.send('Runtime.enable', {}, sessionId);
            } catch {}
          }
        } else if (msg.method === 'Target.detachedFromTarget') {
          this.widgetSessions.delete(msg.params.sessionId);
        }

        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
      this.ws.onerror = (err) => reject(err);
    });
  }

  send(method, params = {}, sessionId = undefined) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`Timeout waiting for ${method} (${id})`));
      }, 20000);

      this.callbacks.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  async eval(expression, sessionId = undefined) {
    const params = {
      expression,
      returnByValue: true,
      awaitPromise: true
    };
    const res = await this.send('Runtime.evaluate', params, sessionId);
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async screenshot(filename) {
    const filepath = path.resolve(SCREENSHOT_DIR, filename);
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
    return filepath;
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

const PROCUREMENT_TABS = [
  { id: 'Dashboard', name: 'Dashboard', hash: '#Page:Dashboard', selector: '#Dashboard' },
  { id: 'Inquiry', name: 'Inquiry List', hash: '#Page:Inquiry', selector: '#Inquiry' },
  { id: 'Purchase_Request', name: 'Purchase Request', hash: '#Page:Purchase_Request', selector: '#Purchase_Request' },
  { id: 'Purchase_Order1', name: 'Purchase Order', hash: '#Page:Purchase_Order1', selector: '#Purchase_Order1' },
  { id: 'Shipments1', name: 'Shipments', hash: '#Page:Shipments1', selector: '#Shipments1' },
  { id: 'Receiving1', name: 'Receiving', hash: '#Page:Receiving1', selector: '#Receiving1' },
  { id: 'Replacement_Request1', name: 'Replacement Request', hash: '#Page:Replacement_Request1', selector: '#Replacement_Request1' },
  { id: 'Exceptions1', name: 'Exceptions', hash: '#Page:Exceptions1', selector: '#Exceptions1' },
  { id: 'Forecast_Setting', name: 'Forecast Setting', hash: '#Page:Forecast_Setting', selector: '#Forecast_Setting' }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const main = async () => {
  const target = await getTargetPage();
  const crawler = new CdpCrawler(target.webSocketDebuggerUrl);
  await crawler.connect();

  console.log(`Attached to Chrome. Crawling ${PROCUREMENT_TABS.length} Procurement tabs...`);

  const results = [];

  for (let i = 0; i < PROCUREMENT_TABS.length; i++) {
    const tab = PROCUREMENT_TABS[i];
    console.log(`\n[${i + 1}/${PROCUREMENT_TABS.length}] Navigating to: ${tab.name} (${tab.hash})`);

    // Click the tab in the top nav
    await crawler.eval(`
      (() => {
        const el = document.querySelector('a[href="${tab.hash}"], ${tab.selector}');
        if (el) { el.click(); return 'clicked'; }
        window.location.hash = '${tab.hash}';
        return 'hash_set';
      })()
    `);

    // Give it time to load data/iframe
    await sleep(3500);

    // Save screenshot of full page
    const fileSlug = `${String(i + 1).padStart(2, '0')}-${tab.id.toLowerCase()}`;
    await crawler.screenshot(`${fileSlug}.png`);
    console.log(`  Saved screenshot: ${fileSlug}.png`);

    // Check main page and widget sessions
    const mainInfo = await crawler.eval(`
      (() => {
        return {
          title: document.title,
          url: window.location.href,
          hasIframe: !!document.querySelector('iframe[src*="sigmacdncontent"]'),
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText.trim()).filter(Boolean)
        };
      })()
    `);

    let widgetData = null;
    // Look for active widget session
    for (const [sId, info] of crawler.widgetSessions.entries()) {
      try {
        const data = await crawler.eval(`
          (() => {
            const clean = s => s ? s.trim() : '';
            
            // Header
            const h1 = document.querySelector('h1')?.innerText?.trim() || '';
            const statusPill = document.querySelector('.status-pill, [class*="status"]')?.innerText?.trim() || '';

            // Buttons
            const buttons = Array.from(document.querySelectorAll('button, a.btn, [role="button"], input[type="button"]'))
              .map(b => (b.innerText || b.value || b.getAttribute('title') || '').trim())
              .filter(b => b && b.length < 50 && !b.includes('\\n'));

            // Stat Cards
            const statCards = Array.from(document.querySelectorAll('.stat-card, .metric-card, [class*="stat"], [class*="card"]'))
              .map(c => {
                const lines = (c.innerText || '').split('\\n').map(l => l.trim()).filter(Boolean);
                if (lines.length >= 2) {
                  return { label: lines[0], value: lines[1], subtext: lines.slice(2).join(' ') };
                }
                return null;
              })
              .filter(Boolean)
              .slice(0, 15);

            // Sub-tabs / View switcher / Filters
            const subTabs = Array.from(document.querySelectorAll('[role="tab"], .tab, .nav-tabs li, .view-btn, .pill, [class*="filter"]'))
              .map(t => t.innerText?.trim())
              .filter(t => t && t.length < 40 && !t.includes('\\n'));

            // Table Columns
            const tableHeaders = Array.from(document.querySelectorAll('th, .table-header, [role="columnheader"]'))
              .map(th => th.innerText?.trim())
              .filter(Boolean);

            // Summary text
            const fullText = document.body ? document.body.innerText.slice(0, 800) : '';

            return {
              h1,
              statusPill,
              buttons: Array.from(new Set(buttons)),
              statCards,
              subTabs: Array.from(new Set(subTabs)),
              tableHeaders: Array.from(new Set(tableHeaders)),
              snippet: fullText
            };
          })()
        `, sId);

        if (data && (data.h1 || data.buttons.length > 0 || data.tableHeaders.length > 0)) {
          widgetData = data;
          break;
        }
      } catch (err) {
        // Iframe might be navigating or inaccessible
      }
    }

    results.push({
      tab: tab.name,
      id: tab.id,
      hash: tab.hash,
      mainInfo,
      widgetData
    });

    console.log(`  Extracted: ${widgetData?.buttons?.length || 0} buttons, ${widgetData?.statCards?.length || 0} stats, ${widgetData?.subTabs?.length || 0} sub-tabs, ${widgetData?.tableHeaders?.length || 0} columns`);
  }

  fs.writeFileSync('tools/procurement-spec.json', JSON.stringify(results, null, 2));
  console.log('\nFinished crawl! Spec saved to tools/procurement-spec.json');

  crawler.close();
};

main().catch(console.error);

