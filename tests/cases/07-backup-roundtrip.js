'use strict';

module.exports = {
  name: '07-backup-roundtrip',
  async run(page) {
    const pass = [];
    const fail = [];
    function ok(name, cond, detail) {
      if (cond) pass.push(name);
      else fail.push({ name, detail: detail || 'assertion failed' });
    }

    // Step 1: seed known data through real app functions, then snapshot the
    // export payload. Done in-page so it uses the real code paths.
    const payload = await page.evaluate(`(function(){
      addItemToCurrent('BackupTestApples', null);

      var recipes = storeGet('fl4_recipes') || [];
      recipes.push({name:'BackupTestRecipe', ingredients:[]});
      storeSet('fl4_recipes', recipes);

      var trips = getTrips();
      trips.unshift({id:999001, name:'BackupTestTrip', updated:Date.now(), bookings:[]});
      saveTripsStore(trips);

      var bd = getBD();
      bd.growth.push({date:'2026-01-01', weight:9});
      bd.medicine.push({id:999002, name:'BackupTestMed', dose:'5ml', ts:Date.now(), updated:Date.now()});
      saveBD(bd);

      var notes = getNotes('grocery');
      notes.unshift({id:999003, text:'BackupTestNote', updatedAt:Date.now()});
      saveNotes(notes, 'grocery');

      return buildExportPayload();
    })()`);

    if (!payload || !payload.lists) {
      fail.push({ name: 'seed + export payload', detail: 'buildExportPayload() returned nothing usable' });
      return { pass, fail };
    }
    pass.push('seed + export payload captured');

    // Step 2: wipe local state (localStorage.clear() + reload via CDP, same
    // reliable path as boot — see harness.js for why not location.reload()).
    await page.reset(page.appUrl);

    // Step 3: on the now-empty device, write a v323 hist tombstone for the
    // grocery hist entry the payload carries, THEN import the payload. The
    // local tombstone must suppress that hist entry even though the backup
    // wants to bring it back — items still resurrect, hist does not (v323).
    const payloadJson = JSON.stringify(payload);
    const importResult = await page.evaluate(`(function(){
      var payload = ${payloadJson};
      var tombKey = histTombKey('grocery');
      var tombs = getTombs(tombKey);
      tombs['backuptestapples'] = Date.now();
      storeSet('fl4_tomb_' + tombKey, tombs);

      importBackupData(payload);

      loadListData('grocery');
      var hist = listData.grocery.hist;
      var items = listData.grocery.items;
      var recipes = storeGet('fl4_recipes') || [];
      var trips = getTrips();
      var bd = getBD();
      var notes = getNotes('grocery');

      return {
        histHasApples: hist.some(function(h){ return h.name === 'BackupTestApples'; }),
        itemHasApples: items.some(function(i){ return i.name === 'BackupTestApples'; }),
        hasRecipe: recipes.some(function(r){ return r.name === 'BackupTestRecipe'; }),
        hasTrip: trips.some(function(t){ return t.id === 999001; }),
        hasGrowth: (bd.growth||[]).some(function(g){ return g.date === '2026-01-01' && g.weight === 9; }),
        hasMedicine: (bd.medicine||[]).some(function(m){ return m.id === 999002; }),
        hasNote: notes.some(function(n){ return n.id === 999003; })
      };
    })()`);

    ok('imported item resurrects (items always resurrect)', importResult.itemHasApples, JSON.stringify(importResult));
    ok('local hist tombstone suppresses that hist entry after import', !importResult.histHasApples, JSON.stringify(importResult));
    ok('recipe imported', importResult.hasRecipe, JSON.stringify(importResult));
    ok('trip imported', importResult.hasTrip, JSON.stringify(importResult));
    ok('baby growth imported', importResult.hasGrowth, JSON.stringify(importResult));
    ok('baby medicine imported', importResult.hasMedicine, JSON.stringify(importResult));
    ok('note imported', importResult.hasNote, JSON.stringify(importResult));

    return { pass, fail };
  },
};
