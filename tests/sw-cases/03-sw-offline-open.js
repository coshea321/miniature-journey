'use strict';

// v376 (Release E) — opening the app on a dead or hanging connection.
//
// This is the reported symptom itself ("freezes beyond the normal amount of
// time", "sometimes doesn't open at all"), and until now nothing tested it:
// the whole point of v373's cache-first shell is that a bad connection can no
// longer delay the open, and that guarantee lived only in a comment.
//
// Two shapes, because they fail differently:
//   'hang' — the server accepts the request and never answers. This is
//            "lie-fi", the shape Cathal actually hits, and the one a
//            network-first worker handles worst (v295 capped it at 3.5s;
//            v373 removed the wait entirely).
//   'fail' — the socket is dropped immediately: plain offline.
//
// The assertion that matters is the DEADLINE. If a future change ever puts the
// network back in front of the paint, this is the test that goes red.

// The ceiling has to sit between a cache-first open (tens of ms of parse, plus
// navigation overhead) and the cheapest network-first regression there is — the
// v295 shell cap, which cost a flat 3.5s on exactly this connection. 2s leaves
// roughly an order of magnitude of headroom over a real open on a slow CI box
// while still going red on that 3.5s. Verified both ways when this was written:
// against v375's cache-first sw.js the open measures ~0.1s, and against a
// deliberately reinstated network-first shell this case fails.
const OPEN_DEADLINE_MS = 2000;

module.exports = {
  name: '03-sw-offline-open',
  async run(page) {
    const pass = [];
    const fail = [];

    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // Warm up: a normal open, so the worker is active and the shell is cached.
    // Everything below then runs with the server refusing to cooperate.
    await page.waitFor('!!navigator.serviceWorker.controller', 15000);
    await page.waitFor(
      'caches.keys().then(function(ks){ return ks.length > 0; })',
      10000
    );
    check('shell cached before the network dies', true);

    // A navigation does not swap the execution context instantly, so polling
    // "has it booted yet" can answer YES from the page we just left and time an
    // open that never happened. Stamping the outgoing document and requiring
    // the stamp to be ABSENT makes every check below land on the new one.
    let openSeq = 0;
    async function openWith(mode, label) {
      const marker = 'open-' + ++openSeq;
      await page.evaluate('window.__swTestMarker = ' + JSON.stringify(marker) + ';');

      page.server.setMode(mode);

      // Clock starts BEFORE the navigation: Page.navigate only resolves once
      // the shell response is in hand, so a network wait hides in there.
      const started = Date.now();
      let ms = -1;
      let err = '';
      try {
        await page.goto(page.appUrl, OPEN_DEADLINE_MS + 8000);
        await page.waitFor(
          'window.__swTestMarker !== ' + JSON.stringify(marker) + ' && window.__hearthSplashGone === true',
          OPEN_DEADLINE_MS + 8000,
          25
        );
        ms = Date.now() - started;
      } catch (e) {
        err = e.message;
      }
      check(label + ': the app opens at all', err === '', err);
      check(
        label + ': opens without waiting on the network (< ' + OPEN_DEADLINE_MS + 'ms)',
        err === '' && ms < OPEN_DEADLINE_MS,
        'splash took ' + ms + 'ms to clear'
      );
      if (err === '') console.log('       (' + label + ' open: ' + ms + 'ms)');

      // Splash gone is necessary but not sufficient — the failsafe can hide it
      // without the app being there. Check the real script actually ran off
      // the cached shell and rendered.
      const live = await page.evaluate(
        '(function(){ return {' +
          'booted: typeof renderHomeScreen === "function",' +
          'controlled: !!navigator.serviceWorker.controller,' +
          'label: (document.getElementById("appVersionLabel")||{}).textContent,' +
          'home: !!document.getElementById("homeWeekStrip")' +
        '}; })()'
      );
      check(label + ': the real app script ran, not just the splash failsafe', live.booted === true, 'renderHomeScreen was ' + typeof live.booted);
      check(label + ': page is served by the worker', live.controlled === true, 'no controller after the offline open');
      check(label + ': Home markup is present', live.home === true, 'homeWeekStrip missing');
      check(label + ': version label survived the cached open', /^v\d+ /.test(String(live.label || '')), 'label was "' + live.label + '"');
    }

    await openWith('hang', 'lie-fi');
    await openWith('fail', 'offline');

    // Back to a working network: the same open still works, and the worker has
    // not been knocked out by two failed background refreshes (sw.js swallows
    // them on purpose — if it ever stopped, this is where it would show).
    page.server.setMode('ok');
    await page.evaluate('window.__swTestMarker = "back-online";');
    await page.goto(page.appUrl);
    let backErr = '';
    try {
      await page.waitFor(
        'window.__swTestMarker !== "back-online" && window.__hearthSplashGone === true' +
          ' && typeof renderHomeScreen === "function"',
        10000
      );
    } catch (e) {
      backErr = e.message;
    }
    check('recovers once the network returns', backErr === '', backErr);

    const stillRegistered = await page.evaluate(
      'navigator.serviceWorker.getRegistration().then(function(r){ return !!(r && r.active); })'
    );
    check('worker survives the failed background refreshes', stillRegistered === true, 'registration was lost');

    return { pass, fail };
  },
};
