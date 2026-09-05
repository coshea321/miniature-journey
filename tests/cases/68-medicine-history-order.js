'use strict';

// v465: the Baby medicine history follows the entered administration time,
// not the record id (which records when the entry itself was created). A
// backfilled dose or an edited time can make those two orders disagree.

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
        {id:200, name:'Created later, administered earlier', dose:'1ml', ts:1000, updated:200},
        {id:100, name:'Created earlier, administered later', dose:'2ml', ts:2000, updated:100},
        {id:300, name:'No administration time', dose:'3ml', ts:0, updated:300}
      ];
      saveBD(bd);
      switchSection('baby');
      currentBabyView = 'medicine';
      renderBabyView();
      return Array.from(document.querySelectorAll('#babyMedicineView .med-row')).map(function(row){
        return {
          id: Number(row.querySelector('.med-del-btn').dataset.medid),
          text: row.textContent
        };
      });
    })()`);

    ok('all medicine records render', r.length === 3, JSON.stringify(r));
    ok('newest administration time renders first',
      r[0] && r[0].id === 100 && /administered later/.test(r[0].text), JSON.stringify(r));
    ok('older administration time renders second despite newer id',
      r[1] && r[1].id === 200 && /administered earlier/.test(r[1].text), JSON.stringify(r));
    ok('missing administration time sinks below timed records',
      r[2] && r[2].id === 300 && /No administration time/.test(r[2].text), JSON.stringify(r));

    return { pass, fail };
  },
};
