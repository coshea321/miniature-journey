'use strict';

// The banner's "put the demo data back" reset (v407, fixed v408).
//
// Cathal's report against v407: "resetting doesn't restore all data (coffee
// remained deleted) and the status didn't change (newly done remained done)".
// v407's resetTestData wiped storage and then seeded the LIVE page, but
// `loadListData` returns the in-memory `listData` whenever it is populated,
// and `importBackupData` is additive BY ID — so every seeded item whose id was
// already in memory was filtered out as "already here" and the EDITED copy
// survived, then got written back to storage. Deletions came back (a deleted
// id isn't in memory, so the seed's copy counted as new); in-place edits did
// not. A half-restored reset is arguably worse than no reset, because you
// cannot tell which half you are looking at.
//
// This file pins the asymmetry itself, so nobody "simplifies" resetTestData
// back into seeding the live page. It cannot call resetTestData() directly —
// that is behind _isTestBuild (false here, and case 38 pins that) and ends in
// location.reload() — so it exercises the two ORDERINGS the reset chooses
// between, which is where the whole bug lived.
module.exports = {
  name: '39-test-build-reset',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var savedKeys = ['fl4_grocery','fl4_todo','fl4_travel','fl4_personal','fl4_recipebook','fl4_mealplan',
                       'fl4_trips','fl4_plants','fl4_watchlist','fl4_baby','fl4_workouts','fl4_action_log',
                       'fl4_track_med','fl4_food_log','fl4_saved_meals','fl4_recipes','fl4_travel_tags',
                       'fl4_notes_global','fl4_notes_global_work','fl4_cal_goal','fl4_testseed',
                       'fl4_tomb_grocery','fl4_tomb_hist_grocery','fl4_tomb_recipes'];
      var savedState = {};
      savedKeys.forEach(function(k){ savedState[k] = storeGet(k); });
      var savedListData = listData;

      // What a real page load does: wipe lands before anything reads storage,
      // so every parse-time cache starts empty. This is phase 1 + phase 2.
      function seedAsFreshLoad() {
        wipeTestStore();
        listData = { grocery:null, todo:null, travel:null, personal:null };
        importBackupData(buildTestSeed());
        storeSet('fl4_testseed', 'test-version');
      }
      // What v407 shipped: wipe, then seed WITHOUT clearing memory first.
      function seedIntoLivePage() {
        wipeTestStore();
        importBackupData(buildTestSeed());
        storeSet('fl4_testseed', 'test-version');
      }
      function groceryState() {
        var g = loadListData('grocery');
        return {
          items: g.items.length,
          done:  g.items.filter(function(i){ return i.done; }).length,
          hist:  g.hist.length,
          milk:  g.items.some(function(i){ return i.name === 'Milk'; }),
          coffee:g.hist.some(function(h){ return h.name === 'Coffee'; })
        };
      }

      // ── Baseline ─────────────────────────────────────────────────────────
      seedAsFreshLoad();
      var base = groceryState();
      ok('the demo grocery list seeds with 8 items, 8 history entries and 1 ticked',
        base.items === 8 && base.hist === 8 && base.done === 1 && base.milk && base.coffee,
        'got: ' + JSON.stringify(base));

      // ── The bug: an in-place edit survives a live-page reseed ────────────
      loadListData('grocery').items.forEach(function(i){ i.done = true; });
      storeSet(LIST_CONFIG.grocery.key, listData.grocery);
      ok('everything is ticked before the reset', groceryState().done === 8, 'got: ' + groceryState().done);

      seedIntoLivePage();
      ok('REGRESSION PIN: seeding the live page does NOT undo a tick',
        groceryState().done === 8,
        'the v407 bug no longer reproduces — if resetTestData was changed to seed in place, ' +
        're-check this pin rather than deleting it. got: ' + JSON.stringify(groceryState()));

      // ── The fix: a fresh-load seed does undo it ──────────────────────────
      seedAsFreshLoad();
      ok('seeding as a fresh load restores the ticked state', groceryState().done === 1,
        'got: ' + JSON.stringify(groceryState()));

      // ── The half-reset that made it confusing: deletions DID come back ───
      // Worth pinning because it is why the bug reads as "doesn't restore ALL
      // data" rather than "reset does nothing".
      var g2 = loadListData('grocery');
      var milk = g2.items.filter(function(i){ return i.name === 'Milk'; })[0];
      addTomb('grocery', milk.id);
      g2.items = g2.items.filter(function(i){ return i.id !== milk.id; });
      deleteHistEntries('grocery', ['coffee']);
      storeSet(LIST_CONFIG.grocery.key, listData.grocery);
      ok('the item and the history entry are gone before the reset',
        !groceryState().milk && !groceryState().coffee, 'got: ' + JSON.stringify(groceryState()));
      seedIntoLivePage();
      ok('a deleted item and history entry DO return even from a live-page reseed',
        groceryState().milk && groceryState().coffee, 'got: ' + JSON.stringify(groceryState()));

      // ── A full round trip through the fixed path ─────────────────────────
      // Edit, delete and add across several sections, then reset as a fresh
      // load: every count must come back to the baseline exactly.
      seedAsFreshLoad();
      var g3 = loadListData('grocery');
      g3.items[0].done = true; g3.items[1].name = 'Renamed by hand';
      g3.items.push({ id:1234567, name:'Added by hand', catId:'other', done:false, updated:Date.now(), added:Date.now() });
      g3.items = g3.items.filter(function(i){ return i.name !== 'Cheddar'; });
      storeSet(LIST_CONFIG.grocery.key, listData.grocery);
      var rb = getRecipeBook(); saveRecipeBook(rb.filter(function(r){ return r.id !== rb[0].id; }));
      saveWatchlist(getWatchlist().slice(1));
      storeSet('fl4_plants', getPlants().slice(1));

      seedAsFreshLoad();
      var after = groceryState();
      ok('a full reset restores the grocery list exactly',
        after.items === base.items && after.done === base.done && after.hist === base.hist &&
        after.milk && after.coffee,
        'got: ' + JSON.stringify(after) + ' vs baseline ' + JSON.stringify(base));
      ok('a full reset restores a hand-renamed item',
        !loadListData('grocery').items.some(function(i){ return i.name === 'Renamed by hand'; }),
        'the renamed item is still there');
      ok('a full reset removes an item added by hand',
        !loadListData('grocery').items.some(function(i){ return i.name === 'Added by hand'; }),
        'the hand-added item survived');
      ok('a full reset restores deleted recipes, plants and watchlist entries',
        getRecipeBook().length === 4 && getPlants().length === 2 && getWatchlist().length === 3,
        'got: ' + [getRecipeBook().length, getPlants().length, getWatchlist().length].join('/'));

      // ── The marker is what makes the reload reseed ───────────────────────
      // resetTestData relies on wipeTestStore taking fl4_testseed with
      // everything else; if the marker survived, the reload would find it
      // current and skip the reseed entirely — the reset would do nothing.
      storeSet('fl4_testseed', 'v999 · 01/01/2099');
      wipeTestStore();
      ok('wipeTestStore clears the seed marker (without this the reset is a no-op)',
        storeGet('fl4_testseed') == null, 'got: ' + JSON.stringify(storeGet('fl4_testseed')));

      // ── Cleanup ──────────────────────────────────────────────────────────
      wipeTestStore();
      savedKeys.forEach(function(k){
        if (savedState[k] == null) localStorage.removeItem(k); else storeSet(k, savedState[k]);
      });
      ['fl4_notes_grocery','fl4_notes_travel','fl4_tomb_plants','fl4_tomb_watchlist',
       'fl4_tomb_trips','fl4_tomb_bookings','fl4_food_notes','fl4_secVisible'].forEach(function(k){ localStorage.removeItem(k); });
      listData = savedListData;

      return { pass: pass, fail: fail };
    })()`);
    return result;
  },
};
