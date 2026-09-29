'use strict';

// v497: a recipe's Print button (Cathal's scope, 29/09/2026): one recipe,
// "Serves N" at the servings currently set with the amounts scaled to match,
// ingredients, prep, method and notes; no calories, category or source. The
// Lists print now shares the same openPrintDoc helper, so it is checked too.
// window.open is stubbed: the test reads what would have been written.
module.exports = {
  name: '83-recipe-print',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var written = null, realOpen = window.open;
      window.open = function(){ written = ''; return { document: { open:function(){}, write:function(h){ written += h; }, close:function(){} } }; };

      var savedBook = storeGet('fl4_recipebook');
      var rid = 830001;
      var rec = { id: rid, name: 'Print <Test> Stew', servings: 4, kcal: 450, category: 'SecretCategory',
        ingredients: parseIngredients('For the base:\\n400 g baby potatoes\\n2 tbsp olive oil'),
        prep: 'Chop the potatoes.', method: 'Heat the oven.\\nRoast for 30 minutes.',
        notes: 'Line one\\nLine two', url: 'https://example.com/secret-source', updated: Date.now() };
      saveRecipeBook(getRecipeBook().concat([rec]));

      switchSection('recipes');
      _recipeView = 'detail'; _recipeOpenId = rid; _recipeServings = 8;
      renderRecipeDetail();
      var btn = document.getElementById('recipePrintBtn');
      ok('the recipe page has a Print button', !!btn);
      if (btn) btn.click();
      var d = written || '';
      ok('Print writes a print document', d.indexOf('<!DOCTYPE html>') === 0 && d.indexOf('window.print()') !== -1);
      ok('the recipe name is escaped', d.indexOf('Print &lt;Test&gt; Stew') !== -1 && d.indexOf('<Test>') === -1);
      ok('it prints the servings currently set', d.indexOf('Serves 8') !== -1);
      ok('amounts are scaled to those servings (400 g for 4 -> 800 for 8)', d.indexOf('800') !== -1 && d.indexOf('>400') === -1, d.slice(0, 900));
      ok('ingredient sub-headings print', d.indexOf('<h3>For the base</h3>') !== -1);
      ok('prep, method and notes print', d.indexOf('<h2>Prep</h2>') !== -1 && d.indexOf('<h2>Method</h2>') !== -1 && d.indexOf('Line one<br>Line two') !== -1);
      ok('the method is numbered', d.indexOf('<ol') !== -1 && d.indexOf('Roast for 30 minutes.') !== -1);
      ok('calories, category and source are left off', d.indexOf('kcal') === -1 && d.indexOf('SecretCategory') === -1 && d.indexOf('secret-source') === -1);
      ok('buttons are not printed', d.indexOf('<button') === -1);

      // Pop-up blocked: no crash, returns false.
      window.open = function(){ return null; };
      ok('a blocked pop-up returns false instead of throwing', openPrintDoc('x', '', '') === false);

      // Lists print still works through the shared helper.
      window.open = function(){ written = ''; return { document: { open:function(){}, write:function(h){ written += h; }, close:function(){} } }; };
      switchSection('lists'); currentList = 'grocery'; renderList();
      document.getElementById('printLink').click();
      ok('Lists Print still writes its document', (written || '').indexOf('<!DOCTYPE html>') === 0 && written.indexOf('<h1>') !== -1 && written.indexOf('window.print()') !== -1);

      window.open = realOpen;
      if (savedBook === null || savedBook === undefined) localStorage.removeItem('fl4_recipebook'); else storeSet('fl4_recipebook', savedBook);
      _recipeView = 'list'; _recipeOpenId = null;
      switchSection('home');
      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
