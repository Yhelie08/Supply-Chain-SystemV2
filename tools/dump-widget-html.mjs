import fs from 'node:fs';

const res = await fetch('http://localhost:9222/json');
const targets = await res.json();
const iframe = targets.find(t => t.type === 'iframe' && t.url.includes('sigmacdncontent'));

if (!iframe) {
  console.log('No sigma iframe found');
  process.exit(1);
}

console.log('Connecting directly to iframe:', iframe.url);

const ws = new WebSocket(iframe.webSocketDebuggerUrl);
ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id === 1) {
    const html = msg.result?.result?.value || '';
    console.log(`Successfully extracted widget HTML! Length: ${html.length} characters.`);
    fs.writeFileSync('tools/screenshots/forecast-widget.html', html);
    console.log('Saved to tools/screenshots/forecast-widget.html');
    ws.close();
    process.exit(0);
  }
};
