import fs from 'node:fs';

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

const main = async () => {
  const targets = await getTargets();
  const mainPage = targets.find(t => t.type === 'page' && t.url.includes('creatorapp'));

  // Get current iframe src
  const beforeRes = await sendCdp(mainPage.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `(() => {
      const ifr = document.querySelector('iframe[name="embedded-preview"], iframe#embedded-preview, iframe[src*="sigmacdncontent"]');
      return ifr ? ifr.src : null;
    })()`,
    returnByValue: true
  });
  const oldSrc = beforeRes.result?.value;
  console.log('Current iframe src:', oldSrc);

  console.log('Clicking #Purchase_Request...');
  await sendCdp(mainPage.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `(() => {
      const el = document.getElementById('Purchase_Request');
      if (el) { el.click(); return 'clicked'; }
      return 'not_found';
    })()`,
    returnByValue: true
  });

  // Poll until iframe src changes in main page
  let newSrc = null;
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const res = await sendCdp(mainPage.webSocketDebuggerUrl, 'Runtime.evaluate', {
      expression: `(() => {
        const ifr = document.querySelector('iframe[name="embedded-preview"], iframe#embedded-preview, iframe[src*="sigmacdncontent"]');
        return ifr ? ifr.src : null;
      })()`,
      returnByValue: true
    });
    const currentSrc = res.result?.value;
    if (currentSrc && currentSrc !== oldSrc) {
      newSrc = currentSrc;
      console.log(`New iframe src detected after ${i + 1}s:`, newSrc);
      break;
    }
  }

  // Wait 5 seconds for widget data to load
  console.log('Waiting for widget data to load...');
  await sleep(6000);

  // Take screenshot
  const screenshotRes = await sendCdp(mainPage.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('tools/screenshots/procurement/03-purchase-request-verified.png', Buffer.from(screenshotRes.data, 'base64'));
  console.log('Saved screenshot: tools/screenshots/procurement/03-purchase-request-verified.png');

  // Find the new iframe in targets
  const newTargets = await getTargets();
  const prIframe = newTargets.find(t => t.type === 'iframe' && t.url === newSrc);
  if (prIframe) {
    const textRes = await sendCdp(prIframe.webSocketDebuggerUrl, 'Runtime.evaluate', {
      expression: `document.body ? document.body.innerText.slice(0, 1000) : ''`,
      returnByValue: true
    });
    console.log('PR Widget snippet:\n', textRes.result?.value);
  } else {
    console.log('PR iframe target not found directly in /json, checking targets...');
    newTargets.forEach(t => console.log(`- [${t.type}] ${t.url}`));
  }
};

main().catch(console.error);

