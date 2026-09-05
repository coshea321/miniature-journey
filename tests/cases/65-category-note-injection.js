'use strict';

// v463: custom categories arrive UNVALIDATED from three inbound paths (backup
// import, household sync, personal sync) and were rendered raw at eight sites
// -- name/emoji via string concatenation instead of esc(), bg/fg dropped
// straight into a style='...' attribute. A category name/emoji/colour crafted
// to break out of that markup could inject a live element or attribute.
// Notes carry the same shape of bug: n.id was interpolated into single-quoted
// data-noteid attributes with no escaping.
//
// This case feeds a hostile category through the real importBackupData() path
// (not a direct storeSet) and a hostile note id through the real notes store,
// then renders every affected view and asserts nothing executable landed --
// no injected <img>/<svg> element, no script ever ran, and every colour that
// reaches a style attribute is a safe hex value from catColorSafe(), never
// the raw attacker string.

module.exports = {
  name: '65-category-note-injection',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      window.__xssHit = 0;

      var evilCat = {
        id: 'custom_evil',
        name: '<img src=x onerror="window.__xssHit=(window.__xssHit||0)+1">',
        emoji: '<svg onload="window.__xssHit=(window.__xssHit||0)+1">X</svg>',
        bg: "red' onmouseover='window.__xssHit=(window.__xssHit||0)+1",
        fg: 'javascript:alert(1)'
      };

      // The real inbound path: a backup file, not a direct storeSet.
      importBackupData({ customCats: { grocery: [evilCat] } });

      var importedCats = getCustomCats('grocery');
      ok('the hostile category was imported (fields land uninspected, that is the point)',
        importedCats.some(function(c){ return c.id === 'custom_evil'; }),
        'got: ' + JSON.stringify(importedCats));

      currentList = 'grocery';
      listData.grocery = {
        items: [{ id: 900901, name: 'Evil item', catId: 'custom_evil', done: false }],
        hist:  [{ name: 'Evil item', catId: 'custom_evil', count: 1 }]
      };

      renderList();
      renderHistory();
      renderCustomCatsList();
      renderPickerGrid();

      var containers = ['listContent','historyContent','customCatsList','pickerGrid']
        .map(function(id){ return document.getElementById(id); })
        .filter(Boolean);

      var injectedEls = 0;
      containers.forEach(function(el){ injectedEls += el.querySelectorAll('img,svg').length; });

      ok('no <img>/<svg> element from the category was actually created in any of the 4 rendered views',
        injectedEls === 0, 'got ' + injectedEls + ' injected element(s)');

      ok('neither onerror nor onload ever fired', window.__xssHit === 0, 'got: ' + window.__xssHit);

      // Every background/color style pulled from a category must be a safe
      // hex value out of catColorSafe(), never the raw attacker string.
      var styledEls = [];
      containers.forEach(function(el){
        el.querySelectorAll('[style]').forEach(function(node){ styledEls.push(node.getAttribute('style')); });
      });
      var anyRawColor = styledEls.some(function(s){
        return s.indexOf('onmouseover') !== -1 || s.indexOf('javascript:') !== -1;
      });
      ok('the malicious bg/fg strings never reach a style attribute', !anyRawColor, 'got: ' + JSON.stringify(styledEls));

      // The item-pill specifically (the site this category's own item renders
      // through) must show a plain hex background, never the raw attacker string.
      var pill = document.querySelector('#listContent .item-pill');
      ok('the item-pill for this category has a safe hex background',
        !!pill && /background:\\s*#[0-9a-fA-F]{3,8}/.test(pill.getAttribute('style')||''),
        'got: ' + (pill ? pill.getAttribute('style') : 'no .item-pill found'));

      // esc() must still have produced the escaped text somewhere (confirms
      // the fields were rendered, not silently dropped).
      var anyEscapedName = containers.some(function(el){ return el.innerHTML.indexOf('&lt;img src=x') !== -1; });
      ok('the category name was escaped into inert text, not dropped', anyEscapedName, 'got: ' + containers.map(function(el){return el.innerHTML.length;}).join(','));

      // catColorSafe() unit checks.
      ok('catColorSafe accepts a real 6-digit hex', catColorSafe('#AABBCC') === '#AABBCC', 'got: ' + catColorSafe('#AABBCC'));
      ok('catColorSafe accepts a real 3-digit hex', catColorSafe('#abc') === '#abc', 'got: ' + catColorSafe('#abc'));
      ok('catColorSafe rejects an attribute-breakout string', catColorSafe("red' onmouseover='x", '#DEFAULT') === '#DEFAULT', 'got: ' + catColorSafe("red' onmouseover='x", '#DEFAULT'));
      ok('catColorSafe rejects a non-string', catColorSafe(null, '#DEFAULT') === '#DEFAULT', 'got: ' + catColorSafe(null, '#DEFAULT'));
      ok('catColorSafe falls back to its own default with none given', catColorSafe('nonsense') === '#EDEAE4', 'got: ' + catColorSafe('nonsense'));

      // Note ids: same shape of bug, a different store. A hostile id must not
      // break out of the single-quoted data-noteid attribute.
      window.__xssHit2 = 0;
      var evilNote = {
        id: "1' onmouseover='window.__xssHit2=(window.__xssHit2||0)+1",
        title: 'Evil note',
        body: 'body',
        createdAt: 1,
        updatedAt: 1
      };
      storeSet('fl4_notes_global', [evilNote]);
      currentNotesView = 'personal';
      renderNotesSection();
      var notesEl = document.getElementById('notesPersonalView');
      ok('a hostile note id renders with no live onmouseover attribute',
        !notesEl || notesEl.querySelectorAll('[onmouseover]').length === 0,
        'got: ' + (notesEl ? notesEl.innerHTML.slice(0,400) : 'no notesEl'));

      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
