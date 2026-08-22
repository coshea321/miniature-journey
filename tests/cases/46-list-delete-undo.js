'use strict';

// v432: optimistic single-item delete + Undo.
//
// The load-bearing invariant is that NOTHING is written during the ~6s window
// — no tombstone, no save, no push. The item stays canonical in listData and
// is only hidden from the rendered list, so Undo cancels a pending action
// instead of trying to resurrect a record whose tombstone may already have
// reached the other phone. Section 1 pins that directly: if getItems() ever
// starts hiding the pending item, the next tick/clear/reopen writes listData
// back WITHOUT it and the delete becomes real and un-undoable.
//
// Section 3 is a deliberate regression tripwire for the bug this feature was
// designed around. removeItem()/saveCurrentList() bind to `currentList` at
// CALL time, so a deferred commit that ran through them after the user
// switched tabs would tombstone the id in whatever list is now open and never
// delete the real item. The commit must go through removeItemFrom(lt, id)
// with the list key captured when the delete started. If this section fails,
// do NOT relax it — re-check the commit path.

module.exports = {
  name: '46-list-delete-undo',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function tombs(lt){ return getTombs(lt) || {}; }
      function ids(lt){ return (listData[lt].items || []).map(function(i){ return i.id; }); }
      function seed(){
        storeSet('fl4_tomb_grocery', {}); storeSet('fl4_tomb_travel', {});
        listData.grocery = { items: [
          {id:1, name:'Milk',  catId:'dairy',  done:false, updated:1, added:1},
          {id:2, name:'Bread', catId:'bakery', done:false, updated:1, added:1},
          {id:3, name:'Eggs',  catId:'dairy',  done:true,  updated:1, added:1}
        ], hist: [] };
        listData.travel = { items: [
          {id:900, name:'Passport', catId:'other', done:false, updated:1, added:1},
          {id:901, name:'Charger',  catId:'other', done:false, updated:1, added:1}
        ], hist: [] };
        _pendDel = null; clearPendDelTimer(); hideUndoBar();
      }

      // ── 1: during the window, nothing is written ─────────────────────────
      seed();
      currentList = 'grocery';
      renderList();
      startPendDel(1);
      ok('1a: the pending item is STILL in the canonical list (sync must keep seeing it)',
        ids('grocery').indexOf(1) !== -1, 'got: ' + JSON.stringify(ids('grocery')));
      ok('1b: getItems() is unfiltered — callers reassign listData from it',
        getItems().some(function(i){ return i.id === 1; }));
      ok('1c: visibleItems() hides it from the render layer',
        !visibleItems().some(function(i){ return i.id === 1; }),
        'got: ' + JSON.stringify(visibleItems().map(function(i){ return i.id; })));
      ok('1d: no tombstone is written during the window',
        tombs('grocery')[1] === undefined, 'got: ' + JSON.stringify(tombs('grocery')));
      ok('1e: the pending action captured its own list key',
        _pendDel && _pendDel.lt === 'grocery' && _pendDel.id === 1,
        'got: ' + JSON.stringify(_pendDel));
      ok('1f: a timer is armed', _pendDelTimer !== null);
      ok('1g: the other list is untouched', ids('travel').length === 2);
      var bar = document.getElementById('undoBar');
      ok('1h: the Undo snackbar is actually on screen',
        bar && bar.classList.contains('show'));
      ok('1i: it names the item that went',
        document.getElementById('undoBarMsg').textContent === 'Milk deleted',
        'got: ' + document.getElementById('undoBarMsg').textContent);
      ok('1j: the Undo control is a real button with a specific accessible name',
        document.getElementById('undoBarBtn').tagName === 'BUTTON' &&
        document.getElementById('undoBarBtn').getAttribute('aria-label') === 'Undo deletion of Milk',
        'got: ' + document.getElementById('undoBarBtn').getAttribute('aria-label'));

      // ── 2: Undo cancels, writing nothing ────────────────────────────────
      undoPendDel();
      ok('2a: the item is back in the render layer',
        visibleItems().some(function(i){ return i.id === 1; }));
      ok('2b: still no tombstone — there was never a deletion to reverse',
        tombs('grocery')[1] === undefined);
      ok('2c: the pending action is cleared', _pendDel === null && _pendDelTimer === null);
      ok('2c2: the snackbar is dismissed',
        !document.getElementById('undoBar').classList.contains('show'));
      ok('2d: the record kept its original id (so no NEW badge, no new record)',
        listData.grocery.items.find(function(i){ return i.id === 1; }).name === 'Milk');

      // ── 3: REGRESSION — commit lands on the list it STARTED in ──────────
      seed();
      currentList = 'travel';
      renderList();
      startPendDel(900);
      currentList = 'grocery';   // the user navigates away mid-window
      renderList();
      commitPendDel();
      ok('3a: the Travel item is the one actually deleted',
        ids('travel').indexOf(900) === -1, 'got: ' + JSON.stringify(ids('travel')));
      ok('3b: the tombstone is written to TRAVEL',
        tombs('travel')[900] !== undefined, 'got: ' + JSON.stringify(tombs('travel')));
      ok('3c: NO stray tombstone is written to the list that was on screen',
        tombs('grocery')[900] === undefined, 'got: ' + JSON.stringify(tombs('grocery')));
      ok('3d: the on-screen list is untouched',
        ids('grocery').length === 3, 'got: ' + JSON.stringify(ids('grocery')));

      // ── 4: a second delete commits the first ────────────────────────────
      seed();
      currentList = 'grocery';
      renderList();
      startPendDel(1);
      startPendDel(2);
      ok('4a: the first delete was committed for real',
        ids('grocery').indexOf(1) === -1 && tombs('grocery')[1] !== undefined,
        'got items ' + JSON.stringify(ids('grocery')) + ' tombs ' + JSON.stringify(tombs('grocery')));
      ok('4b: the second is now the pending one',
        _pendDel && _pendDel.id === 2, 'got: ' + JSON.stringify(_pendDel));
      ok('4c: the second is still canonical and un-tombstoned',
        ids('grocery').indexOf(2) !== -1 && tombs('grocery')[2] === undefined);

      // ── 5: removeItemFrom is list-explicit on its own ───────────────────
      seed();
      currentList = 'grocery';
      removeItemFrom('travel', 901);
      ok('5a: it deletes from the named list, not the open one',
        ids('travel').indexOf(901) === -1 && ids('grocery').length === 3,
        'travel ' + JSON.stringify(ids('travel')) + ' grocery ' + JSON.stringify(ids('grocery')));
      ok('5b: it tombstones the named list', tombs('travel')[901] !== undefined);
      ok('5c: it leaves the tombstones of the list on screen alone', tombs('grocery')[901] === undefined);

      // ── 6: the timer path really commits ────────────────────────────────
      var realMs = PEND_DEL_MS;
      seed();
      currentList = 'grocery';
      renderList();
      PEND_DEL_MS = 40;
      startPendDel(2);
      return new Promise(function(resolve){
        setTimeout(function(){
          ok('6a: the timeout commits the delete',
            ids('grocery').indexOf(2) === -1, 'got: ' + JSON.stringify(ids('grocery')));
          ok('6b: ...with a tombstone, so it propagates to the other phone',
            tombs('grocery')[2] !== undefined);
          ok('6c: ...and clears the pending state',
            _pendDel === null && _pendDelTimer === null);
          // Leave nothing armed or half-written for later case files.
          PEND_DEL_MS = realMs;
          _pendDel = null; clearPendDelTimer(); hideUndoBar();
          storeSet('fl4_tomb_grocery', {}); storeSet('fl4_tomb_travel', {});
          resolve({pass:pass, fail:fail});
        }, 300);
      });
    })()`);
    return result;
  },
};
