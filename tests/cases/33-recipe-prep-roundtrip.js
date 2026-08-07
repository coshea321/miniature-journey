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
      // v402: the prompt asks for the "=== <id>" block format, not JSON, so it
      // no longer carries the JSON tag. (The tag still exists and still gates
      // the JSON fallback path — see the v402 block below.)
      ok('the export shows the reply format it wants',
        /^=== 123$/m.test(text), text.slice(0, 120));
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

    // ── v398: batching, and the second-pass dead end ──────────────────────
    // Both of these are fixes for real failures on Cathal's 118-recipe book:
    // a whole-book copy came back with prep for only ~19 recipes (the reply
    // stops, not the copy), and a re-run left every row unticked with Apply
    // disabled and nothing saying why.
    const batched = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var TAG = RECIPE_PREP_FILE_TAG;

      // The revised prompt (Cathal's wording, 06/08/2026).
      storeSet('fl4_recipebook', [{ id: 6001, name: 'One', servings: 2, updated: 1, method: 'Cook.', ingredients: parseIngredients('1 Onion') }]);
      var oneText = prepExportText(0);
      ok('the prompt carries the grouping rule',
        /GROUP BY WHAT GOES IN TOGETHER/.test(oneText), oneText.slice(0, 200));
      ok('the prompt asks for spices and garnish to be included',
        /Include the spices and the garnish/.test(oneText), 'spice rule missing');
      ok('the prompt forbids an explanatory note around the JSON',
        /no explanation, no note, no apology/.test(oneText), 'no-preamble rule missing');
      ok('a single-batch book gets no batch header',
        /MY RECIPES \\(1\\)/.test(oneText) && !/BATCH/.test(oneText), 'unexpected batch header');
      ok('one batch is reported for a small book',
        prepBatchCount(getRecipeBook()) === 1, prepBatchCount(getRecipeBook()));

      // v399: batches are sized by CHARACTERS, not by recipe count. Cathal's
      // real book has a three-line recipe sitting beside one with a 4,000-
      // character method, so a fixed count produced wildly different paste
      // sizes — some small, some cut off in transit. Build a book with the
      // same lopsidedness and check the packing copes.
      // Deliberately lopsided rather than merely varied: the first ten
      // recipes carry very long methods and the rest are one-liners. A
      // count-based split would put the same number in every batch regardless;
      // a length-based one has to put far fewer in the early batches. (An
      // evenly-alternating fixture is no test at all — a repeating pattern
      // divides into the budget and comes out even by arithmetic.)
      var mixed = [];
      for (var i = 0; i < 60; i++) {
        mixed.push({ id: 7000 + i, name: 'Recipe ' + i, servings: 2, updated: 1,
                     method: i < 10 ? new Array(80).fill('Simmer gently and stir until it thickens.').join(' ') : 'Cook it.',
                     ingredients: parseIngredients('1 Onion') });
      }
      storeSet('fl4_recipebook', mixed);

      var ranges = prepBatchRanges(getRecipeBook());
      ok('a mixed-size book is split into more than one batch', ranges.length > 1, ranges.length + ' batches');
      ok('every batch is inside the character budget',
        ranges.every(function(r){
          return r.blocks.join('').length <= PREP_BATCH_CHARS || r.blocks.length === 1;
        }),
        JSON.stringify(ranges.map(function(r){ return r.blocks.join('').length; })));
      ok('batches hold different numbers of recipes, because sizes differ',
        new Set(ranges.map(function(r){ return r.blocks.length; })).size > 1,
        JSON.stringify(ranges.map(function(r){ return r.blocks.length; })));
      ok('every recipe lands in exactly one batch',
        ranges.reduce(function(n, r){ return n + r.blocks.length; }, 0) === 60,
        'total blocks: ' + ranges.reduce(function(n, r){ return n + r.blocks.length; }, 0));
      ok('batches are contiguous and in order',
        ranges.every(function(r, i){ return i === 0 || r.from === ranges[i-1].to + 1; }),
        JSON.stringify(ranges.map(function(r){ return r.from + '-' + r.to; })));

      var count = ranges.length;
      var b0 = prepExportText(0), bLast = prepExportText(count - 1);
      ok('batch 1 holds only its own slice',
        /id 7000\\b/.test(b0) && !new RegExp('id ' + (7000 + ranges[0].to + 1) + '\\\\b').test(b0),
        'batch 1 slice wrong');
      ok('the last batch holds the tail of the book',
        /id 7059\\b/.test(bLast) && !/id 7000\\b/.test(bLast), 'last batch slice wrong');
      ok('a batch says which batch it is and which recipes it holds',
        new RegExp('BATCH 1 OF ' + count).test(b0) && /recipes 1-/.test(b0), 'batch header missing');
      ok('an out-of-range batch clamps instead of returning nothing',
        /id 7059\\b/.test(prepExportText(99)) && /id 7000\\b/.test(prepExportText(-5)),
        'clamp failed');

      // A single recipe bigger than the whole budget must still be copyable.
      storeSet('fl4_recipebook', [
        { id: 7500, name: 'Monster', servings: 2, updated: 1,
          method: new Array(400).fill('Simmer gently and stir until it thickens.').join(' '),
          ingredients: parseIngredients('1 Onion') },
        { id: 7501, name: 'Small', servings: 2, updated: 1, method: 'Cook.', ingredients: parseIngredients('1 Leek') }
      ]);
      var mono = prepBatchRanges(getRecipeBook());
      ok('a recipe longer than the whole budget gets its own batch rather than being dropped',
        mono.length === 2 && mono[0].blocks.length === 1 && /id 7500/.test(prepExportText(0)),
        JSON.stringify(mono.map(function(r){ return r.blocks.length; })));
      ok('the recipe after an oversized one is still exported',
        /id 7501/.test(prepExportText(1)), 'trailing recipe lost');

      // The copy screen offers the batches.
      storeSet('fl4_recipebook', mixed);
      switchSection('recipes');
      _prepHelperState = null; _recipeView = 'prephelper'; renderRecipes();
      ok('batch chips are offered when the book needs more than one',
        document.querySelectorAll('.prep-batch').length === count,
        document.querySelectorAll('.prep-batch').length + ' chips vs ' + count + ' batches');
      ok('the copy button names the batch and how many recipes are in it',
        new RegExp('Copy batch 1 of ' + count).test(document.getElementById('prepCopyBtn').textContent) &&
        new RegExp('\\\\(' + ranges[0].blocks.length + ' recipes\\\\)').test(document.getElementById('prepCopyBtn').textContent),
        document.getElementById('prepCopyBtn').textContent);
      document.querySelectorAll('.prep-batch')[1].click();
      ok('tapping a chip switches batch',
        _prepHelperState.batch === 1 && new RegExp('Copy batch 2 of ' + count).test(document.getElementById('prepCopyBtn').textContent),
        'batch=' + _prepHelperState.batch);
      // Back to the first batch: applying the LAST batch has nowhere to
      // advance to, so the advance check has to start somewhere else.
      document.querySelectorAll('.prep-batch')[0].click();

      // Applying a batch stays in the helper and moves to the next one.
      document.getElementById('prepImportBox').value =
        '{"hearth":"' + TAG + '","recipes":[{"id":7040,"prep":"Chop the onion"}]}';
      document.getElementById('prepReviewBtn').click();
      applyPrepImport();
      ok('applying a batch keeps you in the helper',
        _recipeView === 'prephelper' && _prepHelperState !== null, _recipeView);
      ok('applying a batch moves on to the next one',
        _prepHelperState.batch === 1 && _prepHelperState.step === 'copy',
        'batch=' + _prepHelperState.batch + ' step=' + _prepHelperState.step);
      ok('the applied prep landed',
        getRecipeBook().find(function(r){ return r.id === 7040; }).prep === 'Chop the onion',
        'prep not written');

      return {pass:pass, fail:fail};
    })()`);

    // ── the second-pass dead end, specifically ────────────────────────────
    const secondPass = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var TAG = RECIPE_PREP_FILE_TAG;

      // Every recipe already has prep — the exact state a re-run lands in.
      storeSet('fl4_recipebook', [
        { id: 8001, name: 'First', servings: 2, updated: 1, prep: 'Old prep', method: 'Cook.', ingredients: parseIngredients('1 Onion') },
        { id: 8002, name: 'Second', servings: 2, updated: 1, prep: 'Old prep too', method: 'Cook.', ingredients: parseIngredients('1 Leek') }
      ]);
      switchSection('recipes');
      _prepHelperState = null; _recipeView = 'prephelper'; renderRecipes();
      document.getElementById('prepImportBox').value =
        '{"hearth":"' + TAG + '","recipes":[{"id":8001,"prep":"New grouped prep"},{"id":8002,"prep":"Also new"}]}';
      document.getElementById('prepReviewBtn').click();

      // The pre-tick rule still holds — nothing of his is replaced by default.
      ok('a re-run still pre-ticks nothing',
        !_prepHelperState.accept[8001] && !_prepHelperState.accept[8002],
        JSON.stringify(_prepHelperState.accept));
      // ...but it no longer reads as a broken screen.
      ok('the disabled Apply button says what to do rather than "Apply to 0"',
        /Tick the ones you want/.test(document.getElementById('prepApply').textContent) &&
        !/Apply to 0/.test(document.getElementById('prepApply').textContent),
        document.getElementById('prepApply').textContent);
      ok('the screen explains why the rows start unticked',
        /already have prep written, so they start unticked/.test(document.getElementById('recipesContent').textContent),
        'no explanation shown');

      var tickAll = document.getElementById('prepTickAll');
      ok('a tick-all control is offered when rows would replace something', !!tickAll, 'no #prepTickAll');
      tickAll.click();
      ok('tick-all enables Apply for every row',
        /Apply to 2 recipes/.test(document.getElementById('prepApply').textContent) &&
        !document.getElementById('prepApply').disabled,
        document.getElementById('prepApply').textContent);

      document.getElementById('prepTickNone').click();
      ok('untick-all clears them again',
        document.getElementById('prepApply').disabled, 'still enabled');

      document.getElementById('prepTickAll').click();
      applyPrepImport();
      ok('the second pass actually replaces the old prep',
        getRecipeBook().find(function(r){ return r.id === 8001; }).prep === 'New grouped prep' &&
        getRecipeBook().find(function(r){ return r.id === 8002; }).prep === 'Also new',
        JSON.stringify(getRecipeBook().map(function(r){ return r.prep; })));

      // A book with nothing to replace shouldn't grow the control.
      storeSet('fl4_recipebook', [
        { id: 8003, name: 'Fresh', servings: 2, updated: 1, method: 'Cook.', ingredients: parseIngredients('1 Onion') }
      ]);
      _prepHelperState = null; _recipeView = 'prephelper'; renderRecipes();
      document.getElementById('prepImportBox').value =
        '{"hearth":"' + TAG + '","recipes":[{"id":8003,"prep":"Chop"}]}';
      document.getElementById('prepReviewBtn').click();
      ok('no tick-all control when nothing would be replaced',
        !document.getElementById('prepTickAll'), 'control offered needlessly');
      ok('a first run still pre-ticks and is ready to apply',
        /Apply to 1 recipe/.test(document.getElementById('prepApply').textContent),
        document.getElementById('prepApply').textContent);

      return {pass:pass, fail:fail};
    })()`);

    // ── v402: the quote-free block format ─────────────────────────────────
    // JSON kept failing on real recipe text. Cathal's reply contained
    //   "prep":"...slice thinly into ⅛" slices on a mandolin\n..."
    // and the inch mark closes the JSON string, so the whole paste was
    // rejected. Inches, 9x5" tins and quoted names are ordinary in recipes,
    // so the format changed rather than the escaping rules.
    const blocks = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var TAG = RECIPE_PREP_FILE_TAG;

      storeSet('fl4_recipebook', [
        { id: 8801, name: 'Air Fryer Potato Chips', servings: 2, updated: 1, method: 'Fry.', ingredients: parseIngredients('2 Potatoes') },
        { id: 8802, name: 'Banana Coffee', servings: 1, updated: 1, method: 'Blend.', ingredients: parseIngredients('2 Bananas') }
      ]);

      // The exact shape that broke JSON — an unescaped inch mark — now parses.
      var reply =
        '=== 8801\\n' +
        'Scrub the potatoes and slice thinly into 1/8" slices on a mandolin\\n' +
        'Soak the slices in cold water for 15-30 minutes\\n' +
        '\\n' +
        '=== 8802\\n' +
        'Freeze 2 ripe bananas until solid\\n' +
        'Chill a cup of coffee\\n';
      var res = parsePrepReply(reply);
      ok('a block reply parses', !res.error && res.rows.length === 2, JSON.stringify(res.error || res.rows.length));
      ok('an unescaped inch mark survives, which is what broke JSON',
        !res.error && /1\\/8" slices/.test(res.rows[0].prep), JSON.stringify(res.rows && res.rows[0].prep));
      ok('multiple steps become separate lines',
        !res.error && res.rows[0].prep.split('\\n').length === 2, JSON.stringify(res.rows && res.rows[0].prep));
      ok('blocks are matched to the right recipes',
        !res.error && res.rows[1].name === 'Banana Coffee', JSON.stringify(res.rows && res.rows[1].name));

      // Characters that need escaping in JSON are all just text here.
      var nasty = parsePrepReply('=== 8801\\nUse a 9x5" tin, then add the chef\\'s "special" mix \\\\ backslash and it is fine\\n');
      // indexOf rather than a regex here, deliberately: escaping a literal
      // backslash through two layers of source is exactly the class of
      // mistake this whole change exists to stop making.
      ok('quotes, apostrophes and backslashes all survive untouched',
        !nasty.error &&
        nasty.rows[0].prep.indexOf('9x5" tin') !== -1 &&
        nasty.rows[0].prep.indexOf('"special"') !== -1 &&
        nasty.rows[0].prep.indexOf("chef's") !== -1 &&
        nasty.rows[0].prep.indexOf('\\\\ backslash') !== -1,
        JSON.stringify(nasty.error || nasty.rows[0].prep));

      // The real robustness win: a reply cut off part-way still imports every
      // complete block before the cut, instead of failing outright.
      var truncated = parsePrepReply('=== 8801\\nScrub the potatoes\\n\\n=== 8802\\nFreeze the bana');
      ok('a truncated reply still imports the complete blocks',
        !truncated.error && truncated.rows.length === 2 &&
        truncated.rows[0].prep === 'Scrub the potatoes',
        JSON.stringify(truncated.error || truncated.rows.map(function(r){ return r.prep; })));

      // Tolerances.
      ok('prose before the first block is ignored',
        !parsePrepReply('Sure, here you go!\\n\\n=== 8801\\nScrub the potatoes').error, 'preamble rejected');
      // v403: the WHOLE reply now arrives inside a code fence, because a
      // fenced block is what gives a chat its one-tap Copy button on a phone.
      // Loose prose has to be hand-selected, which is what made v402's replies
      // "a wall of text" to copy.
      var F = '\\u0060\\u0060\\u0060';
      var fenced = parsePrepReply(F + '\\n=== 8801\\nScrub the potatoes\\nSoak them\\n\\n=== 8802\\nChill a cup of coffee\\n' + F);
      ok('a fully fenced reply parses',
        !fenced.error && fenced.rows.length === 2, JSON.stringify(fenced.error || fenced.rows.length));
      ok('the fence markers do not leak into the prep text',
        !fenced.error && fenced.rows[0].prep === 'Scrub the potatoes\\nSoak them',
        JSON.stringify(fenced.error || fenced.rows[0].prep));
      ok('a language-tagged fence also parses',
        !parsePrepReply(F + 'text\\n=== 8801\\nScrub the potatoes\\n' + F).error, 'tagged fence rejected');
      ok('a fenced reply with prose around it still parses',
        !parsePrepReply('Here you go!\\n' + F + '\\n=== 8801\\nScrub\\n' + F + '\\nHope that helps.').error,
        'fence + prose rejected');
      ok('bullet characters are stripped from steps',
        parsePrepReply('=== 8801\\n- Scrub the potatoes\\n• Soak them').rows[0].prep === 'Scrub the potatoes\\nSoak them',
        JSON.stringify(parsePrepReply('=== 8801\\n- Scrub the potatoes\\n• Soak them').rows[0].prep));
      ok('a block with no steps is skipped, not written as empty prep',
        parsePrepReply('=== 8801\\n\\n=== 8802\\nChill a cup of coffee').rows.length === 1,
        JSON.stringify(parsePrepReply('=== 8801\\n\\n=== 8802\\nChill a cup of coffee').rows));
      ok('an unknown id in a block is reported, not applied',
        parsePrepReply('=== 8801\\nScrub\\n\\n=== 99999\\nGhost').unmatched.length === 1,
        JSON.stringify(parsePrepReply('=== 8801\\nScrub\\n\\n=== 99999\\nGhost').unmatched));

      // JSON still works, so a reply already in flight is not stranded.
      var json = parsePrepReply('{"hearth":"' + TAG + '","recipes":[{"id":8801,"prep":"Scrub the potatoes"}]}');
      ok('the old JSON format is still accepted',
        !json.error && json.rows.length === 1 && json.rows[0].prep === 'Scrub the potatoes',
        JSON.stringify(json.error || json.rows));
      ok('a reply with block markers is not second-guessed by the JSON path',
        !parsePrepReply('=== 8801\\nScrub {"not":"json"} at all').error, 'block reply rejected');

      // v404: a stray character before the marker used to swallow the block
      // AND its prep lines as preamble — Cathal's first real paste began
      // ".=== 1782917881957" and that whole recipe vanished with no message.
      // Losing a recipe silently is worse than refusing the paste.
      var dotted = parsePrepReply('.=== 8801\\nScrub the potatoes\\nSoak them\\n\\n=== 8802\\nChill a cup of coffee');
      ok('a stray character before the marker no longer drops the recipe',
        !dotted.error && dotted.rows.length === 2, JSON.stringify(dotted.error || dotted.rows.length));
      ok('the recipe behind the stray character keeps all its steps',
        !dotted.error && dotted.rows[0].prep === 'Scrub the potatoes\\nSoak them',
        JSON.stringify(dotted.error || dotted.rows[0].prep));

      ok('a markdown-bolded marker parses',
        (parsePrepReply('**=== 8801**\\nScrub the potatoes').rows || []).length === 1, 'bold marker missed');
      ok('a list-dashed marker parses',
        (parsePrepReply('- === 8801\\nScrub the potatoes').rows || []).length === 1, 'dashed marker missed');
      ok('a heading-style marker parses',
        (parsePrepReply('### === 8801\\nScrub the potatoes').rows || []).length === 1, 'heading marker missed');
      ok('a marker with the recipe name after it parses',
        (parsePrepReply('=== 8801 Air Fryer Potato Chips\\nScrub the potatoes').rows || []).length === 1, 'named marker missed');
      ok('a marker with no space before the id parses',
        (parsePrepReply('===8801\\nScrub the potatoes').rows || []).length === 1, 'tight marker missed');

      // Prep text must never be mistaken for a marker.
      var stepsSafe = parsePrepReply('=== 8801\\nPreheat the oven to 200C\\nCut into 1 cm cubes\\nSimmer 20-30 minutes');
      ok('ordinary prep steps are not mistaken for markers',
        !stepsSafe.error && stepsSafe.rows.length === 1 && stepsSafe.rows[0].prep.split('\\n').length === 3,
        JSON.stringify(stepsSafe.error || stepsSafe.rows[0].prep));

      // The belt and braces: a line that reads like a marker but isn't one
      // must be reported, never quietly skipped.
      var missed = parsePrepReply('Recipe === 8801\\nScrub the potatoes');
      ok('a marker-ish line that cannot be read is reported, not ignored',
        !!missed.error && /Couldn't read this line/.test(missed.error), JSON.stringify(missed));
      ok('the error quotes the offending line so it can be found',
        !!missed.error && /Recipe === 8801/.test(missed.error), JSON.stringify(missed.error));

      // The prompt asks for the new format and warns off the old escaping.
      var text = prepExportText(0);
      ok('the prompt shows the block format', /=== 123/.test(text), 'block example missing');
      ok('the prompt tells it not to use JSON or quoting',
        /Do NOT use JSON/.test(text) && /inch marks/.test(text), 'format rules missing');
      ok('the prompt no longer asks for a JSON object',
        !/"hearth"/.test(text), 'still asking for JSON');
      // v403: asking for the fence back is the whole point — without it the
      // reply is loose prose with no Copy button.
      ok('the prompt asks for the reply inside a code block',
        /inside a single code block/.test(text) && /three backticks/.test(text),
        'code-block instruction missing');
      ok('the prompt no longer forbids a code fence',
        !/no code fence/.test(text), 'still telling it not to fence');
      ok('the prompt says the code block is the whole reply',
        /do not split it into several code blocks/i.test(text), 'single-block rule missing');

      return {pass:pass, fail:fail};
    })()`);

    return {
      pass: [].concat(out.pass, parse.pass, apply.pass, edge.pass, batched.pass, secondPass.pass, blocks.pass),
      fail: [].concat(out.fail, parse.fail, apply.fail, edge.fail, batched.fail, secondPass.fail, blocks.fail),
    };
  },
};
