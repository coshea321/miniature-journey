'use strict';

// v394 — recipe ingredients render as a bulleted list and the method renders as
// an auto-numbered <ol>. Both are DISPLAY-only: the stored recipe text is never
// rewritten, so an edit still shows exactly what was typed or pasted.
//
// The risk this pins down is the splitting, not the styling. A pasted method is
// either explicitly numbered or it isn't, and both shapes have to survive:
//   - numbered pastes must not double up ("1. 1. Preheat…")
//   - hard-wrapped lines must not explode into fake steps
//   - measures and temperatures at the start of a step ("180C.", "2 - 3 mins")
//     must not be mistaken for step markers and eaten

module.exports = {
  name: '31-recipe-step-list',
  async run(page) {
    // ── the splitter, directly ────────────────────────────────────────────
    const fmt = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function steps(t){ return methodSteps(t).filter(function(s){ return s.type === 'step'; }).map(function(s){ return s.text; }); }
      function heads(t){ return methodSteps(t).filter(function(s){ return s.type === 'head'; }).map(function(s){ return s.text; }); }

      // Explicitly numbered: one step per marker, and the typed number is gone
      // from the text (the <ol> supplies it).
      var numbered = steps('1. Preheat the oven to 200C.\\n2. Mix the flour and sugar.\\n3. Bake for 20 minutes.');
      ok('a numbered method splits into one step per number',
        numbered.length === 3, 'got ' + numbered.length + ': ' + JSON.stringify(numbered));
      ok('the typed numbering is stripped so it cannot double up',
        numbered.every(function(s){ return !/^\\s*\\d/.test(s); }), JSON.stringify(numbered));
      ok('"Step N:" markers are stripped too',
        steps('Step 1: Chop.\\nStep 2: Fry.').join('|') === 'Chop.|Fry.',
        JSON.stringify(steps('Step 1: Chop.\\nStep 2: Fry.')));

      // Hard-wrapped paste: unmarked lines belong to the step above them.
      var wrapped = steps('1. Preheat the oven to 200C and\\nline the tin with baking paper.\\n2. Mix everything.');
      ok('wrapped lines under a numbered step stay in that step',
        wrapped.length === 2 && /line the tin/.test(wrapped[0]),
        'got ' + wrapped.length + ': ' + JSON.stringify(wrapped));

      // Run-together numbering on ONE line still splits (the v250 behaviour).
      ok('run-together numbering on one line still splits',
        steps('1. Preheat. 2. Whisk. 3. Bake.').length === 3,
        JSON.stringify(steps('1. Preheat. 2. Whisk. 3. Bake.')));

      // Unnumbered: one line per step.
      ok('an unnumbered method takes one step per line',
        steps('Preheat the oven.\\nMix the flour.\\nBake.').length === 3,
        JSON.stringify(steps('Preheat the oven.\\nMix the flour.\\nBake.')));

      // Unnumbered wrap: lower-case line after an unfinished sentence rejoins.
      var softWrap = steps('Cream the butter and sugar together\\nuntil pale and fluffy.\\nAdd the eggs.');
      ok('an unnumbered wrapped line rejoins instead of becoming a fake step',
        softWrap.length === 2 && /pale and fluffy/.test(softWrap[0]),
        'got ' + softWrap.length + ': ' + JSON.stringify(softWrap));

      // Bullets in a pasted method become steps without the glyph.
      ok('pasted bullet glyphs are dropped',
        steps('\\u2022 Chop the onion.\\n\\u2022 Fry it.').join('|') === 'Chop the onion.|Fry it.',
        JSON.stringify(steps('\\u2022 Chop the onion.\\n\\u2022 Fry it.')));

      // Sub-headings are not steps.
      var withHead = methodSteps('For the sauce:\\n1. Fry the onion.\\n2. Add tomato.\\nFor the topping:\\n3. Grate cheese.');
      ok('a short line ending in ":" is a heading, not a numbered step',
        heads('For the sauce:\\n1. Fry the onion.\\n2. Add tomato.\\nFor the topping:\\n3. Grate cheese.').join('|') === 'For the sauce|For the topping',
        JSON.stringify(withHead));
      ok('the steps around a heading are still steps',
        withHead.filter(function(s){ return s.type === 'step'; }).length === 3,
        JSON.stringify(withHead));

      // Numbers that are NOT step markers must survive intact.
      var kept = steps('180C. Bake until risen.\\n2 - 3 minutes until golden.\\n1.5 kg is plenty.');
      ok('a temperature, a range and a decimal at the start of a line are not eaten as markers',
        kept.length === 3 && kept[0].indexOf('180C.') === 0 && kept[1].indexOf('2 - 3') === 0 && kept[2].indexOf('1.5 kg') === 0,
        JSON.stringify(kept));

      return {pass:pass, fail:fail};
    })()`);

    // ── the rendered HTML ─────────────────────────────────────────────────
    const html = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var multi = formatMethod('1. Preheat.\\n2. Mix.\\n3. Bake.');
      ok('a multi-step method renders an <ol>', /<ol\\b/.test(multi), multi.slice(0, 120));
      ok('each step is its own <li>', (multi.match(/<li\\b/g) || []).length === 3, multi.slice(0, 200));

      // One block of prose is not a list — a lone "1." in front of it is noise.
      var one = formatMethod('Just mix it all together and bake until done.');
      ok('a single prose block stays a paragraph, unnumbered',
        !/<ol\\b/.test(one) && /<p\\b/.test(one), one);

      // Numbering must continue across a sub-heading rather than restart at 1.
      var headed = formatMethod('1. Fry the onion.\\n2. Add tomato.\\nFor the topping:\\n3. Grate cheese.');
      ok('numbering continues after a sub-heading', /start='3'/.test(headed), headed);

      // Escaping still holds — method text is user input.
      var nasty = formatMethod('Add 5 < 10.\\nUse <b>lots</b> of butter.');
      ok('method text is escaped, not injected as HTML',
        nasty.indexOf('&lt;b&gt;') !== -1 && nasty.indexOf('<b>lots') === -1, nasty);

      ok('an empty method renders nothing', formatMethod('') === '' && formatMethod(null) === '', 'got: ' + JSON.stringify(formatMethod(null)));

      return {pass:pass, fail:fail};
    })()`);

    // ── the detail view, end to end ───────────────────────────────────────
    const view = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      storeSet('fl4_recipebook', [{
        id: 4001, name: 'Test Bake', servings: 2, updated: 1,
        method: '1. Preheat the oven.\\n2. Mix everything.\\n3. Bake for 20 minutes.',
        ingredients: parseIngredients([
          '<b>For the sponge</b>',
          '200 g Flour',
          '2 Eggs'
        ].join('\\n'))
      }]);
      switchSection('recipes');
      _recipeOpenId = 4001; _recipeServings = 2; _recipeView = 'detail'; renderRecipes();

      var el = document.getElementById('recipesContent');
      var lis = Array.prototype.slice.call(el.querySelectorAll('ul li'));
      ok('the detail view renders the ingredients', lis.length === 3, 'got ' + lis.length);

      var bullets = lis.filter(function(li){ return getComputedStyle(li).listStyleType === 'disc'; });
      ok('each ingredient shows a bullet', bullets.length === 2, 'got ' + bullets.length + ' bulleted of ' + lis.length);

      var header = lis.filter(function(li){ return /FOR THE SPONGE|For the sponge/i.test(li.textContent); })[0];
      ok('the section header keeps no bullet',
        header && getComputedStyle(header).listStyleType === 'none',
        header ? getComputedStyle(header).listStyleType : 'header li not found');

      var ol = el.querySelector('ol');
      ok('the method renders as a numbered list', !!ol && ol.querySelectorAll('li').length === 3,
        ol ? ol.querySelectorAll('li').length + ' steps' : 'no <ol> in the detail view');
      ok('the numbers are not also typed into the step text',
        !!ol && ol.innerText.indexOf('1. Preheat') === -1,
        ol ? JSON.stringify(ol.innerText.slice(0, 60)) : 'no <ol>');

      // The stored text is untouched — this is display only.
      var stored = getRecipeBook().find(function(r){ return r.id === 4001; });
      ok('the stored method text is unchanged by rendering',
        stored && stored.method.indexOf('1. Preheat the oven.') === 0,
        stored ? JSON.stringify(stored.method.slice(0, 40)) : 'recipe missing');

      return {pass:pass, fail:fail};
    })()`);

    return {
      pass: [].concat(fmt.pass, html.pass, view.pass),
      fail: [].concat(fmt.fail, html.fail, view.fail),
    };
  },
};
