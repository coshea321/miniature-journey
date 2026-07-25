'use strict';

module.exports = {
  name: '03-merge-hist',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // Union by name, existing side wins on a same-name conflict
      var r1 = mergeHist([{name:'Milk',count:1,lastUsed:100}], [{name:'Milk',count:5,lastUsed:200}], {}, []);
      var milk = r1.filter(function(h){return h.name==='Milk';});
      ok('existing side wins on same name', milk.length===1 && milk[0].count===1, 'got: ' + JSON.stringify(milk));

      // Tombstone >= lastUsed drops the entry
      var r2 = mergeHist([{name:'Eggs',count:2,lastUsed:150}], [], {eggs:200}, []);
      ok('tombstone >= lastUsed drops entry', !r2.some(function(h){return h.name==='Eggs';}), 'got: ' + JSON.stringify(r2));

      // Fresher lastUsed revives past an older tombstone
      var r3 = mergeHist([{name:'Eggs',count:2,lastUsed:250}], [], {eggs:200}, []);
      ok('fresher lastUsed revives', r3.some(function(h){return h.name==='Eggs';}), 'got: ' + JSON.stringify(r3));

      // Sort by count desc, then lastUsed desc
      var r4 = mergeHist([{name:'A',count:1,lastUsed:100},{name:'B',count:5,lastUsed:50}], [], {}, []);
      ok('sorted by count desc', r4[0] && r4[0].name==='B', 'got: ' + JSON.stringify(r4));

      // v348 cap: 155 entries, 10 marked live via items -> all 10 protected survive, total <= 160
      var many = [];
      for (var i=0;i<155;i++) many.push({name:'h'+i, count:1, lastUsed:i});
      var liveItems = [];
      for (var j=0;j<10;j++) liveItems.push({name:'h'+j});
      var r5 = mergeHist(many, [], {}, liveItems);
      var protectedSurvive = liveItems.every(function(li){ return r5.some(function(h){return h.name===li.name;}); });
      ok('cap: all 10 protected entries survive', protectedSurvive, 'count=' + r5.length);
      ok('cap: total <= 160', r5.length <= 160, 'count=' + r5.length);

      // Under-150 input passes through uncapped
      var under = [];
      for (var k=0;k<100;k++) under.push({name:'u'+k, count:1, lastUsed:k});
      var r6 = mergeHist(under, [], {}, []);
      ok('under-150 passes through uncapped', r6.length === 100, 'count=' + r6.length);

      // D2: nameless incoming entry is silently dropped, not thrown
      var r7err = null, r7 = null;
      try { r7 = mergeHist([{name:'Good',count:1,lastUsed:100}], [{count:1,lastUsed:50}], {}, []); }
      catch (e) { r7err = e.message; }
      ok('nameless incoming entry does not throw', r7err === null, 'threw: ' + r7err);
      ok('nameless incoming entry dropped, Good kept', r7 && r7.length===1 && r7[0].name==='Good', 'got: ' + JSON.stringify(r7));

      // D2: nameless existing entry is silently dropped, not thrown
      var r8err = null, r8 = null;
      try { r8 = mergeHist([{count:1,lastUsed:100}], [{name:'Ok',count:1,lastUsed:50}], {}, []); }
      catch (e) { r8err = e.message; }
      ok('nameless existing entry does not throw', r8err === null, 'threw: ' + r8err);
      ok('nameless existing entry dropped, Ok kept', r8 && r8.length===1 && r8[0].name==='Ok', 'got: ' + JSON.stringify(r8));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
