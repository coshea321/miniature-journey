'use strict';

// Plants section (v377). Covers the data layer only — the merge contract, the
// due-date arithmetic and the care log — in the same style as 05-merge-trips
// and 06-trip-roundtrip. Cleans up after itself so later cases see an empty
// fl4_plants store.
module.exports = {
  name: '22-plants',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var DAY = 86400000;
      // Local-midnight anchored, matching plantDaysSince's own arithmetic.
      // Lands at ~midday on the target day, so a DST hour shift can't push the
      // timestamp over into a neighbouring date.
      function daysAgo(n){
        var now = new Date();
        var mid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return mid.getTime() - n * DAY + 12 * 3600000;
      }

      // ── plantDaysSince / plantAgoLabel ────────────────────────────────────
      ok('plantDaysSince(0) is null (never logged)', plantDaysSince(0) === null, 'got: ' + plantDaysSince(0));
      ok('plantDaysSince(today) is 0', plantDaysSince(Date.now()) === 0, 'got: ' + plantDaysSince(Date.now()));
      ok('plantDaysSince(3 days ago) is 3', plantDaysSince(daysAgo(3)) === 3, 'got: ' + plantDaysSince(daysAgo(3)));
      ok('plantAgoLabel(0) reads "not logged yet"', plantAgoLabel(0) === 'not logged yet', 'got: ' + plantAgoLabel(0));
      ok('plantAgoLabel(today) reads "today"', plantAgoLabel(Date.now()) === 'today', 'got: ' + plantAgoLabel(Date.now()));
      ok('plantAgoLabel(1 day ago) reads "yesterday"', plantAgoLabel(daysAgo(1)) === 'yesterday', 'got: ' + plantAgoLabel(daysAgo(1)));
      ok('plantAgoLabel(4 days ago) reads "4 days ago"', plantAgoLabel(daysAgo(4)) === '4 days ago', 'got: ' + plantAgoLabel(daysAgo(4)));

      // ── plantDueIn: the "don't nag" rules ─────────────────────────────────
      ok('no interval set → null (never due)',
        plantDueIn({ waterDays:0, waterLog:[Date.now()] }, 'water') === null,
        'got: ' + plantDueIn({ waterDays:0, waterLog:[Date.now()] }, 'water'));
      ok('interval set but never logged → null, not overdue',
        plantDueIn({ waterDays:7, waterLog:[] }, 'water') === null,
        'got: ' + plantDueIn({ waterDays:7, waterLog:[] }, 'water'));
      ok('watered today on a 7-day interval → due in 7',
        plantDueIn({ waterDays:7, waterLog:[Date.now()] }, 'water') === 7,
        'got: ' + plantDueIn({ waterDays:7, waterLog:[Date.now()] }, 'water'));
      ok('watered 7 days ago on a 7-day interval → due today (0)',
        plantDueIn({ waterDays:7, waterLog:[daysAgo(7)] }, 'water') === 0,
        'got: ' + plantDueIn({ waterDays:7, waterLog:[daysAgo(7)] }, 'water'));
      ok('watered 9 days ago on a 7-day interval → 2 days overdue (-2)',
        plantDueIn({ waterDays:7, waterLog:[daysAgo(9)] }, 'water') === -2,
        'got: ' + plantDueIn({ waterDays:7, waterLog:[daysAgo(9)] }, 'water'));
      ok('feed interval is read from feedDays/feedLog, not the water fields',
        plantDueIn({ waterDays:7, waterLog:[Date.now()], feedDays:21, feedLog:[daysAgo(21)] }, 'feed') === 0,
        'got: ' + plantDueIn({ waterDays:7, waterLog:[Date.now()], feedDays:21, feedLog:[daysAgo(21)] }, 'feed'));

      ok('plantOverdue true only at or past the interval',
        plantOverdue({ waterDays:7, waterLog:[daysAgo(8)] }) === true &&
        plantOverdue({ waterDays:7, waterLog:[daysAgo(3)] }) === false &&
        plantOverdue({ waterDays:7, waterLog:[] }) === false,
        'overdue results disagree');

      ok('plantDueLabel wording', plantDueLabel({ waterDays:7, waterLog:[daysAgo(8)] }, 'water') === '1 day overdue' &&
        plantDueLabel({ waterDays:7, waterLog:[daysAgo(9)] }, 'water') === '2 days overdue' &&
        plantDueLabel({ waterDays:7, waterLog:[daysAgo(7)] }, 'water') === 'due today' &&
        plantDueLabel({ waterDays:7, waterLog:[daysAgo(6)] }, 'water') === 'due tomorrow' &&
        plantDueLabel({ waterDays:7, waterLog:[Date.now()] }, 'water') === 'due in 7 days',
        'got: ' + [plantDueLabel({ waterDays:7, waterLog:[daysAgo(8)] }, 'water'),
                   plantDueLabel({ waterDays:7, waterLog:[daysAgo(7)] }, 'water'),
                   plantDueLabel({ waterDays:7, waterLog:[daysAgo(6)] }, 'water')].join(' | '));

      // ── Care log round trip ───────────────────────────────────────────────
      var saved = storeGet('fl4_plants');
      var savedTombs = storeGet('fl4_tomb_plants');
      var p1 = { id: 900001, name:'TestSpider', latin:'Chlorophytum comosum', emoji:'', room:'Test room',
                 photo:'', summary:'s', watering:'w', feeding:'f', light:'l', repotting:'r',
                 propagation:'p', safety:'sa', notes:'n', waterDays:7, feedDays:21,
                 waterLog:[], feedLog:[], updated: 1000 };
      storeSet('fl4_plants', [p1]);

      plantLogCare(900001, 'water');
      var after = getPlants().find(function(x){ return x.id === 900001; });
      ok('logging water pushes a timestamp onto waterLog', after && after.waterLog.length === 1, 'got: ' + JSON.stringify(after && after.waterLog));
      ok('logging water leaves feedLog alone', after && after.feedLog.length === 0, 'got: ' + JSON.stringify(after && after.feedLog));
      ok('logging bumps updated', after && after.updated > 1000, 'got: ' + (after && after.updated));
      ok('a freshly watered plant is not overdue', plantOverdue(after) === false, 'got: ' + plantDueIn(after, 'water'));

      plantLogCare(900001, 'feed');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('feed log is separate', after && after.feedLog.length === 1 && after.waterLog.length === 1,
        'got: w=' + JSON.stringify(after && after.waterLog) + ' f=' + JSON.stringify(after && after.feedLog));

      plantUndoCare(900001, 'water');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('undo removes only the newest water entry', after && after.waterLog.length === 0 && after.feedLog.length === 1,
        'got: w=' + JSON.stringify(after && after.waterLog) + ' f=' + JSON.stringify(after && after.feedLog));
      plantUndoCare(900001, 'water');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('undo on an empty log is a no-op, not a crash', after && after.waterLog.length === 0, 'got: ' + JSON.stringify(after && after.waterLog));

      // Log cap: the array must never grow without bound (it rides the sync payload).
      var capped = getPlants();
      var ci = capped.findIndex(function(x){ return x.id === 900001; });
      capped[ci].waterLog = [];
      storeSet('fl4_plants', capped);
      for (var k = 0; k < PLANT_LOG_CAP + 5; k++) plantLogCare(900001, 'water');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('waterLog is capped at PLANT_LOG_CAP', after && after.waterLog.length === PLANT_LOG_CAP,
        'got: ' + (after && after.waterLog.length) + ' cap ' + PLANT_LOG_CAP);

      // ── mergePlantsData ───────────────────────────────────────────────────
      var local  = [{ id:1, name:'Local newer', watering:'local', updated:200 },
                    { id:2, name:'Only local',  updated:100 }];
      var remote = [{ id:1, name:'Remote older', watering:'remote', updated:100 },
                    { id:3, name:'Only remote',  updated:100 }];
      var m = mergePlantsData(local, remote, {});
      var byId = {}; m.plants.forEach(function(p){ byId[p.id] = p; });
      ok('newest-wins keeps the local copy when local is newer', byId[1] && byId[1].name === 'Local newer', 'got: ' + JSON.stringify(byId[1]));
      ok('a plant only the partner has is taken', !!byId[3], 'got ids: ' + Object.keys(byId).join(','));
      ok('a plant only we have is kept', !!byId[2], 'got ids: ' + Object.keys(byId).join(','));
      ok('push=true when our copy is newer/fuller than what arrived', m.push === true, 'got: ' + m.push);

      var m2 = mergePlantsData(
        [{ id:1, name:'Local older', updated:100 }],
        [{ id:1, name:'Remote newer', updated:200 }], {});
      ok('newest-wins takes the incoming copy when it is newer',
        m2.plants[0].name === 'Remote newer', 'got: ' + JSON.stringify(m2.plants[0]));

      // v296 field-fill: a copy written by an older build must not wipe fields
      // it has never heard of.
      var m3 = mergePlantsData(
        [{ id:1, name:'Local', propagation:'snip a pup', updated:100 }],
        [{ id:1, name:'Remote', updated:200 }], {});
      ok('a winning copy missing a newer field inherits it rather than wiping it',
        m3.plants[0].name === 'Remote' && m3.plants[0].propagation === 'snip a pup',
        'got: ' + JSON.stringify(m3.plants[0]));
      var m4 = mergePlantsData(
        [{ id:1, name:'Local', propagation:'snip a pup', updated:100 }],
        [{ id:1, name:'Remote', propagation:'', updated:200 }], {});
      ok('a field deliberately cleared to "" stays cleared',
        m4.plants[0].propagation === '', 'got: ' + JSON.stringify(m4.plants[0]));

      // Tombstones: a delete must stick, and a re-add after the delete must survive.
      var m5 = mergePlantsData([], [{ id:5, name:'Deleted', updated:100 }], { 5: 200 });
      ok('a tombstone newer than the record drops it', m5.plants.length === 0, 'got: ' + JSON.stringify(m5.plants));
      var m6 = mergePlantsData([], [{ id:5, name:'Re-added', updated:300 }], { 5: 200 });
      ok('a record re-added after the delete survives its old tombstone',
        m6.plants.length === 1 && m6.plants[0].name === 'Re-added', 'got: ' + JSON.stringify(m6.plants));

      // ── delete writes a tombstone ─────────────────────────────────────────
      storeSet('fl4_plants', [{ id:900002, name:'ToDelete', updated: Date.now() }]);
      storeSet('fl4_tomb_plants', {});
      deletePlant(900002);
      ok('deletePlant removes the record', !getPlants().some(function(x){ return x.id === 900002; }),
        'got: ' + JSON.stringify(getPlants().map(function(x){ return x.id; })));
      ok('deletePlant writes a tombstone', getTombs('plants')[900002] != null,
        'got: ' + JSON.stringify(getTombs('plants')));

      // ── export coverage ───────────────────────────────────────────────────
      storeSet('fl4_plants', [p1]);
      var payload = buildExportPayload();
      ok('plants are included in the export payload',
        Array.isArray(payload.plants) && payload.plants.some(function(x){ return x.id === 900001; }),
        'got: ' + JSON.stringify(payload.plants));

      // Cleanup
      if (saved === null || saved === undefined) localStorage.removeItem('fl4_plants'); else storeSet('fl4_plants', saved);
      if (savedTombs === null || savedTombs === undefined) localStorage.removeItem('fl4_tomb_plants'); else storeSet('fl4_tomb_plants', savedTombs);

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
