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
      document.getElementById('golfEdSave').click();
      ok('a round with no holes scored is refused', golfRounds().length === 0 && _golfView === 'round');
      var up0 = content.querySelector('.golf-st-up[data-i="0"]');
      up0.click();
      ok('the first tap on an empty hole lands on par', content.querySelector('.golf-st-val[data-i="0"]').textContent === '4');
      up0.click();
      ok('the next tap adds one', content.querySelector('.golf-st-val[data-i="0"]').textContent === '5');
      ok('the running total updates', document.getElementById('golfTotals').textContent.indexOf('Thru 1 of 9') !== -1);
      var dn1 = content.querySelector('.golf-st-dn[data-i="1"]');
      dn1.click();                                       // empty → par (4)
      dn1.click(); dn1.click(); dn1.click(); dn1.click();  // 3, 2, 1, cleared
      ok('minus below 1 clears the hole', content.querySelector('.golf-st-val[data-i="1"]').textContent === '–');
      ok('the back button asks before discarding the round', closeTopOverlay() === true);
      var cfNo = document.getElementById('_cfNo'); if (cfNo) cfNo.click();
      document.getElementById('golfNewBtn').click();
      ok('the header + asks before replacing a half-scored round', !!document.getElementById('_cfNo'));
      var cfNo2 = document.getElementById('_cfNo'); if (cfNo2) cfNo2.click();
      ok('saying no keeps the scores', content.querySelector('.golf-st-val[data-i="0"]').textContent === '5' && _golfEditing === true);
      document.getElementById('golfEdSave').click();
      var saved1 = golfRounds()[0];
      ok('the round saves with the score, blanks stored as ""',
        !!saved1 && saved1.strokes[0] === 5 && saved1.strokes[1] === '' && saved1.strokes.length === 9 && saved1.courseId === 1 && _golfView === 'list');
      ok('the list shows the round, part-played', document.querySelectorAll('#golfContent .golf-round').length === 1 &&
        document.getElementById('golfContent').textContent.indexOf('thru 1') !== -1);

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
      document.getElementById('golfEdCancel').click();
      ok('Cancel leaves the editor', _golfView === 'list' && _golfEditing === false);

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
