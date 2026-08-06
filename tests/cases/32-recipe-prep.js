'use strict';

// v396 — an optional `prep` field on recipes, plus the derived fallback that
// makes the whole existing recipe book show something without a migration.
//
// Two things are worth pinning here, and neither is the styling:
//   1. the derived reader has to find prep wording in every shape an
//      ingredient is actually stored in — bracketed (the canonical v366
//      shape), comma'd, and " - " clause'd — while refusing MEASURES, which
//      live in exactly the same brackets ("(425 g, rinsed)" is one of each)
//   2. the fallback must stay a fallback: a typed prep replaces it, and
//      nothing derived is ever written to a stored recipe by rendering it

module.exports = {
  name: '32-recipe-prep',
  async run(page) {
    // ── the reader, directly ──────────────────────────────────────────────
    const read = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function prepOf(lines){
        return derivedPrepSteps({ ingredients: parseIngredients(lines.join('\\n')) });
      }

      // The canonical v366 shape: prep lives in the bracket, which
      // splitGroceryName deliberately never looks inside.
      var bracket = prepOf(['2 clove Garlic (minced)']);
      ok('a bracketed prep note is found',
        bracket.length === 1 && bracket[0].prep === 'minced', JSON.stringify(bracket));
      ok('the ingredient name is cleaned of the bracket',
        bracket.length === 1 && bracket[0].name === 'Garlic', JSON.stringify(bracket));

      // A bracket carrying BOTH a measure and a prep word: keep one, drop
      // the other. This is the case the conservative word-list rule exists for.
      var mixed = prepOf(['1 can Black beans (425 g, rinsed)']);
      ok('a measure inside the bracket is not listed as prep',
        mixed.length === 1 && mixed[0].prep === 'rinsed', JSON.stringify(mixed));

      // The other two shapes an untidied recipe uses.
      ok('a comma clause is found',
        prepOf(['1 Onion, finely chopped'])[0].prep === 'finely chopped',
        JSON.stringify(prepOf(['1 Onion, finely chopped'])));
      ok('a " - " clause is found',
        prepOf(['Fresh coriander - roughly chopped'])[0].prep === 'roughly chopped',
        JSON.stringify(prepOf(['Fresh coriander - roughly chopped'])));

      // Nothing to say = no row. Most ingredients are like this, and a list
      // with a row per ingredient would be worse than no list at all.
      ok('a plain ingredient contributes no prep row',
        prepOf(['200 g Flour', '2 Eggs', '150 ml Milk']).length === 0,
        JSON.stringify(prepOf(['200 g Flour', '2 Eggs', '150 ml Milk'])));
      ok('a bracket holding only a measure contributes no prep row',
        prepOf(['1 tin Tomatoes (400 g)']).length === 0,
        JSON.stringify(prepOf(['1 tin Tomatoes (400 g)'])));
      ok('an "or" alternative in a bracket is not prep',
        prepOf(['2 tbsp Butter (or 30 g margarine)']).length === 0,
        JSON.stringify(prepOf(['2 tbsp Butter (or 30 g margarine)'])));

      // Section headers are not ingredients and must never produce a row.
      var headed = prepOf(['<b>For the sauce</b>', '1 Onion, diced']);
      ok('a section header contributes no prep row',
        headed.length === 1 && headed[0].name === 'Onion', JSON.stringify(headed));

      // Order follows the recipe, and multiple notes in one bracket join up.
      var many = prepOf(['1 Onion (peeled, finely chopped)', '2 clove Garlic (crushed)']);
      ok('several notes in one bracket are joined',
        many.length === 2 && many[0].prep === 'peeled, finely chopped', JSON.stringify(many));
      ok('rows keep recipe order',
        many.length === 2 && many[1].name === 'Garlic', JSON.stringify(many));

      // The wider display word list must not have leaked into the grocery one:
      // GROCERY_PREP_WORDS drives what gets stripped off a SHOPPING name, and
      // widening it would quietly change what lands on the list.
      ok('GROCERY_PREP_WORDS was not widened by the display list',
        GROCERY_PREP_WORDS.indexOf('marinated') === -1 && RECIPE_PREP_WORDS.indexOf('marinated') !== -1,
        'grocery=' + GROCERY_PREP_WORDS.length + ' recipe=' + RECIPE_PREP_WORDS.length);

      // Junk in, no crash out.
      ok('a recipe with no ingredients is handled',
        derivedPrepSteps({}).length === 0 && derivedPrepSteps(null).length === 0, 'threw or returned rows');
      ok('a null ingredient entry is skipped',
        derivedPrepSteps({ ingredients: [null, { name: 'Onion (diced)' }] }).length === 1,
        JSON.stringify(derivedPrepSteps({ ingredients: [null, { name: 'Onion (diced)' }] })));

      ok('isPrepPhrase refuses a bare measure', !isPrepPhrase('425 g') && !isPrepPhrase('15-ounce'), 'measure accepted as prep');
      ok('isPrepPhrase accepts an instruction', isPrepPhrase('finely chopped') && isPrepPhrase('brought to room temperature'), 'instruction refused');
      ok('isPrepPhrase does not match a prep word inside another word',
        !isPrepPhrase('uncut') && !isPrepPhrase('biscuit'), 'matched mid-word');

      return {pass:pass, fail:fail};
    })()`);

    // ── the detail view, end to end ───────────────────────────────────────
    const view = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function sectionText(label){
        var el = document.getElementById('recipesContent');
        var heads = Array.prototype.slice.call(el.querySelectorAll('div'));
        for (var i = 0; i < heads.length; i++) {
          if (heads[i].textContent.trim() === label && heads[i].nextElementSibling) {
            return heads[i].nextElementSibling.innerText;
          }
        }
        return null;
      }

      // A pre-v396 recipe: no prep field at all, prep wording in the ingredients.
      storeSet('fl4_recipebook', [{
        id: 4101, name: 'Old Recipe', servings: 2, updated: 1,
        method: '1. Fry the onion.\\n2. Add the beans.',
        ingredients: parseIngredients(['1 Onion, finely chopped', '200 g Flour'].join('\\n'))
      }]);
      switchSection('recipes');
      _recipeOpenId = 4101; _recipeServings = 2; _recipeView = 'detail'; renderRecipes();

      var derived = sectionText('Prep');
      ok('a recipe with no prep field still shows a Prep section',
        derived !== null, 'no Prep heading in the detail view');
      ok('the derived prep names the ingredient and what to do',
        derived && /Onion/.test(derived) && /finely chopped/.test(derived), JSON.stringify(derived));
      ok('the derived prep is labelled as read from the ingredients',
        derived && /ingredient list/i.test(derived), JSON.stringify(derived));
      ok('an ingredient with nothing to prep is not listed',
        derived && derived.indexOf('Flour') === -1, JSON.stringify(derived));

      // Prep sits before Method — the order you actually cook in. textContent,
      // not innerText: the headings are text-transform:uppercase and innerText
      // applies that, so it would be looking for "Prep" in "PREP".
      var body = document.getElementById('recipesContent').textContent;
      ok('Prep is rendered before Method',
        body.indexOf('Prep') !== -1 && body.indexOf('Prep') < body.indexOf('Method'),
        'prep@' + body.indexOf('Prep') + ' method@' + body.indexOf('Method'));

      // Rendering must not write anything back.
      var stored = getRecipeBook().find(function(r){ return r.id === 4101; });
      ok('rendering the derived prep does not write it to the recipe',
        stored && !stored.prep, 'stored prep: ' + JSON.stringify(stored && stored.prep));

      // A typed prep replaces the derived one rather than stacking with it.
      storeSet('fl4_recipebook', [{
        id: 4102, name: 'New Recipe', servings: 2, updated: 1,
        prep: 'Take the butter out an hour ahead.\\nPreheat the oven to 200C.',
        method: 'Mix and bake.',
        ingredients: parseIngredients('1 Onion, finely chopped')
      }]);
      _recipeOpenId = 4102; _recipeView = 'detail'; renderRecipes();
      var typed = sectionText('Prep');
      ok('a typed prep is shown', typed && /Preheat the oven/.test(typed), JSON.stringify(typed));
      ok('a typed prep replaces the derived list rather than stacking with it',
        typed && typed.indexOf('finely chopped') === -1 && !/ingredient list/i.test(typed),
        JSON.stringify(typed));
      var prepOl = document.getElementById('recipesContent').querySelector('ol');
      ok('a two-line typed prep is numbered like the method',
        !!prepOl && prepOl.querySelectorAll('li').length === 2,
        prepOl ? prepOl.querySelectorAll('li').length + ' items' : 'no <ol>');

      // A recipe with neither shows no Prep heading at all.
      storeSet('fl4_recipebook', [{
        id: 4103, name: 'Bare Recipe', servings: 2, updated: 1,
        method: 'Mix and bake.', ingredients: parseIngredients('200 g Flour')
      }]);
      _recipeOpenId = 4103; _recipeView = 'detail'; renderRecipes();
      ok('no Prep section when there is nothing to show', sectionText('Prep') === null,
        JSON.stringify(sectionText('Prep')));

      // Prep text is user input and is escaped, not injected.
      storeSet('fl4_recipebook', [{
        id: 4104, name: 'Nasty', servings: 2, updated: 1, prep: 'Chop <img src=x onerror=1> it.',
        method: 'Bake.', ingredients: parseIngredients('200 g Flour')
      }]);
      _recipeOpenId = 4104; _recipeView = 'detail'; renderRecipes();
      ok('prep text is escaped rather than rendered as HTML',
        document.getElementById('recipesContent').querySelectorAll('img').length === 0,
        'img count: ' + document.getElementById('recipesContent').querySelectorAll('img').length);

      return {pass:pass, fail:fail};
    })()`);

    // ── the editor: save, and the derive button ───────────────────────────
    const editor = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      storeSet('fl4_recipebook', [{
        id: 4201, name: 'Editable', servings: 2, updated: 1,
        method: 'Bake.', ingredients: parseIngredients(['1 Onion, finely chopped', '200 g Flour'].join('\\n'))
      }]);
      switchSection('recipes');
      _recipeOpenId = 4201; _recipeView = 'detail'; renderRecipes();
      openRecipeEditor(4201);

      var ta = document.getElementById('rePrep');
      ok('the editor has a prep field', !!ta, 'no #rePrep textarea');
      ok('the prep field is NOT pre-filled with the derived list',
        ta && ta.value === '', JSON.stringify(ta && ta.value));

      var btn = document.getElementById('rePrepFromIng');
      ok('the derive button is offered when the ingredients say something', !!btn, 'no #rePrepFromIng button');
      btn.click();
      ok('the button fills the field from the ingredients',
        /Onion/.test(ta.value) && /finely chopped/.test(ta.value), JSON.stringify(ta.value));
      ok('the button lists only ingredients with prep wording',
        ta.value.indexOf('Flour') === -1, JSON.stringify(ta.value));

      // Appending, not clobbering — typed text is his.
      ta.value = 'Preheat the oven.';
      btn.click();
      ok('the button appends rather than overwriting what was typed',
        ta.value.indexOf('Preheat the oven.') === 0 && /finely chopped/.test(ta.value),
        JSON.stringify(ta.value));

      document.getElementById('reSave').click();
      var saved = getRecipeBook().find(function(r){ return r.id === 4201; });
      ok('prep is saved onto the existing recipe',
        saved && saved.prep.indexOf('Preheat the oven.') === 0, JSON.stringify(saved && saved.prep));
      ok('saving prep leaves the method alone',
        saved && saved.method === 'Bake.', JSON.stringify(saved && saved.method));

      // A recipe whose ingredients say nothing gets no button to press.
      storeSet('fl4_recipebook', [{
        id: 4202, name: 'Plain', servings: 2, updated: 1,
        method: 'Bake.', ingredients: parseIngredients('200 g Flour')
      }]);
      openRecipeEditor(4202);
      ok('no derive button when the ingredients say nothing',
        !document.getElementById('rePrepFromIng'), 'button offered with nothing to derive');

      // New recipe: the field saves on that path too.
      openRecipeEditor(null);
      document.getElementById('reName').value = 'Brand New';
      document.getElementById('reIng').value = '1 Onion';
      document.getElementById('rePrep').value = 'Chop everything first.';
      document.getElementById('reSave').click();
      var made = getRecipeBook().find(function(r){ return r.name === 'Brand New'; });
      ok('prep is saved on a brand-new recipe',
        made && made.prep === 'Chop everything first.', JSON.stringify(made && made.prep));

      // Search sees it.
      ok('recipe search looks at the prep text',
        recipeSearchText(made).indexOf('chop everything first') !== -1,
        JSON.stringify(recipeSearchText(made)));

      return {pass:pass, fail:fail};
    })()`);

    return {
      pass: [].concat(read.pass, view.pass, editor.pass),
      fail: [].concat(read.fail, view.fail, editor.fail),
    };
  },
};
