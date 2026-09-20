'use strict';

// v478 — the Baby › Bags section, reported broken on 20/09/2026 with three
// symptoms that all came out of the sync layer:
//   ① a bag created here vanished on the next pull, and came back later;
//   ② items added to an EXISTING bag vanished with it;
//   ③ a newly created bag could not be added to, and displayed another bag's
//      items.
// ① and ② were `bags: remote.bags || local.bags` — a wholesale last-writer-wins
// that the v329 rewrite had removed everywhere else in Baby. ③ was Firebase
// stripping the empty `items: []` off a brand-new bag, so the echo came back
// with no items key at all and `bag.items.filter` threw mid-render.
//
// These are regression tripwires. If one fails, re-check the merge — do not
// delete the case.

module.exports = {
  name: '73-baby-bags',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function bagOf(bags, id){ return bags.find(function(b){ return b.id === id; }); }

      // ── ③ shape normalisation: the Firebase round trip ────────────────────
      // Firebase stores no empty containers, so {items:[]} comes back with the
      // key missing entirely; a sparse array comes back as an object.
      var shaped = normaliseBags([
        {id:'a', name:'No items key', icon:'x'},                       // items stripped by Firebase
        {id:'b', name:'Sparse', items:{'0':{id:'b_0', name:'One'}}},   // array-as-object
        {id:'c', name:'Junk items', items:'nonsense'},
        null,
        'not a bag'
      ]);
      ok('normaliseBags drops non-objects', shaped.length === 3, 'got: ' + shaped.length);
      ok('missing items key becomes an array', Array.isArray(bagOf(shaped,'a').items) && bagOf(shaped,'a').items.length === 0,
        'got: ' + JSON.stringify(bagOf(shaped,'a')));
      ok('array-as-object is read back as an array', Array.isArray(bagOf(shaped,'b').items) && bagOf(shaped,'b').items.length === 1,
        'got: ' + JSON.stringify(bagOf(shaped,'b')));
      ok('junk items becomes an empty array', Array.isArray(bagOf(shaped,'c').items) && bagOf(shaped,'c').items.length === 0,
        'got: ' + JSON.stringify(bagOf(shaped,'c')));
      ok('every normalised item has packed + updated',
        bagOf(shaped,'b').items[0].packed === false && bagOf(shaped,'b').items[0].updated === 0,
        'got: ' + JSON.stringify(bagOf(shaped,'b').items[0]));
      // The actual crash: an un-normalised bag threw here and left the tab row
      // and the item list disagreeing on screen.
      var threw = false;
      try { shaped.forEach(function(b){ b.items.filter(function(x){ return !x.packed; }); }); } catch(e){ threw = true; }
      ok('a round-tripped bag can be rendered without throwing', !threw);

      // ── ① a bag created on THIS device survives a pull that predates it ───
      var local = [
        {id:'changing', name:'Changing Bag', updated:0, items:[{id:'changing_0', name:'Nappies', packed:false, updated:0}]},
        {id:'bag_500',  name:'Test', updated:500, items:[]}
      ];
      var remoteOlder = [
        {id:'changing', name:'Changing Bag', updated:0, items:[{id:'changing_0', name:'Nappies', packed:false, updated:0}]}
      ];
      var m1 = mergeBags(local, remoteOlder, {}, {});
      ok('a locally created bag survives a pull that does not know it', !!bagOf(m1,'bag_500'), 'got: ' + JSON.stringify(m1));

      // ── ② items added on each side both survive ───────────────────────────
      var lA = [{id:'changing', name:'Changing Bag', updated:100, items:[
        {id:'changing_0', name:'Nappies', packed:false, updated:0},
        {id:'changing_99', name:'Added here', packed:false, updated:600}
      ]}];
      var rB = [{id:'changing', name:'Changing Bag', updated:100, items:[
        {id:'changing_0', name:'Nappies', packed:false, updated:0},
        {id:'changing_88', name:'Added there', packed:false, updated:700}
      ]}];
      var m2 = bagOf(mergeBags(lA, rB, {}, {}), 'changing');
      ok('items added on both devices are unioned, not replaced',
        m2.items.length === 3 && m2.items.some(function(i){return i.id==='changing_99';}) && m2.items.some(function(i){return i.id==='changing_88';}),
        'got: ' + JSON.stringify(m2.items));
      ok('local item order is preserved, remote-only items append',
        m2.items[0].id === 'changing_0' && m2.items[2].id === 'changing_88', 'got: ' + m2.items.map(function(i){return i.id;}).join(','));

      // ── newest-wins on a packed toggle, and the seed never outranks an edit ─
      var packedWins = bagOf(mergeBags(
        [{id:'d', name:'D', updated:0, items:[{id:'d_0', name:'X', packed:true, updated:900}]}],
        [{id:'d', name:'D', updated:0, items:[{id:'d_0', name:'X', packed:false, updated:0}]}],
        {}, {}), 'd');
      ok('a packed tick beats a freshly seeded default (updated:0)', packedWins.items[0].packed === true,
        'got: ' + JSON.stringify(packedWins.items[0]));
      var renamed = bagOf(mergeBags(
        [{id:'e', name:'Old name', updated:100, items:[]}],
        [{id:'e', name:'New name', updated:200, items:[]}], {}, {}), 'e');
      ok('bag rename is newest-wins', renamed.name === 'New name', 'got: ' + renamed.name);

      // ── tombstones: a delete sticks, a later re-use survives ──────────────
      var withTombs = mergeBags(
        [{id:'keep', name:'Keep', updated:100, items:[{id:'k_1', name:'Stays', packed:false, updated:100}, {id:'k_2', name:'Deleted', packed:false, updated:100}]},
         {id:'gone', name:'Deleted bag', updated:100, items:[]},
         {id:'revived', name:'Deleted then used again', updated:900, items:[]}],
        [], {gone:500, revived:500}, {k_2:500});
      ok('a deleted bag stays deleted', !bagOf(withTombs,'gone'), 'got: ' + JSON.stringify(withTombs.map(function(b){return b.id;})));
      ok('a bag used again after the delete survives (tomb older than update)', !!bagOf(withTombs,'revived'),
        'got: ' + JSON.stringify(withTombs.map(function(b){return b.id;})));
      ok('a deleted item stays deleted', bagOf(withTombs,'keep').items.length === 1 && bagOf(withTombs,'keep').items[0].id === 'k_1',
        'got: ' + JSON.stringify(bagOf(withTombs,'keep').items));

      // ── mergeBabyData wires bags through with its two new tombstone sets ──
      var bd = mergeBabyData(
        {growth:[], medicine:[], milestones:[], teeth:{}, bottles:{},
         bags:[{id:'bag_1', name:'Mine', updated:300, items:[]}, {id:'bag_2', name:'Binned', updated:100, items:[]}]},
        {growth:[], medicine:[], milestones:[], teeth:{}, bottles:{}, bags:[]},
        {}, {}, {}, {bag_2:400}, {});
      ok('mergeBabyData keeps a local-only bag against an empty remote',
        bd.bags.length === 1 && bd.bags[0].id === 'bag_1', 'got: ' + JSON.stringify(bd.bags));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
