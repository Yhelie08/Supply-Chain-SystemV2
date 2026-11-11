import fs from 'node:fs';

const getPages = async () => {
  const res = await fetch('http://localhost:9222/json');
  const data = await res.json();
  return data.filter((p) => p.type === 'page');
};

const sendCdpCommand = (wsUrl, method, params = {}) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    let timer;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { ws.close(); } catch {}
    };
    ws.onopen = () => {
      ws.send(JSON.stringify({ id, method, params }));
    };
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
      reject(new Error('CDP command timed out'));
    }, 10000);
  });
};

const main = async () => {
  const pages = await getPages();
  const targetPage = pages.find((p) => p.url.includes('creatorapp') || p.url.includes('zoho'));
  if (!targetPage) {
    console.error('No Zoho page found');
    process.exit(1);
  }

  console.log(`Attached to: ${targetPage.title} (${targetPage.url})`);

  // Let's get frame tree
  const frameTreeRes = await sendCdpCommand(targetPage.webSocketDebuggerUrl, 'Page.getFrameTree');
  console.log('Frame tree:', JSON.stringify(frameTreeRes, null, 2));
};

main().catch(console.error);

