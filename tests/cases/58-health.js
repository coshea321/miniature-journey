'use strict';

// Health — the medical history (v449). Same style as 30-watchlist and
// 44-appliances: the data layer (kind table, the three role lists, the sync
// merge contract, the countdown, the file gate, the people list), the backup
// round trip, and the parts of the render a bug would make invisible rather
// than loud — the mixed reverse-chronological History feed, the standing
// groups pinned above it, and escaping.
//
// The gate assertions are the point of the file, not decoration: file urls and
// the phone number are the only things here that become hrefs, and the audit's
// F3 finding was exactly a field gated on save but emitted raw at render.
// Cleans up after itself so later cases see an empty store.
module.exports = {
  name: '58-health',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function day(off){ var d = new Date(); d.setDate(d.getDate() + off);
        function p(n){ return n < 10 ? '0' + n : '' + n; }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

      var saved      = storeGet('fl4_health');
      var savedTombs = storeGet('fl4_tomb_health');

      // ── The kind table ───────────────────────────────────────────────────
      ok('every declared kind resolves to itself',
        HEALTH_KINDS.every(function(k){ return healthKindMeta(k.key).key === k.key; }),
        'got: ' + HEALTH_KINDS.map(function(k){ return healthKindMeta(k.key).key; }).join(','));
      ok('the seven confirmed kinds are all present',
        HEALTH_KINDS.length === 7 &&
        ['visit','diagnosis','condition','test','medication','vaccination','contact']
          .every(function(k){ return HEALTH_KINDS.some(function(x){ return x.key === k; }); }),
        'got: ' + HEALTH_KINDS.map(function(k){ return k.key; }).join(','));
      ok('an unknown kind falls back to visit rather than throwing',
        healthKindMeta('mri-scan').key === 'visit', 'got: ' + healthKindMeta('mri-scan').key);
      ok('a missing kind falls back to visit',
        healthKindMeta(undefined).key === 'visit' && healthKindMeta(null).key === 'visit',
        'got: ' + healthKindMeta(undefined).key);
      // The pre-reframe names must land on the right kind, not on the fallback.
      ok('an "appointment" record from the first cut reads as a visit',
        healthKindMeta('appointment').key === 'visit', 'got: ' + healthKindMeta('appointment').key);
      ok('a "prescription" record from the first cut reads as medication, NOT the fallback',
        healthKindMeta('prescription').key === 'medication', 'got: ' + healthKindMeta('prescription').key);
      ok('every kind has a field set, so healthFields can never return undefined',
        HEALTH_KINDS.every(function(k){ return !!HEALTH_KIND_FIELDS[k.key]; }),
        'missing: ' + HEALTH_KINDS.filter(function(k){ return !HEALTH_KIND_FIELDS[k.key]; }).map(function(k){ return k.key; }).join(','));
      ok('an unknown kind still gets a field set', !!healthFields('mri-scan'), 'got: ' + healthFields('mri-scan'));

      // Roles decide where a record lands. Every kind must have a home, or it
      // renders nowhere and looks like data loss.
      var homeless = HEALTH_KINDS.filter(function(k){
        return HEALTH_UPCOMING_KINDS.indexOf(k.key) === -1 &&
               HEALTH_STANDING_KINDS.indexOf(k.key) === -1 &&
               HEALTH_HISTORY_KINDS.indexOf(k.key) === -1 && k.key !== 'contact';
      });
      ok('every kind has a group to render into', homeless.length === 0,
        'homeless kinds: ' + homeless.map(function(k){ return k.key; }).join(','));
      ok('only things you attend can be upcoming',
        HEALTH_UPCOMING_KINDS.join(',') === 'visit,test', 'got: ' + HEALTH_UPCOMING_KINDS.join(','));
      ok('conditions and medication are standing states, not history events',
        HEALTH_STANDING_KINDS.indexOf('condition') > -1 && HEALTH_STANDING_KINDS.indexOf('medication') > -1 &&
        HEALTH_HISTORY_KINDS.indexOf('condition') === -1 && HEALTH_HISTORY_KINDS.indexOf('medication') === -1,
        'standing: ' + HEALTH_STANDING_KINDS.join(',') + ' | history: ' + HEALTH_HISTORY_KINDS.join(','));

      // ── getHealth null guard (v385/v388 lesson, at the source) ───────────
      storeSet('fl4_health', [null, { id: 1, title: 'Good' }, null]);
      ok('getHealth drops null entries', getHealth().length === 1 && getHealth()[0].title === 'Good',
        'got: ' + JSON.stringify(getHealth()));
      storeSet('fl4_health', 'not an array');
      ok('a non-array store reads as empty rather than throwing', getHealth().length === 0, 'got: ' + JSON.stringify(getHealth()));

      // ── mergeHealthData ──────────────────────────────────────────────────
      var m = mergeHealthData(
        [{ id:1, title:'Local newer', notes:'local', updated:200 }, { id:2, title:'Only local', updated:100 }],
        [{ id:1, title:'Remote older', notes:'remote', updated:100 }, { id:3, title:'Only remote', updated:100 }], {});
      var byId = {}; m.health.forEach(function(r){ byId[r.id] = r; });
      ok('newest-wins keeps the local copy when local is newer', byId[1] && byId[1].title === 'Local newer', 'got: ' + JSON.stringify(byId[1]));
      ok('a record only the partner has is taken', !!byId[3], 'got ids: ' + Object.keys(byId).join(','));
      ok('a record only we have is kept', !!byId[2], 'got ids: ' + Object.keys(byId).join(','));
      ok('push=true when our copy is newer/fuller than what arrived', m.push === true, 'got: ' + m.push);

      var m2 = mergeHealthData([{ id:1, title:'Local older', updated:100 }], [{ id:1, title:'Remote newer', updated:200 }], {});
      ok('newest-wins takes the incoming copy when it is newer', m2.health[0].title === 'Remote newer', 'got: ' + JSON.stringify(m2.health[0]));

      // v296 field-fill: an older build's copy must not wipe fields it never knew.
      var m3 = mergeHealthData([{ id:1, title:'Local', outcome:'what was said', updated:100 }], [{ id:1, title:'Remote', updated:200 }], {});
      ok('a winning copy missing a newer field inherits it rather than wiping it',
        m3.health[0].title === 'Remote' && m3.health[0].outcome === 'what was said', 'got: ' + JSON.stringify(m3.health[0]));
      var m4 = mergeHealthData([{ id:1, title:'Local', phone:'021 1', updated:100 }], [{ id:1, title:'Remote', phone:'', updated:200 }], {});
      ok('a field deliberately cleared to "" stays cleared rather than being refilled',
        m4.health[0].phone === '', 'got: ' + JSON.stringify(m4.health[0]));
      // Files ride INSIDE the record, so an emptied list must behave the same way.
      var m4b = mergeHealthData([{ id:1, title:'Local', files:[{label:'Old',url:'https://example.com/a'}], updated:100 }],
                                [{ id:1, title:'Remote', files:[], updated:200 }], {});
      ok('a files list deliberately emptied stays empty rather than being refilled',
        Array.isArray(m4b.health[0].files) && m4b.health[0].files.length === 0, 'got: ' + JSON.stringify(m4b.health[0]));

      var m5 = mergeHealthData([null, { id:1, title:'Fine', updated:100 }], [null], {});
      ok('nulls on either side of the merge are dropped, not carried through',
        m5.health.length === 1 && m5.health[0].title === 'Fine', 'got: ' + JSON.stringify(m5.health));

      var m6 = mergeHealthData([], [{ id:5, title:'Deleted', updated:100 }], { 5: 200 });
      ok('a tombstone newer than the record drops it', m6.health.length === 0, 'got: ' + JSON.stringify(m6.health));
      var m7 = mergeHealthData([], [{ id:5, title:'Re-added', updated:300 }], { 5: 200 });
      ok('a record re-added after the delete survives its old tombstone',
        m7.health.length === 1 && m7.health[0].title === 'Re-added', 'got: ' + JSON.stringify(m7.health));

      // ── healthCountdownLabel / healthNextAppointment ─────────────────────
      ok('a visit today reads Today',
        healthCountdownLabel({ kind:'visit', date:day(0) }) === 'Today',
        'got: ' + healthCountdownLabel({ kind:'visit', date:day(0) }));
      ok('a visit tomorrow reads Tomorrow',
        healthCountdownLabel({ kind:'visit', date:day(1) }) === 'Tomorrow',
        'got: ' + healthCountdownLabel({ kind:'visit', date:day(1) }));
      ok('a further-out visit counts the days',
        healthCountdownLabel({ kind:'visit', date:day(5) }) === 'In 5 days',
        'got: ' + healthCountdownLabel({ kind:'visit', date:day(5) }));
      ok('a booked test counts down too — it is a thing you attend',
        healthCountdownLabel({ kind:'test', date:day(3) }) === 'In 3 days',
        'got: ' + healthCountdownLabel({ kind:'test', date:day(3) }));
      ok('a past visit has no countdown — it is history now',
        healthCountdownLabel({ kind:'visit', date:day(-1) }) === '',
        'got: ' + healthCountdownLabel({ kind:'visit', date:day(-1) }));
      ok('an undated visit has no countdown',
        healthCountdownLabel({ kind:'visit', date:'' }) === '',
        'got: ' + healthCountdownLabel({ kind:'visit', date:'' }));
      // The Home line is driven off this, so a kind you don't ATTEND must
      // never reach it — a medication start date is not an appointment.
      ok('a dated MEDICATION never produces a countdown',
        healthCountdownLabel({ kind:'medication', date:day(3) }) === '',
        'got: ' + healthCountdownLabel({ kind:'medication', date:day(3) }));
      ok('a dated DIAGNOSIS never produces a countdown',
        healthCountdownLabel({ kind:'diagnosis', date:day(3) }) === '',
        'got: ' + healthCountdownLabel({ kind:'diagnosis', date:day(3) }));
      ok('a null record does not throw', healthCountdownLabel(null) === '', 'got: ' + healthCountdownLabel(null));

      storeSet('fl4_health', [
        { id:901001, kind:'visit', title:'Later one',  date:day(9), updated:1 },
        { id:901002, kind:'visit', title:'Sooner one', date:day(2), updated:1 },
        { id:901003, kind:'visit', title:'Past one',   date:day(-3), updated:1 },
        { id:901004, kind:'medication', title:'A repeat', date:day(1), updated:1 }
      ]);
      var next = healthNextAppointment();
      ok('the next appointment is the soonest FUTURE one', next && next.title === 'Sooner one', 'got: ' + JSON.stringify(next));
      ok('a sooner-dated medication does not win the Home line',
        next && healthKindMeta(next.kind).key === 'visit', 'got: ' + JSON.stringify(next));
      storeSet('fl4_health', [{ id:901003, kind:'visit', title:'Past only', date:day(-3), updated:1 }]);
      ok('with nothing upcoming there is no Home line at all', healthNextAppointment() === null, 'got: ' + JSON.stringify(healthNextAppointment()));

      // ── Files: the gate, the labels, the read-forward of the old field ───
      var ff = healthFileList({ files:[
        { label:'Consultant letter', url:'https://example.com/letter' },
        { label:'', url:'example.com/bare' },
        { label:'Nasty', url:'javascript:alert(1)' },
        { label:'Also nasty', url:'data:text/html,x' },
        null, 'not an object', { label:'No url' }
      ] });
      ok('a good file link passes the gate',
        ff.some(function(f){ return f.url === 'https://example.com/letter' && f.label === 'Consultant letter'; }),
        'got: ' + JSON.stringify(ff));
      ok('a bare domain is normalised to https rather than refused',
        ff.some(function(f){ return f.url === 'https://example.com/bare'; }), 'got: ' + JSON.stringify(ff));
      ok('an unlabelled file still gets a name to tap',
        ff.filter(function(f){ return f.url === 'https://example.com/bare'; })[0].label === 'Document',
        'got: ' + JSON.stringify(ff));
      ok('javascript: and data: urls are dropped AT RENDER TIME, not just on save',
        ff.length === 2, 'got: ' + JSON.stringify(ff));
      ok('junk entries in the files array do not throw',
        healthFileList({ files:'nope' }).length === 0 && healthFileList({}).length === 0 && healthFileList(null).length === 0,
        'got: ' + JSON.stringify(healthFileList({ files:'nope' })));
      // The first cut of v449 had a single unlabelled link field. It is read
      // forward so an early record still shows it — and still gated.
      ok('an old single link is read forward as one file',
        healthFileList({ link:'https://example.com/old' }).length === 1 &&
        healthFileList({ link:'https://example.com/old' })[0].url === 'https://example.com/old',
        'got: ' + JSON.stringify(healthFileList({ link:'https://example.com/old' })));
      ok('an old single link carrying a scheme is still refused',
        healthFileList({ link:'javascript:alert(1)' }).length === 0,
        'got: ' + JSON.stringify(healthFileList({ link:'javascript:alert(1)' })));
      ok('a real files list wins over the legacy link rather than doubling it',
        healthFileList({ link:'https://example.com/old', files:[{ label:'New', url:'https://example.com/new' }] }).length === 1,
        'got: ' + JSON.stringify(healthFileList({ link:'https://example.com/old', files:[{ label:'New', url:'https://example.com/new' }] })));

      // ── The phone gate ──────────────────────────────────────────────────
      ok('a plausible phone number becomes a tel: link built from its digits',
        healthPhoneHref({ phone:'021 123 4567' }) === 'tel:0211234567',
        'got: ' + healthPhoneHref({ phone:'021 123 4567' }));
      ok('an international number keeps its leading +',
        healthPhoneHref({ phone:'+353 21 123 4567' }) === 'tel:+353211234567',
        'got: ' + healthPhoneHref({ phone:'+353 21 123 4567' }));
      ok('a phone field carrying a scheme never becomes an href',
        healthPhoneHref({ phone:'javascript:alert(1)' }) === '' &&
        healthPhoneHref({ phone:'tel:javascript:alert(1)' }) === '',
        'got: ' + healthPhoneHref({ phone:'javascript:alert(1)' }));
      ok('free text in the phone field is shown but not linked',
        healthPhoneHref({ phone:'ask at reception' }) === '', 'got: ' + healthPhoneHref({ phone:'ask at reception' }));
      ok('healthPhoneHref survives a null record', healthPhoneHref(null) === '', 'got: ' + healthPhoneHref(null));

      // ── healthPeople ────────────────────────────────────────────────────
      var ppl = healthPeople([{ person:'Petra' }, { person:'cathal' }, { person:'Cathal' }, { person:'  ' }, {}, null]);
      ok('people are de-duplicated case-insensitively', ppl.length === 2, 'got: ' + JSON.stringify(ppl));
      ok('blank and missing people are ignored', ppl.indexOf('') === -1, 'got: ' + JSON.stringify(ppl));
      ok('people come out sorted', ppl[0].toLowerCase() < ppl[1].toLowerCase(), 'got: ' + JSON.stringify(ppl));

      // ── healthSearchText ────────────────────────────────────────────────
      var st = healthSearchText({ kind:'visit', title:'Back pain', person:'Cathal', who:'Dr Murphy',
                                  outcome:'Sent for an MRI', location:'The Practice', phone:'021 1',
                                  dose:'', notes:'',
                                  files:[{ label:'Referral letter', url:'https://example.com/r' }] });
      ok('search reaches who you saw and what was said',
        st.indexOf('dr murphy') > -1 && st.indexOf('sent for an mri') > -1, 'got: ' + st);
      ok('search reaches a file label, so you can find the letter by its name',
        st.indexOf('referral letter') > -1, 'got: ' + st);
      ok('the kind label is searchable too', st.indexOf('visit') > -1, 'got: ' + st);
      ok('healthSearchText survives a null record', healthSearchText(null) === '', 'got: ' + healthSearchText(null));

      ok('global search labels a health record from its title',
        globalSearchLabel('health', { title:'Dr Murphy' }) === 'Dr Murphy',
        'got: ' + globalSearchLabel('health', { title:'Dr Murphy' }));
      ok('global search still labels other groups from name',
        globalSearchLabel('appliances', { name:'Dishwasher' }) === 'Dishwasher',
        'got: ' + globalSearchLabel('appliances', { name:'Dishwasher' }));
      ok('health is a registered global-search group',
        GLOBAL_SEARCH_GROUPS.some(function(g){ return g.key === 'health'; }),
        'got: ' + GLOBAL_SEARCH_GROUPS.map(function(g){ return g.key; }).join(','));

      // ── delete writes a tombstone; a missing id is a no-op ───────────────
      storeSet('fl4_health', [{ id:901101, kind:'contact', title:'ToDelete', updated: Date.now() }]);
      storeSet('fl4_tomb_health', {});
      var beforeCount = getHealth().length;
      healthDelete(123456789);
      ok('deleting a missing id is a no-op, not a crash', getHealth().length === beforeCount,
        'got: ' + getHealth().length + ' expected ' + beforeCount);
      healthDelete(901101);
      ok('healthDelete removes the record', !getHealth().some(function(r){ return r.id === 901101; }),
        'got: ' + JSON.stringify(getHealth().map(function(r){ return r.id; })));
      ok('healthDelete writes a tombstone', getTombs('health')[901101] != null, 'got: ' + JSON.stringify(getTombs('health')));

      // ── backup round trip ───────────────────────────────────────────────
      storeSet('fl4_health', [{ id:901201, kind:'vaccination', person:'Baby', title:'In the backup',
                                date:day(-10), who:'', dose:'', outcome:'', location:'Clinic', phone:'',
                                link:'', files:[{ label:'Card', url:'https://example.com/card' }], notes:'n', updated:1 }]);
      var payload = buildExportPayload();
      ok('health is included in the export payload',
        Array.isArray(payload.health) && payload.health.some(function(r){ return r.id === 901201; }),
        'got: ' + JSON.stringify(payload.health));
      ok('the kind, the person and the files ride along in the backup',
        payload.health[0].kind === 'vaccination' && payload.health[0].person === 'Baby' &&
        payload.health[0].files.length === 1,
        'got: ' + JSON.stringify(payload.health[0]));

      storeSet('fl4_health', []);
      storeSet('fl4_tomb_health', {});
      var n = importBackupData({ health:[
        { id:901201, kind:'visit', person:'Baby', title:'Restored', link:'',
          files:[{ label:'Good', url:'https://example.com/ok' }], updated:1 },
        { id:901202, kind:'contact', title:'Smuggled', link:'javascript:alert(1)',
          files:[{ label:'Bad', url:'javascript:alert(1)' }, { label:'Fine', url:'https://example.com/fine' }], updated:1 }
      ] });
      ok('a restore adds the records back', getHealth().length === 2, 'got: ' + JSON.stringify(getHealth()));
      ok('the restore is COUNTED, so the toast does not say "nothing new"', n.health === 2, 'got: ' + JSON.stringify(n));
      ok('importedSummary names health records rather than dropping them silently',
        importedSummary(n).indexOf('health record') > -1, 'got: ' + importedSummary(n));
      ok('a good file link survives the import gate',
        getHealth().find(function(r){ return r.id === 901201; }).files[0].url === 'https://example.com/ok',
        'got: ' + JSON.stringify(getHealth().find(function(r){ return r.id === 901201; })));
      var smuggled = getHealth().find(function(r){ return r.id === 901202; });
      ok('a javascript: FILE url in a hand-edited backup is stripped ON IMPORT, keeping the good one',
        smuggled.files.length === 1 && smuggled.files[0].url === 'https://example.com/fine',
        'got: ' + JSON.stringify(smuggled));
      ok('the legacy link field is gated on import too',
        smuggled.link === '', 'got: ' + JSON.stringify(smuggled));

      // ── Render ──────────────────────────────────────────────────────────
      _healthView = 'list'; _healthOpenId = null; _healthPerson = ''; _healthEditing = false;
      storeSet('fl4_health', [
        { id:901301, kind:'visit',       person:'Petra',  title:'Upcoming GP',   date:day(4), time:'14:45', updated:1 },
        { id:901302, kind:'visit',       person:'Cathal', title:'Old Visit',     date:day(-30), who:'Dr Demo',
          outcome:'Sent for a scan.', updated:1 },
        { id:901303, kind:'test',        person:'Cathal', title:'The Scan',      date:day(-20),
          outcome:'Disc bulge.', files:[{ label:'MRI report', url:'https://example.com/mri' }], updated:1 },
        { id:901304, kind:'diagnosis',   person:'Cathal', title:'The Diagnosis', date:day(-18), updated:1 },
        { id:901305, kind:'vaccination', person:'Baby',   title:'The Jab',       date:day(-60), updated:1 },
        { id:901306, kind:'condition',   person:'Cathal', title:'An Allergy',    notes:'tell any dentist', updated:1 },
        { id:901307, kind:'medication',  person:'Cathal', title:'A Tablet',      dose:'10 mg', updated:1 },
        { id:901308, kind:'contact',     person:'',       title:'The Practice',  phone:'021 123 4567', updated:1 }
      ]);
      renderHealth();
      var el = document.getElementById('healthContent');

      ok('an upcoming visit renders with its countdown',
        el.textContent.indexOf('Upcoming GP') > -1 && el.textContent.indexOf('In 4 days') > -1,
        'got: ' + el.textContent.slice(0, 400));

      // The reframe: one mixed reverse-chronological History feed, with the
      // standing groups pinned above it. This is the shape, not a detail.
      ok('there is a single History group, not a group per event kind',
        el.textContent.indexOf('History') > -1 &&
        el.textContent.indexOf('Diagnoses') === -1 && el.textContent.indexOf('Tests & results') === -1 &&
        el.textContent.indexOf('Vaccinations') === -1,
        'got: ' + el.textContent.slice(0, 700));
      ok('the History feed is newest-first and mixes the kinds together',
        el.textContent.indexOf('The Diagnosis') < el.textContent.indexOf('The Scan') &&
        el.textContent.indexOf('The Scan') < el.textContent.indexOf('Old Visit') &&
        el.textContent.indexOf('Old Visit') < el.textContent.indexOf('The Jab'),
        'order: ' + ['The Diagnosis','The Scan','Old Visit','The Jab'].map(function(t){ return t + '@' + el.textContent.indexOf(t); }).join(' '));
      ok('conditions and medication are pinned ABOVE the history, not sorted into it',
        el.textContent.indexOf('An Allergy') < el.textContent.indexOf('The Diagnosis') &&
        el.textContent.indexOf('A Tablet') < el.textContent.indexOf('The Diagnosis'),
        'got: ' + el.textContent.slice(0, 700));
      ok('contacts are listed last — a directory, not an event',
        el.textContent.indexOf('The Practice') > el.textContent.indexOf('The Jab'),
        'contact@' + el.textContent.indexOf('The Practice') + ' jab@' + el.textContent.indexOf('The Jab'));
      ok('an upcoming visit is not ALSO listed in the history',
        el.textContent.split('Upcoming GP').length - 1 === 1,
        'got: ' + (el.textContent.split('Upcoming GP').length - 1) + ' occurrences');
      ok('a record with files shows the paperclip cue on its collapsed row',
        el.textContent.indexOf('\\u{1F4CE}') > -1, 'no paperclip in: ' + el.textContent.slice(0, 700));

      // An undated event must sink to the bottom of the feed, not to 1970.
      var withUndated = getHealth();
      withUndated.push({ id:901309, kind:'diagnosis', person:'Cathal', title:'Undated Thing', date:'', updated:1 });
      storeSet('fl4_health', withUndated);
      renderHealth();
      ok('an undated history entry sinks to the bottom rather than reading as the oldest',
        el.textContent.indexOf('Undated Thing') > el.textContent.indexOf('The Jab'),
        'undated@' + el.textContent.indexOf('Undated Thing') + ' jab@' + el.textContent.indexOf('The Jab'));
      storeSet('fl4_health', withUndated.filter(function(r){ return r.id !== 901309; }));
      renderHealth();

      // Person chips only earn their row when there is a choice to make.
      ok('the person chips show when more than one person is on record',
        el.querySelectorAll('.health-person-chip').length === 4, 'got: ' + el.querySelectorAll('.health-person-chip').length);
      _healthPerson = 'Baby';
      renderHealth();
      ok('filtering by person hides the other people\\'s records',
        el.textContent.indexOf('The Jab') > -1 && el.textContent.indexOf('Old Visit') === -1,
        'got: ' + el.textContent.slice(0, 400));
      storeSet('fl4_health', [{ id:901401, kind:'contact', person:'Cathal', title:'Only Cathal now', updated:1 }]);
      renderHealth();
      ok('a filter whose person has vanished falls back to All rather than an unexplained empty list',
        _healthPerson === '' && el.textContent.indexOf('Only Cathal now') > -1,
        'person: ' + _healthPerson + ' | ' + el.textContent.slice(0, 200));
      ok('with only one person on record the chips are hidden',
        el.querySelectorAll('.health-person-chip').length === 0, 'got: ' + el.querySelectorAll('.health-person-chip').length);

      // The expanded row is where the hrefs actually get emitted.
      storeSet('fl4_health', [{ id:901501, kind:'visit', person:'', title:'Gated Visit',
                               phone:'021 123 4567', outcome:'Said a thing.',
                               files:[{ label:'Letter', url:'https://example.com/p' }], notes:'', updated:1 }]);
      _healthOpenId = 901501;
      renderHealth();
      ok('an expanded visit links its phone number out',
        el.querySelectorAll('a[href="tel:0211234567"]').length === 1,
        'got: ' + Array.prototype.map.call(el.querySelectorAll('a'), function(a){ return a.getAttribute('href'); }).join(' | '));
      ok('an expanded visit links its file out with rel=noopener',
        el.querySelectorAll('a[href="https://example.com/p"]').length === 1 &&
        Array.prototype.every.call(el.querySelectorAll('a[target="_blank"]'), function(a){ return a.rel.indexOf('noopener') > -1; }),
        'got: ' + Array.prototype.map.call(el.querySelectorAll('a'), function(a){ return a.getAttribute('href'); }).join(' | '));
      ok('what was said is shown on the expanded row — it is the point of a visit',
        el.textContent.indexOf('Said a thing.') > -1, 'got: ' + el.textContent.slice(0, 500));

      // A record arriving over sync never passed an editor — the render-time
      // gate is the only thing standing between it and an href.
      storeSet('fl4_health', [{ id:901502, kind:'contact', title:'Hostile',
                               phone:'javascript:alert(1)', link:'javascript:alert(1)',
                               files:[{ label:'X', url:'javascript:alert(1)' }], notes:'', updated:1 }]);
      _healthOpenId = 901502;
      renderHealth();
      ok('a javascript: file url arriving over sync is never emitted as an href',
        el.querySelectorAll('a[href^="javascript"]').length === 0,
        'got: ' + Array.prototype.map.call(el.querySelectorAll('a'), function(a){ return a.getAttribute('href'); }).join(' | '));
      _healthOpenId = null;

      // Titles and dates are user input arriving over sync — never markup.
      storeSet('fl4_health', [{ id:901601, kind:'contact', title:'<img src=x onerror=alert(1)>Bad', notes:'', updated:1 }]);
      renderHealth();
      ok('a title containing markup is escaped, not rendered',
        el.querySelectorAll('img').length === 0 && el.textContent.indexOf('<img') > -1,
        'got img count: ' + el.querySelectorAll('img').length);
      storeSet('fl4_health', [{ id:901602, kind:'vaccination', person:'', notes:'',
                               title:'Dated', date:'2020-01-01\\"><img src=x onerror=alert(1)>', updated:1 }]);
      _healthOpenId = 901602;
      renderHealth();
      ok('a date arriving over sync is escaped, not rendered as markup',
        el.querySelectorAll('img').length === 0, 'got img count: ' + el.querySelectorAll('img').length);
      _healthOpenId = null;

      // Empty state
      storeSet('fl4_health', []);
      renderHealth();
      ok('the empty state says what the section is for',
        el.textContent.indexOf('No history yet') > -1, 'got: ' + el.textContent.slice(0, 200));

      // ── The editor asks only for the fields its kind uses ────────────────
      _healthEditId = null; _healthView = 'editor';
      _healthKindDraft = 'visit';
      renderHealthEditor();
      ok('all seven kinds are offered in the editor',
        document.querySelectorAll('.health-kind-pick').length === 7,
        'got: ' + document.querySelectorAll('.health-kind-pick').length);
      ok('a visit is asked what was said — the substance of a GP visit',
        document.getElementById('hlEdOutRow').style.display === 'block' &&
        document.getElementById('hlEdOutLbl').textContent.indexOf('What was said') > -1,
        'got: ' + document.getElementById('hlEdOutLbl').textContent);
      ok('a visit is asked who you saw', document.getElementById('hlEdWhoRow').style.display === 'block',
        'got: ' + document.getElementById('hlEdWhoRow').style.display);
      ok('a visit is not asked for a dose', document.getElementById('hlEdDoseRow').style.display === 'none',
        'got: ' + document.getElementById('hlEdDoseRow').style.display);

      // Switching kind must relabel IN PLACE, keeping what is already typed —
      // with seven kinds and eight switchable rows, a re-render would lose a lot.
      document.getElementById('hlEdTitle').value = 'Half-typed';
      _healthKindDraft = 'test';
      healthApplyKindToEditor();
      ok('switching kind keeps what is already typed',
        document.getElementById('hlEdTitle').value === 'Half-typed', 'got: ' + document.getElementById('hlEdTitle').value);
      ok('a test relabels "what was said" as the Result',
        document.getElementById('hlEdOutLbl').textContent.indexOf('Result') > -1,
        'got: ' + document.getElementById('hlEdOutLbl').textContent);
      _healthKindDraft = 'medication';
      healthApplyKindToEditor();
      ok('medication is asked for a dose and who prescribed it',
        document.getElementById('hlEdDoseRow').style.display === 'block' &&
        document.getElementById('hlEdWhoLbl').textContent.indexOf('Prescribed by') > -1,
        'got: ' + document.getElementById('hlEdWhoLbl').textContent);
      _healthKindDraft = 'condition';
      healthApplyKindToEditor();
      ok('a condition is asked for neither a phone, a location nor an outcome',
        document.getElementById('hlEdPhoneRow').style.display === 'none' &&
        document.getElementById('hlEdLocRow').style.display === 'none' &&
        document.getElementById('hlEdOutRow').style.display === 'none',
        'got: ' + [document.getElementById('hlEdPhoneRow').style.display,
                   document.getElementById('hlEdLocRow').style.display,
                   document.getElementById('hlEdOutRow').style.display].join('/'));
      ok('a contact is asked for a role rather than who you saw',
        (function(){ _healthKindDraft = 'contact'; healthApplyKindToEditor();
          return document.getElementById('hlEdWhoLbl').textContent.indexOf('Role') > -1; })(),
        'got: ' + document.getElementById('hlEdWhoLbl').textContent);

      // Files are offered for every kind, and rows are appended, not re-rendered.
      ok('the files row is offered', document.getElementById('hlEdFilesRow') !== null, 'no files row');
      var before = document.querySelectorAll('#hlEdFiles .hl-file-row').length;
      healthAddFileRow('', '');
      healthAddFileRow('Letter', 'https://example.com/l');
      ok('adding file rows appends them rather than redrawing the form',
        document.querySelectorAll('#hlEdFiles .hl-file-row').length === before + 2 &&
        document.getElementById('hlEdTitle').value === 'Half-typed',
        'rows: ' + document.querySelectorAll('#hlEdFiles .hl-file-row').length + ' title: ' + document.getElementById('hlEdTitle').value);
      document.querySelectorAll('#hlEdFiles .hl-file-del')[0].click();
      ok('the ✕ removes just that file row',
        document.querySelectorAll('#hlEdFiles .hl-file-row').length === before + 1,
        'got: ' + document.querySelectorAll('#hlEdFiles .hl-file-row').length);

      // An existing record's files come back through the gate, so a refused
      // url is not silently re-offered for saving.
      storeSet('fl4_health', [{ id:901701, kind:'visit', title:'Has files', notes:'', updated:1,
                               files:[{ label:'Good', url:'https://example.com/g' },
                                      { label:'Bad', url:'javascript:alert(1)' }] }]);
      _healthEditId = 901701;
      renderHealthEditor();
      ok('editing a record loads only its gated files back into the form',
        document.querySelectorAll('#hlEdFiles .hl-file-row').length === 1 &&
        document.querySelectorAll('#hlEdFiles .hl-file-url')[0].value === 'https://example.com/g',
        'got: ' + Array.prototype.map.call(document.querySelectorAll('#hlEdFiles .hl-file-url'), function(i){ return i.value; }).join(' | '));

      // ── Prescription expiry (v454) ───────────────────────────────────────
      // The field is medication-only BY THE FIELD TABLE, and the countdown is
      // the thing Home reads, so both are pinned here rather than trusted.
      ok('only medication is asked for a prescription expiry',
        HEALTH_KINDS.filter(function(k){ return !!HEALTH_KIND_FIELDS[k.key].expiry; })
          .map(function(k){ return k.key; }).join(',') === 'medication',
        'got: ' + HEALTH_KINDS.filter(function(k){ return !!HEALTH_KIND_FIELDS[k.key].expiry; })
          .map(function(k){ return k.key; }).join(','));
      function rx(off, kind){ return { id:9018, kind:kind || 'medication', title:'Repeat', notes:'',
                                       updated:1, files:[], expiry: off === null ? '' : day(off) }; }
      ok('a kind that has no expiry field never gets a countdown, whatever is stored',
        healthExpiryDays(rx(3, 'visit')) === null && healthExpirySoonLabel(rx(3, 'visit')) === '',
        'got: ' + healthExpiryDays(rx(3, 'visit')));
      ok('an empty expiry is silent', healthExpiryDays(rx(null)) === null, 'got: ' + healthExpiryDays(rx(null)));
      ok('junk in expiry is silent rather than throwing',
        healthExpiryDays({ kind:'medication', expiry:'not-a-date' }) === null &&
        healthExpirySoonLabel({ kind:'medication', expiry:'2020-01-01"><img src=x>' }) !== undefined,
        'got: ' + healthExpiryDays({ kind:'medication', expiry:'not-a-date' }));
      ok('outside the 14-day window it stays off Home',
        healthExpirySoonLabel(rx(HEALTH_EXPIRY_SOON_DAYS + 1)) === '',
        'got: ' + healthExpirySoonLabel(rx(HEALTH_EXPIRY_SOON_DAYS + 1)));
      ok('the window boundary itself is INSIDE it',
        healthExpirySoonLabel(rx(HEALTH_EXPIRY_SOON_DAYS)) === 'Runs out in ' + HEALTH_EXPIRY_SOON_DAYS + ' days',
        'got: ' + healthExpirySoonLabel(rx(HEALTH_EXPIRY_SOON_DAYS)));
      ok('today, tomorrow and yesterday each read as words',
        healthExpiryLabel(rx(0)) === 'Runs out today' &&
        healthExpiryLabel(rx(1)) === 'Runs out tomorrow' &&
        healthExpiryLabel(rx(-1)) === 'Ran out yesterday',
        'got: ' + [healthExpiryLabel(rx(0)), healthExpiryLabel(rx(1)), healthExpiryLabel(rx(-1))].join(' / '));
      // The confirmed rule, and the one most likely to be "tidied" back into
      // self-suppression by someone copying healthCountdownLabel: an expired
      // repeat is the MOST actionable state, so it never goes quiet.
      ok('an expired repeat STAYS on Home rather than self-suppressing',
        healthExpirySoonLabel(rx(-40)) === 'Ran out 40 days ago' && healthExpiryPast(rx(-40)) === true,
        'got: ' + healthExpirySoonLabel(rx(-40)));
      ok('one still in date is not flagged as past', healthExpiryPast(rx(5)) === false, 'got: ' + healthExpiryPast(rx(5)));

      storeSet('fl4_health', [
        { id:9101, kind:'medication', title:'Far off',  notes:'', updated:1, files:[], expiry:day(90) },
        { id:9102, kind:'medication', title:'Overdue',  notes:'', updated:1, files:[], expiry:day(-6) },
        { id:9103, kind:'medication', title:'Due soon', notes:'', updated:1, files:[], expiry:day(4) },
        { id:9104, kind:'visit',      title:'Not a med', notes:'', updated:1, files:[], expiry:day(1) }
      ]);
      var soon = healthExpiringSoon();
      ok('healthExpiringSoon picks up only the in-window medication, most overdue first',
        soon.length === 2 && soon[0].title === 'Overdue' && soon[1].title === 'Due soon',
        'got: ' + soon.map(function(r){ return r.title; }).join(','));

      // The pill shares the countdown slot, so a record must never show both.
      _healthOpenId = 9102;
      var rowHTML = healthRowHTML(getHealth()[1]);
      ok('an expired repeat renders its pill in red', rowHTML.indexOf('#B03030') > -1, 'no red pill');
      ok('the expiry detail row shows the date as well as the phrase',
        rowHTML.indexOf('Prescription runs out') > -1 && rowHTML.indexOf('Ran out 6 days ago') > -1,
        'no expiry detail row');
      ok('a medication never renders a countdown pill and an expiry pill at once',
        healthCountdownLabel(getHealth()[1]) === '', 'medication got a countdown');
      _healthOpenId = null;

      // The editor row follows the field table, like every other kind-dependent row.
      _healthEditId = null; _healthKindDraft = 'medication';
      renderHealthEditor();
      _healthKindDraft = 'medication'; healthApplyKindToEditor();
      ok('the expiry row is offered for medication',
        document.getElementById('hlEdExpiryRow').style.display !== 'none' &&
        document.getElementById('hlEdExpiryLbl').textContent.indexOf('runs out') > -1,
        'got: ' + document.getElementById('hlEdExpiryRow').style.display);
      _healthKindDraft = 'visit'; healthApplyKindToEditor();
      ok('and hidden for a visit',
        document.getElementById('hlEdExpiryRow').style.display === 'none',
        'got: ' + document.getElementById('hlEdExpiryRow').style.display);
      // The v296 rule: a cleared field must STORE "", never drop the key, or
      // the other device refills it on the next sync.
      document.getElementById('hlEdTitle').value = 'Saved repeat';
      _healthKindDraft = 'medication'; healthApplyKindToEditor();
      document.getElementById('hlEdExpiry').value = '';
      document.getElementById('hlEdSave').click();
      var savedRec = getHealth().filter(function(r){ return r.title === 'Saved repeat'; })[0];
      ok('saving with a blank expiry stores "" rather than dropping the key',
        !!savedRec && savedRec.expiry === '' && savedRec.hasOwnProperty('expiry'),
        'got: ' + JSON.stringify(savedRec && savedRec.expiry));

      // Cleanup
      _healthView = 'list'; _healthOpenId = null; _healthEditId = null; _healthPerson = '';
      _healthEditing = false; _healthCancelFn = null; _healthKindDraft = 'visit';
      if (saved === null || saved === undefined) localStorage.removeItem('fl4_health'); else storeSet('fl4_health', saved);
      if (savedTombs === null || savedTombs === undefined) localStorage.removeItem('fl4_tomb_health'); else storeSet('fl4_tomb_health', savedTombs);

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
