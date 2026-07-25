'use strict';

module.exports = {
  name: '02-merge-lists',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // Union preserves adds from both sides
      var r1 = mergeListItems([{id:1,name:'A',updated:100}], [{id:2,name:'B',updated:100}], {});
      ok('union preserves both sides', r1.items.some(function(i){return i.id===1;}) && r1.items.some(function(i){return i.id===2;}),
        'items: ' + JSON.stringify(r1.items));

      // Per-id newest-wins by updated (incoming newer)
      var r2 = mergeListItems([{id:3,name:'old',updated:100}], [{id:3,name:'new',updated:200}], {});
      var w2 = r2.items.find(function(i){return i.id===3;});
      ok('newest-wins: incoming newer', w2 && w2.name === 'new', 'got: ' + JSON.stringify(w2));

      // Per-id newest-wins by updated (local newer) + push flag true
      var r3 = mergeListItems([{id:4,name:'newLocal',updated:300}], [{id:4,name:'oldRemote',updated:100}], {});
      var w3 = r3.items.find(function(i){return i.id===4;});
      ok('newest-wins: local newer', w3 && w3.name === 'newLocal', 'got: ' + JSON.stringify(w3));
      ok('push true when local newer than remote', r3.push === true, 'push=' + r3.push);

      // Tombstone at/after updated drops the item
      var r4 = mergeListItems([{id:5,name:'X',updated:100}], [], {5:150});
      ok('tombstone at/after updated drops item', !r4.items.some(function(i){return i.id===5;}), 'items: ' + JSON.stringify(r4.items));

      // Re-add with fresher updated survives the older tombstone
      var r5 = mergeListItems([{id:5,name:'X2',updated:200}], [], {5:150});
      ok('re-add with fresher updated survives', r5.items.some(function(i){return i.id===5 && i.name==='X2';}), 'items: ' + JSON.stringify(r5.items));

      // push flag true when local has an item remote lacks entirely
      var r6 = mergeListItems([{id:6,name:'OnlyLocal',updated:100}], [], {});
      ok('push true when remote lacks item', r6.push === true, 'push=' + r6.push);

      // null entries tolerated, no throw
      var r7 = mergeListItems([null, {id:7,name:'ok',updated:100}], [null], {});
      ok('null entries tolerated', r7.items.some(function(i){return i.id===7;}), 'items: ' + JSON.stringify(r7.items));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
