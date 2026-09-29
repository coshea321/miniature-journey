'use strict';

// v494: item 5 of the 28/09/2026 minimal-UI review. Home's `+ Medicine` used
// to open a free-text quick-add that logged a name-only Baby medicine entry
// (no dose, no Calpol/Nurofen buttons, no interval advisory, and a "Logged"
// toast even when the save failed). It now opens Baby -> Medicine, the full
// log form, exactly like the Last medicine card, and writes nothing itself.
module.exports = {
  name: '81-home-medicine-route',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      switchSection('home');
      currentBabyView = 'growth';
      var before = JSON.stringify((getBD().medicine) || []);

      document.getElementById('hqMed').click();

      ok('+ Medicine lands on the Baby section', currentSection === 'baby', 'got: ' + currentSection);
      ok('+ Medicine opens the Medicine tab, not the last-open Baby tab', currentBabyView === 'medicine', 'got: ' + currentBabyView);
      ok('the Home quick-add panel did not open', document.getElementById('homeQuickPanel').style.display !== 'block');
      var name = document.getElementById('medName');
      ok('the full medicine log form is showing', !!name && name.offsetParent !== null);
      ok('no field is focused, so the keyboard does not cover the dose buttons',
        !document.activeElement || document.activeElement.tagName !== 'INPUT', 'focused: ' + (document.activeElement && document.activeElement.id));
      ok('nothing was logged by tapping + Medicine', JSON.stringify((getBD().medicine) || []) === before);

      switchSection('home');
      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
