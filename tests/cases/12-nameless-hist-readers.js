'use strict';

// Bug-review fix-queue batch E (finding 4): a hist entry with no `name`
// (corrupted localStorage write, quota truncation, a partially-applied
// merge) crashed five readers that call `.name.toLowerCase()` unguarded.
// v350's D2 decision (a corrupt entry must never throw) only reached
// mergeHist and capHistToLiveLimit. Fix: the same `if (!h || !h.name)`
// skip at deleteHistEntries, showAC, addToHist, renderHistory,
// addToHistFor — extends 03-merge-hist's nameless-entry pattern to the
// remaining readers.

module.exports = {
  name: '12-nameless-hist-readers',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function noThrow(name, fn){
        try { fn(); pass.push(name); }
        catch (e) { fail.push({name:name, detail:'threw: ' + e.message}); }
      }

      currentList = 'grocery';
      listData.grocery = { items: [{id:1,name:'Bananas',catId:'other',done:false}],
        hist: [{name:'Good',count:1,lastUsed:100}, {count:1,lastUsed:50}] };

      noThrow('showAC does not throw with a nameless hist entry', function(){ showAC('go'); });

      noThrow('addToHist does not throw with a nameless hist entry', function(){ addToHist('Good', 'other'); });
      var afterAdd = listData.grocery.hist.find(function(h){ return h.name === 'Good'; });
      ok('addToHist still updates the matched entry', afterAdd && afterAdd.count === 2, 'got: ' + JSON.stringify(afterAdd));

      noThrow('renderHistory does not throw with a nameless hist entry', function(){ renderHistory(); });
      var histHtml = document.getElementById('historyContent').innerHTML;
      ok('renderHistory drops the nameless entry, keeps the named one', histHtml.indexOf('Good') !== -1, 'html: ' + histHtml.slice(0,200));

      listData.todo = { items: [], hist: [{name:'Task',count:1,lastUsed:100}, {count:1,lastUsed:50}] };
      noThrow('addToHistFor does not throw with a nameless hist entry', function(){ addToHistFor('todo', 'Task', 'other'); });

      listData.grocery.hist = [{name:'Good',count:1,lastUsed:100}, {count:1,lastUsed:50}, {name:'Bad',count:1,lastUsed:90}];
      noThrow('deleteHistEntries does not throw with a nameless hist entry', function(){ deleteHistEntries('grocery', ['bad']); });
      ok('deleteHistEntries removed the targeted name and dropped the nameless entry',
        listData.grocery.hist.length === 1 && listData.grocery.hist[0].name === 'Good',
        'got: ' + JSON.stringify(listData.grocery.hist));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
