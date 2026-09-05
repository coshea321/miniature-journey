'use strict';

// v465: the Baby medicine history follows the entered administration time,
// not the record id (which records when the entry itself was created). Drive
// the real datetime editor too: its save path once re-sorted the stored array
// by id, contradicting the renderer after a correction.

module.exports = {
  name: '68-medicine-history-order',
  async run(page) {
    const pass = [];
    const fail = [];
    function ok(name, cond, detail) {
      if (cond) pass.push(name);
      else fail.push({ name, detail: detail || 'assertion failed' });
    }

    const r = await page.evaluate(`(function(){
      var bd = getBD();
      bd.medicine = [
        {id:200, name:'Calpol newer administration', dose:'1ml', ts:new Date('2026-09-05T02:30').getTime(), updated:200},
        {id:100, name:'Nurofen older administration', dose:'2ml', ts:new Date('2026-09-04T21:00').getTime(), updated:100},
        {id:300, name:'No administration time', dose:'3ml', ts:0, updated:300}
      ];
      saveBD(bd);
      switchSection('baby');
      currentBabyView = 'medicine';
      renderBabyView();
      function rows(){
        return Array.from(document.querySelectorAll('#babyMedicineView .med-row')).map(function(row){
          return {
            id: Number(row.querySelector('.med-del-btn').dataset.medid),
            text: row.textContent
          };
        });
      }
      var initial = rows();
      var trigger = document.querySelector(".med-dt-edit-trigger[data-medid='100']");
      trigger.click();
      var picker = trigger.closest('.med-row').querySelector('.med-dt-edit');
      picker.querySelector('input').value = '2026-09-05T03:30';
      picker.querySelector('._mSave').click();
      return {
        initial:initial,
        immediate:rows(),
        stored:(getBD().medicine||[]).map(function(m){ return m.id; })
      };
    })()`);

    ok('all medicine records render', r.initial.length === 3, JSON.stringify(r));
    ok('newest administration time renders first',
      r.initial[0] && r.initial[0].id === 200 && /newer administration/.test(r.initial[0].text), JSON.stringify(r));
    ok('older administration time renders second',
      r.initial[1] && r.initial[1].id === 100 && /older administration/.test(r.initial[1].text), JSON.stringify(r));
    ok('missing administration time sinks below timed records',
      r.initial[2] && r.initial[2].id === 300 && /No administration time/.test(r.initial[2].text), JSON.stringify(r));
    ok('edited dose immediately moves above the previously newer dose',
      r.immediate[0] && r.immediate[0].id === 100 && r.immediate[1] && r.immediate[1].id === 200, JSON.stringify(r));
    ok('datetime save persists the same administration-time order',
      JSON.stringify(r.stored) === JSON.stringify([100,200,300]), JSON.stringify(r));

    await page.navigate(page.appUrl);
    const reloaded = await page.evaluate(`(function(){
      switchSection('baby');
      currentBabyView = 'medicine';
      renderBabyView();
      return Array.from(document.querySelectorAll('#babyMedicineView .med-row .med-del-btn'))
        .map(function(btn){ return Number(btn.dataset.medid); });
    })()`);
    ok('edited order survives a full reload',
      JSON.stringify(reloaded) === JSON.stringify([100,200,300]), JSON.stringify(reloaded));

    return { pass, fail };
  },
};
