'use strict';

// v426 — the stuck-service-worker escape hatch.
//
// Background (Cathal, 18/08/2026): the Cloudflare Pages install sat on v421
// while incognito served v425, and the only known cure was unregistering the
// worker by hand in devtools. Two faults, one fixed and one made visible:
//
//   ① sw.js used cache.addAll on install — all-or-nothing. One failed asset
//      rejects the whole install, the new worker never activates, and the old
//      one serves forever with no way out from inside the app. FIXED in sw.js
//      (best-effort per-asset add).
//   ② The version label is sourced from the WORKER, and a same-or-older worker
//      is ALLOWED to write it — v382's deliberate "sw.js is the single source
//      of truth", pinned by tests/sw-cases/02-sw-update-banner.js. So a page
//      genuinely running vNEW displays a stuck worker's vOLD and looks like a
//      failed update. That rule is deliberately NOT changed here; instead
//      swVersionsAgree() drives an explicit line naming both versions, so the
//      mismatch reads as "the installer is stuck" rather than "the update
//      failed".
//
// clearAppInstall()'s real work (unregistering workers, deleting caches)
// cannot be exercised on a file:// page, so what is pinned instead is the
// property that makes it safe to put behind a button at all: it must never
// touch stored data.

module.exports = {
  name: '45-force-update',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── The version-agreement predicate ──────────────────────────────────
      // Drives the "installer stuck on vNNN" line. True only when the worker
      // and the page are on the same version number.
      var page = PAGE_VERSION;
      var n = _verNum(page);
      ok('a worker on the page version agrees', swVersionsAgree(page) === true,
        'PAGE_VERSION = ' + page);
      ok('an OLDER worker disagrees — this is the stuck case the line names',
        swVersionsAgree('v' + (n - 4) + ' · 01/01/2026') === false,
        'older worker counted as agreeing');
      ok('a NEWER worker disagrees too (mid-update, banner territory)',
        swVersionsAgree('v' + (n + 1) + ' · 01/01/2026') === false,
        'newer worker counted as agreeing');
      ok('an unparseable worker version disagrees',
        swVersionsAgree('who knows') === false, 'garbage counted as agreeing');
      ok('the same version number with a different DATE still agrees',
        swVersionsAgree('v' + n + ' · 31/12/2099') === true,
        'same-number worker counted as disagreeing');

      return { pass: pass, fail: fail };
    })()`);

    const pass = result.pass;
    const fail = result.fail;
    function check(name, ok, detail) {
      if (ok) pass.push(name); else fail.push({ name: name, detail: detail });
    }

    // ── The control exists and is wired ──────────────────────────────────────
    const wiring = await page.evaluate(
      '(function(){ return {' +
      '  btn: !!document.getElementById("forceUpdateBtn"),' +
      '  info: !!document.getElementById("swVersionInfo"),' +
      '  fn: typeof forceAppUpdate,' +
      '  clear: typeof clearAppInstall }; })()'
    );
    check('the Force app update button exists', wiring.btn === true, JSON.stringify(wiring));
    check('the version-info line exists', wiring.info === true, JSON.stringify(wiring));
    check('forceAppUpdate is top-level (callable from the click handler)',
      wiring.fn === 'function', 'typeof was ' + wiring.fn);
    check('clearAppInstall is top-level', wiring.clear === 'function', 'typeof was ' + wiring.clear);

    // ── clearAppInstall must never touch stored data ─────────────────────────
    // This is the property that makes it safe behind a button: it clears the
    // app's CACHED CODE, not the user's data, login or household code.
    const safety = await page.evaluate(
      '(function(){' +
      '  localStorage.setItem("fl4_canary_v426", JSON.stringify({keep:true}));' +
      '  localStorage.setItem("hearth_user", "canary-user");' +
      '  return clearAppInstall().then(function(r){' +
      '    var out = { resolved: r,' +
      '      data: localStorage.getItem("fl4_canary_v426"),' +
      '      login: localStorage.getItem("hearth_user") };' +
      '    localStorage.removeItem("fl4_canary_v426");' +
      '    localStorage.removeItem("hearth_user");' +
      '    return out;' +
      '  }, function(e){ return { threw: String(e) }; });' +
      '})()'
    );
    check('clearAppInstall() always resolves rather than rejecting',
      safety.resolved === true, 'got: ' + JSON.stringify(safety));
    check('clearAppInstall() leaves app data alone',
      !!safety.data, 'fl4_ canary was: ' + JSON.stringify(safety.data));
    check('clearAppInstall() leaves the login alone',
      safety.login === 'canary-user', 'hearth_user was: ' + JSON.stringify(safety.login));

    return { pass: pass, fail: fail };
  }
};
