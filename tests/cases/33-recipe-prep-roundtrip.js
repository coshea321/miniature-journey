'use strict';

// v397 — the prep round trip: copy the whole book out, have something write
// the prep, paste the reply back, review it, apply.
//
// The two things that actually matter here:
//   1. the paste side has to survive real chat output — code fences, a
//      sentence either side, and the invisible characters that cost v395 a
//      whole recipe's amounts
//   2. applying must write PREP AND NOTHING ELSE. That narrowness is the
//      entire safety argument for the feature, so it is pinned field by field.

module.exports = {
  name: '33-recipe-prep-roundtrip',
  async run(page) {
    // ── the export text ───────────────────────────────────────────────────
    const out = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      storeSet('fl4_recipebook', [
        { id: 5001, name: 'Chorizo Pasta', servings: 4, updated: 1,
          method: 'Fry the chorizo.\\nAdd the penne.',
          ingredients: parseIngredients(['<b>For the sauce</b>', '200 g Penne', '1 Onion, finely chopped'].join('\\n')) },
        { id: 5002, name: 'Flapjacks', servings: 8, updated: 1, prep: 'Line the tin.',
          method: 'Mix and bake.', ingredients: parseIngredients('300 g Oats') }
      ]);

      var text = prepExportText();
      ok('the export carries the reply format tag',
        text.indexOf(RECIPE_PREP_FILE_TAG) !== -1, text.slice(0, 120));
      ok('every recipe is in the export',
        /Chorizo Pasta/.test(text) && /Flapjacks/.test(text), 'a recipe is missing');
      ok('each recipe carries its id so matching is exact',
        /id 5001/.test(text) && /id 5002/.test(text), 'an id is missing');
      ok('ingredients are in the export', /200 g Penne/.test(text), 'ingredients missing');
      ok('an ingredient section header is kept as a heading',
        /For the sauce:/.test(text), 'header missing');
      ok('the method is in the export', /Fry the chorizo\\./.test(text), 'method missing');
      ok('prep already written is shown so it is not clobbered blind',
        /Prep already written:/.test(text) && /Line the tin\\./.test(text), 'existing prep missing');
      ok('the export says how many recipes there are', /MY RECIPES \\(2\\)/.test(text), text.slice(0, 200));

      return {pass:pass, fail:fail};
    })()`);

    // ── the paste side ────────────────────────────────────────────────────
    const parse = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var TAG = RECIPE_PREP_FILE_TAG;
      function reply(inner){ return '{"hearth":"' + TAG + '","recipes":' + inner + '}'; }

      var clean = parsePrepReply(reply('[{"id":5001,"prep":"Chop the onion"}]'));
      ok('a clean reply parses', !clean.error && clean.rows.length === 1, JSON.stringify(clean));
      ok('the row is matched to the real recipe',
        !clean.error && clean.rows[0].name === 'Chorizo Pasta', JSON.stringify(clean.rows));

      // Chat output shapes.
      var fenced = parsePrepReply('\\u0060\\u0060\\u0060json\\n' + reply('[{"id":5001,"prep":"Chop"}]') + '\\n\\u0060\\u0060\\u0060');
      ok('a fenced code block parses', !fenced.error && fenced.rows.length === 1, JSON.stringify(fenced));
      var chatty = parsePrepReply('Sure! Here you go:\\n' + reply('[{"id":5001,"prep":"Chop"}]') + '\\nLet me know if you want changes.');
      ok('prose either side of the JSON is tolerated', !chatty.error && chatty.rows.length === 1, JSON.stringify(chatty));

      // The v395 lesson: text out of a chat carries invisible characters.
      var zw = parsePrepReply('\\u200b' + reply('[{"id":5001,"prep":"\\u200bChop the onion"}]'));
      ok('zero-width characters do not break the parse', !zw.error && zw.rows.length === 1, JSON.stringify(zw));
      ok('zero-width characters are stripped out of the prep text itself',
        !zw.error && zw.rows[0].prep === 'Chop the onion', JSON.stringify(zw.rows && zw.rows[0]));

      // Refusals.
      ok('a non-Hearth JSON reply is refused',
        !!parsePrepReply('{"foo":1}').error, 'accepted a foreign payload');
      ok('unparseable text is refused with a readable message',
        /JSON/.test(parsePrepReply('not json at all').error || ''), JSON.stringify(parsePrepReply('not json at all')));
      ok('an empty paste is refused', !!parsePrepReply('   ').error, 'accepted an empty paste');

      // Contents.
      ok('an empty prep string is skipped rather than offered',
        !!parsePrepReply(reply('[{"id":5001,"prep":""}]')).error, 'offered an empty prep');
      var unknown = parsePrepReply(reply('[{"id":5001,"prep":"Chop"},{"id":99999,"name":"Ghost","prep":"Nope"}]'));
      ok('a recipe that is not in the book is reported, not applied',
        !unknown.error && unknown.rows.length === 1 && unknown.unmatched.length === 1,
        JSON.stringify(unknown));
      var byName = parsePrepReply(reply('[{"name":"flapjacks","prep":"Line the tin and heat the oven"}]'));
      ok('a missing id falls back to matching on the name',
        !byName.error && byName.rows.length === 1 && byName.rows[0].id === 5002, JSON.stringify(byName));
      var dupe = parsePrepReply(reply('[{"id":5001,"prep":"First"},{"id":5001,"prep":"Second"}]'));
      ok('the same recipe twice yields one row, first wins',
        !dupe.error && dupe.rows.length === 1 && dupe.rows[0].prep === 'First', JSON.stringify(dupe));
      ok('the existing prep is carried onto the row so the review can show it',
        parsePrepReply(reply('[{"id":5002,"prep":"New"}]')).rows[0].existing === 'Line the tin.',
        JSON.stringify(parsePrepReply(reply('[{"id":5002,"prep":"New"}]')).rows[0]));

      return {pass:pass, fail:fail};
    })()`);

    // ── review + apply, end to end ────────────────────────────────────────
    const apply = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var TAG = RECIPE_PREP_FILE_TAG;

      storeSet('fl4_recipebook', [
        { id: 5101, name: 'Plain One', servings: 4, updated: 1, category: 'Dinner', fav: true,
          inRotation: true, lastCooked: 12345, url: 'https://example.com/r', notes: 'my note',
          method: 'Cook it.', ingredients: parseIngredients('200 g Penne') },
        { id: 5102, name: 'Has Prep', servings: 2, updated: 1, prep: 'Line the tin.',
          method: 'Bake.', ingredients: parseIngredients('300 g Oats') }
      ]);
      switchSection('recipes');
      _prepHelperState = null; _recipeView = 'prephelper'; renderRecipes();

      var box = document.getElementById('prepImportBox');
      ok('the helper offers a paste box', !!box, 'no #prepImportBox');
      ok('the helper offers a copy button', !!document.getElementById('prepCopyBtn'), 'no #prepCopyBtn');

      box.value = '{"hearth":"' + TAG + '","recipes":[' +
        '{"id":5101,"prep":"Chop the onion\\\\nPreheat to 200C"},' +
        '{"id":5102,"prep":"Grease and line the tin"}]}';
      document.getElementById('prepReviewBtn').click();

      ok('the review step lists both recipes',
        document.querySelectorAll('.prep-edit').length === 2,
        document.querySelectorAll('.prep-edit').length + ' rows');

      // Pre-tick rule: nothing of his is replaced by default.
      ok('a recipe with no prep is pre-ticked', _prepHelperState.accept[5101] === true, JSON.stringify(_prepHelperState.accept));
      ok('a recipe that already has prep is NOT pre-ticked', _prepHelperState.accept[5102] === false, JSON.stringify(_prepHelperState.accept));
      ok('the row that would replace something says so',
        /replaces what you wrote/.test(document.getElementById('recipesContent').textContent),
        'no replacement warning shown');
      ok('the existing prep is shown next to the proposed one',
        document.getElementById('recipesContent').textContent.indexOf('Line the tin.') !== -1,
        'existing prep not shown');
      ok('the apply button counts only the ticked rows',
        /Apply to 1 recipe/.test(document.getElementById('prepApply').textContent),
        document.getElementById('prepApply').textContent);

      // Nothing written yet.
      ok('reviewing writes nothing to the recipes',
        !getRecipeBook().find(function(r){ return r.id === 5101; }).prep,
        'prep was written before Apply');

      var before = JSON.parse(JSON.stringify(getRecipeBook().find(function(r){ return r.id === 5101; })));
      applyPrepImport();

      var after = getRecipeBook().find(function(r){ return r.id === 5101; });
      ok('the ticked recipe gets its prep', after.prep === 'Chop the onion\\nPreheat to 200C', JSON.stringify(after.prep));
      ok('applying stamps updated so the merge keeps it', after.updated > before.updated, before.updated + ' -> ' + after.updated);
      ok('the unticked recipe is left completely alone',
        getRecipeBook().find(function(r){ return r.id === 5102; }).prep === 'Line the tin.',
        JSON.stringify(getRecipeBook().find(function(r){ return r.id === 5102; }).prep));

      // The whole safety argument: prep and nothing else.
      ok('applying does not touch any other field',
        after.name === before.name && after.servings === before.servings &&
        after.category === before.category && after.fav === before.fav &&
        after.inRotation === before.inRotation && after.lastCooked === before.lastCooked &&
        after.url === before.url && after.notes === before.notes &&
        after.method === before.method &&
        JSON.stringify(after.ingredients) === JSON.stringify(before.ingredients),
        JSON.stringify({name:after.name, fav:after.fav, method:after.method, notes:after.notes}));
      ok('the helper closes back to the list after applying',
        _recipeView === 'list' && _prepHelperState === null, _recipeView);

      return {pass:pass, fail:fail};
    })()`);

    // ── edits, ticking, and the deleted-mid-review guard ──────────────────
    const edge = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var TAG = RECIPE_PREP_FILE_TAG;

      function openReview(reply){
        _prepHelperState = null; _recipeView = 'prephelper'; renderRecipes();
        document.getElementById('prepImportBox').value = reply;
        document.getElementById('prepReviewBtn').click();
      }

      storeSet('fl4_recipebook', [
        { id: 5201, name: 'Editable', servings: 2, updated: 1, method: 'Cook.', ingredients: parseIngredients('200 g Penne') }
      ]);
      switchSection('recipes');
      openReview('{"hearth":"' + TAG + '","recipes":[{"id":5201,"prep":"Original text"}]}');

      // An inline edit survives the re-render a tick causes.
      var ta = document.querySelector('.prep-edit');
      ta.value = 'My own wording';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.prep-chkwrap').click();     // untick — forces a re-render
      document.querySelector('.prep-chkwrap').click();     // tick again
      ok('an inline edit survives ticking and re-rendering',
        document.querySelector('.prep-edit').value === 'My own wording',
        JSON.stringify(document.querySelector('.prep-edit').value));

      applyPrepImport();
      ok('the edited text is what gets written',
        getRecipeBook()[0].prep === 'My own wording', JSON.stringify(getRecipeBook()[0].prep));

      // Emptying a row inline means "leave this one alone".
      openReview('{"hearth":"' + TAG + '","recipes":[{"id":5201,"prep":"Something else"}]}');
      var ta2 = document.querySelector('.prep-edit');
      ta2.value = '   ';
      ta2.dispatchEvent(new Event('input', { bubbles: true }));
      applyPrepImport();
      ok('a row emptied inline is not written',
        getRecipeBook()[0].prep === 'My own wording', JSON.stringify(getRecipeBook()[0].prep));

      // A recipe deleted on another device mid-review must not crash the apply
      // or resurrect the record — the -1 guard.
      openReview('{"hearth":"' + TAG + '","recipes":[{"id":5201,"prep":"After deletion"}]}');
      storeSet('fl4_recipebook', []);
      var threw = false;
      try { applyPrepImport(); } catch (e) { threw = true; }
      ok('applying against a recipe deleted mid-review does not throw', !threw, 'threw');
      // (An empty book gets the starter recipe put back by seedRecipes() on
      // the next render — that is existing behaviour, so check for the
      // deleted id specifically rather than for an empty book.)
      ok('applying against a deleted recipe does not resurrect it',
        !getRecipeBook().some(function(r){ return r && r.id === 5201; }),
        JSON.stringify(getRecipeBook().map(function(r){ return r && r.id; })));

      // A recipe title is user input and must not be injected into the review.
      storeSet('fl4_recipebook', [
        { id: 5202, name: '<img src=x onerror=1>', servings: 2, updated: 1, method: 'Cook.', ingredients: parseIngredients('200 g Penne') }
      ]);
      openReview('{"hearth":"' + TAG + '","recipes":[{"id":5202,"prep":"Chop"}]}');
      ok('a recipe name is escaped in the review screen',
        document.getElementById('recipesContent').querySelectorAll('img').length === 0,
        'img count: ' + document.getElementById('recipesContent').querySelectorAll('img').length);

      // Leaving the helper clears its state rather than stranding a review.
      prepHelperExit();
      ok('leaving the helper clears the review state',
        _prepHelperState === null && _recipeView === 'list', _recipeView);

      return {pass:pass, fail:fail};
    })()`);

    return {
      pass: [].concat(out.pass, parse.pass, apply.pass, edge.pass),
      fail: [].concat(out.fail, parse.fail, apply.fail, edge.fail),
    };
  },
};
