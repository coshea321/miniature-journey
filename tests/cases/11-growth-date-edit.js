'use strict';

// Bug-review fix-queue batch D (finding 3): the growth inline date-edit had
// no collision check, so editing a record's date onto an already-used date
// created two rows for one date; delete then filtered BY DATE, so deleting
// either of the pair deleted both. Fix: refuse the edit with a toast on
// collision, and delete by raw array index (via a per-row data-gidx) so a
// pre-existing duplicate can be cleaned up one row at a time.

module.exports = {
  name: '11-growth-date-edit',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var bd = getBD();
      bd.growth = [
        {date:'2026-01-01', weight:8.0, height:70, note:null},
        {date:'2026-01-05', weight:8.2, height:71, note:null}
      ];
      saveBD(bd);
      switchSection('baby');
      currentBabyView = 'growth';
      renderBabyView();

      // ── Refuse-on-collision: editing 01-05 onto the existing 01-01 date ──
      var rows = document.querySelectorAll('.growth-edit-trigger');
      var trigger0501 = Array.prototype.filter.call(rows, function(s){ return s.dataset.growthdate === '2026-01-05'; })[0];
      trigger0501.click();
      var row0501 = trigger0501.closest('.growth-row');
      row0501.querySelector('._geDate').value = '2026-01-01';
      row0501.querySelector('._geSave').click();

      var afterCollision = getBD().growth;
      ok('collision refused: still 2 records', afterCollision.length === 2, 'got: ' + JSON.stringify(afterCollision));
      ok('collision refused: 01-05 record untouched', afterCollision.some(function(r){ return r.date === '2026-01-05' && r.weight === 8.2; }),
        'got: ' + JSON.stringify(afterCollision));
      ok('collision refused: edit sheet stays open', !!row0501.querySelector('._geSave'), 'edit sheet closed unexpectedly');

      // ── Non-colliding edit still works ──
      row0501.querySelector('._geDate').value = '2026-01-06';
      row0501.querySelector('._geSave').click();
      var afterEdit = getBD().growth;
      ok('non-colliding edit applies', afterEdit.some(function(r){ return r.date === '2026-01-06' && r.weight === 8.2; }),
        'got: ' + JSON.stringify(afterEdit));
      ok('non-colliding edit: still 2 records', afterEdit.length === 2, 'got: ' + JSON.stringify(afterEdit));

      // ── Single-record delete: seed a duplicate-date pair, delete one, keep the other ──
      var bd2 = getBD();
      bd2.growth = [
        {date:'2026-02-01', weight:9.0, height:73, note:'first'},
        {date:'2026-02-01', weight:9.1, height:74, note:'second'},
        {date:'2026-02-10', weight:9.3, height:75, note:null}
      ];
      saveBD(bd2);
      renderGrowth();

      var delBtns = document.querySelectorAll('.growth-del-btn');
      var targetBtn = Array.prototype.filter.call(delBtns, function(b){
        var idx = parseInt(b.dataset.gidx, 10);
        return bd2.growth[idx] && bd2.growth[idx].note === 'first';
      })[0];
      targetBtn.click();
      document.getElementById('_cfYes').click();

      var afterDelete = getBD().growth;
      ok('single-record delete: exactly one record removed', afterDelete.length === 2, 'got: ' + JSON.stringify(afterDelete));
      ok('single-record delete: the OTHER duplicate survives', afterDelete.some(function(r){ return r.date === '2026-02-01' && r.note === 'second'; }),
        'got: ' + JSON.stringify(afterDelete));
      ok('single-record delete: unrelated record untouched', afterDelete.some(function(r){ return r.date === '2026-02-10'; }),
        'got: ' + JSON.stringify(afterDelete));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
