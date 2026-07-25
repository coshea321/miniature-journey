'use strict';

// No app-code change — drives the real Calpol/Nurofen chips (11836/11837/11895)
// through the real DOM, per D5 sign-off in HEARTH-tests-review.md §7/§8.

async function doseFor(page, weightKg, medName) {
  return page.evaluate(`(function(){
    var bd = getBD();
    bd.growth = ${weightKg == null ? '[]' : `[{date:'2026-01-01', weight:${weightKg}}]`};
    saveBD(bd);
    switchSection('baby');
    currentBabyView = 'medicine';
    renderBabyView();
    var chip = document.querySelector('.med-chip[data-med="${medName}"]');
    if (!chip) return { error: 'chip not found for ${medName}' };
    chip.click();
    return {
      dose: document.getElementById('medDose').value,
      note: document.getElementById('medDoseNote').textContent
    };
  })()`);
}

module.exports = {
  name: '08-dose-e2e',
  async run(page) {
    const pass = [];
    const fail = [];
    function ok(name, cond, detail) {
      if (cond) pass.push(name);
      else fail.push({ name, detail: detail || 'assertion failed' });
    }

    const r1 = await doseFor(page, 8, 'Calpol');
    ok('8kg Calpol dose = 5ml', r1.dose === '5ml', JSON.stringify(r1));
    ok('8kg Calpol note has concentration + leaflet wording', /120mg\/5ml/.test(r1.note) && /check the leaflet/.test(r1.note), JSON.stringify(r1));

    const r2 = await doseFor(page, 8, 'Nurofen');
    ok('8kg Nurofen dose = 4ml', r2.dose === '4ml', JSON.stringify(r2));

    const r3 = await doseFor(page, 7.3, 'Calpol');
    ok('7.3kg Calpol dose = 4.5ml (round-down-to-0.25)', r3.dose === '4.5ml', JSON.stringify(r3));

    const r4 = await doseFor(page, 18, 'Calpol');
    ok('18kg Calpol dose = 10ml (capped)', r4.dose === '10ml', JSON.stringify(r4));
    ok('18kg Calpol note flags (capped)', /\(capped\)/.test(r4.note), JSON.stringify(r4));

    const r5 = await doseFor(page, 4.5, 'Nurofen');
    ok('4.5kg Nurofen dose empty (under floor)', r5.dose === '', JSON.stringify(r5));
    ok('4.5kg Nurofen note flags under 5kg', /under 5kg/.test(r5.note), JSON.stringify(r5));

    const r6 = await doseFor(page, null, 'Calpol');
    ok('no weight logged: Calpol falls back to 5ml', r6.dose === '5ml', JSON.stringify(r6));
    ok('no weight logged note', /No weight logged/.test(r6.note), JSON.stringify(r6));

    return { pass, fail };
  },
};
