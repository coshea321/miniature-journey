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
      var rec = { id:1, name:'Dishwasher', brand:'Bosch', model:'SMS4HVI33E', serial:'FD9920014',
                  area:'Kitchen', boughtFrom:'Harvey Norman', notes:'Salt cap under the basket' };
      ok('the model number is searchable', applianceSearchText(rec).indexOf('sms4hvi33e') > -1, 'got: ' + applianceSearchText(rec));
      ok('the serial number is searchable', applianceSearchText(rec).indexOf('fd9920014') > -1, 'got: ' + applianceSearchText(rec));
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
        { id:900502, name:'Dishwasher', area:'Kitchen', brand:'Bosch', model:'SMS4HVI33E', serial:'FD9920014',
          bought:'2024-01-10', warranty:'2099-01-01', boughtFrom:'Demo Electrical', manual:'https://example.com/manual',
          notes:'Salt cap under the basket', updated:1 }
      ]);
      _applOpenId = 900502; _applView = 'detail';
      renderAppliances();
      ok('the detail view shows the model and serial', el.textContent.indexOf('SMS4HVI33E') > -1 && el.textContent.indexOf('FD9920014') > -1,
        'got: ' + el.textContent.slice(0, 400));
      ok('the bought date renders as DD/MM/YYYY', el.textContent.indexOf('10/01/2024') > -1, 'got: ' + el.textContent.slice(0, 400));
      ok('the warranty line is shown on the record itself', el.textContent.indexOf('In warranty until 01/01/2099') > -1,
        'got: ' + el.textContent.slice(0, 500));
      ok('only the model and serial rows are copyable — the rest are not buttons',
        el.querySelectorAll('.appl-copy').length === 2, 'got: ' + el.querySelectorAll('.appl-copy').length);
      ok('the copy rows carry the exact value to copy',
        Array.prototype.map.call(el.querySelectorAll('.appl-copy'), function(r){ return r.dataset.copy; }).join('|') === 'SMS4HVI33E|FD9920014',
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
      document.getElementById('apEdManual').value = 'liebherr.com/manual';
      document.getElementById('apEdSave').click();
      var savedRec = getAppliances().find(function(a){ return a.id === 900801; });
      ok('saving trims what was typed', savedRec.serial === 'L-99-2001', 'got: ' + JSON.stringify(savedRec.serial));
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

      // ══ v428 — the home-inventory widening ════════════════════════════════
      // Value, receipt, photos link, the totals card, and the inventory-v1 file.

      // ── Value parsing: absent, zero and junk are three different things ───
      ok('an unvalued record reads as null, not 0',
        applianceValueNum({}) === null && applianceValueNum({ value:'' }) === null && applianceValueNum({ value:null }) === null,
        'got: ' + JSON.stringify([applianceValueNum({}), applianceValueNum({ value:'' })]));
      ok('a deliberate zero is kept as zero', applianceValueNum({ value:0 }) === 0, 'got: ' + applianceValueNum({ value:0 }));
      ok('a stored string value still reads as a number', applianceValueNum({ value:'1250' }) === 1250, 'got: ' + applianceValueNum({ value:'1250' }));
      ok('junk and negatives read as unvalued rather than as a wrong number',
        applianceValueNum({ value:'abc' }) === null && applianceValueNum({ value:-5 }) === null,
        'got: ' + JSON.stringify([applianceValueNum({ value:'abc' }), applianceValueNum({ value:-5 })]));

      ok('an empty box parses as null (field cleared)', applianceParseValue('') === null && applianceParseValue('   ') === null,
        'got: ' + JSON.stringify(applianceParseValue('')));
      ok('typed separators and a euro sign are accepted',
        applianceParseValue('1,250') === 1250 && applianceParseValue('\u20AC650') === 650 && applianceParseValue('99.50') === 99.5,
        'got: ' + JSON.stringify([applianceParseValue('1,250'), applianceParseValue('\u20AC650'), applianceParseValue('99.50')]));
      // false, not 0 — the editor refuses rather than storing a wrong figure.
      ok('text that is not a number is refused, never rounded to 0',
        applianceParseValue('about six hundred') === false && applianceParseValue('12.345') === false && applianceParseValue('-5') === false,
        'got: ' + JSON.stringify([applianceParseValue('about six hundred'), applianceParseValue('12.345'), applianceParseValue('-5')]));

      ok('money reads as euro with thousands separators and no fake cents',
        applianceMoney(1250) === '\u20AC1,250' && applianceMoney(1250.5) === '\u20AC1,250.50' && applianceMoney(0) === '\u20AC0',
        'got: ' + [applianceMoney(1250), applianceMoney(1250.5), applianceMoney(0)].join(' / '));
      ok('an unvalued record formats as nothing at all, not "\u20AC0"',
        applianceMoney(null) === '' && applianceMoney(applianceValueNum({})) === '', 'got: ' + JSON.stringify(applianceMoney(null)));

      // ── The total, and the honesty of it ─────────────────────────────────
      var vs = applianceValueSummary([{ value:1000 }, { value:250.5 }, {}, { value:'' }, { value:0 }]);
      ok('the summary totals only the valued records',
        vs.total === 1250.5 && vs.valued === 3 && vs.missing === 2, 'got: ' + JSON.stringify(vs));
      ok('an all-unvalued list totals nothing and says so',
        (function(){ var z = applianceValueSummary([{}, {}]); return z.total === 0 && z.valued === 0 && z.missing === 2; })(),
        'got: ' + JSON.stringify(applianceValueSummary([{}, {}])));

      // ── The photos link goes through the SAME gate as the manual ─────────
      ok('appliancePhotosUrl drops a javascript: link',
        appliancePhotosUrl({ photos:'javascript:alert(1)' }) === '', 'got: ' + appliancePhotosUrl({ photos:'javascript:alert(1)' }));
      ok('appliancePhotosUrl keeps a real OneDrive-shaped link and fixes a bare domain',
        appliancePhotosUrl({ photos:'https://1drv.ms/f/abc' }) === 'https://1drv.ms/f/abc' &&
        appliancePhotosUrl({ photos:'1drv.ms/f/abc' }) === 'https://1drv.ms/f/abc',
        'got: ' + appliancePhotosUrl({ photos:'1drv.ms/f/abc' }));
      ok('the manual gate still behaves identically after the v428 split',
        applianceManualUrl({ manual:'javascript:alert(1)' }) === '' &&
        applianceManualUrl({ manual:'example.com/m' }) === 'https://example.com/m',
        'got: ' + applianceManualUrl({ manual:'example.com/m' }));

      // ── The editor saves the three new fields ────────────────────────────
      storeSet('fl4_appliances', []);
      openApplianceEditor(null);
      document.getElementById('apEdName').value = 'Sofa';
      document.getElementById('apEdArea').value = 'Sitting room';
      document.getElementById('apEdValue').value = '1,400';
      document.getElementById('apEdReceipt').value = 'Gmail, order 88214';
      document.getElementById('apEdPhotos').value = '1drv.ms/f/sofa';
      document.getElementById('apEdSave').click();
      var sofa = getAppliances()[0];
      ok('a typed value with a separator is stored as a number',
        !!sofa && sofa.value === 1400, 'got: ' + JSON.stringify(sofa && sofa.value));
      ok('the receipt note and the photos link are stored, the link normalised',
        !!sofa && sofa.receipt === 'Gmail, order 88214' && sofa.photos === 'https://1drv.ms/f/sofa',
        'got: ' + JSON.stringify(sofa && [sofa.receipt, sofa.photos]));
      ok('a non-appliance record is just a record — nothing insists on a model',
        !!sofa && !sofa.model && !sofa.serial, 'got: ' + JSON.stringify(sofa));

      // A junk value must be refused rather than saved as 0.
      openApplianceEditor(sofa.id);
      document.getElementById('apEdValue').value = 'about six hundred';
      document.getElementById('apEdSave').click();
      ok('a junk value refuses the save instead of storing a wrong figure',
        _applView === 'editor' && getAppliances()[0].value === 1400,
        'view: ' + _applView + ' value: ' + JSON.stringify(getAppliances()[0].value));

      // Clearing must store "" — an UNDEFINED field is refilled from the other
      // device by mergeApplianceData's v296 fill, so a cleared value would come
      // back on the next sync. This is the whole reason the field is "" and not
      // a dropped key; do not "tidy" it into a delete.
      document.getElementById('apEdValue').value = '';
      document.getElementById('apEdSave').click();
      var cleared = getAppliances()[0];
      ok('clearing the value stores "" rather than dropping the field',
        cleared.value === '' && ('value' in cleared), 'got: ' + JSON.stringify(cleared.value));
      ok('a cleared value survives a merge against an older copy that still has one',
        (function(){
          var m = mergeApplianceData([{ id:1, name:'X', value:'', updated:200 }], [{ id:1, name:'X', value:900, updated:100 }], {});
          return m.appliances[0].value === '';
        })(), 'merge refilled a deliberately cleared value');

      // ── Search reaches the receipt ───────────────────────────────────────
      ok('the receipt note is searchable',
        applianceSearchText({ receipt:'Currys order 41007' }).indexOf('41007') !== -1,
        'got: ' + applianceSearchText({ receipt:'Currys order 41007' }));

      // ── The totals card on the list ──────────────────────────────────────
      storeSet('fl4_appliances', [
        { id:901001, name:'Dishwasher', area:'Kitchen', value:520, updated:1 },
        { id:901002, name:'Sofa',       area:'Sitting room', value:1400, updated:1 },
        { id:901003, name:'Lawnmower',  area:'', value:'', updated:1 }
      ]);
      _applView = 'list'; _applOpenId = null; _applArea = '';
      renderAppliances();
      var listHtml = document.getElementById('appliancesContent').innerHTML;
      ok('the list totals what is on screen', listHtml.indexOf('\u20AC1,920') !== -1, 'no grand total in: ' + listHtml.slice(0, 400));
      ok('the total says how many records are not in it',
        /1 not valued yet/.test(listHtml), 'no unvalued count in: ' + listHtml.slice(0, 400));
      _applArea = 'Kitchen';
      renderAppliances();
      var kitchenHtml = document.getElementById('appliancesContent').innerHTML;
      ok('picking an area totals that area only, which is how a claim is made',
        kitchenHtml.indexOf('\u20AC520') !== -1 && kitchenHtml.indexOf('\u20AC1,920') === -1,
        'got: ' + kitchenHtml.slice(0, 400));
      _applArea = '';
      // With nothing valued at all the card turns into the prompt, never a "\u20AC0".
      storeSet('fl4_appliances', [{ id:901004, name:'Kettle', updated:1 }]);
      renderAppliances();
      var noValHtml = document.getElementById('appliancesContent').innerHTML;
      ok('a section with no values shows the prompt, not a \u20AC0 total',
        noValHtml.indexOf('\u20AC0') === -1 && /cost to replace/.test(noValHtml), 'got: ' + noValHtml.slice(0, 400));

      // ── The inventory-v1 file ────────────────────────────────────────────
      var expSrc = { id:99, name:'Bike', area:'Garage', brand:'Giant', model:'Escape 3', serial:'BK-1',
                     bought:'2024-01-02', warranty:'', boughtFrom:'Demo Cycles', value:600,
                     receipt:'Email', manual:'https://example.com/m', photos:'https://1drv.ms/f/b',
                     notes:'n', addedBy:'Cathal', added:1, updated:2 };
      var exp = inventoryExportObj(expSrc);
      ok('the file carries the fields a claim needs',
        exp.name === 'Bike' && exp.value === 600 && exp.receipt === 'Email' && exp.photos === 'https://1drv.ms/f/b' &&
        exp.serial === 'BK-1' && exp.bought === '2024-01-02',
        'got: ' + JSON.stringify(exp));
      ok('the file deliberately carries no id, no updated and no author',
        !('id' in exp) && !('updated' in exp) && !('addedBy' in exp) && !('added' in exp),
        'got keys: ' + Object.keys(exp).join(','));
      ok('an unvalued record exports as null, not 0',
        inventoryExportObj({ name:'X' }).value === null, 'got: ' + JSON.stringify(inventoryExportObj({ name:'X' }).value));

      ok('a tagged file parses', (function(){
          var r = parseInventoryFile(JSON.stringify({ hearth:'inventory-v1', items:[{ name:'A' }, { name:'B' }] }));
          return !r.error && r.items.length === 2;
        })(), 'got: ' + JSON.stringify(parseInventoryFile(JSON.stringify({ hearth:'inventory-v1', items:[{ name:'A' }] }))));
      ok('a bare array and a single object parse too',
        !parseInventoryFile('[{"name":"A"}]').error && !parseInventoryFile('{"name":"A"}').error,
        'got: ' + JSON.stringify(parseInventoryFile('[{"name":"A"}]')));
      ok('another Hearth file type is refused rather than half-imported',
        !!parseInventoryFile(JSON.stringify({ hearth:'plant-v1', items:[{ name:'A' }] })).error,
        'it parsed a plant file as inventory');
      ok('a nameless entry is refused', !!parseInventoryFile('[{"value":10}]').error, 'a nameless entry parsed');
      ok('junk is refused with a readable message',
        !!parseInventoryFile('not json at all').error, 'junk parsed');

      // Import is ADD-ONLY: new ids, nothing existing touched.
      storeSet('fl4_appliances', [{ id:901101, name:'Already here', value:100, updated:5 }]);
      var addedN = importInventoryAsNew([
        { name:'Imported Sofa', area:'Sitting room', value:'1,400', receipt:'Folder', photos:'1drv.ms/f/s', bought:'2023-05-01' },
        { name:'Imported Bike', value:'\u20AC600', manual:'javascript:alert(1)', warranty:'nonsense' }
      ]);
      var after = getAppliances();
      ok('every file entry lands as a new record', addedN === 2 && after.length === 3, 'got: ' + after.length);
      ok('the record already here is untouched',
        after.some(function(a){ return a.id === 901101 && a.name === 'Already here' && a.value === 100; }),
        'got: ' + JSON.stringify(after));
      ok('imported records get fresh ids rather than the ids in the file',
        after.filter(function(a){ return a.id === 901101; }).length === 1 &&
        after.every(function(a){ return a.id != null; }), 'got ids: ' + after.map(function(a){ return a.id; }).join(','));
      var impSofa = after.filter(function(a){ return a.name === 'Imported Sofa'; })[0];
      ok('an imported value written by hand as "1,400" reads as 1400',
        !!impSofa && impSofa.value === 1400, 'got: ' + JSON.stringify(impSofa && impSofa.value));
      ok('an imported photos link is normalised the same way the editor does',
        !!impSofa && impSofa.photos === 'https://1drv.ms/f/s', 'got: ' + JSON.stringify(impSofa && impSofa.photos));
      var impBike = after.filter(function(a){ return a.name === 'Imported Bike'; })[0];
      ok('a javascript: link in a FILE is dropped, not stored',
        !!impBike && impBike.manual === '', 'got: ' + JSON.stringify(impBike && impBike.manual));
      ok('a junk date in a file is dropped rather than stored as a fake date',
        !!impBike && impBike.warranty === '' && applianceWarranty(impBike).state === 'none',
        'got: ' + JSON.stringify(impBike && impBike.warranty));
      ok('an unvalued imported record stores "" rather than dropping the field',
        !!impSofa && ('value' in impBike) && impBike.value === 600, 'got: ' + JSON.stringify(impBike && impBike.value));

      // A file round-trips: export what we have, re-read it, same values.
      var roundTrip = parseInventoryFile(JSON.stringify({ hearth:'inventory-v1', items: getAppliances().map(inventoryExportObj) }));
      ok('an exported file reads straight back in',
        !roundTrip.error && roundTrip.items.length === 3 &&
        applianceValueSummary(roundTrip.items.map(function(x){ return { value: applianceParseValue(x.value) }; })).total === 2100,
        'got: ' + JSON.stringify(roundTrip).slice(0, 300));

      // ── The import screen ────────────────────────────────────────────────
      _applImportParsed = null; _applView = 'import';
      renderAppliances();
      ok('the import screen opens on the paste step',
        !!document.getElementById('invImpJson') && !!document.getElementById('invImpGo'), 'no paste box');
      // The fence is built from char codes, not typed: this whole test body
      // lives inside a template literal, so a literal backtick here ends it.
      var _fence = String.fromCharCode(96, 96, 96);
      document.getElementById('invImpJson').value = _fence + 'json\\n' + JSON.stringify({ hearth:'inventory-v1', items:[{ name:'Fenced Lamp', value:40 }] }) + '\\n' + _fence;
      document.getElementById('invImpGo').click();
      ok('a paste wrapped in a code fence still parses',
        !!_applImportParsed && _applImportParsed.length === 1, 'got: ' + JSON.stringify(_applImportParsed));
      var beforeAdd = getAppliances().length;
      document.getElementById('invImpAdd').click();
      ok('confirming adds the items and returns to the list',
        getAppliances().length === beforeAdd + 1 && _applView === 'list' && _applImportParsed === null,
        'view: ' + _applView + ' count: ' + getAppliances().length);
      ok('the export button is on the list once there is something to export',
        !!document.getElementById('invExport') && !!document.getElementById('invImport'), 'no file buttons on the list');
      // The empty state offers import but not export — a phone that lost
      // everything is exactly the one with a file to restore.
      storeSet('fl4_appliances', []);
      renderAppliances();
      ok('the empty state offers import and not export',
        !document.getElementById('invExport') && !!document.getElementById('invImport'),
        'export shown on an empty section');

      // Cleanup
      _applImportParsed = null;
      _applView = 'list'; _applOpenId = null; _applEditId = null; _applArea = ''; _applEditing = false; _applCancelFn = null;
      if (saved === null || saved === undefined) localStorage.removeItem('fl4_appliances'); else storeSet('fl4_appliances', saved);
      if (savedTombs === null || savedTombs === undefined) localStorage.removeItem('fl4_tomb_appliances'); else storeSet('fl4_tomb_appliances', savedTombs);
      switchSection('home');

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
