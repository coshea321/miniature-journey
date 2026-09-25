'use strict';

// v484: the v483 security review's follow-up. About 100 render sites wrote a
// record's `id` straight into a single-quoted `data-*` attribute with no
// esc() -- fine while ids are the app's own generated numbers/strings, but
// not if a doctored Firebase record (same write-access bar as the v483 F3
// finding) carries a hostile one. Fixed by wrapping each value in esc() at
// render; dataset decodes it straight back, so id lookups are unchanged.
// This checks two independent render paths (plants, health) for both halves
// of that: a hostile id can't break out of the attribute, and a normal id's
// round trip through data-* -> dataset still opens the right record.
module.exports = {
  name: '79-record-id-attribute-escaping',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var evilId = "1'><img src=x onerror=\\"window.__xssHit=1\\">";

      // ── Plants list (data-pid, opened via +card.dataset.pid) ─────────────
      var savedPlants = storeGet('fl4_plants');
      var savedPlantArea = _plantArea, savedPlantView = _plantView, savedPlantOpenId = _plantOpenId;
      window.__xssHit = 0;
      _plantArea = ''; _plantView = 'list';
      storeSet('fl4_plants', [
        { id: evilId, name: 'Evil plant', updated: Date.now() },
        { id: 790001, name: 'Real fern', updated: Date.now() }
      ]);
      renderPlants();

      var plantCards = Array.prototype.slice.call(document.querySelectorAll('#plantsContent .plant-card'));
      ok('plant list renders exactly one card per plant, none extra from a broken-out attribute',
        plantCards.length === 2, 'got: ' + plantCards.length);
      ok('the hostile plant id fired no onerror handler', window.__xssHit === 0);
      ok('no <img> tag was injected into the plants list',
        document.querySelectorAll('#plantsContent img[src="x"]').length === 0);
      var evilPlantCard = plantCards.filter(function(c){ return c.getAttribute('data-pid') === evilId; })[0];
      ok('the hostile id round-trips unchanged through the escaped attribute',
        !!evilPlantCard, 'no card carried the raw id back; cards: ' + plantCards.map(function(c){ return c.getAttribute('data-pid'); }).join(' | '));
      ok('escaping did not leave a stray onerror attribute on the card',
        evilPlantCard && evilPlantCard.getAttribute('onerror') === null);

      var realPlantCard = plantCards.filter(function(c){ return +c.dataset.pid === 790001; })[0];
      ok('the normal plant still has its own card', !!realPlantCard);
      if (realPlantCard) realPlantCard.click();
      ok('tapping the normal plant row opens that plant, not the hostile one',
        _plantOpenId === 790001 && _plantView === 'detail', 'got _plantOpenId=' + _plantOpenId + ' _plantView=' + _plantView);

      storeSet('fl4_plants', savedPlants || []);
      if (savedPlants === null || savedPlants === undefined) localStorage.removeItem('fl4_plants');
      _plantArea = savedPlantArea; _plantView = savedPlantView; _plantOpenId = savedPlantOpenId;

      // ── Health history (data-hid, opened via +b.dataset.hid) ─────────────
      var savedHealth = storeGet('fl4_health');
      var savedHealthView = _healthView, savedHealthOpenId = _healthOpenId, savedHealthPerson = _healthPerson;
      window.__xssHit = 0;
      _healthView = 'list'; _healthPerson = '';
      storeSet('fl4_health', [
        { id: evilId, kind: 'visit', title: 'Evil visit', date: '2026-01-01', updated: Date.now() },
        { id: 790002, kind: 'visit', title: 'Real visit', date: '2026-01-02', updated: Date.now() }
      ]);
      renderHealth();

      var healthBodies = Array.prototype.slice.call(document.querySelectorAll('#healthContent .health-body'));
      ok('health list renders exactly one row per record, none extra from a broken-out attribute',
        healthBodies.length === 2, 'got: ' + healthBodies.length);
      ok('the hostile health record id fired no onerror handler', window.__xssHit === 0);
      ok('no <img> tag was injected into the health list',
        document.querySelectorAll('#healthContent img[src="x"]').length === 0);
      var evilHealthRow = healthBodies.filter(function(b){ return b.getAttribute('data-hid') === evilId; })[0];
      ok('the hostile health id round-trips unchanged through the escaped attribute', !!evilHealthRow);

      var realHealthRow = healthBodies.filter(function(b){ return +b.dataset.hid === 790002; })[0];
      ok('the normal health record still has its own row', !!realHealthRow);
      if (realHealthRow) realHealthRow.click();
      ok('tapping the normal health row opens that record, not the hostile one',
        _healthOpenId === 790002, 'got _healthOpenId=' + _healthOpenId);

      storeSet('fl4_health', savedHealth || []);
      if (savedHealth === null || savedHealth === undefined) localStorage.removeItem('fl4_health');
      _healthView = savedHealthView; _healthOpenId = savedHealthOpenId; _healthPerson = savedHealthPerson;

      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
