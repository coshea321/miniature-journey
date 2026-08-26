'use strict';

// v436 — the Calorie helper: copy the unpriced recipes out, paste the reply
// back, review, apply. Same round trip as the v397 Prep helper, writing the
// v434 `kcal` field instead of `prep`.
//
// What's worth pinning:
//   1. the export pool DEFAULTS to recipes with no figure — the whole point is
//      filling blanks, and re-sending priced recipes burns the paste budget
//   2. the export carries the servings, because the answer is PER SERVING and
//      that is the number the estimate gets divided by
//   3. a reply is a PROPOSAL: nothing is written until Apply, and a recipe
//      that already has a figure starts UNTICKED so it is never replaced by
//      default (the prep helper's rule, and the reason this is safe)
//   4. apply writes kcal and NOTHING else, and stamps `updated` — an unstamped
//      mutation loses the sync merge (v353)
//   5. a junk number is reported, not silently written
//   6. the batch index resets after applying on the default pool: the applied
//      recipes drop OUT of it, so advancing would skip a batch of recipes

module.exports = {
  name: '47-recipe-calorie-helper',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function content(){ return document.getElementById('recipesContent'); }
      function openHelper(){
        _calHelperState = null; _recipeView = 'calhelper'; renderRecipes();
      }
      function byId(id){ return getRecipeBook().find(function(r){ return r.id === id; }); }

      storeSet('fl4_recipebook', [
        { id: 4701, name: 'Unpriced Stew', servings: 4, updated: 1, category: 'Dinner',
          method: 'Fry the beef in oil, then stew it.',
          ingredients: parseIngredients('500 g Beef\\n2 tbsp Olive oil') },
        { id: 4702, name: 'Unpriced Soup', servings: 2, updated: 1,
          method: 'Simmer it.', ingredients: parseIngredients('300 g Lentils') },
        { id: 4703, name: 'Already Priced', servings: 4, kcal: 600, updated: 1,
          method: 'Bake it.', ingredients: parseIngredients('200 g Flour') }
      ]);
      switchSection('recipes');

      // ── 1. The pool defaults to the unpriced recipes ────────────────────
      ok('the pool skips recipes that already have a figure',
        calHelperPool(false).length === 2, JSON.stringify(calHelperPool(false).map(function(r){ return r.name; })));
      ok('the toggle widens it to the whole book',
        calHelperPool(true).length === 3, String(calHelperPool(true).length));

      var text = calExportText(0, false);
      ok('the export names the unpriced recipes', /Unpriced Stew/.test(text) && /Unpriced Soup/.test(text), 'missing a recipe');
      ok('the export does NOT re-send an already-priced recipe',
        text.indexOf('Already Priced') === -1, 'a priced recipe was sent out');
      ok('the export carries the servings — the estimate is divided by it',
        /Unpriced Stew \\(serves 4\\)/.test(text), text.slice(0, 300));
      ok('the export carries the ingredients', /500 g Beef/.test(text), 'ingredients missing');
      ok('the export carries the method — cooking fat changes the answer',
        /Fry the beef in oil/.test(text), 'method missing');
      ok('the export asks for a PER SERVING figure', /PER SERVING/.test(text), 'per-serving instruction missing');
      ok('the export carries each id, which the reply is matched on',
        text.indexOf('id 4701') !== -1 && text.indexOf('id 4702') !== -1, 'an id is missing');
      ok('the whole-book export does include the priced one, with its figure',
        /Already Priced/.test(calExportText(0, true)) && /600 kcal per serving/.test(calExportText(0, true)),
        'the includeAll export is wrong');

      // ── 2. Reading a reply ──────────────────────────────────────────────
      var res = parseCalReply('=== 4701\\n780\\n\\n=== 4702\\n310\\n');
      ok('a clean reply reads back both recipes', res.rows && res.rows.length === 2, JSON.stringify(res));
      ok('the numbers are read', res.rows[0].kcal === 780 && res.rows[1].kcal === 310, JSON.stringify(res.rows));
      ok('a row knows there was nothing there before', res.rows[0].existing === 0, String(res.rows[0].existing));

      var messy = parseCalReply('Here you go!\\n\\n\\u0060\\u0060\\u0060\\n=== 4701\\n~780 kcal\\n\\n=== 4702\\n1,310 kcal per serving\\n\\u0060\\u0060\\u0060');
      ok('a fenced reply with units and commas still reads', messy.rows && messy.rows.length === 2, JSON.stringify(messy));
      ok('units and tildes are stripped off the number', messy.rows[0].kcal === 780, JSON.stringify(messy.rows[0]));
      ok('a comma-grouped number is read whole, not truncated to 1',
        messy.rows[1].kcal === 1310, JSON.stringify(messy.rows[1]));

      var junk = parseCalReply('=== 4701\\nno idea sorry\\n\\n=== 4702\\n420\\n');
      ok('a block with no number is reported, not written', junk.rows.length === 1 && junk.unreadable.length === 1,
        JSON.stringify(junk));
      ok('the report names the recipe it skipped', /Unpriced Stew/.test(junk.unreadable[0]), junk.unreadable[0]);
      var absurd = parseCalReply('=== 4701\\n999999\\n');
      ok('an out-of-range number is skipped rather than stored',
        (absurd.error || '').length > 0 || (absurd.rows || []).length === 0, JSON.stringify(absurd));
      ok('a reply in the wrong shape is refused with a message',
        !!parseCalReply('{"4701": 780}').error, JSON.stringify(parseCalReply('{"4701": 780}')));
      ok('an empty paste is refused with a message', !!parseCalReply('   ').error, 'empty paste accepted');
      var gone = parseCalReply('=== 999999\\n500\\n');
      ok('a reply for a recipe that no longer exists is refused, not applied',
        !!gone.error, JSON.stringify(gone));

      // ── 3. The review screen writes nothing on its own ──────────────────
      openHelper();
      ok('the helper opens on the copy step', /Calorie helper/.test(content().textContent), content().textContent.slice(0, 80));
      ok('it says how many are going out', !!document.getElementById('calCopyBtn'), 'no copy button');
      document.getElementById('calImportBox').value = '=== 4701\\n780\\n\\n=== 4702\\n310\\n\\n=== 4703\\n999\\n';
      document.getElementById('calReviewBtn').click();
      ok('the review step lists all three', _calHelperState.rows.length === 3, JSON.stringify(_calHelperState.rows));
      ok('a recipe with no figure is pre-ticked', _calHelperState.accept[4701] === true, JSON.stringify(_calHelperState.accept));
      ok('a recipe that ALREADY has a figure starts unticked',
        _calHelperState.accept[4703] === false, JSON.stringify(_calHelperState.accept));
      ok('the row says what it would replace', /replaces 600/.test(content().textContent), 'no replacement warning');
      ok('the apply button counts only the ticked rows',
        /Apply to 2 recipes/.test(document.getElementById('calApply').textContent),
        document.getElementById('calApply').textContent);
      ok('NOTHING has been written to the book yet',
        byId(4701).kcal === undefined && byId(4703).kcal === 600,
        JSON.stringify([byId(4701).kcal, byId(4703).kcal]));

      // An inline edit wins over what came back.
      var box = content().querySelector('.cal-edit[data-id="4701"]');
      ok('each row offers an editable number', !!box, 'no number input');
      box.value = '800';
      box.dispatchEvent(new Event('input'));
      ok('the edit is held in state, so a re-render does not lose it',
        _calHelperState.edits[4701] === '800', JSON.stringify(_calHelperState.edits));

      // ── 4. Apply writes kcal and nothing else ───────────────────────────
      var before = JSON.parse(JSON.stringify(byId(4701)));
      applyCalImport();
      var after = byId(4701);
      ok('the edited number is what got written', after.kcal === 800, String(after.kcal));
      ok('the unedited row is written as it came back', byId(4702).kcal === 310, String(byId(4702).kcal));
      ok('the unticked row is left completely alone', byId(4703).kcal === 600, String(byId(4703).kcal));
      ok('updated is stamped, or the change loses the sync merge',
        after.updated > before.updated, String(after.updated) + ' vs ' + String(before.updated));
      ok('NOTHING else on the recipe moved', (function(){
        return after.name === before.name && after.servings === before.servings &&
               after.method === before.method && after.category === before.category &&
               JSON.stringify(after.ingredients) === JSON.stringify(before.ingredients);
      })(), JSON.stringify(after));

      // ── 5. After applying, the pool is empty and the helper says so ─────
      ok('the applied recipes drop out of the default pool',
        calHelperPool(false).length === 0, JSON.stringify(calHelperPool(false).map(function(r){ return r.name; })));
      ok('the batch index reset rather than advancing past the shrunken pool',
        !_calHelperState || _calHelperState.batch === 0,
        JSON.stringify(_calHelperState && _calHelperState.batch));
      openHelper();
      ok('with everything priced the helper says so instead of offering an empty copy',
        /already has a calorie figure/.test(content().textContent) && !document.getElementById('calCopyBtn'),
        content().textContent.slice(0, 160));
      ok('and it still offers the re-price toggle', !!document.getElementById('calAll'), 'no toggle on the empty state');

      return {pass:pass, fail:fail};
    })()`);
  },
};
