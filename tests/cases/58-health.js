'use strict';

// Health section (v449). Same style as 30-watchlist and 44-appliances: the data
// layer (kind table, merge contract, the countdown, both link gates, the people
// list), the backup round trip, and the parts of the render a bug would make
// invisible rather than loud — the grouping order, the collapsed Past group,
// the person chips appearing only when there is a choice, and escaping.
//
// The two gate assertions are the point of the file, not decoration: `link` and
// `phone` are the only two fields that become hrefs, and the audit's F3 finding
// was exactly a field gated on save but emitted raw at render. Cleans up after
// itself so later cases see an empty store.
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

      // ── healthKindMeta: an unknown/missing kind must not throw ────────────
      ok('every declared kind resolves to itself',
        HEALTH_KINDS.every(function(k){ return healthKindMeta(k.key).key === k.key; }),
        'got: ' + HEALTH_KINDS.map(function(k){ return healthKindMeta(k.key).key; }).join(','));
      ok('an unknown kind falls back to appointment rather than throwing',
        healthKindMeta('mri-scan').key === 'appointment', 'got: ' + healthKindMeta('mri-scan').key);
      ok('a missing kind falls back to appointment',
        healthKindMeta(undefined).key === 'appointment' && healthKindMeta(null).key === 'appointment',
        'got: ' + healthKindMeta(undefined).key);
      ok('every kind has a field set, so healthFields can never return undefined',
        HEALTH_KINDS.every(function(k){ return !!HEALTH_KIND_FIELDS[k.key]; }),
        'missing: ' + HEALTH_KINDS.filter(function(k){ return !HEALTH_KIND_FIELDS[k.key]; }).map(function(k){ return k.key; }).join(','));
      ok('an unknown kind still gets a field set', !!healthFields('mri-scan'), 'got: ' + healthFields('mri-scan'));

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
      var m3 = mergeHealthData([{ id:1, title:'Local', dose:'10 mg', updated:100 }], [{ id:1, title:'Remote', updated:200 }], {});
      ok('a winning copy missing a newer field inherits it rather than wiping it',
        m3.health[0].title === 'Remote' && m3.health[0].dose === '10 mg', 'got: ' + JSON.stringify(m3.health[0]));
      var m4 = mergeHealthData([{ id:1, title:'Local', phone:'021 1', updated:100 }], [{ id:1, title:'Remote', phone:'', updated:200 }], {});
      ok('a field deliberately cleared to "" stays cleared rather than being refilled',
        m4.health[0].phone === '', 'got: ' + JSON.stringify(m4.health[0]));

      var m5 = mergeHealthData([null, { id:1, title:'Fine', updated:100 }], [null], {});
      ok('nulls on either side of the merge are dropped, not carried through',
        m5.health.length === 1 && m5.health[0].title === 'Fine', 'got: ' + JSON.stringify(m5.health));

      var m6 = mergeHealthData([], [{ id:5, title:'Deleted', updated:100 }], { 5: 200 });
      ok('a tombstone newer than the record drops it', m6.health.length === 0, 'got: ' + JSON.stringify(m6.health));
      var m7 = mergeHealthData([], [{ id:5, title:'Re-added', updated:300 }], { 5: 200 });
      ok('a record re-added after the delete survives its old tombstone',
        m7.health.length === 1 && m7.health[0].title === 'Re-added', 'got: ' + JSON.stringify(m7.health));

      // ── healthCountdownLabel / healthNextAppointment ─────────────────────
      ok('an appointment today reads Today',
        healthCountdownLabel({ kind:'appointment', date:day(0) }) === 'Today',
        'got: ' + healthCountdownLabel({ kind:'appointment', date:day(0) }));
      ok('an appointment tomorrow reads Tomorrow',
        healthCountdownLabel({ kind:'appointment', date:day(1) }) === 'Tomorrow',
        'got: ' + healthCountdownLabel({ kind:'appointment', date:day(1) }));
      ok('a further-out appointment counts the days',
        healthCountdownLabel({ kind:'appointment', date:day(5) }) === 'In 5 days',
        'got: ' + healthCountdownLabel({ kind:'appointment', date:day(5) }));
      ok('a past appointment has no countdown',
        healthCountdownLabel({ kind:'appointment', date:day(-1) }) === '',
        'got: ' + healthCountdownLabel({ kind:'appointment', date:day(-1) }));
      ok('an undated appointment has no countdown',
        healthCountdownLabel({ kind:'appointment', date:'' }) === '',
        'got: ' + healthCountdownLabel({ kind:'appointment', date:'' }));
      // The Home line is driven off this, so a dated prescription must never
      // become an "appointment" on the Today card.
      ok('a dated PRESCRIPTION never produces a countdown (it is not an appointment)',
        healthCountdownLabel({ kind:'prescription', date:day(3) }) === '',
        'got: ' + healthCountdownLabel({ kind:'prescription', date:day(3) }));
      ok('a null record does not throw', healthCountdownLabel(null) === '', 'got: ' + healthCountdownLabel(null));

      storeSet('fl4_health', [
        { id:901001, kind:'appointment', title:'Later one',  date:day(9), updated:1 },
        { id:901002, kind:'appointment', title:'Sooner one', date:day(2), updated:1 },
        { id:901003, kind:'appointment', title:'Past one',   date:day(-3), updated:1 },
        { id:901004, kind:'prescription', title:'A repeat',  date:day(1), updated:1 }
      ]);
      var next = healthNextAppointment();
      ok('the next appointment is the soonest FUTURE one', next && next.title === 'Sooner one', 'got: ' + JSON.stringify(next));
      ok('a sooner-dated prescription does not win the Home line', next && next.kind === 'appointment', 'got: ' + JSON.stringify(next));
      storeSet('fl4_health', [{ id:901003, kind:'appointment', title:'Past only', date:day(-3), updated:1 }]);
      ok('with nothing upcoming there is no Home line at all', healthNextAppointment() === null, 'got: ' + JSON.stringify(healthNextAppointment()));

      // ── The two href gates (audit finding F3, applied from the start) ────
      ok('an http(s) link passes the render-time gate',
        healthLinkUrl({ link:'https://example.com/x' }) === 'https://example.com/x',
        'got: ' + healthLinkUrl({ link:'https://example.com/x' }));
      ok('a bare domain is normalised to https rather than refused',
        healthLinkUrl({ link:'example.com/x' }) === 'https://example.com/x',
        'got: ' + healthLinkUrl({ link:'example.com/x' }));
      ok('a javascript: link is refused AT RENDER TIME, not just on save',
        healthLinkUrl({ link:'javascript:alert(1)' }) === '' &&
        healthLinkUrl({ link:'JaVaScRiPt:alert(1)' }) === '' &&
        healthLinkUrl({ link:'data:text/html,x' }) === '',
        'got: ' + healthLinkUrl({ link:'javascript:alert(1)' }));
      ok('no link reads as no link', healthLinkUrl({}) === '' && healthLinkUrl(null) === '', 'got: ' + healthLinkUrl({}));

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
      var st = healthSearchText({ kind:'prescription', title:'Antihistamine', person:'Cathal',
                                  location:'Demo Pharmacy', phone:'021 1', dose:'10 mg', notes:'repeat' });
      ok('search reaches the fields a list item does not have (dose, person, location)',
        st.indexOf('10 mg') > -1 && st.indexOf('cathal') > -1 && st.indexOf('demo pharmacy') > -1,
        'got: ' + st);
      ok('the kind label is searchable too', st.indexOf('prescription') > -1, 'got: ' + st);
      ok('healthSearchText survives a null record', healthSearchText(null) === '', 'got: ' + healthSearchText(null));

      // Global search must LABEL a health hit from its title — health is the
      // one group that does not key its name off "name", so without the
      // mapping every hit renders "(untitled)".
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
                                date:day(-10), dose:'', location:'Clinic', phone:'', link:'', notes:'n', updated:1 }]);
      var payload = buildExportPayload();
      ok('health is included in the export payload',
        Array.isArray(payload.health) && payload.health.some(function(r){ return r.id === 901201; }),
        'got: ' + JSON.stringify(payload.health));
      ok('the kind and the person ride along in the backup',
        payload.health[0].kind === 'vaccination' && payload.health[0].person === 'Baby',
        'got: ' + JSON.stringify(payload.health[0]));

      storeSet('fl4_health', []);
      storeSet('fl4_tomb_health', {});
      var n = importBackupData({ health:[
        { id:901201, kind:'vaccination', person:'Baby', title:'Restored', link:'https://example.com/ok', updated:1 },
        { id:901202, kind:'contact', title:'Smuggled', link:'javascript:alert(1)', updated:1 }
      ] });
      ok('a restore adds the records back', getHealth().length === 2, 'got: ' + JSON.stringify(getHealth()));
      ok('the restore is COUNTED, so the toast does not say "nothing new"', n.health === 2, 'got: ' + JSON.stringify(n));
      ok('importedSummary names health records rather than dropping them silently',
        importedSummary(n).indexOf('health record') > -1, 'got: ' + importedSummary(n));
      ok('a good link survives the import gate',
        getHealth().find(function(r){ return r.id === 901201; }).link === 'https://example.com/ok',
        'got: ' + JSON.stringify(getHealth().find(function(r){ return r.id === 901201; })));
      ok('a javascript: link in a hand-edited backup file is stripped ON IMPORT',
        getHealth().find(function(r){ return r.id === 901202; }).link === '',
        'got: ' + JSON.stringify(getHealth().find(function(r){ return r.id === 901202; })));

      // ── Render ──────────────────────────────────────────────────────────
      _healthView = 'list'; _healthOpenId = null; _healthPerson = ''; _healthPastOpen = false; _healthEditing = false;
      storeSet('fl4_health', [
        { id:901301, kind:'appointment',  person:'Petra',  title:'Upcoming GP',    date:day(4),  time:'14:45', updated:1 },
        { id:901302, kind:'appointment',  person:'Cathal', title:'Old Dentist',    date:day(-30), updated:1 },
        { id:901303, kind:'prescription', person:'Cathal', title:'A Repeat',       date:day(40), dose:'10 mg', updated:1 },
        { id:901304, kind:'contact',      person:'',       title:'The Practice',   phone:'021 123 4567', link:'https://example.com/p', updated:1 },
        { id:901305, kind:'condition',    person:'Cathal', title:'An Allergy',     notes:'tell any dentist', updated:1 }
      ]);
      renderHealth();
      var el = document.getElementById('healthContent');

      ok('an upcoming appointment renders with its countdown',
        el.textContent.indexOf('Upcoming GP') > -1 && el.textContent.indexOf('In 4 days') > -1,
        'got: ' + el.textContent.slice(0, 400));
      ok('Coming up leads the screen — "what is next" is what it gets asked',
        el.textContent.indexOf('Coming up') > -1 &&
        el.textContent.indexOf('Upcoming GP') < el.textContent.indexOf('A Repeat'),
        'got: ' + el.textContent.slice(0, 400));
      ok('the other kinds render under their own group headings',
        el.textContent.indexOf('Prescriptions') > -1 && el.textContent.indexOf('Contacts') > -1,
        'got: ' + el.textContent.slice(0, 500));
      ok('a past appointment is collapsed out of sight but still counted',
        el.textContent.indexOf('Old Dentist') === -1 && el.textContent.indexOf('Past appointments') > -1,
        'got: ' + el.textContent.slice(0, 600));
      _healthPastOpen = true;
      renderHealth();
      ok('opening the Past group reveals it', el.textContent.indexOf('Old Dentist') > -1, 'got: ' + el.textContent.slice(0, 600));
      // A past appointment must never be listed twice — once under Coming up
      // and again under Past would be the obvious way to get this wrong.
      ok('no record is listed under two groups at once',
        el.textContent.split('Old Dentist').length - 1 === 1, 'got: ' + (el.textContent.split('Old Dentist').length - 1) + ' occurrences');
      _healthPastOpen = false;

      // Person chips only earn their row when there is a choice to make.
      renderHealth();
      ok('the person chips show when more than one person is on record',
        el.querySelectorAll('.health-person-chip').length === 3, 'got: ' + el.querySelectorAll('.health-person-chip').length);
      _healthPerson = 'Petra';
      renderHealth();
      ok('filtering by person hides the other people\\'s records',
        el.textContent.indexOf('Upcoming GP') > -1 && el.textContent.indexOf('A Repeat') === -1,
        'got: ' + el.textContent.slice(0, 400));
      // The chosen person can vanish under a sync from the other phone.
      storeSet('fl4_health', [{ id:901401, kind:'contact', person:'Cathal', title:'Only Cathal now', updated:1 }]);
      renderHealth();
      ok('a filter whose person has vanished falls back to All rather than an unexplained empty list',
        _healthPerson === '' && el.textContent.indexOf('Only Cathal now') > -1,
        'person: ' + _healthPerson + ' | ' + el.textContent.slice(0, 200));
      ok('with only one person on record the chips are hidden',
        el.querySelectorAll('.health-person-chip').length === 0, 'got: ' + el.querySelectorAll('.health-person-chip').length);

      // The expanded row is where the hrefs actually get emitted.
      storeSet('fl4_health', [{ id:901501, kind:'contact', person:'', title:'Gated Contact',
                               phone:'021 123 4567', link:'https://example.com/p', notes:'', updated:1 }]);
      _healthOpenId = 901501;
      renderHealth();
      ok('an expanded contact links its phone number out',
        el.querySelectorAll('a[href="tel:0211234567"]').length === 1,
        'got: ' + Array.prototype.map.call(el.querySelectorAll('a'), function(a){ return a.getAttribute('href'); }).join(' | '));
      ok('an expanded record links its web link out with rel=noopener',
        el.querySelectorAll('a[href="https://example.com/p"]').length === 1 &&
        Array.prototype.every.call(el.querySelectorAll('a[target="_blank"]'), function(a){ return a.rel.indexOf('noopener') > -1; }),
        'got: ' + Array.prototype.map.call(el.querySelectorAll('a'), function(a){ return a.getAttribute('href'); }).join(' | '));

      // A record arriving over sync never passed an editor — the render-time
      // gate is the only thing standing between it and an href.
      storeSet('fl4_health', [{ id:901502, kind:'contact', title:'Hostile',
                               phone:'javascript:alert(1)', link:'javascript:alert(1)', notes:'', updated:1 }]);
      _healthOpenId = 901502;
      renderHealth();
      ok('a javascript: link arriving over sync is never emitted as an href',
        el.querySelectorAll('a[href^="javascript"]').length === 0,
        'got: ' + Array.prototype.map.call(el.querySelectorAll('a'), function(a){ return a.getAttribute('href'); }).join(' | '));
      _healthOpenId = null;

      // A title is user input arriving over sync — it must never render as markup.
      storeSet('fl4_health', [{ id:901601, kind:'contact', title:'<img src=x onerror=alert(1)>Bad', notes:'', updated:1 }]);
      renderHealth();
      ok('a title containing markup is escaped, not rendered',
        el.querySelectorAll('img').length === 0 && el.textContent.indexOf('<img') > -1,
        'got img count: ' + el.querySelectorAll('img').length);

      // The DATE is the non-obvious one: an <input type="date"> can only emit
      // YYYY-MM-DD, but this field also arrives from sync and from a restored
      // backup, and a junk value still splits into three parts on "-".
      storeSet('fl4_health', [{ id:901602, kind:'vaccination', person:'', notes:'',
                               title:'Dated', date:'2020-01-01\"><img src=x onerror=alert(1)>', updated:1 }]);
      _healthOpenId = 901602;
      renderHealth();
      ok('a date arriving over sync is escaped, not rendered as markup',
        el.querySelectorAll('img').length === 0, 'got img count: ' + el.querySelectorAll('img').length);
      _healthOpenId = null;

      // Empty state
      storeSet('fl4_health', []);
      renderHealth();
      ok('the empty state explains what the section is for',
        el.textContent.indexOf('Nothing recorded yet') > -1, 'got: ' + el.textContent.slice(0, 200));

      // ── The editor asks only for the fields its kind uses ────────────────
      _healthEditId = null; _healthView = 'editor';
      _healthKindDraft = 'appointment';
      renderHealthEditor();
      ok('an appointment is asked for a time', document.getElementById('hlEdTimeRow').style.display === 'block',
        'got: ' + document.getElementById('hlEdTimeRow').style.display);
      ok('an appointment is not asked for a dose', document.getElementById('hlEdDoseRow').style.display === 'none',
        'got: ' + document.getElementById('hlEdDoseRow').style.display);
      // Switching kind must relabel IN PLACE, keeping what is already typed —
      // re-rendering the editor here would throw the title away.
      document.getElementById('hlEdTitle').value = 'Half-typed';
      _healthKindDraft = 'prescription';
      healthApplyKindToEditor();
      ok('switching kind keeps what is already typed',
        document.getElementById('hlEdTitle').value === 'Half-typed', 'got: ' + document.getElementById('hlEdTitle').value);
      ok('a prescription is asked for a dose', document.getElementById('hlEdDoseRow').style.display === 'block',
        'got: ' + document.getElementById('hlEdDoseRow').style.display);
      ok('a prescription is not asked for a time', document.getElementById('hlEdTimeRow').style.display === 'none',
        'got: ' + document.getElementById('hlEdTimeRow').style.display);
      _healthKindDraft = 'condition';
      healthApplyKindToEditor();
      ok('a condition is asked for neither a phone nor a location',
        document.getElementById('hlEdPhoneRow').style.display === 'none' &&
        document.getElementById('hlEdLocRow').style.display === 'none',
        'got: ' + document.getElementById('hlEdPhoneRow').style.display + ' / ' + document.getElementById('hlEdLocRow').style.display);

      // Cleanup
      _healthView = 'list'; _healthOpenId = null; _healthEditId = null; _healthPerson = '';
      _healthPastOpen = false; _healthEditing = false; _healthCancelFn = null; _healthKindDraft = 'appointment';
      if (saved === null || saved === undefined) localStorage.removeItem('fl4_health'); else storeSet('fl4_health', saved);
      if (savedTombs === null || savedTombs === undefined) localStorage.removeItem('fl4_tomb_health'); else storeSet('fl4_tomb_health', savedTombs);

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
