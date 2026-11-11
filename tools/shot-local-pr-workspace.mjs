import fs from 'node:fs';

const res = await fetch('http://localhost:9222/json');
const targets = await res.json();
const localTab = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173'));

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
  await send('Page.bringToFront');
  await send('Page.navigate', { url: 'http://localhost:5173/#/procurement/pr' });
  await new Promise(r => setTimeout(r, 2000));

  // Click on "Workspace ↗" inside the table
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('table button')).find(b => b.innerText.includes('Workspace ↗'));
      if (btn) {
        btn.click();
        return 'clicked Workspace ↗ on ' + btn.closest('tr')?.innerText?.slice(0, 30);
      }
      return 'not found';
    })()`,
    returnByValue: true
  });
  console.log('Click result:', clickRes);

  await new Promise(r => setTimeout(r, 2000));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot?.data) {
    fs.writeFileSync('tools/screenshots/local-pr-decision-workspace-real.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved tools/screenshots/local-pr-decision-workspace-real.png');
  }

  ws.close();
  process.exit(0);
};

