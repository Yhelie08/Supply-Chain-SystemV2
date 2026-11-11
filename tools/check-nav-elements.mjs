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
        const links = Array.from(document.querySelectorAll('a[href*="#Page:"]')).map(a => ({
          id: a.id,
          href: a.getAttribute('href'),
          text: a.innerText.trim(),
          tag: a.tagName,
          parentClass: a.parentElement ? a.parentElement.className : '',
          classes: a.className
        }));
        return links;
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

