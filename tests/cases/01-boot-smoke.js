'use strict';

const SECTIONS = ['home', 'lists', 'recipes', 'baby', 'trips', 'train', 'track', 'sports', 'famlog'];

module.exports = {
  name: '01-boot-smoke',
  async run(page) {
    const pass = [];
    const fail = [];

    for (const section of SECTIONS) {
      const before = page.pageErrors.length;
      await page.evaluate('switchSection(' + JSON.stringify(section) + ');');
      if (page.pageErrors.length > before) {
        fail.push({ name: 'switchSection(' + section + ')', detail: page.pageErrors[page.pageErrors.length - 1] });
      } else {
        pass.push('switchSection(' + section + ')');
      }
    }

    // Real DOM clicks on every visible bottom-nav button (not display:none).
    const clicksBefore = page.pageErrors.length;
    const clickResult = await page.evaluate(
      '(function(){' +
        'var btns = Array.prototype.slice.call(document.querySelectorAll(".bottom-nav .bn-btn"))' +
        '  .filter(function(b){ return b.style.display !== "none"; });' +
        'var clicked = [];' +
        'btns.forEach(function(b){ b.click(); clicked.push(b.id); });' +
        'return clicked;' +
        '})()'
    );
    if (page.pageErrors.length > clicksBefore) {
      fail.push({ name: 'bottom-nav clicks', detail: page.pageErrors[page.pageErrors.length - 1] });
    } else if (Array.isArray(clickResult) && clickResult.length > 0) {
      pass.push('bottom-nav clicks: ' + clickResult.join(','));
    } else {
      fail.push({ name: 'bottom-nav clicks', detail: 'no visible .bn-btn buttons found to click' });
    }

    return { pass, fail };
  },
};
