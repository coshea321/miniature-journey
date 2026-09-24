'use strict';

// v482 — Train › Pull-up Plan: a 4-week, 12-session tracker, and the one
// programme that keeps its progress between visits (fl4_pullup).
//
// What's worth pinning:
//   1. the plan shape: 4 weeks × 3 sessions, and ONLY Week 4 Session 3 carries
//      the strict pull-up attempt and its result box
//   2. every exercise has a how-to guide, and the guides keep the hernia rule
//      (breath) — the adaptation is the point, not decoration
//   3. ticking a set updates the session count and the overall count, and the
//      ticks persist in fl4_pullup
//   4. finishing a session saves exactly ONE History entry; untick + retick
//      does not save it again, but deleting it from History and finishing
//      again does
//   5. Reset asks first: Cancel keeps everything, OK clears ticks and result
//      but leaves History alone
//   6. the data is in the export payload and restores additively; a corrupt
//      stored value reads as no progress rather than throwing
//   7. the Details view resets by derivation, like the physio screen

module.exports = {
  name: '77-pullup-plan',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function html(){ return document.getElementById('sesBody').innerHTML; }
      function count(sel){ return document.querySelectorAll('#sesBody '+sel).length; }
      function rulesOpen(){ var d = document.querySelector('#sesBody details.pu-rules'); return !!(d && d.open); }
      function tickAll(w, s){
        pullupSessionExercises(w, s).forEach(function(ex, e){
          for (var i=0;i<ex.sets;i++) if (!(pullupState().checks[w+'-'+s+'-'+e]||[])[i]) pullupTick(w+'-'+s+'-'+e, i);
        });
      }
      function planEntries(){ return (getWD().workouts||[]).filter(function(x){ return x && /^Pull-up Plan/.test(x.sessionName||''); }); }
      function clickDialog(id){ var b = document.getElementById(id); if (b) b.click(); return !!b; }

      storeSet('fl4_pullup', null); storeSet('fl4_pullup_open', null);
      var wd = getWD(); wd.workouts = (wd.workouts||[]).filter(function(x){ return !/^Pull-up Plan/.test(x.sessionName||''); }); saveWD(wd);

      // ── 1. Shape ────────────────────────────────────────────────────────
      ok('12 sessions in total', pullupTotalSessions() === 12, String(pullupTotalSessions()));
      var withTest = [];
      pullupEachSession(function(w, s, exs){ if (exs.some(function(e){ return e.id === 'test'; })) withTest.push(w+'-'+s); });
      ok('only Week 4 Session 3 has the test attempt', withTest.join(',') === '3-2', withTest.join(','));
      ok('Week 1 is 4 exercises of 3 sets', pullupSessionExercises(0,0).length === 4 &&
        pullupSessionExercises(0,0).every(function(e){ return e.sets === 3; }));
      ok('Week 3 negatives are 4 sets of 3', pullupSessionExercises(2,0)[0].sets === 4 && pullupSessionExercises(2,0)[0].target === '3');

      // ── 2. Guides ───────────────────────────────────────────────────────
      var missing = [];
      pullupEachSession(function(w, s, exs){ exs.forEach(function(e){ if (!PULLUP_GUIDE[e.id]) missing.push(e.id); }); });
      ok('every exercise has a how-to guide', missing.length === 0, missing.join(','));
      ok('the flexed-arm hang guide keeps the breath rule', /hold(ing)? your breath/i.test(PULLUP_GUIDE['flexed-hang'].cue));
      ok('the test attempt stops on a held breath', /held breath|holding your breath/i.test(PULLUP_GUIDE.test.cue));
      ok('no guide prescribes a table edge', !Object.keys(PULLUP_GUIDE).some(function(k){ return /table/i.test(PULLUP_GUIDE[k].cue); }));

      // ── 3. Card + ticking ───────────────────────────────────────────────
      currentTrainView = 'programs'; renderTrainPrograms();
      var card = document.querySelector("#progGrid .prog-card[data-type='pullup']");
      ok('the Programs grid has a Pull-up Plan card', !!card);
      ok('the card shows 0 of 12', card && /0 of 12 sessions/.test(card.textContent), card && card.textContent);
      if (card) card.click();
      ok('the card opens the plan in the session overlay', SS.type === 'pullup' &&
        document.getElementById('sessionOverlay').style.display === 'block');
      ok('first visit opens Week 1 Session 1', count('.pu-ex') === 4, String(count('.pu-ex')));
      ok('rules are open before the first tick', rulesOpen());
      ok('the hernia note is on the plan', html().indexOf('hiatus hernia') !== -1);
      ok('sets are 44px toggles', count('.pu-set') === 12, String(count('.pu-set')));

      pullupTick('0-0-0', 0);
      ok('a tick persists', (storeGet('fl4_pullup').checks['0-0-0']||[])[0] === true);
      ok('the session reads 1/12 sets', html().indexOf('1/12 sets') !== -1);
      ok('the rules fold away after a tick', !rulesOpen());
      pullupTick('0-0-0', 0);
      ok('tapping again unticks', (storeGet('fl4_pullup').checks['0-0-0']||[])[0] === false);

      // ── 4. Completion saves one History entry ───────────────────────────
      tickAll(0, 0);
      ok('the finished session reads Done', html().indexOf('&#x2713; Done') !== -1 || html().indexOf('\\u2713 Done') !== -1);
      ok('overall reads 1 of 12', html().indexOf('1 of 12 sessions') !== -1);
      ok('finishing saved one History entry', planEntries().length === 1, String(planEntries().length));
      var ent = planEntries()[0];
      ok('the entry is named by week and session', ent && ent.sessionName === 'Pull-up Plan · Week 1 · Session 1', ent && ent.sessionName);
      ok('its sets render as ticked targets', ent && wktSetText(ent.exercises[0].sets[0]) === '20–30s \\u2713', ent && wktSetText(ent.exercises[0].sets[0]));
      pullupTick('0-0-0', 0); pullupTick('0-0-0', 0);
      ok('TRIPWIRE: untick + retick does not save it twice', planEntries().length === 1, String(planEntries().length));
      wd = getWD(); wd.workouts = wd.workouts.filter(function(x){ return x.id !== ent.id; }); saveWD(wd);
      pullupTick('0-0-0', 0); pullupTick('0-0-0', 0);
      ok('after a History delete, finishing again saves it again', planEntries().length === 1, String(planEntries().length));

      // ── Week 4 Session 3: test + result ─────────────────────────────────
      pullupToggleSession('3-2');
      ok('one session open at a time', count('.pu-ex') === 4, String(count('.pu-ex')));
      ok('the open session is remembered', storeGet('fl4_pullup_open') === '3-2');
      ok('W4S3 shows the test attempt and a result box', html().indexOf('Strict pull-up attempt') !== -1 && html().indexOf('pu-test-inp') !== -1);
      tickAll(3, 2);
      pullupSetTest('  chin to the bar, not over  ');
      ok('the result is stored trimmed', pullupState().test === 'chin to the bar, not over');
      var t = planEntries().filter(function(x){ return /Week 4 · Session 3/.test(x.sessionName); })[0];
      var tex = t && t.exercises.filter(function(e){ return e.name === 'Strict pull-up attempt'; })[0];
      ok('a result typed after finishing reaches the History entry', tex && tex.notes === 'chin to the bar, not over', tex && tex.notes);

      // ── 7. Details view derives its reset ───────────────────────────────
      pullupToggleHow('3-2-0'); setPullupHowView('details', '3-2-0');
      ok('Details shows on the guide it was picked on', pullupHowView('3-2-0') === 'details');
      pullupToggleHow('3-2-1');
      ok('TRIPWIRE: another guide opens on Cues', pullupHowView('3-2-1') === 'cues');

      // ── 6. Export / import / corrupt ────────────────────────────────────
      var pay = buildExportPayload();
      ok('the export payload carries pullup', pay.pullup && pay.pullup.checks && pay.pullup.checks['0-0-0'][0] === true);
      ok('fl4_pullup_open is not exported', JSON.stringify(pay).indexOf('pullup_open') === -1);
      var snap = JSON.parse(JSON.stringify(pay.pullup));
      storeSet('fl4_pullup', { checks:{ '1-0-0':[true,false,false] }, test:'', logged:{} });
      var n = importBackupData({ pullup:snap });
      ok('restore is additive: the local tick survives', pullupState().checks['1-0-0'][0] === true);
      ok('restore brings back the file ticks', pullupState().checks['0-0-0'][0] === true && pullupState().test === 'chin to the bar, not over');
      ok('restore counts the ticks it added', n.pullup > 0 && /pull-up set/.test(importedSummary(n)), importedSummary(n));
      storeSet('fl4_pullup', { checks:{ '9-9-9':[true], '0-0-0':'yes', '0-0-1':[1,true,'x',true,true] }, test:42 });
      var bad = pullupState();
      ok('corrupt data reads safely', !bad.checks['9-9-9'] && !bad.checks['0-0-0'] && bad.test === '' &&
        bad.checks['0-0-1'].join(',') === 'false,true,false', JSON.stringify(bad));

      // ── 5. Reset asks first ─────────────────────────────────────────────
      storeSet('fl4_pullup', snap);
      var before = planEntries().length;
      pullupReset(); clickDialog('_cfNo');
      ok('Cancel keeps the progress', pullupSessionsDone(pullupState()) > 0);
      pullupReset(); clickDialog('_cfYes');
      ok('OK clears every tick and the result', pullupSessionsDone(pullupState()) === 0 &&
        Object.keys(pullupState().checks).length === 0 && pullupState().test === '');
      ok('Reset leaves History alone', planEntries().length === before, before + ' -> ' + planEntries().length);

      document.getElementById('sesBackBtn').click();
      ok('back closes the plan without a confirm', document.getElementById('sessionOverlay').style.display === 'none' && !document.getElementById('_cfYes'));
      storeSet('fl4_pullup', null); storeSet('fl4_pullup_open', null);
      return {pass:pass, fail:fail};
    })()`);
  },
};
