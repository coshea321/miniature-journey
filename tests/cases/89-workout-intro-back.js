'use strict';

// v508 — the top ‹ (sesBackBtn) on a workout's INTRO screen closes straight
// away, like the intro's own Cancel: nothing is logged before Start. Once the
// workout is under way the "Progress will be lost" confirm must still appear.

module.exports = {
  name: '89-workout-intro-back',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function overlayOpen(){ return document.getElementById('sessionOverlay').style.display === 'block'; }
      function dismissConfirm(){ var n = document.getElementById('_cfNo'); if (n) n.click(); }

      ['pull','pullb'].forEach(function(t){
        openWorkoutSession(t);
        ok(t + ': intro is showing', SS.wPhase === 'intro' && overlayOpen());
        document.getElementById('sesBackBtn').click();
        ok(t + ': back on the intro closes without a confirm', !overlayOpen() && !document.getElementById('_cfYes'));
        dismissConfirm();

        openWorkoutSession(t);
        beginWorkout();
        document.getElementById('sesBackBtn').click();
        ok(t + ': back mid-workout still asks first', !!document.getElementById('_cfYes') && overlayOpen());
        dismissConfirm();
        ok(t + ': cancelling the confirm keeps the workout open', overlayOpen() && SS.wPhase === 'log');
        closeSessionOverlay();
      });

      return { pass: pass, fail: fail };
    })()`);
  }
};
