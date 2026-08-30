'use strict';

// v446 — Pull Day, Push Day and Full Body Flow reviewed against the precise
// history: a 4 cm hiatus hernia, mild bilateral L5/S1 FORAMINAL stenosis and an
// L4/L5 disc bulge.
//
// This is safety content, so it is pinned the same way the dosing literals are.
// What's worth pinning:
//   1. exercise `id`s are FROZEN — they key SS.wEntries and, through the saved
//      session, wktLastEntries' prefill. Renaming an id silently orphans
//      history; renaming a `name` only orphans the prefill, which is why all
//      three renames went through `name`
//   2. the swaps actually happened — a plain 'Rows' (unsupported bent-over,
//      loaded lumbar flexion) and a plain 'Dips' (highest intra-abdominal
//      pressure move in either day) must never come back without a fresh call,
//      and the vertical pull stays explicitly assisted
//   2b. the cues name kit he OWNS — pull-up bar, rings, step ladder. The first
//      cut of v446 cued an incline bench and a chair he does not have
//   3. every exercise in both days AND in conditioning carries a cue, and the
//      renderer shows it — a cue that exists but never reaches the screen is
//      the same as no cue
//   4. both days carry the safety note, and it still says the two things the
//      whole review turns on: breathe out / never hold your breath, and train
//      2-3 hours after eating
//   5. the Revised flow has a note, and so does flow 0 — flow 0 is deliberately
//      left unchanged, so its note is the ONLY thing telling him which four of
//      its poses to modify. An empty string there is a real regression
//   6. the Revised flow still contains no Cat-Cow and no double Knees to Chest
//      (v415 removed them; extension closes the foramen, and both thighs on the
//      abdomen is the hernia problem)

module.exports = {
  name: '55-train-safety-cues',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function exs(t){
        var out = [];
        WK_TRAIN[t].supersets.forEach(function(s){ s.exercises.forEach(function(e){ out.push(e); }); });
        return out;
      }

      // ── 1. Frozen ids ───────────────────────────────────────────────────
      ok('Pull Day exercise ids are unchanged (they key the saved history)',
        exs('pull').map(function(e){return e.id;}).join(',') === 'rows,bulgarian,pullups,glute_bridge',
        exs('pull').map(function(e){return e.id;}).join(','));
      ok('Push Day exercise ids are unchanged (they key the saved history)',
        exs('push').map(function(e){return e.id;}).join(',') === 'dips,sldl,pushups,side_plank',
        exs('push').map(function(e){return e.id;}).join(','));
      ok('conditioning ids are unchanged',
        COND_TRAIN.exercises.map(function(e){return e.id;}).join(',') === 'step_ups,marching',
        COND_TRAIN.exercises.map(function(e){return e.id;}).join(','));

      // ── 2. The two swaps ────────────────────────────────────────────────
      var rows = exs('pull').filter(function(e){ return e.id === 'rows'; })[0];
      var dips = exs('push').filter(function(e){ return e.id === 'dips'; })[0];
      var pups = exs('pull').filter(function(e){ return e.id === 'pullups'; })[0];
      ok('the row is a ring row, not a bare "Rows"',
        rows && rows.name !== 'Rows' && /ring/i.test(rows.name), rows && rows.name);
      ok('the dip is a bench dip, not a bare "Dips"',
        dips && dips.name !== 'Dips' && /bench/i.test(dips.name), dips && dips.name);
      ok('the vertical pull is assisted on purpose',
        pups && /assisted/i.test(pups.name), pups && pups.name);

      // ── 2b. The cues match the equipment he actually owns ───────────────
      // v446 first shipped a chest-supported row (needs an incline bench) and a
      // dip cued off "a bench or a sturdy chair". He has a pull-up bar, rings
      // and a step ladder. A cue that names kit he does not own is not a cue.
      ok('the row cue is written for the rings', /ring/i.test(rows.cue), rows.cue.slice(0, 80));
      ok('the dip cue is written for the step ladder', /ladder/i.test(dips.cue), dips.cue.slice(0, 80));
      ok('the dip cue still rules OUT ring dips - he owns the rings, so the temptation is real',
        /ring dips/i.test(dips.cue), dips.cue.slice(0, 120));
      var bulg = exs('pull').filter(function(e){ return e.id === 'bulgarian'; })[0];
      ok('the split-squat cue calls for a LOW rung - a high rear foot arches the back and closes the foramen',
        /low rung/i.test(bulg.cue), bulg.cue.slice(0, 90));

      // ── 3. Every exercise carries a cue, and it reaches the screen ──────
      var all = exs('pull').concat(exs('push')).concat(COND_TRAIN.exercises);
      var uncued = all.filter(function(e){ return !e.cue || !e.cue.length; }).map(function(e){ return e.id; });
      ok('every exercise in both days and conditioning has a cue', uncued.length === 0, uncued.join(','));

      // Stand SS up the way openWorkoutSession does, then render the log card
      // without the overlay, exactly as 48-workout-prefill does.
      SS = { type:'workout', wType:'push', wSsIdx:0, wRound:1, wPhase:'log', wRestTime:0,
             wRestDur:0, wCondRound:1, wEntries:{}, wTyped:{}, wLast:{} };
      renderWorkoutSession();
      var logHtml = document.getElementById('sesBody').innerHTML;
      ok('the superset card renders the cue for the exercise on screen',
        logHtml.indexOf('ss-ex-cue') !== -1 && logHtml.indexOf('parallel') !== -1,
        logHtml.slice(0, 200));

      // ── 4. The safety note, on both days and on the intro screen ────────
      ['pull','push'].forEach(function(t){
        var n = WK_TRAIN[t].note || '';
        ok(t + ' carries the safety note', n.length > 200, String(n.length));
        ok(t + ' note keeps the breathing rule',
          /never hold your breath/i.test(n), n.slice(0, 80));
        ok(t + ' note keeps the 2-3 hours after eating rule',
          /hours after eating/i.test(n), n.slice(0, 80));
      });

      SS = { type:'workout', wType:'pull', wSsIdx:0, wRound:1, wPhase:'intro', wRestTime:0,
             wRestDur:0, wCondRound:1, wEntries:{}, wTyped:{}, wLast:{} };
      renderWorkoutSession();
      var introHtml = document.getElementById('sesBody').innerHTML;
      ok('the workout intro screen renders the safety note',
        introHtml.indexOf('never hold your breath') !== -1, introHtml.slice(0, 200));

      // ── 5. Flow notes ───────────────────────────────────────────────────
      ok('YOGA_TRAIN_NOTES stays index-aligned with YOGA_FLOWS_TRAIN',
        YOGA_TRAIN_NOTES.length === YOGA_FLOWS_TRAIN.length,
        YOGA_TRAIN_NOTES.length + ' vs ' + YOGA_FLOWS_TRAIN.length);
      ok('the Revised flow note names the foraminal stenosis and the disc',
        /foraminal/i.test(YOGA_TRAIN_NOTES[2]) && /L4\\/L5/.test(YOGA_TRAIN_NOTES[2]),
        String(YOGA_TRAIN_NOTES[2]).slice(0, 120));
      ok('the ORIGINAL flow (index 0) carries its own note - it is left unchanged, so the note is the only warning',
        !!YOGA_TRAIN_NOTES[0] && YOGA_TRAIN_NOTES[0].length > 200,
        String(YOGA_TRAIN_NOTES[0]).length + '');
      ['Cat-Cow','Dead Bug','Bridge Pose','Knees to Chest'].forEach(function(pose){
        ok('flow 0 note names ' + pose, YOGA_TRAIN_NOTES[0].indexOf(pose) !== -1);
      });

      // ── 6. The Revised flow has not regained what v415 removed ─────────
      var revised = YOGA_FLOWS_TRAIN[2].map(function(p){ return p.name; });
      ok('the Revised flow still has no Cat-Cow', revised.indexOf('Cat-Cow') === -1);
      ok('the Revised flow still has no double Knees to Chest', revised.indexOf('Knees to Chest') === -1);
      ok('the Revised flow still has Cat to Neutral instead', revised.indexOf('Cat to Neutral') !== -1);

      return {pass:pass, fail:fail};
    })()`);
  },
};
