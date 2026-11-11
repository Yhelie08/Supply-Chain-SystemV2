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
    console.log('Connected');

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === 'Target.attachedToTarget') {
        console.log('Attached to sub-target:', msg.params.targetInfo.type, msg.params.targetInfo.url, 'sessionId:', msg.params.sessionId);
      }
      if (msg.id && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) cb.reject(msg.error);
        else cb.resolve(msg.result);
      }
    };

    // Auto attach to iframes!
    await send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    });

    const targets = await send('Target.getTargets');
    console.log('All targets:', targets.targetInfos.map(t => `[${t.type}] ${t.title} (${t.url})`));

    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 2000);
  };
};

main().catch(console.error);

