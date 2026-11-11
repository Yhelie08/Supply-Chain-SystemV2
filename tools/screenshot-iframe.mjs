import fs from 'node:fs';

const res = await fetch('http://localhost:9222/json');
const targets = await res.json();
const iframe = targets.find(t => t.type === 'iframe' && t.url.includes('sigmacdncontent'));

if (!iframe) {
  console.log('No sigma iframe found');
  process.exit(1);
}

console.log('Connecting to iframe target:', iframe.url);
const ws = new WebSocket(iframe.webSocketDebuggerUrl);

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Page.captureScreenshot',
    params: { format: 'png' }
  }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id === 1) {
    if (msg.result?.data) {
      fs.writeFileSync('tools/screenshots/procurement/03-pr-iframe.png', Buffer.from(msg.result.data, 'base64'));
      console.log('Successfully saved tools/screenshots/procurement/03-pr-iframe.png');
    } else {
      console.error('No screenshot data:', msg);
    }
    ws.close();
    process.exit(0);
  }
};

