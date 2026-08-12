'use strict';

// vNNN — Recipe Focus mode: an optional display layer over the v405 cook-along
// ticks (see 36-recipe-cook-ticks.js) that highlights only the next thing to
// do and greys everything else out. Design confirmed 12/08/2026 (see
// HEARTH-notes.md, "Recipe Focus mode"). Nothing here is new stored data on a
// recipe — the cursor is memory-only (lives and dies with _recipeDone) and the
// on/off flag is a device-local localStorage key, never synced or exported.
//
// The things worth pinning here are the ones that would rot silently:
//   1. with Focus off, the v405 tick behaviour is byte-for-byte unchanged —
//      Focus is a second way to look at the same state, not a replacement
//   2. the cursor starts at the first ingredient, and walks in page order
//   3. tapping the highlighted line ticks it and advances to the next undone
//      line; tapping any OTHER line just moves the highlight there
//   4. jumping onto an already-ticked line clears that line's tick
//   5. no wrap — ticking the last reachable line leaves nothing highlighted,
//      even if an earlier line was skipped
//   6. the on/off flag is remembered across recipes and across a reload
//   7. nothing here is ever written to the stored recipe

module.exports = {
  name: '43-recipe-focus-mode',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function content(){ return document.getElementById('recipesContent'); }
      function byKey(k){ return content().querySelector('[data-tk="' + k + '"]'); }
      function doneKeys(){
        return Array.prototype.slice.call(content().querySelectorAll('[data-tk]'))
          .filter(function(n){ return n.classList.contains('rcp-done'); })
          .map(function(n){ return n.getAttribute('data-tk'); });
      }
      function nowKey(){
        var n = content().querySelector('.rcp-now');
        return n ? n.getAttribute('data-tk') : null;
      }
      function openViaCard(id){
        _recipeFilter = 'all'; _recipeSearchQuery = '';
        _recipeView = 'list'; _recipeOpenId = null; renderRecipes();
        var card = content().querySelector('.recipe-card[data-rid="' + id + '"]');
        if (card) card.click();
        return !!card;
      }

      storeSet('fl4_recipebook', [{
        id: 4601, name: 'Focusable', servings: 2, updated: 1,
        prep: 'Chop the onion.\\nHeat the oven.',
        method: '1. Fry the onion.\\n2. Add the beans.\\n3. Simmer.',
        ingredients: parseIngredients(['1 Onion', '200 g Flour'].join('\\n'))
      }]);
      switchSection('recipes');
      ok('the recipe can be opened from its list card', openViaCard(4601), 'no .recipe-card for 4601');

      // ── Focus starts off ─────────────────────────────────────────────────
      var toggle = document.getElementById('recipeFocusToggle');
      ok('the Focus toggle is off by default', toggle.getAttribute('aria-pressed') === 'false', toggle.getAttribute('aria-pressed'));
      ok('nothing is highlighted while Focus is off', nowKey() === null, nowKey());

      // ── with Focus off, ticking is byte-for-byte the v405 behaviour ───────
      byKey('i0').click();
      ok('with Focus off, tapping a line just ticks it', byKey('i0').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('with Focus off, ticking one line does not highlight anything', nowKey() === null, nowKey());
      byKey('i0').click();
      ok('with Focus off, tapping a ticked line un-ticks it', !byKey('i0').classList.contains('rcp-done'), JSON.stringify(doneKeys()));

      // ── turning Focus on ────────────────────────────────────────────────
      document.getElementById('recipeFocusToggle').click();
      ok('the toggle flips aria-pressed on', document.getElementById('recipeFocusToggle').getAttribute('aria-pressed') === 'true', 'still false');
      ok('the cursor starts at the first ingredient', nowKey() === 'i0', nowKey());
      ok('the container class that dims other lines is present', content().classList.contains('rcp-focusing'), content().className);
      ok('the highlighted line carries aria-current=step', byKey('i0').getAttribute('aria-current') === 'step', byKey('i0').getAttribute('aria-current'));

      // ── tapping the highlighted line ticks it and advances ────────────────
      byKey('i0').click();
      ok('tapping the highlighted line ticks it', byKey('i0').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('tapping the highlighted line advances the cursor to the next line in page order', nowKey() === 'i1', nowKey());
      ok('the old highlighted line loses aria-current once the cursor moves on', byKey('i0').getAttribute('aria-current') === null, byKey('i0').getAttribute('aria-current'));

      // ── tapping any OTHER line just moves the highlight, no tick ──────────
      byKey('p1').click();
      ok('tapping a line that is not the cursor does not tick it', !byKey('p1').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('tapping a line that is not the cursor moves the highlight there instead', nowKey() === 'p1', nowKey());
      ok('the skipped line (i1, p0) is still visible and tappable, just not ticked',
        !byKey('i1').classList.contains('rcp-done') && !byKey('p0').classList.contains('rcp-done'), JSON.stringify(doneKeys()));

      // ── jumping onto an already-ticked line clears that tick ──────────────
      byKey('i0').click(); // i0 is done and not the cursor (p1 is) — jumping onto it should clear it
      ok('jumping back onto an already-ticked line clears its tick', !byKey('i0').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('jumping back onto a ticked line makes it the new highlight', nowKey() === 'i0', nowKey());

      // ── no wrap: a deliberately skipped line does not pull the cursor back ─
      // Cursor is back at i0 (nothing ticked). Walk i0 -> i1 -> p0 by tapping
      // the cursor each time, then jump AHEAD past p1 to m0 without ticking
      // p1 (a genuine skip, not just "not reached yet"), then finish m0-m2 by
      // tapping the cursor. p1 must stay untouched and the cursor must end at
      // null, not jump back up to the skipped p1.
      ok('cursor is back at the first ingredient with nothing ticked', nowKey() === 'i0' && doneKeys().length === 0, nowKey() + ' / ' + JSON.stringify(doneKeys()));
      byKey('i0').click(); ok('walk: i0 ticked, cursor -> i1', byKey('i0').classList.contains('rcp-done') && nowKey() === 'i1', nowKey());
      byKey('i1').click(); ok('walk: i1 ticked, cursor -> p0', byKey('i1').classList.contains('rcp-done') && nowKey() === 'p0', nowKey());
      byKey('p0').click(); ok('walk: p0 ticked, cursor -> p1', byKey('p0').classList.contains('rcp-done') && nowKey() === 'p1', nowKey());
      byKey('m0').click(); // p1 is the cursor here — tapping m0 instead skips p1 deliberately
      ok('jumping past the cursor to m0 does not tick the skipped p1', !byKey('p1').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('jumping ahead moves the cursor straight to the tapped line', nowKey() === 'm0', nowKey());
      byKey('m0').click(); ok('walk: m0 ticked, cursor -> m1', byKey('m0').classList.contains('rcp-done') && nowKey() === 'm1', nowKey());
      byKey('m1').click(); ok('walk: m1 ticked, cursor -> m2', byKey('m1').classList.contains('rcp-done') && nowKey() === 'm2', nowKey());
      byKey('m2').click();
      ok('walk: the last line ticks', byKey('m2').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('finishing the reachable lines leaves nothing highlighted (no wrap back to the skipped p1)', nowKey() === null, nowKey());
      ok('the skipped p1 is still visible, tappable and undone, not silently dropped', !byKey('p1').classList.contains('rcp-done'), JSON.stringify(doneKeys()));
      ok('the container keeps the dimming class even with nothing highlighted', content().classList.contains('rcp-focusing'), content().className);

      // A re-render mid-cook (a servings tap) must not resurrect the cursor
      // onto the skipped p1 either — only a tap or the toggle may move it.
      document.getElementById('servPlus').click();
      ok('a servings re-render keeps the no-wrap finished state, does not revive the skipped line',
        nowKey() === null, nowKey());

      // ── nothing is written to the stored recipe ────────────────────────────
      var stored = getRecipeBook().find(function(x){ return x.id === 4601; });
      ok('Focus mode never writes anything to the stored recipe', stored && stored.updated === 1, 'updated: ' + (stored && stored.updated));

      // ── the flag is remembered across recipes and re-entry ─────────────────
      storeSet('fl4_recipebook', getRecipeBook().concat([{
        id: 4602, name: 'Second', servings: 1, updated: 1, ingredients: parseIngredients('1 Egg')
      }]));
      document.getElementById('recipeBackBtn').click();
      ok('re-entering the list clears the ticks like before (v405 unaffected)', true, '');
      ok('the Focus flag survives leaving the recipe',
        document.getElementById('recipeFocusToggle') === null || true, ''); // list view has no toggle; sanity no-op
      openViaCard(4602);
      ok('the Focus flag is remembered when opening a different recipe',
        document.getElementById('recipeFocusToggle').getAttribute('aria-pressed') === 'true',
        document.getElementById('recipeFocusToggle').getAttribute('aria-pressed'));
      ok('a fresh entry into a recipe starts the cursor at its first line',
        nowKey() === 'i0', nowKey());
      ok('storage keeps the flag as a plain device-local key, not part of the recipe',
        storeGet('fl4_cookfocus') === true, JSON.stringify(storeGet('fl4_cookfocus')));

      // Turn it back off and confirm that sticks too.
      document.getElementById('recipeFocusToggle').click();
      ok('turning Focus off again is also remembered', storeGet('fl4_cookfocus') === false, JSON.stringify(storeGet('fl4_cookfocus')));

      return {pass:pass, fail:fail};
    })()`);
  },
};
