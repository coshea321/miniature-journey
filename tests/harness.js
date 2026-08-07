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

async function launch(opts) {
  const options = opts || {};
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
    // The service-worker phase also LEANS on this: it maps the production
    // hostname at the local test server, so the app's own `_isTestBuild`
    // guard sees production and registers the SW for real. Nothing leaves
    // the machine either way.
    '--host-resolver-rules=MAP * 127.0.0.1',
  ].concat(options.extraArgs || []);
  const proc = spawn(chrome, args, { stdio: 'ignore' });
  proc.on('error', (e) => {
    throw new Error('Failed to spawn Chrome (' + chrome + '): ' + e.message);
  });

  // 10s was enough locally but not on a cold GitHub runner: three of four CI
  // runs on PR #157 failed here with every mechanical check already green,
  // i.e. the suite never ran at all. A slow start is not a test failure, so
  // wait long enough to tell the two apart — a real "Chrome won't launch"
  // still fails, just 60s later instead of 10.
  const LAUNCH_TIMEOUT_MS = 60000;
  const POLL_MS = 250;
  let target;
  for (let i = 0; i < LAUNCH_TIMEOUT_MS / POLL_MS; i++) {
    await sleep(POLL_MS);
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
    throw new Error(
      'Chrome did not expose a page target within ' + LAUNCH_TIMEOUT_MS / 1000 + 's (binary: ' + chrome + ')'
    );
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

  // Navigate WITHOUT the fixed settle wait. The service-worker cases time how
  // long an open takes, so they can't have 2.5s of sleep baked into it; they
  // pair this with waitFor().
  //
  // Page.navigate does NOT resolve until the navigation response arrives, so
  // any network wait in front of the paint lands INSIDE this call — which is
  // why the offline cases must start their clock before calling it. The
  // timeout matters for the same reason: a shell fetch that never returns
  // (the uncapped lie-fi case) would otherwise hang the whole run instead of
  // failing one assertion.
  async function goto(url, timeoutMs) {
    const limit = timeoutMs || 30000;
    let timer;
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Page.navigate did not resolve within ' + limit + 'ms: ' + url)), limit);
    });
    try {
      await Promise.race([send('Page.navigate', { url }), guard]);
    } finally {
      clearTimeout(timer);
    }
  }

  // Poll an expression until it is truthy; returns how long that took (ms).
  // Errors from evaluate are swallowed on purpose — a navigation tears the
  // execution context down mid-poll, which is expected here, not a failure.
  async function waitFor(exprString, timeoutMs, pollMs) {
    const limit = timeoutMs || 10000;
    const step = pollMs || 100;
    const started = Date.now();
    let lastErr = '';
    while (Date.now() - started < limit) {
      try {
        if (await evaluate(exprString)) return Date.now() - started;
      } catch (e) {
        lastErr = e.message;
      }
      await sleep(step);
    }
    throw new Error(
      'waitFor timed out after ' + limit + 'ms: ' + exprString + (lastErr ? ' (last error: ' + lastErr + ')' : '')
    );
  }

  async function reset(url) {
    // Deliberately not `evaluate('localStorage.clear(); location.reload()')`:
    // a self-triggered reload races the in-flight evaluate response. Clearing
    // storage first (no navigation involved) then re-navigating via CDP reuses
    // the same reliable path as the initial boot.
    await evaluate('localStorage.clear();');
    await navigate(url);
  }

  // Full reset for the service-worker phase: drop every registration and cache
  // as well as localStorage, so each SW case file starts from a first-ever-visit
  // state. Unregistering does not evict the worker controlling THIS page, which
  // is why the re-navigate afterwards matters.
  async function resetSW(url) {
    await evaluate(
      'Promise.all([' +
        'navigator.serviceWorker.getRegistrations().then(function(rs){' +
          'return Promise.all(rs.map(function(r){ return r.unregister(); })); }),' +
        'caches.keys().then(function(ks){' +
          'return Promise.all(ks.map(function(k){ return caches.delete(k); })); })' +
      ']).then(function(){ localStorage.clear(); return true; })'
    );
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

  return { navigate, goto, waitFor, evaluate, reset, resetSW, pageErrors, close };
}

module.exports = { launch };
