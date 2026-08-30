'use strict';

// v443: `fl4_saved_meals` was the one personal collection merged WITHOUT
// deletion tombstones — applyPersonal unioned local and incoming by id, so a
// deleted saved meal was re-added by the next pull from any device (or from
// the household node) that still held a copy. Cathal reported it as "the demo
// usual breakfast comes back every time I delete it": demo data that had
// reached the cloud before the v420 push guards could never be deleted again,
// because every delete was undone on the next merge.
//
// THE TRIPWIRE IN THIS FILE is "a tombstoned meal is not resurrected by an
// incoming copy". If that fails, someone has dropped the tombstone filter from
// the saved_meals merge and deletes have stopped sticking again.

module.exports = {
  name: '53-saved-meal-delete-sync',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      function reset(){
        localStorage.removeItem("fl4_saved_meals");
        localStorage.removeItem("fl4_tomb_saved_meals");
      }
      function names(){ return (storeGet("fl4_saved_meals")||[]).map(function(m){ return m.name; }).sort(); }

      var demo = { id:111, name:"Demo usual breakfast", cal:330,
                   items:[{ text:"Porridge", cal:320, calAuto:true }] };
      var keep = { id:222, name:"Real lunch", cal:450,
                   items:[{ text:"Sandwich", cal:450, calAuto:false }] };

      // ── Deleting through the manager records a tombstone ──────────────────
      reset();
      storeSet("fl4_saved_meals", [demo, keep]);
      openSavedMealsManager();
      var dels = document.querySelectorAll("[data-del]");
      ok('manager: a delete button per saved meal', dels.length === 2, 'got: ' + dels.length);
      dels[0].click();                                   // the demo meal is first
      ok('delete removes it locally', names().join(",") === "Real lunch", 'got: ' + names().join(","));
      ok('delete writes a tombstone', getTombs("saved_meals")[111] > 0,
         'got: ' + JSON.stringify(getTombs("saved_meals")));
      ok('delete does not tombstone the survivor', getTombs("saved_meals")[222] == null,
         'got: ' + JSON.stringify(getTombs("saved_meals")));
      // close the manager overlay again
      Array.prototype.slice.call(document.querySelectorAll("button")).forEach(function(b){
        if (b.textContent === "Close") b.click();
      });

      // ── TRIPWIRE: an incoming copy must not bring it back ─────────────────
      applyPersonal({ saved_meals: [demo, keep] });
      ok('TRIPWIRE deleted saved meal is not resurrected by an incoming copy',
         names().join(",") === "Real lunch", 'got: ' + names().join(","));
      ok('the meal that was never deleted survives the merge',
         (storeGet("fl4_saved_meals")||[]).length === 1, 'got: ' + JSON.stringify(names()));

      // ── An incoming tombstone deletes here too ────────────────────────────
      reset();
      storeSet("fl4_saved_meals", [demo, keep]);
      applyPersonal({ saved_meals: [keep], saved_meals_deleted: { 111: Date.now() } });
      ok('incoming tombstone removes the meal on this device',
         names().join(",") === "Real lunch", 'got: ' + names().join(","));
      ok('incoming tombstone is stored for the next push',
         getTombs("saved_meals")[111] > 0, 'got: ' + JSON.stringify(getTombs("saved_meals")));

      // ── A tombstone must never block a NEWLY saved meal ───────────────────
      // Ids are Date.now() at save time, so a fresh save can't collide with an
      // old tombstone. Re-adding the same NAME must come straight back.
      var fresh = { id:Date.now(), name:"Demo usual breakfast", cal:330, items:[] };
      var cur = storeGet("fl4_saved_meals") || [];
      cur.push(fresh);
      storeSet("fl4_saved_meals", cur);
      applyPersonal({ saved_meals: [keep] });
      ok('a newly saved meal with the same name is not blocked by the tombstone',
         names().indexOf("Demo usual breakfast") !== -1, 'got: ' + names().join(","));

      // ── Merge still adds genuinely new incoming meals ─────────────────────
      reset();
      storeSet("fl4_saved_meals", [keep]);
      applyPersonal({ saved_meals: [keep, { id:333, name:"From Petra", cal:200, items:[] }] });
      ok('new incoming saved meals still arrive',
         names().join(",") === "From Petra,Real lunch", 'got: ' + names().join(","));

      // ── Tombstones survive the purge that pushPersonal sends them through ──
      reset();
      addTomb("saved_meals", 111);
      ok('a fresh tombstone survives purgeTombs, so it reaches the other device',
         purgeTombs(getTombs("saved_meals"))[111] > 0,
         'got: ' + JSON.stringify(purgeTombs(getTombs("saved_meals"))));

      // ── v445: restoring a backup must UNDO the tombstone, not trip over it ──
      // v443 added the tombstones for the sync merge but left importBackupData
      // alone, so a restored saved meal reappeared and was then filtered
      // straight back out by the next pull -- visible for one screen, gone
      // after a sync, which is worse than not restoring at all. Resurrecting is
      // the deliberate choice here (Cathal, 30/08/2026): saved meals follow the
      // list-item/recipe rule, NOT the medicine/growth "a delete of safety data
      // must stick" rule. THE TRIPWIRE: if the second assertion below fails,
      // someone has made the restore tomb-FILTER instead of tomb-CLEAR.
      reset();
      storeSet("fl4_saved_meals", [keep]);
      addTomb("saved_meals", 111);
      importBackupData({ saved_meals: [demo, keep] });
      ok('a restored saved meal comes back even though it was deleted',
         names().join(",") === "Demo usual breakfast,Real lunch", 'got: ' + names().join(","));
      ok('TRIPWIRE the restore CLEARS its tombstone, so the next pull cannot re-delete it',
         getTombs("saved_meals")[111] == null,
         'tombstone still present: ' + JSON.stringify(getTombs("saved_meals")));
      applyPersonal({ saved_meals: [keep] });
      ok('and it survives that next pull',
         names().indexOf("Demo usual breakfast") !== -1, 'got: ' + names().join(","));
      ok('an unrelated tombstone is left alone by the restore',
         (function(){ reset(); storeSet("fl4_saved_meals", [keep]); addTomb("saved_meals", 999);
                      importBackupData({ saved_meals: [demo] });
                      return getTombs("saved_meals")[999] > 0; })(),
         'the restore cleared a tombstone it should not have touched');

      // ── v445: the restore must SAY it restored something ──────────────────
      // Cathal's report on the first cut of this version: the meal really was
      // restored, but the toast said "Nothing new to import", so the fix looked
      // broken. importedSummary only knew about lists/recipes/trips/notes, so
      // every other collection restored silently. THE TRIPWIRE: a restore that
      // adds records must never summarise as "" -- an empty summary is what
      // becomes "Nothing new to import" in the import handler.
      reset();
      storeSet("fl4_saved_meals", []);
      var mealOnly = importBackupData({ saved_meals: [demo] });
      ok('restoring a saved meal is counted', mealOnly.meals === 1,
         'got: ' + JSON.stringify(mealOnly));
      ok('TRIPWIRE a saved-meal-only restore does not summarise as nothing',
         importedSummary(mealOnly) === "1 saved meal",
         'got: "' + importedSummary(mealOnly) + '"');

      var foodOnly = importBackupData({ food_log: [
        { id: 90001, date: "2026-08-01", name: "Diag toast", cal: 200, meal: 0 },
        { id: 90002, date: "2026-08-01", name: "Diag tea",   cal: 20,  meal: 0 } ] });
      ok('restoring food-log entries is counted', foodOnly.food === 2,
         'got: ' + JSON.stringify(foodOnly));
      ok('and reads as food entries', importedSummary(foodOnly) === "2 food entries",
         'got: "' + importedSummary(foodOnly) + '"');

      ok('a restore that genuinely adds nothing still summarises as nothing',
         importedSummary(importBackupData({ saved_meals: [demo] })) === "",
         'a no-op restore should stay silent');

      ok('more than three kinds falls back to a plain total',
         importedSummary({lists:1,recipes:1,trips:1,notes:1}) === "4 records",
         'got: "' + importedSummary({lists:1,recipes:1,trips:1,notes:1}) + '"');
      ok('singular and plural both read correctly',
         importedSummary({plants:1}) === "1 plant" && importedSummary({plants:2}) === "2 plants",
         'got: "' + importedSummary({plants:1}) + '" / "' + importedSummary({plants:2}) + '"');

      // ── v445: deleting must repaint the Food view, not just the sheet ─────
      // Cathal's second report: the meal vanished from storage and from the
      // manager, but the saved-meal chips in the Food view behind it kept
      // showing it until you navigated away and back -- renderFoodView() ran
      // only when the sheet was CLOSED. This asserts the SCREEN, not the store:
      // the earlier assertions in this file all passed while this was broken,
      // which is exactly why it reached him.
      reset();
      storeSet("fl4_saved_meals", [
        { id:501, name:"ZzMealAAA", cal:300, items:[{text:"a", cal:300, calAuto:false}] },
        { id:502, name:"ZzMealBBB", cal:400, items:[{text:"b", cal:400, calAuto:false}] }
      ]);
      currentSection = "track"; currentTrackView = "food";
      renderFoodView();
      var foodDiv = document.getElementById("notesFoodView");
      ok('both saved meals show in the Food view to begin with',
         foodDiv.innerHTML.indexOf("ZzMealAAA") !== -1 && foodDiv.innerHTML.indexOf("ZzMealBBB") !== -1,
         'chips missing before the delete');
      openSavedMealsManager();
      var delBtns = document.querySelectorAll("[data-del]");
      ok('the manager offers a delete per saved meal', delBtns.length === 2, 'got: ' + delBtns.length);
      delBtns[0].click();
      ok('TRIPWIRE the deleted meal leaves the Food view immediately, without closing the sheet',
         foodDiv.innerHTML.indexOf("ZzMealAAA") === -1,
         'the Food view still shows the deleted meal - renderFoodView() was not called on delete');
      ok('the meal that was not deleted is still on screen',
         foodDiv.innerHTML.indexOf("ZzMealBBB") !== -1, 'the surviving meal vanished too');
      Array.prototype.slice.call(document.querySelectorAll("button")).forEach(function(b){
        if (b.textContent === "Close") b.click();
      });

      reset();
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
