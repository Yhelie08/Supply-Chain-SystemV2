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
    this.executionContexts = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = async () => {
        // Enable Runtime & Page domains
        await this.send('Page.enable');
        await this.send('Runtime.enable');
        resolve();
      };
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.executionContextCreated') {
          const ctx = msg.params.context;
          this.executionContexts.set(ctx.id, ctx);
        } else if (msg.method === 'Runtime.executionContextDestroyed') {
          this.executionContexts.delete(msg.params.executionContextId);
        } else if (msg.method === 'Runtime.executionContextsCleared') {
          this.executionContexts.clear();
        }

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

  async eval(expression, contextId = null) {
    const params = {
      expression,
      returnByValue: true,
      awaitPromise: true
    };
    if (contextId) params.contextId = contextId;
    const res = await this.send('Runtime.evaluate', params);
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
  console.log(`Connected to: ${target.title}`);
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();

  // Wait 500ms for execution contexts to populate
  await new Promise(r => setTimeout(r, 500));

  console.log(`Discovered ${session.executionContexts.size} execution contexts:`);
  for (const [id, ctx] of session.executionContexts.entries()) {
    console.log(`- Context ${id}: name="${ctx.name}" origin="${ctx.origin}"`);
  }

  // Get current navigation tabs
  const topNav = await session.eval(`
    (() => {
      const activeSection = document.querySelector('.zc-main-spacer-link, [class*="spacer-link"]')?.innerText?.trim() || '';
      const tabs = Array.from(document.querySelectorAll('a[href*="#Page:"]')).map(a => ({
        id: a.id,
        text: a.innerText.trim(),
        href: a.getAttribute('href'),
        active: a.classList.contains('active') || a.parentElement.classList.contains('active')
      }));
      return { activeSection, tabs };
    })()
  `);

  console.log('\nTop Nav in Zoho Creator:', JSON.stringify(topNav, null, 2));

  session.close();
};

main().catch(console.error);

