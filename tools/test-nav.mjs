import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('tools/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const getTargetPage = async () => {
  const res = await fetch('http://localhost:9222/json');
  const data = await res.json();
  const pages = data.filter((p) => p.type === 'page');
  const target = pages.find((p) => p.url.includes('creatorapp') || p.url.includes('zoho'));
  if (!target) throw new Error('No Zoho Creator page found in Chrome');
  return target;
};

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = async () => {
        await this.send('Page.enable');
        await this.send('Runtime.enable');
        resolve();
      };
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
      this.ws.onerror = (err) => reject(err);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`Timeout waiting for ${method} (${id})`));
      }, 15000);

      this.callbacks.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async screenshot(filename) {
    const filepath = path.resolve(SCREENSHOT_DIR, filename);
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
    return filepath;
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

const main = async () => {
  const target = await getTargetPage();
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();

  console.log('Navigating to Inquiry List (#Page:Inquiry)...');
  // Click the tab in the UI
  await session.eval(`
    (() => {
      const el = document.querySelector('a[href="#Page:Inquiry"], #Inquiry');
      if (el) {
        el.click();
        return 'Clicked #Inquiry';
      }
      window.location.hash = '#Page:Inquiry';
      return 'Set hash to #Page:Inquiry';
    })()
  `);

  // Wait 3 seconds for page and any iframe to load
  await new Promise(r => setTimeout(r, 3000));

  await session.screenshot('02-inquiry-list.png');
  console.log('Screenshot saved: 02-inquiry-list.png');

  // Check what is in the main document or iframe
  const pageState = await session.eval(`
    (() => {
      const title = document.title;
      const url = window.location.href;
      const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
        id: f.id,
        src: f.src,
        name: f.name
      }));
      const text = document.body.innerText.slice(0, 500);
      return { title, url, iframes, textSnippet: text };
    })()
  `);

  console.log('Page State:', JSON.stringify(pageState, null, 2));

  session.close();
};

main().catch(console.error);

