'use strict';

// v468 — Firebase Database requests must never send an expired/absent token
// merely because isLoggedIn() still sees the persisted account marker.
// A valid refresh token is used before the request; a cached token rejected by
// Firebase is refreshed and retried once. Only a missing/rejected refresh
// credential asks the user to log in — ordinary network trouble stays quiet.

module.exports = {
  name: '69-auth-token-refresh',
  async run(page) {
    return page.evaluate(`(async function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function response(status, data){
        return {status:status, ok:status >= 200 && status < 300, json:function(){ return Promise.resolve(data); }};
      }
      function resetAuth(){
        hearthFbId = 'https://auth-refresh-test.firebaseio.com';
        hearthUser = 'cathal1';
        hearthToken = 'persisted-login-marker';
        hearthApiKey = 'AIza-test-key';
        hearthIdToken = '';
        hearthTokenExpiry = 0;
        _personalFetchOk = false;
        _authRefreshRunning = false;
        _authRefreshWaiters = [];
        storeSet('hearth_fb', hearthFbId);
        storeSet('hearth_user', hearthUser);
        storeSet('hearth_token', hearthToken);
        storeSet('hearth_apikey', hearthApiKey);
        storeSet('hearth_refresh_token', 'refresh-old');
        var banner = document.getElementById('staleDataBanner');
        if (banner) banner.style.display = 'none';
      }
      function runFetch(){
        return new Promise(function(resolve){
          fetchPersonal(function(){ resolve(); });
          setTimeout(function(){ resolve(); }, 1000);
        });
      }

      var originals = {
        testBuild:_isTestBuild,
        fetchWithTimeout:fetchWithTimeout,
        applyPersonal:applyPersonal,
        toast:toast
      };
      _isTestBuild = false;
      applyPersonal = function(){};
      var toasts = [];
      toast = function(s){ toasts.push(String(s)); };

      // 1. An expired token refreshes BEFORE any Database request.
      resetAuth();
      var calls1 = [];
      fetchWithTimeout = function(url){
        calls1.push(url);
        if (url.indexOf('securetoken.googleapis.com') >= 0) {
          return Promise.resolve(response(200, {id_token:'id-fresh-1', expires_in:'3600', refresh_token:'refresh-new-1'}));
        }
        return Promise.resolve(response(200, {}));
      };
      await runFetch();
      ok('expired token: refresh happens before the personal-data request',
        calls1.length === 2 && calls1[0].indexOf('securetoken.googleapis.com') >= 0 && calls1[1].indexOf('/data.json?auth=id-fresh-1') >= 0,
        JSON.stringify(calls1));
      ok('expired token: successful refresh keeps the push guard open and rotates the refresh token',
        _personalFetchOk === true && storeGet('hearth_refresh_token') === 'refresh-new-1',
        JSON.stringify({guard:_personalFetchOk, refresh:storeGet('hearth_refresh_token')}));
      ok('expired token: no re-login warning is shown',
        document.getElementById('staleDataBanner').style.display === 'none' && toasts.filter(function(s){return s.indexOf('re-login') >= 0;}).length === 0,
        JSON.stringify(toasts));

      // 2. A cached token unexpectedly rejected by Firebase gets one refresh
      // and one retry; it is not immediately presented as a lost login.
      resetAuth(); toasts = [];
      hearthIdToken = 'id-cached-rejected';
      hearthTokenExpiry = Date.now() + 3600000;
      var calls2 = [], dataCalls2 = 0;
      fetchWithTimeout = function(url){
        calls2.push(url);
        if (url.indexOf('securetoken.googleapis.com') >= 0) {
          return Promise.resolve(response(200, {id_token:'id-fresh-2', expires_in:'3600', refresh_token:'refresh-new-2'}));
        }
        dataCalls2++;
        return Promise.resolve(response(dataCalls2 === 1 ? 401 : 200, {}));
      };
      await runFetch();
      ok('401 recovery: cached token is tried once, then refreshed and retried once',
        dataCalls2 === 2 && calls2[0].indexOf('auth=id-cached-rejected') >= 0 &&
        calls2[1].indexOf('securetoken.googleapis.com') >= 0 && calls2[2].indexOf('auth=id-fresh-2') >= 0,
        JSON.stringify(calls2));
      ok('401 recovery: success clears the warning and opens the push guard',
        _personalFetchOk === true && document.getElementById('staleDataBanner').style.display === 'none',
        JSON.stringify({guard:_personalFetchOk, banner:document.getElementById('staleDataBanner').style.display}));

      // 3. A refresh timeout is an offline/network condition, not a reason to
      // destroy a valid saved session by asking for logout.
      resetAuth(); toasts = [];
      var dataCalls3 = 0;
      fetchWithTimeout = function(url){
        if (url.indexOf('securetoken.googleapis.com') >= 0) return Promise.reject(new Error('offline'));
        dataCalls3++;
        return Promise.resolve(response(200, {}));
      };
      await runFetch();
      ok('network failure: no unauthenticated Database request is sent', dataCalls3 === 0, 'data calls: '+dataCalls3);
      ok('network failure: no re-login banner or toast is shown',
        document.getElementById('staleDataBanner').style.display === 'none' &&
        toasts.filter(function(s){return s.indexOf('re-login') >= 0;}).length === 0,
        JSON.stringify(toasts));
      ok('network failure: push guard remains closed until a real read succeeds', _personalFetchOk === false, 'guard: '+_personalFetchOk);

      // 4. Missing refresh credentials genuinely require login and must make
      // no unauthenticated request under auth-locked rules.
      resetAuth(); toasts = [];
      storeSet('hearth_refresh_token', '');
      var calls4 = 0;
      fetchWithTimeout = function(){ calls4++; return Promise.resolve(response(200, {})); };
      await runFetch();
      ok('missing credential: no Database request is attempted', calls4 === 0, 'calls: '+calls4);
      ok('missing credential: the re-login banner is shown',
        document.getElementById('staleDataBanner').style.display === 'block' &&
        toasts.filter(function(s){return s.indexOf('re-login') >= 0;}).length === 1,
        JSON.stringify(toasts));

      // 5. Personal + household work noticing expiry together shares one
      // refresh request instead of racing over the rotated credential.
      resetAuth(); toasts = [];
      var refreshCalls5 = 0, dbCalls5 = [];
      fetchWithTimeout = function(url){
        if (url.indexOf('securetoken.googleapis.com') >= 0) {
          refreshCalls5++;
          return new Promise(function(resolve){ setTimeout(function(){
            resolve(response(200, {id_token:'id-shared', expires_in:'3600', refresh_token:'refresh-shared'}));
          }, 20); });
        }
        dbCalls5.push(url);
        return Promise.resolve(response(200, {}));
      };
      await Promise.all([firebaseFetch(userUrl('/data')), firebaseFetch(houseUrl('/shared'))]);
      ok('concurrent callers share exactly one token refresh', refreshCalls5 === 1, 'refresh calls: '+refreshCalls5);
      ok('both concurrent Database requests use the same fresh token',
        dbCalls5.length === 2 && dbCalls5.every(function(u){return u.indexOf('auth=id-shared') >= 0;}),
        JSON.stringify(dbCalls5));

      _isTestBuild = originals.testBuild;
      fetchWithTimeout = originals.fetchWithTimeout;
      applyPersonal = originals.applyPersonal;
      toast = originals.toast;
      _authRefreshRunning = false;
      _authRefreshWaiters = [];
      hearthIdToken = '';
      hearthTokenExpiry = 0;
      storeSet('hearth_refresh_token', '');
      setSyncLoginNeeded(false);
      return {pass:pass, fail:fail};
    })()`);
  },
};
