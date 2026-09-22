'use strict';

// v480 — the low-priority items left over from the v478 council review
// (HEARTH-council-review-v478.md), which Cathal asked to have fixed too:
//   1. the recipe resize grip ends a drag on pointercancel, not only pointerup
//      — Android cancels a touch it takes over and never sends pointerup
//   2. a default bag someone deleted is not re-seeded (it used to flicker:
//      seeded on read, filtered out by the next merge, seeded again)
//   3. a Wikipedia summary that comes back after the entry was retitled is
//      dropped, not stored under the new title
//   4. only HTTP 400/401/403 from Google's token endpoint counts as a
//      rejected login; a 429/5xx is transient and must not ask for re-login
//   5. Settings says again that Lists, Recipes and Baby can't be hidden

module.exports = {
  name: '75-council-v480',
  async run(page) {
    return page.evaluate(`(async function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

      // ── 1. resize grip: pointercancel ends the drag ─────────────────────
      switchSection('recipes');
      openRecipeEditor(null);
      var grip = document.querySelector(".reResizeGrip[data-target='reMethod']");
      var ta = document.getElementById('reMethod');
      ok('the Method box has a resize grip', !!grip && !!ta);
      if (grip && ta) {
        var h0 = ta.getBoundingClientRect().height;
        grip.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientY:100, pointerId:1}));
        document.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientY:160, pointerId:1}));
        var h1 = parseFloat(ta.style.height);
        ok('a drag still resizes the box', Math.abs(h1 - (h0 + 60)) < 2, h0 + ' -> ' + h1);
        document.dispatchEvent(new PointerEvent('pointercancel', {bubbles:true, pointerId:1}));
        document.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientY:400, pointerId:2}));
        ok('TRIPWIRE: after pointercancel, a later finger movement does NOT resize it',
          parseFloat(ta.style.height) === h1, h1 + ' -> ' + ta.style.height);
      }
      _recipeView = 'list'; renderRecipes();

      // ── 2. deleted defaults are not re-seeded ───────────────────────────
      var realTombs = storeGet('fl4_tomb_bags');
      var bd = getBD(); bd.bags = []; saveBD(bd);
      storeSet('fl4_tomb_bags', {});
      var all = getBagsData();
      ok('an empty list with no tombstones still seeds every default',
        all.length === DEFAULT_BAGS.length, String(all.length));

      bd = getBD(); bd.bags = []; saveBD(bd);
      var t1 = {}; t1[DEFAULT_BAGS[0].id] = Date.now();
      storeSet('fl4_tomb_bags', t1);
      var some = getBagsData();
      ok('TRIPWIRE: a deleted default is not seeded again',
        !some.some(function(b){ return b.id === DEFAULT_BAGS[0].id; }), JSON.stringify(some.map(function(b){return b.id;})));
      ok('the other defaults still are', some.length === DEFAULT_BAGS.length - 1, String(some.length));

      bd = getBD(); bd.bags = []; saveBD(bd);
      var tAll = {}; DEFAULT_BAGS.forEach(function(b){ tAll[b.id] = Date.now(); });
      storeSet('fl4_tomb_bags', tAll);
      var none = getBagsData();
      ok('every default deleted means an empty list', none.length === 0, String(none.length));
      ok('and nothing is written back', (getBD().bags || []).length === 0);
      currentBabyView = 'bags'; switchSection('baby'); renderBabyView();
      ok('the Bags view shows its empty state instead',
        document.getElementById('bagContent').textContent.indexOf('No bags yet') !== -1);
      storeSet('fl4_tomb_bags', realTombs || {});
      bd = getBD(); bd.bags = []; saveBD(bd);

      // ── 3. Watchlist summary vs a retitle mid-fetch ─────────────────────
      var realFetch = fetchWithTimeout, realToast = toast, toasts = [];
      toast = function(s){ toasts.push(String(s)); };
      var wid = 990480;
      var list = getWatchlist().filter(function(w){ return w && w.id !== wid; });
      list.push({ id:wid, title:'Dune', kind:'film', note:'', link:'', season:'', summary:'', summarySrc:'',
                  watching:false, watched:false, watchedAt:0, rating:0, addedBy:'', added:1, updated:1 });
      saveWatchlist(list);
      var release;
      fetchWithTimeout = function(){
        return new Promise(function(resolve){ release = function(){
          resolve({ status:200, ok:true, json:function(){ return Promise.resolve(
            { query:{ pages:{ '1':{ title:'Dune (2021 film)', extract:'Dune is a 2021 film about a desert planet.' } } } }); } });
        }; });
      };
      watchFetchSummary(wid);
      var cur = getWatchlist(); var k = cur.findIndex(function(w){ return w.id === wid; });
      cur[k].title = 'Wall Street'; saveWatchlist(cur);        // retitled while the fetch is out
      release(); await wait(30);
      var after = getWatchlist().find(function(w){ return w.id === wid; });
      ok('TRIPWIRE: a summary for the OLD title is not stored under the new one',
        after && after.summary === '' && after.summarySrc === '', JSON.stringify(after));
      ok('and the busy flag is cleared', _watchSumBusy === 0, String(_watchSumBusy));

      watchFetchSummary(wid);                                  // same title throughout
      release(); await wait(30);
      after = getWatchlist().find(function(w){ return w.id === wid; });
      ok('an unchanged title still gets its summary', after && /desert planet/.test(after.summary), JSON.stringify(after));
      saveWatchlist(getWatchlist().filter(function(w){ return w && w.id !== wid; }));
      fetchWithTimeout = realFetch; toast = realToast;

      // ── 4. token refresh: only 400/401/403 is "rejected" ────────────────
      var saved = { testBuild:_isTestBuild, fb:hearthFbId, user:hearthUser, token:hearthToken, key:hearthApiKey,
                    id:hearthIdToken, exp:hearthTokenExpiry, rt:storeGet('hearth_refresh_token'),
                    su:storeGet('hearth_user'), st:storeGet('hearth_token') };
      _isTestBuild = false;
      hearthFbId = 'https://auth-v480-test.firebaseio.com';
      hearthUser = 'cathal1'; hearthToken = 'marker'; hearthApiKey = 'AIza-test';
      storeSet('hearth_user', hearthUser); storeSet('hearth_token', hearthToken);
      function reasonFor(status, body){
        hearthIdToken = ''; hearthTokenExpiry = 0;
        _authRefreshRunning = false; _authRefreshWaiters = [];
        storeSet('hearth_refresh_token', 'rt-x');
        fetchWithTimeout = function(){ return Promise.resolve({ status:status, ok:status>=200&&status<300,
          json:function(){ return Promise.resolve(body); } }); };
        return new Promise(function(resolve){ getAuthToken(function(tok, why){ resolve({tok:tok, why:why}); }); });
      }
      var r503 = await reasonFor(503, { error:{ code:503, message:'UNAVAILABLE' } });
      ok('TRIPWIRE: a 503 from the token endpoint is transient, not a rejected login',
        r503.tok === null && r503.why === 'network', JSON.stringify(r503));
      var r429 = await reasonFor(429, { error:{ code:429, message:'QUOTA_EXCEEDED' } });
      ok('a 429 is transient too', r429.why === 'network', JSON.stringify(r429));
      var r400 = await reasonFor(400, { error:{ code:400, message:'INVALID_REFRESH_TOKEN' } });
      ok('a 400 is still a rejected login', r400.why === 'rejected', JSON.stringify(r400));
      var r200 = await reasonFor(200, { id_token:'id-ok', expires_in:'3600', refresh_token:'rt-new' });
      ok('a good refresh still returns the token', r200.tok === 'id-ok' && r200.why === '', JSON.stringify(r200));
      fetchWithTimeout = realFetch;
      _isTestBuild = saved.testBuild; hearthFbId = saved.fb; hearthUser = saved.user; hearthToken = saved.token; hearthApiKey = saved.key;
      hearthIdToken = saved.id; hearthTokenExpiry = saved.exp;
      _authRefreshRunning = false; _authRefreshWaiters = [];
      storeSet('hearth_refresh_token', saved.rt || ''); storeSet('hearth_user', saved.su || ''); storeSet('hearth_token', saved.st || '');

      // ── 5. Settings copy ────────────────────────────────────────────────
      var st = document.getElementById('sectionToggles');
      var desc = st && st.previousElementSibling ? st.previousElementSibling.textContent : '';
      ok('Settings says which sections cannot be hidden',
        /Lists, Recipes and Baby can.t be hidden/.test(desc), desc);

      return {pass:pass, fail:fail};
    })()`);
  },
};
