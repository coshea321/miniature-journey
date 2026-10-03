'use strict';

// Golf (v500). The parts a bug would make quiet rather than loud: Firebase's
// object-shaped arrays at the read boundary, the whole-record merge and its
// tombstones, a round's par snapshot surviving a course edit, part-played
// rounds kept out of best/average, the stepper's first-tap-is-par rule, the
// backup round trip, escaping, and the section being reachable at all.
// Cleans up after itself so later cases see an empty store.
module.exports = {
  name: '86-golf',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var saved = storeGet('fl4_golf'), savedT = storeGet('fl4_tomb_golf');
      var P9 = [4,4,3,5,4,4,3,4,5];
      function course(id, name, extra){
        var o = { id:id, kind:'course', name:name, holes:9, pars:P9.slice(), notes:'', updated:1000 };
        Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; }); return o;
      }
      function round(id, strokes, extra){
        var o = { id:id, kind:'round', date:'2026-09-01', courseId:1, courseName:'Nine', holes:9, pars:P9.slice(), strokes:strokes, notes:'', updated:1000, added:id };
        Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; }); return o;
      }

      // ── Read boundary ────────────────────────────────────────────────────
      storeSet('fl4_golf', [ round(5, { '0':5, '3':6 }), null, { id:7, kind:'someday', x:1 } ]);
      var r5 = golfFind(getGolf(), 5);
      ok('strokes arriving as an object are read as a 9-long array with blanks',
        Array.isArray(r5.strokes) && r5.strokes.length === 9 && r5.strokes[0] === 5 && r5.strokes[3] === 6 && r5.strokes[1] === '',
        JSON.stringify(r5.strokes));
      ok('a null record is dropped, an unknown kind passes through untouched',
        getGolf().length === 2 && golfFind(getGolf(), 7).x === 1);
      ok('a junk par reads as 4', golfNormalise({ kind:'course', holes:9, pars:[0,'x',7] }).pars.slice(0, 3).join() === '4,4,4');

      // ── Stats ────────────────────────────────────────────────────────────
      var s = golfRoundStats(golfNormalise(round(8, [5,4,3,5,'','','','',''])));
      ok('a part-played round totals only the holes played, against their par',
        s.played === 4 && s.strokes === 17 && s.par === 16 && s.toPar === 1 && s.complete === false, JSON.stringify(s));
      ok('to-par reads E / +n / minus n', golfToParText(0) === 'E' && golfToParText(3) === '+3' && golfToParText(-2) === '&minus;2');
      storeSet('fl4_golf', [ course(1, 'Nine'),
        round(10, [5,5,4,6,5,5,4,5,6], { date:'2026-09-01' }),   // 45
        round(11, [4,4,3,5,4,4,3,4,5], { date:'2026-09-08' }),   // 36
        round(12, [3,3,3,'','','','','',''], { date:'2026-09-15' }) ]);
      var sum = golfSummary(9);
      ok('best and average use complete rounds only', sum && sum.count === 2 && sum.best === 36 && sum.avg === 40.5, JSON.stringify(sum));
      ok('no complete 18-hole rounds reads as null', golfSummary(18) === null);
      ok('rounds list newest first', golfRounds().map(function(r){ return r.id; }).join() === '12,11,10');

      // ── Merge ────────────────────────────────────────────────────────────
      var m = mergeGolfData([ round(20, [4,4,4,4,4,4,4,4,4], { updated:2000 }) ],
                            [ round(20, [5,5,5,5,5,5,5,5,5], { updated:1000 }), round(21, [3,3,3,3,3,3,3,3,3]) ], {});
      ok('the newer round wins whole', golfFind(m.golf, 20).strokes[0] === 4);
      ok('a round only the other phone has arrives', !!golfFind(m.golf, 21));
      ok('the newer local copy asks for a converge push', m.push === true);
      var m2 = mergeGolfData([ round(20, [4,4,4,4,4,4,4,4,4], { updated:1000 }) ], [], { 20:5000 });
      ok('a tombstone removes the round', m2.golf.length === 0 && m2.push === true);
      var m3 = mergeGolfData([ round(20, [4,4,4,4,4,4,4,4,4], { notes:'keep', updated:1000 }) ],
                             [ { id:20, kind:'round', strokes:[5,5,5,5,5,5,5,5,5], updated:2000 } ], {});
      ok('an older build\\'s copy cannot drop a field it does not know', golfFind(m3.golf, 20).notes === 'keep');

      // ── Course edit never rewrites a played round ────────────────────────
      storeSet('fl4_golf', [ course(1, 'Nine'), round(30, [4,4,3,5,4,4,3,4,5]) ]);
      openGolfCourse(1);
      document.querySelector('#golfPars .golf-par-up[data-i="0"]').click();
      ok('the par stepper moves the par and the total', document.querySelector('#golfPars .golf-par-val[data-i="0"]').textContent === '5' &&
        document.getElementById('golfParTotal').textContent.indexOf('37') !== -1);
      document.getElementById('golfEdSave').click();
      ok('the course saves the new par', golfFind(getGolf(), 1).pars[0] === 5 && _golfView === 'courses');
      ok('the round keeps the par it was played to', golfFind(getGolf(), 30).pars[0] === 4 && golfRoundStats(golfFind(getGolf(), 30)).toPar === 0);
      openGolfCourse(1);
      var siIn = document.querySelectorAll('#golfPars .golf-si');
      siIn[0].value = '1'; siIn[0].dispatchEvent(new Event('input'));
      document.getElementById('golfEdSave').click();
      ok('a half-filled stroke index is refused', _golfView === 'course' && golfFind(getGolf(), 1).si.join('') === '');
      [5,7,1,9,3,6,2,8,4].forEach(function(v, i){ siIn[i].value = String(v); siIn[i].dispatchEvent(new Event('input')); });
      document.getElementById('golfEdSave').click();
      ok('a full stroke index saves', _golfView === 'courses' && golfFind(getGolf(), 1).si.join() === '5,7,1,9,3,6,2,8,4');

      // ── Round editor ─────────────────────────────────────────────────────
      storeSet('fl4_golf', [ course(1, '<img src=x onerror=window.__gfXss=1>') ]);
      window.__gfXss = 0;
      document.getElementById('bnGolf').click();
      ok('the nav button opens Golf', currentSection === 'golf' && _golfView === 'list');
      document.getElementById('golfNewBtn').click();
      ok('the header + opens a new round', _golfView === 'round' && _golfEditing === true);
      var content = document.getElementById('golfContent');
      ok('the course name is escaped', !content.querySelector('img[src="x"]') && window.__gfXss === 0);
      ok('the only course is pre-selected', content.querySelector('.golf-course-pick[aria-pressed="true"]') !== null);
      // v501 autosave: no Save or Cancel on the round editor, just Done.
      ok('the round editor has Done and no Save/Cancel', !!document.getElementById('golfEdDone') &&
        !document.getElementById('golfEdSave') && !document.getElementById('golfEdCancel'));
      ok('nothing is written before the first score', golfRounds().length === 0 &&
        document.getElementById('golfEdDelete').style.display === 'none');
      // v501: every tap repaints the holes, so re-find the button each time.
      function tap(cls, i){ content.querySelector('.' + cls + '[data-i="' + i + '"]').click(); }
      tap('golf-st-up', 0);
      ok('the first tap on an empty hole lands on par', content.querySelector('.golf-st-val[data-i="0"]').textContent === '4');
      ok('the first score saves the round straight away', golfRounds().length === 1 && golfRounds()[0].strokes[0] === 4 &&
        document.getElementById('golfEdDelete').style.display === 'block');
      tap('golf-st-up', 0);
      ok('the next tap adds one', content.querySelector('.golf-st-val[data-i="0"]').textContent === '5');
      ok('and is saved too, on the same round', golfRounds().length === 1 && golfRounds()[0].strokes[0] === 5);
      ok('the running total updates', document.getElementById('golfTotals').textContent.indexOf('thru 1') !== -1);
      tap('golf-st-dn', 1);                                              // empty → par (4)
      tap('golf-st-dn', 1); tap('golf-st-dn', 1); tap('golf-st-dn', 1); tap('golf-st-dn', 1);  // 3, 2, 1, cleared
      ok('minus below 1 clears the hole', content.querySelector('.golf-st-val[data-i="1"]').textContent === '–');
      ok('clearing a hole is saved as ""', golfRounds()[0].strokes[1] === '');
      // Notes typed but not yet left: saved when the page is hidden.
      document.getElementById('golfEdNotes').value = 'typed before the screen slept';
      _golfAutoSave();
      ok('the hidden-page hook saves a half-typed note', golfRounds()[0].notes === 'typed before the screen slept');
      ok('the back button saves and leaves without asking', closeTopOverlay() === true && !document.getElementById('_cfNo') &&
        _golfView === 'list' && _golfEditing === false);
      openGolfRound(golfRounds()[0].id);
      content = document.getElementById('golfContent');
      tap('golf-st-up', 2);
      document.getElementById('golfNewBtn').click();
      ok('the header + keeps the round and opens a fresh one', !document.getElementById('_cfNo') && _golfView === 'round' &&
        golfRounds()[0].strokes[2] === 3 && content.querySelector('.golf-st-val[data-i="0"]').textContent === '–');
      document.getElementById('golfEdDone').click();
      ok('Done on an unscored round writes nothing', golfRounds().length === 1 && _golfView === 'list');
      var saved1 = golfRounds()[0];
      ok('the round saves with the score, blanks stored as ""',
        !!saved1 && saved1.strokes[0] === 5 && saved1.strokes[1] === '' && saved1.strokes.length === 9 && saved1.courseId === 1 && _golfView === 'list');
      ok('the list shows the round, part-played', document.querySelectorAll('#golfContent .golf-round').length === 1 &&
        document.getElementById('golfContent').textContent.indexOf('thru 2') !== -1);
      openGolfRound(saved1.id);
      document.getElementById('golfEdMyHcp').value = '60';
      document.getElementById('golfEdDone').click();
      ok('Done with an out-of-range handicap warns and stays', _golfView === 'round');
      document.getElementById('golfEdMyHcp').value = '';
      document.getElementById('golfEdDone').click();

      ok('a v500-shaped round reads with no partner, no handicap and blank SI',
        saved1.partner === '' && saved1.myHcp === '' && saved1.pStrokes.length === 9 && saved1.si.join('') === '');
      ok('no SI on the course means no points and a note saying why',
        golfRoundStats(saved1).points === null);

      // ── v501: handicap shots and Stableford ─────────────────────────────
      ok('18 on 18 holes is a shot a hole', golfShots(18, 18, 18) === 1 && golfShots(18, 1, 18) === 1);
      ok('22 adds a second shot on SI 1-4 only', golfShots(22, 4, 18) === 2 && golfShots(22, 5, 18) === 1);
      ok('10 gets shots on SI 1-10 only', golfShots(10, 10, 18) === 1 && golfShots(10, 11, 18) === 0);
      ok('a 9-hole course spreads the handicap over SI 1-9', golfShots(5, 5, 9) === 1 && golfShots(5, 6, 9) === 0 && golfShots(11, 2, 9) === 2);
      ok('a plus 2 gives shots back on SI 17 and 18', golfShots(-2, 18, 18) === -1 && golfShots(-2, 17, 18) === -1 && golfShots(-2, 16, 18) === 0);
      ok('no handicap, no shots', golfShots('', 1, 18) === 0);
      ok('Stableford: net par 2, net birdie 3, net double bogey 0, never negative',
        golfPoints(4, 1, 5) === 2 && golfPoints(4, 1, 4) === 3 && golfPoints(4, 0, 6) === 0 && golfPoints(4, 0, 9) === 0);
      ok('an unplayed hole scores no points', golfPoints(4, 1, '') === null);
      ok('SI check: blank is fine, partial or duplicate is refused',
        golfSiCheck(['','',''], 3) === '' && golfSiCheck([1,'',''], 3) !== '' && golfSiCheck([1,1,2], 3).indexOf('two holes') !== -1 &&
        golfSiCheck([1,2,4], 3) !== '' && golfSiCheck([3,1,2], 3) === '');
      ok('a junk handicap reads as unset', golfHcpOf('abc') === '' && golfHcpOf(60) === '' && golfHcpOf(1.5) === '' && golfHcpOf('12') === 12);

      // Course with SI; a round with a partner, scored through the editor.
      var SI9 = [5,7,1,9,3,6,2,8,4];
      storeSet('fl4_golf', [ course(1, 'Nine', { si: SI9 }),
        round(70, [4,4,3,5,4,4,3,4,5], { date:'2026-08-01', myHcp:9, partner:'Pat <b>', partnerHcp:4, pStrokes:[4,4,3,5,4,4,3,4,5] }) ]);
      ok('known partners come from past rounds with their last handicap',
        golfKnownPartners().length === 1 && golfKnownPartners()[0].hcp === 4);
      openGolfRound(null);
      content = document.getElementById('golfContent');
      ok('a new round defaults your handicap to the last one', document.getElementById('golfEdMyHcp').value === '9');
      ok('the partner datalist offers past partners', content.querySelectorAll('#golfPartnerList option').length === 1);
      var pn = document.getElementById('golfEdPartner');
      pn.value = 'pat <b>'; pn.dispatchEvent(new Event('input'));
      ok('picking a known partner fills their last handicap', document.getElementById('golfEdPHcp').value === '4');
      pn.value = 'Sam'; pn.dispatchEvent(new Event('input'));
      ok('changing to an unknown name clears the filled-in handicap', document.getElementById('golfEdPHcp').value === '');
      var phh = document.getElementById('golfEdPHcp');
      phh.value = '7'; phh.dispatchEvent(new Event('input'));
      pn.value = 'Samuel'; pn.dispatchEvent(new Event('input'));
      ok('a handicap typed by hand is kept when the name changes', phh.value === '7');
      phh.value = ''; phh.dispatchEvent(new Event('input'));
      pn.value = 'pat <b>'; pn.dispatchEvent(new Event('input'));
      ok('the partner name is escaped on the card', !content.querySelector('#golfHoles b, #golfTotals b:not(:first-child)') &&
        content.querySelector('#golfHoles').innerHTML.indexOf('pat &lt;b&gt;') !== -1);
      // 9 vs 4 on nine holes: you get a shot on every hole, Pat on SI 1-4,
      // so you have the advantage on the five holes with SI 5-9.
      var advMe = content.querySelectorAll('.golf-hole[data-adv="me"]').length;
      ok('the advantage holes show before any score is entered', advMe === 5 && content.querySelectorAll('.golf-hole[data-adv="p"]').length === 0, 'got ' + advMe);
      ok('the advantage is on the right holes (SI 5-9)', (function(){
        return Array.prototype.every.call(content.querySelectorAll('.golf-hole[data-adv="me"]'), function(h){ return SI9[+h.dataset.i] >= 5; });
      })());
      var ph = document.getElementById('golfEdPHcp');
      ph.value = '9'; ph.dispatchEvent(new Event('input'));
      ok('equal handicaps, no advantage anywhere', content.querySelectorAll('.golf-hole[data-adv]').length === 0);
      ph.value = '4'; ph.dispatchEvent(new Event('input'));
      tap('golf-st-up', 0); tap('golf-st-up', 0);   // you: 5 on a par 4 with a shot = net par, 2 pts
      tap('golf-ps-up', 0);                         // Pat: 4 on SI 5 (no shot) = par, 2 pts
      ok('both players score points on the card', document.getElementById('golfTotals').textContent.replace(/\\s+/g, ' ').match(/2 pts/g).length === 2,
        document.getElementById('golfTotals').textContent);
      document.getElementById('golfEdDone').click();
      var r2 = golfRounds()[0];
      ok('the round saves partner, both handicaps, both scores and the SI snapshot',
        r2.partner === 'pat <b>' && r2.myHcp === 9 && r2.partnerHcp === 4 && r2.strokes[0] === 5 && r2.pStrokes[0] === 4 && r2.si.join() === SI9.join());
      ok('the rounds list shows the partner and your points',
        document.getElementById('golfContent').textContent.indexOf('with pat <b>') !== -1 && document.getElementById('golfContent').textContent.indexOf('2 pts') !== -1);
      var full = golfPlayerStats(golfNormalise(round(71, [4,4,3,5,4,4,3,4,5], { si:SI9 })), [4,4,3,5,4,4,3,4,5], 9);
      ok('nine pars off 9 on nine holes is 27 points', full.points === 27, JSON.stringify(full));

      // An old round on a course that has since gained SI picks the SI up
      // (never the pars) when it is opened again.
      storeSet('fl4_golf', [ course(1, 'Nine', { si: SI9, pars:[5,4,3,5,4,4,3,4,5] }), round(72, [4,4,3,5,4,4,3,4,5], { myHcp:9 }) ]);
      openGolfRound(72);
      document.getElementById('golfEdDone').click();
      var r72 = golfFind(getGolf(), 72);
      ok('a round re-opened after its course gained SI takes the SI, not the new par',
        r72.si.join() === SI9.join() && r72.pars[0] === 4 && golfRoundStats(r72).points === 27);

      // ── No course yet: + goes to the course editor, then into the round ──
      storeSet('fl4_golf', []);
      renderGolf();
      document.getElementById('golfNewBtn').click();
      ok('with no course, + opens the course editor', _golfView === 'course');
      document.getElementById('golfCoName').value = 'First course';
      document.querySelector('.golf-holes-pick[data-n="9"]').click();
      document.getElementById('golfEdSave').click();
      ok('saving that course carries straight on into a new round on it',
        _golfView === 'round' && golfCourses().length === 1 && golfCourses()[0].holes === 9 &&
        document.querySelectorAll('#golfHoles .golf-st-up').length === 9);
      document.getElementById('golfEdDone').click();
      ok('Done leaves the editor', _golfView === 'list' && _golfEditing === false && golfRounds().length === 0);

      // ── v502: course import ──────────────────────────────────────────────
      var P18 = [4,4,3,5,4,4,3,4,5, 4,3,4,5,4,4,3,4,5], SI18 = [7,11,15,1,3,13,17,9,5, 8,16,12,2,4,10,18,14,6];
      function file(o){ o.hearth = 'golf-course-v1'; return JSON.stringify(o); }
      ok('the AI prompt names the file tag and the fields', (function(){ var t = golfImportPrompt();
        return t.indexOf('"hearth": "golf-course-v1"') !== -1 && t.indexOf('"pars"') !== -1 && t.indexOf('"si"') !== -1; })());
      ok('a non-Hearth paste is refused', !!parseGolfCourseFile('{"name":"X"}').error && !!parseGolfCourseFile('not json').error);
      ok('a wrong par count is refused, naming the course',
        (parseGolfCourseFile(file({ name:'Short', holes:18, pars:[4,4,4] })).error || '').indexOf('Short') === 0);
      ok('a par of 7 is refused, naming the hole',
        (parseGolfCourseFile(file({ name:'Odd', holes:9, pars:[4,4,4,4,7,4,4,4,4] })).error || '').indexOf('hole 5') !== -1);
      ok('a duplicate stroke index is refused',
        !!parseGolfCourseFile(file({ name:'Dup', holes:9, pars:[4,4,4,4,4,4,4,4,4], si:[1,1,2,3,4,5,6,7,8] })).error);
      ok('holes is inferred from the pars when missing, and [] SI means none',
        (function(){ var r = parseGolfCourseFile(file({ name:'Nine', pars:[3,3,3,3,3,3,3,3,3], si:[] }));
          return !r.error && r.courses[0].holes === 9 && r.courses[0].si.join('') === ''; })());
      ok('a fenced paste with a leading blank line still parses',
        !parseGolfCourseFile(stripPasteFence('\\n\\x60\\x60\\x60json\\n' + file({ name:'F', holes:18, pars:P18, si:SI18 }) + '\\n\\x60\\x60\\x60')).error);

      storeSet('fl4_golf', [ course(1, 'Nine', { notes:'keep me' }), round(80, [4,4,3,5,4,4,3,4,5]) ]);
      document.getElementById('bnGolf').click();
      document.querySelector('.hdr-act[data-sec="golf"] .hdr-more').click();
      document.getElementById('golfImportBtn').click();
      ok('Import a course opens from the header ⋯ sheet', _golfView === 'import' && !!document.getElementById('golfImportJson'));
      document.getElementById('golfImportJson').value = file({ courses:[
        { name:' nine ', holes:9, pars:[5,4,3,5,4,4,3,4,5], si:[5,7,1,9,3,6,2,8,4], notes:'' },
        { name:'<b>Links</b>', holes:18, pars:P18, si:SI18, notes:'White tees' } ] });
      document.getElementById('golfImportNext').click();
      var rows = document.querySelectorAll('.golf-imp-row');
      ok('the preview shows one update (same name, ignoring case) and one new',
        rows.length === 2 && rows[0].dataset.action === 'update' && rows[1].dataset.action === 'new');
      ok('nothing is written before Import', golfCourses().length === 1 && golfFind(getGolf(), 1).pars[0] === 4);
      ok('the course name is escaped in the preview', !document.querySelector('#golfContent .golf-imp-row b'));
      document.getElementById('golfImportGo').click();
      var nine = golfFind(getGolf(), 1);
      ok('the matching course is updated: pars and SI replaced, name from the file, notes kept when the file has none',
        nine.pars[0] === 5 && nine.si.join() === '5,7,1,9,3,6,2,8,4' && nine.name === 'nine' && nine.notes === 'keep me');
      ok('the new course is added with its SI and notes', golfCourses().length === 2 &&
        golfCourses().some(function(c){ return c.name === '<b>Links</b>' && c.holes === 18 && golfSiComplete(c.si, 18) && c.notes === 'White tees'; }));
      ok('a round already played keeps the par it was played to', golfFind(getGolf(), 80).pars[0] === 4);
      ok('Import lands on the Courses list', _golfView === 'courses');
      ok('two saved courses with the same name are skipped, not guessed',
        golfImportPlan([{ name:'Twin', holes:9, pars:[], si:[], notes:'' }]).length === 1 &&
        (function(){ storeSet('fl4_golf', [ course(1, 'Twin'), course(2, 'twin') ]);
          return golfImportPlan([{ name:'Twin', holes:9, pars:P9, si:[], notes:'' }])[0].action === 'skip'; })());

      // ── Backup round trip ────────────────────────────────────────────────
      storeSet('fl4_golf', []);
      storeSet('fl4_tomb_golf', { 40:Date.now() });
      var imp = importBackupData({ golf: [ round(40, [4,4,3,5,4,4,3,4,5]) ] });
      ok('a restore brings the round back and counts it', !!golfFind(getGolf(), 40) && imp.golf === 1, JSON.stringify(imp));
      ok('a restore clears its tombstone', !getTombs('golf')[40]);
      ok('the export payload carries golf', Array.isArray(buildExportPayload().golf) && buildExportPayload().golf.length === 1);
      golfDelete(40);
      ok('deleting writes a tombstone', getGolf().length === 0 && !!getTombs('golf')[40]);

      // ── Clean up ─────────────────────────────────────────────────────────
      storeSet('fl4_golf', saved || []); if (saved == null) localStorage.removeItem('fl4_golf');
      storeSet('fl4_tomb_golf', savedT || {}); if (savedT == null) localStorage.removeItem('fl4_tomb_golf');
      _golfView = 'list'; _golfEditId = null;
      switchSection('home');
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
