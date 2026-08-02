'use strict';

// Plant areas + the Home glance card (v379). Pure helpers only — the area
// grouping/filtering behind the list chips, and the summary line the Home card
// paints — in the same style as 22-plants. Touches no storage, so there is
// nothing to clean up.
module.exports = {
  name: '24-plant-areas',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var DAY = 86400000;
      function daysAgo(n){
        var now = new Date();
        var mid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return mid.getTime() - n * DAY + 12 * 3600000;
      }

      // ── plantAreaKey ──────────────────────────────────────────────────────
      ok('area key trims and lowercases', plantAreaKey('  Kitchen ') === 'kitchen', 'got: ' + plantAreaKey('  Kitchen '));
      ok('missing area keys to ""', plantAreaKey(undefined) === '' && plantAreaKey(null) === '' && plantAreaKey('   ') === '',
        'a blank area produced a non-empty key');

      // ── plantAreas ────────────────────────────────────────────────────────
      var book = [
        { id:1, name:'Spider Plant',  room:'Kitchen' },
        { id:2, name:'Monstera',      room:'living room' },
        { id:3, name:'Rosemary',      room:'Outside' },
        { id:4, name:'Fern',          room:'kitchen' },       // same area, different spelling
        { id:5, name:'Orchid',        room:'  Living Room ' },// same again, padded
        { id:6, name:'Cactus',        room:'' },              // untagged
        { id:7, name:'Aloe' }                                 // no room field at all
      ];
      var areas = plantAreas(book);
      ok('areas are de-duplicated case-insensitively', areas.length === 3, 'got: ' + JSON.stringify(areas));
      ok('the tidiest spelling labels the area, and areas sort alphabetically',
        JSON.stringify(areas) === JSON.stringify(['Kitchen','Living Room','Outside']), 'got: ' + JSON.stringify(areas));
      ok('the commonest spelling wins over a capitalised one-off',
        JSON.stringify(plantAreas([{room:'kitchen'},{room:'kitchen'},{room:'Kitchen'}])) === JSON.stringify(['kitchen']),
        'got: ' + JSON.stringify(plantAreas([{room:'kitchen'},{room:'kitchen'},{room:'Kitchen'}])));
      ok('the chip label never depends on which plant sorts first',
        JSON.stringify(plantAreas([{room:'kitchen'},{room:'Kitchen'}])) ===
        JSON.stringify(plantAreas([{room:'Kitchen'},{room:'kitchen'}])),
        'reordering the book changed the label');
      ok('blank and missing rooms never become an area',
        areas.every(function(a){ return a.trim() !== ''; }), 'got: ' + JSON.stringify(areas));
      ok('plantAreas on an empty book is an empty list',
        Array.isArray(plantAreas([])) && plantAreas([]).length === 0, 'got: ' + JSON.stringify(plantAreas([])));

      // ── plantsInArea ──────────────────────────────────────────────────────
      ok('"" returns every plant', plantsInArea(book, '').length === book.length,
        'got: ' + plantsInArea(book, '').length);
      ok('filtering is case- and padding-insensitive both ways',
        plantsInArea(book, 'KITCHEN').length === 2 && plantsInArea(book, ' living room ').length === 2,
        'kitchen: ' + plantsInArea(book, 'KITCHEN').length + ', living room: ' + plantsInArea(book, ' living room ').length);
      ok('an area with one plant returns just that plant',
        plantsInArea(book, 'Outside').length === 1 && plantsInArea(book, 'Outside')[0].id === 3,
        'got: ' + JSON.stringify(plantsInArea(book, 'Outside').map(function(p){ return p.id; })));
      ok('PLANT_AREA_NONE returns exactly the untagged plants',
        JSON.stringify(plantsInArea(book, PLANT_AREA_NONE).map(function(p){ return p.id; })) === JSON.stringify([6,7]),
        'got: ' + JSON.stringify(plantsInArea(book, PLANT_AREA_NONE).map(function(p){ return p.id; })));
      ok('an area nobody uses returns nothing (never everything)',
        plantsInArea(book, 'Attic').length === 0, 'got: ' + plantsInArea(book, 'Attic').length);
      ok('the untagged sentinel is not a real area anyone could type into the box',
        plantAreas(book).every(function(a){ return a !== PLANT_AREA_NONE; }) && plantAreaKey(PLANT_AREA_NONE) === '__none__',
        'the sentinel collided with a real area');
      ok('null entries are dropped rather than thrown on',
        plantsInArea([null, { id:9, room:'Kitchen' }, undefined], 'Kitchen').length === 1,
        'got: ' + plantsInArea([null, { id:9, room:'Kitchen' }, undefined], 'Kitchen').length);
      ok('filtering never mutates the book', book.length === 7, 'got: ' + book.length);

      // ── plantHomeSummary — the card never self-suppresses ─────────────────
      var empty = plantHomeSummary([]);
      ok('empty book shows an invitation, not a count',
        empty.count === 0 && empty.countText === '\\u2014' && empty.sub === 'Tap to add your first plant',
        'got: ' + JSON.stringify(empty));

      var noSched = plantHomeSummary([{ id:1, name:'Aloe', waterDays:0, waterLog:[] }]);
      ok('a plant with no interval counts but reads "Nothing scheduled"',
        noSched.count === 1 && noSched.label === 'plant' && noSched.sub === 'Nothing scheduled',
        'got: ' + JSON.stringify(noSched));

      var neverLogged = plantHomeSummary([{ id:1, name:'Aloe', waterDays:7, waterLog:[] }]);
      ok('an interval that has never been logged is not overdue on the card',
        neverLogged.sub === 'Nothing scheduled', 'got: ' + JSON.stringify(neverLogged));

      var oneDue = plantHomeSummary([
        { id:1, name:'Spider Plant', waterDays:7, waterLog:[daysAgo(9)] },
        { id:2, name:'Monstera',     waterDays:7, waterLog:[daysAgo(1)] }
      ]);
      ok('one overdue plant is named on the card',
        oneDue.count === 2 && oneDue.label === 'plants' && oneDue.sub === 'Spider Plant needs watering',
        'got: ' + JSON.stringify(oneDue));

      var twoDue = plantHomeSummary([
        { id:1, name:'Spider Plant', waterDays:7, waterLog:[daysAgo(9)] },
        { id:2, name:'Monstera',     waterDays:3, waterLog:[daysAgo(4)] }
      ]);
      ok('two or more overdue plants are counted, not named',
        twoDue.sub === '2 plants need watering', 'got: ' + JSON.stringify(twoDue));

      var dueToday = plantHomeSummary([{ id:1, name:'Fern', waterDays:7, waterLog:[daysAgo(7)] }]);
      ok('due today counts as needing watering (matches plantOverdue)',
        dueToday.sub === 'Fern needs watering', 'got: ' + JSON.stringify(dueToday));

      var soon = plantHomeSummary([
        { id:1, name:'Fern',     waterDays:7, waterLog:[daysAgo(6)] },   // due in 1
        { id:2, name:'Monstera', waterDays:7, waterLog:[daysAgo(1)] }    // due in 6
      ]);
      ok('nothing due reports the soonest one, in words',
        soon.sub === 'All watered \\u00b7 next tomorrow', 'got: ' + JSON.stringify(soon));

      var soonDays = plantHomeSummary([
        { id:1, name:'Fern',     waterDays:7, waterLog:[daysAgo(4)] },   // due in 3
        { id:2, name:'Monstera', waterDays:7, waterLog:[daysAgo(1)] },   // due in 6
        { id:3, name:'Aloe',     waterDays:0, waterLog:[daysAgo(1)] }    // no interval — ignored
      ]);
      ok('the soonest due date wins and unscheduled plants are skipped',
        soonDays.sub === 'All watered \\u00b7 next in 3 days' && soonDays.count === 3,
        'got: ' + JSON.stringify(soonDays));

      ok('null entries in the book do not break the card',
        plantHomeSummary([null, { id:1, name:'Aloe', waterDays:0 }, undefined]).count === 1,
        'got: ' + JSON.stringify(plantHomeSummary([null, { id:1, name:'Aloe', waterDays:0 }, undefined])));

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
