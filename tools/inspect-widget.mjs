import fs from 'node:fs';

const getPages = async () => {
  const res = await fetch('http://localhost:9222/json');
  const data = await res.json();
  return data.filter((p) => p.type === 'page');
};

const main = async () => {
  const pages = await getPages();
  const targetPage = pages[0];

  const ws = new WebSocket(targetPage.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}, sessionId = undefined) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    });
  }

  ws.onopen = async () => {
    ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo } = msg.params;
        if (targetInfo.url.includes('sigmacdncontent')) {
          console.log(`Found Widget iframe session: ${sessionId}`);
          
          // Enable Runtime in iframe session
          await send('Runtime.enable', {}, sessionId);

          // Evaluate inside iframe
          const res = await send('Runtime.evaluate', {
            expression: `(() => {
              const text = document.body ? document.body.innerText : 'NO_BODY';
              const html = document.body ? document.body.innerHTML.slice(0, 1000) : 'NO_HTML';
              const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]')).map(b => b.innerText?.trim()).filter(Boolean);
              const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, [class*="title"]')).map(h => h.innerText?.trim()).filter(Boolean);
              const tabs = Array.from(document.querySelectorAll('[role="tab"], .tab, [class*="tab"]')).map(t => t.innerText?.trim()).filter(Boolean);
              return { text, htmlSnippet: html, buttons, headings, tabs };
            })()`,
            returnByValue: true
          }, sessionId);

          console.log('Widget contents:', JSON.stringify(res.result?.value, null, 2));
          ws.close();
          process.exit(0);
        }
      }
      if (msg.id && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) cb.reject(msg.error);
        else cb.resolve(msg.result);
      }
    };

    await send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    });
  };
};

main().catch(console.error);

