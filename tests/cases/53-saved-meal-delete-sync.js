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

      reset();
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
