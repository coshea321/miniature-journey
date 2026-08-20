'use strict';

// Plant import/export (v378). The AI round-trip: export a plant, hand the JSON
// to a chat, paste the reply back. Covers the parser's guards, the "file wins,
// blanks left alone" update rule, and the promise that an import never touches
// a photo or a care log. Data layer only — same style as 06-trip-roundtrip.
// Cleans up after itself so later cases see an empty fl4_plants store.
module.exports = {
  name: '23-plant-import-export',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var saved = storeGet('fl4_plants');
      var savedTombs = storeGet('fl4_tomb_plants');

      // ── parsePlantFile guards ─────────────────────────────────────────────
      ok('unparseable text is an error, not a throw',
        !!parsePlantFile('not json at all').error, 'got: ' + JSON.stringify(parsePlantFile('not json at all')));
      ok('a file without the hearth tag is rejected',
        !!parsePlantFile('{"name":"Fern"}').error, 'got: ' + JSON.stringify(parsePlantFile('{"name":"Fern"}')));
      ok('the wrong hearth tag is rejected (a trip file is not a plant file)',
        !!parsePlantFile('{"hearth":"trip-v1","name":"Paris"}').error,
        'got: ' + JSON.stringify(parsePlantFile('{"hearth":"trip-v1","name":"Paris"}')));
      ok('a nameless plant is rejected',
        !!parsePlantFile('{"hearth":"plant-v1","summary":"nice"}').error,
        'got: ' + JSON.stringify(parsePlantFile('{"hearth":"plant-v1","summary":"nice"}')));
      ok('a whitespace-only name is rejected',
        !!parsePlantFile('{"hearth":"plant-v1","name":"   "}').error,
        'got: ' + JSON.stringify(parsePlantFile('{"hearth":"plant-v1","name":"   "}')));
      ok('an empty plants array is rejected',
        !!parsePlantFile('{"hearth":"plant-v1","plants":[]}').error,
        'got: ' + JSON.stringify(parsePlantFile('{"hearth":"plant-v1","plants":[]}')));

      var single = parsePlantFile('{"hearth":"plant-v1","name":"Fern","watering":"keep damp"}');
      ok('a bare plant object parses to a one-entry list',
        !single.error && single.plants.length === 1 && single.plants[0].name === 'Fern',
        'got: ' + JSON.stringify(single));
      var multi = parsePlantFile('{"hearth":"plant-v1","plants":[{"name":"A"},{"name":"B"},{"name":"C"}]}');
      ok('a plants array parses to a list of that length',
        !multi.error && multi.plants.length === 3, 'got: ' + JSON.stringify(multi));
      var junky = parsePlantFile('{"hearth":"plant-v1","plants":[{"name":"A"},null,"nope"]}');
      ok('null/non-object entries are dropped rather than crashing later',
        !junky.error && junky.plants.length === 1, 'got: ' + JSON.stringify(junky));

      // ── plantApplyImport: the update rule ─────────────────────────────────
      // "File wins, blanks left alone" — a filled field replaces, an empty one
      // keeps what is already there.
      var rec = { id:1, name:'Old name', latin:'Old latin', room:'Kitchen', emoji:'A',
                  photo:'data:image/jpeg;base64,XXXX', summary:'old summary', watering:'old watering',
                  waterDays:7, feedDays:21, waterLog:[111], feedLog:[222], updated: 500 };
      plantApplyImport(rec, { name:'New name', summary:'new summary', watering:'', latin:'' });
      ok('a filled field replaces the existing text', rec.name === 'New name' && rec.summary === 'new summary',
        'got: ' + JSON.stringify({n:rec.name, s:rec.summary}));
      ok('an empty field leaves the existing text alone', rec.watering === 'old watering' && rec.latin === 'Old latin',
        'got: ' + JSON.stringify({w:rec.watering, l:rec.latin}));
      ok('a field the file never mentions is untouched', rec.room === 'Kitchen', 'got: ' + rec.room);
      ok('the photo survives an import', rec.photo === 'data:image/jpeg;base64,XXXX', 'got: ' + rec.photo);
      ok('the care logs survive an import',
        rec.waterLog.length === 1 && rec.waterLog[0] === 111 && rec.feedLog[0] === 222,
        'got: w=' + JSON.stringify(rec.waterLog) + ' f=' + JSON.stringify(rec.feedLog));
      ok('updated is stamped forward', rec.updated > 500, 'got: ' + rec.updated);

      // Intervals: present-but-zero is a real instruction ("no reminder"),
      // absent is not.
      var iv = { id:2, waterDays:7, feedDays:21, waterLog:[], feedLog:[] };
      plantApplyImport(iv, { name:'X', feedDays:0 });
      ok('feedDays:0 in the file clears the reminder', iv.feedDays === 0, 'got: ' + iv.feedDays);
      ok('an interval the file omits keeps its old value', iv.waterDays === 7, 'got: ' + iv.waterDays);
      var iv2 = { id:3, waterDays:7, waterLog:[], feedLog:[] };
      plantApplyImport(iv2, { name:'X', waterDays:'14' });
      ok('a numeric string interval is coerced to a number', iv2.waterDays === 14, 'got: ' + JSON.stringify(iv2.waterDays));
      var iv3 = { id:4, waterDays:7, waterLog:[], feedLog:[] };
      plantApplyImport(iv3, { name:'X', waterDays:9999 });
      ok('a silly interval is clamped to 365', iv3.waterDays === 365, 'got: ' + iv3.waterDays);
      var iv4 = { id:5, waterDays:7, waterLog:[], feedLog:[] };
      plantApplyImport(iv4, { name:'X', waterDays:'every few days' });
      ok('unparseable interval text becomes 0 (no reminder), not NaN',
        iv4.waterDays === 0, 'got: ' + JSON.stringify(iv4.waterDays));

      // Reminder toggles (v430): waterOff is a plain boolean; the feed pause
      // months are clamped to 1-12 like plantCleanDays clamps to 365.
      var wo = { id:8, waterOff:false, waterLog:[], feedLog:[] };
      plantApplyImport(wo, { name:'X', waterOff:true });
      ok('waterOff:true in the file switches the toggle on', wo.waterOff === true, 'got: ' + wo.waterOff);
      var wo2 = { id:9, waterOff:true, waterLog:[], feedLog:[] };
      plantApplyImport(wo2, { name:'X', waterOff:false });
      ok('waterOff:false in the file switches it back off', wo2.waterOff === false, 'got: ' + wo2.waterOff);
      var wo3 = { id:10, waterOff:true, waterLog:[], feedLog:[] };
      plantApplyImport(wo3, { name:'X' });
      ok('waterOff the file omits keeps its old value', wo3.waterOff === true, 'got: ' + wo3.waterOff);

      var fp = { id:11, feedPauseFrom:9, feedPauseTo:4, waterLog:[], feedLog:[] };
      plantApplyImport(fp, { name:'X', feedPauseFrom:'3', feedPauseTo:99 });
      ok('feed pause months are coerced/clamped like other intervals (99 is junk → 0)',
        fp.feedPauseFrom === 3 && fp.feedPauseTo === 0, 'got: ' + JSON.stringify({from:fp.feedPauseFrom, to:fp.feedPauseTo}));

      // A runaway reply must not be written into localStorage whole.
      var big = { id:6, waterLog:[], feedLog:[] };
      var huge = new Array(PLANT_FIELD_MAX + 500).join('x') + 'yyyy';
      plantApplyImport(big, { name:'X', notes: huge });
      ok('a section is capped at PLANT_FIELD_MAX', big.notes.length === PLANT_FIELD_MAX,
        'got: ' + big.notes.length + ' cap ' + PLANT_FIELD_MAX);
      ok('a non-string section is ignored rather than stored',
        (function(){ var r = { id:7, notes:'kept', waterLog:[], feedLog:[] };
                     plantApplyImport(r, { name:'X', notes: { a:1 } });
                     return r.notes === 'kept'; })(), 'object section leaked into the record');

      // ── Export → import round trip ────────────────────────────────────────
      var p1 = { id: 910001, name:'RoundTrip Fern', latin:'Nephrolepis exaltata', emoji:'F', room:'Bathroom',
                 photo:'data:image/jpeg;base64,ZZZZ', waterDays:5, feedDays:30,
                 waterOff:true, feedPauseFrom:9, feedPauseTo:4,
                 waterLog:[777], feedLog:[888], updated: 1000 };
      PLANT_SECTIONS.forEach(function(sec){ p1[sec.key] = 'text for ' + sec.key; });
      storeSet('fl4_plants', [p1]);

      var exported = plantExportObj(p1);
      ok('every PLANT_SECTIONS key is in the export',
        PLANT_SECTIONS.every(function(sec){ return exported[sec.key] === 'text for ' + sec.key; }),
        'got keys: ' + Object.keys(exported).join(','));
      ok('the scalar fields are in the export',
        exported.name === 'RoundTrip Fern' && exported.latin === 'Nephrolepis exaltata' &&
        exported.room === 'Bathroom' && exported.emoji === 'F' &&
        exported.waterDays === 5 && exported.feedDays === 30, 'got: ' + JSON.stringify(exported));
      ok('the reminder toggles are in the export',
        exported.waterOff === true && exported.feedPauseFrom === 9 && exported.feedPauseTo === 4,
        'got: ' + JSON.stringify(exported));
      ok('the export carries no id, photo or logs',
        exported.id === undefined && exported.photo === undefined &&
        exported.waterLog === undefined && exported.feedLog === undefined,
        'got keys: ' + Object.keys(exported).join(','));

      var fileText = JSON.stringify(Object.assign({ hearth: PLANT_FILE_TAG }, exported));
      var reparsed = parsePlantFile(fileText);
      ok('the file the export writes parses back in', !reparsed.error, 'got: ' + JSON.stringify(reparsed));

      var newId = importPlantsAsNew(reparsed.plants);
      var fresh = getPlants().find(function(x){ return x && x.id === newId; });
      ok('importing as new adds a second plant rather than replacing the first',
        getPlants().length === 2 && newId !== 910001, 'got: ' + JSON.stringify(getPlants().map(function(x){ return x.id; })));
      ok('every written field survives the round trip',
        fresh && fresh.name === 'RoundTrip Fern' && fresh.waterDays === 5 && fresh.feedDays === 30 &&
        PLANT_SECTIONS.every(function(sec){ return fresh[sec.key] === 'text for ' + sec.key; }),
        'got: ' + JSON.stringify(fresh));
      ok('the reminder toggles survive the round trip',
        fresh && fresh.waterOff === true && fresh.feedPauseFrom === 9 && fresh.feedPauseTo === 4,
        'got: ' + JSON.stringify(fresh));
      ok('a new import starts with empty logs and no photo',
        fresh && fresh.waterLog.length === 0 && fresh.feedLog.length === 0 && !fresh.photo,
        'got: ' + JSON.stringify({ w:fresh && fresh.waterLog, f:fresh && fresh.feedLog, p:fresh && fresh.photo }));

      var ids = {};
      var manyId = importPlantsAsNew([{ name:'M1' }, { name:'M2' }, { name:'M3' }]);
      getPlants().forEach(function(p){ ok('unique id ' + p.id, !ids[p.id], 'duplicate id ' + p.id); ids[p.id] = true; });
      ok('a multi-plant import returns the first new id and adds them all',
        manyId != null && getPlants().length === 5, 'got: ' + getPlants().length);

      // ── importPlantInto ───────────────────────────────────────────────────
      var before = getPlants().find(function(x){ return x && x.id === 910001; });
      var beforeLogs = JSON.stringify({ w: before.waterLog, f: before.feedLog, photo: before.photo });
      var res = importPlantInto(910001, { name:'Renamed Fern', summary:'', light:'bright shade' });
      var afterUpd = getPlants().find(function(x){ return x && x.id === 910001; });
      ok('importPlantInto reports the id it updated', res && res.id === 910001, 'got: ' + JSON.stringify(res));
      ok('the update applies the file fields', afterUpd.name === 'Renamed Fern' && afterUpd.light === 'bright shade',
        'got: ' + JSON.stringify({ n:afterUpd.name, l:afterUpd.light }));
      ok('the update leaves the sections the file left blank',
        afterUpd.summary === 'text for summary', 'got: ' + afterUpd.summary);
      ok('the update leaves photo and logs exactly as they were',
        JSON.stringify({ w: afterUpd.waterLog, f: afterUpd.feedLog, photo: afterUpd.photo }) === beforeLogs,
        'got: ' + JSON.stringify({ w: afterUpd.waterLog, f: afterUpd.feedLog, photo: afterUpd.photo }));
      ok('the update stamps updated forward so the merge carries it',
        afterUpd.updated > 1000, 'got: ' + afterUpd.updated);

      var missing = importPlantInto(-1, { name:'Nope' });
      ok('importing into an id that is gone errors instead of writing at -1',
        !!(missing && missing.error) && getPlants().length === 5,
        'got: ' + JSON.stringify(missing) + ' len ' + getPlants().length);

      // ── The AI prompt template ────────────────────────────────────────────
      var prompt = plantAIPrompt();
      ok('the prompt names the file tag the parser demands',
        prompt.indexOf('"hearth": "' + PLANT_FILE_TAG + '"') !== -1, 'tag missing from the prompt');
      ok('the prompt lists every section key, so it cannot drift from the app',
        PLANT_SECTIONS.every(function(sec){ return prompt.indexOf('"' + sec.key + '": ""') !== -1; }),
        'a PLANT_SECTIONS key is missing from the prompt skeleton');
      ok('the prompt skeleton is itself valid JSON once filled in',
        (function(){
          var m = prompt.match(/\\{[\\s\\S]*?\\n\\}/);
          if (!m) return false;
          try { var o = JSON.parse(m[0]); return o.hearth === PLANT_FILE_TAG && !parsePlantFile(JSON.stringify(
            Object.assign({}, o, { name: 'Filled in' }))).error; } catch (e) { return false; }
        })(), 'the JSON skeleton in the prompt does not parse');
      ok('HTML entities never reach the plain-text prompt',
        prompt.indexOf('&amp;') === -1 && prompt.indexOf('&#x') === -1, 'an HTML entity leaked into the prompt');

      // Cleanup
      if (saved === null || saved === undefined) localStorage.removeItem('fl4_plants'); else storeSet('fl4_plants', saved);
      if (savedTombs === null || savedTombs === undefined) localStorage.removeItem('fl4_tomb_plants'); else storeSet('fl4_tomb_plants', savedTombs);

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
