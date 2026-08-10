'use strict';

// v411 — _personalFetchOk must be set by EVERY successful read of the remote
// personal node, not only by fetchPersonal()'s first success.
//
// pushPersonal() refuses to push while _personalFetchOk is false (so we can
// never overwrite remote data we haven't seen). Before v411 exactly one place
// set it: fetchPersonal()'s success path. Two ways that left a device silently
// RECEIVE-ONLY for a whole session — it merged everything arriving from the
// other phone and sent nothing back, with no banner and no toast:
//
//   ① The first fetch failed on a network blip, then the SSE stream connected
//      fine. handlePersonalEvent applied the incoming "put" but never set the
//      flag, and startSSEFallback only re-fetches when the stream is STALE —
//      a healthy stream means fetchPersonal is never called again.
//   ② A brand-new account. Firebase REST returns literal null for a path that
//      doesn't exist yet, and the auth-failure branch signalled itself with a
//      bare null too — so an empty remote took the 401/403 exit and the flag
//      was never set. That one is permanent: every reload reads null again.
//
// As in 29-sync-paused-parity, this cannot be observed through pushPersonal()
// itself (its first guard is `if (_isTestBuild) return;` and a file:// test
// page is always a test build), so the assertions pin the flag transition that
// gates it. Section 3 keeps the auth guard honest: a real 401/403 must still
// refuse to set the flag, which is the whole reason the guard exists.

module.exports = {
  name: '40-personal-push-guard',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // Stub the network + the merge so these cases exercise the guard alone.
    // fetchPersonal is driven through its own callback (called on all three
    // exits: success, auth failure, network error).
    const setup =
      'window._t40 = {' +
      '  applyPersonal: applyPersonal, fetchWithTimeout: fetchWithTimeout,' +
      '  isLoggedIn: isLoggedIn, toast: toast, applied: 0 };' +
      'applyPersonal = function(){ window._t40.applied++; };' +
      'isLoggedIn = function(){ return true; };' +
      'toast = function(){};';
    const teardown =
      'applyPersonal = window._t40.applyPersonal;' +
      'fetchWithTimeout = window._t40.fetchWithTimeout;' +
      'isLoggedIn = window._t40.isLoggedIn;' +
      'toast = window._t40.toast;';

    // Reply with a given HTTP status and JSON body, or reject like a dead network.
    function stubFetch(status, bodyJson) {
      if (status === 'network-error') {
        return 'fetchWithTimeout = function(){ return Promise.reject(new Error("offline")); };';
      }
      return 'fetchWithTimeout = function(){ return Promise.resolve({ status: ' + status + ',' +
             ' json: function(){ return Promise.resolve(' + bodyJson + '); } }); };';
    }

    // Drive fetchPersonal once from a known-false flag and report the outcome.
    function fetchProbe(status, bodyJson) {
      return page.evaluate(
        '(function(){' + setup + stubFetch(status, bodyJson) +
        '_personalFetchOk = false;' +
        'return new Promise(function(resolve){' +
        '  var called = false;' +
        '  fetchPersonal(function(){ called = true;' +
        '    resolve({ ok: _personalFetchOk, cbCalled: called, applied: window._t40.applied }); });' +
        '  setTimeout(function(){ resolve({ ok: _personalFetchOk, cbCalled: called, timedOut: true }); }, 2000);' +
        '}).then(function(r){ ' + teardown + ' _personalFetchOk = false; return r; });' +
        '})()'
      );
    }

    // ── 1. The reported scenario: failed first fetch, then a healthy stream ──
    const blipThenStream = await page.evaluate(
      '(function(){' + setup + stubFetch('network-error', 'null') +
      '_personalFetchOk = false;' +
      'return new Promise(function(resolve){' +
      '  fetchPersonal(function(){' +
      '    var afterFailedFetch = _personalFetchOk;' +
      '    handlePersonalEvent({ type: "put", data: JSON.stringify({ path: "/", data: { health: {} } }) });' +
      '    resolve({ afterFailedFetch: afterFailedFetch, afterPut: _personalFetchOk });' +
      '  });' +
      '}).then(function(r){ ' + teardown + ' _personalFetchOk = false; return r; });' +
      '})()'
    );
    check(
      'a failed first fetch leaves the push guard closed (unchanged, and the reason the bug was invisible)',
      blipThenStream.afterFailedFetch === false,
      'got: ' + JSON.stringify(blipThenStream)
    );
    check(
      'a live SSE put then OPENS the push guard — the device is no longer stuck receive-only',
      blipThenStream.afterPut === true,
      'got: ' + JSON.stringify(blipThenStream)
    );

    // ── 2. handlePersonalEvent, per event type ─────────────────────────────
    const events = await page.evaluate(
      '(function(){' + setup +
      'var out = {};' +
      '_personalFetchOk = false;' +
      'handlePersonalEvent({ type: "put", data: JSON.stringify({ path: "/", data: { health: {} } }) });' +
      'out.putWithData = _personalFetchOk;' +
      '_personalFetchOk = false;' +
      'handlePersonalEvent({ type: "put", data: JSON.stringify({ path: "/", data: null }) });' +
      'out.putEmptyRemote = _personalFetchOk;' +
      '_personalFetchOk = false;' +
      'var origFetch = fetchPersonal; var fetched = 0;' +
      'fetchPersonal = function(){ fetched++; };' +
      'handlePersonalEvent({ type: "patch", data: JSON.stringify({ path: "/health", data: {} }) });' +
      'out.patch = _personalFetchOk; out.patchRefetched = fetched;' +
      'fetchPersonal = origFetch;' +
      '_personalFetchOk = false;' +
      'handlePersonalEvent({ type: "put", data: "{not json" });' +
      'out.malformed = _personalFetchOk;' +
      '_personalFetchOk = false;' + teardown +
      'return out;' +
      '})()'
    );
    check(
      'a put carrying data opens the guard',
      events.putWithData === true,
      'got: ' + JSON.stringify(events)
    );
    check(
      'a put for an EMPTY remote still opens the guard (a read that found nothing is still a read)',
      events.putEmptyRemote === true,
      'got: ' + JSON.stringify(events)
    );
    check(
      'a patch does NOT open the guard on its own — it is a partial update, not a full read',
      events.patch === false,
      'got: ' + JSON.stringify(events)
    );
    check(
      'a patch still delegates to fetchPersonal, which is what opens the guard properly',
      events.patchRefetched === 1,
      'got: ' + JSON.stringify(events)
    );
    check(
      'a malformed event body leaves the guard closed and does not throw',
      events.malformed === false,
      'got: ' + JSON.stringify(events)
    );

    // ── 3. fetchPersonal: the auth guard must survive the sentinel change ───
    const auth401 = await fetchProbe(401, 'null');
    check(
      '401 still refuses to open the guard (never push over data we were not allowed to read)',
      auth401.ok === false && auth401.cbCalled === true,
      'got: ' + JSON.stringify(auth401)
    );
    const auth403 = await fetchProbe(403, 'null');
    check(
      '403 still refuses to open the guard',
      auth403.ok === false && auth403.cbCalled === true,
      'got: ' + JSON.stringify(auth403)
    );
    const dead = await fetchProbe('network-error', 'null');
    check(
      'a dead network refuses to open the guard, and still runs the callback',
      dead.ok === false && dead.cbCalled === true,
      'got: ' + JSON.stringify(dead)
    );

    // ── 4. fetchPersonal: an empty remote is a success, not an auth failure ─
    const emptyRemote = await fetchProbe(200, 'null');
    check(
      'an empty remote node (200 + literal null) OPENS the guard — a new account can now push its first data up',
      emptyRemote.ok === true,
      'got: ' + JSON.stringify(emptyRemote)
    );
    check(
      'an empty remote node applies nothing (null is not merged as if it were data)',
      emptyRemote.applied === 0,
      'got: ' + JSON.stringify(emptyRemote)
    );
    const withData = await fetchProbe(200, '{ health: { bodyweight: [] } }');
    check(
      'a normal populated fetch opens the guard and applies the payload (unchanged)',
      withData.ok === true && withData.applied === 1,
      'got: ' + JSON.stringify(withData)
    );

    // ── 5. The sentinel itself ─────────────────────────────────────────────
    const sentinel = await page.evaluate(
      '(function(){ return {' +
      '  isObject: _FETCH_AUTH_FAIL !== null && typeof _FETCH_AUTH_FAIL === "object",' +
      '  notEqualNull: _FETCH_AUTH_FAIL !== null,' +
      '  notEqualEmptyObj: _FETCH_AUTH_FAIL !== {} && JSON.stringify(_FETCH_AUTH_FAIL) === "{}"' +
      '}; })()'
    );
    check(
      'the auth-failure sentinel is a private object, so no remote payload can ever be mistaken for it',
      sentinel.isObject === true && sentinel.notEqualNull === true && sentinel.notEqualEmptyObj === true,
      'got: ' + JSON.stringify(sentinel)
    );

    // Leave nothing armed for later case files sharing this page.
    await page.evaluate('(function(){ _personalFetchOk = false; syncPaused = false; return true; })()');

    return { pass, fail };
  },
};
