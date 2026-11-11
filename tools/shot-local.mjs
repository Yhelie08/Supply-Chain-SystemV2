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
    const id = Date.now();
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
  await send('Page.navigate', { url: 'http://localhost:5173/#/procurement/inquiry' });
  await new Promise(r => setTimeout(r, 1500));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('tools/screenshots/local-inquiry-page.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved tools/screenshots/local-inquiry-page.png');
  ws.close();
  process.exit(0);
};

