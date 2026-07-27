'use strict';

module.exports = {
  name: '15-mealplan-fill-rotation',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ---- mealPlanFillWindow: pure function, direct in-memory fixtures ----
      var rb = [
        {id:1, name:'Never', inRotation:true},                    // lastCooked absent -> 0, first
        {id:2, name:'Old', inRotation:true, lastCooked:100},
        {id:3, name:'Newer', inRotation:true, lastCooked:200},
        {id:4, name:'NotInRotation', inRotation:false, lastCooked:0},
        {id:5, name:'TieA', inRotation:true, lastCooked:50},
        {id:6, name:'TieB', inRotation:true, lastCooked:50}       // same lastCooked as id 5 -> tie-break by id
      ];
      var days = ['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05'];

      var r1 = mealPlanFillWindow(rb, [], days);
      ok('fills every empty day when pool >= days', r1.filledCount === 5 && r1.emptyCount === 5, JSON.stringify(r1));
      ok('never-cooked recipe (lastCooked absent) goes first', r1.entries[0].recipeId === 1, JSON.stringify(r1.entries));
      ok('tie-break by id when lastCooked equal', r1.entries[1].recipeId === 5 && r1.entries[2].recipeId === 6, JSON.stringify(r1.entries));
      ok('excludes recipes not in rotation', !r1.entries.some(function(e){return e.recipeId===4;}), JSON.stringify(r1.entries));

      var plan2 = [{day:'2026-08-01', recipeId:2, servings:2, updated:1}];
      var r2 = mealPlanFillWindow(rb, plan2, days);
      ok('does not touch an already-assigned day', !r2.entries.some(function(e){return e.day==='2026-08-01';}), JSON.stringify(r2.entries));
      ok('empty count excludes the already-assigned day', r2.emptyCount === 4, JSON.stringify(r2));
      ok('recipe already assigned in window is skipped for the rest of the fill', !r2.entries.some(function(e){return e.recipeId===2;}), JSON.stringify(r2.entries));

      var smallPool = [rb[0], rb[1]];
      var r3 = mealPlanFillWindow(smallPool, [], days);
      ok('partial fill when pool smaller than empty days', r3.filledCount === 2 && r3.emptyCount === 5, JSON.stringify(r3));

      // ---- runMealPlanFill: drives the real store (recipebook + mealplan) ----
      saveRecipeBook([
        {id:101, name:'A', servings:2, inRotation:true, lastCooked:0, updated:1},
        {id:102, name:'B', servings:4, inRotation:true, lastCooked:500, updated:1},
        {id:103, name:'C', servings:1, inRotation:false, updated:1}
      ]);
      saveMealPlan([]);
      var result = runMealPlanFill();
      var planAfter = getMealPlan();
      ok('runMealPlanFill partial-fills the 7-day window with only 2 in-rotation recipes', result.filledCount === 2 && result.emptyCount === 7, JSON.stringify(result));
      ok('saved plan reflects the fill', planAfter.filter(function(e){return e.recipeId!=null;}).length === 2, JSON.stringify(planAfter));
      ok('recipe not in rotation never gets assigned', !planAfter.some(function(e){return e.recipeId===103;}), JSON.stringify(planAfter));
      ok('assigned entry uses the recipe base servings', planAfter.some(function(e){return e.recipeId===101 && e.servings===2;}), JSON.stringify(planAfter));

      saveRecipeBook([{id:201, name:'X', inRotation:false, updated:1}]);
      saveMealPlan([]);
      var result2 = runMealPlanFill();
      ok('runMealPlanFill is a no-op when nothing is in rotation', result2.filledCount === 0 && getMealPlan().length === 0, JSON.stringify(result2));

      // ---- mealPlanCurrentWeekKey: Monday-anchor sanity ----
      var mon = new Date(2026,6,27);     // Mon 27 Jul 2026
      var tue = new Date(2026,6,28);     // Tue 28 Jul 2026 -> same week
      var sun = new Date(2026,6,26);     // Sun 26 Jul 2026 -> still the PRECEDING week
      var nextMon = new Date(2026,7,3);  // Mon 3 Aug 2026 -> next week

      ok('Monday maps to itself', mealPlanCurrentWeekKey(mon) === '2026-07-27', mealPlanCurrentWeekKey(mon));
      ok('Tuesday maps to its Monday', mealPlanCurrentWeekKey(tue) === '2026-07-27', mealPlanCurrentWeekKey(tue));
      ok('Sunday maps to the preceding Monday, not the next one', mealPlanCurrentWeekKey(sun) === '2026-07-20', mealPlanCurrentWeekKey(sun));
      ok('the following Monday is a different week key', mealPlanCurrentWeekKey(nextMon) === '2026-08-03', mealPlanCurrentWeekKey(nextMon));

      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
