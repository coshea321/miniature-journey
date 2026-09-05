'use strict';

// v463: logout() cleared hearthUser/hearthToken/hearthHouse but left
// hearth_refresh_token in storage and hearthIdToken/hearthTokenExpiry in
// memory -- so a "logged out" device could still hand a live Firebase auth
// token to anything that asked for one until that token's own expiry. This
// case drives the real logout() function against a fully "logged in" state
// and asserts every one of those three survivors is gone afterwards, in both
// memory and storage, while confirming logout does NOT touch local app data
// (CLAUDE.md: logging out must still leave local data readable).

module.exports = {
  name: '66-logout-clears-tokens',
  async run(page) {
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // Local app data that must survive logout untouched.
      currentList = 'grocery';
      listData.grocery = { items: [{ id: 900902, name: 'StillHereAfterLogout', catId: 'other', done: false }], hist: [] };
      storeSet(LIST_CONFIG.grocery.key, listData.grocery);

      // Simulate a fully logged-in device with a live cached id token.
      hearthFbId = 'https://faketest-default-rtdb.firebaseio.com';
      hearthUser = 'cathal1';
      hearthToken = 'fake-password-hash';
      hearthHouse = 'HOUSE1';
      hearthIdToken = 'fake-live-id-token';
      hearthTokenExpiry = Date.now() + 3600000;
      storeSet('hearth_fb', hearthFbId);
      storeSet('hearth_user', hearthUser);
      storeSet('hearth_token', hearthToken);
      storeSet('hearth_household', hearthHouse);
      storeSet('hearth_refresh_token', 'fake-refresh-token-value');

      ok('setup: isLoggedIn() is true before logout', isLoggedIn() === true, 'got: ' + isLoggedIn());

      logout(true); // silent — no login overlay noise in the test DOM

      ok('logout clears hearthUser (memory)', hearthUser === '', 'got: ' + JSON.stringify(hearthUser));
      ok('logout clears hearthToken (memory)', hearthToken === '', 'got: ' + JSON.stringify(hearthToken));
      ok('logout clears hearthHouse (memory)', hearthHouse === '', 'got: ' + JSON.stringify(hearthHouse));
      ok('logout clears the cached id token (memory) -- the v457 review finding',
        !hearthIdToken, 'got: ' + JSON.stringify(hearthIdToken));
      ok('logout resets the token expiry (memory)', hearthTokenExpiry === 0, 'got: ' + hearthTokenExpiry);

      ok('logout clears hearth_user in storage', !storeGet('hearth_user'), 'got: ' + JSON.stringify(storeGet('hearth_user')));
      ok('logout clears hearth_token in storage', !storeGet('hearth_token'), 'got: ' + JSON.stringify(storeGet('hearth_token')));
      ok('logout clears hearth_household in storage', !storeGet('hearth_household'), 'got: ' + JSON.stringify(storeGet('hearth_household')));
      ok('logout clears hearth_refresh_token in storage -- no token survives logout',
        !storeGet('hearth_refresh_token'), 'got: ' + JSON.stringify(storeGet('hearth_refresh_token')));

      ok('isLoggedIn() is false after logout', isLoggedIn() === false, 'got: ' + isLoggedIn());

      // Offline data behaviour must be unchanged: local data stays readable.
      loadListData('grocery');
      var stillThere = (storeGet(LIST_CONFIG.grocery.key).items || []).some(function(i){ return i.name === 'StillHereAfterLogout'; });
      ok('local list data is still readable after logout (offline behaviour unchanged)', stillThere, 'got: ' + JSON.stringify(storeGet(LIST_CONFIG.grocery.key)));

      return {pass:pass, fail:fail};
    })()`);

    return r;
  },
};
