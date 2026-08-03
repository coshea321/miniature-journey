'use strict';

// Watchlist section (v391). Covers the data layer (merge contract, the watched
// tick, the rating rules, the title-derived info links) plus the parts of the
// render that a bug would make invisible rather than loud — the watched group
// staying collapsed, and a title with markup in it being escaped. Same style as
// 22-plants. Cleans up after itself so later cases see an empty store.
module.exports = {
  name: '30-watchlist',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var saved      = storeGet('fl4_watchlist');
      var savedTombs = storeGet('fl4_tomb_watchlist');

      // ── watchKindMeta: an unknown/missing kind must not throw ─────────────
      ok('watchKindMeta("tv") resolves TV', watchKindMeta('tv').key === 'tv', 'got: ' + watchKindMeta('tv').key);
      ok('watchKindMeta("film") resolves Film', watchKindMeta('film').key === 'film', 'got: ' + watchKindMeta('film').key);
      ok('an unknown kind falls back to film rather than throwing',
        watchKindMeta('boxset').key === 'film', 'got: ' + watchKindMeta('boxset').key);
      ok('a missing kind falls back to film',
        watchKindMeta(undefined).key === 'film', 'got: ' + watchKindMeta(undefined).key);

      // ── watchInfoLinks: built from the title, never stored ────────────────
      var links = watchInfoLinks({ title: 'The Banshees of Inisherin' });
      ok('every entry gets all three info sources', links.length === 3, 'got: ' + links.length);
      ok('the title is url-encoded into each link',
        links.every(function(l){ return l.href.indexOf('The%20Banshees%20of%20Inisherin') > -1; }),
        'got: ' + links.map(function(l){ return l.href; }).join(' | '));
      ok('a where-to-watch, a Wikipedia and an IMDb link are all present',
        links.some(function(l){ return l.href.indexOf('justwatch.com') > -1; }) &&
        links.some(function(l){ return l.href.indexOf('wikipedia.org') > -1; }) &&
        links.some(function(l){ return l.href.indexOf('imdb.com') > -1; }),
        'got: ' + links.map(function(l){ return l.href; }).join(' | '));
      // A title with & or ? in it must not break out of the query string.
      var trickyLinks = watchInfoLinks({ title: 'Tom & Jerry?' });
      ok('a title containing & and ? is encoded, not injected raw',
        trickyLinks.every(function(l){ return l.href.indexOf('Tom%20%26%20Jerry%3F') > -1; }),
        'got: ' + trickyLinks.map(function(l){ return l.href; }).join(' | '));
      ok('an entry with no title gets no info links (nothing to search for)',
        watchInfoLinks({ title: '' }).length === 0 && watchInfoLinks({}).length === 0 && watchInfoLinks(null).length === 0,
        'got: ' + watchInfoLinks({ title: '' }).length);

      // ── watchRatingOf: clamped, never NaN ────────────────────────────────
      ok('an unrated entry reads 0', watchRatingOf({}) === 0 && watchRatingOf({ rating: 0 }) === 0, 'got: ' + watchRatingOf({}));
      ok('a valid rating passes through', watchRatingOf({ rating: 4 }) === 4, 'got: ' + watchRatingOf({ rating: 4 }));
      ok('an out-of-range or junk rating reads 0, not NaN',
        watchRatingOf({ rating: 9 }) === 0 && watchRatingOf({ rating: -2 }) === 0 && watchRatingOf({ rating: 'x' }) === 0,
        'got: ' + [watchRatingOf({ rating: 9 }), watchRatingOf({ rating: -2 }), watchRatingOf({ rating: 'x' })].join(','));

      // ── getWatchlist null guard (v385/v388 lesson, at the source) ─────────
      storeSet('fl4_watchlist', [null, { id: 1, title: 'Good' }, null]);
      ok('getWatchlist drops null entries', getWatchlist().length === 1 && getWatchlist()[0].title === 'Good',
        'got: ' + JSON.stringify(getWatchlist()));
      storeSet('fl4_watchlist', 'not an array');
      ok('a non-array store reads as empty rather than throwing', getWatchlist().length === 0, 'got: ' + JSON.stringify(getWatchlist()));

      // ── mergeWatchData ───────────────────────────────────────────────────
      var m = mergeWatchData(
        [{ id:1, title:'Local newer', note:'local', updated:200 }, { id:2, title:'Only local', updated:100 }],
        [{ id:1, title:'Remote older', note:'remote', updated:100 }, { id:3, title:'Only remote', updated:100 }], {});
      var byId = {}; m.watchlist.forEach(function(w){ byId[w.id] = w; });
      ok('newest-wins keeps the local copy when local is newer', byId[1] && byId[1].title === 'Local newer', 'got: ' + JSON.stringify(byId[1]));
      ok('an entry only the partner has is taken', !!byId[3], 'got ids: ' + Object.keys(byId).join(','));
      ok('an entry only we have is kept', !!byId[2], 'got ids: ' + Object.keys(byId).join(','));
      ok('push=true when our copy is newer/fuller than what arrived', m.push === true, 'got: ' + m.push);

      var m2 = mergeWatchData([{ id:1, title:'Local older', updated:100 }], [{ id:1, title:'Remote newer', updated:200 }], {});
      ok('newest-wins takes the incoming copy when it is newer', m2.watchlist[0].title === 'Remote newer', 'got: ' + JSON.stringify(m2.watchlist[0]));

      // v296 field-fill: an older build's copy must not wipe fields it never knew.
      var m3 = mergeWatchData([{ id:1, title:'Local', rating:5, updated:100 }], [{ id:1, title:'Remote', updated:200 }], {});
      ok('a winning copy missing a newer field inherits it rather than wiping it',
        m3.watchlist[0].title === 'Remote' && m3.watchlist[0].rating === 5, 'got: ' + JSON.stringify(m3.watchlist[0]));
      var m4 = mergeWatchData([{ id:1, title:'Local', note:'old note', updated:100 }], [{ id:1, title:'Remote', note:'', updated:200 }], {});
      ok('a field deliberately cleared to "" stays cleared', m4.watchlist[0].note === '', 'got: ' + JSON.stringify(m4.watchlist[0]));

      // A null in either side must not survive or crash the merge.
      var m5 = mergeWatchData([null, { id:1, title:'Fine', updated:100 }], [null], {});
      ok('nulls on either side of the merge are dropped, not carried through',
        m5.watchlist.length === 1 && m5.watchlist[0].title === 'Fine', 'got: ' + JSON.stringify(m5.watchlist));

      // Tombstones: a delete sticks, and a genuine re-add survives it.
      var m6 = mergeWatchData([], [{ id:5, title:'Deleted', updated:100 }], { 5: 200 });
      ok('a tombstone newer than the record drops it', m6.watchlist.length === 0, 'got: ' + JSON.stringify(m6.watchlist));
      var m7 = mergeWatchData([], [{ id:5, title:'Re-added', updated:300 }], { 5: 200 });
      ok('a record re-added after the delete survives its old tombstone',
        m7.watchlist.length === 1 && m7.watchlist[0].title === 'Re-added', 'got: ' + JSON.stringify(m7.watchlist));

      // ── The watched tick ─────────────────────────────────────────────────
      storeSet('fl4_watchlist', [{ id:900101, title:'Tick me', kind:'film', note:'', link:'',
                                   watched:false, watchedAt:0, rating:0, added:1000, updated:1000 }]);
      watchToggleWatched(900101);
      var after = getWatchlist().find(function(w){ return w.id === 900101; });
      ok('ticking sets watched true', after && after.watched === true, 'got: ' + JSON.stringify(after));
      ok('ticking stamps watchedAt', after && after.watchedAt > 0, 'got: ' + (after && after.watchedAt));
      ok('ticking bumps updated (so newest-wins can see it)', after && after.updated > 1000, 'got: ' + (after && after.updated));

      watchSetRating(900101, 4);
      after = getWatchlist().find(function(w){ return w.id === 900101; });
      ok('a rating is stored', watchRatingOf(after) === 4, 'got: ' + JSON.stringify(after));
      watchSetRating(900101, 4);
      after = getWatchlist().find(function(w){ return w.id === 900101; });
      ok('tapping the same star again clears the rating', watchRatingOf(after) === 0, 'got: ' + JSON.stringify(after));
      watchSetRating(900101, 3);
      watchSetRating(900101, 99);
      after = getWatchlist().find(function(w){ return w.id === 900101; });
      ok('an out-of-range rating is refused, leaving the existing one alone', watchRatingOf(after) === 3, 'got: ' + JSON.stringify(after));

      // Un-ticking must not silently destroy a rating he typed — a mis-tap is
      // recoverable, and re-ticking brings the rating back.
      watchToggleWatched(900101);
      after = getWatchlist().find(function(w){ return w.id === 900101; });
      ok('un-ticking clears watched', after && after.watched === false, 'got: ' + JSON.stringify(after));
      ok('un-ticking KEEPS the rating rather than destroying it', watchRatingOf(after) === 3, 'got: ' + JSON.stringify(after));

      // A toggle against an id that is not there must be a no-op, not a crash
      // (the -1 guard CLAUDE.md calls for).
      var beforeCount = getWatchlist().length;
      watchToggleWatched(123456789);
      watchSetRating(123456789, 3);
      watchDelete(123456789);
      ok('acting on a missing id is a no-op, not a crash', getWatchlist().length === beforeCount,
        'got: ' + getWatchlist().length + ' expected ' + beforeCount);

      // ── delete writes a tombstone ────────────────────────────────────────
      storeSet('fl4_watchlist', [{ id:900102, title:'ToDelete', updated: Date.now() }]);
      storeSet('fl4_tomb_watchlist', {});
      watchDelete(900102);
      ok('watchDelete removes the record', !getWatchlist().some(function(w){ return w.id === 900102; }),
        'got: ' + JSON.stringify(getWatchlist().map(function(w){ return w.id; })));
      ok('watchDelete writes a tombstone', getTombs('watchlist')[900102] != null, 'got: ' + JSON.stringify(getTombs('watchlist')));

      // ── export coverage ──────────────────────────────────────────────────
      storeSet('fl4_watchlist', [{ id:900103, title:'In the backup', kind:'tv', rating:5, watched:true, updated:1 }]);
      var payload = buildExportPayload();
      ok('the watchlist is included in the export payload',
        Array.isArray(payload.watchlist) && payload.watchlist.some(function(w){ return w.id === 900103; }),
        'got: ' + JSON.stringify(payload.watchlist));
      ok('the rating and watched tick ride along in the backup',
        payload.watchlist[0].rating === 5 && payload.watchlist[0].watched === true,
        'got: ' + JSON.stringify(payload.watchlist[0]));

      // ── Render ───────────────────────────────────────────────────────────
      _watchView = 'list'; _watchOpenId = null; _watchFilter = 'all'; _watchDoneOpen = false;
      storeSet('fl4_watchlist', [
        { id:900201, title:'Unwatched Film', kind:'film', note:'a note', watched:false, added:3000, updated:3000 },
        { id:900202, title:'Watched Show',   kind:'tv',   note:'',       watched:true, watchedAt:2000, rating:4, added:2000, updated:2000 }
      ]);
      renderWatchlist();
      var el = document.getElementById('watchContent');
      ok('the to-watch entry renders', el.textContent.indexOf('Unwatched Film') > -1, 'got: ' + el.textContent.slice(0, 200));
      ok('the watched group is collapsed by default, so its titles are not shown',
        el.textContent.indexOf('Watched Show') === -1, 'got: ' + el.textContent.slice(0, 300));
      ok('the watched group still announces its count', el.textContent.indexOf('Watched') > -1, 'got: ' + el.textContent.slice(0, 300));
      _watchDoneOpen = true;
      renderWatchlist();
      ok('opening the watched group reveals it', el.textContent.indexOf('Watched Show') > -1, 'got: ' + el.textContent.slice(0, 300));
      _watchDoneOpen = false;

      // Info links appear only in the expanded row, and are real links out.
      ok('info links are not on every collapsed row (they would swamp the list)',
        el.querySelectorAll('a[href*="justwatch"]').length === 0, 'got: ' + el.querySelectorAll('a[href*="justwatch"]').length);
      _watchOpenId = 900201;
      renderWatchlist();
      ok('expanding a row shows its three info links',
        el.querySelectorAll('a[href*="justwatch"]').length === 1 &&
        el.querySelectorAll('a[href*="wikipedia"]').length === 1 &&
        el.querySelectorAll('a[href*="imdb"]').length === 1,
        'got: ' + el.querySelectorAll('a[target="_blank"]').length + ' outbound links');
      ok('outbound links carry rel=noopener, matching the rest of the app',
        Array.prototype.every.call(el.querySelectorAll('a[target="_blank"]'), function(a){ return a.rel.indexOf('noopener') > -1; }),
        'a link is missing rel=noopener');
      _watchOpenId = null;

      // The kind filter only earns its row when there is a real choice.
      renderWatchlist();
      ok('the kind chips show when there is both a film and a show',
        el.querySelectorAll('.watch-kind-chip').length === 3, 'got: ' + el.querySelectorAll('.watch-kind-chip').length);
      storeSet('fl4_watchlist', [{ id:900201, title:'Only a film', kind:'film', watched:false, added:1, updated:1 }]);
      _watchFilter = 'tv';
      renderWatchlist();
      ok('with only one kind present the chips are hidden',
        el.querySelectorAll('.watch-kind-chip').length === 0, 'got: ' + el.querySelectorAll('.watch-kind-chip').length);
      ok('a filter whose kind has vanished falls back to All rather than an unexplained empty list',
        _watchFilter === 'all' && el.textContent.indexOf('Only a film') > -1, 'filter: ' + _watchFilter + ' | ' + el.textContent.slice(0, 200));

      // A title is user input arriving over sync — it must never render as markup.
      storeSet('fl4_watchlist', [{ id:900301, title:'<img src=x onerror=alert(1)>Bad', kind:'film', watched:false, added:1, updated:1 }]);
      renderWatchlist();
      ok('a title containing markup is escaped, not rendered',
        el.querySelectorAll('img').length === 0 && el.textContent.indexOf('<img') > -1,
        'got img count: ' + el.querySelectorAll('img').length);

      // Empty state
      storeSet('fl4_watchlist', []);
      renderWatchlist();
      ok('the empty state explains what to do', el.textContent.indexOf('Nothing on the list yet') > -1, 'got: ' + el.textContent.slice(0, 200));

      // Cleanup
      _watchView = 'list'; _watchOpenId = null; _watchEditId = null; _watchFilter = 'all'; _watchDoneOpen = false; _watchEditing = false;
      if (saved === null || saved === undefined) localStorage.removeItem('fl4_watchlist'); else storeSet('fl4_watchlist', saved);
      if (savedTombs === null || savedTombs === undefined) localStorage.removeItem('fl4_tomb_watchlist'); else storeSet('fl4_tomb_watchlist', savedTombs);

      return { pass: pass, fail: fail };
    })()`);
    return result;
  }
};
