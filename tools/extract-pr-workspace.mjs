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
  const mainPage = targets.find(t => t.type === 'page' && t.url.includes('creatorapp'));
  const widgetIframe = targets.find(t => t.type === 'iframe' && t.url.includes('sigmacdncontent'));

  console.log('Main Page:', mainPage?.title, mainPage?.url);
  console.log('Widget Iframe:', widgetIframe?.title, widgetIframe?.url);

  if (!widgetIframe) {
    console.log('No widget iframe found. Looking for all targets:');
    console.log(targets.map(t => ({ type: t.type, url: t.url })));
    return;
  }

  // 1. Inspect what is in the iframe right now
  const inspectRes = await sendCdp(widgetIframe.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `(() => {
      const text = document.body.innerText;
      const links = Array.from(document.querySelectorAll('a, button, [role="button"], tr, td')).map(el => ({
        tag: el.tagName,
        text: el.innerText?.trim()?.slice(0, 50),
        id: el.id,
        className: el.className?.toString()?.slice(0, 50)
      })).filter(x => x.text && x.text.includes('PR-'));

      return {
        title: document.title,
        heading: document.querySelector('h1, h2, h3, .title, .header')?.innerText,
        prLinks: links.slice(0, 10),
        bodySnippet: text.slice(0, 300)
      };
    })()`,
    returnByValue: true
  });

  console.log('Current iframe inspection:', JSON.stringify(inspectRes.result?.value, null, 2));
}

main().catch(console.error);

