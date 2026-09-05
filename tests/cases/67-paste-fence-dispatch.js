'use strict';

// v464: four paste-import sites (renderPlantImport, renderInventoryImport,
// parsePrepReply, recipesFromImportText) each hand-rolled the same
// strip-fence-then-trim sequence. recipesFromImportText did it in the wrong
// order -- stripped the ``` fence BEFORE trimming -- so a leading blank line
// before the fence (routine from a chat paste: "\n```json\n{...}\n```") left
// the fence in place, the dispatch's `t.charAt(0) === "{"` check failed, and
// it silently fell through to the CSV parser with the UNTOUCHED original
// text. No error, no recipes, no clue why. All four now share ONE helper,
// stripPasteFence() (trim, strip fence, trim again), so the ordering can't
// drift independently again.

module.exports = {
  name: '67-paste-fence-dispatch',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── stripPasteFence() unit checks ──────────────────────────
      ok('strips a leading+trailing fence with a language tag',
        stripPasteFence('\`\`\`json\\n{"a":1}\\n\`\`\`') === '{"a":1}',
        'got: ' + JSON.stringify(stripPasteFence('\`\`\`json\\n{"a":1}\\n\`\`\`')));

      ok('strips a fence with NO language tag',
        stripPasteFence('\`\`\`\\nplain text\\n\`\`\`') === 'plain text',
        'got: ' + JSON.stringify(stripPasteFence('\`\`\`\\nplain text\\n\`\`\`')));

      ok('a leading blank line before the fence no longer defeats the strip (the bug)',
        stripPasteFence('\\n\\n\`\`\`json\\n{"a":1}\\n\`\`\`\\n') === '{"a":1}',
        'got: ' + JSON.stringify(stripPasteFence('\\n\\n\`\`\`json\\n{"a":1}\\n\`\`\`\\n')));

      ok('plain leading/trailing whitespace with no fence is just trimmed',
        stripPasteFence('   hello   ') === 'hello',
        'got: ' + JSON.stringify(stripPasteFence('   hello   ')));

      ok('a non-string input degrades to an empty string rather than throwing',
        stripPasteFence(null) === '' && stripPasteFence(undefined) === '',
        'got: ' + JSON.stringify([stripPasteFence(null), stripPasteFence(undefined)]));

      // ── recipesFromImportText() dispatch: the real regression ──
      var goodJson = JSON.stringify({ hearth: 'recipe-v1', name: 'Fence Test Recipe', servings: 2, ingredients: '1 unit Thing', method: 'Cook it.' });

      // This exact shape -- a leading blank line before the fence -- used to
      // route silently to the CSV parser and produce zero recipes, no error.
      var leadingNewline = '\\n\`\`\`json\\n' + goodJson + '\\n\`\`\`\\n';
      var r1 = recipesFromImportText(leadingNewline);
      ok('a leading-newline-before-fence JSON reply is parsed as JSON, not silently sent to CSV',
        r1.recipes && r1.recipes.length === 1 && r1.recipes[0].name === 'Fence Test Recipe',
        'got: ' + JSON.stringify(r1));

      // A bare object with no fence at all (leading whitespace only) still works.
      var bare = '   ' + goodJson;
      var r2 = recipesFromImportText(bare);
      ok('a bare JSON object (no fence) with leading whitespace is parsed correctly',
        r2.recipes && r2.recipes.length === 1 && r2.recipes[0].name === 'Fence Test Recipe',
        'got: ' + JSON.stringify(r2));

      // Malformed JSON inside a fence, with a leading blank line, must fail
      // LOUDLY with a JSON error -- not silently disappear into the CSV path.
      var malformed = '\\n\`\`\`json\\n{ "hearth": "recipe-v1", oops \\n\`\`\`\\n';
      var r3 = recipesFromImportText(malformed);
      ok('malformed JSON (with a leading blank line before the fence) fails loudly with a JSON error',
        !!r3.error && /JSON/i.test(r3.error) && (!r3.recipes || r3.recipes.length === 0),
        'got: ' + JSON.stringify(r3));

      // Genuine CSV with leading whitespace must still go to the CSV path.
      var csv = '  \\n' + 'title,ingredients,instructions\\nPancakes,1 cup flour,Mix and cook.\\n';
      var r4 = recipesFromImportText(csv);
      ok('real CSV with leading whitespace still dispatches to the CSV parser',
        r4.recipes && r4.recipes.length === 1 && r4.recipes[0].name === 'Pancakes',
        'got: ' + JSON.stringify(r4));

      // ── parsePrepReply(): same helper, JSON path ──────────────
      // Seed a matching recipe so a clean pass proves the FULL round trip
      // (fence stripped, JSON parsed, matched to the book) rather than just
      // "no JSON error" -- matchPrepEntries would report "not in your book"
      // for an id that parsed fine but doesn't exist, which would mask a
      // regression in the id-matching step while still passing on a wrong
      // assertion.
      saveRecipeBook([{ id: 900904, name: 'Prep Fence Test', ingredients: [], updated: 1 }]);
      var prepJson = JSON.stringify({ hearth: 'recipe-prep-v1', id: 900904, prep: 'Chop the onion.' });
      var r5 = parsePrepReply('\\n\`\`\`json\\n' + prepJson + '\\n\`\`\`\\n');
      ok('parsePrepReply still parses a fenced JSON reply with a leading blank line and matches the recipe',
        !r5.error && Array.isArray(r5.rows) && r5.rows.length === 1 && r5.rows[0].prep === 'Chop the onion.',
        'got: ' + JSON.stringify(r5));

      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
