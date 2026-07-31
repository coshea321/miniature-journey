'use strict';

// v371: milestones (id-keyed) get the same per-entry sync hardening as
// medicine (v329) and growth (this version) — an `updated` stamp at every
// write site plus an `fl4_tomb_ms` deletion tombstone, so a deleted
// milestone can't resurrect from a partner's stale copy and concurrent
// edits resolve by recency instead of push order. The merge algorithm
// itself is pinned in 04-merge-baby.js; this file pins the real UI write
// sites (add / delete / date-edit) actually stamp and tombstone correctly.

module.exports = {
  name: '21-baby-milestone-sync',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var bd = getBD();
      bd.milestones = [];
      saveBD(bd);
      switchSection('baby');
      currentBabyView = 'milestones';
      renderBabyView();

      // ── Add: a new milestone is stamped ──
      document.getElementById('msText').value = 'First smile';
      document.getElementById('msDate').value = '2026-02-01';
      document.getElementById('msLogBtn').click();
      var added = getBD().milestones.find(function(m){ return m.text === 'First smile'; });
      ok('add: milestone created', !!added, 'got: ' + JSON.stringify(getBD().milestones));
      ok('add: milestone stamped with updated', added && typeof added.updated === 'number', 'got: ' + JSON.stringify(added));

      // ── Date-edit: same id, so no tombstone, but re-stamped ──
      var origUpdated = added.updated;
      var trigger = document.querySelector('.ms-date-edit[data-msid="' + added.id + '"]');
      trigger.click();
      var picker = trigger.closest('.ms-row').querySelector('.ms-dt-edit');
      picker.querySelector('input').value = '2026-02-02';
      picker.querySelector('._msSave').click();
      var afterDateEdit = getBD().milestones.find(function(m){ return m.id === added.id; });
      ok('date-edit: date applied', afterDateEdit && afterDateEdit.date === '2026-02-02', 'got: ' + JSON.stringify(afterDateEdit));
      ok('date-edit: re-stamped', afterDateEdit && afterDateEdit.updated >= origUpdated, 'got: ' + JSON.stringify(afterDateEdit));
      ok('date-edit: id-keyed, so no tombstone written', getTombs('ms')[added.id] == null, 'got: ' + JSON.stringify(getTombs('ms')));

      // ── Delete: writes a tombstone keyed by id ──
      var delBtn = document.querySelector('.ms-del-btn[data-msid="' + added.id + '"]');
      delBtn.click();
      document.getElementById('_cfYes').click();
      var afterDelete = getBD().milestones;
      ok('delete: milestone removed', !afterDelete.some(function(m){ return m.id === added.id; }), 'got: ' + JSON.stringify(afterDelete));
      ok('delete: tombstoned by id', getTombs('ms')[added.id] != null, 'got: ' + JSON.stringify(getTombs('ms')));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
