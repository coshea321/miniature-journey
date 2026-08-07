'use strict';

// v405 — cook-along ticks: tap an ingredient line or a Prep/Method step in the
// recipe detail view and it greys out; everything clears when you re-enter the
// recipe.
//
// The things worth pinning here are the ones that would rot silently:
//   1. the ticks are DISPLAY state — nothing is written to the stored recipe
//      and nothing is synced, or a partner opening the same recipe would see
//      half of it struck through
//   2. they survive a re-render (servings change, favourite toggle, an
//      incoming sync push) — positional keys exist for exactly this, and a
//      re-render that lost them would make the feature useless mid-cook
//   3. re-entering the recipe clears them, which is the whole ask
//   4. the delegated listener is wired ONCE — #recipesContent is a permanent
//      element, so a per-render listener would stack and a tap would toggle
//      N times, which reads as "the tick doesn't work" on even numbers

module.exports = {
  name: '36-recipe-cook-ticks',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function content(){ return document.getElementById('recipesContent'); }
      function ticks(){ return Array.prototype.slice.call(content().querySelectorAll('[data-tk]')); }
      function keys(){ return ticks().map(function(n){ return n.getAttribute('data-tk'); }); }
      function doneKeys(){
        return ticks().filter(function(n){ return n.classList.contains('rcp-done'); })
                      .map(function(n){ return n.getAttribute('data-tk'); });
      }
      function byKey(k){ return content().querySelector('[data-tk="' + k + '"]'); }

      storeSet('fl4_recipebook', [{
        id: 4501, name: 'Tickable', servings: 2, updated: 1,
        prep: 'Chop the onion.\\nHeat the oven.',
        method: '1. Fry the onion.\\n2. Add the beans.\\n3. Simmer.',
        ingredients: parseIngredients(['<b>For the base</b>', '1 Onion', '200 g Flour', '2 Eggs'].join('\\n'))
      }]);
      switchSection('recipes');

      // Open it the way the app does, so the reset path is the one under test.
      function openViaCard(id){
        _recipeFilter = 'all'; _recipeSearchQuery = '';
        _recipeView = 'list'; _recipeOpenId = null; renderRecipes();
        var card = content().querySelector('.recipe-card[data-rid="' + id + '"]');
        if (card) card.click();
        return !!card;
      }
      ok('the recipe can be opened from its list card', openViaCard(4501), 'no .recipe-card for 4501');

      // ── what is tappable ─────────────────────────────────────────────────
      var k = keys();
      ok('every ingredient line is tappable',
        k.indexOf('i1') !== -1 && k.indexOf('i2') !== -1 && k.indexOf('i3') !== -1, JSON.stringify(k));
      ok('the section header is NOT tappable — it is not a thing you do',
        k.indexOf('i0') === -1, JSON.stringify(k));
      ok('every prep step is tappable', k.indexOf('p0') !== -1 && k.indexOf('p1') !== -1, JSON.stringify(k));
      ok('every method step is tappable',
        k.indexOf('m0') !== -1 && k.indexOf('m1') !== -1 && k.indexOf('m2') !== -1, JSON.stringify(k));
      ok('prep and method keys do not collide',
        k.filter(function(x){ return x === 'p0'; }).length === 1 &&
        k.filter(function(x){ return x === 'm0'; }).length === 1, JSON.stringify(k));
      ok('nothing starts out greyed', doneKeys().length === 0, JSON.stringify(doneKeys()));

      // The reference parts of the page stay untouched.
      var name = Array.prototype.slice.call(content().querySelectorAll('div')).filter(function(d){
        return d.textContent.trim() === 'Tickable';
      })[0];
      ok('the recipe title is not tappable',
        !name || !name.hasAttribute('data-tk'), 'title carries data-tk');

      // ── tapping ──────────────────────────────────────────────────────────
      byKey('i1').click();
      byKey('m0').click();
      ok('tapping an ingredient greys it out', byKey('i1').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('tapping a method step greys it out', byKey('m0').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('tapping one line leaves the others alone',
        doneKeys().length === 2, JSON.stringify(doneKeys()));

      // Tapping again un-does it — a mis-tap mid-cook has to be recoverable.
      byKey('i1').click();
      ok('tapping a greyed line un-greys it', !byKey('i1').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      byKey('i1').click();

      // Exactly one listener. If renderRecipeDetail attached one per render,
      // this second tap after several re-renders would toggle N times.
      renderRecipeDetail(); renderRecipeDetail(); renderRecipeDetail();
      byKey('i2').click();
      ok('the tick listener is wired once, not once per render',
        byKey('i2').classList.contains('rcp-done'), 'tap toggled an even number of times');
      byKey('i2').click();

      // ── nothing is written to the recipe ─────────────────────────────────
      var stored = getRecipeBook().find(function(x){ return x.id === 4501; });
      ok('ticking does not write anything to the stored recipe',
        stored && stored.updated === 1, 'updated: ' + (stored && stored.updated));
      ok('no tick state is stored on the ingredients',
        stored && (stored.ingredients || []).every(function(i){ return !i || (!i.done && !i.checked); }),
        JSON.stringify(stored && stored.ingredients));

      // ── ticks survive a re-render ────────────────────────────────────────
      document.getElementById('servPlus').click();
      ok('a servings change keeps the ticks',
        byKey('i1').classList.contains('rcp-done') && byKey('m0').classList.contains('rcp-done'),
        JSON.stringify(doneKeys()));
      ok('a servings change still rescales the ingredients',
        document.getElementById('servCount').textContent === '3',
        document.getElementById('servCount').textContent);

      // A sync push repaints the section; mid-cook that must not wipe the ticks.
      renderRecipes();
      ok('a full re-render of the section keeps the ticks',
        byKey('i1').classList.contains('rcp-done') && byKey('m0').classList.contains('rcp-done'),
        JSON.stringify(doneKeys()));

      // Leaving the Recipes tab and coming back keeps your place (confirmed
      // design: a glance at the calendar mid-cook is not "re-entering").
      switchSection('home'); switchSection('recipes');
      ok('switching tabs and back keeps the ticks',
        byKey('i1').classList.contains('rcp-done') && byKey('m0').classList.contains('rcp-done'),
        JSON.stringify(doneKeys()));

      // ── re-entering clears everything ────────────────────────────────────
      document.getElementById('recipeBackBtn').click();
      openViaCard(4501);
      ok('re-entering the recipe clears every tick', doneKeys().length === 0, JSON.stringify(doneKeys()));
      ok('re-entering still renders the lines as tappable', keys().length > 0, JSON.stringify(keys()));

      // Opening a DIFFERENT recipe must never inherit the previous one's ticks,
      // including on the routes that don't go through a card tap.
      byKey('i1').click();
      storeSet('fl4_recipebook', getRecipeBook().concat([{
        id: 4502, name: 'Other', servings: 2, updated: 1,
        method: 'Bake.', ingredients: parseIngredients('200 g Flour')
      }]));
      _recipeOpenId = 4502; _recipeView = 'detail'; renderRecipes();
      ok('opening another recipe directly does not inherit the ticks',
        doneKeys().length === 0, JSON.stringify(doneKeys()));

      // ── shapes that are not a numbered list ──────────────────────────────
      // A single unbroken paragraph of prose renders as one <p>, not an <ol>.
      storeSet('fl4_recipebook', [{
        id: 4503, name: 'Prose', servings: 2, updated: 1,
        method: 'Mix everything together and bake it for forty minutes.',
        ingredients: parseIngredients('200 g Flour')
      }]);
      _recipeOpenId = 4503; _recipeView = 'detail'; renderRecipes();
      ok('a prose method is tappable as a single block', keys().indexOf('m0') !== -1, JSON.stringify(keys()));

      // A derived prep list is tappable, but its footnote is not a step.
      storeSet('fl4_recipebook', [{
        id: 4504, name: 'Derived', servings: 2, updated: 1,
        method: 'Bake.', ingredients: parseIngredients('1 Onion, finely chopped')
      }]);
      _recipeOpenId = 4504; _recipeView = 'detail'; renderRecipes();
      ok('a derived prep step is tappable', keys().indexOf('p0') !== -1, JSON.stringify(keys()));
      ok('the derived-prep footnote is not tappable',
        keys().filter(function(x){ return x.charAt(0) === 'p'; }).length === 1, JSON.stringify(keys()));

      // A method with a sub-heading (v394 shape: a short line ending in ":").
      // formatMethod closes the <ol> and reopens it with start=N, so the block
      // holds TWO lists — the keys must run on across both rather than
      // restarting, or tapping a step under the heading would grey one above it.
      storeSet('fl4_recipebook', [{
        id: 4505, name: 'Headed', servings: 2, updated: 1,
        method: '1. Fry the onion.\\nFor the sauce:\\n2. Melt the butter.\\n3. Whisk in the flour.',
        ingredients: parseIngredients('200 g Flour')
      }]);
      _recipeOpenId = 4505; _recipeView = 'detail'; renderRecipes();
      var mk = keys().filter(function(x){ return x.charAt(0) === 'm'; });
      ok('a method sub-heading is not tappable and step keys run on across both lists',
        mk.length === 3 && mk.join(',') === 'm0,m1,m2', JSON.stringify(mk));
      ok('the sub-heading really did split the method into two lists',
        document.getElementById('rcpMethodBody').querySelectorAll('ol').length === 2,
        document.getElementById('rcpMethodBody').querySelectorAll('ol').length + ' <ol>');
      byKey('m2').click();
      ok('tapping a step under the heading greys that step, not one above it',
        byKey('m2').classList.contains('rcp-done') && !byKey('m0').classList.contains('rcp-done'),
        JSON.stringify(doneKeys()));

      // A recipe with no method at all must not blow up.
      storeSet('fl4_recipebook', [{
        id: 4506, name: 'Bare', servings: 2, updated: 1, ingredients: parseIngredients('200 g Flour')
      }]);
      _recipeOpenId = 4506; _recipeView = 'detail'; renderRecipes();
      ok('a recipe with no prep or method still renders and ticks',
        keys().length === 1 && keys()[0] === 'i0', JSON.stringify(keys()));

      return {pass:pass, fail:fail};
    })()`);
  },
};
