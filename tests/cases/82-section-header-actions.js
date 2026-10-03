'use strict';

// v496: item 3 of the 28/09/2026 minimal-UI review. Six sections lost the
// coloured action bar under the header: the main add is a "+" in the header,
// the rarely used buttons sit behind a header "⋯" sheet, and the header takes
// the section's colour. Track's full-width "Recording for" row became a small
// picker in its header. Every button keeps its id and original handler.
module.exports = {
  name: '82-section-header-actions',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var hdr = document.querySelector('header');
      // The header fades its colour over .25s; read the end colour, not a mid-fade one.
      var savedTransition = hdr.style.transition; hdr.style.transition = 'none';
      function shown(el){ return !!el && el.offsetParent !== null; }

      var map = {
        recipes:    { add:'recipeNewBtn', more:true,  tools:['recipeImportBtn'],               bg:'rgb(181, 101, 29)' },
        trips:      { add:'tripNewBtn',   more:true,  tools:['tripPackingBtn','tripImportBtn'], bg:'rgb(15, 138, 138)' },
        plants:     { add:'plantNewBtn',  more:true,  tools:['plantImportBtn'],                bg:'rgb(46, 125, 79)' },
        watch:      { add:'watchNewBtn',  more:true,  tools:['watchRandomBtn'],                bg:'rgb(74, 63, 122)' },
        appliances: { add:'applNewBtn',   more:false, tools:[],                                bg:'rgb(62, 92, 107)' },
        health:     { add:'hlNewBtn',     more:false, tools:[],                                bg:'rgb(47, 110, 110)' },
        projects:   { add:'projNewBtn',   more:false, tools:[],                                bg:'rgb(138, 90, 43)' },
        golf:       { add:'golfNewBtn',   more:false, tools:[],                                bg:'rgb(63, 107, 33)' }
      };
      var ov = document.getElementById('secToolsOverlay');
      Object.keys(map).forEach(function(sec){
        var m = map[sec];
        switchSection(sec);
        var add = document.getElementById(m.add);
        ok(sec + ': the + button is in the header and showing', hdr.contains(add) && shown(add));
        ok(sec + ': header takes the section colour', getComputedStyle(hdr).backgroundColor === m.bg, 'got ' + getComputedStyle(hdr).backgroundColor);
        var others = Array.prototype.filter.call(document.querySelectorAll('.hdr-act'), function(el){ return el.getAttribute('data-sec') !== sec && shown(el); });
        ok(sec + ': no other section\\'s header actions are showing', others.length === 0, others.map(function(e){ return e.getAttribute('data-sec'); }).join(','));
        var more = document.querySelector('.hdr-act[data-sec="' + sec + '"] .hdr-more');
        ok(sec + (m.more ? ': has a ⋯ button' : ': has no ⋯ button'), !!more === m.more);
        if (more) {
          more.click();
          ok(sec + ': ⋯ opens the sheet', ov.classList.contains('open'));
          m.tools.forEach(function(id){ ok(sec + ': ' + id + ' is showing in the sheet', shown(document.getElementById(id))); });
          var foreign = Array.prototype.filter.call(ov.querySelectorAll('.sec-tools'), function(g){ return g.getAttribute('data-sec') !== sec && shown(g); });
          ok(sec + ': only this section\\'s tools are in the sheet', foreign.length === 0);
          document.getElementById('secToolsClose').click();
          ok(sec + ': ✕ closes the sheet', !ov.classList.contains('open'));
        }
      });

      // A sheet button still runs its own handler, and closes the sheet.
      switchSection('trips');
      _tripImporting = false;
      document.querySelector('.hdr-act[data-sec="trips"] .hdr-more').click();
      document.getElementById('tripImportBtn').click();
      ok('Import a trip still opens the trip importer', _tripImporting === true);
      ok('using a sheet button closes the sheet', !ov.classList.contains('open'));
      _tripImporting = false; renderTrips();

      // The old coloured bars are gone from the sections.
      ['recipesSection','tripsSection','plantsSection','watchSection','appliancesSection','healthSection'].forEach(function(id){
        ok(id + ' no longer holds an action bar', !document.querySelector('#' + id + ' [aria-label$=" actions"]'));
      });

      // Track: the person picker is a header chip and still resets to Me.
      switchSection('track');
      var tp = document.getElementById('trackPerson');
      ok('Track: the Recording for picker is in the header', hdr.contains(tp) && shown(tp));
      ok('Track: the picker keeps its accessible name', tp.getAttribute('aria-label') === 'Recording for');
      tp.value = 'wife'; tp.dispatchEvent(new Event('change'));
      ok('Track: choosing a person still works', trackPerson() === 'wife');
      switchSection('home'); switchSection('track');
      ok('Track: re-entering Track resets the picker to Me', trackPerson() === 'me');

      switchSection('home');
      hdr.style.transition = savedTransition;
      ok('Home: no section actions in the header', Array.prototype.every.call(document.querySelectorAll('.hdr-act'), function(el){ return !shown(el); }));

      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
