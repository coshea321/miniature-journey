'use strict';

// v448 — every Full Body Flow pose reads as short CUES by default, with the full
// paragraph one tap away under DETAILS.
//
// What's worth pinning:
//   1. all 35 Full Body poses have cues — both sides of every switch, not just
//      the reviewed ones, or flipping a switch would drop you onto a pose with
//      no short version
//   2. Cues is what you get on arrival, every time
//   3. the reset is DERIVED from the pose index, not assigned at each advance.
//      Moving to another pose by ANY route falls back to cues, which is the
//      whole reason SS.yViewFor exists — a fifth advance path added later must
//      not be able to inherit the previous pose's Details view
//   4. Details still shows the reviewed paragraph verbatim. That text is the
//      safety content v446 wrote; the tabs must never become a way to lose it
//   5. v475 CHANGED THIS: Hips & Lower Back is cued too, to the same standard,
//      and it finally carries a review note. The no-cues fallback is still a
//      live code path (a future flow could arrive uncued), so it is now pinned
//      against a hand-built pose instead of against a real flow — do NOT
//      delete it just because no shipped pose reaches it any more

module.exports = {
  name: '57-pose-cues-details',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      function html(){ return document.getElementById('sesBody').innerHTML; }

      // ── 1. Every Full Body pose has cues, on BOTH sides of every switch ──
      var everyPose = [];
      YOGA_FB_BASE.forEach(function(p){
        if (!p.slot) { everyPose.push(p); return; }
        YOGA_FB_SLOTS[p.slot].rev.forEach(function(q){ everyPose.push(q); });
        YOGA_FB_SLOTS[p.slot].orig.forEach(function(q){ everyPose.push(q); });
      });
      ok('the flow really does cover 35 distinct poses across both sides',
        everyPose.length === 35, String(everyPose.length));
      var uncued = everyPose.filter(function(p){ return !p.cues || !p.cues.length; })
                            .map(function(p){ return p.name; });
      ok('every Full Body pose has cues, reviewed side AND original side',
        uncued.length === 0, uncued.join(', '));
      var thin = everyPose.filter(function(p){ return p.cues.length < 3; }).map(function(p){ return p.name; });
      ok('no pose is fobbed off with fewer than three cues', thin.length === 0, thin.join(', '));
      var longCue = everyPose.filter(function(p){
        return p.cues.some(function(c){ return c.length > 90; });
      }).map(function(p){ return p.name; });
      ok('cues stay short enough to read at arm\\'s length (<= 90 chars)',
        longCue.length === 0, longCue.join(', '));
      var noDetail = everyPose.filter(function(p){ return !p.cue || p.cue.length < 60; })
                              .map(function(p){ return p.name; });
      ok('every pose still carries its full paragraph for Details',
        noDetail.length === 0, noDetail.join(', '));

      // ── 2. Cues is the default on arrival ───────────────────────────────
      storeSet('fl4_yoga_variants', {});
      openYogaSession(0);
      beginYoga();
      ok('the pose screen opens on Cues', yogaPoseView() === 'cues', yogaPoseView());
      ok('and it renders the bullet list, not the paragraph',
        html().indexOf('ycue-list') !== -1 && html().indexOf('ses-pose-cue') === -1);
      ok('both tabs are on screen', html().indexOf('>Cues<') !== -1 && html().indexOf('>Details<') !== -1);

      // ── 3. Details, and the derived reset ───────────────────────────────
      setYogaPoseView('details');
      ok('tapping Details switches the view', yogaPoseView() === 'details');
      ok('Details renders the paragraph and the hold time',
        html().indexOf('ses-pose-cue') !== -1 && html().indexOf('ycue-meta') !== -1 &&
        html().indexOf('ycue-list') === -1);
      ok('Details shows the reviewed paragraph verbatim',
        html().indexOf(esc(SS.yFlow[SS.yPoseIdx].cue)) !== -1);

      skipYogaPose();
      ok('the NEXT pose is back on Cues (skip)', yogaPoseView() === 'cues', yogaPoseView());
      setYogaPoseView('details');
      prevYogaPose();
      ok('and going back a pose is on Cues too (prev)', yogaPoseView() === 'cues', yogaPoseView());

      // TRIPWIRE: the reset must come from the pose index, not from an
      // assignment bolted onto each advance path. Move the index by hand -
      // no advance function involved - and the view must still fall back.
      setYogaPoseView('details');
      ok('Details is set on the current pose', yogaPoseView() === 'details');
      SS.yPoseIdx = SS.yPoseIdx + 1;
      ok('TRIPWIRE: moving the pose index by ANY route falls back to Cues',
        yogaPoseView() === 'cues', 'yView=' + SS.yView + ' yViewFor=' + SS.yViewFor + ' idx=' + SS.yPoseIdx);
      SS.yPoseIdx = SS.yPoseIdx - 1;
      ok('returning to the pose the choice was made on restores Details',
        yogaPoseView() === 'details');

      // ── 4. Switching a variant gives a pose that still has cues ─────────
      closeSessionOverlay();
      setYogaVariant('cat', 'orig');
      setYogaVariant('kneehug', 'orig');
      setYogaVariant('floss', 'orig');
      openYogaSession(0);
      var stillUncued = SS.yFlow.filter(function(p){ return !p.cues || !p.cues.length; })
                                .map(function(p){ return p.name; });
      ok('a flow built from the ORIGINAL side is fully cued too',
        stillUncued.length === 0, stillUncued.join(', '));
      closeSessionOverlay();
      storeSet('fl4_yoga_variants', {});

      // ── 5. Hips & Lower Back is cued to the same standard (v475) ───────
      openYogaSession(1);
      var hips = SS.yFlow;
      ok('Hips & Lower Back is the 18-pose flow', hips.length === 18, String(hips.length));
      var hipsUncued = hips.filter(function(p){ return !p.cues || p.cues.length < 3; })
                           .map(function(p){ return p.name; });
      ok('every Hips & Lower Back pose has at least three cues',
        hipsUncued.length === 0, hipsUncued.join(', '));
      var hipsLong = hips.filter(function(p){
        return p.cues.some(function(c){ return c.length > 90; });
      }).map(function(p){ return p.name; });
      ok('its cues stay under 90 chars too', hipsLong.length === 0, hipsLong.join(', '));
      var hipsNoPara = hips.filter(function(p){ return !p.cue || p.cue.length < 60; })
                           .map(function(p){ return p.name; });
      ok('and every one still carries its paragraph for Details',
        hipsNoPara.length === 0, hipsNoPara.join(', '));
      beginYoga();
      ok('so it now opens on Cues with both tabs, like Full Body',
        html().indexOf('ycue-list') !== -1 && html().indexOf('>Details<') !== -1);

      // The general-info note. Empty since the flow shipped; v475 filled it.
      ok('Hips & Lower Back carries a review note',
        typeof YOGA_TRAIN_NOTES[1] === 'string' && YOGA_TRAIN_NOTES[1].length > 200,
        String((YOGA_TRAIN_NOTES[1] || '').length));
      ok('the note says plainly that the flow has NOT been re-tuned',
        /never been checked/.test(YOGA_TRAIN_NOTES[1]));
      ok('and it does NOT claim the flow is approved or safe',
        !/physio-approved|stenosis-safe/i.test(YOGA_TRAIN_NOTES[1]));
      closeSessionOverlay();
      openYogaSession(1);
      ok('the intro screen actually renders it',
        document.getElementById('sesBody').innerHTML.indexOf(esc(YOGA_TRAIN_NOTES[1])) !== -1);
      closeSessionOverlay();

      // ── 5b. TRIPWIRE: the no-cues fallback is still wired ──────────────
      // No shipped pose reaches it now, so it is pinned against a hand-built
      // one. A flow added later without cues must still render its paragraph.
      var bare = yogaPoseBodyHtml({name:'x', sanskrit:'x', dur:30, cue:'Paragraph only.'});
      ok('a pose with no cues array still shows its paragraph',
        bare.indexOf('ses-pose-cue') !== -1 && bare.indexOf('Paragraph only.') !== -1);
      ok('and gets NO tabs', bare.indexOf('ycue-tab') === -1);

      return {pass:pass, fail:fail};
    })()`);
  },
};
