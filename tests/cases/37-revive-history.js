'use strict';

// v406: bringing an item back from the Done section must feed the list's history
// (count / lastUsed / dates) exactly like typing the name again does (the v342
// rule), so the replenishment clock for often-revived staples actually resets.
// Before v406 only the typed re-add path did this; unticking in Done, the home
// quick-pick, the recipe add and the pasted-list import all revived silently.
//
// Pins:
//   1. reviveWasMisclick() — the pure grace-window guard.
//   2. toggleItem() unticking a done item — count bumps, lastUsed refreshes,
//      today lands in the dates series, a missing entry is created, and a
//      deleted (tombstoned) history entry is resurrected.
//   3. The three things that must NOT bump history: ticking an item done, a
//      repeating task's tick-and-reschedule (done goes false, but on a TICK,
//      not a revive), and a tick immediately undone inside the grace window.
// Dates are asserted against the page's own todayStr() rather than hardcoded.

module.exports = {
  name: '37-revive-history',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function histFor(n){ return (listData[currentList].hist || []).find(function(h){ return h && h.name && h.name.toLowerCase() === n.toLowerCase(); }); }

      var today = todayStr();

      // ── 1: the misclick guard is a pure read of \`updated\` ────────────────
      // Called through a stub so a missing helper fails these four cleanly
      // instead of throwing and skipping the behaviour pins below.
      var hasGuard = typeof reviveWasMisclick === 'function';
      ok('1: the revive misclick guard exists', hasGuard);
      var mis = hasGuard ? reviveWasMisclick : function(){ return null; };
      ok('1a: a long-settled item is not a misclick',
        mis({updated: Date.now() - 5*60*1000}) === false);
      ok('1b: a just-ticked item is a misclick',
        mis({updated: Date.now() - 1000}) === true);
      ok('1c: an item with no updated stamp is not a misclick',
        mis({name:'x'}) === false);
      ok('1d: null-safe', mis(null) === false);

      // ── 2: unticking in Done feeds history ───────────────────────────────
      currentList = 'grocery';
      var old = Date.now() - 10*60*1000; // outside the 60s grace window
      listData.grocery = { items: [
        {id:1, name:'Milk',       catId:'dairy', done:true,  updated:old, added:old},
        {id:2, name:'Blueberries',catId:'fruit', done:true,  updated:old, added:old},
        {id:3, name:'Bread',      catId:'bakery',done:false, updated:old, added:old}
      ], hist: [
        {name:'Milk', catId:'dairy', count:3, lastUsed:old, dates:['2026-01-01']}
      ] };
      renderList();

      toggleItem(1);
      var milk = histFor('Milk');
      ok('2a: revive bumps the existing history count',
        milk && milk.count === 4, 'got: ' + JSON.stringify(milk));
      ok('2b: revive refreshes lastUsed',
        milk && milk.lastUsed > old, 'got: ' + JSON.stringify(milk));
      ok('2c: revive appends today to the date series',
        milk && milk.dates[milk.dates.length-1] === today, 'got: ' + JSON.stringify(milk && milk.dates));
      ok('2d: the item itself came back off the Done section',
        listData.grocery.items.find(function(i){ return i.id === 1; }).done === false);

      // An item with no history entry at all (synced in, or history pruned)
      // gets one on revive rather than staying invisible in the History tab.
      toggleItem(2);
      var bb = histFor('Blueberries');
      ok('2e: revive creates a missing history entry',
        bb && bb.count === 1 && bb.catId === 'fruit' && bb.dates[0] === today,
        'got: ' + JSON.stringify(bb));

      // v323 rule: re-adding revives a deleted history entry. A revive is a
      // re-add, so it must clear the tombstone too.
      deleteHistEntries('grocery', ['bread']);
      ok('2f: precondition — bread is tombstoned and gone from hist',
        !histFor('Bread') && getTombs(histTombKey('grocery'))['bread'] !== undefined);
      listData.grocery.items.find(function(i){ return i.id === 3; }).done = true;
      listData.grocery.items.find(function(i){ return i.id === 3; }).updated = old;
      renderList();
      toggleItem(3);
      ok('2g: revive resurrects a tombstoned history entry',
        !!histFor('Bread') && getTombs(histTombKey('grocery'))['bread'] === undefined,
        'hist: ' + JSON.stringify(histFor('Bread')));

      // ── 3: what must NOT count as a revive ───────────────────────────────
      listData.grocery = { items: [
        {id:10, name:'Eggs', catId:'dairy', done:false, updated:old, added:old}
      ], hist: [ {name:'Eggs', catId:'dairy', count:2, lastUsed:old, dates:['2026-01-01']} ] };
      renderList();

      toggleItem(10); // tick it DONE — not a revive
      ok('3a: ticking an item done leaves history alone',
        histFor('Eggs').count === 2 && histFor('Eggs').lastUsed === old,
        'got: ' + JSON.stringify(histFor('Eggs')));

      toggleItem(10); // untick immediately — inside the grace window, a misclick
      ok('3b: tick-then-untick inside the grace window is not a re-add',
        histFor('Eggs').count === 2 && histFor('Eggs').dates.length === 1,
        'got: ' + JSON.stringify(histFor('Eggs')));
      ok('3c: the misclick still comes back off the Done section',
        listData.grocery.items[0].done === false);

      // A repeating task's tick sets done back to false as part of rescheduling.
      // That is a completion, not a revive, and must not touch history.
      currentList = 'todo';
      listData.todo = { items: [
        {id:20, name:'Bins out', catId:'home', done:false, today:false, repeat:'weekly', dueDate:'2026-07-06', trackLog:null, updated:old}
      ], hist: [ {name:'Bins out', catId:'home', count:5, lastUsed:old, dates:['2026-01-01']} ] };
      renderList();
      toggleItem(20);
      var bins = histFor('Bins out');
      ok('3d: a repeating task\\'s reschedule is not a revive',
        bins.count === 5 && bins.lastUsed === old && bins.dates.length === 1,
        'got: ' + JSON.stringify(bins));
      ok('3e: the repeating task did still reschedule',
        listData.todo.items[0].done === false && listData.todo.items[0].dueDate > todayStr(),
        'got: ' + JSON.stringify(listData.todo.items[0]));

      // ── 4: the typed re-add path (v342) is unchanged ─────────────────────
      currentList = 'grocery';
      listData.grocery = { items: [
        {id:30, name:'Butter', catId:'dairy', done:true, updated:old, added:old}
      ], hist: [ {name:'Butter', catId:'dairy', count:1, lastUsed:old, dates:['2026-01-01']} ] };
      renderList();
      ok('4a: typing a done item\\'s name still returns "restored"',
        addItemToCurrent('Butter', 'dairy', null, null) === 'restored');
      ok('4b: ...and still feeds history',
        histFor('Butter').count === 2 && histFor('Butter').dates[histFor('Butter').dates.length-1] === today,
        'got: ' + JSON.stringify(histFor('Butter')));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
