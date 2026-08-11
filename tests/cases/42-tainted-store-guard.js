'use strict';

// v420 — a test build's demo data must not be able to leave a device that has
// since been promoted to production.
//
// The fl4_testseed marker is written ONLY by a test build, so finding it on a
// production host proves the store came from one. That is what happened on
// 11/08/2026: the Cloudflare Pages origin was seeded with the demo household
// while it was a test build, v418 made its hostname production, nothing wiped
// the store, and the demo records merged into real data and synced out.
//
// The chosen behaviour (Cathal, 11/08/2026) is deliberately NOT a boot-time
// wipe: nothing deletes itself unasked. The device stops SENDING, shows a
// banner, and clearing is a tap. So the two things worth pinning are:
//   ① while tainted, neither push function reaches the network at all;
//   ② clearTaintedStore() is inert on a healthy store — the guard that stops a
//      future edit turning this into a wipe that fires on real devices.
//
// This page (file://) is a PREVIEW, so _isTestBuild is false and _seedTainted
// is false — i.e. a healthy production-shaped store, which is exactly the
// baseline these assertions need.

module.exports = {
  name: '42-tainted-store-guard',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // ── 1. Baseline: an untainted page ───────────────────────────────────────
    const baseline = await page.evaluate(
      '(function(){' +
      'var ban = document.getElementById("seedTaintBanner");' +
      'return { tainted: _seedTainted, testBuild: _isTestBuild,' +
      '         banner: ban ? ban.style.display : "missing",' +
      '         hasBanner: !!ban }; })()'
    );
    check('the tainted-store banner element exists', baseline.hasBanner === true,
      'got: ' + JSON.stringify(baseline));
    check('an ordinary page is not tainted', baseline.tainted === false,
      '_seedTainted = ' + baseline.tainted);
    check('the tainted banner stays hidden when untainted', baseline.banner !== 'block',
      'display was ' + baseline.banner);

    // ── 2. clearTaintedStore() is inert on a healthy store ───────────────────
    // If this ever fails, a real device is one boot away from wiping itself.
    const inert = await page.evaluate(
      '(function(){' +
      'var keep = { reload: window.__reloadCount || 0 };' +
      'localStorage.setItem("fl4_canary", JSON.stringify({ keep: true }));' +
      '_seedTainted = false;' +
      'clearTaintedStore();' +
      'var survived = localStorage.getItem("fl4_canary");' +
      'localStorage.removeItem("fl4_canary");' +
      'return { survived: !!survived, reload: keep.reload }; })()'
    );
    check('clearTaintedStore() wipes nothing when the store is not tainted',
      inert.survived === true, 'got: ' + JSON.stringify(inert));

    // ── 3. While tainted, neither push reaches the network ───────────────────
    // Both pushes debounce by 800ms, so the probe waits past that before
    // deciding. The stubs stand in for the whole network layer.
    const setup =
      'window._t42 = { calls: 0, fetchWithTimeout: fetchWithTimeout, authUrl: authUrl,' +
      '                isLoggedIn: isLoggedIn, house: hearthHouse, tainted: _seedTainted,' +
      '                hFetch: _householdFetchOk, pFetch: _personalFetchOk, paused: syncPaused };' +
      'fetchWithTimeout = function(){ window._t42.calls++;' +
      '  return Promise.resolve({ status: 200, json: function(){ return Promise.resolve(null); } }); };' +
      'authUrl = function(){ return "https://example.invalid/stub.json"; };' +
      'isLoggedIn = function(){ return true; };' +
      'hearthHouse = "TESTHOUSE"; syncPaused = false;' +
      '_householdFetchOk = true; _personalFetchOk = true;';
    const teardown =
      'fetchWithTimeout = window._t42.fetchWithTimeout; authUrl = window._t42.authUrl;' +
      'isLoggedIn = window._t42.isLoggedIn; hearthHouse = window._t42.house;' +
      '_seedTainted = window._t42.tainted; _householdFetchOk = window._t42.hFetch;' +
      '_personalFetchOk = window._t42.pFetch; syncPaused = window._t42.paused;';

    function pushProbe(tainted) {
      return page.evaluate(
        '(function(){' + setup +
        '_seedTainted = ' + (tainted ? 'true' : 'false') + ';' +
        'return new Promise(function(resolve){' +
        '  try { pushHousehold(); pushPersonal(); } catch(e) { resolve({ threw: String(e) }); return; }' +
        '  setTimeout(function(){ resolve({ calls: window._t42.calls }); }, 1400);' +
        '}).then(function(r){ ' + teardown + ' return r; });' +
        '})()'
      );
    }

    const tainted = await pushProbe(true);
    check('a tainted device sends nothing — no network call from either push',
      tainted.calls === 0, 'got: ' + JSON.stringify(tainted));

    // Positive control: without the taint the same setup DOES push, so the
    // assertion above is about the guard and not about the stubs being wrong.
    const healthy = await pushProbe(false);
    check('the same setup without the taint does push (positive control)',
      healthy.calls > 0, 'got: ' + JSON.stringify(healthy));

    return { pass: pass, fail: fail };
  }
};
