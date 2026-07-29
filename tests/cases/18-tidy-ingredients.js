'use strict';

// v366: the one-off "Tidy ingredients" maintenance pass. Everything before it
// (v363 cleanGroceryName/splitGroceryName, v365 rescue-at-render) cleaned an
// ingredient on its way OUT to the grocery list and never touched storage;
// this rewrites the stored ingredient into "<amount> <unit> <Name> (<detail>)"
// so the recipe view reads properly too.
//
// The safety rule this file exists to pin: the pass may MOVE text between the
// amount, the unit and the bracket, but it may never drop a word. A rewrite
// that would lose something, or that doesn't reparse to the same ingredient,
// must be reported as "needs your eye" and left byte-for-byte alone.

module.exports = {
  name: '18-tidy-ingredients',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function tidy(line){ return tidyIngredient(parseIngredients(line, false)[0]); }
      function after(line){ return tidy(line).after; }

      // ── ingredientToLine: the shared serializer ──────────────────
      // A header used to come back out as a bare word, so saving the recipe
      // in the editor silently demoted it to something you buy.
      var hdr = parseIngredients('<b>For the sauce</b>', false)[0];
      ok('serialize: a header round-trips as a header',
        ingredientToLine(hdr) === '<b>For the sauce</b>' &&
        !!parseIngredients(ingredientToLine(hdr), false)[0].header,
        'got: ' + ingredientToLine(hdr));
      var colonHdr = parseIngredients('Sauce:', false)[0];
      ok('serialize: a "Label:" header also round-trips as a header',
        !!parseIngredients(ingredientToLine(colonHdr), false)[0].header,
        'got: ' + ingredientToLine(colonHdr));
      // A float amount used to be written out with 17 digits.
      ok('serialize: a typed fraction survives instead of decaying to a decimal',
        ingredientToLine(parseIngredients('1 2/3 tbsp olive oil', false)[0]) === '1 2/3 tbsp olive oil',
        'got: ' + ingredientToLine(parseIngredients('1 2/3 tbsp olive oil', false)[0]));
      ok('serialize: fmtIngredientAmount only emits a fraction that reparses',
        parseAmount(fmtIngredientAmount(1.6666666666666665)) > 1.666 &&
        parseAmount(fmtIngredientAmount(1.6666666666666665)) < 1.667,
        'got: ' + fmtIngredientAmount(1.6666666666666665));
      ok('serialize: a whole number stays a whole number',
        fmtIngredientAmount(4) === '4', 'got: ' + fmtIngredientAmount(4));
      ok('serialize: an odd decimal is not forced into a fraction',
        fmtIngredientAmount(1.07) === '1.07', 'got: ' + fmtIngredientAmount(1.07));

      // ── the shapes the tidy pass exists to fix ───────────────────
      ok('tidy: a sized container — the flagship case from the report',
        after('2 15-ounce cans black beans, rinsed / 425 g') === '2 can Black beans (15-ounce, 425 g, rinsed)',
        'got: ' + after('2 15-ounce cans black beans, rinsed / 425 g'));
      ok('tidy: sized container, no comma clause',
        after('1 14-ounce can diced tomatoes / 400 g') === '1 can Diced tomatoes (14-ounce, 400 g)',
        'got: ' + after('1 14-ounce can diced tomatoes / 400 g'));
      // splitGroceryName's trailing prep rule keeps only the LAST prep word, so
      // the comma clause has to be lifted whole before it ever sees it.
      ok('tidy: a comma clause is kept WHOLE, not just its last word',
        after('1 medium-large sweet potato, peeled and diced') === '1 Medium-large sweet potato (peeled and diced)',
        'got: ' + after('1 medium-large sweet potato, peeled and diced'));
      ok('tidy: a glued number+unit is separated',
        after('200g mushrooms') === '200 g Mushrooms',
        'got: ' + after('200g mushrooms'));
      ok('tidy: a stranded container word becomes the unit',
        after('1 tin chopped tomatoes') === '1 tin Chopped tomatoes',
        'got: ' + after('1 tin chopped tomatoes'));
      ok('tidy: a " - " quantity clause moves to the front',
        after('Garlic - 2 cloves') === '2 clove Garlic',
        'got: ' + after('Garlic - 2 cloves'));
      ok('tidy: CSV ingest noise (duplicate word) is dropped, prep kept',
        after('Chilli deseeded chili') === 'Chilli (deseeded)',
        'got: ' + after('Chilli deseeded chili'));
      ok('tidy: a leading bracket moves to the back',
        after('460 g (1 3/4 cups + 2 tbs) Greek yogurt') === '460 g Greek yogurt (1 3/4 cups + 2 tbs)',
        'got: ' + after('460 g (1 3/4 cups + 2 tbs) Greek yogurt'));

      // ── what it must NOT do ──────────────────────────────────────
      var h = tidy('<b>For the sauce</b>');
      ok('tidy: a header is never rewritten', h.ok && !h.changed && h.after === '<b>For the sauce</b>',
        'got: ' + JSON.stringify(h.after) + ' changed=' + h.changed);
      var j = tidy('Juice of 1 lemon');
      ok('tidy: "Juice of ..." is left alone — the downstream rescue owns it',
        j.ok && !j.changed && j.after === 'Juice of 1 lemon',
        'got: ' + JSON.stringify(j.after) + ' changed=' + j.changed);
      // A leading modifier is part of the product and must survive (the v363
      // trailing-only asymmetry, re-pinned here because tidy writes brackets).
      ok('tidy: a leading modifier is never mistaken for an instruction',
        after('smoked salmon') === 'Smoked salmon', 'got: ' + after('smoked salmon'));
      ok('tidy: a range survives the rewrite',
        after('2-3 tbsp soy sauce') === '2-3 tbsp Soy sauce', 'got: ' + after('2-3 tbsp soy sauce'));
      var comp = tidy('1 3/4 cup + 2 tbsp Greek yogurt');
      ok('tidy: a compound keeps its original phrasing, not a decimal',
        comp.after.indexOf('1 3/4 cup + 2 tbsp') === 0, 'got: ' + comp.after);

      // ── the losslessness guard itself ────────────────────────────
      ok('guard: tidyIsLossless accepts a pure rearrangement',
        tidyIsLossless('2 15-ounce cans black beans, rinsed', '2 can Black beans (15-ounce, rinsed)'));
      ok('guard: tidyIsLossless rejects a dropped word',
        !tidyIsLossless('1 sweet potato, peeled and diced', '1 Sweet potato (diced)'));
      ok('guard: a glued unit does not read as a loss',
        tidyIsLossless('200g mushrooms', '200 g Mushrooms'));
      // A measure left inside the name is the one thing the pass exists to
      // remove, so a result still carrying a digit is never accepted.
      var bad = tidyIngredient({ name: '3 bean mix 250' });
      ok('guard: a name still holding a digit is flagged, not saved',
        !bad.ok && bad.after === bad.before, 'got: ok=' + bad.ok + ' after=' + JSON.stringify(bad.after));
      // A flagged line must be byte-identical to what was stored.
      ok('guard: a flagged line is returned completely untouched',
        bad.before === ingredientToLine({ name: '3 bean mix 250' }), 'got: ' + bad.before);

      // ── the splitGroceryName bracket fix this build needed ───────
      // The trailing prep rule used to match THROUGH a closing bracket and
      // hand back "rinsed)", which mattered the moment tidy started writing
      // brackets on purpose.
      var sp = splitGroceryName('Black beans (425 g, rinsed)', true);
      ok('split: no stray paren leaks into the prep note',
        sp.prep.indexOf(')') === -1, 'got: ' + JSON.stringify(sp.prep));
      ok('split: the name is still the buyable name',
        sp.name === 'Black beans', 'got: ' + JSON.stringify(sp.name));

      // ── serves flagging (flag only, never guessed) ───────────────
      ok('serves: a 1-serving recipe with big amounts is flagged',
        tidyServesLooksWrong({ servings: 1, ingredients: parseIngredients(
          ['600 ml water','2 15-ounce cans beans','1 onion','4 cloves garlic','2 tbsp oil'].join('\\n')) }));
      ok('serves: a recipe that states its servings is left alone',
        !tidyServesLooksWrong({ servings: 4, ingredients: parseIngredients(
          ['600 ml water','1 onion','4 cloves garlic','2 tbsp oil','1 tin tomatoes'].join('\\n')) }));
      ok('serves: a genuinely small recipe is not flagged',
        !tidyServesLooksWrong({ servings: 1, ingredients: parseIngredients(
          ['2 tsp coffee','150 ml milk'].join('\\n')) }));

      return { pass: pass, fail: fail };
    })()`);

    const flow = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      function seed(){
        storeSet('fl4_recipebook', [
          { id:1, name:'Chili', servings:1, updated:1, ingredients: parseIngredients([
            '2 15-ounce cans black beans, rinsed / 425 g',
            '1 medium-large sweet potato, peeled and diced',
            '4 cloves garlic, minced',
            '600 ml water',
            '2 tbsp chili powder'
          ].join('\\n')) },
          { id:2, name:'Curry', servings:4, updated:1, ingredients: parseIngredients(
            '<b>For the sauce</b>\\n200g mushrooms\\nCilantro') },
          { id:3, name:'Soup', servings:2, updated:1, ingredients: parseIngredients('Coriander\\n1 Yoghurt') }
        ]);
        switchSection('recipes');
        _recipeView = 'tidy'; _tidyState = null; renderRecipes();
      }

      // ── step one: the review screen ──────────────────────────────
      seed();
      ok('screen: only recipes with something to show are listed',
        _tidyState.recipes.length === 2,
        'got ' + _tidyState.recipes.length + ': ' + _tidyState.recipes.map(function(p){return p.name;}).join(','));
      ok('screen: the mis-imported serves is flagged',
        _tidyState.recipes.filter(function(p){ return p.servesFlag; }).map(function(p){ return p.name; }).join(',') === 'Chili',
        'got: ' + _tidyState.recipes.filter(function(p){ return p.servesFlag; }).map(function(p){ return p.name; }).join(','));

      document.querySelector(".tidy-hdr[data-id='1']").click();
      var vals = Array.prototype.map.call(document.querySelectorAll('.tidy-line'), function(i){ return i.value; });
      ok('screen: the proposal is shown, ready to edit',
        vals[0] === '2 can Black beans (15-ounce, 425 g, rinsed)', 'got: ' + JSON.stringify(vals[0]));

      // Typing is captured on input, so re-rendering must not lose it.
      var li = document.querySelector('.tidy-line');
      li.value = '2 can Black beans (rinsed)';
      li.dispatchEvent(new Event('input', { bubbles: true }));
      var sv = document.querySelector(".tidy-serves[data-id='1']");
      sv.value = '6'; sv.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector(".tidy-hdr[data-id='1']").click();   // collapse
      document.querySelector(".tidy-hdr[data-id='1']").click();   // expand again
      ok('screen: a hand-edit survives the re-render',
        document.querySelector('.tidy-line').value === '2 can Black beans (rinsed)',
        'got: ' + JSON.stringify(document.querySelector('.tidy-line').value));

      // Unticking must actually exclude the recipe from the write.
      var chk = document.querySelector(".tidy-chk[data-id='2']");
      ok('screen: a recipe with confident changes starts ticked', chk.checked);
      chk.click();   // a real tap: the browser flips .checked, then the handler reads it
      ok('screen: unticking a recipe drops it from the Apply count',
        document.getElementById('tidyApply').textContent.indexOf('1 recipe') !== -1,
        'got: ' + document.getElementById('tidyApply').textContent);

      document.getElementById('tidyApply').click();
      document.getElementById('_cfYes').click();

      var rb = getRecipeBook();
      var r1 = rb.find(function(x){ return x.id === 1; });
      var r2 = rb.find(function(x){ return x.id === 2; });
      ok('apply: the hand-edited line is what got stored',
        ingredientToLine(r1.ingredients[0]) === '2 can Black beans (rinsed)',
        'got: ' + ingredientToLine(r1.ingredients[0]));
      ok('apply: the rest of the recipe is tidied',
        ingredientToLine(r1.ingredients[1]) === '1 Medium-large sweet potato (peeled and diced)',
        'got: ' + ingredientToLine(r1.ingredients[1]));
      ok('apply: the typed serves is used, never a guessed one',
        r1.servings === 6, 'got: ' + r1.servings);
      ok('apply: the write is stamped so it syncs',
        r1.updated > 1, 'got: ' + r1.updated);
      ok('apply: an unticked recipe is not touched at all',
        ingredientToLine(r2.ingredients[1]) === '200g mushrooms' && r2.updated === 1,
        'got: ' + ingredientToLine(r2.ingredients[1]) + ' updated=' + r2.updated);

      // ── step two: names that mean the same product ───────────────
      seed();
      document.getElementById('tidyApply').click();
      document.getElementById('_cfYes').click();
      ok('names: step two opens when there is something to merge',
        _tidyState && _tidyState.step === 'names', 'got: ' + (_tidyState && _tidyState.step));
      var groups = _tidyState.groups;
      ok('names: the synonym pair is grouped and labelled as a variant',
        groups.length === 1 && groups[0].viaSynonym &&
        groups[0].variants.map(function(v){ return v.name; }).sort().join(',') === 'Cilantro,Coriander',
        'got: ' + JSON.stringify(groups.map(function(g){ return g.variants.map(function(v){ return v.name; }); })));

      ok('names: nothing is preselected — the default is to leave them alone',
        Object.keys(_tidyState.picks).length === 0, 'got: ' + JSON.stringify(_tidyState.picks));

      var win = Array.prototype.filter.call(document.querySelectorAll('.tidy-pick'), function(r){
        return r.getAttribute('data-name') === 'Coriander'; })[0];
      win.checked = true; win.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('tidyNamesApply').click();
      document.getElementById('_cfYes').click();

      var rb2 = getRecipeBook();
      var curry = rb2.find(function(x){ return x.id === 2; });
      ok('names: the losing spelling is replaced everywhere',
        curry.ingredients.map(function(i){ return i.name; }).indexOf('Coriander') !== -1 &&
        curry.ingredients.map(function(i){ return i.name; }).indexOf('Cilantro') === -1,
        'got: ' + JSON.stringify(curry.ingredients.map(function(i){ return i.name; })));
      ok('names: the screen closes back to the recipe list',
        _recipeView === 'list' && _tidyState === null,
        'got: view=' + _recipeView + ' state=' + JSON.stringify(_tidyState));

      // Two products that merely share a word must NEVER be merged — the
      // ground spice and the fresh herb are different things on a shelf.
      var g = tidyNameGroups([{ ingredients: parseIngredients('Coriander\\nFresh coriander') }]);
      ok('names: "Coriander" and "Fresh coriander" are left as separate products',
        g.length === 0, 'got: ' + JSON.stringify(g));
      // A pure plural/spelling difference still groups.
      var g2 = tidyNameGroups([{ ingredients: parseIngredients('Egg\\nEggs') }]);
      ok('names: a plural-only difference is offered as a merge',
        g2.length === 1 && !g2[0].viaSynonym, 'got: ' + JSON.stringify(g2));

      // ── the payoff: what a tidied recipe puts on the shopping list ──
      listData.grocery = null;
      storeSet(LIST_CONFIG.grocery.key, { items: [], hist: [] });
      listData.grocery = null;
      addRecipeToGroceries(getRecipeBook().find(function(x){ return x.id === 1; }), 1, true);
      var items = loadListData('grocery').items;
      var beans = items.filter(function(i){ return i.name === 'Black beans'; })[0];
      ok('grocery: the item is named something you can actually buy',
        !!beans, 'got: ' + JSON.stringify(items.map(function(i){ return i.name; })));
      ok('grocery: the amount lands in the Amount field',
        beans && beans.amount === '2 cans', 'got: ' + JSON.stringify(beans && beans.amount));
      // This run took the untouched proposal (the hand-edit above belonged to
      // the first seed), so the note carries the whole recovered measure.
      ok('grocery: the detail lands in the note',
        beans && beans.notes === '(15-ounce, 425 g, rinsed)', 'got: ' + JSON.stringify(beans && beans.notes));
      var garlic = items.filter(function(i){ return i.name === 'Garlic'; })[0];
      ok('grocery: a prep-only bracket still reaches the note',
        garlic && garlic.notes === '(minced)', 'got: ' + JSON.stringify(garlic && garlic.notes));

      return { pass: pass, fail: fail };
    })()`);

    return { pass: result.pass.concat(flow.pass), fail: result.fail.concat(flow.fail) };
  }
};
