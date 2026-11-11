const res = await fetch('http://localhost:9222/json');
const targets = await res.json();
const mainPage = targets.find(t => t.type === 'page' && t.url.includes('creatorapp'));

const ws = new WebSocket(mainPage.webSocketDebuggerUrl);
ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const ifr = document.querySelector('iframe[name="embedded-preview"], iframe#embedded-preview, iframe[src*="sigmacdncontent"]');
        if (!ifr) return 'no_iframe';
        const rect = ifr.getBoundingClientRect();
        const style = window.getComputedStyle(ifr);
        return {
          id: ifr.id,
          name: ifr.name,
          src: ifr.src,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          zIndex: style.zIndex,
          parentDisplay: window.getComputedStyle(ifr.parentElement).display,
          parentHeight: ifr.parentElement.offsetHeight
        };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id === 1) {
    console.log(JSON.stringify(msg.result?.result?.value, null, 2));
    ws.close();
    process.exit(0);
  }
};

