'use strict';

// v481 — Hips & Lower Back re-tuned the way Full Body was (design confirmed by
// Cathal 22/09/2026): every changed pose is a reviewed/original slot, the
// original kept verbatim; Windshield Wipers is the one unchanged pose; the
// second Seated Forward Fold is skipped on the reviewed side; an "All" row sits
// on top of the fourteen switches.
//
// What's worth pinning:
//   1. unset AND corrupt Hips slots read as reviewed — the same safety tripwire
//      as Full Body's, because a default of 'orig' switches the re-tune off
//   2. the slot ids are namespaced: Full Body's `kneehug`/`savasana` and the
//      Hips `hlb_kneehug`/`hlb_savasana` share `fl4_yoga_variants` and must stay
//      independent choices
//   3. all-original gives back EXACTLY the old eighteen poses, in order — the
//      switch is the promise that nothing was lost
//   4. the reviewed side really drops the poses the review named (loaded and
//      end-range folds, the deep squat, repeated side-bending, held twists)
//   5. every reviewed pose is cued, short, keeps a full paragraph for Details,
//      and shows NO photo (the only photos are of the original poses)
//   6. the All row sets only this flow's slots and lights only when they agree
//   7. the card's pose count follows the switches, and the note says the
//      re-tune is NOT physio-checked

module.exports = {
  name: '76-hips-retune',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function names(){ return buildHipsFlow().map(function(p){ return p.name; }); }
      function html(){ return document.getElementById('sesBody').innerHTML; }

      // ── 1. The safety default ───────────────────────────────────────────
      storeSet('fl4_yoga_variants', {});
      ok('fourteen Hips switches, all reviewed when unset',
        YOGA_HLB_SLOT_ORDER.length === 14 &&
        YOGA_HLB_SLOT_ORDER.every(function(id){ return yogaVariantOf(id) === 'rev'; }));
      storeSet('fl4_yoga_variants', { hlb_standfold: 'nonsense', hlb_swim: '', hlb_squat: null });
      ok('TRIPWIRE: a corrupt Hips slot fails safe to reviewed',
        names().indexOf('Standing Forward Fold') === -1 && names().indexOf('Swimming Side Stretch') === -1 &&
        names().indexOf('Yogi Squat') === -1, names().join(' > '));

      // ── 2. Namespaced from Full Body ────────────────────────────────────
      storeSet('fl4_yoga_variants', {});
      setYogaVariant('kneehug', 'orig');
      setYogaVariant('savasana', 'orig');
      ok('Full Body\\'s knee hug / savasana choices do not leak into Hips',
        names().indexOf('Knees to Chest') === -1 && names().indexOf('Supported Savasana') !== -1);
      storeSet('fl4_yoga_variants', {});
      setYogaVariant('hlb_kneehug', 'orig');
      ok('and a Hips choice does not leak into Full Body',
        buildFullBodyFlow().map(function(p){ return p.name; }).indexOf('Knees to Chest') === -1 &&
        names().indexOf('Knees to Chest') !== -1);
      ok('every Hips slot id is hlb_-prefixed and none collides with a Full Body slot',
        YOGA_HLB_SLOT_ORDER.every(function(id){ return /^hlb_/.test(id) && !YOGA_FB_SLOTS[id]; }));

      // ── 3. All-original is the old flow, exactly ────────────────────────
      setYogaVariantAll(1, 'orig');
      var OLD = ['Seated Forward Fold Variation','Core Stability Boat Prep','Seated Spinal Twist Right',
        'Seated Spinal Twist Left','Head-to-Knee Pose Right','Head-to-Knee Pose Left','Bound Angle Diamond Fold',
        'Swimming Side Stretch','Seated Forward Fold','Froggy Pose','Yogi Squat','Standing Forward Fold',
        'Knees to Chest','Eagle Legs Twist Right','Eagle Legs Twist Left','Happy Baby','Windshield Wipers','Savasana'];
      ok('TRIPWIRE: all-original is exactly the old eighteen poses, in order',
        names().join('|') === OLD.join('|'), names().join(' > '));
      ok('the original Standing Forward Fold keeps its original text',
        buildHipsFlow()[11].cue.indexOf('upper body hangs heavy') !== -1 && buildHipsFlow()[11].dur === 60);

      // ── 4. The reviewed side drops what the review named ────────────────
      setYogaVariantAll(1, 'rev');
      var rev = names();
      ['Seated Forward Fold Variation','Core Stability Boat Prep','Seated Spinal Twist Right','Head-to-Knee Pose Right',
       'Bound Angle Diamond Fold','Swimming Side Stretch','Seated Forward Fold','Froggy Pose','Yogi Squat',
       'Standing Forward Fold','Knees to Chest','Eagle Legs Twist Right','Happy Baby','Savasana'].forEach(function(n){
        ok('reviewed side has no "' + n + '"', rev.indexOf(n) === -1);
      });
      ['Seated Hip Hinge','Supine Marching','Small Seated Rotation Right','Supine Hamstring Stretch Left',
       'Upright Butterfly','Seated Figure-Four Right','Wide-Knee Rocking','Supported Squat',
       'Wall-Supported Half Hinge','Single Knee to Chest Right','Supported Eagle Twist Left',
       'Half Happy Baby Right','Supported Savasana'].forEach(function(n){
        ok('reviewed side has "' + n + '"', rev.indexOf(n) !== -1);
      });
      ok('Windshield Wipers is in both versions, unchanged',
        rev.indexOf('Windshield Wipers') !== -1 && YOGA_HLB_BASE.some(function(p){ return p.name === 'Windshield Wipers'; }));
      ok('the second seated forward fold is SKIPPED on the reviewed side (empty array)',
        YOGA_HLB_SLOTS.hlb_fold2.rev.length === 0);
      ok('the reviewed knee hug and savasana are the SAME text as Full Body\\'s',
        YOGA_HLB_SLOTS.hlb_kneehug.rev === YOGA_FB_SLOTS.kneehug.rev &&
        YOGA_HLB_SLOTS.hlb_savasana.rev === YOGA_FB_SLOTS.savasana.rev);
      ok('no slot marker leaks, either side', ['rev','orig'].every(function(w){
        setYogaVariantAll(1, w);
        return buildHipsFlow().every(function(p){ return !p.slot && p.name && typeof p.dur === 'number' && p.cue; });
      }));

      // ── 5. Every reviewed pose: cued, short, full paragraph, no photo ───
      var revPoses = [];
      YOGA_HLB_SLOT_ORDER.forEach(function(id){ YOGA_HLB_SLOTS[id].rev.forEach(function(q){ revPoses.push(q); }); });
      var bad = revPoses.filter(function(p){
        return !p.cues || p.cues.length < 3 || p.cues.some(function(c){ return c.length > 90; }) || !p.cue || p.cue.length < 60;
      }).map(function(p){ return p.name; });
      ok('every reviewed pose has 3+ short cues and a full Details paragraph', bad.length === 0, bad.join(', '));
      var own = revPoses.filter(function(p){ return YOGA_FB_SLOTS.kneehug.rev.indexOf(p) === -1 && YOGA_FB_SLOTS.savasana.rev.indexOf(p) === -1; });
      ok('every newly written reviewed pose is marked noPhoto',
        own.length === 16 && own.every(function(p){ return p.noPhoto === true; }), String(own.length));
      setYogaVariantAll(1, 'rev');
      openYogaSession(1);
      beginYoga();
      // "Half Happy Baby" matches the ORIGINAL Happy Baby photo by name, so
      // only the noPhoto guard keeps the full pose off this screen.
      while (SS.yFlow[SS.yPoseIdx].name !== 'Half Happy Baby Right') skipYogaPose();
      ok('TRIPWIRE: Half Happy Baby does not show the original Happy Baby photo',
        getPosePhoto('Half Happy Baby Right') !== null && html().indexOf('ses-pose-photo') === -1);
      ok('and it shows Cues/Details tabs', html().indexOf('ycue-tab') !== -1);
      closeSessionOverlay();

      // ── 6. The All row ──────────────────────────────────────────────────
      storeSet('fl4_yoga_variants', { bridge: 'orig' });
      openYogaSession(1);
      ok('the Hips intro shows the All row', html().indexOf('setYogaVariantAll(1') !== -1);
      function allBtns(){ return document.querySelectorAll('#sesBody .yv-all .yv-btn'); }
      ok('with every slot reviewed, "All reviewed" is lit and "All original" is not',
        allBtns().length === 2 && allBtns()[0].classList.contains('on') && !allBtns()[1].classList.contains('on'));
      setYogaVariant('hlb_squat', 'orig');
      ok('a mixed flow lights neither All button',
        allBtns().length === 2 && !allBtns()[0].classList.contains('on') && !allBtns()[1].classList.contains('on'));
      ok('the switch rebuilt SS.yFlow at once', SS.yFlow.some(function(p){ return p.name === 'Yogi Squat'; }));
      setYogaVariantAll(1, 'orig');
      ok('All original sets every Hips slot', YOGA_HLB_SLOT_ORDER.every(function(id){ return yogaVariantOf(id) === 'orig'; }));
      ok('...and leaves Full Body\\'s choices alone', (storeGet('fl4_yoga_variants') || {}).bridge === 'orig' &&
        yogaVariantOf('cat') === 'rev');
      ok('the session follows it (18 poses)', SS.yFlow.length === 18, String(SS.yFlow.length));
      closeSessionOverlay();

      // ── 7. Card and note ────────────────────────────────────────────────
      storeSet('fl4_yoga_variants', {});
      switchSection('train');
      if (typeof renderTrainPrograms === 'function' && document.getElementById('progGrid')) {
        renderTrainPrograms();
        var card = document.querySelector(".prog-card[data-type='yoga'][data-key='1']");
        ok('the Hips card counts the live reviewed flow',
          card && card.textContent.indexOf(buildHipsFlow().length + ' poses') !== -1, card && card.textContent);
      }
      var n = String(YOGA_TRAIN_NOTES[1] || '');
      ok('the note says re-tuned', /Re-tuned 22\\/09\\/2026/.test(n));
      ok('TRIPWIRE: the note says the reviewed side is NOT physio-checked', /NOT been checked by a physio/.test(n));
      ok('the note keeps the eating/waking/breathing rules and the red flags',
        /2–3 hours after eating/.test(n) && /no breath-holding/.test(n) && /urgent medical assessment/.test(n));
      storeSet('fl4_yoga_variants', {});

      return {pass:pass, fail:fail};
    })()`);
  },
};
