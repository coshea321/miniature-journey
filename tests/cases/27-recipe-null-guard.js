'use strict';

// v385 — a null entry in fl4_recipebook used to crash the entire Recipes
// section. renderRecipes()'s category-collection loop does
// (r.category||"").trim() with no null guard, so one bad record (sync merge
// or CSV import can both produce one — see HEARTH-notes.md § Pending) threw
// before anything rendered, killing the section rather than merely omitting
// the bad row.
//
// Fix is at the source, not the symptom: getRecipeBook() itself now filters
// nulls, so every reader (the list view, Tidy, Week plan, Grocery pick — all
// of which call getRecipeBook() independently) gets clean data from one
// place, rather than patching each call site separately.

const GOOD = { id: 1, name: 'Chicken Curry', category: 'Dinner', notes: '', ingredients: [], method: '', servings: 2, updated: Date.now() };

module.exports = {
  name: '27-recipe-null-guard',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // ── getRecipeBook() itself drops nulls ─────────────────────────────────
    const bookLen = await page.evaluate(
      '(function(){ storeSet("fl4_recipebook", [' + JSON.stringify(GOOD) + ', null]);' +
      'return getRecipeBook().length; })()'
    );
    check('getRecipeBook() filters out a null entry', bookLen === 1, 'returned ' + bookLen + ' entries');

    // ── The list view survives and still renders the good recipe ──────────
    const listResult = await page.evaluate(
      '(function(){ storeSet("fl4_recipebook", [' + JSON.stringify(GOOD) + ', null]);' +
      '_recipeView = "list"; _recipeFilter = "all"; _recipeSearchQuery = "";' +
      'try { switchSection("recipes"); return { ok: true, text: document.getElementById("recipesContent").innerText }; }' +
      'catch (e) { return { ok: false, err: e.message }; } })()'
    );
    check('the Recipes list renders with a null entry present', listResult.ok, listResult.err);
    check('the good recipe still shows up alongside the null', listResult.ok && listResult.text.indexOf('Chicken Curry') !== -1, 'recipe missing from output');

    // ── A null at the front of the book (worst case for a naive filter) ───
    const frontNull = await page.evaluate(
      '(function(){ storeSet("fl4_recipebook", [null, ' + JSON.stringify(GOOD) + ']);' +
      '_recipeView = "list"; _recipeFilter = "all"; _recipeSearchQuery = "";' +
      'try { renderRecipes(); return "ok"; } catch (e) { return "threw: " + e.message; } })()'
    );
    check('a leading null does not crash rendering', frontNull === 'ok', frontNull);

    // ── Sibling views that fetch the book independently also survive ──────
    const tidyResult = await page.evaluate(
      '(function(){ storeSet("fl4_recipebook", [' + JSON.stringify(GOOD) + ', null]);' +
      '_recipeView = "tidy";' +
      'try { renderRecipes(); return "ok"; } catch (e) { return "threw: " + e.message; }' +
      ' finally { _recipeView = "list"; } })()'
    );
    check('the Tidy view survives a null entry in the book', tidyResult === 'ok', tidyResult);

    const planResult = await page.evaluate(
      '(function(){ storeSet("fl4_recipebook", [' + JSON.stringify(GOOD) + ', null]);' +
      '_recipeView = "plan";' +
      'try { renderRecipes(); return "ok"; } catch (e) { return "threw: " + e.message; }' +
      ' finally { _recipeView = "list"; } })()'
    );
    check('the Week plan view survives a null entry in the book', planResult === 'ok', planResult);

    // Reset for any later case file sharing this page.
    await page.evaluate('(function(){ storeSet("fl4_recipebook", [' + JSON.stringify(GOOD) + ']); return true; })()');

    return { pass, fail };
  },
};
