'use strict';

// v463: custom categories arrive UNVALIDATED from three inbound paths (backup
// import, household sync, personal sync) and were rendered raw at eleven
// sites -- name/emoji via string concatenation instead of esc(), bg/fg
// dropped straight into a style='...' attribute. A category name/emoji/
// colour crafted to break out of that markup could inject a live element or
// attribute. Notes carry the same shape of bug: n.id was interpolated into
// single-quoted data-noteid attributes with no escaping.
//
// This case feeds a hostile category through the real importBackupData() path
// (not a direct storeSet) and a hostile note id through the real notes store,
// then renders every affected view and asserts nothing executable landed --
// no injected <img>/<svg> element, no script ever ran, and every colour that
// reaches a style attribute is a safe hex value from catColorSafe(), never
// the raw attacker string.
//
// It ALSO renders a normal item under a real BUILT-IN category alongside the
// hostile one. First-cut fix wrapped emoji in esc() like name -- but every
// real category emoji (built-in and custom alike, since the picker only ever
// assigns from the fixed CAT_EMOJIS list) is stored as ONE HTML numeric
// entity ("&#x1F966;") and rendered RAW so the browser decodes it. esc()'ing
// it turns "&" into "&amp;" and shows the literal entity text on screen
// instead of the emoji -- a real regression Cathal caught from a screenshot
// that the injection assertions above never would have (they only prove
// nothing executable landed, not that legitimate emoji still render). Do NOT
// go back to esc() for the emoji field -- use catEmojiSafe(), which accepts
// only that exact entity shape.

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
        items: [
          { id: 900901, name: 'Evil item', catId: 'custom_evil', done: false },
          { id: 900903, name: 'Normal item', catId: 'produce', done: false }
        ],
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

      // catEmojiSafe() unit checks -- the field esc() would have broken.
      ok('catEmojiSafe accepts a real category entity unchanged', catEmojiSafe('&#x1F966;') === '&#x1F966;', 'got: ' + catEmojiSafe('&#x1F966;'));
      ok('catEmojiSafe rejects a hostile emoji value', catEmojiSafe('<svg onload=x>', '&#xDEF;') === '&#xDEF;', 'got: ' + catEmojiSafe('<svg onload=x>', '&#xDEF;'));
      ok('catEmojiSafe rejects a non-string', catEmojiSafe(null, '&#xDEF;') === '&#xDEF;', 'got: ' + catEmojiSafe(null, '&#xDEF;'));
      ok('catEmojiSafe falls back to its own default with none given', catEmojiSafe('nonsense') === '&#x1F4E6;', 'got: ' + catEmojiSafe('nonsense'));

      // The regression itself: a NORMAL item under a real built-in category
      // (produce, "&#x1F966;") must render as the DECODED emoji character on
      // screen, never as literal "&#x1F966;" text (which is what esc()'ing
      // the entity produces -- "&" becomes "&amp;" and the browser shows the
      // escaped text instead of decoding it).
      var normalPill = Array.prototype.slice.call(document.querySelectorAll('#listContent .item-pill'))
        .filter(function(el){ return el.textContent.indexOf('Produce') !== -1; })[0];
      ok('a real category emoji renders as the decoded character, not literal entity text',
        !!normalPill && normalPill.textContent.indexOf('&#x') === -1 && normalPill.textContent.indexOf('\\uD83E\\uDD66') !== -1,
        'got: ' + (normalPill ? JSON.stringify(normalPill.textContent) : 'no produce pill found'));
      var anyLiteralEntityText = containers.some(function(el){ return el.textContent.indexOf('&#x') !== -1; });
      ok('no container shows literal "&#x" entity text anywhere (the esc()-on-emoji regression)',
        !anyLiteralEntityText, 'got: ' + containers.map(function(el){ return el.textContent.indexOf('&#x'); }).join(','));

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
