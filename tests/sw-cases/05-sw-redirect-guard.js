'use strict';

// v444 — the service worker must never cache a redirected response as the app.
//
// The shell is served CACHE-FIRST with a background refresh (v373). Before
// v444 the only condition on writing that refreshed response into the cache
// was `status === 200`. That is not enough behind an auth gate: once a
// Cloudflare Access session expires, a plain navigation to the app's own URL
// is answered with a REDIRECT to Cloudflare's login page, and the followed
// redirect is itself a perfectly ordinary 200. Caching it writes the LOGIN
// PAGE in under the app shell's key — and since the shell is served
// cache-first, the NEXT open paints the login page as the app, out of cache,
// with no network involved. It survives reloads and works offline, which is
// the worst possible combination: the only way out is unregistering the
// worker. Same shape as the v426 "wedged device" bug.
//
// The server stands in for Access: setShellRedirect(true) makes '/index.html'
// 302 to a fake login page. Then a real navigation is driven through the
// worker and the CACHE is inspected — the cache is where the damage would be,
// not the screen (the user still sees the app on this open; it is the next one
// that breaks).
//
// Two preconditions are asserted rather than assumed, or this case could pass
// for the wrong reason: (1) the shell really is cached beforehand, and (2) the
// server really is redirecting — checked over plain Node http, which does not
// go through the worker.

const http = require('http');

// The browser reaches the server through --host-resolver-rules; Node does not,
// so talk to 127.0.0.1 and carry the hostname in the Host header.
function rawGet(origin, path) {
  const port = Number(String(origin).split(':').pop());
  const host = String(origin).replace(/^https?:\/\//, '').split(':')[0];
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port: port, path: path, headers: { Host: host + ':' + port } },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body: body }));
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('raw request timed out')); });
  });
}

module.exports = {
  name: '05-sw-redirect-guard',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    const server = page.server;

    // ── Precondition 1: worker in control, and the REAL shell is cached ──────
    await page.waitFor('!!navigator.serviceWorker.controller', 15000);
    const before = await page.evaluate(
      'caches.match("./index.html").then(function(r){ return r ? r.text() : ""; })' +
      '.then(function(t){ return { cached: !!t, app: t.indexOf("appVersionLabel") !== -1,' +
      ' login: t.indexOf("HEARTH-TEST-LOGIN-PAGE") !== -1 }; })'
    );
    check('the shell is cached before the probe', before.cached === true,
      'got: ' + JSON.stringify(before));
    check('the cached shell is the real app', before.app === true,
      'got: ' + JSON.stringify(before));

    // ── Precondition 2: the server really does redirect the shell away ───────
    server.setShellRedirect(true);
    let raw = null, rawErr = null;
    try { raw = await rawGet(page.origin, '/index.html'); } catch (e) { rawErr = e.message; }
    check('the server is really 302-ing the shell (not a no-op test)',
      !!raw && raw.status === 302 && raw.location === server.loginProbePath,
      rawErr ? ('raw request failed: ' + rawErr) : ('got: ' + JSON.stringify(raw)));

    // ── Drive a real navigation through the worker ───────────────────────────
    // An iframe navigation goes through the fetch handler exactly as a
    // top-level one does. No query string: c.put() keys on the full URL, so a
    // '?probe=' would be cached under a different key and the assertion below
    // would pass without proving anything.
    const probe = await page.evaluate(
      '(function(){ return new Promise(function(resolve){' +
      '  var f = document.createElement("iframe");' +
      '  f.style.display = "none";' +
      '  var done = false;' +
      '  function finish(v){ if (done) return; done = true;' +
      '    try { document.body.removeChild(f); } catch(e){}' +
      '    resolve(v); }' +
      '  f.onload = function(){' +
      '    var app = null;' +
      '    try { var d = f.contentDocument; app = !!(d && d.getElementById("appVersionLabel")); }' +
      '    catch (e) { app = "unreadable: " + e.name; }' +
      '    finish({ app: app });' +
      '  };' +
      '  f.src = "/index.html";' +
      '  document.body.appendChild(f);' +
      '  setTimeout(function(){ finish({ timedOut: true }); }, 8000);' +
      '}); })()'
    );
    check('the navigation resolved', !probe.timedOut, 'got: ' + JSON.stringify(probe));
    check('this open still shows the app from cache (cache-first is unchanged)',
      probe.app === true, 'got: ' + JSON.stringify(probe));

    // The background refresh runs after the cached response is handed back, and
    // its cache write is not awaited by the fetch handler. Give it room to land
    // — the point is to let the BAD write happen if the guard is missing.
    await page.evaluate('new Promise(function(r){ setTimeout(r, 1500); })');

    // ── The assertion that matters: the cache was not poisoned ───────────────
    const after = await page.evaluate(
      'caches.match("./index.html").then(function(r){ return r ? r.text() : ""; })' +
      '.then(function(t){ return { cached: !!t, app: t.indexOf("appVersionLabel") !== -1,' +
      ' login: t.indexOf("HEARTH-TEST-LOGIN-PAGE") !== -1 }; })'
    );
    check('the login page was NOT written into the shell cache',
      after.login === false, 'the cached shell now contains the login page: ' + JSON.stringify(after));
    check('the cached shell is still the real app', after.app === true,
      'got: ' + JSON.stringify(after));
    check('the shell is still cached at all (offline open still works)',
      after.cached === true, 'got: ' + JSON.stringify(after));

    server.setShellRedirect(false);
    return { pass: pass, fail: fail };
  }
};
