'use strict';

// v422 — the service worker must not answer /cdn-cgi/ requests.
//
// /cdn-cgi/ is Cloudflare's reserved namespace, and it is where Cloudflare
// Access runs its login redirect and its /cdn-cgi/access/authorized callback.
// Those are same-origin NAVIGATIONS, so they hit the shell branch of the fetch
// handler — and that branch ends in:
//
//     caches.match(request, {ignoreSearch:true}).then(c => c || caches.match('./index.html'))
//
// i.e. ANY same-origin navigation that misses the cache is answered with our
// cached index.html. On a device that has Hearth installed, that means
// Cloudflare's login response is replaced by our own app: the round trip never
// completes and the Access cookie is never set. The user sees Hearth, or a
// broken redirect, instead of the login page.
//
// The test drives a real navigation (an iframe, which goes through the worker
// exactly as a top-level navigation does) at a /cdn-cgi/ path that does not
// exist. The local server 404s it. So:
//   passthrough working  → the iframe shows the server's "not found"
//   passthrough missing  → the iframe shows Hearth's shell from cache
//
// The precondition is asserted rather than assumed: the shell must actually BE
// cached, or the fallback could not have fired and the case would pass for the
// wrong reason.

module.exports = {
  name: '04-sw-cdn-cgi-passthrough',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // ── Precondition: worker in control, shell in the cache ──────────────────
    await page.waitFor('!!navigator.serviceWorker.controller', 15000);
    const shellCached = await page.evaluate(
      'caches.match("./index.html").then(function(r){ return !!r; })'
    );
    check('the worker controls the page', true);
    check('the shell IS cached — so the index.html fallback could fire',
      shellCached === true, 'caches.match("./index.html") gave ' + shellCached);

    // ── The navigation ───────────────────────────────────────────────────────
    const probe = await page.evaluate(
      '(function(){ return new Promise(function(resolve){' +
      '  var f = document.createElement("iframe");' +
      '  f.style.display = "none";' +
      '  var done = false;' +
      '  function finish(v){ if (done) return; done = true;' +
      '    try { document.body.removeChild(f); } catch(e){}' +
      '    resolve(v); }' +
      '  f.onload = function(){' +
      '    var hearth = null, body = "";' +
      '    try {' +
      '      var d = f.contentDocument;' +
      '      hearth = !!(d && d.getElementById("appVersionLabel"));' +
      '      body = (d && d.body ? d.body.textContent : "").slice(0, 60);' +
      '    } catch (e) { hearth = "unreadable: " + e.name; }' +
      '    finish({ hearth: hearth, body: body });' +
      '  };' +
      '  f.src = "/cdn-cgi/access/authorized-probe-" + Date.now();' +
      '  document.body.appendChild(f);' +
      '  setTimeout(function(){ finish({ timedOut: true }); }, 8000);' +
      '}); })()'
    );

    check('the /cdn-cgi/ navigation resolved', !probe.timedOut,
      'got: ' + JSON.stringify(probe));
    check('a /cdn-cgi/ navigation is NOT answered with the cached app shell',
      probe.hearth === false, 'got: ' + JSON.stringify(probe));
    check('it reached the network instead (server 404)',
      typeof probe.body === 'string' && probe.body.indexOf('not found') !== -1,
      'body was: ' + JSON.stringify(probe.body));

    return { pass: pass, fail: fail };
  }
};
