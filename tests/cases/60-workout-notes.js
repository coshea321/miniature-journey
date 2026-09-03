'use strict';

// v456 — an optional note per exercise on the Pull/Push programmes, and a
// history card that opens to show everything that was logged.
//
// What's worth pinning:
//   1. the note key carries NO round — one note per exercise per session, so
//      the same text shows on all three rounds and saves once
//   2. finishWorkoutSession writes it onto the exercise record, trimmed, and
//      writes "" rather than dropping the key when there is no note
//   3. a note is NOT prefilled from last time the way the numbers are — last
//      week's "shoulder twinged" must never be re-saved as today's note
//   4. the history card renders a detail block, collapsed, and a tap opens it
//   5. the detail shows the sets and the note, and escapes both — a workout
//      arrives from sync and from a restored backup like anything else
//   6. a record with no exercises (cardio) opens without throwing

module.exports = {
  name: '60-workout-notes',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function ex(id){
        var found = null;
        WK_TRAIN.pull.supersets.forEach(function(s){ s.exercises.forEach(function(e){ if (e.id === id) found = e; }); });
        return found;
      }

      // ── 1. One note per exercise, not per round ─────────────────────────
      ok('the note key carries no round number',
        wktNoteKey('A', ex('rows')) === 'A_rows', wktNoteKey('A', ex('rows')));

      // ── 2. It saves onto the exercise record ────────────────────────────
      storeSet('fl4_workouts', { bodyweight: [], workouts: [] });
      SS = { type:'workout', wType:'pull', wSsIdx:0, wRound:1, wPhase:'log', wRestTime:0,
             wRestDur:0, wCondRound:1, wEntries:{}, wTyped:{}, wNotes:{}, wLast:{} };
      SS.wNotes['A_rows'] = '  Feet further forward, felt right.  ';
      finishWorkoutSession(false);

      var saved = (getWD().workouts || [])[0] || {};
      var rows = (saved.exercises || []).filter(function(e){ return e.name === 'Ring Rows'; })[0] || {};
      var bulg = (saved.exercises || []).filter(function(e){ return e.name === 'Bulgarian Split Squats'; })[0] || {};
      ok('the note is saved on its exercise, trimmed',
        rows.notes === 'Feet further forward, felt right.', JSON.stringify(rows.notes));
      ok('an exercise with no note stores an empty string, not a dropped key',
        bulg.notes === '', JSON.stringify(bulg.notes));
      ok('every exercise in the programme is still saved',
        (saved.exercises || []).length === 4, String((saved.exercises || []).length));

      // ── 3. Never prefilled from last time ───────────────────────────────
      var last = wktLastEntries('pull');
      ok('wktLastEntries carries numbers, never notes',
        JSON.stringify(last).indexOf('Feet further forward') === -1, JSON.stringify(last).slice(0, 120));

      // ── 4/5. The history card opens ─────────────────────────────────────
      storeSet('fl4_workouts', { bodyweight: [], workouts: [
        { id: 6001, date: '2026-09-01', type: 'workout', sessionName: 'Pull Day', kcal: 210, exercises: [
          { name: 'Ring Rows', sets: [ {reps:10, weight:20, duration:0}, {reps:0, weight:0, duration:0} ],
            notes: 'Shoulder <b>fine</b> today' },
          { name: 'Side Plank', sets: [ {reps:0, weight:0, duration:40} ], notes: '' }
        ]}
      ]});
      renderWorkoutHistory();
      var el   = document.getElementById('trainHistoryContent');
      var card = el.querySelector('.workout-hist-item');
      var det  = card ? card.querySelector('.whi-detail') : null;
      var tog  = card ? card.querySelector('.whi-toggle') : null;
      ok('a history card carries a detail block', !!det);
      ok('and it starts collapsed', det && det.style.display === 'none', det && det.style.display);

      tog.dispatchEvent(new MouseEvent('click', {bubbles:true}));
      ok('a tap on the summary row opens it', det.style.display === '', det.style.display);
      tog.dispatchEvent(new MouseEvent('click', {bubbles:true}));
      ok('and a second tap closes it again', det.style.display === 'none', det.style.display);

      var html = det.innerHTML;
      ok('the detail shows the reps and the weight', html.indexOf('10 reps') !== -1 && html.indexOf('20 kg') !== -1);
      ok('a duration set is shown in seconds', html.indexOf('40s') !== -1);
      ok('an unlogged set is left out rather than shown blank',
        (html.match(/whd-set-num/g) || []).length === 2, String((html.match(/whd-set-num/g) || []).length));
      ok('the volume total is shown', html.indexOf('200 kg vol') !== -1);
      ok('the note is shown', html.indexOf('Shoulder') !== -1);
      ok('and it is escaped, not rendered as markup',
        html.indexOf('&lt;b&gt;fine&lt;/b&gt;') !== -1 && html.indexOf('<b>fine</b>') === -1);
      ok('the session name and kcal head the detail',
        html.indexOf('Pull Day') !== -1 && html.indexOf('210 kcal') !== -1);

      // ── 6. A record with nothing in it ──────────────────────────────────
      var bare = wktHistoryDetailHTML({ id: 6002, date: '2026-09-02', type: 'cardio' });
      ok('a record with no exercises says so instead of throwing',
        bare.indexOf('No details recorded') !== -1, bare);
      var cardio = wktHistoryDetailHTML({ id: 6003, date: '2026-09-02', type: 'cardio',
        sessionName: 'Run', duration: 30, calories: 300 });
      ok('a cardio record shows what it does hold',
        cardio.indexOf('Run') !== -1 && cardio.indexOf('30 min') !== -1 && cardio.indexOf('300 kcal') !== -1, cardio);

      return {pass:pass, fail:fail};
    })()`);
  },
};
