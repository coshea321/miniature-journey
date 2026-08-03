'use strict';

// Recipe-parser second pass (v365, PR #131 design chat confirmed on Fable):
// parseIngredients only ever peeled a single leading amount+unit off a line,
// so a compound amount ("1 3/4 cups + 2 tbs") or a range ("2-3 tbsp") left
// the rest of the measure stranded in the NAME. These cases pin the two new
// shapes (compound summed via a same-dimension conversion table, range
// stored as amount+amountMax), the rescue-at-render routine that recovers
// both from ALREADY-STORED old-format data without rewriting it, and the
// scaling/grocery-push/editor-round-trip plumbing built on top.
// Confirmed out of scope (do not re-litigate): alternatives ("or"), and
// multi-unit brackets (already handled by v363's splitGroceryName).
//
// v395 addition: a real recipe pasted from an AI-translated chat carried a
// U+200B before every ingredient line — invisible on screen, but sitting in
// front of the leading digit, so amount recognition failed on every line and
// the serving-size stepper had nothing to scale. parseIngredients() now
// strips a small set of invisible zero-width/format characters from the
// whole line, not just the front.

module.exports = {
  name: '17-recipe-parser-compound-range',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── parseAmount: mixed integer + unicode fraction ─────────────
      ok('amount: "1 ¾" (spaced)', parseAmount('1 ¾') === 1.75, 'got: ' + parseAmount('1 ¾'));
      ok('amount: "1¾" (glued)', parseAmount('1¾') === 1.75, 'got: ' + parseAmount('1¾'));

      // ── invisible/zero-width characters: stripped before amount parsing ─
      // (written as \\u escapes, never literal invisible bytes, so the test
      // source itself stays unambiguous to read and to diff)
      var ZWSP = '\\u200b', ZWNJ = '\\u200c', BOM = '\\ufeff';
      var zwLead = parseIngredients(ZWSP + '50 g olive oil', false)[0];
      ok('invisible: a leading U+200B no longer blocks amount recognition',
        zwLead.amount === 50 && zwLead.unit === 'g' && zwLead.name === 'olive oil',
        'got: ' + JSON.stringify(zwLead));
      var zwMid = parseIngredients('2' + ZWSP + ' tbsp' + ZWNJ + ' garlic, sliced', false)[0];
      ok('invisible: a zero-width char BETWEEN the number and its unit is also stripped',
        zwMid.amount === 2 && zwMid.unit === 'tbsp' && zwMid.name === 'garlic, sliced',
        'got: ' + JSON.stringify(zwMid));
      var zwMulti = parseIngredients(ZWSP + BOM + '1 liter water', false)[0];
      ok('invisible: multiple stacked invisible chars (ZWSP + BOM) are all stripped',
        zwMulti.amount === 1 && zwMulti.unit === 'l' && zwMulti.name === 'water',
        'got: ' + JSON.stringify(zwMulti));
      var zwNoAmount = parseIngredients(ZWSP + 'Salt, to taste', false)[0];
      ok('invisible: a non-quantified line (no leading number even once stripped) still correctly gets no amount',
        zwNoAmount.amount === undefined && zwNoAmount.name === 'Salt, to taste',
        'got: ' + JSON.stringify(zwNoAmount));
      var zwWholeRecipe = parseIngredients(
        ZWSP + '50 g olive oil\\n' + ZWSP + '200 g rice\\n' + ZWSP + 'Salt, to taste', false);
      ok('invisible: a whole pasted block (every line prefixed) parses every quantified line correctly',
        zwWholeRecipe.length === 3 && zwWholeRecipe[0].amount === 50 && zwWholeRecipe[1].amount === 200 && zwWholeRecipe[2].amount === undefined,
        'got: ' + JSON.stringify(zwWholeRecipe));

      // ── compound: sums into ONE normalized amount+unit ────────────
      var yogA = parseIngredients('1 3/4 cup + 2 tbsp Greek yogurt', false)[0];
      ok('compound: ascii mixed-fraction sums correctly',
        yogA.amount === 1.875 && yogA.unit === 'cup' && yogA.name === 'Greek yogurt',
        'got: ' + JSON.stringify(yogA));
      ok('compound: original phrasing kept for the note/editor round-trip',
        yogA._compoundNote === '1 3/4 cup + 2 tbsp', 'got: ' + JSON.stringify(yogA._compoundNote));

      var yogB = parseIngredients('1 ¾ cups + 2 tbs Greek yogurt', false)[0];
      ok('compound: unicode fraction + unit synonyms ("cups"/"tbs") sum the same way',
        yogB.amount === 1.875 && yogB.unit === 'cup' && yogB.name === 'Greek yogurt',
        'got: ' + JSON.stringify(yogB));
      ok('compound: "plus" is recognised as well as "+"',
        parseIngredients('1 tbsp plus 1 tbsp butter', false)[0].amount === 2,
        'got: ' + JSON.stringify(parseIngredients('1 tbsp plus 1 tbsp butter', false)[0]));

      var unconv = parseIngredients('1 cup + 2 oz sugar', false)[0];
      ok('compound: an unconvertible mix (cup+oz) falls back unparsed rather than guessing density',
        unconv.amount === 1 && unconv.unit === 'cup' && unconv.name === '+ 2 oz sugar',
        'got: ' + JSON.stringify(unconv));

      // ── range: three written forms, all scalable via amountMax ────
      var r1 = parseIngredients('2-3 tbsp sugar', false)[0];
      ok('range: glued hyphen "2-3 tbsp"', r1.amount === 2 && r1.amountMax === 3 && r1.unit === 'tbsp' && r1.name === 'sugar',
        'got: ' + JSON.stringify(r1));
      var r2 = parseIngredients('2–3 tbsp sugar', false)[0];
      ok('range: en dash "2–3 tbsp"', r2.amount === 2 && r2.amountMax === 3 && r2.unit === 'tbsp',
        'got: ' + JSON.stringify(r2));
      var r3 = parseIngredients('2 to 3 tbsp sugar', false)[0];
      ok('range: spelled-out "2 to 3 tbsp"', r3.amount === 2 && r3.amountMax === 3 && r3.unit === 'tbsp',
        'got: ' + JSON.stringify(r3));

      // ── range safety guard: a hyphenated mixed fraction is NOT a range ─
      var hf = parseIngredients('1-1/2 cup flour', false)[0];
      ok('range guard: "1-1/2" (max < min) is left unparsed, not read as a 1-to-0.5 range',
        hf.amount === undefined && hf.amountMax === undefined && hf.name === '1-1/2 cup flour',
        'got: ' + JSON.stringify(hf));

      // ── rescue-at-render: recovers OLD-format stored data verbatim ─
      // (leftover text is exactly what the pre-v365 parser would have left
      // behind — see the v364-era openRecipeEditor serializer round-trip.)
      var oldCompound = { amount: 1, name: '¾ cups + 2 tbs Greek yogurt' };
      var rescuedCompound = rescueIngredientMeasure(oldCompound);
      ok('rescue: old compound leftover is recovered (same maths as a fresh parse)',
        rescuedCompound.amount === 1.875 && rescuedCompound.unit === 'cup' && rescuedCompound.name === 'Greek yogurt',
        'got: ' + JSON.stringify(rescuedCompound));
      var rescuedScaled = scaleIngredient(rescuedCompound, 1);
      ok('rescue: scaling the rescued ingredient matches the original bug report (460 g)',
        rescuedScaled.amount === '460' && rescuedScaled.unit === 'g',
        'got: ' + JSON.stringify(rescuedScaled));

      var oldRangeA = { amount: 2, name: 'to 3 tbsp sugar' };
      var rescuedRangeA = rescueIngredientMeasure(oldRangeA);
      ok('rescue: old range leftover ("to 3 tbsp") is recovered',
        rescuedRangeA.amount === 2 && rescuedRangeA.amountMax === 3 && rescuedRangeA.unit === 'tbsp' && rescuedRangeA.name === 'sugar',
        'got: ' + JSON.stringify(rescuedRangeA));

      var oldRangeB = { name: '2-3 tbsp sugar' };
      var rescuedRangeB = rescueIngredientMeasure(oldRangeB);
      ok('rescue: an old range with NO amount extracted at all (whole line in name) is recovered',
        rescuedRangeB.amount === 2 && rescuedRangeB.amountMax === 3 && rescuedRangeB.unit === 'tbsp' && rescuedRangeB.name === 'sugar',
        'got: ' + JSON.stringify(rescuedRangeB));

      // ── rescue-at-render: never touches ordinary/new-format data ──
      var plainIng = { amount: 200, unit: 'g', name: 'flour' };
      ok('rescue: an ordinary ingredient is returned untouched (same reference, no needless reparse)',
        rescueIngredientMeasure(plainIng) === plainIng);
      var rangeIng = { amount: 2, amountMax: 3, unit: 'tbsp', name: 'sugar' };
      ok('rescue: an ingredient that already has amountMax short-circuits (same reference)',
        rescueIngredientMeasure(rangeIng) === rangeIng);
      var hdrIng = { name: 'Sauce:', header: true };
      ok('rescue: a section header is returned untouched',
        rescueIngredientMeasure(hdrIng) === hdrIng);

      // ── scaleIngredient: amountMax scales alongside amount ─────────
      var sc1 = scaleIngredient({ amount: 2, amountMax: 3, unit: 'tbsp', name: 'sugar' }, 2);
      ok('scale: a range doubles at both ends', sc1.amount === '4' && sc1.amountMax === '6' && sc1.unit === 'tbsp',
        'got: ' + JSON.stringify(sc1));
      var sc2 = scaleIngredient({ amount: 1, amountMax: 2, unit: 'clove', name: 'garlic' }, 1);
      ok('scale: unit pluralisation follows the TOP of the range ("1-2 cloves", not "1-2 clove")',
        sc2.amount === '1' && sc2.amountMax === '2' && sc2.unit === 'cloves',
        'got: ' + JSON.stringify(sc2));
      var sc3 = scaleIngredient({ amount: 200, unit: 'g', name: 'flour' }, 2);
      ok('scale: a plain (non-range) ingredient is completely unaffected',
        sc3.amount === '400' && sc3.unit === 'g' && sc3.amountMax === undefined,
        'got: ' + JSON.stringify(sc3));

      // ── grocery push: range chip shows the scaled range string ────
      currentList = 'grocery';
      listData.grocery = { items: [], hist: [] };
      var rangeRecipe = { name: 'Range Test', servings: 1, ingredients: [
        { amount: 2, amountMax: 3, unit: 'tbsp', name: 'Sugar' }
      ] };
      addRecipeToGroceries(rangeRecipe, 2, true);
      var rItem = listData.grocery.items[0];
      ok('push: a doubled range renders as "4-6 tbsp" in the amount chip',
        rItem && rItem.amount === '4-6 tbsp', 'got: ' + JSON.stringify(rItem && rItem.amount));

      // ── grocery push: compound keeps its original phrasing in the note ─
      listData.grocery = { items: [], hist: [] };
      var yogRecipe = { name: 'Yog Recipe', servings: 1, ingredients: [
        parseIngredients('1 3/4 cup + 2 tbsp Greek yogurt', false)[0]
      ] };
      addRecipeToGroceries(yogRecipe, 1, true);
      var yItem = listData.grocery.items[0];
      ok('push: compound amount lands in the Amount field, scaled via cupToGrams',
        yItem && yItem.amount === '460 g', 'got: ' + JSON.stringify(yItem && yItem.amount));
      ok('push: the original compound phrasing rides in the note (base servings only)',
        yItem && yItem.notes === '1 3/4 cup + 2 tbsp', 'got: ' + JSON.stringify(yItem && yItem.notes));

      // ── editor round-trip: amountMax and compound phrasing re-emit as text ─
      var rb = [
        { id: 900, name: 'Range Recipe', servings: 1, updated: 1,
          ingredients: [ { amount: 2, amountMax: 3, unit: 'tbsp', name: 'Sugar' } ] },
        { id: 901, name: 'Compound Recipe', servings: 1, updated: 1,
          ingredients: [ parseIngredients('1 3/4 cup + 2 tbsp Greek yogurt', false)[0] ] }
      ];
      saveRecipeBook(rb);
      _recipeEditing = false; _recipeView = 'list'; _recipeOpenId = 900;
      openRecipeEditor(900);
      var rangeText = document.getElementById('reIng').value;
      ok('round-trip: a range re-emits as "2-3 tbsp Sugar"', rangeText === '2-3 tbsp Sugar',
        'got: ' + JSON.stringify(rangeText));
      var reparsedRange = parseIngredients(rangeText, false)[0];
      ok('round-trip: re-parsing the emitted range text reproduces the same data',
        reparsedRange.amount === 2 && reparsedRange.amountMax === 3 && reparsedRange.unit === 'tbsp' && reparsedRange.name === 'Sugar',
        'got: ' + JSON.stringify(reparsedRange));

      _recipeOpenId = 901;
      openRecipeEditor(901);
      var compoundText = document.getElementById('reIng').value;
      ok('round-trip: a compound re-emits its ORIGINAL phrasing, not the normalized decimal',
        compoundText === '1 3/4 cup + 2 tbsp Greek yogurt', 'got: ' + JSON.stringify(compoundText));
      var reparsedCompound = parseIngredients(compoundText, false)[0];
      ok('round-trip: re-parsing the emitted compound text reproduces the same summed amount',
        reparsedCompound.amount === 1.875 && reparsedCompound.unit === 'cup' && reparsedCompound.name === 'Greek yogurt',
        'got: ' + JSON.stringify(reparsedCompound));

      // ── recipe detail view: rescue-at-render end-to-end ────────────
      var rb2 = [{ id: 902, name: 'Old Recipe', servings: 1, updated: 1, ingredients: [
        { amount: 1, name: '¾ cups + 2 tbs Greek yogurt' },
        { amount: 2, name: 'to 3 tbsp sugar' }
      ] }];
      saveRecipeBook(rb2);
      _recipeOpenId = 902; _recipeServings = 1; _recipeView = 'detail';
      renderRecipeDetail();
      var html = document.getElementById('recipesContent').innerHTML;
      ok('e2e: the detail view shows the rescued amount, not the stranded leftover text',
        html.indexOf('460') !== -1 && html.indexOf('Greek yogurt') !== -1 && html.indexOf('cups + 2 tbs') === -1,
        'got innerHTML snippet: ' + html.slice(0, 400));
      ok('e2e: the detail view shows a rescued range as "2–3 tbsp"',
        html.indexOf('2–3 tbsp') !== -1, 'got innerHTML snippet: ' + html.slice(0, 800));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
