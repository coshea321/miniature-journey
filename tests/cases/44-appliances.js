'use strict';

// Appliances section (v424). Covers the data layer (merge contract, the
// warranty read, the area helpers, the search haystack) plus the parts of the
// render a bug would make invisible rather than loud — the copy affordance
// being on the model and serial rows only, a manual link being escaped and
// carrying rel=noopener, and the area chips appearing only when there's a
// choice to make. Same style as 22-plants / 30-watchlist. Cleans up after
// itself so later cases see an empty store.
module.exports = {
  name: '44-appliances',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var saved      = storeGet('fl4_appliances');
      var savedTombs = storeGet('fl4_tomb_appliances');

      // ── getAppliances null guard (v385/v388 lesson, at the source) ────────
      storeSet('fl4_appliances', [null, { id: 1, name: 'Good' }, null]);
      ok('getAppliances drops null entries', getAppliances().length === 1 && getAppliances()[0].name === 'Good',
        'got: ' + JSON.stringify(getAppliances()));
      storeSet('fl4_appliances', 'not an array');
      ok('a non-array store reads as empty rather than throwing', getAppliances().length === 0, 'got: ' + JSON.stringify(getAppliances()));

      // ── mergeApplianceData ───────────────────────────────────────────────
      var m = mergeApplianceData(
        [{ id:1, name:'Local newer', model:'L', updated:200 }, { id:2, name:'Only local', updated:100 }],
        [{ id:1, name:'Remote older', model:'R', updated:100 }, { id:3, name:'Only remote', updated:100 }], {});
      var byId = {}; m.appliances.forEach(function(a){ byId[a.id] = a; });
      ok('newest-wins keeps the local copy when local is newer', byId[1] && byId[1].name === 'Local newer', 'got: ' + JSON.stringify(byId[1]));
      ok('a record only the partner has is taken', !!byId[3], 'got ids: ' + Object.keys(byId).join(','));
      ok('a record only we have is kept', !!byId[2], 'got ids: ' + Object.keys(byId).join(','));
      ok('push=true when our copy is newer/fuller than what arrived', m.push === true, 'got: ' + m.push);

      var m2 = mergeApplianceData([{ id:1, name:'Local older', updated:100 }], [{ id:1, name:'Remote newer', updated:200 }], {});
      ok('newest-wins takes the incoming copy when it is newer', m2.appliances[0].name === 'Remote newer', 'got: ' + JSON.stringify(m2.appliances[0]));

      // v296 field-fill: an older build's copy must not wipe fields it never knew.
      var m3 = mergeApplianceData([{ id:1, name:'Local', serial:'ABC123', updated:100 }], [{ id:1, name:'Remote', updated:200 }], {});
      ok('a winning copy missing a newer field inherits it rather than wiping it',
        m3.appliances[0].name === 'Remote' && m3.appliances[0].serial === 'ABC123', 'got: ' + JSON.stringify(m3.appliances[0]));
      var m4 = mergeApplianceData([{ id:1, name:'Local', notes:'old', updated:100 }], [{ id:1, name:'Remote', notes:'', updated:200 }], {});
      ok('a field deliberately cleared to "" stays cleared', m4.appliances[0].notes === '', 'got: ' + JSON.stringify(m4.appliances[0]));

      var m5 = mergeApplianceData([null, { id:1, name:'Fine', updated:100 }], [null], {});
      ok('nulls on either side of the merge are dropped, not carried through',
        m5.appliances.length === 1 && m5.appliances[0].name === 'Fine', 'got: ' + JSON.stringify(m5.appliances));

      var m6 = mergeApplianceData([], [{ id:5, name:'Deleted', updated:100 }], { 5: 200 });
      ok('a tombstone newer than the record drops it', m6.appliances.length === 0, 'got: ' + JSON.stringify(m6.appliances));
      var m7 = mergeApplianceData([], [{ id:5, name:'Re-added', updated:300 }], { 5: 200 });
      ok('a record re-added after the delete survives its old tombstone',
        m7.appliances.length === 1 && m7.appliances[0].name === 'Re-added', 'got: ' + JSON.stringify(m7.appliances));

      // ── Warranty: shown, never nagged ────────────────────────────────────
      // Dates are compared as YYYY-MM-DD STRINGS, never parsed — a date-only
      // value parsed as UTC and read back locally is how off-by-one starts.
      var todayISO = applianceTodayISO();
      ok('applianceTodayISO is a plain YYYY-MM-DD string', /^\\d{4}-\\d{2}-\\d{2}$/.test(todayISO), 'got: ' + todayISO);
      ok('no warranty date reads as none, with no text',
        applianceWarranty({}).state === 'none' && applianceWarranty({ warranty:'' }).text === '' &&
        applianceWarranty(null).state === 'none', 'got: ' + JSON.stringify(applianceWarranty({})));
      ok('junk in the warranty field reads as none rather than throwing',
        applianceWarranty({ warranty:'next year' }).state === 'none' &&
        applianceWarranty({ warranty:'2028' }).state === 'none',
        'got: ' + applianceWarranty({ warranty:'next year' }).state);
      ok('a future date reads as in warranty', applianceWarranty({ warranty:'2099-01-01' }).state === 'in',
        'got: ' + JSON.stringify(applianceWarranty({ warranty:'2099-01-01' })));
      ok('a past date reads as out of warranty', applianceWarranty({ warranty:'2001-01-01' }).state === 'out',
        'got: ' + JSON.stringify(applianceWarranty({ warranty:'2001-01-01' })));
      ok('a warranty ending TODAY still counts as in warranty (it has not expired yet)',
        applianceWarranty({ warranty:todayISO }).state === 'in', 'got: ' + JSON.stringify(applianceWarranty({ warranty:todayISO })));
      ok('the warranty text carries the date in DD/MM/YYYY',
        applianceWarranty({ warranty:'2099-03-12' }).text.indexOf('12/03/2099') > -1,
        'got: ' + applianceWarranty({ warranty:'2099-03-12' }).text);
      ok('applianceDateLabel refuses anything that is not YYYY-MM-DD',
        applianceDateLabel('') === '' && applianceDateLabel('12/03/2099') === '' && applianceDateLabel(null) === '',
        'got: ' + applianceDateLabel('12/03/2099'));

      // ── Areas (reusing the v379 plant helpers) ───────────────────────────
      var areaSet = [{ id:1, name:'A', area:'Kitchen' }, { id:2, name:'B', area:'kitchen' },
                     { id:3, name:'C', area:'Utility' }, { id:4, name:'D', area:'' }];
      ok('areas group case-insensitively rather than splitting a second chip',
        applianceAreas(areaSet).length === 2, 'got: ' + JSON.stringify(applianceAreas(areaSet)));
      ok('filtering by an area is case-insensitive too',
        appliancesInArea(areaSet, 'KITCHEN').length === 2, 'got: ' + appliancesInArea(areaSet, 'KITCHEN').length);
      ok('the no-area filter finds only the untagged ones',
        appliancesInArea(areaSet, PLANT_AREA_NONE).length === 1, 'got: ' + appliancesInArea(areaSet, PLANT_AREA_NONE).length);
      ok('no filter returns everything', appliancesInArea(areaSet, '').length === 4, 'got: ' + appliancesInArea(areaSet, '').length);

      // ── Search haystack: the numbers are the whole point ─────────────────
      var rec = { id:1, name:'Dishwasher', brand:'Bosch', model:'SMS4HVI33E', serial:'FD9920014', fd:'0603',
                  area:'Kitchen', boughtFrom:'Harvey Norman', notes:'Salt cap under the basket' };
      ok('the model number is searchable', applianceSearchText(rec).indexOf('sms4hvi33e') > -1, 'got: ' + applianceSearchText(rec));
      ok('the serial number is searchable', applianceSearchText(rec).indexOf('fd9920014') > -1, 'got: ' + applianceSearchText(rec));
      ok('the FD number is searchable', applianceSearchText(rec).indexOf('0603') > -1, 'got: ' + applianceSearchText(rec));
      ok('brand, area, retailer and notes are all searchable',
        ['bosch','kitchen','harvey norman','salt cap'].every(function(t){ return applianceSearchText(rec).indexOf(t) > -1; }),
        'got: ' + applianceSearchText(rec));
      ok('applianceSearchText survives a null record', applianceSearchText(null) === '', 'got: ' + applianceSearchText(null));

      // Global search must actually reach it — the section has no nav icon by
      // default, so search is its main door in.
      storeSet('fl4_appliances', [{ id:900401, name:'Dishwasher', brand:'Bosch', model:'SMS4HVI33E',
                                    serial:'FD9920014', area:'Kitchen', notes:'', updated:1 }]);
      var gs = globalSearch('sms4hvi33e');
      ok('global search finds an appliance by its model number',
        gs.groups.some(function(g){ return g.key === 'appliances' && g.items.length === 1; }),
        'got: ' + JSON.stringify(gs.groups.map(function(g){ return g.key + ':' + g.items.length; })));
      var gs2 = globalSearch('fd9920014');
      ok('global search finds an appliance by its serial number',
        gs2.groups.some(function(g){ return g.key === 'appliances' && g.items.length === 1; }),
        'got: ' + JSON.stringify(gs2.groups.map(function(g){ return g.key + ':' + g.items.length; })));

      // ── delete writes a tombstone ────────────────────────────────────────
      storeSet('fl4_appliances', [{ id:900402, name:'ToDelete', updated: Date.now() }]);
      storeSet('fl4_tomb_appliances', {});
      applianceDelete(900402);
      var confirmYes = document.querySelector('[role="alertdialog"] button');
      ok('deleting asks first rather than removing on the tap', !!confirmYes && getAppliances().length === 1,
        'got: ' + getAppliances().length + ' record(s), dialog: ' + !!confirmYes);
      // Click the confirm dialog's destructive button (the second one).
      var dlgBtns = document.querySelectorAll('[role="alertdialog"] button');
      dlgBtns[dlgBtns.length - 1].click();
      ok('confirming removes the record', !getAppliances().some(function(a){ return a.id === 900402; }),
        'got: ' + JSON.stringify(getAppliances().map(function(a){ return a.id; })));
      ok('the delete writes a tombstone', getTombs('appliances')[900402] != null, 'got: ' + JSON.stringify(getTombs('appliances')));

      // Acting on an id that is not there must be a no-op, not a crash (the
      // -1 guard CLAUDE.md calls for).
      storeSet('fl4_appliances', [{ id:900403, name:'Still here', updated:1 }]);
      applianceDelete(123456789);
      ok('deleting a missing id is a no-op, not a crash', getAppliances().length === 1, 'got: ' + getAppliances().length);

      // ── export + backup coverage ─────────────────────────────────────────
      storeSet('fl4_appliances', [{ id:900404, name:'In the backup', model:'X1', serial:'S1', warranty:'2099-01-01', updated:1 }]);
      var payload = buildExportPayload();
      ok('appliances are included in the export payload',
        Array.isArray(payload.appliances) && payload.appliances.some(function(a){ return a.id === 900404; }),
        'got: ' + JSON.stringify(payload.appliances));
      ok('the model, serial and warranty ride along in the backup',
        payload.appliances[0].model === 'X1' && payload.appliances[0].serial === 'S1' &&
        payload.appliances[0].warranty === '2099-01-01', 'got: ' + JSON.stringify(payload.appliances[0]));
      // Restore is additive by id: an existing record is never overwritten by
      // an older snapshot, and a new one is stamped/untombstoned on the way in.
      storeSet('fl4_tomb_appliances', {});
      importBackupData({ appliances: [{ id:900404, name:'Older copy', updated:0 }, { id:900405, name:'New from backup', updated:0 }] });
      var afterRestore = getAppliances();
      ok('a restore never overwrites a record already here',
        afterRestore.find(function(a){ return a.id === 900404; }).name === 'In the backup',
        'got: ' + JSON.stringify(afterRestore));
      ok('a restore does add records the store did not have',
        !!afterRestore.find(function(a){ return a.id === 900405; }), 'got: ' + JSON.stringify(afterRestore));
      ok('a restored record is stamped updated=now so the next sync push carries it',
        afterRestore.find(function(a){ return a.id === 900405; }).updated > 0, 'got: ' + JSON.stringify(afterRestore));

      // ── Render: list ─────────────────────────────────────────────────────
      _applView = 'list'; _applOpenId = null; _applEditId = null; _applArea = '';
      storeSet('fl4_appliances', []);
      renderAppliances();
      var el = document.getElementById('appliancesContent');
      ok('the empty state explains what to do', el.textContent.indexOf('Nothing saved yet') > -1, 'got: ' + el.textContent.slice(0, 200));

      storeSet('fl4_appliances', [
        { id:900501, name:'Washing Machine', area:'Utility', brand:'Whirlpool', model:'FFB9458', serial:'WM-4471',
          bought:'2020-05-04', warranty:'2001-01-01', boughtFrom:'Demo Electrical', manual:'', notes:'Filter behind the flap', updated:2 },
        { id:900502, name:'Dishwasher', area:'Kitchen', brand:'Bosch', model:'SMS4HVI33E', serial:'FD9920014',
          bought:'2024-01-10', warranty:'2099-01-01', boughtFrom:'', manual:'https://example.com/manual', notes:'', updated:1 },
        { id:900503, name:'Lawnmower', area:'', brand:'Flymo', model:'', serial:'', bought:'', warranty:'', boughtFrom:'', manual:'', notes:'', updated:3 }
      ]);
      renderAppliances();
      ok('every appliance renders', el.querySelectorAll('.appl-card').length === 3, 'got: ' + el.querySelectorAll('.appl-card').length);
      ok('the list is alphabetical, not newest-first — you scan it by name',
        el.textContent.indexOf('Dishwasher') < el.textContent.indexOf('Lawnmower') &&
        el.textContent.indexOf('Lawnmower') < el.textContent.indexOf('Washing Machine'),
        'got: ' + el.textContent.slice(0, 200));
      ok('a row shows its area and model without opening it',
        el.textContent.indexOf('Kitchen') > -1 && el.textContent.indexOf('SMS4HVI33E') > -1, 'got: ' + el.textContent.slice(0, 300));
      ok('the area chips show when there is a real choice (All + two areas + No area)',
        el.querySelectorAll('.appl-area-chip').length === 4, 'got: ' + el.querySelectorAll('.appl-area-chip').length);
      // Warranty is a detail-view fact only — no badges, no counts, no nags.
      ok('the list says nothing about warranties',
        el.textContent.indexOf('warranty') === -1 && el.textContent.indexOf('Warranty') === -1, 'got: ' + el.textContent.slice(0, 400));

      _applArea = 'Kitchen';
      renderAppliances();
      ok('filtering by an area narrows the list', el.querySelectorAll('.appl-card').length === 1 &&
        el.textContent.indexOf('Dishwasher') > -1, 'got: ' + el.querySelectorAll('.appl-card').length);
      // A chosen area that has vanished (retagged, deleted, synced away) must
      // fall back to All rather than showing an unexplained empty list.
      _applArea = 'Attic';
      renderAppliances();
      ok('a filter whose area has vanished falls back to All',
        _applArea === '' && el.querySelectorAll('.appl-card').length === 3, 'filter: ' + _applArea + ', cards: ' + el.querySelectorAll('.appl-card').length);
      storeSet('fl4_appliances', [{ id:900501, name:'Only one', area:'Utility', updated:1 }]);
      renderAppliances();
      ok('with only one area present the chips are hidden',
        el.querySelectorAll('.appl-area-chip').length === 0, 'got: ' + el.querySelectorAll('.appl-area-chip').length);

      // ── Render: detail ───────────────────────────────────────────────────
      storeSet('fl4_appliances', [
        { id:900502, name:'Dishwasher', area:'Kitchen', brand:'Bosch', model:'SMS4HVI33E', serial:'FD9920014', fd:'0603',
          bought:'2024-01-10', warranty:'2099-01-01', boughtFrom:'Demo Electrical', manual:'https://example.com/manual',
          notes:'Salt cap under the basket', updated:1 }
      ]);
      _applOpenId = 900502; _applView = 'detail';
      renderAppliances();
      ok('the detail view shows the model, serial and FD number',
        el.textContent.indexOf('SMS4HVI33E') > -1 && el.textContent.indexOf('FD9920014') > -1 && el.textContent.indexOf('0603') > -1,
        'got: ' + el.textContent.slice(0, 400));
      ok('the bought date renders as DD/MM/YYYY', el.textContent.indexOf('10/01/2024') > -1, 'got: ' + el.textContent.slice(0, 400));
      ok('the warranty line is shown on the record itself', el.textContent.indexOf('In warranty until 01/01/2099') > -1,
        'got: ' + el.textContent.slice(0, 500));
      ok('the model, serial and FD rows are copyable — the rest are not buttons',
        el.querySelectorAll('.appl-copy').length === 3, 'got: ' + el.querySelectorAll('.appl-copy').length);
      ok('the copy rows carry the exact value to copy',
        Array.prototype.map.call(el.querySelectorAll('.appl-copy'), function(r){ return r.dataset.copy; }).join('|') === 'SMS4HVI33E|FD9920014|0603',
        'got: ' + Array.prototype.map.call(el.querySelectorAll('.appl-copy'), function(r){ return r.dataset.copy; }).join('|'));
      ok('the copy rows are announced to a screen reader as buttons',
        Array.prototype.every.call(el.querySelectorAll('.appl-copy'), function(r){ return r.getAttribute('role') === 'button' && !!r.getAttribute('aria-label'); }),
        'a copy row is missing role/aria-label');
      ok('the manual link opens out, with rel=noopener like the rest of the app',
        el.querySelectorAll('a[target="_blank"]').length === 1 &&
        el.querySelector('a[target="_blank"]').rel.indexOf('noopener') > -1,
        'got: ' + el.querySelectorAll('a[target="_blank"]').length + ' outbound links');

      // A record with nothing but a name must not render empty labelled rows.
      storeSet('fl4_appliances', [{ id:900601, name:'Bare Record', updated:1 }]);
      _applOpenId = 900601;
      renderAppliances();
      ok('empty fields render nothing at all rather than blank rows',
        el.querySelectorAll('.appl-row').length === 0 && el.textContent.indexOf('Bare Record') > -1,
        'got: ' + el.querySelectorAll('.appl-row').length + ' rows');
      ok('a record with no warranty date says nothing about warranty',
        el.textContent.indexOf('warranty') === -1 && el.textContent.indexOf('Warranty') === -1, 'got: ' + el.textContent.slice(0, 300));

      // Deleted on the other phone while we were looking at it.
      storeSet('fl4_appliances', []);
      _applOpenId = 900601; _applView = 'detail';
      renderAppliances();
      ok('a record that vanished mid-view falls back to the list, not a blank screen',
        _applView === 'list' && _applOpenId === null && el.textContent.indexOf('Nothing saved yet') > -1,
        'view: ' + _applView + ' | ' + el.textContent.slice(0, 120));

      // Every field is user input arriving over sync — none of it may render
      // as markup, and that includes the manual link's href.
      storeSet('fl4_appliances', [{ id:900701, name:'<img src=x onerror=alert(1)>Bad', model:'<b>M</b>',
                                    manual:"https://example.com/'onmouseover='alert(1)", notes:'<script>alert(1)<\\/script>', updated:1 }]);
      _applOpenId = 900701; _applView = 'detail';
      renderAppliances();
      ok('a name containing markup is escaped, not rendered',
        el.querySelectorAll('img').length === 0 && el.textContent.indexOf('<img') > -1,
        'got img count: ' + el.querySelectorAll('img').length);
      ok('markup in a field and in the manual href cannot break out',
        el.querySelectorAll('script').length === 0 && el.querySelectorAll('b').length === 0,
        'got: ' + el.innerHTML.slice(0, 300));
      storeSet('fl4_appliances', [{ id:900702, name:'Sneaky', manual:'javascript:alert(1)', updated:1 }]);
      _applOpenId = 900702; _applView = 'detail';
      renderAppliances();
      ok('a stored javascript: manual link renders no link at all',
        el.querySelectorAll('a').length === 0, 'got: ' + el.innerHTML.slice(0, 300));

      // ── Render: editor ───────────────────────────────────────────────────
      storeSet('fl4_appliances', [{ id:900801, name:'Fridge', area:'Kitchen', brand:'Liebherr', model:'CN4213',
                                    serial:'', bought:'', warranty:'', boughtFrom:'', manual:'', notes:'', updated:1 }]);
      openApplianceEditor(900801);
      ok('the editor pre-fills what is already stored',
        document.getElementById('apEdName').value === 'Fridge' && document.getElementById('apEdModel').value === 'CN4213',
        'got: ' + document.getElementById('apEdName').value);
      ok('the area field offers the areas already in use',
        document.getElementById('apEdAreaList').querySelectorAll('option').length === 1,
        'got: ' + document.getElementById('apEdAreaList').querySelectorAll('option').length);
      ok('editing sets the back-button discard guard',
        _applEditing === true && typeof _applCancelFn === 'function', 'editing: ' + _applEditing);

      document.getElementById('apEdSerial').value = ' L-99-2001 ';
      document.getElementById('apEdFD').value = ' 0206 ';
      document.getElementById('apEdManual').value = 'liebherr.com/manual';
      document.getElementById('apEdSave').click();
      var savedRec = getAppliances().find(function(a){ return a.id === 900801; });
      ok('saving trims what was typed', savedRec.serial === 'L-99-2001' && savedRec.fd === '0206', 'got: ' + JSON.stringify(savedRec));
      ok('a bare domain in the manual field gets https:// (the v393 rule)',
        savedRec.manual === 'https://liebherr.com/manual', 'got: ' + savedRec.manual);
      ok('an edit bumps updated so newest-wins can see it', savedRec.updated > 1, 'got: ' + savedRec.updated);
      ok('saving lands on the record, not back at the top of the list',
        _applView === 'detail' && _applOpenId === 900801, 'view: ' + _applView + ' open: ' + _applOpenId);
      ok('saving clears the discard guard', _applEditing === false && _applCancelFn === null, 'editing: ' + _applEditing);

      // A nameless record is refused — the name is the only thing the list can
      // show, so saving without one would produce an unfindable row.
      openApplianceEditor(null);
      var countBefore = getAppliances().length;
      document.getElementById('apEdName').value = '   ';
      document.getElementById('apEdModel').value = 'ORPHAN';
      document.getElementById('apEdSave').click();
      ok('saving with no name is refused', getAppliances().length === countBefore, 'got: ' + getAppliances().length);
      ok('the editor stays open so what was typed is not thrown away',
        !!document.getElementById('apEdModel') && document.getElementById('apEdModel').value === 'ORPHAN',
        'editor gone or cleared');
      // A junk manual link is refused rather than stored as a dead link — and
      // "javascript:" in particular must never reach a stored href, which is
      // why it is checked before normalizeRecipeUrl gets a chance to prefix it
      // into a harmless-looking "https://javascript:alert(1)".
      // Re-opens the editor if a regression let the save through, so a broken
      // gate reports as failed assertions rather than aborting the whole file.
      function saveWithManual(val){
        if (!document.getElementById('apEdManual')) openApplianceEditor(null);
        var before = getAppliances().length;
        document.getElementById('apEdName').value = 'New Oven';
        document.getElementById('apEdManual').value = val;
        document.getElementById('apEdSave').click();
        return getAppliances().length === before;   // true = refused
      }
      ok('a javascript: manual link is refused, not prefixed into nonsense',
        saveWithManual('javascript:alert(1)'), 'it saved: ' + JSON.stringify(getAppliances().map(function(a){ return a.manual; })));
      ok('any other non-web scheme is refused too',
        saveWithManual('mailto:someone@example.com'), 'it saved: ' + JSON.stringify(getAppliances().map(function(a){ return a.manual; })));
      // And the render side refuses one that arrived some other way (sync, or a
      // backup written by another build).
      ok('applianceManualUrl drops a stored javascript: link',
        applianceManualUrl({ manual:'javascript:alert(1)' }) === '', 'got: ' + applianceManualUrl({ manual:'javascript:alert(1)' }));
      ok('applianceManualUrl keeps a real link and fixes a bare domain',
        applianceManualUrl({ manual:'https://example.com/m' }) === 'https://example.com/m' &&
        applianceManualUrl({ manual:'example.com/m' }) === 'https://example.com/m',
        'got: ' + applianceManualUrl({ manual:'example.com/m' }));
      ok('a bare host:port is still a link, not mistaken for a scheme',
        applianceManualUrl({ manual:'example.com:8080/m' }) === 'https://example.com:8080/m',
        'got: ' + applianceManualUrl({ manual:'example.com:8080/m' }));
      ok('an empty or missing manual field reads as no link',
        applianceManualUrl({}) === '' && applianceManualUrl(null) === '' && applianceManualUrl({ manual:'  ' }) === '',
        'got: ' + JSON.stringify(applianceManualUrl({ manual:'  ' })));
      countBefore = getAppliances().length;
      if (!document.getElementById('apEdManual')) openApplianceEditor(null);
      document.getElementById('apEdName').value = 'New Oven';
      document.getElementById('apEdManual').value = '';
      document.getElementById('apEdSave').click();
      ok('a new appliance saves once it has a name and a clean link', getAppliances().length === countBefore + 1, 'got: ' + getAppliances().length);
      ok('a new appliance lands on its own detail view',
        _applView === 'detail' && _applOpenId != null && getAppliances().some(function(a){ return a.id === _applOpenId && a.name === 'New Oven'; }),
        'view: ' + _applView + ' open: ' + _applOpenId);

      // Cancelling must leave the store untouched.
      var beforeCancel = JSON.stringify(getAppliances());
      openApplianceEditor(900801);
      document.getElementById('apEdName').value = 'Discard me';
      document.getElementById('apEdCancel').click();
      ok('cancelling writes nothing', JSON.stringify(getAppliances()) === beforeCancel, 'got: ' + JSON.stringify(getAppliances()));
      ok('cancelling clears the discard guard too', _applEditing === false && _applCancelFn === null, 'editing: ' + _applEditing);

      // ── Deep link (the one id-level hand-off global search has) ───────────
      storeSet('fl4_appliances', [{ id:900901, name:'Boiler', area:'Attic', model:'B-77', updated:1 }]);
      _applView = 'list'; _applOpenId = null; _applArea = 'Kitchen';
      openRecord('appliances', 900901);
      ok('a search tap opens the record itself, not just the section',
        _applView === 'detail' && _applOpenId === 900901 && currentSection === 'appliances',
        'view: ' + _applView + ' open: ' + _applOpenId + ' section: ' + currentSection);
      ok('a deep link clears a stale area filter rather than hiding the record',
        _applArea === '', 'got: ' + _applArea);
      openRecord('appliances', null);
      ok('a "+N more" tap (no id) lands on the list instead',
        _applView === 'list' && _applOpenId === null, 'view: ' + _applView + ' open: ' + _applOpenId);

      // Cleanup
      _applView = 'list'; _applOpenId = null; _applEditId = null; _applArea = ''; _applEditing = false; _applCancelFn = null;
      if (saved === null || saved === undefined) localStorage.removeItem('fl4_appliances'); else storeSet('fl4_appliances', saved);
      if (savedTombs === null || savedTombs === undefined) localStorage.removeItem('fl4_tomb_appliances'); else storeSet('fl4_tomb_appliances', savedTombs);
      switchSection('home');

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
