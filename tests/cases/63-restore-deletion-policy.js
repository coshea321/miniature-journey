'use strict';

// v462: what a restore does with a record another device has deleted.
//
// Cathal's call, 05/09/2026: non-medical shortcuts come back, deleted MEDICAL
// records do not and are reported as skipped instead of being counted as
// imported and then filtered straight back out by the next sync.
//
// The mechanism under both halves: action_log / food_log / saved_meals now use
// the timestamp-comparing tombstone filter every other collection in the app
// already used (tomb wins only if it is NEWER than the record), and a restored
// record is stamped updated=now so it out-ranks a tombstone held by ANY device.
// track_med deliberately keeps the unconditional filter.
//
// Do NOT "make track_med consistent" with its three neighbours to get a
// simpler-looking diff -- that is the behaviour this case exists to prevent.

module.exports = {
  name: '63-restore-deletion-policy',
  async run(page) {
    const pass = [];
    const fail = [];
    function ok(name, cond, detail) {
      if (cond) pass.push(name);
      else fail.push({ name, detail: detail || 'assertion failed' });
    }

    const r = await page.evaluate(`(function(){
      // Start clean, then delete one record of each kind so a tombstone exists.
      storeSet('fl4_food_log', []); storeSet('fl4_action_log', []);
      storeSet('fl4_track_med', []); storeSet('fl4_saved_meals', []);
      storeSet('fl4_tomb_food_log', {}); storeSet('fl4_tomb_action_log', {});
      storeSet('fl4_tomb_track_med', {}); storeSet('fl4_tomb_saved_meals', {});

      var old = Date.now() - 60000;
      addTomb('food_log',    5001);
      addTomb('action_log',  5002);
      addTomb('track_med',   5003);
      addTomb('saved_meals', 5004);

      var n = importBackupData({
        food_log:    [{ id: 5001, date: '2026-09-01', meal: 0, text: 'Toast', cal: 200, calAuto: false }],
        action_log:  [{ id: 5002, ts: old, date: '2026-09-01', type: 'cardio', activity: 'Walk' }],
        track_med:   [{ id: 5003, ts: old, date: '2026-09-01', name: 'Something', dose: '1' }],
        saved_meals: [{ id: 5004, name: 'Usual breakfast', cal: 300, items: [] }]
      });

      // Now replay a sync carrying the OTHER device's tombstones -- the step
      // that used to undo the restore.
      var remoteDeleted = { 5001: old, 5002: old, 5003: old, 5004: old };
      applyPersonal({
        food_log:    getFoodLog(),        food_log_deleted:    remoteDeleted,
        action_log:  getActionLog(),      action_log_deleted:  remoteDeleted,
        track_med:   getTrackMed(),       track_med_deleted:   remoteDeleted,
        saved_meals: storeGet('fl4_saved_meals') || [], saved_meals_deleted: remoteDeleted
      });

      return {
        counted:   { food: n.food, log: n.logEntries, med: n.medEntries, meals: n.meals },
        skipped:   n.skipped,
        skipText:  importedSkippedText(n),
        afterSync: {
          food:  (getFoodLog()  || []).length,
          log:   (getActionLog()|| []).length,
          med:   (getTrackMed() || []).length,
          meals: (storeGet('fl4_saved_meals') || []).length
        }
      };
    })()`);

    // ── The three that come back ────────────────────────────────────────────
    ok('a deleted food entry is restored',        r.counted.food  === 1, JSON.stringify(r));
    ok('a deleted log entry is restored',         r.counted.log   === 1, JSON.stringify(r));
    ok('a deleted saved meal is restored',        r.counted.meals === 1, JSON.stringify(r));

    ok('the restored food entry SURVIVES the other device\'s tombstone',
      r.afterSync.food === 1, JSON.stringify(r));
    ok('the restored log entry SURVIVES the other device\'s tombstone',
      r.afterSync.log === 1, JSON.stringify(r));
    ok('the restored saved meal SURVIVES the other device\'s tombstone',
      r.afterSync.meals === 1, JSON.stringify(r));

    // ── The one that does not ───────────────────────────────────────────────
    ok('a deleted medicine record is NOT counted as imported',
      r.counted.med === 0, JSON.stringify(r));
    ok('it is counted as skipped instead', r.skipped === 1, JSON.stringify(r));
    ok('the skipped count is reported in plain English',
      /deleted on another device/.test(r.skipText) && /not restored/.test(r.skipText),
      JSON.stringify(r));
    ok('the deleted medicine record is still absent after the sync',
      r.afterSync.med === 0, JSON.stringify(r));

    return { pass, fail };
  },
};
