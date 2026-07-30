'use strict';

// Run the tidy pass at CSV import time (backlog item, v366 council's recorded
// dissent, 29/07/2026): the v366 "🧹 Tidy" tool only fixed the ~60 recipes
// already in the book, so anything imported afterwards via recipesFromCSV
// needed tidying all over again. Fix: run each parsed ingredient through the
// same tidyIngredient() the tidy screen uses, keep only confident (ok)
// rewrites, and leave a flagged line exactly as it imports today — the
// import preview is not a place to ask questions. `recipesFromCSV` now
// returns a `tidied` count alongside `recipes`/`skipped` for the preview
// text ("N recipes found · M ingredient lines tidied").

module.exports = {
  name: '19-csv-import-tidy',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      function csv(rows){
        return rows.map(function(r){
          return r.map(function(c){
            c = String(c == null ? '' : c);
            return /[",\\n]/.test(c) ? '"' + c.replace(/"/g,'""') + '"' : c;
          }).join(',');
        }).join('\\n');
      }

      // ── a confident rewrite (sized container + dual-unit tail) is applied ──
      var text1 = csv([
        ['title','ingredients','instructions'],
        ['Chili', '2 15-ounce cans black beans, rinsed / 425 g\\n1 onion, chopped', 'Cook it.']
      ]);
      var res1 = recipesFromCSV(text1);
      ok('one recipe found', res1.recipes.length === 1, 'got: ' + JSON.stringify(res1));
      var ings1 = res1.recipes[0].ingredients;
      var beans = ings1[0];
      ok('sized-container line tidied: amount', beans.amount === 2, 'got: ' + JSON.stringify(beans));
      ok('sized-container line tidied: unit', beans.unit === 'can', 'got: ' + JSON.stringify(beans));
      ok('sized-container line tidied: buyable name (before the bracket) has no stray digits',
        !/\\d/.test(beans.name.replace(/\\s*\\([^)]*\\)\\s*$/,'')), 'got: ' + JSON.stringify(beans));
      ok('sized-container line tidied: name is the product, size+prep moved to the bracket',
        beans.name === 'Black beans (15-ounce, 425 g, rinsed)', 'got: ' + JSON.stringify(beans));
      var onionIng = ings1[1];
      ok('the onion line is also tidied (comma clause moved to a bracket)',
        onionIng.name === 'Onion (chopped)' && onionIng.amount === 1, 'got: ' + JSON.stringify(onionIng));
      ok('tidied count reflects both changed lines', res1.tidied === 2, 'got: ' + JSON.stringify(res1));

      // ── a line the tidy pass can't confidently rewrite imports untouched ──
      var text2 = csv([
        ['title','ingredients'],
        ['Weird', '3/4 of 1 tin of chopped tomatoes - 300g']
      ]);
      var res2 = recipesFromCSV(text2);
      var rawParsed = parseIngredients('3/4 of 1 tin of chopped tomatoes - 300g', true)[0];
      var afterTidy = res2.recipes[0].ingredients[0];
      ok('flagged line is untouched (same as plain parseIngredients output)',
        JSON.stringify(afterTidy) === JSON.stringify(rawParsed), 'got: ' + JSON.stringify(afterTidy) + ' vs ' + JSON.stringify(rawParsed));
      ok('tidied count is 0 when nothing confidently changed', res2.tidied === 0, 'got: ' + JSON.stringify(res2));

      // ── a section header line survives untouched, no tidied credit ──
      var text3 = csv([
        ['title','ingredients'],
        ['Layered', '<b>Base</b>\\n200g flour']
      ]);
      var res3 = recipesFromCSV(text3);
      var headerIng = res3.recipes[0].ingredients[0];
      ok('header line still recognised as a header', headerIng.header === true, 'got: ' + JSON.stringify(headerIng));
      var flourIng = res3.recipes[0].ingredients[1];
      ok('glued-unit line ("200g") still gets tidied to a space', flourIng.unit === 'g' && flourIng.amount === 200 && !/\\d/.test(flourIng.name),
        'got: ' + JSON.stringify(flourIng));

      // ── empty import still returns a tidied:0, no crash ──
      var res4 = recipesFromCSV('');
      ok('empty text: recipes empty', res4.recipes.length === 0, 'got: ' + JSON.stringify(res4));
      ok('empty text: tidied is 0', res4.tidied === 0, 'got: ' + JSON.stringify(res4));

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
