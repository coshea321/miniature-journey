'use strict';

// v390 — applyPersonal/applyHousehold syncPaused parity.
//
// applyHousehold has set syncPaused = true on entry (before any merge work)
// since ~v375 (its finally clears it back to false). applyPersonal only ever
// cleared it in a finally — it never set it true on entry — a real
// inconsistency flagged and deliberately left open in the v375 changelog
// entry ("changing WHEN outgoing sync is paused alters sync timing... wants
// its own version to be testable in isolation"). The gap: pushPersonal()
// bails early when syncPaused is true (see its own guard), so a push that
// happened to fire WHILE applyPersonal was still merging (rather than
// strictly before or after) was never paused for it — the exact race
// applyHousehold has been immune to for several versions.
//
// This can't be observed through pushPersonal() itself inside this harness
// (pushPersonal's very first guard is `if (_isTestBuild) return;`, and
// file:// test pages are always a test build) — so the assertions pin the
// state transition the fix actually makes: syncPaused reads true WHILE a
// merge block is running (proven by hooking a function called mid-merge)
// and false again once the cycle completes, exactly mirroring
// applyHousehold's existing, already-relied-upon behaviour.

module.exports = {
  name: '29-sync-paused-parity',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    // ── applyPersonal: syncPaused is true WHILE merging, false after ───────
    const personalResult = await page.evaluate(
      '(function(){' +
      'syncPaused = false;' +
      'var captured = null;' +
      'var orig = mergeBabyData;' +
      'mergeBabyData = function(){ captured = syncPaused; return orig.apply(this, arguments); };' +
      'try {' +
      '  applyPersonal({ baby: { medicine: [], growth: [], milestones: [] } });' +
      '} finally { mergeBabyData = orig; }' +
      'return { duringMerge: captured, afterMerge: syncPaused };' +
      '})()'
    );
    check(
      'applyPersonal: syncPaused is true while a merge block is actually running',
      personalResult.duringMerge === true,
      'got: ' + JSON.stringify(personalResult)
    );
    check(
      'applyPersonal: syncPaused is cleared once the apply cycle completes',
      personalResult.afterMerge === false,
      'got: ' + JSON.stringify(personalResult)
    );

    // ── A throw mid-merge must still clear syncPaused (the v375 guarantee,
    // now with syncPaused set true earlier in the function) ───────────────
    const throwResult = await page.evaluate(
      '(function(){' +
      'syncPaused = false;' +
      'var orig = mergeBabyData;' +
      'mergeBabyData = function(){ throw new Error("simulated merge failure"); };' +
      'try {' +
      '  applyPersonal({ baby: { medicine: [], growth: [], milestones: [] } });' +
      '} finally { mergeBabyData = orig; }' +
      'return syncPaused;' +
      '})()'
    );
    check(
      'applyPersonal: a throw mid-merge still leaves syncPaused cleared (v375 try/finally preserved)',
      throwResult === false,
      'got: ' + JSON.stringify(throwResult)
    );

    // ── Parity check: applyHousehold already behaves this way — confirm
    // both functions now share the identical during/after shape ───────────
    const householdResult = await page.evaluate(
      '(function(){' +
      'syncPaused = false;' +
      'var captured = null;' +
      'var orig = mergeBabyData;' +
      'mergeBabyData = function(){ captured = syncPaused; return orig.apply(this, arguments); };' +
      'try {' +
      '  applyHousehold({ baby: { medicine: [], growth: [], milestones: [] } });' +
      '} finally { mergeBabyData = orig; }' +
      'return { duringMerge: captured, afterMerge: syncPaused };' +
      '})()'
    );
    check(
      'applyHousehold: syncPaused is true while merging (the existing behaviour applyPersonal now matches)',
      householdResult.duringMerge === true,
      'got: ' + JSON.stringify(householdResult)
    );
    check(
      'applyPersonal and applyHousehold now have identical syncPaused during/after shapes',
      personalResult.duringMerge === householdResult.duringMerge && personalResult.afterMerge === householdResult.afterMerge,
      'personal: ' + JSON.stringify(personalResult) + ' household: ' + JSON.stringify(householdResult)
    );

    // Reset for any later case file sharing this page (file-level reload
    // already isolates across files, but leave nothing armed regardless).
    await page.evaluate('(function(){ syncPaused = false; return true; })()');

    return { pass, fail };
  },
};
