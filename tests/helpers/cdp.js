/* =========================================================
 * cdp.js —— 极简 Chrome DevTools Protocol 客户端（Node 22 全局 WebSocket）
 *
 * 用于 E2E 冒烟测试：驱动 headless Edge，执行页面导航、
 * Runtime.evaluate 断言、收集页面异常 / console 错误。
 * ========================================================= */

export class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.listeners = {};
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')));
      this.ws.addEventListener('message', (ev) => this._onMessage(ev.data));
    });
  }

  _onMessage(data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.id) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error('CDP error: ' + JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    } else if (msg.method) {
      (this.listeners[msg.method] || []).forEach((fn) => fn(msg.params));
    }
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    (this.listeners[method] = this.listeners[method] || []).push(fn);
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

/** 在页面中执行表达式并取回值（awaitPromise 支持异步表达式） */
export async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (r.exceptionDetails) {
    throw new Error('页面执行异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
  }
  return r.result && r.result.value;
}

/** 导航并等待页面加载完成 */
export async function navigateAndWait(cdp, url) {
  const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
  await cdp.send('Page.navigate', { url });
  await loaded;
}
