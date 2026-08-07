'use strict';

// v401 — finding and repairing the duplicate recipes v400's id-collision bug
// created. Two group kinds, deliberately distinct:
//   "id"   — records sharing an id (the importer bug). Only the first was ever
//            reachable by find()/findIndex().
//   "name" — same name, different ids. Two real records; both work.
//
// The load-bearing safety property is the tombstone rule: a dropped record is
// tombstoned so the other phone can't resurrect it — EXCEPT in an id group,
// where the keeper shares the id with the copies being dropped, so writing a
// tombstone for that id would delete the keeper on the next sync.

module.exports = {
  name: '35-duplicate-recipes',
  async run(page) {
    const find = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function R(o){
        return Object.assign({ servings: 2, updated: 1, method: 'Cook.', ingredients: parseIngredients('1 Onion') }, o);
      }

      // A clean book has nothing to report.
      ok('a clean book yields no groups',
        findDuplicateRecipes([R({id:1,name:'A'}), R({id:2,name:'B'})]).length === 0, 'false positive');
      ok('junk entries do not crash the finder',
        findDuplicateRecipes([null, R({id:1,name:'A'}), {}, undefined]).length === 0, 'threw or grouped junk');

      // Same id = the importer bug.
      var idDupes = findDuplicateRecipes([
        R({id:100,name:'Lentil Bolognese'}), R({id:100,name:'Lentil Bolognese'}), R({id:101,name:'Other'})
      ]);
      ok('records sharing an id are grouped', idDupes.length === 1 && idDupes[0].recipes.length === 2, JSON.stringify(idDupes.length));
      ok('an id group is labelled as such', idDupes[0].kind === 'id', idDupes[0].kind);

      // Three copies on one id — Cathal's actual Lentil Bolognese case.
      var triple = findDuplicateRecipes([
        R({id:200,name:'Lentil Bolognese'}), R({id:200,name:'Lentil Bolognese'}), R({id:200,name:'Lentil Bolognese'})
      ]);
      ok('three records on one id form a single group of three',
        triple.length === 1 && triple[0].recipes.length === 3, JSON.stringify(triple.map(function(g){return g.recipes.length;})));

      // Same name, different ids = two real records.
      var nameDupes = findDuplicateRecipes([R({id:300,name:'Iced Coffee'}), R({id:301,name:'Iced Coffee'})]);
      ok('same name with different ids is grouped', nameDupes.length === 1, JSON.stringify(nameDupes.length));
      ok('a name group is labelled as such', nameDupes[0].kind === 'name', nameDupes[0].kind);
      ok('name matching ignores case and surrounding space',
        findDuplicateRecipes([R({id:1,name:'Pesto'}), R({id:2,name:'  pesto '})]).length === 1, 'case/space not folded');

      // A record must belong to exactly one group, or resolving one group
      // would silently change another.
      var mixed = findDuplicateRecipes([
        R({id:400,name:'Chili'}), R({id:400,name:'Chili'}), R({id:401,name:'Chili'})
      ]);
      ok('a record in an id group is not also offered as a name duplicate',
        mixed.length === 1 && mixed[0].kind === 'id' && mixed[0].recipes.length === 2,
        JSON.stringify(mixed.map(function(g){ return g.kind + ':' + g.recipes.length; })));

      ok('id groups are listed before name groups',
        findDuplicateRecipes([
          R({id:500,name:'Zed'}), R({id:501,name:'Zed'}),
          R({id:600,name:'Aaa'}), R({id:600,name:'Aaa'})
        ]).map(function(g){ return g.kind; }).join(',') === 'id,name',
        'order wrong');

      ok('a nameless record is not grouped by name',
        findDuplicateRecipes([R({id:1,name:''}), R({id:2,name:'   '})]).length === 0, 'grouped blanks');

      // ── the keeper suggestion ──
      ok('a fuller record scores higher than a bare one',
        recipeRichness(R({id:1,name:'A',prep:'Chop the onion',notes:'note',url:'https://x.y',fav:true})) >
        recipeRichness(R({id:2,name:'A'})), 'richness ordering wrong');
      ok('richness handles a missing record',
        recipeRichness(null) === -1, recipeRichness(null));

      return {pass:pass, fail:fail};
    })()`);

    const repair = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function R(o){
        return Object.assign({ servings: 2, updated: 1, method: 'Cook.', ingredients: parseIngredients('1 Onion') }, o);
      }

      // The id-collision case, with one copy clearly worked on.
      storeSet('fl4_tomb_recipes', {});
      storeSet('fl4_recipebook', [
        R({ id: 700, name: 'Lentil Bolognese' }),
        R({ id: 700, name: 'Lentil Bolognese', prep: 'Soak the lentils', notes: 'good one', fav: true,
            ingredients: parseIngredients(['1 Onion (finely chopped)','200 g Red lentils','1 tin Tomatoes'].join('\\n')) }),
        R({ id: 701, name: 'Something Else' })
      ]);
      switchSection('recipes');

      // The banner offers the repair.
      _recipeView = 'list'; _recipeFilter = 'all'; renderRecipes();
      var banner = document.getElementById('rcpDupBtn');
      ok('the recipe list offers a duplicates banner when there are duplicates', !!banner, 'no #rcpDupBtn');
      ok('the banner counts the extra copies, not the groups',
        /1 duplicate recipe/.test(document.getElementById('recipesContent').textContent),
        document.getElementById('recipesContent').textContent.slice(0, 120));

      banner.click();
      ok('the banner opens the repair screen', _recipeView === 'duplicates', _recipeView);

      // The fullest copy is suggested.
      var st = _dupState;
      ok('the fullest copy is preselected',
        st.book[st.keep[0]].prep === 'Soak the lentils', JSON.stringify(st.book[st.keep[0]].name));
      ok('the screen says the group shares an id',
        /same id/.test(document.getElementById('recipesContent').textContent), 'label missing');
      ok('the screen explains the import bug for id groups',
        /import bug/.test(document.getElementById('recipesContent').textContent), 'explanation missing');

      // Nothing written yet.
      ok('opening the screen writes nothing', getRecipeBook().length === 3, getRecipeBook().length + ' records');

      applyDupRepair();
      var after = getRecipeBook();
      ok('the duplicate is removed', after.length === 2, after.length + ' records');
      ok('the copy that was kept is the fuller one',
        after.some(function(r){ return r.id === 700 && r.prep === 'Soak the lentils'; }),
        JSON.stringify(after.map(function(r){ return r.id + ':' + (r.prep||''); })));
      ok('the unrelated recipe is untouched',
        after.some(function(r){ return r.id === 701; }), 'lost an unrelated recipe');

      // THE safety property: an id group must NOT tombstone its own id, or the
      // keeper would be deleted on the next sync.
      ok('an id group does not tombstone the id it keeps',
        !getTombs('recipes')[700], JSON.stringify(getTombs('recipes')));
      ok('the repair screen closes back to the list',
        _recipeView === 'list' && _dupState === null, _recipeView);

      // The banner disappears once the book is clean.
      renderRecipes();
      ok('the banner is gone once there are no duplicates',
        !document.getElementById('rcpDupBtn'), 'banner still showing');

      return {pass:pass, fail:fail};
    })()`);

    const tombs = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function R(o){
        return Object.assign({ servings: 2, updated: 1, method: 'Cook.', ingredients: parseIngredients('1 Onion') }, o);
      }

      // A NAME group drops a record whose id leaves the book entirely — that
      // one must be tombstoned, or the other phone brings it back.
      storeSet('fl4_tomb_recipes', {});
      storeSet('fl4_recipebook', [
        R({ id: 800, name: 'Iced Coffee' }),
        R({ id: 801, name: 'Iced Coffee', prep: 'Chill the coffee', notes: 'the good one' })
      ]);
      switchSection('recipes');
      _dupState = null; _recipeView = 'duplicates'; renderRecipes();
      ok('the fuller of two same-name records is preselected',
        _dupState.book[_dupState.keep[0]].id === 801, JSON.stringify(_dupState.keep));
      applyDupRepair();
      ok('the dropped record is removed',
        getRecipeBook().length === 1 && getRecipeBook()[0].id === 801,
        JSON.stringify(getRecipeBook().map(function(r){ return r.id; })));
      ok('the dropped id IS tombstoned so a sync cannot resurrect it',
        !!getTombs('recipes')[800], JSON.stringify(getTombs('recipes')));
      ok('the kept id is not tombstoned',
        !getTombs('recipes')[801], JSON.stringify(getTombs('recipes')));

      // Choosing a different keeper than the suggestion.
      storeSet('fl4_tomb_recipes', {});
      storeSet('fl4_recipebook', [
        R({ id: 900, name: 'Pesto', notes: 'bare' }),
        R({ id: 901, name: 'Pesto', prep: 'Toast the pine nuts', notes: 'rich' })
      ]);
      _dupState = null; _recipeView = 'duplicates'; renderRecipes();
      var rows = document.querySelectorAll('.dup-pick');
      ok('every copy in the group is offered', rows.length === 2, rows.length + ' rows');
      rows[0].click();                                   // pick the bare one instead
      ok('tapping a row changes the keeper', _dupState.keep[0] === 0, JSON.stringify(_dupState.keep));
      applyDupRepair();
      ok('the copy you picked is the one kept, not the suggestion',
        getRecipeBook().length === 1 && getRecipeBook()[0].id === 900,
        JSON.stringify(getRecipeBook().map(function(r){ return r.id; })));

      // Compare view, and escaping.
      storeSet('fl4_tomb_recipes', {});
      storeSet('fl4_recipebook', [
        R({ id: 950, name: '<img src=x onerror=1>' }),
        R({ id: 950, name: '<img src=x onerror=1>' })
      ]);
      _dupState = null; _recipeView = 'duplicates'; renderRecipes();
      ok('a recipe name is escaped on the repair screen',
        document.getElementById('recipesContent').querySelectorAll('img').length === 0,
        'img count: ' + document.getElementById('recipesContent').querySelectorAll('img').length);
      document.querySelector('.dup-toggle').click();
      ok('the compare view opens', _dupState.expanded[0] === true, JSON.stringify(_dupState.expanded));
      ok('the compare view shows ingredient lines',
        /1 Onion/.test(document.getElementById('recipesContent').textContent), 'no ingredients shown');

      // Empty state.
      storeSet('fl4_recipebook', [R({ id: 990, name: 'Only One' })]);
      _dupState = null; _recipeView = 'duplicates'; renderRecipes();
      ok('a clean book shows an empty state rather than an apply button',
        /No duplicates found/.test(document.getElementById('recipesContent').textContent) &&
        !document.getElementById('dupApply'), 'empty state missing');

      return {pass:pass, fail:fail};
    })()`);

    return {
      pass: [].concat(find.pass, repair.pass, tombs.pass),
      fail: [].concat(find.fail, repair.fail, tombs.fail),
    };
  },
};
