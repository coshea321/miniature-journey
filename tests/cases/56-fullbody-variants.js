'use strict';

// v447 — the two Full Body Flows merged into one, with switchable poses.
//
// The shape: poses the August-2026 review ADDED are plain members of the flow;
// the six it REPLACED, plus the nerve floss it DROPPED, are slots carrying both
// versions. The choice lives in `fl4_yoga_variants` and is remembered.
//
// What's worth pinning:
//   1. there is exactly ONE Full Body Flow now — a second "(Revised)" entry
//      coming back means the merge was undone
//   2. an UNSET slot resolves to the REVIEWED side, and so does a corrupt one.
//      This is the safety tripwire: defaulting to 'orig' would silently turn off
//      the work done for the foraminal stenosis, the L4/L5 bulge and the hernia
//   3. the four ADDED poses are NOT slots — they survive every slot being set to
//      'orig', because the review added them rather than substituting them
//   4. every slot really does swap, and the nerve floss is an on/off whose
//      reviewed side is empty (default OFF, per v415 moving it to Nerve & Hip)
//   5. `kneehug` expands to TWO poses on the reviewed side and one on the
//      original, so the flow length is NOT fixed and nothing may assume it is
//   6. the built flow never leaks a raw {slot:...} marker to the renderer
//   7. the choice persists through setYogaVariant, and the session reads
//      SS.yFlow so a switch on the intro takes effect immediately

module.exports = {
  name: '56-fullbody-variants',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function names(){ return buildFullBodyFlow().map(function(p){ return p.name; }); }
      function has(n){ return names().indexOf(n) !== -1; }
      function setAll(which){
        var p = {};
        YOGA_FB_SLOT_ORDER.forEach(function(id){ p[id] = which; });
        storeSet('fl4_yoga_variants', p);
      }

      // ── 1. One flow, not two ────────────────────────────────────────────
      ok('there is exactly one Full Body Flow', YOGA_TRAIN_NAMES.length === 2,
        YOGA_TRAIN_NAMES.join(' | '));
      ok('no "(Revised)" programme remains', YOGA_TRAIN_NAMES.join(' ').indexOf('Revised') === -1,
        YOGA_TRAIN_NAMES.join(' | '));
      ok('names, notes and flows all stay the same length',
        YOGA_TRAIN_NAMES.length === YOGA_TRAIN_NOTES.length &&
        YOGA_TRAIN_NAMES.length === YOGA_FLOWS_TRAIN.length);

      // ── 2. Unset and corrupt both resolve to REVIEWED (the safety default) ─
      storeSet('fl4_yoga_variants', {});
      ok('an unset slot resolves to the reviewed side',
        YOGA_FB_SLOT_ORDER.every(function(id){ return yogaVariantOf(id) === 'rev'; }));
      storeSet('fl4_yoga_variants', { cat: 'nonsense', bridge: '', trunk: null });
      ok('TRIPWIRE: a corrupt slot value fails safe to the reviewed side, never to the original',
        yogaVariantOf('cat') === 'rev' && yogaVariantOf('bridge') === 'rev' && yogaVariantOf('trunk') === 'rev',
        yogaVariantOf('cat') + ',' + yogaVariantOf('bridge') + ',' + yogaVariantOf('trunk'));
      storeSet('fl4_yoga_variants', 'not-an-object');
      ok('a non-object stored value does not throw and still reads as reviewed',
        yogaVariantOf('cat') === 'rev');

      // ── 3. The ADDED poses are not slots — they survive an all-original run ─
      setAll('orig');
      var allOrig = names();
      ['Quadruped Scapular Press', "Supported Child's Pose", 'Supported Tree Right', 'Supported Tree Left']
        .forEach(function(n){
          ok('the review\\'s addition "' + n + '" survives every slot set to original',
            allOrig.indexOf(n) !== -1);
        });

      // ── 4. Every slot really swaps ──────────────────────────────────────
      var pairs = [
        ['Alternating Heel Slides', 'Dead Bug'],
        ['Cat to Neutral', 'Cat-Cow'],
        ['Mountain with Calf Raises', 'Mountain and Arm Raises'],
        ['Low Dynamic Bridge', 'Bridge Pose'],
        ['Supported Savasana', 'Savasana']
      ];
      setAll('rev');
      var allRev = names();
      pairs.forEach(function(pr){
        ok('reviewed side shows "' + pr[0] + '" and not "' + pr[1] + '"',
          allRev.indexOf(pr[0]) !== -1 && allRev.indexOf(pr[1]) === -1);
      });
      pairs.forEach(function(pr){
        ok('original side shows "' + pr[1] + '" and not "' + pr[0] + '"',
          allOrig.indexOf(pr[1]) !== -1 && allOrig.indexOf(pr[0]) === -1);
      });

      // The nerve floss is an on/off, not an either/or: default OFF.
      ok('the sciatic nerve floss is OFF by default', allRev.indexOf('Sciatic Nerve Floss') === -1);
      ok('the sciatic nerve floss comes back when asked for', allOrig.indexOf('Sciatic Nerve Floss') !== -1);
      ok('its reviewed side is deliberately an empty array', YOGA_FB_SLOTS.floss.rev.length === 0);
      storeSet('fl4_yoga_variants', { floss: 'orig' });
      var withFloss = names();
      ok('the floss lands back in the original position, after Half Splits Left',
        withFloss[withFloss.indexOf('Sciatic Nerve Floss') - 1] === 'Half Splits Left',
        withFloss.slice(10, 15).join(' > '));

      // ── 5. kneehug is one-to-two, so the length is not fixed ────────────
      ok('the knee hug expands to two poses on the reviewed side',
        YOGA_FB_SLOTS.kneehug.rev.length === 2 && YOGA_FB_SLOTS.kneehug.orig.length === 1);
      setAll('rev');
      ok('reviewed side has both single knee hugs, and no double',
        has('Single Knee to Chest Right') && has('Single Knee to Chest Left') && !has('Knees to Chest'));

      // ── 6. No slot marker ever reaches the renderer ─────────────────────
      ['rev','orig'].forEach(function(which){
        setAll(which);
        var bad = buildFullBodyFlow().filter(function(p){
          return p.slot || !p.name || typeof p.dur !== 'number' || !p.cue;
        });
        ok('every pose is fully formed with ' + which + ' selected (no slot marker leaks)',
          bad.length === 0, JSON.stringify(bad.slice(0, 2)));
      });
      ok('yogaFlowTotal returns real seconds', yogaFlowTotal(buildFullBodyFlow()) > 600,
        String(yogaFlowTotal(buildFullBodyFlow())));

      // ── 7. Persistence, and the session reading SS.yFlow ────────────────
      storeSet('fl4_yoga_variants', {});
      setYogaVariant('bridge', 'orig');
      ok('setYogaVariant persists the choice to fl4_yoga_variants',
        (storeGet('fl4_yoga_variants') || {}).bridge === 'orig',
        JSON.stringify(storeGet('fl4_yoga_variants')));
      ok('and a freshly built flow reflects it', has('Bridge Pose') && !has('Low Dynamic Bridge'));
      setYogaVariant('bridge', 'rev');
      ok('switching back restores the reviewed pose', has('Low Dynamic Bridge') && !has('Bridge Pose'));
      ok('an unknown slot id is ignored rather than throwing',
        (function(){ try { setYogaVariant('no-such-slot','orig'); return true; } catch(e){ return false; } })());

      // Stand the session up the way openYogaSession does, then switch on the intro.
      openYogaSession(0);
      var before = SS.yFlow.length;
      ok('the session builds its own flow into SS.yFlow', before > 0 && !!SS.yFlow);
      ok('the intro renders the switch picker for the Full Body Flow',
        document.getElementById('sesBody').innerHTML.indexOf('yv-btn') !== -1);
      setYogaVariant('kneehug', 'orig');
      ok('switching on the intro rebuilds SS.yFlow immediately (one pose shorter)',
        SS.yFlow.length === before - 1, before + ' -> ' + SS.yFlow.length);
      openYogaSession(1);
      ok('the picker does NOT appear on Hips & Lower Back, which has no slots',
        document.getElementById('sesBody').innerHTML.indexOf('yv-btn') === -1);
      closeSessionOverlay();

      return {pass:pass, fail:fail};
    })()`);
  },
};
