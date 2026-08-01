'use strict';

// v376 (Release E) — the "old page, new service worker" scenario, both ways
// round. This is claim 8's headline missing scenario and it pins the v312
// lesson that v373 deliberately carried over into showUpdateBanner():
//
//   banner ONLY when the worker announces a STRICTLY newer build.
//
// The direction matters. Bannering on an OLDER worker would nag on every open
// while a new build is still installing; bannering on the SAME version was the
// original v312 stale-flash bug. The comparison is numeric on the vNNN prefix
// (_verNum), and nothing but a real update flow exercises it — so this test
// makes the server hand the browser a genuinely different sw.js and lets the
// browser's own update machinery do the rest.

const OLDER = 'v001 · 01/01/2020';
const NEWER = 'v999 · 01/01/2030';

module.exports = {
  name: '02-sw-update-banner',
  async run(page) {
    const pass = [];
    const fail = [];

    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    function bannerShown() {
      return page.evaluate('(document.getElementById("updateBanner")||{style:{}}).style.display === "flex"');
    }

    // The page's own version, captured at boot — everything below is compared
    // against this, so record what the app actually thinks it is.
    const pageVersion = await page.evaluate('PAGE_VERSION');
    check('page reports its own version', /^v\d+ /.test(String(pageVersion)), 'PAGE_VERSION was "' + pageVersion + '"');

    await page.waitFor('!!navigator.serviceWorker.controller', 15000);
    check('baseline: no banner before any update', (await bannerShown()) === false, 'banner was already showing');

    // Swap in a worker that announces an OLDER build, then let the browser
    // find it. When it activates it claims the page, the page asks for its
    // version, and the label flips — that flip is our signal that the whole
    // update round trip completed, so the "no banner" check below is a real
    // assertion rather than a race we won.
    async function installWorkerAnnouncing(version) {
      page.server.setSwVersion(version);
      await page.evaluate('document.getElementById("appVersionLabel").textContent = "—";');
      await page.evaluate(
        'navigator.serviceWorker.getRegistration().then(function(r){ return r.update(); }).then(function(){ return true; })'
      );
      await page.waitFor(
        'document.getElementById("appVersionLabel").textContent.trim() === ' + JSON.stringify(version),
        20000
      );
    }

    let olderErr = '';
    try {
      await installWorkerAnnouncing(OLDER);
    } catch (e) {
      olderErr = e.message;
    }
    check('an older build installs and announces itself', olderErr === '', olderErr);
    check(
      'OLDER worker raises no update banner',
      olderErr === '' && (await bannerShown()) === false,
      'updateBanner appeared for ' + OLDER + ' while the page is ' + pageVersion
    );

    // Now a genuinely newer build. Same machinery, opposite expectation.
    let newerErr = '';
    try {
      await installWorkerAnnouncing(NEWER);
    } catch (e) {
      newerErr = e.message;
    }
    check('a newer build installs and announces itself', newerErr === '', newerErr);

    let bannerErr = '';
    try {
      await page.waitFor(
        '(document.getElementById("updateBanner")||{style:{}}).style.display === "flex"',
        10000
      );
    } catch (e) {
      bannerErr = e.message;
    }
    check('NEWER worker raises the update banner', bannerErr === '', bannerErr);

    // The banner is the whole point of v373's trade-off (open instantly, offer
    // the newer build) — so it must both offer the refresh and be dismissable,
    // never a permanent bar. The Refresh button is checked but NOT clicked:
    // reloading here would tear down the page mid-case.
    const offersRefresh = await page.evaluate(
      '(function(){' +
        'var btns = document.querySelectorAll("#updateBanner button");' +
        'for (var i = 0; i < btns.length; i++) {' +
          'if ((btns[i].getAttribute("onclick") || "").indexOf("reload") !== -1) return true;' +
        '}' +
        'return false;' +
      '})()'
    );
    check('update banner offers a refresh', offersRefresh === true, 'no reload button found in #updateBanner');

    const dismissed = await page.evaluate(
      '(function(){' +
        'var b = document.getElementById("updateBanner");' +
        'var btns = b ? b.querySelectorAll("button") : [];' +
        'for (var i = 0; i < btns.length; i++) {' +
          'if ((btns[i].getAttribute("onclick") || "").indexOf("display") !== -1) {' +
            'btns[i].click();' +
            'return b.style.display;' +
          '}' +
        '}' +
        'return "no dismiss button";' +
      '})()'
    );
    check('update banner can be dismissed', dismissed === 'none', 'display after dismiss was "' + dismissed + '"');

    return { pass, fail };
  },
};
