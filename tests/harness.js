'use strict';
// Zero-dependency CDP harness. Node >=22 only (built-in fetch + WebSocket).
// No Playwright, no npm packages, no node_modules — see HEARTH-tests-review.md §2.

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = ['/opt/pw-browsers/chromium', 'google-chrome', 'chromium-browser', 'chromium'];
  for (const c of candidates) {
    if (c.startsWith('/')) {
      if (fs.existsSync(c)) return c;
      continue;
    }
    try {
      const found = execSync('which ' + c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (found) return found;
    } catch (e) {
      // not on PATH, try next candidate
    }
  }
  throw new Error('No Chrome/Chromium binary found. Set CHROME_BIN to an explicit path.');
}

async function launch() {
  const chrome = findChrome();
  const port = 9200 + Math.floor(Math.random() * 800);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-test-'));
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=' + port,
    '--remote-allow-origins=*',
    '--user-data-dir=' + userDataDir,
    // Belt-and-braces network block — nothing should leave the machine even
    // if a future code change loosens a Firebase/fetch guard (§3).
    '--host-resolver-rules=MAP * 127.0.0.1',
  ];
  const proc = spawn(chrome, args, { stdio: 'ignore' });
  proc.on('error', (e) => {
    throw new Error('Failed to spawn Chrome (' + chrome + '): ' + e.message);
  });

  let target;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json');
      const list = await res.json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) {
      // Chrome not listening yet — keep polling.
    }
  }
  if (!target) {
    proc.kill();
    throw new Error('Chrome did not expose a page target within 10s');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', (e) => reject(new Error('CDP WebSocket error: ' + e.message)), { once: true });
  });

  let msgId = 0;
  const pending = new Map();
  const pageErrors = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      const detail =
        (d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown page error';
      pageErrors.push(String(detail));
    }
  });

  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');

  async function navigate(url) {
    await send('Page.navigate', { url });
    await sleep(2500); // fixed settle wait — the app is synchronous, no auto-wait needed
  }

  async function evaluate(exprString) {
    const result = await send('Runtime.evaluate', {
      expression: exprString,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      const detail = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'evaluate failed';
      throw new Error(String(detail));
    }
    return result.result.value;
  }

  async function reset(url) {
    // Deliberately not `evaluate('localStorage.clear(); location.reload()')`:
    // a self-triggered reload races the in-flight evaluate response. Clearing
    // storage first (no navigation involved) then re-navigating via CDP reuses
    // the same reliable path as the initial boot.
    await evaluate('localStorage.clear();');
    await navigate(url);
  }

  async function close() {
    try {
      ws.close();
    } catch (e) {
      // already closed
    }
    proc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {
      // best-effort cleanup
    }
  }

  return { navigate, evaluate, reset, pageErrors, close };
}

module.exports = { launch };
