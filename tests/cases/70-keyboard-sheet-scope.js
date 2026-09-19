'use strict';

// v475 — the v467 keyboard-sheet helper reached too far, and between its two
// triggers every button inside the session overlay needed two taps:
//
//   * `keyboardSheetOwner` matched ANY fixed element anchored to the bottom,
//     including a FULL-SCREEN panel (#sessionOverlay). That panel then took
//     `max-height:calc(85vh - …)!important` and shrank away from the bottom of
//     the screen, flashing the bottom nav into view behind it.
//   * the focusin listener fired for ANY focused element, so a plain <button>
//     — which opens no keyboard at all — re-laid-out the panel under the
//     finger mid-tap, and the click never landed.
//
// What's worth pinning:
//   1. a real bottom sheet still gets the class (the v467 feature must survive)
//   2. a full-screen fixed panel never does, however it is focused
//   3. only text entry counts — a button, a checkbox and a <select> do not
//   4. the whole path end-to-end: a focusin on a button inside the session
//      overlay leaves the overlay untouched

module.exports = {
  name: '70-keyboard-sheet-scope',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // ── 1. raisesSoftKeyboard: text entry only ─────────────────────────
      function el(tag, type){
        var n = document.createElement(tag);
        if (type) n.setAttribute('type', type);
        return n;
      }
      ok('a text input raises the keyboard', raisesSoftKeyboard(el('input','text')));
      ok('an input with no type reads as text', raisesSoftKeyboard(el('input')));
      ok('a number input raises it', raisesSoftKeyboard(el('input','number')));
      ok('a search input raises it', raisesSoftKeyboard(el('input','search')));
      ok('a textarea raises it', raisesSoftKeyboard(el('textarea')));
      ok('a plain button does NOT', !raisesSoftKeyboard(el('button')));
      ok('an input type=button does NOT', !raisesSoftKeyboard(el('input','button')));
      ok('a checkbox does NOT', !raisesSoftKeyboard(el('input','checkbox')));
      ok('a radio does NOT', !raisesSoftKeyboard(el('input','radio')));
      ok('a date picker does NOT', !raisesSoftKeyboard(el('input','date')));
      ok('a select does NOT', !raisesSoftKeyboard(el('select')));
      ok('a div does NOT', !raisesSoftKeyboard(document.createElement('div')));
      ok('null is handled', !raisesSoftKeyboard(null));

      // ── 2. keyboardSheetOwner: sheets yes, full-screen panels no ───────
      var sheet = document.getElementById('itemSheet');
      var prevSheetDisplay = sheet.style.display;
      sheet.style.display = 'block';
      var probe = document.createElement('input');
      sheet.appendChild(probe);
      ok('a real bottom sheet is still recognised as the owner',
        keyboardSheetOwner(probe) === sheet,
        String(keyboardSheetOwner(probe) && keyboardSheetOwner(probe).id));
      sheet.removeChild(probe);
      sheet.style.display = prevSheetDisplay;

      openYogaSession(1);
      var overlay = document.getElementById('sessionOverlay');
      var inner = document.createElement('input');
      document.getElementById('sesBody').appendChild(inner);
      ok('TRIPWIRE: a full-screen fixed panel is NEVER a sheet owner',
        keyboardSheetOwner(inner) === null,
        String(keyboardSheetOwner(inner) && (keyboardSheetOwner(inner).id || keyboardSheetOwner(inner).tagName)));
      document.getElementById('sesBody').removeChild(inner);

      // ── 3. end-to-end: focusing a button leaves the overlay alone ──────
      var btn = document.querySelector('#sesBody .ses-begin-btn');
      ok('the intro screen really does have a Begin button', !!btn);
      if (btn) {
        btn.dispatchEvent(new FocusEvent('focusin', {bubbles:true}));
        ok('focusing Begin does not offset the session overlay',
          !overlay.classList.contains('keyboard-sheet-offset'));
        ok('and nothing else on the page was offset either',
          document.querySelectorAll('.keyboard-sheet-offset').length === 0,
          String(document.querySelectorAll('.keyboard-sheet-offset').length));
      }
      closeSessionOverlay();

      return {pass:pass, fail:fail};
    })()`);
  },
};
