'use strict';

// v363: recipe ingredients used to land on the Grocery list with the recipe's
// measure noise still inside the NAME — parseIngredients only peels a leading
// number+unit, so "460 g (1 3/4 cups + 2 tbs) Greek yogurt" became an item
// literally named "(1 3/4 cups + 2 tbs) Greek yogurt", which could never match
// a hand-typed "Greek Yoghurt". These cases pin the two new shared helpers
// (cleanGroceryName / groceryNameKey), the real addRecipeToGroceries flow that
// uses them, the amount-in-the-note carry, and the Clear/revert restore.

module.exports = {
  name: '16-grocery-name-cleanup',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── cleanGroceryName ─────────────────────────────────────────
      ok('clean: strips a LEADING bracket (the reported bug)',
        cleanGroceryName('(1 3/4 cups + 2 tbs) Greek yogurt') === 'Greek yogurt',
        'got: ' + cleanGroceryName('(1 3/4 cups + 2 tbs) Greek yogurt'));
      ok('clean: strips a trailing bracket (pre-v363 behaviour kept)',
        cleanGroceryName('Butter (softened)') === 'Butter',
        'got: ' + cleanGroceryName('Butter (softened)'));
      ok('clean: strips an embedded bracket',
        cleanGroceryName('Milk (whole) jug') === 'Milk jug',
        'got: ' + cleanGroceryName('Milk (whole) jug'));
      ok('clean: drops a trailing comma clause',
        cleanGroceryName('onion, finely chopped') === 'Onion',
        'got: ' + cleanGroceryName('onion, finely chopped'));
      ok('clean: drops a stray leading "of" (unit already consumed)',
        cleanGroceryName('of salt') === 'Salt',
        'got: ' + cleanGroceryName('of salt'));
      ok('clean: strips an "x2" quantity suffix',
        cleanGroceryName('Milk x2') === 'Milk',
        'got: ' + cleanGroceryName('Milk x2'));
      ok('clean: sentence-cases a lowercase name',
        cleanGroceryName('self-rising flour') === 'Self-rising flour',
        'got: ' + cleanGroceryName('self-rising flour'));
      ok('clean: leaves deliberate inner caps alone',
        cleanGroceryName('iPhone charger') === 'iPhone charger',
        'got: ' + cleanGroceryName('iPhone charger'));
      ok('clean: light mode keeps a comma clause (task lists)',
        cleanGroceryName('Call bank, ask about fees', true) === 'Call bank, ask about fees',
        'got: ' + cleanGroceryName('Call bank, ask about fees', true));
      ok('clean: light mode still strips brackets',
        cleanGroceryName('Call bank (re fees)', true) === 'Call bank',
        'got: ' + cleanGroceryName('Call bank (re fees)', true));

      // ── groceryNameKey ───────────────────────────────────────────
      ok('key: case-insensitive', groceryNameKey('Greek Yogurt') === groceryNameKey('greek yogurt'));
      ok('key: yoghurt folds to yogurt', groceryNameKey('Greek Yoghurt') === groceryNameKey('Greek yogurt'),
        groceryNameKey('Greek Yoghurt') + ' vs ' + groceryNameKey('Greek yogurt'));
      ok('key: plural folds to singular', groceryNameKey('Eggs') === groceryNameKey('egg'),
        groceryNameKey('Eggs') + ' vs ' + groceryNameKey('egg'));
      ok('key: -oes plural folds', groceryNameKey('Tomatoes') === groceryNameKey('tomato'),
        groceryNameKey('Tomatoes') + ' vs ' + groceryNameKey('tomato'));
      ok('key: -ies plural folds', groceryNameKey('Berries') === groceryNameKey('berry'),
        groceryNameKey('Berries') + ' vs ' + groceryNameKey('berry'));
      ok('key: short -ss words are not butchered', groceryNameKey('Cress') === 'cress',
        'got: ' + groceryNameKey('Cress'));
      ok('key: distinct items still differ', groceryNameKey('Milk') !== groceryNameKey('Butter'));

      // ── the real push: a NEW item ────────────────────────────────
      currentList = 'grocery';
      listData.grocery = { items: [], hist: [] };
      var yog = { name: 'Rolls', servings: 1, ingredients: [
        { name: '(1 3/4 cups + 2 tbs) Greek yogurt', amount: 460, unit: 'g' }
      ] };
      addRecipeToGroceries(yog, 1, true);
      var it = listData.grocery.items[0];
      ok('push: new item name is the clean buyable name', it && it.name === 'Greek yogurt',
        'got: ' + JSON.stringify(it && it.name));
      ok('push: amount chip is the scaled amount', it && it.amount === '460 g',
        'got: ' + JSON.stringify(it && it.amount));
      ok('push: note carries amount + the stripped bracket + recipe',
        it && it.notes === '460 g (1 3/4 cups + 2 tbs) for Rolls',
        'got: ' + JSON.stringify(it && it.notes));

      // ── the real push: matching an EXISTING typed entry ──────────
      listData.grocery = { items: [
        { id: 50, name: 'Greek Yoghurt', catId: 'other', done: false, notes: 'the big tub', updated: 100 }
      ], hist: [] };
      addRecipeToGroceries(yog, 1, true);
      var only = listData.grocery.items;
      ok('match: no duplicate item created', only.length === 1, 'got ' + only.length + ' items');
      var m = only[0];
      ok('match: the existing entry got tagged', m && m.recipe === 'Rolls', 'got: ' + JSON.stringify(m && m.recipe));
      ok('match: the typed name is left alone', m && m.name === 'Greek Yoghurt', 'got: ' + JSON.stringify(m && m.name));
      ok('match: the typed amount chip is left alone', m && !m.amount, 'got: ' + JSON.stringify(m && m.amount));
      ok('match: the amount is appended to the existing note',
        m && m.notes === 'the big tub\\n460 g (1 3/4 cups + 2 tbs) for Rolls',
        'got: ' + JSON.stringify(m && m.notes));
      ok('match: the re-tag is stamped (v353 rule still holds)', m && m.updated > 100, 'got: ' + (m && m.updated));

      // Re-adding the same recipe must REPLACE its own note line, not stack it
      addRecipeToGroceries(yog, 1, true);
      var m2 = listData.grocery.items[0];
      ok('match: re-adding does not duplicate the note line',
        m2 && m2.notes === 'the big tub\\n460 g (1 3/4 cups + 2 tbs) for Rolls',
        'got: ' + JSON.stringify(m2 && m2.notes));

      // ── scaling: the bracket text is base-servings only ──────────
      listData.grocery = { items: [], hist: [] };
      addRecipeToGroceries(yog, 2, true);
      var sc = listData.grocery.items[0];
      ok('scale: amount doubles', sc && sc.amount === '920 g', 'got: ' + JSON.stringify(sc && sc.amount));
      ok('scale: the base-servings bracket is dropped when scaling',
        sc && sc.notes === '920 g for Rolls', 'got: ' + JSON.stringify(sc && sc.notes));

      // ── Clear/revert puts a matched item's note back ─────────────
      listData.grocery = { items: [
        { id: 60, name: 'Greek Yoghurt', catId: 'other', done: false, notes: 'the big tub', updated: 100 }
      ], hist: [] };
      addRecipeToGroceries(yog, 1, true);
      renderList();
      var clearBtn = document.querySelector(".recipe-clear-btn[data-recipe='Rolls']");
      ok('clear: the recipe chip rendered', !!clearBtn);
      if (clearBtn) clearBtn.click();
      // Nothing was added NEW here (the recipe only tagged an existing item),
      // so the dialog is the single-button "Clear recipe" variant — there is
      // no _rcKeep to press in this branch.
      var goBtn = document.getElementById('_rcKeep') || document.getElementById('_rcDel');
      if (goBtn) goBtn.click();
      var restored = listData.grocery.items.find(function(i){ return i.id === 60; });
      ok('clear: the note is restored exactly as it was',
        restored && restored.notes === 'the big tub', 'got: ' + JSON.stringify(restored && restored.notes));
      ok('clear: the recipe tag is dropped', restored && !restored.recipe,
        'got: ' + JSON.stringify(restored && restored.recipe));

      // ── headers are still never bought ──────────────────────────
      listData.grocery = { items: [], hist: [] };
      addRecipeToGroceries({ name: 'Hdr', servings: 1, ingredients: [
        { name: 'Sauce:', header: true }, { name: 'Milk', amount: 1, unit: 'l' }
      ] }, 1, true);
      ok('headers: only the real ingredient was added',
        listData.grocery.items.length === 1 && listData.grocery.items[0].name === 'Milk',
        'got: ' + JSON.stringify(listData.grocery.items.map(function(x){ return x.name; })));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
