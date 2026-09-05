'use strict';

// v461: two food entries logged in the same millisecond used to get the SAME
// Date.now() id, which made every "newest id wins" read arbitrary -- most
// visibly foodDefaultMeal, so re-opening a day could land on Breakfast when
// Dinner was logged last. It is also what made 61-food-meal-dropdown.js fail
// on roughly half of all runs, on code that never changed.
//
// nextFoodId() is now the only way a food-log id is made and is strictly
// increasing even inside one tick. Do NOT go back to a bare Date.now() at any
// creation site: the id is the entry's identity for sync dedup AND deletion
// tombstones, so a collision can make two entries the same record.

module.exports = {
  name: '64-food-id-collision',
  async run(page) {
    const pass = [];
    const fail = [];
    function ok(name, cond, detail) {
      if (cond) pass.push(name);
      else fail.push({ name, detail: detail || 'assertion failed' });
    }

    const r = await page.evaluate(`(function(){
      // 500 ids in the tightest loop we can manage -- many share a millisecond.
      var ids = [], strictlyIncreasing = true;
      for (var i = 0; i < 500; i++) {
        var id = nextFoodId();
        if (i > 0 && !(id > ids[i-1])) strictlyIncreasing = false;
        ids.push(id);
      }
      var unique = {};
      ids.forEach(function(x){ unique[x] = true; });

      // The real-world shape: two entries logged back to back in one tick,
      // second one a later meal. Re-opening the day must default to that one.
      var today = foodTodayStr();
      storeSet('fl4_food_log', []);
      var log = [];
      log.push({ id: nextFoodId(), date: today, meal: 0, text: 'Toast',   cal: 200, calAuto: false });
      log.push({ id: nextFoodId(), date: today, meal: 2, text: 'Lasagne', cal: 700, calAuto: false });
      storeSet('fl4_food_log', log);
      var sameTick = log[0].id !== log[1].id;
      var defaulted = foodDefaultMeal(today);

      // Legacy data the factory cannot retro-fix: ids that ALREADY collide.
      storeSet('fl4_food_log', [
        { id: 7000, date: today, meal: 0, text: 'Toast',   cal: 200, calAuto: false },
        { id: 7000, date: today, meal: 2, text: 'Lasagne', cal: 700, calAuto: false }
      ]);
      var legacyTie = foodDefaultMeal(today);

      // ...and the same pair in the opposite array order, to prove the answer
      // comes from the tie-break rule and not from whichever was seen first.
      storeSet('fl4_food_log', [
        { id: 7000, date: today, meal: 2, text: 'Lasagne', cal: 700, calAuto: false },
        { id: 7000, date: today, meal: 0, text: 'Toast',   cal: 200, calAuto: false }
      ]);
      var legacyTieReversed = foodDefaultMeal(today);

      return {
        count: ids.length,
        uniqueCount: Object.keys(unique).length,
        strictlyIncreasing: strictlyIncreasing,
        sameTick: sameTick,
        defaulted: defaulted,
        legacyTie: legacyTie,
        legacyTieReversed: legacyTieReversed
      };
    })()`);

    ok('500 ids made in one loop are all unique',
      r.uniqueCount === r.count, JSON.stringify(r));
    ok('ids are strictly increasing, not merely unique',
      r.strictlyIncreasing === true, JSON.stringify(r));
    ok('two entries logged back to back get different ids',
      r.sameTick === true, JSON.stringify(r));
    ok('re-opening the day defaults to the meal logged LAST',
      r.defaulted === 2, JSON.stringify(r));

    ok('ids that already collide still resolve deterministically',
      r.legacyTie === 2, JSON.stringify(r));
    ok('and give the same answer whichever order they are stored in',
      r.legacyTieReversed === 2, JSON.stringify(r));

    return { pass, fail };
  },
};
