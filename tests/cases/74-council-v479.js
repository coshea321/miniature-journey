'use strict';

// v479 — the four fixes Cathal confirmed from the v478 council review
// (HEARTH-council-review-v478.md, answered 22/09/2026):
//   1. Hips & Lower Back carries its caution note again. It was written in
//      v475 and reverted with the cues in 1412675; YOGA_TRAIN_NOTES[1] had gone
//      back to ''. The note is not a pose change, and it must not go silent
//      again while the flow is still un-re-tuned.
//   2. A failed medicine save says it is HEARTH'S storage, and tells him to
//      write the dose down. The old text sent him to free phone space, which
//      does not touch the browser quota.
//   3. Bag names/ids are escaped wherever the Bags view writes them into HTML,
//      including the "Unpack everything in …" confirm (confirmDialog uses
//      innerHTML).
//   4. The Knee Programme's each-leg strength moves say "Each leg" at Basic.
//      Basic only — Full keeps its "Set N of M" line.

module.exports = {
  name: '74-council-v479',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── 1. the Hips & Lower Back note ──────────────────────────────────
      var n1 = String(YOGA_TRAIN_NOTES[1] || '');
      ok('TRIPWIRE: Hips & Lower Back has a caution note again', n1.length > 200, n1.slice(0, 80));
      // v481 re-tuned the flow and rewrote this note (76-hips-retune.js pins
      // the new wording); what must survive is that it stays honest about it.
      ok('it says the flow is re-tuned, and NOT physio-checked', /Re-tuned 22\\/09\\/2026/.test(n1) && /NOT been checked by a physio/.test(n1));
      ok('it names the recorded history', /foraminal stenosis/.test(n1) && /L4\\/L5 disc bulge/.test(n1));
      ok('it sends the re-tune to his next appointment', /next appointment/.test(n1));
      ok('it keeps the red-flag line', /urgent medical assessment/.test(n1));
      ok('the notes stay index-aligned with the flows', YOGA_TRAIN_NOTES.length === YOGA_FLOWS_TRAIN.length);

      // ── 2. the failed-save message ─────────────────────────────────────
      var bd = getBD(); bd.medicine = []; saveBD(bd);
      switchSection('baby');
      currentBabyView = 'medicine';
      renderBabyView();
      document.getElementById('medName').value = 'Calpol';
      document.getElementById('medDose').value = '5ml';
      var realSet = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function(){ var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
      try { document.getElementById('medLogBtn').click(); } finally { localStorage.setItem = realSet; }
      var err = document.getElementById('medSaveErr');
      var t = err ? err.textContent : '';
      ok('the failure still says NOT logged', /NOT logged/.test(t), t);
      ok('it names Hearth\\'s own storage, not the phone', /Hearth's own storage/.test(t) && !/this device's storage/.test(t), t);
      ok('TRIPWIRE: it tells him to write the dose down', /Write it down/.test(t), t);
      ok('it gives the lever that actually frees space', /plant photos/.test(t), t);
      ok('it is no smaller than the dose working (14px)',
        err && parseFloat(err.style.fontSize) >= 14, err && err.style.fontSize);

      // ── 3. bag names and ids escaped ───────────────────────────────────
      var evil = '<img src=x id=v479evil>';
      var bd3 = getBD();
      bd3.bags = [{ id:"q'x", name:evil, icon:'', updated:1,
                    items:[{ id:"i'1", name:'Wipes', packed:false, updated:1 },
                           { id:'i2', name:'Nappies', packed:true, updated:1 }] }];   // a packed item is what shows Unpack all
      saveBD(bd3);
      currentBabyView = 'bags';
      currentBagId = "q'x";
      renderBabyView();
      ok('no element injected by a bag name in the bag view', !document.getElementById('v479evil'));
      var tab = document.querySelector('#bagTabRow .bag-tab');
      ok('a quote in a bag id survives the data attribute', tab && tab.dataset.bagid === "q'x", tab && tab.dataset.bagid);
      var chk = document.querySelector("#bagContent [data-action='bagToggle']");
      ok('a quote in an item id survives the data attribute', chk && chk.dataset.id === "i'1", chk && chk.dataset.id);
      var reset = document.querySelector("#bagContent [data-action='bagReset']");
      if (reset) reset.click();
      var dlg = document.querySelector('[role=alertdialog]');
      ok('the Unpack-all confirm opened', !!dlg);
      ok('TRIPWIRE: the bag name in the Unpack-all confirm is text, not markup',
        !document.getElementById('v479evil') && dlg && dlg.textContent.indexOf(evil) !== -1,
        dlg && dlg.innerHTML.slice(0, 200));
      var no = document.getElementById('_cfNo'); if (no) no.click();
      var bd4 = getBD(); bd4.bags = []; saveBD(bd4);

      // ── 4. Each leg at Basic ───────────────────────────────────────────
      var kneeIdx = -1;
      PROGRAMMES_TRAIN.forEach(function(p, i){ if (p.id === 'knee_general') kneeIdx = i; });
      var knee = PROGRAMMES_TRAIN[kneeIdx];
      var eachLeg = knee.exercises.filter(function(e){ return e.eachLeg; }).map(function(e){ return e.id; });
      ok('the six each-leg strength/warm-up moves carry the flag',
        eachLeg.join(',') === 'heel_slides_kn,quad_sets_kn,slr_kn,short_arc_quads_kn,side_leg_raise_kn,seated_knee_ext_kn',
        eachLeg.join(','));
      ok('no exercise is both eachLeg and perLeg',
        knee.exercises.filter(function(e){ return e.eachLeg && e.perLeg; }).length === 0);
      var leaked = [];
      PROGRAMMES_TRAIN.forEach(function(p){ if (p.id !== 'knee_general') p.exercises.forEach(function(e){ if (e.eachLeg) leaked.push(e.id); }); });
      ok('no other programme uses the flag', leaked.length === 0, leaked.join(','));
      var qIdx = -1, bridgeIdx = -1;
      knee.exercises.forEach(function(e, i){ if (e.id === 'quad_sets_kn') qIdx = i; if (e.id === 'glute_bridge_kn') bridgeIdx = i; });
      function sesHtml(){ return document.getElementById('sesBody').innerHTML; }

      storeSet('fl4_physio_level', 'basic');
      openPhysioSession(kneeIdx); beginPhysio();
      SS.pExIdx = qIdx; SS.pSetNum = 1; renderPhysioSession();
      ok('TRIPWIRE: an each-leg move at Basic says Each leg', sesHtml().indexOf('Each leg') !== -1);
      SS.pExIdx = bridgeIdx; SS.pSetNum = 1; renderPhysioSession();
      ok('a two-legged move at Basic does not', sesHtml().indexOf('Each leg') === -1);
      closeSessionOverlay();

      setPhysioLevel('full');
      openPhysioSession(kneeIdx); beginPhysio();
      SS.pExIdx = qIdx; SS.pSetNum = 1; renderPhysioSession();
      ok('Full is unchanged: no Each leg line', sesHtml().indexOf('Each leg') === -1);
      ok('Full still counts sets', sesHtml().indexOf('Set 1 of 2') !== -1);
      closeSessionOverlay();
      storeSet('fl4_physio_level', null);

      return {pass:pass, fail:fail};
    })()`);
  },
};
