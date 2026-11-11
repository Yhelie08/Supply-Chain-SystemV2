import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('tools/screenshots/procurement');
const WIDGET_DIR = path.resolve('tools/widgets/procurement');

[SCREENSHOT_DIR, WIDGET_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getTargets = async () => {
  const res = await fetch('http://localhost:9222/json');
  return await res.json();
};

const sendCdp = (wsUrl, method, params = {}) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    let timer;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { ws.close(); } catch {}
    };
    ws.onopen = () => ws.send(JSON.stringify({ id, method, params }));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        cleanup();
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.onerror = (err) => {
      cleanup();
      reject(err);
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`CDP timed out: ${method}`));
    }, 15000);
  });
};

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

async function crawl() {
  const targets = await getTargets();
  const mainPage = targets.find(t => t.type === 'page' && t.url.includes('creatorapp'));
  if (!mainPage) {
    console.error('Zoho Creator main page not found in Chrome.');
    process.exit(1);
  }

  console.log(`Starting Deep Procurement Crawl on: ${mainPage.title}`);
  const specReport = [];

  for (let i = 0; i < PROCUREMENT_TABS.length; i++) {
    const tab = PROCUREMENT_TABS[i];
    const slug = `${String(i + 1).padStart(2, '0')}-${tab.id.toLowerCase()}`;
    console.log(`\n========================================================`);
    console.log(`[${i + 1}/${PROCUREMENT_TABS.length}] Navigating to: ${tab.name} (${tab.hash})`);

    // 1. Click tab in main page
    await sendCdp(mainPage.webSocketDebuggerUrl, 'Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('a[href="${tab.hash}"], ${tab.selector}');
        if (el) { el.click(); return 'clicked'; }
        window.location.hash = '${tab.hash}';
        return 'hash_set';
      })()`,
      returnByValue: true
    });

    // 2. Poll for widget iframe
    let widgetIframe = null;
    let widgetData = null;
    let widgetHtml = '';

    console.log('  Waiting for widget iframe to load...');
    const startTime = Date.now();
    while (Date.now() - startTime < 14000) {
      await sleep(1000);
      const currentTargets = await getTargets();
      widgetIframe = currentTargets.find(t => t.type === 'iframe' && t.url.includes('sigmacdncontent'));

      if (widgetIframe) {
        try {
          const evalRes = await sendCdp(widgetIframe.webSocketDebuggerUrl, 'Runtime.evaluate', {
            expression: `(() => {
              const text = document.body ? document.body.innerText.trim() : '';
              const hasTable = !!document.querySelector('table, .table, [role="table"], .grid');
              const hasCards = !!document.querySelector('.card, .stat-card, [class*="stat"], [class*="card"]');
              const hasButtons = !!document.querySelector('button, .btn');
              const isLoaded = (text.length > 30 && (hasTable || hasCards || hasButtons)) && !text.includes('Loading...');
              return { isLoaded, textLength: text.length };
            })()`,
            returnByValue: true
          });

          if (evalRes?.result?.value?.isLoaded) {
            console.log(`  Widget rendered! (textLength: ${evalRes.result.value.textLength})`);
            break;
          }
        } catch (e) {
          // Frame may be re-initialising
        }
      }
    }

    // Give 500ms for final render settles
    await sleep(500);

    // 3. Take screenshot of whole browser window
    const screenshotRes = await sendCdp(mainPage.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' });
    const screenshotPath = path.resolve(SCREENSHOT_DIR, `${slug}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotRes.data, 'base64'));
    console.log(`  Screenshot saved: ${slug}.png`);

    // 4. Extract deep specs if widget iframe exists
    if (widgetIframe) {
      try {
        const extractRes = await sendCdp(widgetIframe.webSocketDebuggerUrl, 'Runtime.evaluate', {
          expression: `(() => {
            const clean = s => s ? s.trim() : '';

            // Title & Subtitle
            const title = document.querySelector('h1, h2, .page-title, [class*="header"] h1')?.innerText?.trim() || '';
            const subtitle = document.querySelector('.page-subtitle, .subtitle, p.desc')?.innerText?.trim() || '';
            const statusBadge = document.querySelector('.status-pill, .badge, [class*="pill"]')?.innerText?.trim() || '';

            // Stat Cards
            const statCards = Array.from(document.querySelectorAll('.stat-card, .metric-card, [class*="stat"], [class*="card"]'))
              .map(c => {
                const lines = (c.innerText || '').split('\\n').map(l => l.trim()).filter(Boolean);
                if (lines.length >= 2 && lines[0].length < 50) {
                  return {
                    label: lines[0],
                    value: lines[1],
                    subtext: lines.slice(2).join(' ')
                  };
                }
                return null;
              })
              .filter(Boolean)
              .slice(0, 15);

            // Sub-tabs / Filters / View switches
            const tabs = Array.from(document.querySelectorAll('[role="tab"], .tab, .nav-tabs li, .view-btn, .pill, [class*="filter-btn"]'))
              .map(t => t.innerText?.trim())
              .filter(t => t && t.length < 50 && !t.includes('\\n'));

            // Action Buttons
            const buttons = Array.from(document.querySelectorAll('button, a.btn, [role="button"], input[type="button"]'))
              .map(b => (b.innerText || b.value || b.getAttribute('title') || b.getAttribute('aria-label') || '').trim())
              .filter(b => b && b.length < 50 && !b.includes('\\n'));

            // Table headers
            const tableHeaders = Array.from(document.querySelectorAll('th, .th, [role="columnheader"]'))
              .map(th => th.innerText?.trim())
              .filter(th => th && th.length < 60 && !th.includes('\\n'));

            // Form inputs / Filters
            const inputs = Array.from(document.querySelectorAll('input[placeholder], select'))
              .map(inp => ({
                tag: inp.tagName.toLowerCase(),
                placeholder: inp.getAttribute('placeholder') || '',
                name: inp.name || inp.id || '',
                type: inp.type || 'select'
              }));

            // Modals or hidden templates
            const modalTitles = Array.from(document.querySelectorAll('.modal h2, .modal h3, .modal-title, [class*="dialog"] h2'))
              .map(m => m.innerText?.trim()).filter(Boolean);

            return {
              title,
              subtitle,
              statusBadge,
              statCards,
              tabs: Array.from(new Set(tabs)),
              buttons: Array.from(new Set(buttons)),
              tableHeaders: Array.from(new Set(tableHeaders)),
              inputs,
              modalTitles
            };
          })()`,
          returnByValue: true
        });

        widgetData = extractRes?.result?.value;

        // Also dump full HTML
        const htmlRes = await sendCdp(widgetIframe.webSocketDebuggerUrl, 'Runtime.evaluate', {
          expression: 'document.documentElement.outerHTML',
          returnByValue: true
        });
        widgetHtml = htmlRes?.result?.value || '';
        fs.writeFileSync(path.resolve(WIDGET_DIR, `${slug}.html`), widgetHtml);
        console.log(`  Saved widget HTML: ${slug}.html (${widgetHtml.length} chars)`);
      } catch (err) {
        console.error('  Extraction error:', err.message);
      }
    }

    const item = {
      tabIndex: i + 1,
      id: tab.id,
      name: tab.name,
      hash: tab.hash,
      screenshot: `${slug}.png`,
      widget: widgetData || { note: 'Native Creator View or Widget not captured' }
    };

    specReport.push(item);
    console.log(`  Summary:`);
    console.log(`    Title: "${widgetData?.title || tab.name}"`);
    console.log(`    Stat Cards: ${widgetData?.statCards?.map(s => s.label).join(' | ') || 'None'}`);
    console.log(`    Sub-tabs/Filters: ${widgetData?.tabs?.join(' | ') || 'None'}`);
    console.log(`    Buttons: ${widgetData?.buttons?.join(' | ') || 'None'}`);
    console.log(`    Columns: ${widgetData?.tableHeaders?.slice(0, 6).join(' | ') || 'None'}`);
  }

  fs.writeFileSync('tools/procurement-deep-spec.json', JSON.stringify(specReport, null, 2));
  console.log(`\n========================================================`);
  console.log(`DONE! Full Procurement Spec saved to tools/procurement-deep-spec.json`);
}

crawl().catch(console.error);

