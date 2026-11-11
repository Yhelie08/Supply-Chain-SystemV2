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
  
  // Also check if any page tab opened that is the iframe itself!
  console.log('All open tabs in Chrome:');
  pages.forEach(p => console.log(`- [${p.type}] ${p.title} (${p.url})`));

  // Let's inspect iframe in targetPage
  const evalIframe = await sendCdpCommand(targetPage.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `(() => {
      const ifr = document.querySelector('iframe#embedded-preview, iframe[name="embedded-preview"], iframe[src*="sigmacdncontent"]');
      if (!ifr) return { found: false, allIframes: Array.from(document.querySelectorAll('iframe')).map(f => f.src) };
      return {
        found: true,
        src: ifr.src,
        offsetWidth: ifr.offsetWidth,
        offsetHeight: ifr.offsetHeight,
        clientWidth: ifr.clientWidth,
        clientHeight: ifr.clientHeight,
        ready: ifr.contentDocument ? ifr.contentDocument.readyState : 'cross-origin'
      };
    })()`,
    returnByValue: true
  });
  console.log('Iframe info:', evalIframe.result.value);
};

main().catch(console.error);

