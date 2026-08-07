'use strict';

// v400 — recipe ids must be unique.
//
// The old generator was `Date.now() + rowIndex + Math.floor(Math.random()*1000)`.
// Date.now() is constant across an import loop, so N recipes were drawn from a
// span of ~1,100 values: at 118 recipes that collides with 99.9% probability
// (~6.4 colliding records expected). Cathal's real book contained exactly that
// — several recipes sharing an id.
//
// It matters because every reader in the app keys on the id with
// find()/findIndex(), so only the FIRST record with a given id is reachable:
// the twin cannot be opened, favourited, deleted or given prep, and neither
// sync path dedupes, so it propagates.

module.exports = {
  name: '34-recipe-id-uniqueness',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── the generator itself ──
      var taken = {};
      var ids = [];
      for (var i = 0; i < 500; i++) ids.push(nextRecipeId(taken));
      ok('500 ids in a tight loop are all distinct',
        new Set(ids).size === 500, 'distinct: ' + new Set(ids).size);
      ok('ids are monotonically increasing',
        ids.every(function(v, i){ return i === 0 || v > ids[i-1]; }), 'not monotonic');
      ok('ids stay in the millisecond-timestamp range',
        ids[0] > 1e12 && ids[ids.length-1] < 1e13,
        'first=' + ids[0] + ' last=' + ids[ids.length-1]);

      // An id already in the book is never handed out again.
      var used = recipeIdMap([{ id: 5000000000001 }, { id: 5000000000002 }, null, { }]);
      ok('recipeIdMap indexes existing ids and ignores junk entries',
        used[5000000000001] && used[5000000000002] && Object.keys(used).length === 2,
        JSON.stringify(Object.keys(used)));

      // Force a clash: pre-reserve the value the generator is about to return.
      var clash = {};
      var probe = nextRecipeId({});          // what it would give next
      clash[probe] = true;
      clash[probe + 1] = true;
      var dodged = nextRecipeId(clash);
      ok('a taken id is skipped rather than reused',
        dodged !== probe && dodged !== probe + 1, 'probe=' + probe + ' got=' + dodged);
      ok('the id it hands out is reserved, so the next call cannot repeat it',
        nextRecipeId(clash) !== dodged, 'repeated ' + dodged);

      // ── the CSV importer, which is where the real collisions happened ──
      storeSet('fl4_recipebook', []);
      var header = 'title,ingredients,instructions\\n';
      var rows = '';
      for (var j = 0; j < 150; j++) rows += 'Recipe ' + j + ',1 Onion,Cook it.\\n';
      var res = recipesFromCSV(header + rows);
      ok('the importer parsed every row', res.recipes.length === 150, res.recipes.length + ' recipes');
      var impIds = res.recipes.map(function(x){ return x.id; });
      ok('a 150-recipe import produces no duplicate ids',
        new Set(impIds).size === 150,
        'distinct: ' + new Set(impIds).size + ' of ' + impIds.length);

      // A second import must not collide with what is already stored.
      storeSet('fl4_recipebook', res.recipes);
      var res2 = recipesFromCSV(header + 'Another One,1 Leek,Cook.\\nAnd Another,1 Leek,Cook.\\n');
      var allIds = impIds.concat(res2.recipes.map(function(x){ return x.id; }));
      ok('a later import does not reuse an id already in the book',
        new Set(allIds).size === allIds.length,
        'distinct: ' + new Set(allIds).size + ' of ' + allIds.length);

      // ── the editor's new-recipe path ──
      storeSet('fl4_recipebook', []);
      switchSection('recipes');
      var made = [];
      for (var k = 0; k < 5; k++) {
        openRecipeEditor(null);
        document.getElementById('reName').value = 'Editor ' + k;
        document.getElementById('reIng').value = '1 Onion';
        document.getElementById('reSave').click();
      }
      // (An empty book gets the starter recipe put back by seedRecipes(), so
      // the count is 5 plus whatever was seeded — check distinctness, not a
      // fixed total.)
      made = getRecipeBook().map(function(x){ return x.id; });
      ok('five recipes created back to back get distinct ids',
        made.length >= 5 && new Set(made).size === made.length,
        JSON.stringify(made));

      // ── why it matters: a duplicate id makes the twin unreachable ──
      // (Documents the failure mode the fix prevents; not a regression guard
      // on the generator itself.)
      storeSet('fl4_recipebook', [
        { id: 6001, name: 'First copy', servings: 2, updated: 1, method: 'A', ingredients: [] },
        { id: 6001, name: 'Second copy', servings: 2, updated: 9, method: 'B', ingredients: [] }
      ]);
      var found = getRecipeBook().find(function(x){ return x.id === 6001; });
      ok('with a duplicate id, only the first record is reachable by find()',
        found && found.name === 'First copy', found && found.name);
      ok('the second copy is still in the store, just unreachable',
        getRecipeBook().length === 2, getRecipeBook().length + ' records');

      return {pass:pass, fail:fail};
    })()`);
    return r;
  },
};
