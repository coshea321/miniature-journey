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
        // v452: bnMore opens the overflow sheet rather than a section, so the
        // sweep above leaves it open. Close it before the next assertion runs.
        'closeMoreSheet();' +
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

    // ── Every nav button must actually NAVIGATE (added v450) ───────────────
    //
    // The sweep above clicked every button and only checked that nothing threw.
    // A button wired to nothing at all passes that happily — which is exactly
    // how v449 shipped a Health icon that did nothing when tapped. Two holes,
    // both closed here:
    //
    //   1. It asserted no error, never that the click DID anything. Now each
    //      click must land on the expected section.
    //   2. It skipped display:none buttons — and the opt-in sections (Health,
    //      Plants, Inventory, Sports, Family Log, Train) are hidden by default,
    //      so the newest and least-exercised buttons were the ones never tested.
    //      Now every button is clicked regardless of visibility.
    //
    // NAV_MAP is deliberately hand-written rather than read from the app: the
    // coverage assertion below fails when a button is added to the bar without
    // being added here, which is the prompt to think about whether the new
    // button is wired at all.
    const navResult = await page.evaluate(
      '(function(){' +
        'var NAV_MAP = {' +
          'bnHome:"home", bnLife:"lists", bnTrain:"train", bnRecipes:"recipes",' +
          'bnBaby:"baby", bnTrips:"trips", bnTrack:"track", bnPlants:"plants",' +
          'bnWatch:"watch", bnAppliances:"appliances", bnSports:"sports",' +
          'bnFamlog:"famlog", bnHealth:"health"' +
        '};' +
        // v452: bnMore is the one bar button that is NOT a section — it opens
        // the overflow sheet. Exempt it by name (never by class or by "any id
        // not in the map"), so a genuinely unwired new button still trips the
        // coverage assertion below. tests/cases/59-nav-more.js covers it.
        'var NOT_A_SECTION = ["bnMore"];' +
        'var out = { uncovered: [], dead: [], ok: [] };' +
        'var ids = Array.prototype.map.call(document.querySelectorAll(".bottom-nav .bn-btn"), function(b){ return b.id; });' +
        'ids.forEach(function(id){ if (!NAV_MAP[id] && NOT_A_SECTION.indexOf(id) === -1) out.uncovered.push(id); });' +
        'Object.keys(NAV_MAP).forEach(function(id){' +
          'var btn = document.getElementById(id);' +
          'if (!btn) { out.dead.push(id + " (no such button)"); return; }' +
          // Park somewhere else first, so "it was already there" can never be
          // mistaken for "the click worked".
          'switchSection(id === "bnHome" ? "lists" : "home");' +
          'btn.click();' +
          'if (currentSection === NAV_MAP[id]) out.ok.push(id);' +
          'else out.dead.push(id + " -> " + currentSection + " (expected " + NAV_MAP[id] + ")");' +
        '});' +
        'switchSection("home");' +
        'return out;' +
        '})()'
    );
    if (navResult.uncovered.length) {
      fail.push({
        name: 'every bottom-nav button is covered by NAV_MAP',
        detail: 'not in NAV_MAP (add it, and check it is wired): ' + navResult.uncovered.join(', '),
      });
    } else {
      pass.push('every bottom-nav button is covered by NAV_MAP');
    }
    if (navResult.dead.length) {
      fail.push({
        name: 'every bottom-nav button navigates when tapped',
        detail: 'these did not open their section: ' + navResult.dead.join('; '),
      });
    } else {
      pass.push('every bottom-nav button navigates when tapped (' + navResult.ok.length + ' buttons)');
    }

    return { pass, fail };
  },
};
