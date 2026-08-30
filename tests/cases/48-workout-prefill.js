'use strict';

// v437 — Push/Pull days open pre-filled with last time's numbers, and the rest
// between sets is 90s rather than 50s.
//
// What's worth pinning:
//   1. the prefill is a REAL VALUE in SS.wEntries, not a grey placeholder — a
//      round you don't touch has to save what it shows, which is the whole
//      point ("I don't need to add, only edit if needed")
//   2. it matches last time's SAME round, per exercise, by name — not the
//      first set of the workout smeared across all three rounds
//   3. a number typed today beats last time's number for later rounds; a
//      merely pre-filled one does not, so dropping the weight in round 1
//      carries down but an untouched round 1 leaves round 2 on its own history
//   4. a blank field last time stays blank — 0 is not a rep count
//   5. free-form log entries are not workout sessions and must never be the
//      source of a prefill (they carry no sessionName)
//   6. restSec is 90 on every superset

module.exports = {
  name: '48-workout-prefill',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function ex(id){
        var found = null;
        WK_TRAIN.pull.supersets.forEach(function(s){ s.exercises.forEach(function(e){ if (e.id === id) found = e; }); });
        return found;
      }
      // Stand SS up the way openWorkoutSession does, without the overlay.
      function session(){
        SS = { type:'workout', wType:'pull', wSsIdx:0, wRound:1, wPhase:'log', wRestTime:0,
               wRestDur:0, wCondRound:1, wEntries:{}, wTyped:{}, wLast:wktLastEntries('pull') };
      }

      // ── 6. The rest timer ───────────────────────────────────────────────
      var rests = [];
      ['pull','push'].forEach(function(t){ WK_TRAIN[t].supersets.forEach(function(s){ rests.push(s.restSec); }); });
      ok('every superset rests 90s between sets',
        rests.length === 4 && rests.every(function(r){ return r === 90; }), JSON.stringify(rests));

      // ── A saved Pull Day to remember ────────────────────────────────────
      storeSet('fl4_workouts', { bodyweight: [], workouts: [
        { id: 4801, date: '2026-08-20', type: 'workout', sessionName: 'Pull Day', kcal: 200, exercises: [
          { name: 'Ring Rows', sets: [ {reps:10, weight:20, duration:0}, {reps:9, weight:20, duration:0}, {reps:8, weight:17.5, duration:0} ] },
          { name: 'Bulgarian Split Squats', sets: [ {reps:12, weight:0, duration:0}, {reps:12, weight:0, duration:0}, {reps:10, weight:0, duration:0} ] }
        ]}
      ]});

      session();
      var r1 = wktFillEntry('A', 1, ex('rows'));
      ok('round 1 opens on last time\\'s round 1', r1.reps === '10' && r1.weight === '20', JSON.stringify(r1));
      ok('and it is stored, not just displayed — an untouched round still saves',
        SS.wEntries['A_1_rows'].reps === '10' && SS.wEntries['A_1_rows'].weight === '20',
        JSON.stringify(SS.wEntries['A_1_rows']));

      // ── 2. Per-round, not one number smeared across the session ─────────
      var r3 = wktFillEntry('A', 3, ex('rows'));
      ok('round 3 opens on last time\\'s round 3, not round 1',
        r3.reps === '8' && r3.weight === '17.5', JSON.stringify(r3));

      // ── 4. A blank stays blank ──────────────────────────────────────────
      var b1 = wktFillEntry('A', 1, ex('bulgarian'));
      ok('reps carry over but an unweighted exercise stays blank rather than 0',
        b1.reps === '12' && b1.weight === '', JSON.stringify(b1));

      // ── 3. Today's typed number wins for later rounds ───────────────────
      session();
      wktFillEntry('A', 1, ex('rows'));
      SS.wEntries['A_1_rows'].weight = '15';
      SS.wTyped['A_1_rows.weight'] = true;      // as wireInputs does on a real edit
      var r2 = wktFillEntry('A', 2, ex('rows'));
      ok('dropping the weight in round 1 carries down to round 2',
        r2.weight === '15', JSON.stringify(r2));
      ok('but a field you did NOT type still comes from last time\\'s round 2',
        r2.reps === '9', JSON.stringify(r2));

      session();
      wktFillEntry('A', 1, ex('rows'));          // pre-filled only, never typed
      var r2b = wktFillEntry('A', 2, ex('rows'));
      ok('a merely pre-filled round 1 does not override round 2\\'s own history',
        r2b.reps === '9' && r2b.weight === '20', JSON.stringify(r2b));

      // ── 5. Free-form logs are not sessions ──────────────────────────────
      storeSet('fl4_workouts', { bodyweight: [], workouts: [
        { id: 4802, date: '2026-08-21', exercises: [ { name: 'Ring Rows', sets: [ {reps:99, weight:99, duration:0} ] } ] }
      ]});
      session();
      var f1 = wktFillEntry('A', 1, ex('rows'));
      ok('a free-form log entry is never the source of a prefill',
        f1.reps === '' && f1.weight === '', JSON.stringify(f1));

      // ── No history at all ───────────────────────────────────────────────
      storeSet('fl4_workouts', { bodyweight: [], workouts: [] });
      session();
      var n1 = wktFillEntry('A', 1, ex('rows'));
      ok('the first ever Pull Day opens blank without throwing',
        n1.reps === '' && n1.weight === '', JSON.stringify(n1));

      return {pass:pass, fail:fail};
    })()`);
  },
};
