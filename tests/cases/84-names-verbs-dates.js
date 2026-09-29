'use strict';

// v498: item 4 of the 28/09/2026 minimal-UI review, as Cathal confirmed it.
// One name per thing ("To-do", not "General"; "Health", not "Medical
// history"), one verb per kind of button ("Log" records, "Save" in editors),
// and one date format for list/history rows through listDate(): "28 Sep" this
// year, "28 Sep 2025" otherwise.
module.exports = {
  name: '84-names-verbs-dates',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var y = new Date().getFullYear();

      // ── listDate ─────────────────────────────────────────────
      ok('an ISO date this year reads "28 Sep"', listDate(y + '-09-28') === '28 Sep', listDate(y + '-09-28'));
      ok('an ISO date in another year keeps its year', listDate('2025-09-28') === '28 Sep 2025', listDate('2025-09-28'));
      ok('an ISO date is read as a local day, not shifted by UTC', listDate('2020-01-01') === '1 Jan 2020', listDate('2020-01-01'));
      ok('a timestamp works', listDate(new Date(y, 2, 5, 23, 30).getTime()) === '5 Mar');
      ok('a Date works', listDate(new Date(2019, 11, 31)) === '31 Dec 2019');
      ok('months are fixed short names, never "Sept"', listDate(y + '-09-01').indexOf('Sept') === -1);
      ok('unreadable input gives ""', listDate('') === '' && listDate('12/03/2099') === '' && listDate(null) === '' && listDate(0) === '');
      ok('the Watchlist keeps its format through the shared helper', watchDateText(new Date(2024, 3, 7).getTime()) === '7 Apr 2024');
      ok('Health dates use it (was DD/MM/YYYY)', healthDMY('2020-09-19') === '19 Sep 2020', healthDMY('2020-09-19'));
      ok('a non-date Health value is still escaped, not dropped', healthDMY('<b>') === '&lt;b&gt;');

      // Baby growth rows used to print the raw ISO string.
      var bd = getBD(), savedGrowth = bd.growth;
      bd.growth = [{ date: '2025-02-03', weight: 5.2 }]; saveBD(bd);
      switchSection('baby'); currentBabyView = 'growth'; renderBabyView();
      var gtxt = (document.getElementById('babyGrowthView') || document.body).textContent;
      ok('a growth row shows "3 Feb 2025", not 2025-02-03', gtxt.indexOf('3 Feb 2025') !== -1 && gtxt.indexOf('2025-02-03') === -1);
      var bd2 = getBD(); bd2.growth = savedGrowth; saveBD(bd2);

      // ── Names ───────────────────────────────────────────────
      var tab = document.querySelector('.type-btn[data-lt="todo"]');
      ok('the Lists tab reads To-do', tab && tab.textContent.indexOf('To-do') !== -1 && tab.textContent.indexOf('General') === -1);
      ok('LIST_TYPES names the list To-do', LIST_TYPES.todo.name.indexOf('To-do') !== -1);
      switchSection('health');
      ok('the Health screen is titled Health', document.getElementById('appTitle').textContent.indexOf('Health') !== -1 && document.getElementById('appTitle').textContent.indexOf('Medical history') === -1);

      // ── Verbs ───────────────────────────────────────────────
      function label(id){ var e = document.getElementById(id); return e ? e.textContent.trim() : null; }
      ok('BP button reads Log', label('bpLogBtn') === 'Log', label('bpLogBtn'));
      ok('cardio button reads Log', label('cardioLogBtn') === 'Log', label('cardioLogBtn'));
      ok('food journal button reads Log', label('foodAddBtn') === 'Log', label('foodAddBtn'));

      switchSection('home');
      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
