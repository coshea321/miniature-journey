'use strict';

// v442 — food journal autosuggest: typing offers past entries + recipe names.
//
// What's worth pinning:
//   1. both sources feed the list — the food log AND the recipe book
//   2. ranking: name-start beats word-start beats anywhere, then how often
//      it has been logged
//   3. the calorie rule (the whole reason this feature needed care): a
//      suggestion carries only a TYPED figure — a hand-entered kcal on a past
//      entry, or a recipe's per-serving kcal. An auto-ESTIMATED figure is
//      never carried forward, because copying it into the kcal box would flip
//      `calAuto` off and launder a guess into a hand-checked number (the v434
//      rule, applied to the suggestion path)
//   4. an exact match is not offered — it is already in the box
//   5. picking never overwrites a figure the user typed themselves
module.exports = {
  name: '51-food-autosuggest',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function names(q){ return foodSuggestMatches(q, 6).map(function(i){ return i.text; }); }
      function one(q, text){ return foodSuggestMatches(q, 6).find(function(i){ return i.text === text; }); }

      storeSet('fl4_food_log', [
        // "Porridge with honey" logged three times; the newest carries a
        // hand-typed 250 kcal, so that is the figure a suggestion may reuse.
        { id: 5101, date: '2026-08-01', meal: 0, text: 'Porridge with honey', cal: 240, calAuto: false },
        { id: 5102, date: '2026-08-02', meal: 0, text: 'Porridge with honey', cal: 240, calAuto: false },
        { id: 5103, date: '2026-08-03', meal: 0, text: 'Porridge with honey', cal: 250, calAuto: false },
        // Estimated only — must never hand its number to the kcal box.
        { id: 5104, date: '2026-08-03', meal: 1, text: 'Cheese sandwich', cal: 400, calAuto: true },
        { id: 5105, date: '2026-08-04', meal: 2, text: 'Leftover porridge', cal: 0, calAuto: false }
      ]);
      storeSet('fl4_recipebook', [
        { id: 5110, name: 'Porridge Traybake', servings: 4, kcal: 380, updated: 1 },
        { id: 5111, name: 'Unpriced Porridge Loaf', servings: 6, updated: 1 }
      ]);

      // ── 1. both sources ────────────────────────────────────────────────
      var all = names('porridge');
      ok('past entries are offered', all.indexOf('Porridge with honey') >= 0, all.join(' | '));
      ok('recipe names are offered', all.indexOf('Porridge Traybake') >= 0, all.join(' | '));
      ok('a recipe with no kcal is still offered', all.indexOf('Unpriced Porridge Loaf') >= 0, all.join(' | '));
      ok('the source is flagged', one('porridge','Porridge Traybake').recipe === true && one('porridge','Porridge with honey').recipe === false);

      // ── 2. ranking ─────────────────────────────────────────────────────
      ok('name-start ranks above word-start',
         all.indexOf('Porridge with honey') < all.indexOf('Leftover porridge'), all.join(' | '));
      ok('more-logged ranks first among equals',
         all[0] === 'Porridge with honey', all.join(' | '));
      ok('uses counts every logging', one('porridge','Porridge with honey').uses === 3,
         String(one('porridge','Porridge with honey').uses));

      // ── 3. THE CALORIE RULE ────────────────────────────────────────────
      ok('a typed past figure is carried, newest wins',
         one('porridge','Porridge with honey').cal === 250,
         String(one('porridge','Porridge with honey').cal));
      ok('an ESTIMATED past figure is NOT carried',
         one('cheese','Cheese sandwich').cal === 0,
         'cal was ' + one('cheese','Cheese sandwich').cal + ' — an estimate must never be promoted to a typed figure');
      ok('a recipe per-serving figure is carried',
         one('porridge','Porridge Traybake').cal === 380,
         String(one('porridge','Porridge Traybake').cal));
      ok('a recipe with no figure carries none',
         one('porridge','Unpriced Porridge Loaf').cal === 0);

      // ── 4. exact match / too-short query ───────────────────────────────
      ok('an exact match is not offered back',
         names('Porridge with honey').indexOf('Porridge with honey') < 0);
      ok('matching ignores case and stray spacing',
         names('  PORRIDGE   WITH  HONEY ').indexOf('Porridge with honey') < 0);
      ok('one character suggests nothing', foodSuggestMatches('p', 6).length === 0);
      ok('two characters suggest something', foodSuggestMatches('po', 6).length > 0);
      ok('no match suggests nothing', foodSuggestMatches('zzqq', 6).length === 0);
      ok('the cap is honoured', foodSuggestMatches('porridge', 2).length === 2);

      // ── 5. picking fills the box ───────────────────────────────────────
      renderFoodView();
      var fi = document.getElementById('foodItemInput');
      var ci = document.getElementById('foodCalInput');
      var box = document.getElementById('foodSuggestBox');
      ok('the panel exists', !!box);

      fi.value = 'porridge'; ci.value = '';
      renderFoodSuggest();
      ok('the panel opens while typing', box.style.display === 'block');
      ok('a row per match', box.querySelectorAll('.food-sugg').length === _foodSuggest.length);

      var idx = _foodSuggest.findIndex(function(i){ return i.text === 'Porridge with honey'; });
      pickFoodSuggest(idx);
      ok('picking fills the text', fi.value === 'Porridge with honey', fi.value);
      ok('picking fills the typed figure', ci.value === '250', ci.value);
      ok('picking closes the panel', box.style.display === 'none');

      // An estimate-only suggestion leaves the kcal box empty, so the entry
      // stays flagged calAuto when it is logged.
      fi.value = 'cheese'; ci.value = '';
      renderFoodSuggest();
      pickFoodSuggest(_foodSuggest.findIndex(function(i){ return i.text === 'Cheese sandwich'; }));
      ok('an estimate-only pick leaves kcal empty', ci.value === '', ci.value);

      // A figure the user typed themselves is never overwritten.
      fi.value = 'porridge'; ci.value = '999';
      renderFoodSuggest();
      pickFoodSuggest(_foodSuggest.findIndex(function(i){ return i.text === 'Porridge with honey'; }));
      ok('a typed kcal is not overwritten', ci.value === '999', ci.value);

      hideFoodSuggest();
      ok('hide empties the panel', box.style.display === 'none' && _foodSuggest.length === 0);

      return { pass: pass, fail: fail };
    })()`);
  }
};
