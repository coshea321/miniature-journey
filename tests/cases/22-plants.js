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

      // ── Reminder toggles (v430) ────────────────────────────────────────────
      ok('waterOff suppresses the watering reminder even though it is overdue',
        plantDueIn({ waterDays:7, waterOff:true, waterLog:[daysAgo(20)] }, 'water') === null,
        'got: ' + plantDueIn({ waterDays:7, waterOff:true, waterLog:[daysAgo(20)] }, 'water'));
      ok('waterOff leaves the feed reminder alone',
        plantDueIn({ waterDays:7, waterOff:true, feedDays:21, feedLog:[daysAgo(21)] }, 'feed') === 0,
        'got: ' + plantDueIn({ waterDays:7, waterOff:true, feedDays:21, feedLog:[daysAgo(21)] }, 'feed'));
      ok('waterOff leaves plantDueIn(water) untouched when false',
        plantDueIn({ waterDays:7, waterOff:false, waterLog:[daysAgo(9)] }, 'water') === -2,
        'got: ' + plantDueIn({ waterDays:7, waterOff:false, waterLog:[daysAgo(9)] }, 'water'));

      ok('a half-set feed pause range (only one side) never pauses',
        plantFeedPaused({ feedPauseFrom:9, feedPauseTo:0 }, 1) === false &&
        plantFeedPaused({ feedPauseFrom:0, feedPauseTo:4 }, 1) === false,
        'a lone from/to paused when it should not');
      ok('a non-wrapping range pauses inside it and not outside it',
        plantFeedPaused({ feedPauseFrom:3, feedPauseTo:6 }, 4) === true &&
        plantFeedPaused({ feedPauseFrom:3, feedPauseTo:6 }, 3) === true &&
        plantFeedPaused({ feedPauseFrom:3, feedPauseTo:6 }, 6) === true &&
        plantFeedPaused({ feedPauseFrom:3, feedPauseTo:6 }, 7) === false &&
        plantFeedPaused({ feedPauseFrom:3, feedPauseTo:6 }, 2) === false,
        'non-wrapping March-June range disagreed at a boundary');
      ok('a wrapping range (September to April) pauses across the year boundary',
        plantFeedPaused({ feedPauseFrom:9, feedPauseTo:4 }, 9)  === true &&   // Sept, start
        plantFeedPaused({ feedPauseFrom:9, feedPauseTo:4 }, 12) === true &&   // Dec, mid-wrap
        plantFeedPaused({ feedPauseFrom:9, feedPauseTo:4 }, 1)  === true &&   // Jan, after new year
        plantFeedPaused({ feedPauseFrom:9, feedPauseTo:4 }, 4)  === true &&   // April, end
        plantFeedPaused({ feedPauseFrom:9, feedPauseTo:4 }, 5)  === false &&  // May, just after
        plantFeedPaused({ feedPauseFrom:9, feedPauseTo:4 }, 8)  === false,    // August, just before
        'wrapping Sept-April range disagreed at a boundary');
      // plantDueIn calls plantFeedPaused with no month override, i.e. the real
      // current month — build ranges relative to it so this isn't flaky.
      var curM = new Date().getMonth() + 1;
      var farM = ((curM + 5) % 12) + 1;   // 6 months away either direction
      ok('plantDueIn(feed) returns null while the real month sits inside the pause window',
        plantDueIn({ feedDays:21, feedPauseFrom:curM, feedPauseTo:curM, feedLog:[daysAgo(30)] }, 'feed') === null,
        'got: ' + plantDueIn({ feedDays:21, feedPauseFrom:curM, feedPauseTo:curM, feedLog:[daysAgo(30)] }, 'feed'));
      ok('plantDueIn(feed) is unaffected by a pause window that excludes the real month',
        plantDueIn({ feedDays:21, feedPauseFrom:farM, feedPauseTo:farM, feedLog:[daysAgo(21)] }, 'feed') === 0,
        'got: ' + plantDueIn({ feedDays:21, feedPauseFrom:farM, feedPauseTo:farM, feedLog:[daysAgo(21)] }, 'feed'));
      ok('plantDueIn(water) ignores feedPause entirely',
        plantDueIn({ waterDays:7, feedPauseFrom:curM, feedPauseTo:curM, waterLog:[daysAgo(7)] }, 'water') === 0,
        'got: ' + plantDueIn({ waterDays:7, feedPauseFrom:curM, feedPauseTo:curM, waterLog:[daysAgo(7)] }, 'water'));

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
      ok('feeding also logs a watering at the same time', after && after.feedLog.length === 1 && after.waterLog.length === 2 && after.waterLog[0] === after.feedLog[0],
        'got: w=' + JSON.stringify(after && after.waterLog) + ' f=' + JSON.stringify(after && after.feedLog));

      plantLogCare(900001, 'water');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('watering on its own does not also log a feed', after && after.waterLog.length === 3 && after.feedLog.length === 1,
        'got: w=' + JSON.stringify(after && after.waterLog) + ' f=' + JSON.stringify(after && after.feedLog));

      plantUndoCare(900001, 'water');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('undo removes only the newest water entry', after && after.waterLog.length === 2 && after.feedLog.length === 1,
        'got: w=' + JSON.stringify(after && after.waterLog) + ' f=' + JSON.stringify(after && after.feedLog));

      plantUndoCare(900001, 'feed');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('undoing a feed also undoes the watering that was auto-logged with it',
        after && after.feedLog.length === 0 && after.waterLog.length === 1,
        'got: w=' + JSON.stringify(after && after.waterLog) + ' f=' + JSON.stringify(after && after.feedLog));

      plantUndoCare(900001, 'water');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('undo on an empty log is a no-op, not a crash', after && after.waterLog.length === 0, 'got: ' + JSON.stringify(after && after.waterLog));
      plantUndoCare(900001, 'water');
      after = getPlants().find(function(x){ return x.id === 900001; });
      ok('repeated undo on an empty log stays a no-op', after && after.waterLog.length === 0, 'got: ' + JSON.stringify(after && after.waterLog));

      // Undoing a feed must not discard a manual watering logged after it —
      // the auto-paired water entry is only removed while it's still the newest one.
      // (A later manual watering is synthesised directly rather than via a second
      // plantLogCare call, since a same-millisecond test run can't be trusted to
      // produce a distinct Date.now() the way two real, separated button taps would.)
      storeSet('fl4_plants', getPlants().concat([
        { id:900003, name:'TestFern', waterDays:7, feedDays:21, waterLog:[], feedLog:[], updated: 1000 }
      ]));
      plantLogCare(900003, 'feed');
      var pairedTs = getPlants().find(function(x){ return x.id === 900003; }).feedLog[0];
      var withManualWater = getPlants();
      var fi = withManualWater.findIndex(function(x){ return x.id === 900003; });
      withManualWater[fi].waterLog.unshift(pairedTs + 1000);
      storeSet('fl4_plants', withManualWater);
      plantUndoCare(900003, 'feed');
      after = getPlants().find(function(x){ return x.id === 900003; });
      ok('undoing a feed leaves a later manual watering untouched',
        after && after.feedLog.length === 0 && after.waterLog.length === 2 && after.waterLog.indexOf(pairedTs) !== -1,
        'got: w=' + JSON.stringify(after && after.waterLog) + ' f=' + JSON.stringify(after && after.feedLog));

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

      // ── care history (v416) ───────────────────────────────────────────────
      // The grouping is BY LOCAL DAY, not per stored timestamp — a feed writes a
      // watering at the same millisecond (v409), so a per-timestamp list would
      // show one action as two rows.
      ok('plantCareEvents(null) is an empty array',
        Array.isArray(plantCareEvents(null)) && plantCareEvents(null).length === 0,
        'got: ' + JSON.stringify(plantCareEvents(null)));
      ok('a plant with no logs has no care events',
        plantCareEvents({ id:1 }).length === 0 && plantCareEvents({ id:1, waterLog:[], feedLog:[] }).length === 0,
        'got: ' + JSON.stringify(plantCareEvents({ id:1, waterLog:[], feedLog:[] })));

      var fedTs = daysAgo(3);
      var evFeed = plantCareEvents({ waterLog:[fedTs], feedLog:[fedTs] });
      ok('a feed and its paired watering collapse into ONE row',
        evFeed.length === 1, 'got: ' + JSON.stringify(evFeed));
      ok('that row is marked as both watered and fed',
        evFeed[0].water === true && evFeed[0].feed === true, 'got: ' + JSON.stringify(evFeed[0]));
      ok('a watering-only day is water-true, feed-false',
        plantCareEvents({ waterLog:[daysAgo(2)] })[0].feed === false,
        'got: ' + JSON.stringify(plantCareEvents({ waterLog:[daysAgo(2)] })[0]));

      // Two separate waterings on one day: one row, not two identical-looking ones.
      var sameDay = plantCareEvents({ waterLog:[daysAgo(2) + 3600000, daysAgo(2)] });
      ok('two waterings on the same day collapse into one row',
        sameDay.length === 1, 'got: ' + JSON.stringify(sameDay));
      ok('the row carries the NEWEST moment of that day',
        sameDay[0].ts === daysAgo(2) + 3600000, 'got: ' + sameDay[0].ts + ' want: ' + (daysAgo(2) + 3600000));

      // Watered in the morning, fed in the evening — still one day, both true.
      var mixed = plantCareEvents({ waterLog:[daysAgo(1) + 7200000, daysAgo(1)], feedLog:[daysAgo(1) + 7200000] });
      ok('watering then feeding later the same day is one row marked both',
        mixed.length === 1 && mixed[0].water === true && mixed[0].feed === true,
        'got: ' + JSON.stringify(mixed));

      // A feed with no paired watering (imported data, or pre-v409 logs).
      var feedOnly = plantCareEvents({ waterLog:[], feedLog:[daysAgo(5)] });
      ok('a feed with no paired watering still appears, as feed-only',
        feedOnly.length === 1 && feedOnly[0].feed === true && feedOnly[0].water === false,
        'got: ' + JSON.stringify(feedOnly));

      var ordered = plantCareEvents({ waterLog:[daysAgo(1), daysAgo(9), daysAgo(4)] });
      ok('events come back newest first',
        ordered.length === 3 && ordered[0].ts > ordered[1].ts && ordered[1].ts > ordered[2].ts,
        'got: ' + JSON.stringify(ordered.map(function(e){ return e.ts; })));

      ok('a corrupt or zero log entry is skipped, not rendered as Invalid Date',
        plantCareEvents({ waterLog:[0, NaN, 'nonsense', daysAgo(1)] }).length === 1,
        'got: ' + JSON.stringify(plantCareEvents({ waterLog:[0, NaN, 'nonsense', daysAgo(1)] })));

      // Pure read — rendering history must never write to the plant (v396 contract).
      var pureP = { id:99, name:'Pure', waterLog:[daysAgo(1)], feedLog:[daysAgo(1)], updated: 12345 };
      var pureBefore = JSON.stringify(pureP);
      plantCareEvents(pureP); plantCareHistoryHTML(pureP);
      ok('reading the care history does not mutate the plant',
        JSON.stringify(pureP) === pureBefore, 'got: ' + JSON.stringify(pureP));

      ok('wording matches what the row did',
        plantCareEventWords({ water:true, feed:true }) === 'Watered + fed' &&
        plantCareEventWords({ water:true, feed:false }) === 'Watered' &&
        plantCareEventWords({ water:false, feed:true }) === 'Fed',
        'got: ' + plantCareEventWords({ water:true, feed:true }));
      ok('plantDateLabel renders a real date and nothing for a broken one',
        plantDateLabel(daysAgo(1)).length > 0 && plantDateLabel('nonsense') === '',
        'got: ' + plantDateLabel(daysAgo(1)) + ' / ' + plantDateLabel('nonsense'));

      // ── care history in the rendered detail view ──────────────────────────
      var histLog = [];
      for (var hd = 1; hd <= 8; hd++) histLog.push(daysAgo(hd));
      storeSet('fl4_plants', [{ id:900003, name:'History Fern', waterLog:histLog, feedLog:[daysAgo(3)], waterDays:7, updated:Date.now() }]);
      var savedView = _plantView, savedOpen = _plantOpenId;
      _plantHistoryOpenId = null;
      _plantOpenId = 900003; _plantView = 'detail';
      renderPlantDetail();
      ok('the detail view shows a Recent care block',
        document.getElementById('plantsContent').textContent.indexOf('Recent care') > -1,
        'no "Recent care" heading found');
      ok('only the newest 5 days are shown by default',
        document.querySelectorAll('.plant-hist-row').length === 5,
        'got: ' + document.querySelectorAll('.plant-hist-row').length);
      ok('a Show all button appears with the full day count',
        !!document.getElementById('plHistToggle') &&
        document.getElementById('plHistToggle').textContent.indexOf('Show all (8)') > -1,
        'got: ' + (document.getElementById('plHistToggle') || {}).textContent);
      ok('the fed day reads "Watered + fed"',
        document.getElementById('plantsContent').textContent.indexOf('Watered + fed') > -1,
        'no combined row rendered');
      document.getElementById('plHistToggle').click();
      ok('Show all expands to every day',
        document.querySelectorAll('.plant-hist-row').length === 8,
        'got: ' + document.querySelectorAll('.plant-hist-row').length);
      ok('the expanded button offers Show less',
        document.getElementById('plHistToggle').textContent.indexOf('Show less') > -1,
        'got: ' + document.getElementById('plHistToggle').textContent);
      document.getElementById('plHistToggle').click();
      ok('tapping again collapses back to 5',
        document.querySelectorAll('.plant-hist-row').length === 5,
        'got: ' + document.querySelectorAll('.plant-hist-row').length);

      // Expand state is keyed to the plant, so a different plant opens collapsed.
      _plantHistoryOpenId = 900003;
      storeSet('fl4_plants', [{ id:900004, name:'Other Fern', waterLog:histLog, updated:Date.now() }]);
      _plantOpenId = 900004;
      renderPlantDetail();
      ok('another plant does not inherit the expanded state',
        document.querySelectorAll('.plant-hist-row').length === 5,
        'got: ' + document.querySelectorAll('.plant-hist-row').length);

      // No log at all → no empty box on a brand-new plant.
      storeSet('fl4_plants', [{ id:900005, name:'Brand New', updated:Date.now() }]);
      _plantOpenId = 900005;
      renderPlantDetail();
      ok('a plant with nothing logged shows no Recent care block',
        document.getElementById('plantsContent').textContent.indexOf('Recent care') === -1 &&
        document.querySelectorAll('.plant-hist-row').length === 0,
        'an empty history block was rendered');

      ok('PLANT_HISTORY_PREVIEW is 5', PLANT_HISTORY_PREVIEW === 5, 'got: ' + PLANT_HISTORY_PREVIEW);

      _plantView = savedView; _plantOpenId = savedOpen; _plantHistoryOpenId = null;

      // ── plantNextDue ────────────────────────────────────────────────────
      ok('plantNextDue takes the sooner of water/feed',
        plantNextDue({ waterDays:7, waterLog:[daysAgo(7)], feedDays:21, feedLog:[daysAgo(3)] }) === 0,
        'got: ' + plantNextDue({ waterDays:7, waterLog:[daysAgo(7)], feedDays:21, feedLog:[daysAgo(3)] }));
      ok('plantNextDue takes feed when it is sooner than water',
        plantNextDue({ waterDays:14, waterLog:[Date.now()], feedDays:21, feedLog:[daysAgo(21)] }) === 0,
        'got: ' + plantNextDue({ waterDays:14, waterLog:[Date.now()], feedDays:21, feedLog:[daysAgo(21)] }));
      ok('plantNextDue falls back to whichever of water/feed has a reminder',
        plantNextDue({ waterDays:0, waterLog:[], feedDays:10, feedLog:[daysAgo(10)] }) === 0,
        'got: ' + plantNextDue({ waterDays:0, waterLog:[], feedDays:10, feedLog:[daysAgo(10)] }));
      ok('plantNextDue is null when neither water nor feed has a reminder',
        plantNextDue({ waterDays:0, waterLog:[], feedDays:0, feedLog:[] }) === null,
        'got: ' + plantNextDue({ waterDays:0, waterLog:[], feedDays:0, feedLog:[] }));

      // ── plant list: sorted soonest-due-first, with both pills shown (v417) ─
      var savedListArea = _plantArea, savedListView = _plantView;
      _plantArea = ''; _plantView = 'list';
      storeSet('fl4_plants', [
        { id:900010, name:'Later',   waterDays:7,  waterLog:[Date.now()],       feedDays:0, feedLog:[], updated:Date.now() },
        { id:900011, name:'Overdue', waterDays:7,  waterLog:[daysAgo(9)],       feedDays:0, feedLog:[], updated:Date.now() },
        { id:900012, name:'NoDates', waterDays:0,  waterLog:[],                 feedDays:0, feedLog:[], updated:Date.now() },
        { id:900013, name:'DueSoon', waterDays:30, waterLog:[Date.now()],       feedDays:10, feedLog:[daysAgo(9)], updated:Date.now() }
      ]);
      renderPlants();
      var cardIds = Array.prototype.slice.call(document.querySelectorAll('.plant-card')).map(function(c){ return +c.dataset.pid; });
      ok('list sorts soonest-due plant first and no-reminder plant last',
        cardIds.join(',') === '900011,900013,900010,900012', 'got: ' + cardIds.join(','));
      var soonCardText = document.querySelector('.plant-card[data-pid="900013"]').textContent;
      ok('a plant due soon on feed (not water) still shows a feed pill',
        soonCardText.indexOf('due tomorrow') > -1, 'got: ' + soonCardText);
      _plantArea = savedListArea; _plantView = savedListView;

      // Cleanup
      if (saved === null || saved === undefined) localStorage.removeItem('fl4_plants'); else storeSet('fl4_plants', saved);
      if (savedTombs === null || savedTombs === undefined) localStorage.removeItem('fl4_tomb_plants'); else storeSet('fl4_tomb_plants', savedTombs);

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
