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

      // ── splitGroceryName: measures stranded inside the NAME ──────
      // parseIngredients only peels a leading "<number> <unit>" off a line, so
      // every other way a recipe writes a measure ends up in the name.
      function sp(raw, hasAmount){ return splitGroceryName(raw, !!hasAmount); }

      var lemon = sp('Juice of 1 lemon');
      ok('split: "Juice of 1 lemon" buys a Lemon', lemon.name === 'Lemon', 'got: ' + lemon.name);
      ok('split: lemon quantity is 1', lemon.amount === 1, 'got: ' + lemon.amount);
      ok('split: the original line becomes the note', lemon.detail === 'Juice of 1 lemon', 'got: ' + lemon.detail);

      var zest = sp('Zest of a lime');
      ok('split: "Zest of a lime" reads "a" as one', zest.name === 'Lime' && zest.amount === 1,
        'got: ' + JSON.stringify(zest));

      var garlic = sp('Garlic - 2 cloves');
      ok('split: "Garlic - 2 cloves" buys Garlic', garlic.name === 'Garlic', 'got: ' + garlic.name);
      ok('split: garlic quantity is scalable 2 cloves', garlic.amount === 2 && garlic.unit === 'clove',
        'got: ' + JSON.stringify(garlic));

      var ginger = sp('Ginger - ½ thumb size');
      ok('split: "Ginger - ½ thumb size" buys Ginger', ginger.name === 'Ginger', 'got: ' + ginger.name);
      ok('split: an unscalable measure is kept literally', ginger.qty === '½ thumb size' && ginger.amount === null,
        'got: ' + JSON.stringify(ginger));

      var cor = sp('Fresh coriander - finely chopped');
      ok('split: a prep clause is not read as a quantity',
        cor.name === 'Fresh coriander' && cor.amount === null && cor.prep === 'finely chopped',
        'got: ' + JSON.stringify(cor));

      var mush = sp('200g mushrooms');
      ok('split: "200g mushrooms" splits the glued unit',
        mush.name === 'Mushrooms' && mush.amount === 200 && mush.unit === 'g',
        'got: ' + JSON.stringify(mush));

      var tin = sp('Tin chopped tomatoes', true);
      ok('split: a stranded container word becomes the unit',
        tin.name === 'Chopped tomatoes' && tin.unit === 'tin' && tin.amount === null,
        'got: ' + JSON.stringify(tin));

      ok('split: a hyphenated name is not treated as a dash clause',
        sp('self-rising flour').name === 'Self-rising flour', 'got: ' + sp('self-rising flour').name);
      ok('split: a number followed by a NON-unit word is not raided for a quantity',
        sp('5 spice powder').name === '5 spice powder' && sp('5 spice powder').amount === null,
        'got: ' + JSON.stringify(sp('5 spice powder')));
      ok('split: an ordinary name is untouched',
        sp('Greek yogurt').name === 'Greek yogurt' && sp('Greek yogurt').amount === null,
        'got: ' + JSON.stringify(sp('Greek yogurt')));

      // ── badly-ingested CSV noise (the "Chilli deseeded chili" case) ──
      // Both rules are TRAILING-only. A modifier that LEADS is part of the
      // product and must survive untouched — that asymmetry is the whole
      // safety argument, so it is pinned in both directions here.
      var chil = sp('Chilli deseeded chili');
      ok('noise: the repeated trailing word and the prep are both removed',
        chil.name === 'Chilli', 'got: ' + JSON.stringify(chil));
      ok('noise: the prep instruction is kept as a note',
        chil.prep === 'deseeded', 'got: ' + chil.prep);
      ok('noise: no quantity is invented from thin air',
        chil.amount === null && !chil.qty, 'got: ' + JSON.stringify(chil));

      ok('noise: a trailing prep word alone is stripped',
        sp('Onion finely chopped').name === 'Onion' && sp('Onion finely chopped').prep === 'finely chopped',
        'got: ' + JSON.stringify(sp('Onion finely chopped')));
      ok('noise: a repeated trailing word alone is stripped',
        sp('Chilli chili').name === 'Chilli', 'got: ' + JSON.stringify(sp('Chilli chili')));

      // Leading modifiers are real products — none of these may be touched
      ok('noise: "Chopped tomatoes" survives', sp('Chopped tomatoes').name === 'Chopped tomatoes',
        'got: ' + sp('Chopped tomatoes').name);
      ok('noise: "Condensed milk" survives', sp('Condensed milk').name === 'Condensed milk',
        'got: ' + sp('Condensed milk').name);
      ok('noise: "Smoked salmon" survives', sp('Smoked salmon').name === 'Smoked salmon',
        'got: ' + sp('Smoked salmon').name);
      ok('noise: "Grated cheese" survives', sp('Grated cheese').name === 'Grated cheese',
        'got: ' + sp('Grated cheese').name);
      ok('noise: a name that is ONLY a prep word is not emptied',
        sp('Chopped').name === 'Chopped', 'got: ' + JSON.stringify(sp('Chopped')));
      ok('noise: an unrelated trailing word is not stripped',
        sp('Chilli flakes').name === 'Chilli flakes', 'got: ' + sp('Chilli flakes').name);

      // End to end: the item that started this, straight off Cathal's list
      listData.grocery = { items: [], hist: [] };
      addRecipeToGroceries({ name: 'Curry', servings: 1, ingredients: [
        { name: 'Chilli deseeded chili' }
      ] }, 1, true);
      var gChil = listData.grocery.items[0];
      ok('e2e: the list shows "Chilli"', gChil && gChil.name === 'Chilli',
        'got: ' + (gChil && gChil.name));
      ok('e2e: with "deseeded" as its note', gChil && gChil.notes === 'deseeded for Curry',
        'got: ' + (gChil && gChil.notes));

      // ── the same six, end to end through the real push ───────────
      listData.grocery = { items: [], hist: [] };
      var curry = { name: 'Curry', servings: 1, ingredients: [
        { name: 'Juice of 1 lemon' },
        { name: 'Garlic - 2 cloves' },
        { name: 'Ginger - ½ thumb size' },
        { name: 'Fresh coriander - finely chopped' },
        { name: '200g mushrooms' },
        { name: 'Tin chopped tomatoes', amount: 1 }
      ] };
      addRecipeToGroceries(curry, 1, true);
      function got(n){ return listData.grocery.items.find(function(i){ return i.name === n; }); }

      var gLemon = got('Lemon');
      ok('e2e: Lemon on the list', !!gLemon, 'names: ' + listData.grocery.items.map(function(i){return i.name;}).join(' | '));
      ok('e2e: Lemon quantity 1', gLemon && gLemon.amount === '1', 'got: ' + (gLemon && gLemon.amount));
      ok('e2e: Lemon note is the original line', gLemon && gLemon.notes === 'Juice of 1 lemon for Curry',
        'got: ' + (gLemon && gLemon.notes));

      var gGarlic = got('Garlic');
      ok('e2e: Garlic quantity is "2 cloves"', gGarlic && gGarlic.amount === '2 cloves',
        'got: ' + (gGarlic && gGarlic.amount));

      var gGinger = got('Ginger');
      ok('e2e: Ginger keeps its literal measure', gGinger && gGinger.amount === '½ thumb size',
        'got: ' + (gGinger && gGinger.amount));

      var gCor = got('Fresh coriander');
      ok('e2e: Fresh coriander has no bogus quantity', gCor && !gCor.amount, 'got: ' + (gCor && gCor.amount));
      ok('e2e: Fresh coriander keeps the prep as a note', gCor && gCor.notes === 'finely chopped for Curry',
        'got: ' + (gCor && gCor.notes));

      var gMush = got('Mushrooms');
      ok('e2e: Mushrooms quantity is "200 g"', gMush && gMush.amount === '200 g', 'got: ' + (gMush && gMush.amount));

      var gTom = got('Chopped tomatoes');
      ok('e2e: Chopped tomatoes quantity is "1 tin"', gTom && gTom.amount === '1 tin', 'got: ' + (gTom && gTom.amount));

      ok('e2e: fresh coriander did NOT merge with ground coriander',
        groceryNameKey('Fresh coriander') !== groceryNameKey('Coriander'));

      // ── recovered quantities scale with servings ─────────────────
      listData.grocery = { items: [], hist: [] };
      addRecipeToGroceries(curry, 2, true);
      var dGarlic = got('Garlic'), dMush = got('Mushrooms'), dTom = got('Chopped tomatoes'), dGing = got('Ginger');
      ok('scale: "2 cloves" doubles to "4 cloves"', dGarlic && dGarlic.amount === '4 cloves',
        'got: ' + (dGarlic && dGarlic.amount));
      ok('scale: "200 g" doubles to "400 g"', dMush && dMush.amount === '400 g', 'got: ' + (dMush && dMush.amount));
      ok('scale: "1 tin" doubles to "2 tins"', dTom && dTom.amount === '2 tins', 'got: ' + (dTom && dTom.amount));
      ok('scale: an unscalable measure is dropped rather than shown wrong',
        dGing && !dGing.amount, 'got: ' + (dGing && dGing.amount));

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
