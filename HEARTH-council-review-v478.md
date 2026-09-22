# Hearth council review — v458 to v478

**Date:** 22/09/2026. **Reviewed:** `main` at `718319a` (v478 · 20/09/2026). **Scope:** everything shipped after the last council review, which covered v457 at `8b7f6b22`. That is 21 versions and roughly 1,400 lines of `index.html`.
**Baseline:** `tests/checks.sh` PASS, `node tests/run.js` all green on `718319a`.
**Method:** I read the whole `index.html` diff `8b7f6b22..718319a`, then checked each finding below against the live line. Anchors refer to `718319a`. Where I only read the code and did not reproduce the behaviour, the finding says so.

**What this window contained:**
- **v457 council fixes (v458–v464):** Baby draft guard, honest medicine save plus the blank no-weight dose, the food-id race, the restore/deletion policy, the category/note injection sites plus the logout token fix, and the test-runner/paste-fence fix.
- **Features and polish (v465–v478):** medicine history in administration order, Watchlist Wikipedia link and summary, the Firebase auth-refresh gate, UI polish, the Medicine tab reorder and accessible names, the empty-week Home strip, the Recipes Tools sheet, the Settings regroup, recipe collapse and resize, the Knee Programme with its cues and levels, and the Baby › Bags sync rewrite.

---

## 1. Mobile UX & accessibility engineer

**Assumptions.** Android Chrome as an installed PWA on two phones and a tablet. Mostly one-handed use, often with the keyboard up.

**Risks, most severe first.**
1. **The recipe resize grip can get stuck "on"** (`wireRecipeResizeGrips`, 11821). It listens for `pointermove`/`pointerup` on `document` but never for `pointercancel`, and it doesn't use `setPointerCapture`. When Android takes a touch over for a scroll or the system back gesture, `pointerup` never fires, so the move listener stays attached. After that, any finger movement anywhere resizes that textarea until the next `pointerup`. `touch-action:none` on the grip makes this less likely but doesn't rule it out. *Found by reading the code, not reproduced.* **Fix:** also listen for `pointercancel`, or call `grip.setPointerCapture(e.pointerId)`.
2. **`keyboardSheetOwner` (23210) now works, but it depends on computed-style values.** The test `cs.bottom === "0px" && cs.top !== "0px"` relies on Chrome resolving `top:auto` to a pixel value for fixed elements. A sheet that is *already* offset has `bottom = inset px`, so it no longer matches. It still works only because the class is already on it. `70-keyboard-sheet-scope.js` covers today's sheets. This is fine as it stands. It is flagged so nobody "simplifies" it.
3. **Two sizes are still small.** The Knee level picker's sub-labels are 11px (`.plv-sub`), which is fine. The medicine save-failure box is 13px, below the 14px dose working. That is the one safety line that should not be the smaller of the two (see Expert 2).

**Good.** `.modal-close` is now 40px. The Notes toolbar has 23 accessible names, plus `aria-pressed` on the ★. The `[hidden]` override lesson from v471 is written down in the CSS. The chip-row fade works.

**Alternative.** Use one shared `wireDragResize(grip, target)` helper built on pointer capture, instead of document-level listeners. It would be reusable if Notes ever wants the same thing.

**Confidence: medium-high.** Everything above was read, not tested on a device.

---

## 2. Healthcare & wellness designer (physio + paediatric dosing)

**Assumptions.** Cathal is the Train user, with the recorded history of a 4cm hiatus hernia, L5/S1 foraminal stenosis and an L4/L5 disc bulge. The Baby medicine screen is used at 2am.

**The dosing constraints were checked and are intact.** The strengths, 15/10 mg/kg, round-down, 10ml cap and Nurofen <5kg block are unchanged, and the `checks.sh` pins pass. The v459 no-weight change goes in the **safe** direction: there is no longer an invented "standard infant dose", and Nurofen can no longer skip the 5kg check. "Check the leaflet" is still there, and so is manual entry. `08-dose-e2e.js` was edited to pin the new behaviour. It was not weakened.

**Risks, most severe first.**
1. **Hips & Lower Back still shows no caution at all, and the v475 note that would have fixed that was reverted.** The pose review (`HEARTH-yoga-review.md`, 05/09) found about 12 of its 18 poses use a movement Cathal's own recorded history warns against. v475 added a careful, non-prescriptive note to `YOGA_TRAIN_NOTES[1]` ("Not re-tuned for your history … worth raising at your next appointment"). Commit `1412675` reverted it together with the cues because they were on the wrong branch ("the ask was the Knee Programme"). **The cues were out of scope, but the note was not a pose change.** It is the one thing the backlog's "no session may change poses" rule still allows. `YOGA_TRAIN_NOTES[1]` is `''` again (19359). This is the most important open item in the Train content, and it is now 17 days old.
2. **The medicine save-failure message sends him to the wrong fix** (22309): "this device's storage is full … Free up space". Hearth's storage limit is a **per-app browser quota**, so deleting photos or apps on the phone won't free it. At 2am he will clear phone storage, tap Log again, and it will fail again. The dose is also recorded nowhere. **Fix:** "NOT logged — Hearth's own storage is full. Write this dose down now. To make room, remove photos from Plants or Home inventory." Make it the same size as the dose working, or bigger. The wording is Cathal's call. The mechanism stays as it is.
3. **The Knee Programme was never checked against the spine history either** (19445). It is correctly labelled "general, not prescribed", and its warning is good. But its **Hamstring Stretch** (seated lean forward) and **standing Quad Stretch** are flexion and extension-risk movements of the same kind the Full Body note warns about. Nothing on screen links the two. This is less serious than item 1, because the cues already say "back straight, lean from the hips" and "no arching". It's still worth one line to the physio.
4. **In Basic, "One set each" is ambiguous for the each-leg strength moves.** The "Do both sides" label (19937) only applies to `perLeg` stretches. Quad Sets, Straight Leg Raise, Short Arc Quads, Seated Knee Extension and Side-Lying Leg Raise are "10 each leg" but aren't `perLeg`. In Basic they show "10 reps" with no side prompt, so the only reminder is in the cue text. This is not a safety problem. It could quietly halve the work on one leg.
5. **Minor wording.** The Nurofen no-weight note says it "needs a weight to check the 5kg minimum". Plainer at 2am: "Nurofen is not for babies under 5kg — add a weight to check."

**Alternatives.** For item 1, put the reverted note back **on its own**, with no cues and no pose changes. For item 4, add `perLegReps:true` to those five exercises and show "Each leg" the same way "Do both sides" is shown.

**Confidence: high** on dosing and on the revert. **Medium** on the physio specifics: this is not a clinical assessment, and neither is the yoga review.

---

## 3. Sync & data-lifecycle architect

**Assumptions.** Two adults, each with a phone, one tablet, and at least one device on an older service worker for a day after each release.

**Risks, most severe first.**
1. **The bag merge is right, but mixed versions will churn for a while.** The design of `mergeBags` (2398) is sound: union by id at both levels, newest-wins, tombstones in both channels, `bags_deleted`/`bagitems_deleted` outside the non-empty guard, seeds stamped `updated:0`. A device still on v477 keeps doing `remote.bags || local.bags` and pushes its whole copy, so bags can flicker until every device updates. That is expected and it fixes itself. **Tell Petra to reopen the app once** so her phone updates.
2. **Deleting every bag reseeds the defaults, then sync deletes them again, and this repeats.** `getBagsData` seeds and **saves** whenever the list is empty. The default ids (`holiday`, …) are fixed, and their tombstones outrank a `updated:0` seed. So after a "delete all", each read reseeds, pushes, and the next merge filters them out again. This is not data loss. It is visible flicker plus pointless pushes. *Found by reading the code.* **Fix:** don't seed when `getTombs("bags")` already holds a default id.
3. **"Medicine records not restored" only knows about tombstones already on this device** (15034). If a restore runs before the first personal pull lands (a fresh phone, or offline), a deleted `track_med` record is counted as restored and then disappears on the next sync. That is the dishonest count v462 fixed, in its remaining corner. It is narrow, and a real "new phone" scenario. **Fix:** in the restore sheet, say "sync first" when `_personalFetchOk` is false, or wait for one pull.
4. **The Watchlist summary can be saved onto a renamed entry.** `watchFetchSummary` re-reads the store after the fetch (4581) but doesn't check that the title is still the one it asked about. If he retitles while the fetch is running, the old title's plot is saved under the new one. The "retitle clears summary" rule exists to prevent exactly that. This one is cosmetic and cheap to fix: compare `watchWikiQuery(cur[k])` with what was sent.
5. **`firebaseFetch` is a real improvement. One edge remains:** `getAuthToken` treats **any** JSON reply without `id_token` as `"rejected"` (15631). A 429 or 5xx from Google's token endpoint, which does return JSON, would show "log out and back in". That is the v468 bug class in a rarer form. **Fix:** count it as rejected only on HTTP 400. It is not urgent.

**Checked and fine.** The v462 `personalTs` revive rule. `track_med` deliberately left unconditional. The v458 `medDraftOpen` guard (`medTime` correctly excluded; the advisory is recomputed at Log). `nextFoodId` plus the tie-break. `storeSet` returning a boolean without touching its 180 callers. Nothing new hard-codes a field list.

**Alternative for item 2.** Seed defaults only on first-ever use (a `fl4_bags_seeded` flag) and never again.

**Confidence: high.** Items 2 and 4 were found by reading the code and have not been reproduced.

---

## 4. Privacy & security reviewer

**Assumptions.** Only the family can write to the Firebase household. The repo is public.

**Risks, most severe first.**
1. **One unescaped bag name sits next to one v478 escaped.** In `bagRemove`, v478 wrapped the name in `esc()` because `confirmDialog` renders with `innerHTML`. `bagReset` on the line beside it (22605) still does `"Unpack everything in "+bag.name+"?"` raw. Bag names arrive through household sync. This is the same "fix one site and the gap moves" class as v463. `renderBagView`'s `data-bagid='"+b.id+"'` (22639) is also unescaped, where v463 escaped note ids for the same reason. The risk is low (a family-only writer), but it's a one-line fix, and the policy says to fix all of them.
2. **Wikipedia is a new third-party touchpoint** (v467). Only the title of an entry he taps is sent, and nothing is fetched on load, sync or render. The extract is `esc()`'d, and `summarySrc` too. That is acceptable, and the code comment is explicit. Record it in `HEARTH-notes.md`'s third-party list if one exists, so the next review doesn't treat it as undisclosed.
3. **The logout and token handling is now correct.** A refresh that finishes after logout no longer puts credentials back. The v463 injection sites checked out, and `catEmojiSafe`/`catColorSafe` exist once each.

**Alternative.** Make `confirmDialog` take text and set it with `textContent`, so no caller can get this wrong again. That changes about 30 callers, some of which pass markup, so it's a separate decision.

**Confidence: high.**

---

## 5. Future maintainer

**Assumptions.** A plain-Sonnet session six months from now, working from the docs.

**Risks.**
1. **The v475 history is confusing.** The changelog's v476 entry says it "Carries v475 (PR #241)", but PR #241's Hips & Lower Back half was reverted in `1412675`. The only record of that is the commit message. A future session reading "v475: cues + a review note for Hips & Lower Back" in the git log will assume the note shipped. **Add one line to the v476 changelog entry:** "the Hips & Lower Back cues and note from PR #241 were reverted, not shipped".
2. **The changelog has two stale PR links.** v470–v473 still say `pull/PENDING`. This fits the piggyback-fix pattern.
3. **`physioSetsOf` is good design:** one reader in front of five sites, which follows the "no second exercise array" rule. The Basic "each leg" gap (Expert 2, item 4) would be a data flag on the table, not a new code path. That is the right shape if it gets built.
4. **The bag code is now the most complex Baby merge.** It has five helpers and two tombstone namespaces, and `73-baby-bags.js` pins it. Unlike `mergeBabyData`'s other keys, it has no CLAUDE.md data-model section. **Add a short "Baby bags" note** saying that bag and item fields are hand-listed in `normaliseBags` and must be added there.

**Confidence: high.**

---

## 6. Non-technical parent (Cathal/Petra proxy)

- **The Medicine tab is better at 2am.** Log is first, the hint under the chips says what the empty box is waiting for, and there's no confusing made-up 5ml. **But if it ever says "NOT logged", I need to be told to write the dose down,** not to go and delete photos on my phone.
- **The bags were broken and are now fixed.** Petra's phone must update too, or they'll act up for a day.
- **Settings is tidier,** but the one-line "Five on the bar, the rest under More" dropped the note that Lists, Recipes and Baby can't be hidden. That answered "why is there no toggle for Baby?".
- **Knee Basic/Full is clear.** "Level · remembered" is a bit cryptic. "Your choice is remembered" says it better.
- **The Recipes Tools sheet** means one extra tap for Select, which I used weekly. That's acceptable.
- **The Home training strip vanishing on quiet weeks** is fine. The Training card is still there.

**Confidence: medium.** This is a proxy for Cathal and Petra, not either of them.

---

## 7. Devil's Advocate

**Objection.** *The window's biggest safety item wasn't fixed. It was reverted and then went quiet.* Twenty-one versions shipped, including a knee programme nobody asked the physio about, a Wikipedia summary, a resize grip and three rounds of UI polish. Meanwhile the one flow Cathal actually does, several times a week, has shown no caution for 17 days, even though its own review says about two-thirds of it conflicts with his recorded history. A caution note was written, reviewed and merged, then removed for a branch-hygiene reason. That is process beating substance. I would also question the Knee Programme itself: it's generic content in a file that already holds six programmes, unreviewed against the one user's history, and it adds 12 more exercises that someone will eventually have to vet.

**Secondary objection.** v470–v473 were four versions of UI polish from one review, each with its own PR. For a single-user app, that is a lot of the review budget spent on low-value changes.

**What would change my mind.** Put the Hips & Lower Back note back this week, and have the Knee Programme's two stretches on the physio question list.

**Confidence: high** on the objection. **Low** that the Knee Programme should be removed: it is clearly labelled and harmless if unused.

---

## Consensus

**Verdict: SHIP (already shipped). Fix these things next, in this order.**

1. **Restore the Hips & Lower Back caution note, on its own.** Only the `YOGA_TRAIN_NOTES[1]` string from `629fea6`: no cues, and no pose, hold or order changes. It is small, it touches no dosing or sync, and it answers the Devil's Advocate. **Needs Cathal's yes first** (see question 1).
2. **Rewrite the medicine save-failure message** (22309): say it is *Hearth's* storage, tell him to write the dose down, and give the real way to free space. Keep it at least as large as the dose working. The mechanism is unchanged, but it is medicine wording, so it needs Cathal's approval.
3. **Escape `bag.name` in `bagReset` and the `b.id` in the bag tab** (22605, 22639). This is a one-version security tidy-up that could go in with item 2.
4. **Handle `pointercancel` on the resize grip** (11821).
5. **Low priority, batch when convenient:** don't reseed bags that were deliberately deleted; guard the Watchlist summary against a retitle during the fetch; treat only HTTP 400 as "rejected" in `getAuthToken`; restore the "Lists, Recipes and Baby can't be hidden" line; add a "Baby bags" data-model note to CLAUDE.md; add the v475-revert line to the changelog and fix the `PENDING` PR links.

**Confidence: high.** The main thing that could change it is whether the Hips & Lower Back revert was *meant* to drop the note, meaning Cathal wanted no note until the physio has seen it. In that case item 1 becomes "confirm and record that decision", not "rebuild".

**Dissent log.**
- **Devil's Advocate:** the Knee Programme should not have shipped before a physio saw it. It stays as dissent, and the verdict doesn't remove the programme. Answered by putting its two stretches on the physio question list, and by item 1.
- **Sync architect:** wants item 3 of their review (the fresh-device restore count) above item 4 of the consensus. It was overruled on likelihood, since restoring before first sync is rare. It is recorded here in case a new phone is due soon.

## Questions for Cathal before building

1. **When the Hips & Lower Back cues were reverted, did you also want the warning note removed?** Or should the note come back on its own? It says the flow hasn't been checked against your back and hernia history, and suggests raising it with your physio. No poses change.
2. **If a dose ever fails to save, would you like the message to say "Write this dose down now"?** It would also say how to make room in Hearth (remove plant or inventory photos). Is that the wording you want at 2am?
3. **Is the Knee Programme for you?** If so, two of its stretches (seated hamstring lean, standing quad stretch) are worth adding to your physio questions alongside Hips & Lower Back.
4. **In Knee "Basic", should the each-leg strength moves say "Each leg" on screen,** the way the stretches now say "Do both sides"?
5. **Is Petra's phone on v478 yet?** The bag fix only settles once every phone is updated.

## Cathal's answers (22/09/2026)

1. **Note back, and cues too — but as a full Full-Body-style re-tune.** The note shipped in v479. The re-tune needs its own design and is in the backlog.
2. **Yes** to "write it down" wording. Shipped in v479. It says *plant photos*, not "Plants or Home inventory": on checking, inventory photos are links and only plants store image bytes.
3. **The Knee Programme is Petra's**, and basic enough that it doesn't need physio approval. Expert 2's item 3 and the Devil's Advocate dissent are closed.
4. **Yes**, "Each leg" at Basic. Shipped in v479, Basic only.
5. Petra's phone updates tonight.
