'use strict';

// v376 (Release E) — the service worker actually registers, activates, takes
// control and fills its cache.
//
// None of this could be tested before: `file://` never registers a worker, so
// the freeze analysis's claim-8 verdict called this out as the real gap — the
// exact area under suspicion had zero coverage. These are the foundations the
// other two SW case files stand on.

const fs = require('fs');
const path = require('path');

const SW_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
const SW_VERSION = (/const VERSION = '([^']*)'/.exec(SW_SRC) || [])[1] || '';

module.exports = {
  name: '01-sw-registers',
  async run(page) {
    const pass = [];
    const fail = [];

    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    check('sw.js VERSION is readable', /^v\d+ · \d{2}\/\d{2}\/\d{4}$/.test(SW_VERSION), 'got "' + SW_VERSION + '"');

    // 1. The page believes it is production. If this ever goes false the rest
    //    of this file is meaningless — index.html skips SW registration
    //    entirely on a test build, which is exactly the guard that made this
    //    area untestable in the first place.
    const env = await page.evaluate(
      '(function(){ return {' +
        'secure: window.isSecureContext === true,' +
        'host: location.hostname,' +
        'testBuild: _isTestBuild,' +
        'preview: _isPreview,' +
        'tbBanner: (document.getElementById("testBuildBanner")||{style:{}}).style.display' +
      '}; })()'
    );
    check('origin is a secure context', env.secure, 'isSecureContext was ' + env.secure);
    check('served under the production hostname', env.host === 'coshea321.github.io', 'hostname was ' + env.host);
    check('app does NOT treat this as a test build', env.testBuild === false, '_isTestBuild was ' + env.testBuild);
    check('app does NOT treat this as preview', env.preview === false, '_isPreview was ' + env.preview);
    check('test-build banner stays hidden', env.tbBanner !== 'block', 'testBuildBanner display was ' + env.tbBanner);

    // 2. Registration reaches "activated", and the worker takes control of the
    //    very first load (sw.js calls clients.claim() on activate).
    let regErr = '';
    try {
      await page.waitFor(
        'navigator.serviceWorker.getRegistration().then(function(r){' +
          'return !!(r && r.active && r.active.state === "activated"); })',
        15000
      );
    } catch (e) {
      regErr = e.message;
    }
    check('service worker reaches "activated"', regErr === '', regErr);

    let ctrlErr = '';
    try {
      await page.waitFor('!!navigator.serviceWorker.controller', 10000);
    } catch (e) {
      ctrlErr = e.message;
    }
    check('worker claims the first page load', ctrlErr === '', ctrlErr);

    const scope = await page.evaluate(
      'navigator.serviceWorker.getRegistration().then(function(r){ return r ? r.scope : "none"; })'
    );
    check('registration scope is the site root', /\/$/.test(scope) && scope.indexOf(page.origin) === 0, 'scope was ' + scope);

    // 3. The cache is named from sw.js's VERSION (its single source of truth)
    //    and holds the shell — the thing that makes a dead-network open work.
    let cacheErr = '';
    try {
      await page.waitFor(
        'caches.keys().then(function(ks){ return ks.indexOf("hearth-" + ' + JSON.stringify(SW_VERSION) + ') !== -1; })',
        10000
      );
    } catch (e) {
      cacheErr = e.message;
    }
    check('cache named hearth-<sw.js VERSION> exists', cacheErr === '', cacheErr);

    const shellCached = await page.evaluate(
      'caches.open("hearth-" + ' + JSON.stringify(SW_VERSION) + ')' +
        '.then(function(c){ return c.match("./index.html"); })' +
        '.then(function(r){ return !!r; })'
    );
    check('app shell is in the cache', shellCached === true, 'index.html was not cached');

    // 4. The version label really is sourced from the worker at runtime, not
    //    just the static text in index.html (CLAUDE.md: "the in-app version
    //    label is set at runtime from the sw.js VERSION via postMessage").
    //    Blank it first, or this would pass with no worker at all.
    await page.evaluate(
      '(function(){' +
        'document.getElementById("appVersionLabel").textContent = "—";' +
        'navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" });' +
        'return true;' +
      '})()'
    );
    let labelErr = '';
    try {
      await page.waitFor(
        'document.getElementById("appVersionLabel").textContent.trim() === ' + JSON.stringify(SW_VERSION),
        8000
      );
    } catch (e) {
      labelErr = e.message;
    }
    check('version label is repopulated by the worker', labelErr === '', labelErr);

    // 5. With a worker in play the splash still goes, and a SAME-version
    //    worker must NOT raise the update banner (the v312 lesson: never
    //    banner when this page already IS the build the worker is running).
    const ui = await page.evaluate(
      '(function(){ return {' +
        'splashGone: window.__hearthSplashGone === true,' +
        'banner: (document.getElementById("updateBanner")||{style:{}}).style.display' +
      '}; })()'
    );
    check('splash hidden with a service worker active', ui.splashGone, '__hearthSplashGone was not true');
    check('same-version worker raises no update banner', ui.banner !== 'flex', 'updateBanner display was ' + ui.banner);

    return { pass, fail };
  },
};
