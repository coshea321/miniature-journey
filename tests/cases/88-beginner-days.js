'use strict';

// v507 — Beginner Pull Day / Beginner Push Day, for Cathal's wife (a beginner
// with no hernia or back history). What's worth pinning:
//   1. they are their own programmes, 2 rounds per superset
//   2. they do NOT carry Cathal's clinical note (WK_TRAIN_NOTE) — that text is
//      his and would mislead her — but the original two days still do
//   3. each beginner day has its own conditioning, and Pull/Push Day keep COND_TRAIN
//   4. the intro line reads rounds/rest from the data, not a hard-coded "3 rounds"
//   5. saving records the beginner session name, so the prefill never mixes
//      her numbers with his Pull/Push Day history
//   6. both cards appear in the programme grid

module.exports = {
  name: '88-beginner-days',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function exs(t){ var o=[]; WK_TRAIN[t].supersets.forEach(function(s){ s.exercises.forEach(function(e){ o.push(e); }); }); return o; }

      ['pullb','pushb'].forEach(function(t){
        var wk = WK_TRAIN[t];
        ok(t + ' exists', !!wk);
        ok(t + ' runs 2 rounds per superset',
          wk.supersets.every(function(s){ return s.rounds === 2; }), wk.supersets.map(function(s){return s.rounds;}).join(','));
        ok(t + ' does not carry the clinical note', wk.note !== WK_TRAIN_NOTE && !/hernia/i.test(wk.note||''), (wk.note||'').slice(0,60));
        ok(t + ' has its own conditioning', wk.cond && wk.cond !== COND_TRAIN);
        var all = exs(t).concat(wk.cond.exercises);
        ok(t + ' every exercise has a cue', all.every(function(e){ return e.cue && e.cue.length > 40; }));
        ok(t + ' no clinical wording leaks into the cues',
          all.every(function(e){ return !/hernia|foramen|L4|L5|stenosis/i.test(e.cue); }));
      });
      ok('Pull/Push Day keep the clinical note',
        WK_TRAIN.pull.note === WK_TRAIN_NOTE && WK_TRAIN.push.note === WK_TRAIN_NOTE);
      ok('Pull/Push Day keep 3 rounds', WK_TRAIN.pull.supersets[0].rounds === 3 && WK_TRAIN.push.supersets[1].rounds === 3);

      // Intro and conditioning render from the beginner data
      SS = { type:'workout', wType:'pushb', wSsIdx:0, wRound:1, wPhase:'intro', wRestTime:0,
             wRestDur:0, wCondRound:1, wEntries:{}, wTyped:{}, wNotes:{}, wLast:{} };
      renderWorkoutSession();
      var h = document.getElementById('sesBody').innerHTML;
      ok('beginner intro says 2 rounds', h.indexOf('2 rounds each') !== -1, h.slice(0,200));
      ok('beginner intro shows no clinical note', h.indexOf('hernia') === -1);
      ok('beginner intro lists its own conditioning', h.indexOf('Marching in Place') !== -1);
      SS.wPhase = 'cond'; renderWorkoutSession();
      h = document.getElementById('sesBody').innerHTML;
      ok('beginner conditioning card uses the beginner cue', h.indexOf('Lowest rung') !== -1, h.slice(0,200));
      SS.wType = 'pull'; renderWorkoutSession();
      h = document.getElementById('sesBody').innerHTML;
      ok('Pull Day conditioning is unchanged', h.indexOf('lower than feels necessary') !== -1);
      SS.wPhase = 'intro'; renderWorkoutSession();
      h = document.getElementById('sesBody').innerHTML;
      ok('Pull Day intro still says 3 rounds and shows the note',
        h.indexOf('3 rounds each') !== -1 && h.indexOf('never hold your breath') !== -1);

      // Saving keeps the beginner session name; prefill matches it only
      var before = (getWD().workouts||[]).length;
      SS = { type:'workout', wType:'pullb', wSsIdx:0, wRound:1, wPhase:'log', wRestTime:0,
             wRestDur:0, wCondRound:1, wEntries:{ 'A_1_b_goblet':{reps:'10',weight:'8'} }, wTyped:{}, wNotes:{}, wLast:{} };
      try { finishWorkoutSession(false); } catch(e) { fail.push({name:'finish threw', detail:String(e)}); }
      var w = (getWD().workouts||[])[0] || {};
      ok('a beginner session saves under its own name', w.sessionName === 'Beginner Pull Day', w.sessionName);
      ok('it saves 2 sets per exercise', w.exercises && w.exercises[1].sets.length === 2);
      var last = wktLastEntries('pullb');
      ok('the next Beginner Pull Day prefills from it', last['A_1_b_goblet'] && last['A_1_b_goblet'].weight === '8', JSON.stringify(last));
      ok('Pull Day does not prefill from her session', !Object.keys(wktLastEntries('pull')).some(function(k){ return /b_/.test(k); }));
      var d = getWD(); d.workouts = d.workouts.filter(function(x){ return x !== d.workouts[0] || x.sessionName !== 'Beginner Pull Day'; }); saveWD(d);

      // Cards
      if (document.getElementById('progGrid')) {
        currentTrainView = 'programs'; renderTrainPrograms();
        var g = document.getElementById('progGrid').innerHTML;
        ok('grid shows both beginner cards', g.indexOf('Beginner Pull Day') !== -1 && g.indexOf('Beginner Push Day') !== -1);
      }
      if (typeof closeSessionOverlay === 'function') try { closeSessionOverlay(); } catch(e){}
      return { pass: pass, fail: fail };
    })()`);
  }
};
