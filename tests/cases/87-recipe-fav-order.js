'use strict';

module.exports = {
  name: '87-recipe-fav-order',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      localStorage.removeItem('fl4_recipe_opens');
      var list = [
        {id:1, name:'banana bread'}, {id:2, name:'Apple pie'}, {id:3, name:'Curry'}, {id:4, name:'Dahl'}
      ];
      var names = function(l){ return l.map(function(r){ return r.name; }).join(','); };

      ok('no opens yet -> alphabetical, case-insensitive', names(sortRecipesByUse(list)) === 'Apple pie,banana bread,Curry,Dahl', names(sortRecipesByUse(list)));

      noteRecipeOpened(4); noteRecipeOpened(4); noteRecipeOpened(3); noteRecipeOpened(1);
      ok('most-opened first, ties alphabetical', names(sortRecipesByUse(list)) === 'Dahl,banana bread,Curry,Apple pie', names(sortRecipesByUse(list)));
      ok('counts stored per recipe id', getRecipeOpens()[4] === 2 && getRecipeOpens()[3] === 1, JSON.stringify(getRecipeOpens()));
      ok('sort does not mutate the input', names(list) === 'banana bread,Apple pie,Curry,Dahl', names(list));

      localStorage.setItem('fl4_recipe_opens', '[1,2]');
      ok('a malformed store reads as empty', Object.keys(getRecipeOpens()).length === 0, JSON.stringify(getRecipeOpens()));
      localStorage.removeItem('fl4_recipe_opens');

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
