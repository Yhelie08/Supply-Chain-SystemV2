import fs from 'node:fs';

const res = await fetch('http://localhost:9222/json');
const targets = await res.json();
const localTab = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));

if (!localTab) {
  console.log('No localhost:5173 tab found');
  process.exit(1);
}

const ws = new WebSocket(localTab.webSocketDebuggerUrl);
let reqSeq = 0;

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++reqSeq;
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
  const routes = [
    { url: 'http://localhost:5173/#/delivery/analytics', name: 'delivery-analytics' },
    { url: 'http://localhost:5173/#/delivery/availability', name: 'delivery-availability' },
    { url: 'http://localhost:5173/#/delivery/initial', name: 'delivery-initial' },
    { url: 'http://localhost:5173/#/delivery/requests', name: 'delivery-requests' },
    { url: 'http://localhost:5173/#/delivery/appointments', name: 'delivery-appointments' },
    { url: 'http://localhost:5173/#/delivery/ongoing', name: 'delivery-ongoing' },
  ];

  for (const r of routes) {
    await send('Page.navigate', { url: r.url });
    await new Promise(res => setTimeout(res, 1200));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = `tools/screenshots/local-${r.name}.png`;
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    console.log(`Saved ${outPath}`);
  }

  ws.close();
  process.exit(0);
};
