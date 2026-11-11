import fs from 'node:fs';
import path from 'node:path';

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

async function exportWorkspace() {
  const targets = await getTargets();
  const mainPage = targets.find(t => t.type === 'page' && t.url.includes('creatorapp'));
  const widgetIframe = targets.find(t => t.type === 'iframe' && t.url.includes('sigmacdncontent'));

  if (!widgetIframe) {
    console.error('Widget iframe not found');
    return;
  }

  console.log('Extracting Decision Workspace HTML...');
  const htmlRes = await sendCdp(widgetIframe.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: 'document.documentElement.outerHTML',
    returnByValue: true
  });

  const html = htmlRes.result?.value || '';
  const outPath = path.resolve('tools/widgets/procurement/03-pr-decision-workspace.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`Saved HTML to ${outPath} (${html.length} bytes)`);

  // Also take a screenshot of the main page
  if (mainPage) {
    console.log('Taking screenshot of main page...');
    const shotRes = await sendCdp(mainPage.webSocketDebuggerUrl, 'Page.captureScreenshot', {
      format: 'png'
    });
    if (shotRes?.data) {
      const shotPath = path.resolve('tools/screenshots/procurement/03-pr-decision-workspace.png');
      fs.writeFileSync(shotPath, Buffer.from(shotRes.data, 'base64'));
      console.log(`Saved screenshot to ${shotPath}`);
    }
  }

  // Also inspect JS variables / state / assets
  const inspectRes = await sendCdp(widgetIframe.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `(() => {
      // Find all script tags
      const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src || s.innerHTML.slice(0, 200));
      // Find link tags
      const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(s => s.href || s.innerHTML.slice(0, 200));

      // Check if there are global data objects (e.g., ZC, ZOHO, appData, state)
      const globalKeys = Object.keys(window).filter(k => 
        !['window', 'document', 'location', 'top', 'parent', 'chrome'].includes(k) &&
        typeof window[k] !== 'function'
      ).slice(0, 30);

      return { scripts, styles, globalKeys };
    })()`,
    returnByValue: true
  });

  console.log('Inspection:', JSON.stringify(inspectRes.result?.value, null, 2));
}

exportWorkspace().catch(console.error);

