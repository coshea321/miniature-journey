'use strict';

// v383 — recipe search. This behaviour has now been mis-diagnosed across three
// versions, so it gets pinned properly.
//
// v381 fixed search silently AND-ing with the Favourites filter. v382 fixed the
// version label that hid v381's fix. Neither was the bug Cathal was actually
// hitting: fuzzyMatch is a SUBSEQUENCE matcher, so "curry" matched any text
// containing c..u..r..r..y — "slow cooker ... crusty bread, very yummy" among
// them. On a real-sized book a plain recipe-name search returned most of the
// shelf, so the list looked as though it had not filtered at all.
//
// The fix is a pair, and the pair is what these assertions defend:
//   - WIDER haystack (ingredients, method, category — not just name+notes)
//   - TIGHTER match (substring primary; fuzzy only when substring finds none)
// Widening without tightening makes the over-matching strictly worse, which is
// why no test here may pass with only one half applied.

const BOOK = [
  ['Chicken Curry',  'Dinner',    'Freezes really well. Use the good curry powder.',      ['chicken thighs', 'curry powder'], 'Brown the chicken, add spices.'],
  ['Beef Stew',      'Dinner',    'Slow cooker, 6 hours. Serve with crusty bread, very yummy.', ['beef shin', 'stout'],       'Sear the beef first.'],
  ['Banana Bread',   'Baking',    "Use over-ripe bananas or it won't be sweet enough.",   ['bananas', 'flour'],               'Mash the bananas.'],
  ['Carbonara',      'Dinner',    'Quick unfussy midweek dinner, ready in twenty.',       ['guanciale', 'pecorino'],          'Off the heat or it scrambles.'],
  ["Shepherd's Pie", 'Dinner',    "Cathal's recipe. Curly kale on the side usually.",     ['lamb mince', 'potatoes'],         'Top with mash.'],
  ['Pancakes',       'Breakfast', 'Saturday mornings. Buttermilk if you have it.',        ['flour', 'buttermilk'],            'Rest the batter.'],
  ['Roast Chicken',  'Dinner',    'Sunday. Rub butter under the skin, really important.', ['whole chicken', 'thyme'],         'Roast at 200.'],
  ['Lentil Soup',    'Lunch',     'Cheap, quick, unbelievably filling. Batch cook Sundays.', ['red lentils', 'cumin'],        'Simmer 25 minutes.'],
  ['Scones',         'Baking',    "Don't overwork the dough or they turn out rubbery.",   ['flour', 'butter'],                'Do not overwork.'],
  ['Fish Pie',       'Dinner',    "Use the fishmonger's mix. Creamy, cheesy, comfort food.", ['smoked haddock', 'cream'],     'Bake until bubbling.'],
  ['Chocolate Cake', 'Baking',    'Birthday cake. Buttercream, not ganache — currants never.', ['cocoa', 'sugar'],            'Do not overbake.'],
  ['Chorizo Pasta',  'Dinner',    'Storecupboard staple when the fridge is bare.',        ['chorizo', 'penne'],               'Fry the chorizo until the oil runs.'],
].map((r, i) => ({
  id: i + 1, name: r[0], category: r[1], notes: r[2],
  ingredients: r[3].map((n) => ({ amount: 1, unit: '', name: n })),
  method: r[4], fav: i < 2, servings: 2, updated: Date.now(),
}));

module.exports = {
  name: '25-recipe-search',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    await page.evaluate(
      '(function(){ storeSet("fl4_recipebook", ' + JSON.stringify(BOOK) + ');' +
      '_recipeView = "list"; _recipeFilter = "all"; _recipeSearchQuery = "";' +
      'switchSection("recipes"); return true; })()'
    );

    // Search for `q` and report what the list actually renders.
    async function search(q) {
      return page.evaluate(
        '(function(){ _recipeSearchQuery = ' + JSON.stringify(q) + '; renderRecipes();' +
        'var el = document.getElementById("recipesContent");' +
        'return { n: el.querySelectorAll(".recipe-fav").length, text: el.innerText }; })()'
      );
    }

    // ── The headline regression ────────────────────────────────────────────
    // Searching a recipe's own name must NARROW the list, not return most of
    // it. Before the fix these were 7, 5 and 4 of 12 respectively — enough to
    // look unfiltered on a phone. The bound is deliberately generous (a third
    // of the book) so this fails on real over-matching, not on tuning.
    const nameSearches = [
      ['curry', 'Chicken Curry'],
      ['stew', 'Beef Stew'],
      ['carbonara', 'Carbonara'],
    ];
    for (const [q, expected] of nameSearches) {
      const r = await search(q);
      check(
        'searching "' + q + '" narrows the list (not a near-unfiltered dump)',
        r.n > 0 && r.n <= Math.ceil(BOOK.length / 3),
        'showed ' + r.n + ' of ' + BOOK.length + ' recipes'
      );
      check(
        'searching "' + q + '" finds ' + expected,
        r.text.indexOf(expected) !== -1,
        expected + ' missing from the results'
      );
    }

    // ── The widened haystack ───────────────────────────────────────────────
    // Each of these returned ZERO before the fix: only name+notes was searched.
    const widened = [
      ['penne', 'Chorizo Pasta', 'an ingredient'],
      ['haddock', 'Fish Pie', 'an ingredient'],
      ['scrambles', 'Carbonara', 'a word in the method'],
      ['breakfast', 'Pancakes', 'the category'],
    ];
    for (const [q, expected, why] of widened) {
      const r = await search(q);
      check(
        'searching "' + q + '" (' + why + ') finds ' + expected,
        r.text.indexOf(expected) !== -1,
        'showed ' + r.n + ' recipes; ' + expected + ' not among them'
      );
    }

    // ── Substring beats fuzzy, and fuzzy announces itself ──────────────────
    // An exact substring hit must NOT drag in fuzzy near-misses alongside it.
    const exact = await search('chorizo');
    check(
      'an exact substring match does not also show fuzzy near-misses',
      exact.text.indexOf('showing similar') === -1,
      'the fuzzy-fallback notice appeared for an exact match'
    );

    // A typo has no substring match anywhere, so the fuzzy pass runs — and the
    // list must SAY it is showing approximate results rather than passing them
    // off as hits.
    const typo = await search('chikcen');
    check(
      'a typo falls back to fuzzy matching and finds something',
      typo.n > 0,
      'fuzzy fallback returned nothing for "chikcen"'
    );
    check(
      'the fuzzy fallback labels itself on screen',
      typo.text.indexOf('showing similar') !== -1,
      'no "showing similar" notice while showing fuzzy results'
    );

    // ── Empty states must say WHY ──────────────────────────────────────────
    // A bare "Nothing here yet." under an active search is what made this read
    // as a broken app three versions running.
    const none = await search('zzzzqqq');
    check('a no-match search shows zero recipes', none.n === 0, 'showed ' + none.n);
    check(
      'a no-match search names the query it failed on',
      none.text.indexOf('zzzzqqq') !== -1 && /No recipes match/.test(none.text),
      'empty state was: ' + JSON.stringify(none.text.trim().slice(-90))
    );
    check(
      'a no-match search does not fall back to the bare "Nothing here yet."',
      none.text.indexOf('Nothing here yet.') === -1,
      'the unexplained empty state is still being used under a search'
    );

    // An empty CATEGORY names the category rather than going silent.
    const emptyCat = await page.evaluate(
      '(function(){ _recipeSearchQuery = ""; _recipeFilter = "Lunch";' +
      'var rb = getRecipeBook();' +
      'rb.forEach(function(r){ if (r.category === "Lunch") r.category = "Dinner"; });' +
      'saveRecipeBook(rb); renderRecipes();' +
      'return document.getElementById("recipesContent").innerText; })()'
    );
    check(
      'an empty category names the category',
      /Nothing in/.test(emptyCat) && emptyCat.indexOf('Lunch') !== -1,
      'empty state was: ' + JSON.stringify(emptyCat.trim().slice(-90))
    );

    // ── Malformed records must not take the whole search down ──────────────
    // Sync and CSV import are both capable of producing a recipe with missing
    // fields; search must degrade rather than throw.
    const survived = await page.evaluate(
      '(function(){ var rb = getRecipeBook();' +
      'rb.push({ id: 9001, updated: 1 });' +                       // no name/notes/ingredients
      'rb.push({ id: 9002, name: "Ghost", ingredients: [null], updated: 1 });' +
      'saveRecipeBook(rb); _recipeFilter = "all"; _recipeSearchQuery = "curry";' +
      'try { renderRecipes(); return "ok"; } catch (e) { return "threw: " + e.message; } })()'
    );
    check('search survives recipes with missing fields', survived === 'ok', survived);

    // ── v386: two recipe-search state dead ends left by v381 ──────────────
    // v381 fixed search silently AND-ing with a stale Favourites filter when
    // search was OPENED. It missed two other doors to the same symptom
    // (a real match hidden by a leftover filter, reading as "search does
    // nothing"): a category chip tapped while search is active, and leaving
    // Recipes mid-search then coming back.

    // Reset to a clean, unfiltered, non-searching state before each probe.
    async function freshRecipesArrival() {
      await page.evaluate(
        '(function(){ storeSet("fl4_recipebook", ' + JSON.stringify(BOOK) + ');' +
        '_recipeView = "list"; _recipeFilter = "all"; _recipeSearchQuery = "";' +
        'switchSection("home"); switchSection("recipes"); return true; })()'
      );
    }

    // (a) Tapping a category chip while a search is active used to silently
    // re-AND the two — a recipe visible under the chip alone could vanish
    // because it didn't also match the leftover query.
    await freshRecipesArrival();
    const chipResult = await page.evaluate(
      '(function(){ _recipeSearchQuery = "zzzzqqq";' + // guaranteed zero matches
      'var row = document.getElementById("rcpSearchRow"); if (row) row.style.display = "block";' +
      'var input = document.getElementById("rcpSearchInput"); if (input) input.value = "zzzzqqq";' +
      'renderRecipes();' +
      'var chip = Array.prototype.find.call(document.querySelectorAll(".rcp-filter"), function(b){ return b.dataset.key === "Dinner"; });' +
      'chip.click();' +
      'return {' +
      '  query: _recipeSearchQuery,' +
      '  rowHidden: !row || row.style.display === "none",' +
      '  inputCleared: !input || input.value === "",' +
      '  text: document.getElementById("recipesContent").innerText' +
      '}; })()'
    );
    check(
      'tapping a category chip while searching clears the stale search query',
      chipResult.query === '',
      'query was still ' + JSON.stringify(chipResult.query)
    );
    check('tapping a chip while searching hides the search row', chipResult.rowHidden, 'row still shown');
    check('tapping a chip while searching clears the search input', chipResult.inputCleared, 'input still held a value');
    check(
      'the chip tap actually shows Dinner recipes (was hidden by the stale search)',
      chipResult.text.indexOf('Chicken Curry') !== -1 && chipResult.text.indexOf('Banana Bread') === -1,
      'unexpected content: ' + JSON.stringify(chipResult.text.trim().slice(0, 120))
    );

    // (b) Leaving Recipes mid-search and coming back used to leave the query
    // armed and the search row open, so the list looked mysteriously
    // filtered on return with no visible cause.
    await freshRecipesArrival();
    const returnResult = await page.evaluate(
      '(function(){ _recipeSearchQuery = "curry";' +
      'var row = document.getElementById("rcpSearchRow"); if (row) row.style.display = "block";' +
      'var input = document.getElementById("rcpSearchInput"); if (input) input.value = "curry";' +
      'renderRecipes();' +
      'switchSection("home");' +
      'switchSection("recipes");' +
      'return {' +
      '  query: _recipeSearchQuery,' +
      '  rowHidden: !row || row.style.display === "none",' +
      '  inputCleared: !input || input.value === "",' +
      '  n: document.getElementById("recipesContent").querySelectorAll(".recipe-fav").length' +
      '}; })()'
    );
    check(
      'returning to Recipes after leaving mid-search clears the query',
      returnResult.query === '',
      'query was still ' + JSON.stringify(returnResult.query)
    );
    check('returning to Recipes after leaving mid-search hides the search row', returnResult.rowHidden, 'row still shown');
    check('returning to Recipes after leaving mid-search clears the input', returnResult.inputCleared, 'input still held a value');
    check(
      'returning to Recipes after leaving mid-search shows the whole book, not a filtered remnant',
      returnResult.n === BOOK.length,
      'showed ' + returnResult.n + ' of ' + BOOK.length
    );

    return { pass, fail };
  },
};
