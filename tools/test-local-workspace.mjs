import fs from 'node:fs';
import path from 'node:path';

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

async function main() {
  const targets = await getTargets();
  let localTab = targets.find(t => t.type === 'page' && t.url.includes('5173'));

  if (!localTab) {
    console.log('No 5173 tab, looking for other tab to navigate or create target...');
    // Create new target
    const createRes = await fetch('http://localhost:9222/json/new?http://localhost:5173/#/procurement/pr', { method: 'PUT' });
    localTab = await createRes.json();
    await sleep(2000);
  } else {
    console.log('Navigating existing 5173 tab...');
    await sendCdp(localTab.webSocketDebuggerUrl, 'Page.navigate', { url: 'http://localhost:5173/#/procurement/pr' });
    await sleep(2000);
  }

  console.log('Taking screenshot of PR list with Workspace button...');
  const shot1 = await sendCdp(localTab.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' });
  if (shot1?.data) {
    fs.writeFileSync('tools/screenshots/local-pr-list.png', Buffer.from(shot1.data, 'base64'));
    console.log('Saved tools/screenshots/local-pr-list.png');
  }

  // Click on "Workspace ↗" button
  console.log('Clicking Workspace ↗ button...');
  await sendCdp(localTab.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const wsBtn = btns.find(b => b.innerText.includes('Workspace'));
      if (wsBtn) { wsBtn.click(); return 'clicked'; }
      return 'not found';
    })()`,
    returnByValue: true
  });

  await sleep(1500);

  console.log('Taking screenshot of local Decision Workspace...');
  const shot2 = await sendCdp(localTab.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' });
  if (shot2?.data) {
    fs.writeFileSync('tools/screenshots/local-pr-decision-workspace.png', Buffer.from(shot2.data, 'base64'));
    console.log('Saved tools/screenshots/local-pr-decision-workspace.png');
  }
}

main().catch(console.error);

