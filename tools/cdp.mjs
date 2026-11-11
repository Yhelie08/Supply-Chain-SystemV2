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
  const [,, cmd, ...args] = process.argv;
  const pages = await getPages();
  if (pages.length === 0) {
    console.error('No page found in Chrome');
    process.exit(1);
  }

  const targetPage = pages.find((p) => p.url.includes('creatorapp') || p.url.includes('zoho')) || pages[0];
  console.log(`[Target Tab] Title: "${targetPage.title}" | URL: ${targetPage.url}`);

  if (!cmd || cmd === 'status') {
    return;
  }

  if (cmd === 'goto') {
    const url = args[0];
    const res = await sendCdpCommand(targetPage.webSocketDebuggerUrl, 'Page.navigate', { url });
    console.log('Navigated:', res);
    return;
  }

  if (cmd === 'eval') {
    const expression = args.join(' ');
    const res = await sendCdpCommand(targetPage.webSocketDebuggerUrl, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      console.error('Eval error:', res.exceptionDetails);
    } else {
      console.log(JSON.stringify(res.result?.value, null, 2));
    }
    return;
  }

  if (cmd === 'inspect') {
    const dumpFn = () => {
      const getCleanText = (el) => el.innerText?.trim() || el.textContent?.trim() || '';
      
      // Get all menus / sections / nav links
      const links = Array.from(document.querySelectorAll('a, [role="tab"], [role="button"], button'))
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          text: getCleanText(el),
          role: el.getAttribute('role'),
          href: el.getAttribute('href'),
          id: el.id,
          className: el.className
        }))
        .filter(item => item.text && item.text.length < 60 && !item.text.includes('\n'));

      // Iframes
      const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
        id: f.id,
        src: f.src,
        name: f.name
      }));

      // Headings
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(getCleanText).filter(Boolean);

      return {
        title: document.title,
        url: window.location.href,
        headings,
        iframes,
        linksCount: links.length,
        sampleLinks: links.slice(0, 50)
      };
    };

    const res = await sendCdpCommand(targetPage.webSocketDebuggerUrl, 'Runtime.evaluate', {
      expression: `(${dumpFn.toString()})()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      console.error('Inspect error:', res.exceptionDetails);
    } else {
      console.log(JSON.stringify(res.result?.value, null, 2));
    }
    return;
  }

  if (cmd === 'screenshot') {
    const filename = args[0] || 'screenshot.png';
    const res = await sendCdpCommand(targetPage.webSocketDebuggerUrl, 'Page.captureScreenshot', {
      format: 'png',
    });
    fs.writeFileSync(filename, Buffer.from(res.data, 'base64'));
    console.log(`Screenshot saved to ${filename}`);
    return;
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
