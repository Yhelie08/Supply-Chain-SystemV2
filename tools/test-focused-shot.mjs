import fs from 'node:fs';

const res = await fetch('http://localhost:9222/json');
const targets = await res.json();
const mainPage = targets.find(t => t.type === 'page' && t.url.includes('creatorapp'));

const ws = new WebSocket(mainPage.webSocketDebuggerUrl);
ws.onopen = async () => {
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

  await send('Page.bringToFront');
  // Dispatch a scroll or resize to force repaint
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200, y: 300 });
  await new Promise(r => setTimeout(r, 1000));
  
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync('tools/screenshots/procurement/03-pr-focused.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved 03-pr-focused.png');
  ws.close();
  process.exit(0);
};

