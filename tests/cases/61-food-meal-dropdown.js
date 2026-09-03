'use strict';

// v457 — the food journal's meal picker is a dropdown, and it defaults itself.
//
// It used to be a button that CYCLED: reaching Snack from Breakfast took three
// taps, and the start point was hardcoded to Lunch. Now it is a native <select>
// whose starting value is derived per day:
//   * nothing logged for that day yet  -> Breakfast
//   * something logged                 -> the meal of the LAST thing logged
//
// Worth pinning because each part fails silently:
//   1. the default is derived from the LOG, per day — a remembered variable
//      would carry today's Dinner back onto an empty Tuesday
//   2. "last" is the highest id, not the last array slot
//   3. a hand-picked meal survives a re-render — a delete re-renders, and
//      resetting the picker there would quietly log the next item to the
//      wrong meal
//   4. moving the date nav drops that hand-pick, so the new day gets its own
//      default rather than the previous day's choice
//   5. the options come from MEAL_TYPES, so a new meal type needs no edit

module.exports = {
  name: '61-food-meal-dropdown',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function sel(){ return document.getElementById('foodMealSelect'); }
      function show(date){ foodDate = date; renderFoodView(); }
      function pick(i){ sel().value = String(i); sel().dispatchEvent(new Event('change')); }

      var today = foodTodayStr();
      var yday  = foodShiftDay(today, -1);

      storeSet('fl4_food_log', []);
      foodMealPicked = false;
      switchSection('train');
      show(today);

      // ── 1. It is a dropdown, built from MEAL_TYPES ──────────────────────
      ok('the meal picker is a select element', !!sel() && sel().tagName === 'SELECT', sel() ? sel().tagName : 'missing');
      ok('the cycling toggle button is gone', !document.getElementById('foodMealToggle'), '#foodMealToggle still present');
      ok('it has one option per meal type',
        sel().options.length === MEAL_TYPES.length, sel().options.length + ' options for ' + MEAL_TYPES.length + ' meals');
      ok('the options carry the meal labels in order', (function(){
        for (var i = 0; i < MEAL_TYPES.length; i++) {
          if (sel().options[i].textContent.indexOf(MEAL_TYPES[i].label) === -1) return false;
          if (sel().options[i].value !== String(i)) return false;
        }
        return true;
      })(), Array.prototype.map.call(sel().options, function(o){ return o.value + ':' + o.textContent; }).join('|'));

      // ── 2. First of the day is Breakfast ────────────────────────────────
      ok('an empty day starts on Breakfast', sel().value === '0', sel().value);
      ok('and the add form agrees with what is on screen', currentFoodMeal === 0, String(currentFoodMeal));
      ok('foodDefaultMeal says Breakfast for a day with nothing logged',
        foodDefaultMeal(today) === 0, String(foodDefaultMeal(today)));

      // Logging with it untouched files under Breakfast, not the old Lunch default.
      document.getElementById('foodItemInput').value = 'Porridge';
      document.getElementById('foodAddBtn').click();
      var log = getFoodLog();
      ok('the first item of the day is logged as Breakfast', log.length === 1 && log[0].meal === 0, JSON.stringify(log));

      // ── 3. After that, the last used meal ───────────────────────────────
      pick(2); // Dinner
      ok('picking a meal updates what the add form will use', currentFoodMeal === 2, String(currentFoodMeal));
      document.getElementById('foodItemInput').value = 'Lasagne';
      // btnBusy debounces Add for 800ms; a test clicks it twice in the same tick.
      document.getElementById('foodAddBtn')._busy = false;
      document.getElementById('foodAddBtn').click();
      ok('the picked meal is what got logged',
        getFoodLog()[1].meal === 2, JSON.stringify(getFoodLog()[1]));

      foodMealPicked = false; // as a fresh visit to the day would be
      show(today);
      ok('re-opening the day defaults to the LAST meal logged, not the first',
        sel().value === '2' && currentFoodMeal === 2, sel().value + '/' + currentFoodMeal);

      // "Last" is the newest id, not the last array slot. A recipe logged to a
      // past date appends to the array but is not that date's latest meal.
      storeSet('fl4_food_log', [
        { id: 6103, date: yday, meal: 2, text: 'Curry',   cal: 700, calAuto: false },
        { id: 6101, date: yday, meal: 0, text: 'Toast',   cal: 200, calAuto: false }
      ]);
      ok('the newest id wins, not the last array slot',
        foodDefaultMeal(yday) === 2, String(foodDefaultMeal(yday)));

      // ── 4. Per DAY, not one remembered value ────────────────────────────
      storeSet('fl4_food_log', [
        { id: 6110, date: yday, meal: 3, text: 'Biscuit', cal: 100, calAuto: false }
      ]);
      foodMealPicked = false;
      show(yday);
      ok('a day with a Snack last logged opens on Snack', sel().value === '3', sel().value);
      show(today);
      ok('stepping to a day with nothing logged goes back to Breakfast, not the other day\\'s meal',
        sel().value === '0' && currentFoodMeal === 0, sel().value + '/' + currentFoodMeal);

      // ── 5. A hand-picked meal survives a re-render ──────────────────────
      storeSet('fl4_food_log', [
        { id: 6120, date: today, meal: 0, text: 'Eggs', cal: 300, calAuto: false }
      ]);
      foodMealPicked = false;
      show(today);
      pick(1); // Lunch, while the only entry is a Breakfast one
      renderFoodView();
      ok('a hand-picked meal is not reset by a re-render',
        sel().value === '1' && currentFoodMeal === 1, sel().value + '/' + currentFoodMeal);
      var del = document.getElementById('foodEntries').querySelector('.food-del-btn');
      if (del) del.click();
      ok('deleting an entry does not move the hand-picked meal either',
        sel().value === '1' && currentFoodMeal === 1, sel().value + '/' + currentFoodMeal);

      // ── 6. Moving the date drops the hand-pick ──────────────────────────
      storeSet('fl4_food_log', []);
      document.getElementById('foodPrevDay').click();
      ok('stepping back a day re-derives the default instead of keeping the pick',
        foodMealPicked === false && sel().value === '0', sel().value + '/' + foodMealPicked);
      pick(2);
      document.getElementById('foodNextDay').click();
      ok('stepping forward a day does the same',
        foodMealPicked === false && sel().value === '0', sel().value + '/' + foodMealPicked);

      storeSet('fl4_food_log', []);
      foodMealPicked = false;
      show(today);
      return {pass:pass, fail:fail};
    })()`);
  },
};
