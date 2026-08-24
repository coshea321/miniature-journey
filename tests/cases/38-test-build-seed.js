'use strict';

// Test-build demo data (v407). Every "Try this version" PR link is served from
// raw.githack.com, one shared origin for every branch and version, so a test
// build wipes and reseeds itself once per version rather than inheriting
// whatever the last PR (or an imported real backup) left behind.
//
// Two things are worth pinning, and neither is reachable by clicking:
//  1. The seed goes in through importBackupData — the SAME merge the real
//     backup restore uses — so a field with the wrong name or shape lands
//     silently as nothing at all. Every section is asserted by count.
//  2. The wipe/reseed must be impossible on the real app. Both entry points
//     are behind _isTestBuild, and this page (file://) is NOT a test build,
//     so the guard can be tested for real: resetTestData() must do nothing.
//
// Data layer only — no rendering. Cleans up after itself so later cases see
// the empty store they expect.
module.exports = {
  name: '38-test-build-seed',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── The guard ────────────────────────────────────────────────────────
      // A file:// page is a PREVIEW, not a test build, so nothing seeded
      // itself on load and resetTestData() must be inert. If this assertion
      // ever fails the guard has been loosened and the real app is one
      // hostname check away from being wiped.
      ok('a file:// page is not a test build', _isTestBuild === false, '_isTestBuild = ' + _isTestBuild);

      // The production allowlist (v418). Pinned by exact contents, because the
      // whole safety property is that it is an EXACT-match list: Cloudflare
      // Pages serves branch/deployment previews at
      // <branch|hash>.miniature-journey-b9p.pages.dev, and a suffix or
      // wildcard check would silently promote every one of them to live
      // Firebase access. If a host is added here on purpose, update this list.
      ok('both production hosts are on the allowlist',
        _prodHosts.length === 2 &&
        _prodHosts.indexOf('coshea321.github.io') !== -1 &&
        _prodHosts.indexOf('miniature-journey-b9p.pages.dev') !== -1,
        '_prodHosts = ' + JSON.stringify(_prodHosts));
      ok('a Pages branch preview host is NOT production',
        _prodHosts.indexOf('some-branch.miniature-journey-b9p.pages.dev') === -1,
        '_prodHosts = ' + JSON.stringify(_prodHosts));
      ok('the auto-seed did not fire outside a test build', _testSeedPending === false,
        '_testSeedPending = ' + _testSeedPending);
      storeSet('fl4_grocery', { items:[{id:1,name:'real data',catId:'other',done:false}], hist:[] });
      resetTestData();   // must return immediately — no wipe, no reload
      var afterReset = storeGet('fl4_grocery');
      ok('resetTestData() is a no-op when not a test build',
        !!afterReset && afterReset.items.length === 1 && afterReset.items[0].name === 'real data',
        'got: ' + JSON.stringify(afterReset));
      ok('the seed marker was not written outside a test build',
        storeGet('fl4_testseed') == null, 'got: ' + JSON.stringify(storeGet('fl4_testseed')));

      // ── The seed itself ──────────────────────────────────────────────────
      var seed = buildTestSeed();
      ok('the seed announces the current export payload version', seed.version === 5, 'got: ' + seed.version);

      // Ids must be unique across the whole household — a repeat silently
      // collapses two entries into one on import (the merge is id-keyed).
      var ids = [], dupe = null;
      function collect(arr){ (arr||[]).forEach(function(x){ if (x && x.id != null) ids.push(x.id); }); }
      ['grocery','todo','travel','personal'].forEach(function(lt){ collect(seed.lists[lt].items); });
      collect(seed.recipebook); collect(seed.plants); collect(seed.watchlist); collect(seed.trips);
      collect(seed.appliances);
      collect(seed.baby.medicine); collect(seed.baby.milestones);
      collect(seed.action_log); collect(seed.track_med); collect(seed.food_log);
      (seed.trips || []).forEach(function(t){ collect(t.bookings); });
      var seenId = {};
      ids.forEach(function(id){ if (seenId[id]) dupe = id; seenId[id] = true; });
      ok('every seeded id is unique', dupe === null, 'duplicate id: ' + dupe);

      // Dates are built relative to today so the demo never looks stale.
      var today = new Date();
      var todayStrLocal = today.getFullYear() + '-' +
        (today.getMonth()+1 < 10 ? '0' : '') + (today.getMonth()+1) + '-' +
        (today.getDate() < 10 ? '0' : '') + today.getDate();
      ok('the meal plan starts today', seed.mealplan[0].day === todayStrLocal,
        'got: ' + seed.mealplan[0].day + ', expected ' + todayStrLocal);
      ok('the demo trip is in the future', seed.trips[0].start > todayStrLocal,
        'got: ' + seed.trips[0].start);

      // ── Through the real import path ─────────────────────────────────────
      var savedKeys = ['fl4_grocery','fl4_todo','fl4_travel','fl4_personal','fl4_recipebook','fl4_mealplan',
                       'fl4_trips','fl4_plants','fl4_watchlist','fl4_appliances','fl4_baby','fl4_workouts','fl4_action_log',
                       'fl4_track_med','fl4_food_log','fl4_saved_meals','fl4_recipes','fl4_travel_tags',
                       'fl4_notes_global','fl4_notes_global_work','fl4_cal_goal'];
      var savedState = {};
      savedKeys.forEach(function(k){ savedState[k] = storeGet(k); localStorage.removeItem(k); });
      var savedListData = listData;
      listData = { grocery:null, todo:null, travel:null, personal:null };

      importBackupData(buildTestSeed());

      ok('grocery items land', loadListData('grocery').items.length === 8,
        'got: ' + loadListData('grocery').items.length);
      ok('grocery history lands (the suggestion chips need it)', loadListData('grocery').hist.length === 8,
        'got: ' + loadListData('grocery').hist.length);
      ok('general, personal and travel lists land',
        loadListData('todo').items.length === 4 && loadListData('personal').items.length === 2 &&
        loadListData('travel').items.length === 5,
        'got: ' + [loadListData('todo').items.length, loadListData('personal').items.length,
                   loadListData('travel').items.length].join('/'));
      ok('recipes land with parsed ingredients', getRecipeBook().length === 4 &&
        getRecipeBook().some(function(r){ return r.name === 'Demo Chicken Traybake' && r.ingredients.length === 7; }),
        'got: ' + getRecipeBook().length + ' recipes');
      ok('every planned meal points at a recipe that exists', (function(){
          var have = {}; getRecipeBook().forEach(function(r){ have[r.id] = true; });
          return getMealPlan().length === 3 && getMealPlan().every(function(m){ return have[m.recipeId]; });
        })(), 'got: ' + JSON.stringify(getMealPlan().map(function(m){ return m.recipeId; })));
      ok('the trip lands with all five bookings', getTrips().length === 1 && getTrips()[0].bookings.length === 5,
        'got: ' + JSON.stringify(getTrips().map(function(t){ return (t.bookings||[]).length; })));
      ok('the flight booking carries boarding, gate and seats',
        (function(){
          var f = getTrips()[0].bookings.filter(function(b){ return b.type === 'flight'; })[0];
          return !!f && f.boarding === '06:10' && f.gate === '12' && f.seats === '14A, 14B';
        })(), 'got: ' + JSON.stringify(getTrips()[0].bookings[1]));
      ok('baby data lands (growth, doses, milestones)',
        getBD().growth.length === 3 && getBD().medicine.length === 2 && getBD().milestones.length === 3,
        'got: ' + [getBD().growth.length, getBD().medicine.length, getBD().milestones.length].join('/'));
      ok('plants land with their care sections and logs',
        getPlants().length === 2 && !!getPlants()[0].watering && getPlants()[0].waterLog.length === 2,
        'got: ' + getPlants().length + ' plants');
      // v416: the second plant carries enough care history to push the detail
      // view past PLANT_HISTORY_PREVIEW, which is the only way the "Show all"
      // toggle is reviewable on a test link (tapping Log stamps today, and every
      // tap collapses into that one day). Trim this and the toggle goes unseen.
      ok('the second demo plant has care history deep enough to show the toggle',
        plantCareEvents(getPlants()[1]).length > PLANT_HISTORY_PREVIEW,
        'got: ' + plantCareEvents(getPlants()[1]).length + ' care days');
      ok('one demo care day reads as watered AND fed',
        plantCareEvents(getPlants()[1]).some(function(e){ return e.water && e.feed; }),
        'no combined water+feed day in the demo plant');
      // v432: one plant with a photo link and one without, so both states of the
      // detail view's outbound row are reviewable from a single test link.
      ok('one demo plant carries a photo link and one does not',
        !!plantPhotoLinkUrl(getPlants()[0]) && !plantPhotoLinkUrl(getPlants()[1]),
        'got: ' + JSON.stringify(getPlants().map(plantPhotoLinkUrl)));
      ok('the watchlist lands', getWatchlist().length === 3, 'got: ' + getWatchlist().length);
      // v424 + v428: five inventory records, and deliberately not five
      // interchangeable ones — two named areas plus one untagged is what makes the
      // area chip row appear on a test link, one in-warranty plus one expired is the
      // only way both states of the warranty line get reviewed, and four valued out
      // of five is what makes the totals card show a real "1 not valued yet" rather
      // than a suspiciously tidy sum. Keep that shape if you edit them.
      ok('inventory records land', getAppliances().length === 5, 'got: ' + getAppliances().length);
      ok('the demo records cover two areas plus one untagged',
        applianceAreas(getAppliances()).length === 2 &&
        appliancesInArea(getAppliances(), PLANT_AREA_NONE).length === 1,
        'areas: ' + JSON.stringify(applianceAreas(getAppliances())));
      ok('one demo record is in warranty and one is out of it',
        getAppliances().some(function(a){ return applianceWarranty(a).state === 'in'; }) &&
        getAppliances().some(function(a){ return applianceWarranty(a).state === 'out'; }),
        'got: ' + getAppliances().map(function(a){ return applianceWarranty(a).state; }).join(','));
      // v428: the demo has to exercise the insurance side too — a total, an
      // unvalued record, and at least one thing that is not an appliance.
      var _seedSum = applianceValueSummary(getAppliances());
      ok('four of the five demo records are valued, one deliberately is not',
        _seedSum.valued === 4 && _seedSum.missing === 1 && _seedSum.total === 2950,
        'got: ' + JSON.stringify(_seedSum));
      ok('the demo covers non-appliances, which is the point of the widening',
        getAppliances().some(function(a){ return /Sofa/.test(a.name || ''); }) &&
        getAppliances().some(function(a){ return /Bike/.test(a.name || ''); }),
        'got: ' + getAppliances().map(function(a){ return a.name; }).join(', '));
      ok('a demo record carries a receipt note and a photos link',
        getAppliances().some(function(a){ return !!a.receipt; }) &&
        getAppliances().some(function(a){ return !!appliancePhotosUrl(a); }),
        'got: ' + JSON.stringify(getAppliances().map(function(a){ return [a.receipt, a.photos]; })));
      ok('workouts, bodyweight and blood pressure land',
        getWD().workouts.length === 2 && getWD().bodyweight.length === 3 && getWD().bp.length === 2,
        'got: ' + [getWD().workouts.length, getWD().bodyweight.length, (getWD().bp||[]).length].join('/'));
      ok('the family log and health trackers land',
        getActionLog().length === 2 && getTrackMed().length === 2 && getFoodLog().length === 3,
        'got: ' + [getActionLog().length, getTrackMed().length, getFoodLog().length].join('/'));
      ok('notes land on both the list tabs and the global tabs',
        getNotes('grocery').length === 1 && (storeGet('fl4_notes_global')||[]).length === 2 &&
        (storeGet('fl4_notes_global_work')||[]).length === 1,
        'got: ' + [getNotes('grocery').length, (storeGet('fl4_notes_global')||[]).length,
                   (storeGet('fl4_notes_global_work')||[]).length].join('/'));
      ok('the saved grocery-recipe chip lands in its own {name, lines} shape',
        (function(){
          var r = (storeGet('fl4_recipes')||[])[0];
          return !!r && r.name === 'Demo Sunday Roast' && Array.isArray(r.lines) && r.lines.length === 4;
        })(), 'got: ' + JSON.stringify(storeGet('fl4_recipes')));
      ok('the calorie goal lands', storeGet('fl4_cal_goal') === 2200, 'got: ' + storeGet('fl4_cal_goal'));

      // Seeding twice must not double anything up — importBackupData is
      // additive by id, and the reset path relies on that being true.
      importBackupData(buildTestSeed());
      ok('re-importing the same seed adds nothing', getRecipeBook().length === 4 && getTrips().length === 1 &&
        loadListData('grocery').items.length === 8,
        'got: ' + [getRecipeBook().length, getTrips().length, loadListData('grocery').items.length].join('/'));

      // ── Cleanup ──────────────────────────────────────────────────────────
      savedKeys.forEach(function(k){
        if (savedState[k] == null) localStorage.removeItem(k); else storeSet(k, savedState[k]);
      });
      ['fl4_notes_grocery','fl4_notes_travel','fl4_tomb_recipes','fl4_tomb_plants','fl4_tomb_watchlist','fl4_tomb_appliances',
       'fl4_tomb_trips','fl4_tomb_bookings','fl4_food_notes'].forEach(function(k){ localStorage.removeItem(k); });
      listData = savedListData;

      return { pass: pass, fail: fail };
    })()`);
    return result;
  },
};
