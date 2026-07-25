'use strict';

// Bug-review fix-queue batch B (finding 2): four mutation sites used to
// leave `updated`/`updatedAt` untouched, so the change could be reverted
// (list items, remote-wins tie) or never propagate (notes, local-wins tie)
// on the next merge. Each case here drives the real production function or
// DOM control, then confirms both the stamp itself and that it changes the
// outcome of a merge against a stale/absent partner copy.

module.exports = {
  name: '09-mutation-stamps',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── 2a: "Reopen all" now stamps updated ──────────────────────
      currentList = 'grocery';
      listData.grocery = { items: [{id:1, name:'Bananas', catId:'other', done:true, updated:100}], hist: [] };
      renderList();
      document.getElementById('reopenBtn').click();
      document.getElementById('_cfYes').click();
      var reopened = listData.grocery.items.find(function(i){ return i.id === 1; });
      ok('2a: reopen-all stamps updated', reopened && reopened.done === false && reopened.updated > 100,
        'got: ' + JSON.stringify(reopened));

      var staleRemote2a = [{id:1, name:'Bananas', catId:'other', done:true, updated:100}];
      var merged2a = mergeListItems([reopened], staleRemote2a, {});
      var w2a = merged2a.items.find(function(i){ return i.id === 1; });
      ok('2a: reopened item survives a stale-partner merge', w2a && w2a.done === false,
        'got: ' + JSON.stringify(w2a));

      // ── 2b: re-tagging an ACTIVE item stamps updated ─────────────
      listData.grocery = { items: [{id:2, name:'Milk', catId:'other', done:false, updated:100}], hist: [] };
      var recipe = { name:'TestRecipe', ingredients:[{name:'Milk'}] };
      addRecipeToGroceries(recipe, 1, true);
      var retagged = listData.grocery.items.find(function(i){ return i.id === 2; });
      ok('2b: re-tag of an active item stamps updated', retagged && retagged.recipe === 'TestRecipe' && retagged.updated > 100,
        'got: ' + JSON.stringify(retagged));

      var staleRemote2b = [{id:2, name:'Milk', catId:'other', done:false, updated:100}];
      var merged2b = mergeListItems([retagged], staleRemote2b, {});
      var w2b = merged2b.items.find(function(i){ return i.id === 2; });
      ok('2b: re-tag survives a stale-partner merge', w2b && w2b.recipe === 'TestRecipe',
        'got: ' + JSON.stringify(w2b));

      // ── 2c: recipe "clear" restore path stamps updated (both branches) ──
      listData.grocery = { items: [
        {id:10, name:'Flour', catId:'other', done:false, recipe:'Cake', _recipeAdded:true, updated:100},
        {id:11, name:'Eggs',  catId:'other', done:false, recipe:'Cake', _recipeAdded:false,
          _recipePrev:{done:false, catId:'other', recipe:null}, updated:100}
      ], hist: [] };
      renderList();
      var clearBtn = document.querySelector(".recipe-clear-btn[data-recipe='Cake']");
      if (clearBtn) clearBtn.click();
      var keepBtn = document.getElementById('_rcKeep');
      if (keepBtn) keepBtn.click();
      var kept10 = listData.grocery.items.find(function(i){ return i.id === 10; });
      var kept11 = listData.grocery.items.find(function(i){ return i.id === 11; });
      ok('2c: kept added item stamps updated on clear', kept10 && kept10.recipe === null && kept10.updated > 100,
        'got: ' + JSON.stringify(kept10));
      ok('2c: restored pre-existing item stamps updated on clear', kept11 && kept11.recipe === null && kept11.updated > 100,
        'got: ' + JSON.stringify(kept11));

      // ── 2d: note star toggle stamps updatedAt and reaches the partner ──
      currentNotesView = 'personal';
      var starredNote = { id:20, title:'T', body:'B', highlighted:false, updatedAt:100 };
      storeSet(getCurrentNotesKey(), [starredNote]);
      toggleNoteHighlightById(20);
      var afterStar = normaliseNotes(storeGet(getCurrentNotesKey())).find(function(n){ return n.id === 20; });
      ok('2d: star toggle stamps updatedAt', afterStar && afterStar.highlighted === true && afterStar.updatedAt > 100,
        'got: ' + JSON.stringify(afterStar));

      var staleRemote2d = [{id:20, title:'T', body:'B', highlighted:false, updatedAt:100}];
      var merged2d = mergeNotes([afterStar], staleRemote2d, {});
      ok('2d: star reaches the partner copy (push=true, local wins tie)', merged2d.push === true,
        'push=' + merged2d.push);
      var n2d = merged2d.notes.find(function(n){ return n.id === 20; });
      ok('2d: merged copy keeps the star', n2d && n2d.highlighted === true, 'got: ' + JSON.stringify(n2d));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
