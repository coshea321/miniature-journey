'use strict';

// v483: the security code review of 24/09/2026. Four render paths took stored
// or third-party text into HTML unguarded:
//  - list-item and watchlist links were only checked in their editors, so a
//    synced/restored "javascript:" link rendered live -- now gated at render
//    by applianceLinkUrl(raw, true), which still allows mailto:/tel:;
//  - calLink() put an item's dueDate raw into a single-quoted href;
//  - confirmDialog() renders its message as HTML, and six callers dropped a
//    stored name into it raw;
//  - the Home "Today" sports line added TheSportsDB text unescaped.
// Per the v463 lesson, this also asserts the TRUSTED formats still work: an
// https link, a mailto link and a real due date must all still render.

module.exports = {
  name: '78-link-and-prompt-injection',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // The shared gate.
      ok('gate blocks javascript: with or without the contact flag',
        applianceLinkUrl('javascript:alert(1)') === '' && applianceLinkUrl('javascript:alert(1)', true) === '');
      ok('gate keeps mailto:/tel: only with the contact flag',
        applianceLinkUrl('mailto:a@b.ie', true) === 'mailto:a@b.ie' && applianceLinkUrl('tel:021000', true) === 'tel:021000' &&
        applianceLinkUrl('mailto:a@b.ie') === '');
      ok('gate still passes an https link unchanged', applianceLinkUrl('https://example.com/x', true) === 'https://example.com/x');

      // calLink: hostile date gets no button; a real one still does.
      var evilCal = calLink({ name:'x', dueDate:"2026-01-01' onmouseover='alert(1)" });
      ok('calLink refuses a malformed dueDate', evilCal === '', 'got: ' + evilCal);
      var goodCal = calLink({ name:'Dentist', dueDate:'2026-10-02' });
      ok('calLink still builds a link for a real date', goodCal.indexOf('dates=20261002/20261003') >= 0, 'got: ' + goodCal);

      // List-item link chip at render.
      currentList = 'todo';
      listData.todo = { items: [
        { id: 780001, name: 'Evil link', catId: 'other', done: false, link: 'javascript:window.__x=1' },
        { id: 780002, name: 'Mail link', catId: 'other', done: false, link: 'mailto:gp@example.com' },
        { id: 780003, name: 'Web link',  catId: 'other', done: false, link: 'https://example.com/a' }
      ], hist: [] };
      renderList();
      var hrefs = Array.prototype.map.call(document.querySelectorAll('#listContent a.item-link'), function(a){ return a.getAttribute('href'); });
      ok('no javascript: link chip is rendered', !hrefs.some(function(h){ return /^javascript:/i.test(h); }), 'got: ' + JSON.stringify(hrefs));
      ok('mailto and https link chips still render',
        hrefs.indexOf('mailto:gp@example.com') >= 0 && hrefs.indexOf('https://example.com/a') >= 0, 'got: ' + JSON.stringify(hrefs));

      // confirmDialog: a hostile list-item name at the delete prompt.
      window.__xssHit = 0;
      var evilName = '<img src=x onerror="window.__xssHit=1">';
      confirmDialog('Delete "' + esc(evilName) + '"?', function(){});
      var dlg = document.querySelector('[role=alertdialog]');
      ok('escaped name in a confirm prompt creates no element', dlg && dlg.querySelectorAll('img').length === 0);
      ok('confirm prompt aria-label is the readable text, not entities',
        dlg && dlg.getAttribute('aria-label') === 'Delete "' + evilName + '"?', 'got: ' + (dlg && dlg.getAttribute('aria-label')));
      if (dlg) dlg.parentNode.removeChild(dlg);

      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
