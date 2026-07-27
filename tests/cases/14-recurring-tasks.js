'use strict';

// v361 recurring tasks. Pins three things:
//   1. nextRepeatDue() — the pure schedule-anchored date maths (fixed dates, fully
//      deterministic): strictly-future result, single tick skips all missed periods,
//      ticking EARLY (due date still in the future) always rolls to the NEXT occurrence
//      rather than returning the date unchanged (the pre-merge PR #126 no-op bug),
//      monthly clamps to month end WITHOUT permanently losing the anchor day,
//      no-due-date fallback anchors from today, junk repeat values return null.
//   2. toggleItem() on a repeating item — reschedules in place (same id, done back to
//      false, due date advanced, `updated` stamped), clears the ★ today flag, still
//      fires the v357 Track auto-log, survives a stale-partner merge, and leaves
//      non-repeating items' tick behaviour untouched.
//   3. updateRepeatSelState() — the repeat picker is disabled and reset while the due
//      date input is empty, enabled once a date is set.
// toggleItem uses the real todayStr(), so part 2 asserts against nextRepeatDue()
// computed in-page with the same inputs rather than against hardcoded dates.

module.exports = {
  name: '14-recurring-tasks',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── 1: nextRepeatDue pure-function pins (2026-07-20 and -27 are Mondays) ──
      ok('1a: weekly keeps the schedule anchor (Mon task ticked Wed -> next Mon)',
        nextRepeatDue('weekly', '2026-07-20', '2026-07-22') === '2026-07-27',
        'got: ' + nextRepeatDue('weekly', '2026-07-20', '2026-07-22'));
      ok('1b: weeks-overdue weekly needs ONE tick, lands on next future anchor',
        nextRepeatDue('weekly', '2026-07-06', '2026-07-22') === '2026-07-27',
        'got: ' + nextRepeatDue('weekly', '2026-07-06', '2026-07-22'));
      ok('1c: due today -> strictly future (daily)',
        nextRepeatDue('daily', '2026-07-27', '2026-07-27') === '2026-07-28',
        'got: ' + nextRepeatDue('daily', '2026-07-27', '2026-07-27'));
      ok('1d: biweekly steps 14 days',
        nextRepeatDue('biweekly', '2026-07-14', '2026-07-15') === '2026-07-28',
        'got: ' + nextRepeatDue('biweekly', '2026-07-14', '2026-07-15'));
      ok('1e: monthly clamps Jan 31 -> Feb 28',
        nextRepeatDue('monthly', '2026-01-31', '2026-02-01') === '2026-02-28',
        'got: ' + nextRepeatDue('monthly', '2026-01-31', '2026-02-01'));
      ok('1f: monthly recovers the 31st anchor after a short month',
        nextRepeatDue('monthly', '2026-01-31', '2026-03-01') === '2026-03-31',
        'got: ' + nextRepeatDue('monthly', '2026-01-31', '2026-03-01'));
      ok('1g: monthly crosses a year boundary',
        nextRepeatDue('monthly', '2025-12-15', '2026-01-01') === '2026-01-15',
        'got: ' + nextRepeatDue('monthly', '2025-12-15', '2026-01-01'));
      ok('1h: no due date anchors from today',
        nextRepeatDue('weekly', null, '2026-07-22') === '2026-07-29',
        'got: ' + nextRepeatDue('weekly', null, '2026-07-22'));
      ok('1i: unknown repeat value returns null',
        nextRepeatDue('fortnightly', '2026-07-20', '2026-07-22') === null,
        'got: ' + nextRepeatDue('fortnightly', '2026-07-20', '2026-07-22'));
      ok('1j: malformed today returns null',
        nextRepeatDue('weekly', '2026-07-20', 'not-a-date') === null,
        'got: ' + nextRepeatDue('weekly', '2026-07-20', 'not-a-date'));
      ok('1k: EARLY tick (due still in the future) rolls to the occurrence AFTER it, never a no-op',
        nextRepeatDue('weekly', '2026-07-27', '2026-07-22') === '2026-08-03',
        'got: ' + nextRepeatDue('weekly', '2026-07-27', '2026-07-22'));
      ok('1l: early tick, monthly',
        nextRepeatDue('monthly', '2026-08-15', '2026-07-22') === '2026-09-15',
        'got: ' + nextRepeatDue('monthly', '2026-08-15', '2026-07-22'));

      // ── 2: toggleItem reschedules a repeating task in place ──────────────
      currentList = 'todo';
      listData.todo = { items: [
        {id:1, name:'Bins out',  catId:'home', done:false, today:true,  repeat:'weekly', dueDate:'2026-07-06', trackLog:null, updated:100},
        {id:2, name:'One-off',   catId:'home', done:false, today:false, repeat:null,     dueDate:null,         trackLog:null, updated:100}
      ], hist: [] };
      renderList();
      var expectedDue = nextRepeatDue('weekly', '2026-07-06', todayStr());
      toggleItem(1);
      var rep = listData.todo.items.find(function(i){ return i.id === 1; });
      ok('2a: repeating item comes back not-done', rep && rep.done === false, 'got: ' + JSON.stringify(rep));
      ok('2b: due date advanced to the expected future anchor',
        rep && rep.dueDate === expectedDue && rep.dueDate > todayStr(),
        'expected ' + expectedDue + ', got: ' + (rep && rep.dueDate));
      ok('2c: tick stamps updated and clears the today star',
        rep && rep.updated > 100 && rep.today === false, 'got: ' + JSON.stringify(rep));

      var staleRemote = [{id:1, name:'Bins out', catId:'home', done:false, today:true, repeat:'weekly', dueDate:'2026-07-06', trackLog:null, updated:100}];
      var merged = mergeListItems([rep], staleRemote, {});
      var w = merged.items.find(function(i){ return i.id === 1; });
      ok('2d: reschedule survives a stale-partner merge',
        w && w.dueDate === expectedDue && w.done === false, 'got: ' + JSON.stringify(w));

      toggleItem(2);
      var oneOff = listData.todo.items.find(function(i){ return i.id === 2; });
      ok('2e: non-repeating item still just completes', oneOff && oneOff.done === true, 'got: ' + JSON.stringify(oneOff));

      // 2f: ticking a repeating item whose due date is ALREADY in the future advances a full
      // period past it (the "only goes to the next date" bug: two quick ticks must give two
      // different future dates, not the same one twice).
      var fut1 = nextRepeatDue('weekly', todayStr(), todayStr());
      listData.todo.items.push({id:5, name:'Future-due', catId:'home', done:false, today:false, repeat:'weekly', dueDate:fut1, trackLog:null, updated:100});
      renderList();
      toggleItem(5);
      var futItem = listData.todo.items.find(function(i){ return i.id === 5; });
      ok('2f: early tick advances past the future due date',
        futItem && futItem.done === false && futItem.dueDate === nextRepeatDue('weekly', fut1, todayStr()) && futItem.dueDate > fut1,
        'due was ' + fut1 + ', got: ' + JSON.stringify(futItem));

      // ── 3: repeat + trackLog — the tick logs to Track, then reschedules ──
      listData.todo = { items: [
        {id:3, name:'Water plants', catId:'home', done:false, today:false, repeat:'daily', dueDate:null, trackLog:true, updated:100}
      ], hist: [] };
      renderList();
      var logBefore = getActionLog().length;
      toggleItem(3);
      var wp = listData.todo.items.find(function(i){ return i.id === 3; });
      var logAfter = getActionLog();
      ok('3a: Track auto-log still fires on the tick',
        logAfter.length === logBefore + 1 && /Water plants/.test(logAfter[0] && logAfter[0].text),
        'len ' + logBefore + ' -> ' + logAfter.length + ', head: ' + JSON.stringify(logAfter[0]));
      ok('3b: item rescheduled, not done, due strictly after today',
        wp && wp.done === false && wp.dueDate === nextRepeatDue('daily', null, todayStr()),
        'got: ' + JSON.stringify(wp));

      // ── 4: repeat picker gated on the due date being set ─────────────────
      var dueEl = document.getElementById('itemSheetDueInput');
      var selEl = document.getElementById('itemSheetRepeatSelect');
      dueEl.value = ''; selEl.value = 'weekly';
      updateRepeatSelState();
      ok('4a: no due date -> picker disabled and reset to no-repeat',
        selEl.disabled === true && selEl.value === '', 'disabled=' + selEl.disabled + ' value=' + selEl.value);
      dueEl.value = '2026-08-03';
      updateRepeatSelState();
      ok('4b: due date set -> picker enabled', selEl.disabled === false, 'disabled=' + selEl.disabled);

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
