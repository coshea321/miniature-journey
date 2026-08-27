'use strict';

// v441: the food-journal calorie goal (`fl4_cal_goal`) and the TDEE profile
// (`fl4_profile`) are bare scalars/objects with no per-record `updated` field,
// so the personal-sync merge used to take the incoming value unconditionally.
// Every push sends `storeGet("fl4_cal_goal") || 2000`, so a device that had
// never set a goal pushed the fallback 2000 and the next pull wrote it over a
// real goal set elsewhere — Cathal's "it keeps resetting to 2000".
//
// The fix is a stamp per value (`fl4_cal_goal_ts` / `fl4_profile_ts`) and a
// newest-wins merge. THE TRIPWIRE IN THIS FILE is "unstamped incoming never
// overwrites a stamped local": if that assertion ever fails, someone has
// reintroduced the blind overwrite and the goal will start resetting again.

module.exports = {
  name: '50-cal-goal-sync',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      function clearGoal(){
        localStorage.removeItem("fl4_cal_goal");
        localStorage.removeItem("fl4_cal_goal_ts");
        localStorage.removeItem("fl4_profile");
        localStorage.removeItem("fl4_profile_ts");
      }

      // ── Write sites stamp ────────────────────────────────────────────────
      clearGoal();
      var before = Date.now();
      setCalGoal(2400);
      ok('setCalGoal: value stored', storeGet("fl4_cal_goal") === 2400, 'got: ' + storeGet("fl4_cal_goal"));
      ok('setCalGoal: stamped', (+storeGet("fl4_cal_goal_ts") || 0) >= before, 'got: ' + storeGet("fl4_cal_goal_ts"));

      // The real UI write site: the goal editor behind the food-day summary.
      clearGoal();
      document.getElementById("foodDaySummary").click();
      document.getElementById("_calGoalInput").value = "2600";
      document.getElementById("_goalSave").click();
      ok('goal editor: value stored', storeGet("fl4_cal_goal") === 2600, 'got: ' + storeGet("fl4_cal_goal"));
      ok('goal editor: stamped', (+storeGet("fl4_cal_goal_ts") || 0) > 0, 'got: ' + storeGet("fl4_cal_goal_ts"));

      saveProfile({ sex:"m", heightCm:180, birthYear:1985, activity:1.375, rate:0.5, goalKg:78 });
      ok('saveProfile: stamped', (+storeGet("fl4_profile_ts") || 0) > 0, 'got: ' + storeGet("fl4_profile_ts"));

      // ── The reported bug: an unstamped 2000 must not win ─────────────────
      clearGoal();
      setCalGoal(2400);
      var keptTs = +storeGet("fl4_cal_goal_ts");
      applyPersonal({ cal_goal: 2000 });                       // pre-v441 device: no stamp at all
      ok('TRIPWIRE unstamped incoming 2000 does not overwrite a stamped goal',
         storeGet("fl4_cal_goal") === 2400, 'got: ' + storeGet("fl4_cal_goal"));
      ok('unstamped incoming leaves the local stamp alone',
         +storeGet("fl4_cal_goal_ts") === keptTs, 'got: ' + storeGet("fl4_cal_goal_ts"));

      // ── Stale stamped incoming loses ─────────────────────────────────────
      applyPersonal({ cal_goal: 1800, cal_goal_ts: keptTs - 60000 });
      ok('older stamped incoming loses', storeGet("fl4_cal_goal") === 2400, 'got: ' + storeGet("fl4_cal_goal"));

      // ── Newer stamped incoming wins, and brings its stamp ────────────────
      var newerTs = keptTs + 60000;
      applyPersonal({ cal_goal: 2100, cal_goal_ts: newerTs });
      ok('newer stamped incoming wins', storeGet("fl4_cal_goal") === 2100, 'got: ' + storeGet("fl4_cal_goal"));
      ok('winning value carries its stamp', +storeGet("fl4_cal_goal_ts") === newerTs, 'got: ' + storeGet("fl4_cal_goal_ts"));

      // Equal stamps must not flip the value (strictly-newer only).
      applyPersonal({ cal_goal: 1234, cal_goal_ts: newerTs });
      ok('equal stamps keep local', storeGet("fl4_cal_goal") === 2100, 'got: ' + storeGet("fl4_cal_goal"));

      // ── First run: a device with nothing stored takes what is there ──────
      clearGoal();
      applyPersonal({ cal_goal: 2300 });                       // unstamped, but nothing local to protect
      ok('first run: unstamped incoming adopted when nothing is stored',
         storeGet("fl4_cal_goal") === 2300, 'got: ' + storeGet("fl4_cal_goal"));
      ok('first run: adopted with stamp 0, so a real edit anywhere beats it',
         (+storeGet("fl4_cal_goal_ts") || 0) === 0, 'got: ' + storeGet("fl4_cal_goal_ts"));

      // ── Profile: same two rules ──────────────────────────────────────────
      clearGoal();
      saveProfile({ sex:"m", heightCm:180, birthYear:1985, activity:1.375, rate:0.5, goalKg:78 });
      var profTs = +storeGet("fl4_profile_ts");
      applyPersonal({ profile: { sex:"f", heightCm:150, birthYear:1990, activity:1.2, rate:0.25, goalKg:60 } });
      ok('profile: unstamped incoming does not overwrite a stamped profile',
         (storeGet("fl4_profile") || {}).heightCm === 180, 'got: ' + JSON.stringify(storeGet("fl4_profile")));
      applyPersonal({ profile: { sex:"f", heightCm:165, birthYear:1990, activity:1.2, rate:0.25, goalKg:60 }, profile_ts: profTs + 60000 });
      ok('profile: newer stamped incoming wins',
         (storeGet("fl4_profile") || {}).heightCm === 165, 'got: ' + JSON.stringify(storeGet("fl4_profile")));
      ok('profile: winning value carries its stamp',
         +storeGet("fl4_profile_ts") === profTs + 60000, 'got: ' + storeGet("fl4_profile_ts"));

      // ── Backup round trip carries both stamps ────────────────────────────
      clearGoal();
      setCalGoal(2550);
      saveProfile({ sex:"m", heightCm:181, birthYear:1984, activity:1.55, rate:0.5, goalKg:79 });
      var payload = buildExportPayload();
      ok('export: cal_goal_ts present', payload.cal_goal_ts === +storeGet("fl4_cal_goal_ts"), 'got: ' + payload.cal_goal_ts);
      ok('export: profile_ts present', payload.profile_ts === +storeGet("fl4_profile_ts"), 'got: ' + payload.profile_ts);

      clearGoal();
      importBackupData(payload);
      ok('import: goal restored', storeGet("fl4_cal_goal") === 2550, 'got: ' + storeGet("fl4_cal_goal"));
      ok('import: goal stamp restored', +storeGet("fl4_cal_goal_ts") === payload.cal_goal_ts, 'got: ' + storeGet("fl4_cal_goal_ts"));
      ok('import: profile stamp restored', +storeGet("fl4_profile_ts") === payload.profile_ts, 'got: ' + storeGet("fl4_profile_ts"));

      // An older file with no stamps restores as 0 rather than as undefined.
      clearGoal();
      importBackupData({ cal_goal: 1900, profile:{ sex:"m", heightCm:170, birthYear:1980, activity:1.2, rate:0.5, goalKg:70 } });
      ok('legacy file: goal restored', storeGet("fl4_cal_goal") === 1900, 'got: ' + storeGet("fl4_cal_goal"));
      ok('legacy file: stamp is 0, not undefined', (+storeGet("fl4_cal_goal_ts") || 0) === 0, 'got: ' + storeGet("fl4_cal_goal_ts"));

      clearGoal();
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
