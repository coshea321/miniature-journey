'use strict';

module.exports = {
  name: '04-merge-baby',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // mergeBabyData: medicine per-id newest-wins, tombstone respected,
      // re-log-after-delete survives, and the v296 generic key carry-through.
      // v371: growth (date-keyed) and milestones (id-keyed) get the same
      // per-entry newest-wins + tombstone treatment as medicine.
      var local = {
        babySex: 'boy',
        growth: [
          {date:'2026-01-01', weight:8, updated:100},
          {date:'2026-02-01', weight:9, updated:400},
          {date:'2026-03-01', weight:9.5, updated:200}
        ],
        medicine: [
          {id:1, name:'Calpol', updated:100},
          {id:2, name:'ToBeDeleted', updated:400},
          {id:3, name:'ReLogged', updated:200}
        ],
        milestones: [
          {id:10, text:'First steps', updated:100},
          {id:20, text:'ToBeDeleted', updated:400},
          {id:30, text:'ReLogged', updated:200}
        ],
        teeth: {}, bottles: {}
      };
      var remote = {
        growth: [{date:'2026-01-01', weight:8.2, updated:200}],
        medicine: [{id:1, name:'CalpolUpdated', updated:200}],
        milestones: [{id:10, text:'First steps!', updated:200}],
        teeth: {}, bottles: {}
      };
      var medTombs = {2:500, 3:100};
      var growthTombs = {'2026-02-01':500, '2026-03-01':100};
      var msTombs = {20:500, 30:100};
      var merged = mergeBabyData(local, remote, medTombs, growthTombs, msTombs);

      ok('v296 carry-through: babySex survives (local-only key)', merged.babySex === 'boy', 'got: ' + merged.babySex);
      var m1 = merged.medicine.find(function(m){return m.id===1;});
      ok('medicine per-id newest-wins', m1 && m1.name === 'CalpolUpdated', 'got: ' + JSON.stringify(m1));
      ok('medicine tombstone respected', !merged.medicine.some(function(m){return m.id===2;}), 'got: ' + JSON.stringify(merged.medicine));
      ok('re-log after delete survives (tomb older than update)', merged.medicine.some(function(m){return m.id===3;}), 'got: ' + JSON.stringify(merged.medicine));

      var g1 = merged.growth.find(function(g){return g.date==='2026-01-01';});
      ok('growth per-date newest-wins', g1 && g1.weight === 8.2, 'got: ' + JSON.stringify(g1));
      ok('growth tombstone respected', !merged.growth.some(function(g){return g.date==='2026-02-01';}), 'got: ' + JSON.stringify(merged.growth));
      ok('growth re-log after delete survives (tomb older than update)', merged.growth.some(function(g){return g.date==='2026-03-01';}), 'got: ' + JSON.stringify(merged.growth));

      var ms1 = merged.milestones.find(function(m){return m.id===10;});
      ok('milestones per-id newest-wins', ms1 && ms1.text === 'First steps!', 'got: ' + JSON.stringify(ms1));
      ok('milestones tombstone respected', !merged.milestones.some(function(m){return m.id===20;}), 'got: ' + JSON.stringify(merged.milestones));
      ok('milestones re-log after delete survives (tomb older than update)', merged.milestones.some(function(m){return m.id===30;}), 'got: ' + JSON.stringify(merged.milestones));

      // mergeNotes: id-union, newest-wins by updatedAt||id, tombstone filtered
      var nLocal = [{id:1,text:'A',updatedAt:100}, {id:2,text:'onlyLocal',updatedAt:100}, {id:4,text:'Gone',updatedAt:100}];
      var nIncoming = [{id:1,text:'B',updatedAt:200}, {id:3,text:'onlyRemote',updatedAt:100}];
      var nTombs = {4:150};
      var nMerged = mergeNotes(nLocal, nIncoming, nTombs);
      var n1 = nMerged.notes.find(function(n){return n.id===1;});
      ok('notes newest-wins by updatedAt', n1 && n1.text==='B', 'got: ' + JSON.stringify(n1));
      ok('notes id-union keeps both sides', nMerged.notes.some(function(n){return n.id===2;}) && nMerged.notes.some(function(n){return n.id===3;}),
        'got: ' + JSON.stringify(nMerged.notes));
      ok('notes tombstone filtered', !nMerged.notes.some(function(n){return n.id===4;}), 'got: ' + JSON.stringify(nMerged.notes));

      // mergeBottles: per-key newest-wins by updated, tie -> remote (b)
      var bMerged1 = mergeBottles({calpol:{updated:100,val:'a'}}, {calpol:{updated:200,val:'b'}});
      ok('bottles newest-wins', bMerged1.calpol.val === 'b', 'got: ' + JSON.stringify(bMerged1));
      var bMerged2 = mergeBottles({x:{updated:100,val:'localTie'}}, {x:{updated:100,val:'remoteTie'}});
      ok('bottles tie goes to remote', bMerged2.x.val === 'remoteTie', 'got: ' + JSON.stringify(bMerged2));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
