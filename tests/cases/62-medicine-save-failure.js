'use strict';

// v459: a dose must NEVER be announced as logged when the local save failed.
// Before this version storeSet swallowed the storage error, saveBD ignored it,
// and the medicine handler cleared the form and toasted "Logged" regardless --
// so a parent got an affirmative confirmation for a record that does not
// exist. It was the v457 council review's strongest finding.
//
// Drives the REAL Log button with localStorage.setItem forced to throw a
// quota error, then restores it. Do not "simplify" this by calling saveBD
// directly: the point of the case is the button-to-toast chain, which is where
// the lie lived.

module.exports = {
  name: '62-medicine-save-failure',
  async run(page) {
    const pass = [];
    const fail = [];
    function ok(name, cond, detail) {
      if (cond) pass.push(name);
      else fail.push({ name, detail: detail || 'assertion failed' });
    }

    const r = await page.evaluate(`(function(){
      var bd = getBD(); bd.medicine = []; saveBD(bd);
      switchSection('baby');
      currentBabyView = 'medicine';
      renderBabyView();

      document.getElementById('medName').value  = 'Calpol';
      document.getElementById('medDose').value  = '5ml';
      document.getElementById('medNotes').value = 'test note';

      // No doses logged above, so the interval speed-bump cannot fire and the
      // click goes straight through to the save path.
      var realSet = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function(){
        var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      };
      var threw = null;
      try { document.getElementById('medLogBtn').click(); }
      catch (err) { threw = String(err && err.message); }
      localStorage.setItem = realSet;

      var errEl = document.getElementById('medSaveErr');
      var nameEl = document.getElementById('medName');
      var doseEl = document.getElementById('medDose');
      var notesEl = document.getElementById('medNotes');
      return {
        threw:    threw,
        name:     nameEl  ? nameEl.value  : null,
        dose:     doseEl  ? doseEl.value  : null,
        notes:    notesEl ? notesEl.value : null,
        errShown: !!(errEl && errEl.style.display !== 'none' && errEl.textContent),
        errText:  errEl ? errEl.textContent : '',
        stored:   (getBD().medicine || []).length
      };
    })()`);

    ok('the Log click did not throw', r.threw === null, JSON.stringify(r));
    ok('no medicine record was stored', r.stored === 0, JSON.stringify(r));
    ok('the typed name survived the failed save',  r.name  === 'Calpol',    JSON.stringify(r));
    ok('the typed dose survived the failed save',  r.dose  === '5ml',       JSON.stringify(r));
    ok('the typed notes survived the failed save', r.notes === 'test note', JSON.stringify(r));
    ok('a persistent failure message is shown', r.errShown === true, JSON.stringify(r));
    ok('the failure message says it was NOT logged', /NOT logged/.test(r.errText), JSON.stringify(r));

    // storeSet's contract is what the whole fix rests on.
    const c = await page.evaluate(`(function(){
      var okWrite = storeSet('fl4_v459_probe', {a:1});
      var realSet = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function(){
        var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      };
      var badWrite = storeSet('fl4_v459_probe', {a:2});
      localStorage.setItem = realSet;
      localStorage.removeItem('fl4_v459_probe');
      return { okWrite: okWrite, badWrite: badWrite };
    })()`);

    ok('storeSet returns true when the write lands', c.okWrite === true, JSON.stringify(c));
    ok('storeSet returns false when the write throws', c.badWrite === false, JSON.stringify(c));

    return { pass, fail };
  },
};
