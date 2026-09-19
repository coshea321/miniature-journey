'use strict';

// v476 — the Knee Programme's exercises read as short CUES by default, with the
// full paragraph one tap away under DETAILS: the same two views, and the same
// CSS classes, that Full Body Flow poses have had since v448.
//
// What's worth pinning:
//   1. all 12 Knee Programme exercises have cues, and they are short enough to
//      read at arm's length while standing on one leg
//   2. every one still carries its full paragraph, because Details must never
//      become a way to lose the original instruction
//   3. Cues is what you get on arrival, every time
//   4. the reset is DERIVED from the exercise index, not assigned at each
//      advance. There are four ways the index moves (beginPhysio, physioNext,
//      physioPrev, the timer's auto-advance) and a fifth added later must not
//      be able to inherit the previous exercise's Details view
//   5. moving between SETS of one exercise deliberately KEEPS the choice — it
//      is still the same movement
//   6. the other five programmes are untouched: no cues array, so no tabs, and
//      the paragraph renders exactly as it always has

module.exports = {
  name: '71-physio-cues-details',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function html(){ return document.getElementById('sesBody').innerHTML; }

      var kneeIdx = -1;
      PROGRAMMES_TRAIN.forEach(function(p, i){ if (p.id === 'knee_general') kneeIdx = i; });
      ok('the Knee Programme is in PROGRAMMES_TRAIN', kneeIdx !== -1, String(kneeIdx));
      var knee = PROGRAMMES_TRAIN[kneeIdx];

      // ── 1 + 2. Every exercise is cued, and keeps its paragraph ─────────
      ok('it holds 12 exercises', knee.exercises.length === 12, String(knee.exercises.length));
      var uncued = knee.exercises.filter(function(e){ return !e.cues || e.cues.length < 3; })
                                 .map(function(e){ return e.name; });
      ok('every Knee Programme exercise has at least three cues',
        uncued.length === 0, uncued.join(', '));
      var longCue = knee.exercises.filter(function(e){
        return e.cues.some(function(c){ return c.length > 90; });
      }).map(function(e){ return e.name; });
      ok('cues stay short enough to read at arm\\'s length (<= 90 chars)',
        longCue.length === 0, longCue.join(', '));
      var noDetail = knee.exercises.filter(function(e){ return !e.cue || e.cue.length < 60; })
                                   .map(function(e){ return e.name; });
      ok('every exercise still carries its full paragraph for Details',
        noDetail.length === 0, noDetail.join(', '));

      // ── 3. Cues is the default on arrival ──────────────────────────────
      openPhysioSession(kneeIdx);
      beginPhysio();
      ok('the exercise screen opens on Cues', physioExerciseView() === 'cues', physioExerciseView());
      ok('and it renders the bullet list, not the paragraph',
        html().indexOf('ycue-list') !== -1 && html().indexOf('ses-pose-cue') === -1);
      ok('both tabs are on screen', html().indexOf('>Cues<') !== -1 && html().indexOf('>Details<') !== -1);
      ok('the accent follows the programme colour, not yoga purple',
        html().indexOf('--ycue-accent:' + knee.color) !== -1);

      // ── 4. Details, and the derived reset ──────────────────────────────
      setPhysioExerciseView('details');
      ok('tapping Details switches the view', physioExerciseView() === 'details');
      ok('Details renders the paragraph and the meta line',
        html().indexOf('ses-pose-cue') !== -1 && html().indexOf('ycue-meta') !== -1 &&
        html().indexOf('ycue-list') === -1);
      ok('Details shows the original paragraph verbatim',
        html().indexOf(esc(knee.exercises[SS.pExIdx].cue)) !== -1);
      ok('a reps exercise reports reps in the meta line, not a hold',
        html().indexOf('reps') !== -1 && html().indexOf('Hold for') === -1);

      physioNext();
      ok('the NEXT exercise is back on Cues', physioExerciseView() === 'cues', physioExerciseView());
      setPhysioExerciseView('details');
      physioPrev();
      ok('and going back an exercise is on Cues too', physioExerciseView() === 'cues', physioExerciseView());

      // TRIPWIRE: the reset must come from the exercise index, not from an
      // assignment bolted onto each advance path. Move the index by hand -
      // no advance function involved - and the view must still fall back.
      setPhysioExerciseView('details');
      ok('Details is set on the current exercise', physioExerciseView() === 'details');
      SS.pExIdx = SS.pExIdx + 1;
      ok('TRIPWIRE: moving the exercise index by ANY route falls back to Cues',
        physioExerciseView() === 'cues',
        'pView=' + SS.pView + ' pViewFor=' + SS.pViewFor + ' idx=' + SS.pExIdx);
      SS.pExIdx = SS.pExIdx - 1;
      ok('returning to the exercise the choice was made on restores Details',
        physioExerciseView() === 'details');

      // ── 5. A set change keeps the choice — same movement ───────────────
      SS.pSetNum = SS.pSetNum + 1;
      ok('changing SET does NOT reset the view', physioExerciseView() === 'details',
        'set=' + SS.pSetNum);
      SS.pSetNum = 1;

      // ── A timed exercise reports a hold, not reps ──────────────────────
      var timedIdx = -1;
      knee.exercises.forEach(function(e, i){ if (timedIdx === -1 && e.type === 'timed') timedIdx = i; });
      ok('the Knee Programme has a timed exercise', timedIdx !== -1, String(timedIdx));
      SS.pExIdx = timedIdx;
      setPhysioExerciseView('details');
      ok('a timed exercise reports its hold in the meta line',
        html().indexOf('Hold for ' + knee.exercises[timedIdx].dur + ' seconds') !== -1);
      closeSessionOverlay();

      // ── 6. The other programmes are untouched ──────────────────────────
      var others = PROGRAMMES_TRAIN.filter(function(p){ return p.id !== 'knee_general'; });
      var leaked = others.filter(function(p){
        return p.exercises.some(function(e){ return e.cues && e.cues.length; });
      }).map(function(p){ return p.id; });
      ok('no other programme gained cues', leaked.length === 0, leaked.join(', '));

      var otherIdx = -1;
      PROGRAMMES_TRAIN.forEach(function(p, i){ if (otherIdx === -1 && p.id !== 'knee_general') otherIdx = i; });
      openPhysioSession(otherIdx);
      beginPhysio();
      ok('an uncued programme still shows its paragraph',
        html().indexOf('ses-pose-cue') !== -1, PROGRAMMES_TRAIN[otherIdx].id);
      ok('and gets NO tabs', html().indexOf('ycue-tab') === -1);
      closeSessionOverlay();

      return {pass:pass, fail:fail};
    })()`);
  },
};
