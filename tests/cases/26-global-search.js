'use strict';

// v384 — Global search (design record: HEARTH-global-search.md). A FINDER,
// not a filter: scans Lists (grocery/general/personal/travel) + Notes
// (personal/work) and, since v387, Recipes — and hands off to the section
// that owns a match.
//
// v387 adds Recipes as the design doc's explicitly-deferred "phase 2"
// (§9 — "his call, not a build decision"; Cathal made that call 03/08/2026).
// Recipes reuse the WIDER v383 haystack (recipeSearchText: ingredients,
// method, category — not just name+notes), so a search that only a plain
// list item's name+notes could never answer (e.g. "which recipe used
// penne?") now works through global search too. The hand-off is the
// interesting part: openRecord("recipes", ...) has to both reset the
// category filter (never silently AND with a stale chip, the v381/v386
// class) AND avoid being immediately undone by switchSection's OWN v386
// stale-search reset — see the _recipeSearchPreset one-shot flag.
//
// Per the design doc's §3 non-negotiables (carried from the v381→v383
// recipe-search saga), this fixture is deliberately realistic and
// multi-record — the recipe-search bug was invisible on 1-item seed data
// and only showed up at real scale. It also deliberately includes:
//   - 7 "milk" items in one list, to exercise the 5-cap + "+N more"
//   - a substring/subsequence trap pair (grocery "Curry powder" +
//     personal "Rush essay" / "currently overdue") to pin that fuzzy
//     fallback is suppressed GLOBALLY (not per-group) whenever ANY group
//     has a substring hit, and that it correctly activates + labels
//     itself when NO group has one
//   - a null entry in the notes store, since normaliseNotes() does not
//     guard against one (unlike loadListData, which already filters list
//     items) — this is the "known live bug" class HEARTH-global-search.md
//     §6 warns any global-search code must assume exists

const GROCERY = [
  { id: 1, name: 'Milk' },
  { id: 2, name: 'Milk chocolate bar' },
  { id: 3, name: 'Chocolate milkshake mix' },
  { id: 4, name: 'Malted milk biscuits' },
  { id: 5, name: 'Milk of magnesia' },
  { id: 6, name: 'Coconut milk' },
  { id: 7, name: 'Almond milk' },
  { id: 8, name: 'Curry powder' },
  { id: 9, name: 'Spice mix', notes: 'a mild kick, not too hot' }, // subsequence trap for "milk" — must NOT show under substring
].map((it) => Object.assign({ done: false }, it));

const TODO = [
  { id: 1, name: 'Book dentist' },
  { id: 2, name: 'Pay electricity bill', notes: 'due mid-month' },
].map((it) => Object.assign({ done: false }, it));

const PERSONAL = [
  { id: 1, name: 'Milk allergy test', notes: 'for the baby check-up' },
  { id: 2, name: 'Dentist follow-up' },
  { id: 3, name: 'Rush essay', notes: 'currently overdue, hand in Friday' }, // subsequence trap for "curry"
].map((it) => Object.assign({ done: false }, it));

const TRAVEL = [
  { id: 1, name: 'Powdered milk sachets', notes: 'for the baby on the flight', tags: ['baby'] },
  { id: 2, name: 'Passport', tags: ['essentials'] },
].map((it) => Object.assign({ done: false }, it));

const NOTES_PERSONAL = [
  { id: 1, title: 'Wifi password', body: 'Guest network: hearth-guest' },
  { id: 2, title: 'Milk allergy notes for creche', body: 'No dairy at all, including baked goods' },
  null, // malformed — sync merges and a bad write are both capable of this
  { id: 4, title: 'Paint colour', body: 'Farrow & Ball Skimming Stone' },
];

const NOTES_WORK = [
  { id: 1, title: 'Client milk run', body: 'Drop the samples at Milk Market street' },
  { id: 2, title: 'Standup notes', body: 'Sprint review moved to Thursday' },
];

// v387 — Recipes. "Rice Pudding" carries "milk" only as an INGREDIENT (not
// in name/notes), so it only shows up under global search if the wider
// recipeSearchText haystack is actually used, not the plain listSearchText
// one every other group uses. "Chorizo Pasta" similarly needs "penne" found
// via an ingredient with zero name/notes overlap. The trailing null mirrors
// the known fl4_recipebook bug class (HEARTH-global-search.md §6, fixed at
// the source in getRecipeBook() as of v385) — global search must survive it.
const RECIPES = [
  { id: 1, name: 'Rice Pudding', category: 'Dessert', notes: '', ingredients: [{ name: 'milk' }, { name: 'rice' }], method: 'Simmer gently until thick.', servings: 4, updated: Date.now() },
  { id: 2, name: 'Chicken Curry', category: 'Dinner', notes: '', ingredients: [{ name: 'chicken thighs' }, { name: 'curry powder' }], method: 'Brown the chicken, add spices.', servings: 2, updated: Date.now() },
  { id: 3, name: 'Chorizo Pasta', category: 'Dinner', notes: '', ingredients: [{ name: 'chorizo' }, { name: 'penne' }], method: 'Fry the chorizo until the oil runs.', servings: 2, updated: Date.now() },
  null,
];

module.exports = {
  name: '26-global-search',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // ── Setup: seed all five stores, invalidate the listData cache (loadListData
    // caches by list type in-memory; a plain storeSet after boot would otherwise
    // be invisible until the cache is cleared) ────────────────────────────────
    await page.evaluate(
      '(function(){' +
      'storeSet("fl4_grocery", { items: ' + JSON.stringify(GROCERY) + ', hist: [] });' +
      'storeSet("fl4_todo", { items: ' + JSON.stringify(TODO) + ', hist: [] });' +
      'storeSet("fl4_personal", { items: ' + JSON.stringify(PERSONAL) + ', hist: [] });' +
      'storeSet("fl4_travel", { items: ' + JSON.stringify(TRAVEL) + ', hist: [] });' +
      'storeSet("fl4_notes_global", ' + JSON.stringify(NOTES_PERSONAL) + ');' +
      'storeSet("fl4_notes_global_work", ' + JSON.stringify(NOTES_WORK) + ');' +
      'storeSet("fl4_recipebook", ' + JSON.stringify(RECIPES) + ');' +
      'listData.grocery = null; listData.todo = null; listData.personal = null; listData.travel = null;' +
      'switchSection("home");' +
      'return true; })()'
    );

    // ── listSearchText(): top-level, !item-guarded, mirrors recipeSearchText ──
    const lst = await page.evaluate(
      '(function(){ return {' +
      'nullGuard: listSearchText(null),' +
      'basic: listSearchText({ name:"Foo", notes:"Bar" }),' +
      'noNotes: listSearchText({ name:"Foo" })' +
      '}; })()'
    );
    check('listSearchText(null) returns "" rather than throwing', lst.nullGuard === '', 'got: ' + JSON.stringify(lst.nullGuard));
    check('listSearchText concatenates name+notes, lowercased', lst.basic === 'foo bar', 'got: ' + JSON.stringify(lst.basic));
    check('listSearchText handles a missing notes field', lst.noNotes === 'foo ', 'got: ' + JSON.stringify(lst.noNotes));

    // ── 2-character minimum (design doc §2②) ──────────────────────────────────
    const short = await page.evaluate('(function(){ return globalSearch("m"); })()');
    check('a 1-character query returns no groups', short.groups.length === 0, 'got: ' + JSON.stringify(short));

    // ── Multi-group substring matching, the 5-cap, "+N more", and empty-group
    // omission — all in one query ("milk" hits grocery x7, personal x1,
    // travel x1, notes x2 across both contexts; todo has zero and must be
    // omitted entirely, not shown as an empty group) ─────────────────────────
    const milk = await page.evaluate('(function(){ return globalSearch("milk"); })()');
    check('global fuzzy fallback did not trigger (substring found real matches)', milk.fuzzy === false, 'got: ' + JSON.stringify(milk.fuzzy));
    const byKey = {};
    milk.groups.forEach((g) => { byKey[g.key] = g; });
    check('todo group is omitted entirely (zero matches)', !byKey.todo, 'groups present: ' + milk.groups.map((g) => g.key).join(','));
    check('grocery group found all 7 "milk" items (uncapped in the data layer)', byKey.grocery && byKey.grocery.items.length === 7, 'got: ' + JSON.stringify(byKey.grocery));
    check(
      'the subsequence-only trap ("a mild kick") is excluded from the substring pass',
      byKey.grocery && !byKey.grocery.items.some((it) => it.name === 'Spice mix'),
      'Spice mix leaked into a substring-primary result'
    );
    check('personal group found the 1 "milk" match', byKey.personal && byKey.personal.items.length === 1 && byKey.personal.items[0].name === 'Milk allergy test', 'got: ' + JSON.stringify(byKey.personal));
    check('travel group found the 1 "milk" match', byKey.travel && byKey.travel.items.length === 1 && byKey.travel.items[0].name === 'Powdered milk sachets', 'got: ' + JSON.stringify(byKey.travel));
    check(
      'notes group merges personal+work contexts and survives the null entry without throwing',
      byKey.notes && byKey.notes.items.length === 2,
      'got: ' + JSON.stringify(byKey.notes)
    );
    check(
      'a work-context note result carries its context tag for the hand-off',
      byKey.notes && byKey.notes.items.some((it) => it.name === 'Client milk run' && it._nctx === 'work'),
      'got: ' + JSON.stringify(byKey.notes && byKey.notes.items)
    );
    check(
      'v387: recipes group finds "Rice Pudding" via an INGREDIENT match, not name/notes (proves the wider recipeSearchText haystack is used, not listSearchText)',
      byKey.recipes && byKey.recipes.items.length === 1 && byKey.recipes.items[0].name === 'Rice Pudding',
      'got: ' + JSON.stringify(byKey.recipes)
    );
    check(
      'the null entry in fl4_recipebook does not crash global search (getRecipeBook() guards it, v385)',
      byKey.recipes !== undefined,
      'recipes group missing entirely — likely threw on the null entry'
    );

    // ── v387: a query that ONLY matches via an ingredient with zero name/notes
    // overlap ("penne" doesn't appear in "Chorizo Pasta" or its empty notes) —
    // this is the exact widened-haystack case the design doc's Recipes phase-2
    // note calls out ("which recipe used the chorizo?" class of query) ───────
    const penne = await page.evaluate('(function(){ return globalSearch("penne"); })()');
    const penneRecipes = penne.groups.find((g) => g.key === 'recipes');
    check(
      '"penne" (an ingredient, not in name/notes) finds Chorizo Pasta via global search',
      penneRecipes && penneRecipes.items.length === 1 && penneRecipes.items[0].name === 'Chorizo Pasta',
      'got: ' + JSON.stringify(penne.groups)
    );
    const penneUi = await page.evaluate(
      '(function(){ _gSearchQuery = "penne"; renderGlobalSearchResults();' +
      'return document.getElementById("homeSearchResults").innerText; })()'
    );
    check('the rendered results show a Recipes group for an ingredient-only match', penneUi.indexOf('Recipes') !== -1 && penneUi.indexOf('Chorizo Pasta') !== -1, 'got: ' + JSON.stringify(penneUi));

    // ── Fuzzy fallback is a GLOBAL decision, not per-group (design doc §2②) ──
    // "curry" has real substring hits in grocery ("Curry powder") AND, since
    // v387, recipes ("Chicken Curry" / its "curry powder" ingredient).
    // Personal's "Rush essay" (notes: "currently overdue...") would ALSO
    // match via fuzzyMatch in isolation (subsequence c-u-r-r-y inside
    // "currently"), but must NOT appear — fuzzy never runs at all while any
    // group has a hit.
    const curry = await page.evaluate('(function(){ return globalSearch("curry"); })()');
    check('fuzzy did not trigger for "curry" (grocery + recipes had substring hits)', curry.fuzzy === false, 'got: ' + JSON.stringify(curry.fuzzy));
    check(
      'only the grocery and recipes groups are present for "curry" (no fuzzy leakage into other groups)',
      curry.groups.length === 2 && curry.groups.every((g) => g.key === 'grocery' || g.key === 'recipes'),
      'got: ' + JSON.stringify(curry.groups.map((g) => g.key))
    );
    check(
      'the personal fuzzy-eligible near-miss ("Rush essay") is suppressed, not silently shown',
      !curry.groups.some((g) => g.items.some((it) => it.name === 'Rush essay')),
      'Rush essay leaked in despite grocery having a substring hit'
    );

    // "crry" (typo, drops the "u") has ZERO substring hits anywhere in the
    // fixture, so the fuzzy pass runs — and must run over EVERY group, not
    // just the one that happened to trigger it.
    const typo = await page.evaluate('(function(){ return globalSearch("crry"); })()');
    check('a query with no substring hits anywhere triggers the fuzzy fallback', typo.fuzzy === true, 'got: ' + JSON.stringify(typo.fuzzy));
    const typoNames = [].concat(...typo.groups.map((g) => g.items.map((it) => it.name)));
    check('fuzzy fallback finds "Curry powder" (typo of its own name)', typoNames.indexOf('Curry powder') !== -1, 'got: ' + JSON.stringify(typoNames));
    check('fuzzy fallback runs across groups, not just the first one that matched — finds "Rush essay" too', typoNames.indexOf('Rush essay') !== -1, 'got: ' + JSON.stringify(typoNames));

    // ── No matches anywhere ───────────────────────────────────────────────────
    const none = await page.evaluate('(function(){ return globalSearch("zzzzqqqxx"); })()');
    check('a query with no matches at all (substring or fuzzy) returns no groups', none.groups.length === 0, 'got: ' + JSON.stringify(none));

    // ── Rendered UI: empty state names the query (design doc §3.1 — never a
    // bare, unexplained empty state, the exact bug class that cost three
    // recipe-search versions) ─────────────────────────────────────────────────
    const emptyUi = await page.evaluate(
      '(function(){ _gSearchQuery = "zzzzqqqxx"; renderGlobalSearchResults();' +
      'return document.getElementById("homeSearchResults").innerText; })()'
    );
    check('empty search state names the failed query', emptyUi.indexOf('zzzzqqqxx') !== -1, 'got: ' + JSON.stringify(emptyUi));

    // ── Rendered UI: grouping, cap, "+N more", fuzzy label ────────────────────
    const milkUi = await page.evaluate(
      '(function(){ _gSearchQuery = "milk"; renderGlobalSearchResults();' +
      'return document.getElementById("homeSearchResults").innerText; })()'
    );
    check('rendered results show the Grocery group', milkUi.indexOf('Grocery') !== -1, 'got: ' + JSON.stringify(milkUi));
    check('rendered results show the Notes group', milkUi.indexOf('Notes') !== -1, 'got: ' + JSON.stringify(milkUi));
    check('rendered results do NOT show an empty General group', milkUi.indexOf('General') === -1, 'got: ' + JSON.stringify(milkUi));
    check('grocery\'s 7 matches are capped with a "+2 more" link', milkUi.indexOf('+2 more') !== -1, 'got: ' + JSON.stringify(milkUi));
    check('no fuzzy-fallback label shown for an exact-match search', milkUi.indexOf('showing similar') === -1, 'got: ' + JSON.stringify(milkUi));

    const typoUi = await page.evaluate(
      '(function(){ _gSearchQuery = "crry"; renderGlobalSearchResults();' +
      'return document.getElementById("homeSearchResults").innerText; })()'
    );
    check('the fuzzy fallback labels itself on screen', typoUi.indexOf('showing similar') !== -1, 'got: ' + JSON.stringify(typoUi));

    // ── Hand-off: tapping "+N more" on a list group jumps to that list, WITH
    // the query pre-filled and applied — and resets the list's own filters
    // rather than silently AND-ing with whatever was already set (the exact
    // v381 bug class the design doc calls out by name in §3.2) ───────────────
    const handoff = await page.evaluate(
      '(function(){' +
      '_travelFilter = ["essentials"]; _todayFilter = true;' + // stale filters that must NOT survive the hand-off
      '_gSearchQuery = "milk"; renderGlobalSearchResults();' +
      'var moreBtn = document.querySelector(".gs-more[data-key=\\"grocery\\"]");' +
      'if (!moreBtn) return { ok:false, reason:"no +more button found" };' +
      'moreBtn.click();' +
      'return {' +
      'ok:true,' +
      'currentList: currentList,' +
      'query: _listSearchQuery,' +
      'listVisible: document.getElementById("lifeSection").style.display,' +
      'searchRowVisible: document.getElementById("searchRow").style.display,' +
      'searchInputValue: document.getElementById("listSearchInput").value,' +
      'travelFilterReset: _travelFilter.length === 0,' +
      'todayFilterReset: _todayFilter === false' +
      '}; })()'
    );
    check('"+N more" hand-off found and clicked the grocery link', handoff.ok, JSON.stringify(handoff));
    check('hand-off lands on the grocery list', handoff.currentList === 'grocery', 'got: ' + JSON.stringify(handoff.currentList));
    check('hand-off pre-fills the list\'s own search with the query', handoff.query === 'milk', 'got: ' + JSON.stringify(handoff.query));
    check('the Lists section is now visible', handoff.listVisible === 'block', 'got: ' + JSON.stringify(handoff.listVisible));
    check('the list\'s search row is shown and pre-filled', handoff.searchRowVisible === 'block' && handoff.searchInputValue === 'milk', 'got: ' + JSON.stringify(handoff));
    check('a stale travel-tag filter does not survive the hand-off', handoff.travelFilterReset, 'got: ' + JSON.stringify(handoff.travelFilterReset));
    check('a stale "today" filter does not survive the hand-off', handoff.todayFilterReset, 'got: ' + JSON.stringify(handoff.todayFilterReset));

    // ── Hand-off: tapping an individual Notes result lands on the MATCHED
    // note's context (personal vs work), not whichever was last viewed —
    // the homeSearchResults DOM from the "milk" render above is still intact
    // (switching section doesn't clear it, only returning to Home does) ──────
    const notesHandoff = await page.evaluate(
      '(function(){' +
      'currentNotesView = "personal";' + // deliberately wrong, to prove the tap corrects it
      'var workRow = document.querySelector(\'.gs-row[data-key="notes"][data-ctx="work"]\');' +
      'if (!workRow) return { ok:false, reason:"no work-context note row found" };' +
      'workRow.click();' +
      'return { ok:true, ctx: currentNotesView, notesVisible: document.getElementById("notesSection").style.display };' +
      '})()'
    );
    check('a work-context note result was found and clicked', notesHandoff.ok, JSON.stringify(notesHandoff));
    check('tapping it switches to the work notes context', notesHandoff.ctx === 'work', 'got: ' + JSON.stringify(notesHandoff.ctx));
    check('the Notes sub-section is visible after the hand-off', notesHandoff.notesVisible === 'block', 'got: ' + JSON.stringify(notesHandoff.notesVisible));

    // ── v387: tapping a Recipes result row hands off to the Recipes section
    // via openRecord("recipes", null, {query}) — through the actual click
    // handler, not a direct call, so this also exercises the row-click
    // dispatch itself. Seed a stale category filter first, exactly the
    // v381/v386 bug class: the hand-off must reset it, not silently AND. ────
    const recipesHandoff = await page.evaluate(
      '(function(){' +
      '_recipeFilter = "Baking";' + // stale filter that must NOT survive the hand-off
      '_gSearchQuery = "milk"; renderGlobalSearchResults();' +
      'var row = document.querySelector(\'.gs-row[data-key="recipes"]\');' +
      'if (!row) return { ok:false, reason:"no recipes row found" };' +
      'row.click();' +
      'return {' +
      'ok:true,' +
      'filter:_recipeFilter,' +
      'query:_recipeSearchQuery,' +
      'recipesVisible: document.getElementById("recipesSection").style.display,' +
      'searchRowVisible: (document.getElementById("rcpSearchRow")||{}).style.display,' +
      'searchInputValue: (document.getElementById("rcpSearchInput")||{}).value,' +
      'text: document.getElementById("recipesContent").innerText' +
      '}; })()'
    );
    check('a Recipes result row was found and clicked', recipesHandoff.ok, JSON.stringify(recipesHandoff));
    check('the hand-off resets a stale category filter to "all"', recipesHandoff.filter === 'all', 'got: ' + JSON.stringify(recipesHandoff.filter));
    check('the hand-off pre-fills the Recipes search with the query', recipesHandoff.query === 'milk', 'got: ' + JSON.stringify(recipesHandoff.query));
    check('the Recipes section is now visible', recipesHandoff.recipesVisible === 'block', 'got: ' + JSON.stringify(recipesHandoff.recipesVisible));
    check('the Recipes search row is shown and pre-filled', recipesHandoff.searchRowVisible === 'block' && recipesHandoff.searchInputValue === 'milk', 'got: ' + JSON.stringify(recipesHandoff));
    check('the Recipes list shows the matched recipe (Rice Pudding), not the stale Baking filter', recipesHandoff.text.indexOf('Rice Pudding') !== -1, 'got: ' + JSON.stringify(recipesHandoff.text.slice(0, 200)));

    // ── v387/v386 interaction: the hand-off's one-shot _recipeSearchPreset
    // flag must not get stuck true — a LATER, ordinary re-arrival at Recipes
    // (not via openRecord) must still get the v386 stale-search reset. ──────
    const laterArrival = await page.evaluate(
      '(function(){ _recipeSearchQuery = "leftover from a manual search";' +
      'var row = document.getElementById("rcpSearchRow"); if (row) row.style.display = "block";' +
      'switchSection("home"); switchSection("recipes");' +
      'return { query:_recipeSearchQuery, rowHidden: !row || row.style.display === "none" }; })()'
    );
    check(
      'the v387 preset flag is single-shot — a later ordinary arrival still gets the v386 stale-search reset',
      laterArrival.query === '' && laterArrival.rowHidden,
      'got: ' + JSON.stringify(laterArrival)
    );

    // openRecord("recipes", null) with no query at all (e.g. a future caller
    // that just wants the list, not a search) must not leave a bare, empty
    // search row open.
    const recipesNoQuery = await page.evaluate(
      '(function(){ openRecord("recipes", null, {});' +
      'return { query:_recipeSearchQuery, rowHidden: (document.getElementById("rcpSearchRow")||{}).style.display === "none" }; })()'
    );
    check('openRecord("recipes", null) with no query leaves the search row hidden', recipesNoQuery.query === '' && recipesNoQuery.rowHidden, 'got: ' + JSON.stringify(recipesNoQuery));

    // ── openRecord(): the other two types it handles (trip, plant), covering
    // the refactor of the Today-card and Family-Log-card hand-rolled deep
    // links this helper replaced (HEARTH-global-search.md §4) ───────────────
    await page.evaluate(
      '(function(){' +
      'storeSet("fl4_trips", [{ id: 555, name: "Lisbon", start: "2026-09-01", end: "2026-09-05", bookings: [] }]);' +
      'storeSet("fl4_plants", [{ id: 777, name: "Spider Plant", latin: "", room: "", emoji: "", waterDays: 7, feedDays: 0, waterLog: [], feedLog: [], updated: Date.now() }]);' +
      'return true; })()'
    );
    const tripHandoff = await page.evaluate(
      '(function(){ openRecord("trip", 555);' +
      'return { view:_tripView, id:_tripOpenId, tripsVisible: document.getElementById("tripsSection").style.display }; })()'
    );
    check('openRecord("trip", id) sets detail view + the matching id', tripHandoff.view === 'detail' && tripHandoff.id === 555, 'got: ' + JSON.stringify(tripHandoff));
    check('openRecord("trip", id) navigates to the Trips section', tripHandoff.tripsVisible === 'block', 'got: ' + JSON.stringify(tripHandoff));

    const tripListHandoff = await page.evaluate(
      '(function(){ openRecord("trip", null); return { view:_tripView, id:_tripOpenId }; })()'
    );
    check('openRecord("trip", null) lands on the trip list, not a stale id', tripListHandoff.view === 'list' && tripListHandoff.id === null, 'got: ' + JSON.stringify(tripListHandoff));

    const plantHandoff = await page.evaluate(
      '(function(){ _plantImporting = true; _plantImportParsed = { name:"half-finished" }; _plantArea = "Kitchen";' +
      'openRecord("plant", 777);' +
      'return { view:_plantView, id:_plantOpenId, importing:_plantImporting, area:_plantArea, plantsVisible: document.getElementById("plantsSection").style.display }; })()'
    );
    check('openRecord("plant", id) sets detail view + the matching id', plantHandoff.view === 'detail' && plantHandoff.id === 777, 'got: ' + JSON.stringify(plantHandoff));
    check('openRecord("plant", ...) discards a half-finished import (design doc §4 table)', plantHandoff.importing === false, 'got: ' + JSON.stringify(plantHandoff.importing));
    check('openRecord("plant", ...) clears a stale area filter', plantHandoff.area === '', 'got: ' + JSON.stringify(plantHandoff.area));
    check('openRecord("plant", ...) navigates to the Plants section', plantHandoff.plantsVisible === 'block', 'got: ' + JSON.stringify(plantHandoff.plantsVisible));

    // ── No search history (design doc §7): returning to Home clears the
    // search box and results, but a background re-render while ALREADY on
    // Home (e.g. a sync event) must not wipe an in-progress search ──────────
    const homeReset = await page.evaluate(
      '(function(){ _gSearchQuery = "should be cleared"; ' +
      'var i = document.getElementById("homeSearchInput"); if (i) i.value = "should be cleared";' +
      'switchSection("home");' +
      'return { query:_gSearchQuery, inputValue: (document.getElementById("homeSearchInput")||{}).value };' +
      '})()'
    );
    check('arriving at Home clears the global search query', homeReset.query === '', 'got: ' + JSON.stringify(homeReset));
    check('arriving at Home clears the search input value', homeReset.inputValue === '', 'got: ' + JSON.stringify(homeReset));

    const staysOpen = await page.evaluate(
      '(function(){ _gSearchQuery = "still typing"; renderHomeScreen();' + // background re-render, not a fresh switchSection("home")
      'return _gSearchQuery; })()'
    );
    check('a background Home re-render (not a fresh arrival) does not clear an in-progress search', staysOpen === 'still typing', 'got: ' + JSON.stringify(staysOpen));

    return { pass, fail };
  },
};
