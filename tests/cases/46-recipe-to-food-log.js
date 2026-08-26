'use strict';

// v434 — logging a recipe to the food journal.
//
// The recipe carries ONE new scalar, `kcal` (calories per serving, typed by
// hand in the editor), and the recipe detail view grows a "Log to food
// journal" button that writes ONE food-log line for the portions eaten.
//
// What's worth pinning here is the part that would rot silently:
//   1. THE FIGURE IS THE TYPED ONE. estimateCals() must never be reached from
//      this path. FOOD_CAL is mixed-basis (butter/cheese per 100g, egg/bread
//      per item), so an "improvement" that summed the ingredients would be out
//      by a factor of ten on the fatty ones — and calories are acted on. The
//      tripwire below names the recipe "Pizza", which IS in FOOD_CAL at 270,
//      and gives it a typed 800: if 270 ever shows up in the log, someone has
//      wired the estimator in.
//   2. one recipe = one log line, not one line per ingredient
//   3. calAuto is false — the journal renders "(estimated)" off that flag, and
//      a typed figure must never wear it
//   4. a recipe with no kcal writes NOTHING and offers the editor instead
//   5. the portions stepper scales the total and never goes below half a
//      portion, and the recipe's own stored kcal is untouched by any of it

module.exports = {
  name: '46-recipe-to-food-log',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function content(){ return document.getElementById('recipesContent'); }
      function todayStr(){
        var d = new Date();
        return d.getFullYear()+'-'+(d.getMonth()<9?'0':'')+(d.getMonth()+1)+'-'+(d.getDate()<10?'0':'')+d.getDate();
      }
      // serv = what the detail view's own "Serves" stepper is showing, which is
      // a different number from the portions eaten (pinned further down).
      function openDetail(id, serv){
        _recipeEditing = false; _recipeOpenId = id;
        _recipeServings = serv || 1; _recipeView = 'detail'; renderRecipes();
      }
      function sheet(){ var b = document.getElementById('_rfLog'); return b ? b.parentNode.parentNode : {textContent:''}; }
      function closeSheet(){
        var c = document.getElementById('_rfCancel') || document.getElementById('_rfClose');
        if (c) c.click();
      }

      storeSet('fl4_food_log', []);
      storeSet('fl4_recipebook', [
        { id: 4601, name: 'Pizza', servings: 2, kcal: 800, updated: 1, category: 'Dinner',
          method: 'Bake it.', ingredients: parseIngredients('200 g Flour\\n150 g Cheese') },
        { id: 4602, name: 'Unpriced Stew', servings: 4, updated: 1, category: 'Lunch',
          method: 'Stew it.', ingredients: parseIngredients('500 g Beef') }
      ]);
      switchSection('recipes');

      // ── 1. The editor round-trip ────────────────────────────────────────
      openRecipeEditor(4601);
      var kIn = document.getElementById('reKcal');
      ok('the editor has a calories-per-serving box', !!kIn, 'no #reKcal');
      ok('it is pre-filled from the stored recipe', kIn && kIn.value === '800', kIn && kIn.value);
      kIn.value = '640';
      document.getElementById('reSave').click();
      var stored = getRecipeBook().find(function(r){ return r.id === 4601; });
      ok('a typed figure is saved onto the recipe', stored.kcal === 640, String(stored.kcal));
      ok('saving the calories leaves the rest of the recipe alone',
        stored.name === 'Pizza' && stored.servings === 2 && (stored.ingredients||[]).length === 2,
        JSON.stringify({n:stored.name, s:stored.servings, i:(stored.ingredients||[]).length}));

      openRecipeEditor(4601);
      document.getElementById('reKcal').value = '';
      document.getElementById('reSave').click();
      ok('clearing the box stores 0, never undefined (the v296 sync rule)',
        getRecipeBook().find(function(r){ return r.id === 4601; }).kcal === 0,
        JSON.stringify(getRecipeBook().find(function(r){ return r.id === 4601; }).kcal));

      // Put the tripwire figure back for the rest of the run.
      openRecipeEditor(4601);
      document.getElementById('reKcal').value = '800';
      document.getElementById('reSave').click();

      // ── 2. The detail view ──────────────────────────────────────────────
      openDetail(4601, 2);
      ok('the detail view offers the log button', !!document.getElementById('recipeToFoodBtn'), 'no #recipeToFoodBtn');
      ok('the per-serving figure is shown', /800 per serving/.test(content().textContent), 'per-serving figure missing');
      ok('the total shown is the whole batch at the servings on the stepper',
        /1,600 kcal/.test(content().textContent), content().textContent.slice(0, 200));
      document.getElementById('servPlus').click();
      ok('stepping the servings up rescales the total, not the per-serving figure',
        /2,400 kcal/.test(content().textContent) && /800 per serving/.test(content().textContent),
        'expected 2,400 kcal at 3 servings');
      ok('the stored per-serving figure is NOT changed by the stepper',
        getRecipeBook().find(function(r){ return r.id === 4601; }).kcal === 800, 'stored kcal moved');

      // ── 3. A recipe with no figure writes nothing ───────────────────────
      openDetail(4602, 4);
      document.getElementById('recipeToFoodBtn').click();
      ok('an unpriced recipe offers the editor instead of a figure',
        !!document.getElementById('_rfEdit') && !document.getElementById('_rfLog'),
        'expected the "set calories" branch');
      closeSheet();
      ok('nothing was written to the food log', getFoodLog().length === 0, JSON.stringify(getFoodLog()));

      // ── 4. The portions stepper ─────────────────────────────────────────
      openDetail(4601, 3);
      document.getElementById('recipeToFoodBtn').click();
      ok('a priced recipe opens the log sheet', !!document.getElementById('_rfLog'), 'no #_rfLog');
      // The two steppers mean different things: "Serves" is how much is being
      // cooked, "Portions" is how much was eaten. Opening from a 3-serving view
      // must still start at one portion, or a batch cook logs three dinners.
      ok('the sheet opens at ONE portion whatever the servings stepper says',
        /800 kcal/.test(sheet().textContent) && !/2,400 kcal/.test(sheet().textContent),
        sheet().textContent);

      document.getElementById('_rfPlus').click();
      ok('a half portion up is 1.5 and 1,200 kcal',
        /1,200 kcal/.test(sheet().textContent), 'expected 1,200 kcal at 1.5');
      document.getElementById('_rfMinus').click();
      document.getElementById('_rfMinus').click();
      ok('stepping down reaches half a portion at 400 kcal',
        /400 kcal/.test(sheet().textContent), 'expected 400 kcal at 0.5');
      document.getElementById('_rfMinus').click();
      ok('half a portion is the floor — it never goes to zero or negative',
        /400 kcal/.test(sheet().textContent), 'stepped below 0.5');

      // ── 5. Logging it ───────────────────────────────────────────────────
      document.getElementById('_rfPlus').click(); // back to 1
      document.getElementById('_rfLog').click();
      var log = getFoodLog();
      ok('ONE line is written, not one per ingredient', log.length === 1, log.length + ' entries');
      var e = log[0];
      ok('the line is priced at the TYPED figure, not the FOOD_CAL estimate',
        e.cal === 800, e.cal + ' kcal (270 would mean estimateCals got wired in)');
      ok('the estimator really would have said something else for this name',
        estimateCals('Pizza') === 270, 'FOOD_CAL pizza moved — retune this tripwire, do not delete it');
      ok('it is not flagged as estimated', e.calAuto === false, JSON.stringify(e.calAuto));
      ok('it is named after the recipe', e.text === 'Pizza', e.text);
      ok('it lands on today', e.date === todayStr(), e.date);
      ok('the Dinner category defaults it to the Dinner meal', e.meal === 2, String(e.meal));
      ok('the sheet closed itself', !document.getElementById('_rfLog'), 'sheet still open');

      // A part portion says so in the text, and rounds rather than storing a fraction.
      openDetail(4601);
      document.getElementById('recipeToFoodBtn').click();
      document.getElementById('_rfMinus').click(); // 0.5
      document.querySelectorAll('._rfMeal')[0].click(); // Breakfast
      document.getElementById('_rfLog').click();
      var e2 = getFoodLog()[getFoodLog().length - 1];
      ok('a part portion is spelled out in the line', /0\\.5 portions/.test(e2.text), e2.text);
      ok('a part portion is priced pro rata', e2.cal === 400, String(e2.cal));
      ok('the meal picked in the sheet wins over the category', e2.meal === 0, String(e2.meal));
      ok('two logs make two lines', getFoodLog().length === 2, getFoodLog().length + ' entries');

      // ── 6. The journal renders what was written ─────────────────────────
      foodDate = todayStr();
      renderFoodView();
      var fj = document.getElementById('foodEntries').textContent;
      ok('the recipe shows up in the food journal', fj.indexOf('Pizza') !== -1, fj.slice(0, 200));
      ok('it is not labelled "(estimated)" there',
        fj.indexOf('(estimated)') === -1, 'a typed figure is wearing the estimated label');

      // ── 7. The day's total always equals what is listed ─────────────────
      // A meal value that isn't an index into MEAL_TYPES used to be counted in the
      // day's total (a plain reduce) while rendering under no meal heading (an
      // === match on the index), so the summary bar disagreed with the list and
      // nothing on screen explained the gap. Normalised in getFoodLog now.
      storeSet('fl4_food_log', [
        { id: 9001, date: todayStr(), meal: 'breakfast', text: 'Legacy Porridge', cal: 320, calAuto: true },
        { id: 9002, date: todayStr(), meal: 1,           text: 'Sandwich',        cal: 450, calAuto: true },
        { id: 9003, date: todayStr(), meal: 'nonsense',  text: 'Mystery',         cal: 100, calAuto: false }
      ]);
      ok('a meal NAME is read back as its index', getFoodLog()[0].meal === 0, JSON.stringify(getFoodLog()[0].meal));
      ok('a valid index is passed through untouched', getFoodLog()[1].meal === 1, JSON.stringify(getFoodLog()[1].meal));
      ok('an unrecognised meal still lands in a real bucket rather than vanishing',
        getFoodLog()[2].meal === 3, JSON.stringify(getFoodLog()[2].meal));
      ok('normalising does not disturb the rest of the entry',
        getFoodLog()[0].text === 'Legacy Porridge' && getFoodLog()[0].cal === 320, JSON.stringify(getFoodLog()[0]));

      foodDate = todayStr();
      renderFoodView();
      var rows = document.getElementById('foodEntries').querySelectorAll('.food-del-btn').length;
      ok('EVERY entry for the day is listed, whatever its meal value was',
        rows === 3, rows + ' rows rendered for 3 entries');
      var summary = document.getElementById('foodDaySummary').textContent;
      ok('the day total is exactly the sum of what is listed',
        /870 kcal/.test(summary), summary.slice(0, 90));
      ok('the per-meal figures add up to the day total too', (function(){
        var sum = 0, m = summary.match(/(Breakfast|Lunch|Dinner|Snack): ([0-9,]+)/g) || [];
        m.forEach(function(x){ sum += parseInt(x.split(': ')[1].replace(/,/g, ''), 10); });
        return sum === 870;
      })(), summary.slice(0, 90));

      storeSet('fl4_food_log', []);
      return {pass:pass, fail:fail};
    })()`);
  },
};
