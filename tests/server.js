'use strict';
// Zero-dependency static file server for the service-worker test phase (v376,
// Release E). No npm packages, same rule as the CDP harness — see
// HEARTH-tests-review.md §2.
//
// Why this exists: a service worker cannot register on `file://`, so the whole
// SW/update/offline area of the app had zero automated coverage (the freeze
// analysis's claim-8 verdict). This serves the repo over real http so the
// browser will register `sw.js` for real.
//
// It can also misbehave on demand, which is the point:
//   setMode('ok')    — normal responses
//   setMode('hang')  — accept the request and NEVER answer it ("lie-fi", the
//                      exact connection shape Cathal reports as a freeze)
//   setMode('fail')  — drop the socket immediately (hard offline)
//   setSwVersion(v)  — serve sw.js with its VERSION line rewritten, so the
//                      browser sees a genuinely different build and runs its
//                      real update flow
//   setShellRedirect(b) — answer './' and '/index.html' with a 302 to a fake
//                      login page (v444). This is the shape an expired
//                      Cloudflare Access session has: the app's own URL
//                      redirects away, and the followed redirect is a 200.

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

// v444: see setShellRedirect below. The marker string is what the SW test
// looks for in the cache — if it ever appears there, the shell was poisoned.
const LOGIN_PROBE_PATH = '/__login-probe.html';
const LOGIN_PROBE_BODY =
  '<!DOCTYPE html><html><head><title>Sign in</title></head>' +
  '<body>HEARTH-TEST-LOGIN-PAGE</body></html>';

function startServer(root) {
  const state = { mode: 'ok', swVersion: null, shellRedirect: false };
  const sockets = new Set();
  const heldResponses = new Set(); // 'hang' mode: replies we deliberately never send

  const server = http.createServer((req, res) => {
    if (state.mode === 'fail') {
      req.socket.destroy();
      return;
    }
    if (state.mode === 'hang') {
      heldResponses.add(res);
      return; // no response, no error, no close — the request just sits there
    }

    let urlPath = decodeURIComponent(String(req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    // v444: the stand-in for Cloudflare Access's login page. Served from a
    // string rather than the repo — it must NOT be a real file, or a bug that
    // caches it would look like a legitimate asset.
    if (urlPath === LOGIN_PROBE_PATH) {
      const body = Buffer.from(LOGIN_PROBE_BODY, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }
    if (state.shellRedirect && urlPath === '/index.html') {
      res.writeHead(302, { Location: LOGIN_PROBE_PATH, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    const file = path.join(root, urlPath);

    // Never serve outside the repo, even if a test asks for it.
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    const headers = {
      'Content-Type': MIME[path.extname(file)] || 'text/plain; charset=utf-8',
      // The update tests depend on the browser re-fetching sw.js rather than
      // reusing an HTTP-cached copy. (The app also registers with
      // updateViaCache:"none", so this is belt and braces.)
      'Cache-Control': 'no-store',
    };

    if (urlPath === '/sw.js' && state.swVersion) {
      const src = fs
        .readFileSync(file, 'utf8')
        .replace(/const VERSION = '[^']*';/, "const VERSION = '" + state.swVersion + "';");
      const body = Buffer.from(src, 'utf8');
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    headers['Content-Length'] = fs.statSync(file).size;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  return {
    async listen() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      this.port = server.address().port;
      return this.port;
    },
    setMode(mode) {
      state.mode = mode;
      if (mode === 'ok') {
        // Release anything parked by a previous hang so the socket isn't left
        // half-open for the rest of the run.
        heldResponses.forEach((res) => {
          try {
            res.destroy();
          } catch (e) {
            // already gone
          }
        });
        heldResponses.clear();
      }
    },
    setSwVersion(v) {
      state.swVersion = v || null;
    },
    setShellRedirect(v) {
      state.shellRedirect = !!v;
    },
    get loginProbePath() {
      return LOGIN_PROBE_PATH;
    },
    get loginProbeMarker() {
      return 'HEARTH-TEST-LOGIN-PAGE';
    },
    reset() {
      this.setMode('ok');
      this.setSwVersion(null);
      this.setShellRedirect(false);
    },
    close() {
      this.setMode('ok');
      // close() alone waits for keep-alive connections, which never end here.
      sockets.forEach((s) => s.destroy());
      sockets.clear();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { startServer };
