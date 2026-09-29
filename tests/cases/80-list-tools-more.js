'use strict';

// v493: the 28/09/2026 minimal-UI review's "What to remove" item. Lists'
// rare Print and Import list buttons moved behind one "⋯" button under the
// add bar. They keep their ids and click handlers; ⋯ only shows/hides them,
// and using either one hides them again.
module.exports = {
  name: '80-list-tools-more',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var more = document.getElementById('listMoreBtn');
      var box = document.getElementById('listMoreItems');
      var print = document.getElementById('printLink');
      var imp = document.getElementById('importLink');
      ok('the ⋯ button and its tools box exist', !!more && !!box);
      ok('Print and Import list live inside the ⋯ box', !!print && !!imp && box.contains(print) && box.contains(imp));
      ok('the tools start hidden', box.style.display === 'none' && more.getAttribute('aria-expanded') === 'false');

      more.click();
      ok('⋯ shows Print and Import list', box.style.display !== 'none' && more.getAttribute('aria-expanded') === 'true');
      more.click();
      ok('a second ⋯ tap hides them again', box.style.display === 'none' && more.getAttribute('aria-expanded') === 'false');

      var savedList = currentList;
      currentList = 'grocery';
      more.click();
      imp.click();
      ok('Import list still opens the import sheet', document.getElementById('importSheet').style.display === 'block');
      ok('using Import list hides the ⋯ tools', box.style.display === 'none' && more.getAttribute('aria-expanded') === 'false');
      closeImport();
      currentList = savedList;

      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
