'use strict';

// Bottom-nav "More" overflow (v452). The bar carries at most NAV_BAR_MAX (5)
// sections; anything past that moves into the More sheet. Covers the counting
// rule (all bar icons, including the three that have no Settings toggle), the
// button appearing/disappearing on the threshold, the sheet listing exactly the
// overflow, a row navigating for real, and the More highlight following the
// overflow section. Restores sectionVisible before it returns.
module.exports = {
  name: '59-nav-more',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var saved = JSON.parse(JSON.stringify(sectionVisible));
      function setVisible(on){
        HIDEABLE_SECTIONS.forEach(function(s){ sectionVisible[s] = on.indexOf(s) !== -1; });
        applySectionVisibility();
      }
      function barIds(){
        return Array.prototype.slice.call(document.querySelectorAll('.bottom-nav .bn-btn'))
          .filter(function(b){ return b.style.display !== 'none'; })
          .map(function(b){ return b.id; });
      }
      var more = document.getElementById('bnMore');

      // ── Counting includes the three always-on sections ───────────────────
      // lists, recipes and baby have no Settings toggle, so a rule that only
      // counted HIDEABLE_SECTIONS would leave the bar wider, not narrower.
      ok('lists/recipes/baby count as on the bar', navSectionOn('lists') && navSectionOn('recipes') && navSectionOn('baby'),
        'navSectionOn said one of them is off');

      // ── Under the threshold: no More button ──────────────────────────────
      // lists + recipes + baby are always on, so two toggles makes five.
      setVisible(['home', 'trips']);
      ok('five sections on the bar hides the More button', more.style.display === 'none', 'display: ' + more.style.display);
      ok('nothing overflows at five', navOverflow.length === 0, 'overflow: ' + navOverflow.join(','));
      ok('all five stay on the bar', barIds().length === 5, 'bar: ' + barIds().join(','));

      // ── One more section tips it over ────────────────────────────────────
      setVisible(['home', 'trips', 'track']);
      ok('a sixth section shows the More button', more.style.display !== 'none', 'display: ' + more.style.display);
      ok('the bar keeps five sections plus More', barIds().length === 6 && barIds()[5] === 'bnMore', 'bar: ' + barIds().join(','));
      ok('exactly the section past the fifth overflows', navOverflow.length === 1 && navOverflow[0] === 'track',
        'overflow: ' + navOverflow.join(','));
      ok('an overflowed section is off the bar', barIds().indexOf('bnTrack') === -1, 'bar: ' + barIds().join(','));

      // Overflow is DOM order, not toggle order.
      setVisible(['home', 'trips', 'track', 'watch', 'health']);
      ok('overflow is taken in bar order', navOverflow.join(',') === 'track,watch,health', 'overflow: ' + navOverflow.join(','));
      ok('the bar is still five plus More', barIds().join(',') === 'bnHome,bnLife,bnRecipes,bnBaby,bnTrips,bnMore', 'bar: ' + barIds().join(','));

      // ── The sheet lists exactly the overflow ─────────────────────────────
      more.click();
      ok('tapping More opens the sheet', document.getElementById('moreOverlay').classList.contains('open'), 'overlay not open');
      var rows = Array.prototype.slice.call(document.querySelectorAll('#moreList .more-row'));
      ok('one row per overflow section', rows.length === navOverflow.length, 'rows: ' + rows.length + ' overflow: ' + navOverflow.length);
      ok('rows carry the overflow sections in order',
        rows.map(function(r){ return r.dataset.sec; }).join(',') === navOverflow.join(','),
        'rows: ' + rows.map(function(r){ return r.dataset.sec; }).join(','));
      ok('a row is labelled from the nav button it stands for',
        rows[0] && rows[0].textContent.indexOf('Track') !== -1, 'first row: ' + (rows[0] ? rows[0].textContent : 'none'));

      // ── A row navigates for real, and closes the sheet ───────────────────
      switchSection('home');
      rows[1].click(); // watch
      ok('tapping a row opens that section', currentSection === 'watch', 'got: ' + currentSection);
      ok('tapping a row closes the sheet', !document.getElementById('moreOverlay').classList.contains('open'), 'overlay still open');

      // ── The More button carries the highlight for overflow sections ──────
      ok('More is highlighted while an overflow section is open', more.className.indexOf('more-active') !== -1, 'class: ' + more.className);
      switchSection('home');
      ok('More is not highlighted on a bar section', more.className.indexOf('more-active') === -1, 'class: ' + more.className);

      // ── Turning sections back off empties the sheet ──────────────────────
      setVisible(['home', 'trips']);
      ok('dropping back to five hides More again', more.style.display === 'none', 'display: ' + more.style.display);
      ok('and clears the overflow', navOverflow.length === 0, 'overflow: ' + navOverflow.join(','));

      HIDEABLE_SECTIONS.forEach(function(s){ sectionVisible[s] = saved[s]; });
      applySectionVisibility();
      switchSection('home');
      return { pass: pass, fail: fail };
    })()`);
    return result;
  },
};
