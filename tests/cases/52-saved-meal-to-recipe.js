'use strict';

// v442 — a saved meal can become a recipe.
//
// What's worth pinning:
//   1. it COPIES: the saved meal survives, because "also make it a recipe" is
//      not a request to lose the one-tap logging shortcut
//   2. every logged line becomes an ingredient, through parseIngredients, so
//      "2 eggs" arrives as an amount and a name
//   3. the calorie rule (v434 again): the total is carried into the recipe's
//      kcal ONLY when every item's figure was typed by hand. One estimated
//      line makes the total a guess, and a recipe's kcal prices every future
//      food-log entry made from it — so it is left blank instead
//   4. a name already in the book is refused, not silently duplicated
//   5. the new recipe gets a fresh id from nextRecipeId, never a collision
module.exports = {
  name: '52-saved-meal-to-recipe',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function byName(n){ return getRecipeBook().find(function(r){ return r.name === n; }); }

      storeSet('fl4_recipebook', [{ id: 5201, name: 'Existing Stew', servings: 4, kcal: 500, updated: 1 }]);
      storeSet('fl4_saved_meals', [
        // every figure typed by hand -> the total is a real number
        { id: 5210, name: 'Sunday Fry Up', cal: 700, items: [
          { text: '2 eggs',    cal: 140, calAuto: false },
          { text: 'Rashers',   cal: 300, calAuto: false },
          { text: '2 sausages',cal: 260, calAuto: false } ] },
        // one estimated line -> no figure at all
        { text: '', id: 5211, name: 'Quick Lunch', cal: 500, items: [
          { text: 'Cheese sandwich', cal: 400, calAuto: true },
          { text: 'Apple',           cal: 100, calAuto: false } ] },
        // clashes with a recipe already in the book
        { id: 5212, name: 'existing  STEW', cal: 0, items: [{ text: 'Beef', cal: 0, calAuto: false }] }
      ]);

      // ── 1. it copies, it does not move ──────────────────────────────────
      var before = (storeGet('fl4_saved_meals')||[]).length;
      var id = savedMealToRecipe(0);
      ok('a recipe is created', !!id && !!byName('Sunday Fry Up'));
      ok('the saved meal survives', (storeGet('fl4_saved_meals')||[]).length === before,
         'saved meals went from ' + before + ' to ' + (storeGet('fl4_saved_meals')||[]).length);
      ok('the saved meal is untouched', (storeGet('fl4_saved_meals')||[])[0].name === 'Sunday Fry Up');

      // ── 2. items become ingredients ─────────────────────────────────────
      var fry = byName('Sunday Fry Up');
      ok('one ingredient per logged line', fry.ingredients.length === 3,
         JSON.stringify(fry.ingredients.map(function(i){ return i.name; })));
      ok('an amount in the text is parsed out',
         fry.ingredients[0].amount === 2 && /egg/i.test(fry.ingredients[0].name),
         JSON.stringify(fry.ingredients[0]));
      // The tripwire: "Rashers" is a UNIT word in INGREDIENT_UNIT_MAP, so a
      // whole-line parse eats it and the item vanishes from the recipe. In a
      // food log it is the food's name.
      ok('a line that is only a unit word survives as the name',
         fry.ingredients[1].name === 'Rashers' && fry.ingredients[1].amount == null,
         JSON.stringify(fry.ingredients[1]));
      ok('no logged line is lost',
         fry.ingredients.map(function(i){ return i.name; }).join('|') === 'eggs|Rashers|sausages',
         fry.ingredients.map(function(i){ return i.name; }).join('|'));
      ok('it starts at one serving', fry.servings === 1, String(fry.servings));
      ok('the method is left blank for Cathal', fry.method === '' && fry.prep === '');
      ok('it is stamped for the sync merge', typeof fry.updated === 'number' && fry.updated > 0);

      // ── 3. THE CALORIE RULE ─────────────────────────────────────────────
      ok('an all-typed total is carried', fry.kcal === 700, String(fry.kcal));
      savedMealToRecipe(1);
      var lunch = byName('Quick Lunch');
      ok('the second recipe is created', !!lunch);
      ok('ONE estimated line blanks the whole figure', lunch.kcal === 0,
         'kcal was ' + lunch.kcal + ' — an estimated total must never become a recipe figure');
      ok('savedMealCalories agrees',
         savedMealCalories(storeGet('fl4_saved_meals')[0]) === 700 &&
         savedMealCalories(storeGet('fl4_saved_meals')[1]) === 0);
      ok('an unpriced line also blanks it',
         savedMealCalories({ items: [{ text:'x', cal:100, calAuto:false }, { text:'y', cal:0 }] }) === 0);
      ok('an empty meal has no figure', savedMealCalories({ items: [] }) === 0);

      // A line that parses as a section header is a food name here too.
      storeSet('fl4_saved_meals', (storeGet('fl4_saved_meals')||[]).concat([
        { id: 5213, name: 'Odd Lines', cal: 0, items: [
          { text: 'Breakfast:', cal: 0 }, { text: 'Slices', cal: 0 }, { text: '', cal: 0 } ] }
      ]));
      savedMealToRecipe(3);
      var odd = byName('Odd Lines');
      ok('a header-shaped line is kept as a name',
         odd.ingredients.length === 2 &&
         odd.ingredients[0].name === 'Breakfast:' && !odd.ingredients[0].header &&
         odd.ingredients[1].name === 'Slices',
         JSON.stringify(odd.ingredients));

      // ── 4. a name already in the book is refused ────────────────────────
      var count = getRecipeBook().length;
      var refused = savedMealToRecipe(2);
      ok('a clashing name is refused', refused === null);
      ok('nothing was written', getRecipeBook().length === count, getRecipeBook().length + ' vs ' + count);
      ok('the match ignores case and spacing',
         !!savedMealRecipe({ name: '  EXISTING   stew ' }));
      ok('a meal not in the book reports none', savedMealRecipe({ name: 'Never Made' }) === null);
      ok('re-running on one already converted is refused', savedMealToRecipe(0) === null);

      // ── 5. ids ──────────────────────────────────────────────────────────
      var ids = getRecipeBook().map(function(r){ return r.id; });
      ok('every id is unique', ids.length === new Set(ids).size, ids.join(','));
      ok('the existing recipe is untouched', byName('Existing Stew').kcal === 500);

      return { pass: pass, fail: fail };
    })()`);
  }
};
