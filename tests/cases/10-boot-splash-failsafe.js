'use strict';

// v356 — the boot splash must never be able to outlive the boot.
//
// Every path that hid #bootSplash used to live at the bottom of the one big
// inline script, including its own 4s/8s deadline timer. Anything that kept
// the script from reaching the bottom (an uncaught throw thousands of lines
// up) meant the deadline was never armed and the splash covered the app
// forever. These cases pin the independent failsafe that now backstops it.

module.exports = {
  name: '10-boot-splash-failsafe',
  async run(page) {
    const pass = [];
    const fail = [];

    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // 1. The failsafe exists and is reachable independently of the gate.
    const shape = await page.evaluate(
      '(function(){ return {' +
        'hide: typeof window.__hearthSplashHide,' +
        'armed: window.__hearthBootGateArmed === true,' +
        'hook: typeof window.__hearthSplashGoneHook' +
      '}; })()'
    );
    check('failsafe exposes __hearthSplashHide', shape.hide === 'function', 'got ' + shape.hide);
    check('boot gate reports itself armed', shape.armed, '__hearthBootGateArmed was not true');
    check('gate registers its sync hook', shape.hook === 'function', 'got ' + shape.hook);

    // 2. The splash is actually gone once boot has settled.
    const settled = await page.evaluate(
      '(function(){ var s = document.getElementById("bootSplash");' +
      'return s ? (s.style.display + "|" + s.style.opacity) : "missing"; })()'
    );
    check(
      'splash hidden after boot',
      settled === 'missing' || settled.indexOf('none') === 0 || settled.indexOf('|0') > 0,
      'bootSplash style was "' + settled + '"'
    );

    // 3. The failsafe can hide the splash on its own — no gate call involved.
    //    This is the path that runs when the main script never gets there.
    const solo = await page.evaluate(
      '(function(){' +
        'var s = document.getElementById("bootSplash");' +
        'if (!s) return "missing";' +
        's.style.display = "flex"; s.style.opacity = "1";' +
        'window.__hearthSplashGone = false;' +
        'window._bootSplashGone = false;' +
        'window.__hearthSplashHide();' +
        'return s.style.opacity + "|" + (window._bootSplashGone === true);' +
      '})()'
    );
    check('failsafe hides splash unaided', solo.indexOf('0|') === 0, 'opacity/hook result was "' + solo + '"');
    check('failsafe syncs the gate flag', solo.indexOf('|true') > 0, 'result was "' + solo + '"');

    // 4. Hiding is idempotent and clears the ceiling timer, so a later
    //    failsafe fire can never re-hide (or fight) an already-open app.
    const idem = await page.evaluate(
      '(function(){' +
        'window.__hearthSplashHide();' +
        'return (window.__hearthSplashGone === true) + "|" + (window.__hearthSplashTimer === null);' +
      '})()'
    );
    check('hide is idempotent', idem.indexOf('true|') === 0, 'result was "' + idem + '"');
    check('ceiling timer cleared on hide', idem.indexOf('|true') > 0, 'result was "' + idem + '"');

    // 5. v373 — startup is non-blocking: the splash hides the moment the
    //    script finishes booting (no waiting on SW/network confirmation),
    //    and the automatic boot reload is gone for good. If either of
    //    these reappears, the "app frozen on open" class is back.
    const nb = await page.evaluate(
      '(function(){ return {' +
        'gone: window.__hearthSplashGone === true,' +
        'staleReload: typeof window.bootStaleReload,' +
        'deadline: typeof window._bootDeadline' +
      '}; })()'
    );
    check('splash hidden without any SW confirmation', nb.gone, '__hearthSplashGone was not true after boot');
    check('boot-time auto reload removed', nb.staleReload === 'undefined', 'bootStaleReload still exists: ' + nb.staleReload);
    check('blocking deadline timer removed', nb.deadline === 'undefined', '_bootDeadline still exists: ' + nb.deadline);

    return { pass, fail };
  },
};
