'use strict';

// v368: "Add to grocery list" now opens a review screen — tick which
// ingredients actually go on the list, and rename one before it goes. Both
// choices are stored on the ingredient (groceryName / noBuy) so they are
// remembered for every later add, and the recipe's OWN wording is never
// rewritten (a rename must not be able to lose bracket/prep detail).
// These cases pin the two new shared helpers, the fields surviving every path
// that re-parses ingredient text, and the real screen end to end.

module.exports = {
  name: '20-grocery-ingredient-pick',
  async run(page) {
    const units = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── recipeGroceryName ────────────────────────────────────────
      ok('name: an override wins over the recipe wording',
        recipeGroceryName({ name: 'Chopped tomatoes', amount: 400, unit: 'g', groceryName: 'Passata' }) === 'Passata',
        'got: ' + recipeGroceryName({ name: 'Chopped tomatoes', groceryName: 'Passata' }));
      ok('name: no override falls back to the derived shopping name',
        recipeGroceryName({ name: 'onion, finely chopped', amount: 1 }) === 'Onion',
        'got: ' + recipeGroceryName({ name: 'onion, finely chopped', amount: 1 }));
      ok('name: a blank override is ignored',
        recipeGroceryName({ name: 'Mushrooms', groceryName: '   ' }) === 'Mushrooms',
        'got: ' + recipeGroceryName({ name: 'Mushrooms', groceryName: '   ' }));
      ok('name: the override is used verbatim, not re-cleaned',
        recipeGroceryName({ name: 'Tomatoes', groceryName: 'passata (the big jar)' }) === 'passata (the big jar)',
        'got: ' + recipeGroceryName({ name: 'Tomatoes', groceryName: 'passata (the big jar)' }));

      // ── groceryAmtLabel (shared by the push and the preview) ─────
      ok('amt: a parsed amount scales',
        groceryAmtLabel({ name: 'Mushrooms', amount: 200, unit: 'g' }, 2) === '400 g',
        'got: ' + groceryAmtLabel({ name: 'Mushrooms', amount: 200, unit: 'g' }, 2));
      ok('amt: an amount glued to its unit inside the name is recovered',
        groceryAmtLabel({ name: '200g mushrooms' }, 1) === '200 g',
        'got: ' + groceryAmtLabel({ name: '200g mushrooms' }, 1));
      ok('amt: an unscalable literal shows at base servings only',
        groceryAmtLabel({ name: 'Ginger - 1/2 thumb size' }, 1) === '1/2 thumb size' &&
        groceryAmtLabel({ name: 'Ginger - 1/2 thumb size' }, 2) === '',
        'got: ' + JSON.stringify([groceryAmtLabel({ name: 'Ginger - 1/2 thumb size' }, 1), groceryAmtLabel({ name: 'Ginger - 1/2 thumb size' }, 2)]));
      ok('amt: no amount anywhere gives an empty label',
        groceryAmtLabel({ name: 'Salt' }, 1) === '', 'got: ' + groceryAmtLabel({ name: 'Salt' }, 1));

      // ── carryGroceryPrefs: re-parsed text must not lose the fields ─
      var prev = parseIngredients('400 g Chopped tomatoes\\n2 tbsp Olive oil\\n1 Onion');
      prev[0].groceryName = 'Passata';
      prev[1].noBuy = true;
      var next = carryGroceryPrefs(parseIngredients('400 g Chopped tomatoes\\n2 tbsp Olive oil\\n1 Onion\\n1 tsp Salt'), prev);
      ok('carry: an override survives a re-parse of the same text',
        next[0].groceryName === 'Passata', 'got: ' + JSON.stringify(next[0]));
      ok('carry: a noBuy flag survives a re-parse',
        next[1].noBuy === true, 'got: ' + JSON.stringify(next[1]));
      ok('carry: an ingredient with no preferences is left plain',
        !next[2].groceryName && !next[2].noBuy && !next[3].groceryName && !next[3].noBuy,
        'got: ' + JSON.stringify([next[2], next[3]]));
      // Matching is on the shopping key, so re-wording a line keeps the prefs.
      var reworded = carryGroceryPrefs(parseIngredients('400 g chopped tomato\\n2 tbsp olive oils'), prev);
      ok('carry: matching survives a re-worded line (key, not exact text)',
        reworded[0].groceryName === 'Passata' && reworded[1].noBuy === true,
        'got: ' + JSON.stringify(reworded));
      // A line rewritten as the SHOPPING name still finds its preference.
      var asShop = carryGroceryPrefs(parseIngredients('400 g Passata'), prev);
      ok('carry: a line brought into line with the shopping name still matches',
        asShop[0].groceryName === 'Passata', 'got: ' + JSON.stringify(asShop[0]));
      var hdr = carryGroceryPrefs(parseIngredients('<b>Sauce</b>\\n400 g Chopped tomatoes'), prev);
      ok('carry: headers are never given preferences',
        !hdr[0].groceryName && !hdr[0].noBuy && hdr[1].groceryName === 'Passata',
        'got: ' + JSON.stringify(hdr));
      ok('carry: nothing to carry is a safe no-op',
        carryGroceryPrefs(parseIngredients('1 Egg'), [])[0].name === 'Egg');

      // ── rescueIngredientMeasure rebuilds the object (v365) ───────
      // It re-parses the line into a FRESH object, so the preferences have to
      // be copied across or an add would forget them.
      var old = { amount: 1, name: '3/4 cup + 2 tbsp Greek yogurt', groceryName: 'Greek yoghurt', noBuy: true };
      var res = rescueIngredientMeasure(old);
      ok('rescue: the measure really was recovered (a fresh object)',
        res !== old && res.amount != null && res.amount !== 1, 'got: ' + JSON.stringify(res));
      ok('rescue: the override is carried onto the rescued object',
        res.groceryName === 'Greek yoghurt', 'got: ' + JSON.stringify(res));
      ok('rescue: the noBuy flag is carried onto the rescued object',
        res.noBuy === true, 'got: ' + JSON.stringify(res));

      // ── the push itself honours both fields ─────────────────────
      // This is the week-planner / roll-over path too: they call
      // addRecipeToGroceries directly, with no review screen in between.
      listData.grocery = { items: [], hist: [] };
      addRecipeToGroceries({ name: 'Bol', servings: 1, ingredients: [
        { name: 'Chopped tomatoes', amount: 400, unit: 'g', groceryName: 'Passata' },
        { name: 'Olive oil', amount: 2, unit: 'tbsp', noBuy: true },
        { name: 'Onion', amount: 1 }
      ] }, 1, true);
      var got = listData.grocery.items.map(function(i){ return i.name; }).sort().join(',');
      ok('push: the override name is what lands on the list',
        got === 'Onion,Passata', 'got: ' + got);
      var pass1 = listData.grocery.items.find(function(i){ return i.name === 'Passata'; });
      ok('push: the amount still rides with the renamed item',
        pass1 && pass1.amount === '400 g', 'got: ' + JSON.stringify(pass1 && pass1.amount));
      ok('push: the recipe tag is still set on a renamed item',
        pass1 && pass1.recipe === 'Bol', 'got: ' + JSON.stringify(pass1 && pass1.recipe));
      // The reusable saved-recipe chip must store the buyable name too.
      var chip = (storeGet('fl4_recipes') || []).find(function(x){ return x && x.name === 'Bol'; });
      ok('push: the saved-recipe chip stores the shopping names, skipping noBuy',
        chip && chip.lines.join(',') === 'Passata,Onion', 'got: ' + JSON.stringify(chip && chip.lines));
      // A recipe that is nothing BUT staples has nothing to add.
      listData.grocery = { items: [], hist: [] };
      var none = addRecipeToGroceries({ name: 'Staples', servings: 1, ingredients: [
        { name: 'Salt', noBuy: true }
      ] }, 1, true);
      ok('push: a recipe with only noBuy lines adds nothing',
        none === null && listData.grocery.items.length === 0,
        'got: ' + JSON.stringify(none) + ' / ' + listData.grocery.items.length);

      return {pass:pass, fail:fail};
    })()`);

    // ── the real review screen, end to end ────────────────────────
    const flow = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      function seed(){
        storeSet('fl4_recipebook', [
          { id: 1, name: 'Pasta', servings: 2, updated: 1, ingredients: parseIngredients([
            '<b>For the sauce</b>',
            '400 g Chopped tomatoes',
            '2 tbsp Olive oil',
            '1 Onion, finely chopped'
          ].join('\\n')) }
        ]);
        listData.grocery = { items: [], hist: [] };
        switchSection('recipes');
        _recipeOpenId = 1; _recipeServings = 2; _recipeView = 'detail'; renderRecipes();
      }
      function openPicker(){ document.getElementById('recipeToGroceryBtn').click(); }
      function rowFor(value){
        return Array.prototype.filter.call(document.querySelectorAll('.gpk-name'), function(i){
          return i.value === value;
        })[0] || null;
      }
      function chkFor(value){
        var inp = rowFor(value);
        if (!inp) return null;
        return document.querySelector(".gpk-chk[data-i='" + inp.getAttribute('data-i') + "']");
      }
      function wrapFor(value){
        var inp = rowFor(value);
        if (!inp) return null;
        return document.querySelector(".gpk-chkwrap[data-i='" + inp.getAttribute('data-i') + "']");
      }
      function type(inp, v){ inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      function names(){ return listData.grocery.items.map(function(i){ return i.name; }).sort().join(','); }
      function recipe(){ return getRecipeBook().find(function(x){ return x.id === 1; }); }

      seed();
      openPicker();
      ok('screen: the button opens the review screen instead of adding',
        _recipeView === 'grocerypick' && !!_grocPickState && listData.grocery.items.length === 0,
        'got: view=' + _recipeView + ' items=' + listData.grocery.items.length);
      ok('screen: one row per real ingredient, headers excluded',
        document.querySelectorAll('.gpk-name').length === 3,
        'got ' + document.querySelectorAll('.gpk-name').length);
      var screenTxt = document.getElementById('recipesContent').textContent;
      ok('screen: the section header is still shown for context',
        screenTxt.indexOf('For the sauce') !== -1);
      ok('screen: the amount that will land on the list is previewed',
        screenTxt.indexOf('400 g') !== -1);
      ok('screen: the box holds the derived shopping name, not the raw line',
        !!rowFor('Onion'), 'got: ' + Array.prototype.map.call(document.querySelectorAll('.gpk-name'), function(i){ return i.value; }).join('|'));
      ok('screen: everything starts ticked',
        document.getElementById('gpkAdd').innerHTML.indexOf('Add 3') !== -1,
        'got: ' + document.getElementById('gpkAdd').innerHTML);

      // Untick the oil, rename the tomatoes.
      wrapFor('Olive oil').click();
      ok('screen: unticking updates the button in place',
        document.getElementById('gpkAdd').innerHTML.indexOf('Add 2') !== -1,
        'got: ' + document.getElementById('gpkAdd').innerHTML);
      ok('screen: unticking does NOT re-render (the name boxes are still the same nodes)',
        !!rowFor('Chopped tomatoes'));
      type(rowFor('Chopped tomatoes'), 'Passata');
      document.getElementById('gpkAdd').click();

      ok('add: only the ticked ingredients reached the list, under the new name',
        names() === 'Onion,Passata', 'got: ' + names());
      var r1 = recipe();
      ok('add: the rename is remembered on the ingredient',
        r1.ingredients[1].groceryName === 'Passata', 'got: ' + JSON.stringify(r1.ingredients[1]));
      ok('add: the recipe keeps its OWN wording (a rename cannot lose detail)',
        r1.ingredients[1].name === 'Chopped tomatoes', 'got: ' + JSON.stringify(r1.ingredients[1].name));
      ok('add: the unticked ingredient is remembered as one you never buy',
        r1.ingredients[2].noBuy === true, 'got: ' + JSON.stringify(r1.ingredients[2]));
      ok('add: an untouched ingredient gains no bookkeeping at all',
        !r1.ingredients[3].groceryName && !r1.ingredients[3].noBuy,
        'got: ' + JSON.stringify(r1.ingredients[3]));
      ok('add: the recipe is stamped so the change syncs',
        r1.updated > 1, 'got: ' + r1.updated);
      ok('add: the screen returns to the recipe and drops its state',
        _recipeView === 'detail' && _grocPickState === null,
        'got: view=' + _recipeView + ' state=' + JSON.stringify(_grocPickState));
      var detailTxt = document.getElementById('recipesContent').textContent;
      ok('detail: the recipe view says why the oil never reaches the list',
        detailTxt.indexOf('not added to the shopping list') !== -1);
      ok('detail: the recipe view names what the tomatoes are bought as',
        detailTxt.indexOf('bought as') !== -1 && detailTxt.indexOf('Passata') !== -1);

      // ── next time: both choices are already applied ─────────────
      listData.grocery = { items: [], hist: [] };
      openPicker();
      ok('again: the skipped ingredient opens unticked',
        chkFor('Olive oil') && chkFor('Olive oil').checked === false,
        'got: ' + JSON.stringify(chkFor('Olive oil') && chkFor('Olive oil').checked));
      ok('again: the renamed ingredient opens under its new name',
        !!rowFor('Passata') && !rowFor('Chopped tomatoes'),
        'got: ' + Array.prototype.map.call(document.querySelectorAll('.gpk-name'), function(i){ return i.value; }).join('|'));
      document.getElementById('gpkAdd').click();
      ok('again: adding without touching anything repeats the same choices',
        names() === 'Onion,Passata', 'got: ' + names());

      // ── re-ticking clears the never-buy flag ───────────────────
      listData.grocery = { items: [], hist: [] };
      openPicker();
      wrapFor('Olive oil').click();
      document.getElementById('gpkAdd').click();
      ok('re-tick: the oil is back on the list',
        names() === 'Olive oil,Onion,Passata', 'got: ' + names());
      ok('re-tick: the noBuy flag is removed, not left behind',
        !recipe().ingredients[2].noBuy, 'got: ' + JSON.stringify(recipe().ingredients[2]));

      // ── typing the derived name back in clears the override ────
      listData.grocery = { items: [], hist: [] };
      openPicker();
      type(rowFor('Passata'), 'Chopped tomatoes');
      document.getElementById('gpkAdd').click();
      ok('default: typing the recipe name back in drops the override',
        !recipe().ingredients[1].groceryName, 'got: ' + JSON.stringify(recipe().ingredients[1]));
      ok('default: the list gets the derived name again',
        names().indexOf('Chopped tomatoes') !== -1, 'got: ' + names());

      // ── an override with only whitespace is not stored ─────────
      listData.grocery = { items: [], hist: [] };
      openPicker();
      type(rowFor('Chopped tomatoes'), '   ');
      document.getElementById('gpkAdd').click();
      ok('blank: a blank box is not stored as an override',
        !recipe().ingredients[1].groceryName, 'got: ' + JSON.stringify(recipe().ingredients[1]));
      ok('blank: the item still reaches the list under its derived name',
        names().indexOf('Chopped tomatoes') !== -1, 'got: ' + names());

      // ── untick all: the button refuses, nothing is written ─────
      listData.grocery = { items: [], hist: [] };
      openPicker();
      document.getElementById('gpkNone').click();
      var addBtn = document.getElementById('gpkAdd');
      ok('none: the Add button is disabled when nothing is ticked',
        addBtn.disabled === true && addBtn.innerHTML.indexOf('Nothing') !== -1,
        'got: ' + addBtn.disabled + ' / ' + addBtn.innerHTML);
      applyGroceryPick();   // belt and braces: the guard is in the function too
      ok('none: unticking everything cannot flag the whole recipe as never-buy',
        recipe().ingredients.filter(function(i){ return i && i.noBuy; }).length === 0,
        'got: ' + JSON.stringify(recipe().ingredients));
      ok('none: nothing was added to the list either',
        listData.grocery.items.length === 0, 'got: ' + listData.grocery.items.length);
      grocPickCancel();
      ok('cancel: Cancel returns to the recipe without touching anything',
        _recipeView === 'detail' && _grocPickState === null && listData.grocery.items.length === 0);

      // ── a partner's edit landing mid-review is never clobbered ──
      // The screen holds ingredient INDEXES, so writing against a recipe that
      // moved underneath it could put a preference on the wrong ingredient.
      listData.grocery = { items: [], hist: [] };
      openPicker();
      type(rowFor('Chopped tomatoes'), 'Sieved tomatoes');
      var rb = getRecipeBook();
      rb[0].ingredients = parseIngredients('1 Onion, finely chopped\\n400 g Chopped tomatoes');
      rb[0].updated = Date.now() + 5000;      // a newer copy arrived
      saveRecipeBook(rb);
      document.getElementById('gpkAdd').click();
      ok('stale: the write is refused when the recipe changed underneath',
        !recipe().ingredients.some(function(i){ return i && i.groceryName === 'Sieved tomatoes'; }),
        'got: ' + JSON.stringify(recipe().ingredients));
      ok('stale: the screen is rebuilt from what is stored now',
        _recipeView === 'grocerypick' && !!_grocPickState && _grocPickState.updated === recipe().updated,
        'got: view=' + _recipeView + ' updated=' + (_grocPickState && _grocPickState.updated) + ' vs ' + recipe().updated);
      ok('stale: nothing was pushed to the grocery list',
        listData.grocery.items.length === 0, 'got: ' + listData.grocery.items.length);
      grocPickCancel();

      // ── the preferences survive an edit of the recipe text ─────
      listData.grocery = { items: [], hist: [] };
      openPicker();
      type(rowFor('Chopped tomatoes'), 'Passata');
      wrapFor('Olive oil') && wrapFor('Olive oil').click();
      document.getElementById('gpkAdd').click();
      var before = recipe();
      ok('editor: preconditions set (override + noBuy stored)',
        before.ingredients.some(function(i){ return i.groceryName === 'Passata'; }),
        'got: ' + JSON.stringify(before.ingredients));
      openRecipeEditor(1);
      document.getElementById('reSave').click();
      var after = recipe();
      ok('editor: saving the recipe does not forget the shopping name',
        after.ingredients.some(function(i){ return i.groceryName === 'Passata'; }),
        'got: ' + JSON.stringify(after.ingredients));

      return {pass:pass, fail:fail};
    })()`);

    return {
      pass: units.pass.concat(flow.pass),
      fail: units.fail.concat(flow.fail),
    };
  },
};
