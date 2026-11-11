import fs from 'node:fs';

const res = await fetch('http://localhost:9222/json');
const targets = await res.json();
const localTab = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));

if (!localTab) {
  console.log('Local tab not found');
  process.exit(1);
}

const ws = new WebSocket(localTab.webSocketDebuggerUrl);

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.onopen = async () => {
  // First, bring tab to front
  await send('Page.bringToFront');
  await send('Page.navigate', { url: 'http://localhost:5173/#/procurement/pr' });
  await new Promise(r => setTimeout(r, 2000));

  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot1?.data) {
    fs.writeFileSync('tools/screenshots/local-pr-page.png', Buffer.from(shot1.data, 'base64'));
    console.log('Saved tools/screenshots/local-pr-page.png');
  }

  // Click on "Workspace ↗"
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const wsBtn = btns.find(b => b.innerText.includes('Workspace'));
      if (wsBtn) {
        wsBtn.click();
        return 'clicked: ' + wsBtn.innerText;
      }
      return 'not found';
    })()`,
    returnByValue: true
  });
  console.log('Click result:', clickRes);

  await new Promise(r => setTimeout(r, 2000));

  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot2?.data) {
    fs.writeFileSync('tools/screenshots/local-pr-workspace.png', Buffer.from(shot2.data, 'base64'));
    console.log('Saved tools/screenshots/local-pr-workspace.png');
  }

  ws.close();
  process.exit(0);
};

