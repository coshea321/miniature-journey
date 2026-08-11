'use strict';

// v419 — pushHousehold() must refuse to push until this device has successfully
// READ the household, mirroring the guard pushPersonal() has had since v411.
//
// Why it matters more on the household side than the personal side: the push is
// a wholesale PUT to /shared. A device holding the wrong contents (a fresh
// install, or an origin carrying leftover test-build demo data) does not merge
// itself into the household — it REPLACES it. That is exactly what happened on
// 11/08/2026 when the Cloudflare Pages origin was promoted to production with a
// demo household still in its localStorage.
//
// The two failure shapes this pins are the ones v411 catalogued for personal:
//   ① A blip on the first fetch, then a healthy SSE stream. The stream is only
//      re-fetched when it goes STALE, so without setting the flag on an
//      incoming "put" the device stays receive-only for the whole session.
//   ② An EMPTY household. Firebase REST answers a path that does not exist yet
//      with a literal null, so "null body" must NOT be read as failure — only a
//      401/403 may leave the guard closed.
//
// As in 29-sync-paused-parity and 40-personal-push-guard, the guard cannot be
// observed through pushHousehold() itself here (it returns early on
// isHouseholdSet() long before the network), so the assertions pin the flag
// transitions that gate it.

module.exports = {
  name: '41-household-push-guard',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    const setup =
      'window._t41 = {' +
      '  applyHousehold: applyHousehold, fetchWithTimeout: fetchWithTimeout,' +
      '  isLoggedIn: isLoggedIn, toast: toast, house: hearthHouse, applied: 0 };' +
      'applyHousehold = function(){ window._t41.applied++; };' +
      'isLoggedIn = function(){ return true; };' +
      'toast = function(){};' +
      'hearthHouse = "TESTHOUSE";';
    const teardown =
      'applyHousehold = window._t41.applyHousehold;' +
      'fetchWithTimeout = window._t41.fetchWithTimeout;' +
      'isLoggedIn = window._t41.isLoggedIn;' +
      'toast = window._t41.toast;' +
      'hearthHouse = window._t41.house;';

    // Reply with a given HTTP status and JSON body, or reject like a dead network.
    function stubFetch(status, bodyJson) {
      if (status === 'network-error') {
        return 'fetchWithTimeout = function(){ return Promise.reject(new Error("offline")); };';
      }
      return 'fetchWithTimeout = function(){ return Promise.resolve({ status: ' + status + ',' +
             ' json: function(){ return Promise.resolve(' + bodyJson + '); } }); };';
    }

    // Drive fetchHousehold once from a known-false flag and report the outcome.
    function fetchProbe(status, bodyJson) {
      return page.evaluate(
        '(function(){' + setup + stubFetch(status, bodyJson) +
        '_householdFetchOk = false; window._t41.applied = 0;' +
        'return new Promise(function(resolve){' +
        '  var called = false;' +
        '  fetchHousehold(function(){ called = true;' +
        '    resolve({ ok: _householdFetchOk, cbCalled: called, applied: window._t41.applied }); });' +
        '  setTimeout(function(){ resolve({ ok: _householdFetchOk, cbCalled: called, timedOut: true }); }, 2000);' +
        '}).then(function(r){ ' + teardown + ' _householdFetchOk = false; return r; });' +
        '})()'
      );
    }

    // ── 1. The flag starts closed ────────────────────────────────────────────
    const initial = await page.evaluate('(function(){ return _householdFetchOk; })()');
    check('the push guard starts closed on a fresh page', initial === false,
      '_householdFetchOk = ' + initial);

    // ── 2. A successful read opens it ────────────────────────────────────────
    const okRead = await fetchProbe(200, '{ "recipebook": [] }');
    check('a successful household read opens the push guard', okRead.ok === true,
      'got: ' + JSON.stringify(okRead));
    check('a successful household read still applies the data', okRead.applied === 1,
      'got: ' + JSON.stringify(okRead));

    // ── 3. An EMPTY household is a success, not a failure (v411 lesson ②) ────
    const emptyRead = await fetchProbe(200, 'null');
    check('an empty household (null body) still opens the push guard', emptyRead.ok === true,
      'got: ' + JSON.stringify(emptyRead));
    check('an empty household applies nothing', emptyRead.applied === 0,
      'got: ' + JSON.stringify(emptyRead));

    // ── 4. Auth failures must leave it closed ────────────────────────────────
    for (const status of [401, 403]) {
      const denied = await fetchProbe(status, 'null');
      check('a ' + status + ' leaves the push guard closed', denied.ok === false,
        'got: ' + JSON.stringify(denied));
      check('a ' + status + ' still runs the callback (so the caller is not left hanging)',
        denied.cbCalled === true, 'got: ' + JSON.stringify(denied));
      check('a ' + status + ' applies nothing', denied.applied === 0,
        'got: ' + JSON.stringify(denied));
    }

    // ── 5. A dead network leaves it closed ───────────────────────────────────
    const offline = await fetchProbe('network-error', 'null');
    check('a network error leaves the push guard closed', offline.ok === false,
      'got: ' + JSON.stringify(offline));

    // ── 6. A live SSE put opens it (v411 lesson ①) ───────────────────────────
    const blipThenStream = await page.evaluate(
      '(function(){' + setup + stubFetch('network-error', 'null') +
      '_householdFetchOk = false;' +
      'return new Promise(function(resolve){' +
      '  fetchHousehold(function(){' +
      '    var afterFailedFetch = _householdFetchOk;' +
      '    handleHouseholdEvent({ type: "put", data: JSON.stringify({ path: "/", data: { recipebook: [] } }) });' +
      '    resolve({ afterFailedFetch: afterFailedFetch, afterPut: _householdFetchOk });' +
      '  });' +
      '}).then(function(r){ ' + teardown + ' _householdFetchOk = false; return r; });' +
      '})()'
    );
    check('a failed first fetch leaves the push guard closed',
      blipThenStream.afterFailedFetch === false, 'got: ' + JSON.stringify(blipThenStream));
    check('a live SSE put then OPENS the push guard — no silent receive-only session',
      blipThenStream.afterPut === true, 'got: ' + JSON.stringify(blipThenStream));

    // ── 7. logout() closes both guards ───────────────────────────────────────
    const afterLogout = await page.evaluate(
      '(function(){' +
      'var keep = { user: hearthUser, token: hearthToken, house: hearthHouse,' +
      '             showLoginOverlay: showLoginOverlay, updateSyncStatus: updateSyncStatus };' +
      'showLoginOverlay = function(){}; updateSyncStatus = function(){};' +
      '_householdFetchOk = true; _personalFetchOk = true;' +
      'logout(true);' +
      'var out = { house: _householdFetchOk, personal: _personalFetchOk };' +
      'hearthUser = keep.user; hearthToken = keep.token; hearthHouse = keep.house;' +
      'showLoginOverlay = keep.showLoginOverlay; updateSyncStatus = keep.updateSyncStatus;' +
      'return out; })()'
    );
    check('logout() closes the household push guard', afterLogout.house === false,
      'got: ' + JSON.stringify(afterLogout));
    check('logout() closes the personal push guard too (a new session must re-read first)',
      afterLogout.personal === false, 'got: ' + JSON.stringify(afterLogout));

    return { pass: pass, fail: fail };
  }
};
