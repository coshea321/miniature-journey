'use strict';

// v477 — the Knee Programme runs at one of two LEVELS, picked on the intro.
// Basic is one set of everything and one round of each per-leg stretch; Full
// is the programme as written.
//
// What's worth pinning:
//   1. BASIC IS THE DEFAULT, and a corrupt/unknown stored value falls back to
//      Basic, not Full — the fail-safe direction is the shorter, gentler one
//   2. Basic collapses sets to 1 and turns perLeg off, and NEVER drops an
//      exercise — the card's "12 exercises" must stay true at either level
//   3. Basic replaces the Right side / Left side labels with the both-sides
//      instruction those four rounds used to carry on their own. Losing that
//      line means Basic silently halves a stretch
//   4. Full is byte-for-byte the old behaviour: 4 sets, sides labelled
//   5. the choice is remembered, and read ONCE at openPhysioSession — a
//      session runs at the level it was begun at
//   6. the other five programmes have no `levels` flag and are untouched:
//      always full, and no picker on their intro

module.exports = {
  name: '72-knee-levels',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function html(){ return document.getElementById('sesBody').innerHTML; }

      var kneeIdx = -1, otherIdx = -1;
      PROGRAMMES_TRAIN.forEach(function(p, i){
        if (p.id === 'knee_general') kneeIdx = i;
        else if (otherIdx === -1) otherIdx = i;
      });
      var knee = PROGRAMMES_TRAIN[kneeIdx];
      ok('the Knee Programme opts in with levels:true', knee.levels === true);

      // ── 1. Basic is the default, and junk falls back to Basic ──────────
      storeSet('fl4_physio_level', null);
      ok('unset reads as basic', physioLevelPref() === 'basic', physioLevelPref());
      storeSet('fl4_physio_level', 'BASIC');
      ok('a wrong-case value still reads as basic', physioLevelPref() === 'basic');
      storeSet('fl4_physio_level', 'nonsense');
      ok('TRIPWIRE: an unknown value falls back to BASIC, never full',
        physioLevelPref() === 'basic', physioLevelPref());
      storeSet('fl4_physio_level', 'full');
      ok('only the exact string "full" reads as full', physioLevelPref() === 'full');
      storeSet('fl4_physio_level', null);

      // ── 2. Basic: one set each, perLeg off, nothing dropped ────────────
      openPhysioSession(kneeIdx);
      ok('a fresh session opens on basic', SS.pLevel === 'basic', String(SS.pLevel));
      ok('the intro shows the picker', html().indexOf('plv-btn') !== -1);
      ok('Basic is the pressed button',
        /aria-pressed='true'[^>]*>\\s*<span class='plv-name'>Basic/.test(html()) ||
        html().indexOf("aria-pressed='true'") < html().indexOf('Full'));
      ok('the exercise list is still all 12 at Basic',
        (html().match(/border-bottom:1px solid #E8E2D6/g) || []).length === 12,
        String((html().match(/border-bottom:1px solid #E8E2D6/g) || []).length));

      var multiSet = knee.exercises.filter(function(e){ return (e.sets || 1) > 1; });
      ok('the programme really does have multi-set exercises to collapse',
        multiSet.length > 0, String(multiSet.length));
      var notCollapsed = knee.exercises.filter(function(e){ return physioSetsOf(e) !== 1; })
                                       .map(function(e){ return e.id; });
      ok('Basic collapses EVERY exercise to one set',
        notCollapsed.length === 0, notCollapsed.join(', '));
      var stillPerLeg = knee.exercises.filter(function(e){ return physioPerLegOf(e); })
                                      .map(function(e){ return e.id; });
      ok('Basic turns perLeg off everywhere', stillPerLeg.length === 0, stillPerLeg.join(', '));
      ok('the underlying data is NOT mutated — sets:4 is still on the stretches',
        knee.exercises.filter(function(e){ return e.sets === 4 && e.perLeg; }).length === 3);

      // ── 3. Basic says to do both sides ─────────────────────────────────
      var perLegIdx = -1;
      knee.exercises.forEach(function(e, i){ if (perLegIdx === -1 && e.perLeg) perLegIdx = i; });
      ok('the Knee Programme has a per-leg stretch', perLegIdx !== -1, String(perLegIdx));
      beginPhysio();
      SS.pExIdx = perLegIdx; SS.pSetNum = 1;
      renderPhysioSession();
      ok('TRIPWIRE: a per-leg stretch at Basic says to do both sides',
        html().indexOf('Do both sides') !== -1);
      ok('and it does NOT label a single side', html().indexOf('Right side') === -1 &&
        html().indexOf('Left side') === -1);
      ok('one set means no set dots', html().indexOf('Set 1 of') === -1);
      closeSessionOverlay();

      // ── 4. Full is the programme as written ────────────────────────────
      setPhysioLevel('full');
      openPhysioSession(kneeIdx);
      ok('the session opens on full once chosen', SS.pLevel === 'full', String(SS.pLevel));
      ok('Full restores every set',
        physioSetsOf(knee.exercises[perLegIdx]) === knee.exercises[perLegIdx].sets);
      ok('Full restores perLeg', physioPerLegOf(knee.exercises[perLegIdx]) === true);
      beginPhysio();
      SS.pExIdx = perLegIdx; SS.pSetNum = 1;
      renderPhysioSession();
      ok('Full labels the right side on set 1', html().indexOf('Right side') !== -1);
      ok('and does NOT show the Basic both-sides line', html().indexOf('Do both sides') === -1);
      SS.pSetNum = knee.exercises[perLegIdx].sets;
      renderPhysioSession();
      ok('Full labels the left side on the last set', html().indexOf('Left side') !== -1);
      closeSessionOverlay();

      // ── 5. Remembered, and read once at open ───────────────────────────
      ok('the choice is remembered', physioLevelPref() === 'full');
      openPhysioSession(kneeIdx);
      beginPhysio();
      storeSet('fl4_physio_level', 'basic');
      ok('TRIPWIRE: changing the stored pref mid-session does NOT move the level',
        SS.pLevel === 'full', String(SS.pLevel));
      closeSessionOverlay();
      openPhysioSession(kneeIdx);
      ok('the next session picks the new level up', SS.pLevel === 'basic', String(SS.pLevel));
      closeSessionOverlay();
      storeSet('fl4_physio_level', null);

      // ── 6. The other five programmes are untouched ─────────────────────
      var leaked = PROGRAMMES_TRAIN.filter(function(p){ return p.id !== 'knee_general' && p.levels; })
                                   .map(function(p){ return p.id; });
      ok('no other programme opted in', leaked.length === 0, leaked.join(', '));
      openPhysioSession(otherIdx);
      ok('a programme without levels always runs full', SS.pLevel === 'full', String(SS.pLevel));
      ok('and shows no picker on its intro', html().indexOf('plv-btn') === -1);
      var other = PROGRAMMES_TRAIN[otherIdx];
      var changed = other.exercises.filter(function(e){ return physioSetsOf(e) !== (e.sets || 1); })
                                   .map(function(e){ return e.id; });
      ok('its set counts are unchanged', changed.length === 0, changed.join(', '));
      closeSessionOverlay();

      return {pass:pass, fail:fail};
    })()`);
  },
};
