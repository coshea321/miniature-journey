# Hearth — App audit, 30/08/2026 (LIVE NOTES / handoff doc)

**Purpose:** Cathal asked for an app audit with live notes he can hand to another
model if this session runs out of credits. This file IS the deliverable — it is
updated and pushed after every audit section. If you are a fresh session picking
this up: read `CLAUDE.md` + `HEARTH-notes.md` first, then continue from
§ "Status / what's left" below. Branch: `claude/app-audit-notes-nho96m`.
Base audited: `origin/main` at v443 (commit b0f17b3).

**Audit rules of engagement:**
- Read-only audit — no app changes on this branch, notes only. Findings go here,
  triaged; fixes are separate versions/PRs per the normal workflow.
- Do NOT re-report anything already triaged in `HEARTH-backlog.md` (five external
  reviews + the v351 bug review + the 19/07 sync audit are already absorbed there).
  Known-open items are listed below under "Already known" so they aren't re-found.
- Session model: started on Fable, switched to **Opus 5** part-way through
  (during section 3). Both are top-tier, so the sync/dosing areas stay in scope
  per the standing model-check rule; no section needs redoing because of it.

## Summary — read this first

**The app is in good shape.** Both mechanical gates are green at v443, and every
rule the docs call load-bearing is genuinely holding in the code: training
calories stay out of the TDEE, the dosing constants and the round-DOWN formula
are correct, the v426 no-`addAll` service worker fix is intact, and the three
multi-place field maps (trip bookings, plant scalars, inventory halves) have not
drifted a single field. Nothing here is an emergency and nothing needs a hotfix.

Six findings, none critical. In the order I'd fix them:

| | Severity | What | Fix size |
|---|---|---|---|
| **F6** | MED → **HIGH at Cloudflare step 7** | SW's background shell refresh has no redirect guard, so an expired Access session can cache the Cloudflare login page *as the app* | ~2 lines + a test |
| **F1** | MED | v443 gave saved meals tombstones for sync but not for backup restore — a restored saved meal silently vanishes on the next pull | ~3 lines + a test |
| **F3** | MED | Watchlist / list-item / recipe link fields are scheme-gated on save but rendered raw; the appliance+plant fields gate at render too | 3 call sites, needs one design call |
| **F4** | LOW | `secVisible` + `syncPrefs` are exported but never imported — section toggles don't survive the documented "delete site data" recovery | small, needs a design call |
| **F5** | LOW | The EXPORT COVERAGE comment never mentions `appliances` | 1 comment line, piggyback |
| **F2** | LOW | `fl4_notes_<lt>` is a dead store still riding sync/export/import with a lossy merge | cleanup, needs a decision |

**Two things worth Cathal's attention beyond the fixes:**
1. **F6 is timed.** It costs nothing today (nothing redirects on GitHub Pages)
   and becomes a real wedged-phone risk the moment step 7 makes the gate the
   family's way in. Worth landing *before* step 7, not after.
2. **F3 and F1 are the same shape of bug** — a rule that was applied correctly
   when it was written, and then not applied to the next thing added. That is
   worth knowing about the codebase generally: the docs are excellent at saying
   *why*, and the gap is that a new field or a new store doesn't automatically
   inherit the rule. F5 is the same drift in the comment that exists to prevent it.

**Suggested batching if these get built:** F1+F5 together (one small version,
both touch the food/export area). F6 on its own (service worker ⇒ Fable/Opus,
no split, wants its own test). F3 on its own after a design call about
`mailto:`/`tel:`. F2 and F4 only if Cathal wants them.

## Status / what's left
- [x] Baseline: `tests/checks.sh` — PASS (all green at v443)
- [x] Baseline: `node tests/run.js` — PASS (all 54 cases + 4 sw-cases, exit 0)
- [x] Section 1: Sync/merge layer — DONE, one finding (F1) + notes below
- [x] Section 2: Food journal / TDEE / autosuggest / saved-meal→recipe — DONE, clean (notes below)
- [x] Section 3: Security pass — DONE, one finding (F3) + notes below
- [x] Section 4: Service worker — DONE, one finding (F6) + notes below
- [x] Section 5: Data-model consistency — DONE, two findings (F4, F5) + notes below
- [x] Section 6: Dosing safety — DONE, clean (notes below)
- [x] Final: triage findings by severity, write summary at top

**All planned sections are done.** If you are a fresh session continuing this:
the audit as scoped is COMPLETE — don't redo it. What is genuinely left, in
descending value:
1. **Build the fixes** (F6 first). Each needs its own version + PR per the
   one-PR-per-version rule; none of them are audit work.
2. **Areas this audit deliberately did NOT cover** (a single session can't read
   21k lines properly): the Lists/Grocery rendering and history code, Train
   session/timer logic, the recipe parser and tidy passes, Trips UI, Baby growth
   centile maths, weather/sports, and a full app-wide XSS sweep. The older
   sections have had five external reviews plus council passes — see the backlog
   — so the newest code was the right place to spend this session.
3. Nothing in this file needs re-verifying — every claim carries a `file:line`
   anchor at v443. Re-grep before editing; line numbers rot with every version.

## Baseline (30/08/2026)
- `tests/checks.sh`: **PASS** — all mechanical checks green, no pending piggyback
  fix notes, size 1,249,221 bytes (matches base), version v443 · 28/08/2026
  consistent across index.html/sw.js.
- `node tests/run.js`: **PASS** — all 54 `tests/cases/` files plus the 4
  `tests/sw-cases/` files, exit 0, zero page errors. Re-ran `tests/checks.sh`
  at the end of the audit: still PASS (no app files were touched).

## Already known — do NOT re-report as new findings
- `applyHousehold`/`applyPersonal` `flushSyncRenders` calls omit `watchlist`
  (backlog, found at v424 — stale-render only, self-heals on section re-entry).
- Cloudflare Access exclusion never positively verified; GitHub Pages stays up
  until the one clean outside test passes (backlog).
- Undo/optimistic-delete design reviewed, NOT approved (backlog — do not build).
- Merge tie-break asymmetry (remote-wins in `mergeListItems`, local-wins in
  notes/trips) — deliberate, on record, do not harmonise.
- Recipe deletions don't propagate (accepted cost of the v242 newest-wins model).

## Section notes

### Section 1 — sync/merge layer (DONE 30/08)
Read in full: `pushPersonal` (14204), `applyPersonal` (14294–14554),
`pushHousehold` (14588), `applyHousehold` head + tail (18967, flush at 19144),
`importBackupData` (13352–13521), `setCalGoal` (12272), `saveProfile` (18419).
- **v441 cal-goal/profile stamps: correct at every site.** All writes stamped
  (`setCalGoal`, `saveProfile`, restore carries the file's stamp, merge adopts
  the incoming stamp); merge is strictly-newer-wins with the no-stamp=0 rule and
  the empty-device adoption arm, exactly as `HEARTH-notes.md` describes. The
  `if (d.cal_goal)` truthy gate is safe — the manual editor refuses ≤0 and
  `tdeeGoal` floors at 1500, so a legitimate goal is never falsy.
- **v443 saved-meal tombstones: sync side correct** (push carries
  `saved_meals_deleted`, apply merges+purges tombs and filters the union; a
  meal's id is Date.now() so a tomb can't block a new meal). **Backup-restore
  side missed — finding F1 below.**
- **Both `flushSyncRenders` calls (14552, 19144) omit `watchlist`** — this is
  the already-known backlog item, re-confirmed at v443, still unfixed. Piggyback
  candidate. (applyPersonal's also omits `dots`, applyHousehold's omits `train` —
  both deliberate per the comments: dots are partner-facing/household, Train is
  personal-channel-fed.)
- `fl4_notes_<lt>` (per-list notes arrays) are **wholesale-replaced by incoming**
  on both channels (14351, 19004) — but see F2: the store appears to be legacy
  with no UI left, so nothing live can be lost. Worth confirming + tidying, not
  urgent.
- Tie-break asymmetry, recipe-deletes-don't-propagate, food_notes local-wins:
  all as documented, deliberate, on record — not findings.

### Section 2 — food journal / TDEE (v434–v443) (DONE 30/08) — no findings
The newest and least-reviewed code, checked against the rules in
`HEARTH-notes.md` § TDEE and § Food journal autosuggest.
- **Training calories are nowhere in the TDEE or goal sums** ✓ — the one rule
  that must not break. `measuredTDEE` (18471) uses mean intake and the weight
  slope only; `tdeeGoal` (18540) reads `blendedTDEE` and `rate`. Nothing reads
  workout kcal. Case 49's tripwire is genuinely guarding live behaviour.
- Coverage floor, least-squares slope, plausibility band, blend weights all
  match the documented constants (18385–18389) ✓. Missing days are excluded
  from the mean rather than counted as zero (18490–18506) ✓ — the rule that
  makes the estimate honest.
- `tdeeGoal`'s two guards are both present and ordered correctly: deficit capped
  at 25% first, then floored at 1500, and `Math.min(TDEE_FLOOR_KCAL, t.tdee)`
  correctly refuses to propose a goal *above* TDEE for a very low TDEE ✓.
- **The "a figure only travels if a human typed it" rule holds in all three
  places** ✓ — `pickFoodSuggest` (12521) copies `it.cal` only into an empty
  box, and `foodSuggestMatches` sources it from non-`calAuto` entries only.
- v443 saved-meal delete: the tombstone is written on the one and only delete
  path (12907–12917) ✓ — the sync half of v443 is right; only the backup half
  is missing (F1).
- `foodMealIndex` normalisation is called from `getFoodLog` **only** (12245,
  12256) ✓ — the v435 rule about not spreading it across renderers holds.
- Home calories card (16834): reads `fl4_cal_goal` with a `|| 2000` fallback, so
  the divide at 16845 can't produce NaN ✓. Read-only, so the `setCalGoal` rule
  doesn't apply.

### Section 3 — security pass (DONE 30/08)
Swept every `<a ` construction site (12 hits) and the URL gates; spot-checked
escaping in the newest renderers (food autosuggest 12496, watchlist detail
4460–4499, appliance detail 5383, recipe detail 9937, booking rows 6089).
- **Gated correctly at save AND render:** appliance `manual`/`photos`
  (`applianceLinkUrl` 4943, http(s)-only with the host:port carve-out), plant
  `photoLink` (`plantPhotoLinkUrl` 3307 — save 4171, import 3431, render 4004).
  These two are the v428/v432 standard.
- **Gated at save only, rendered raw from the record:** watchlist `w.link`
  (save gate 4685-ish http(s)/mailto/tel; rendered ungated at 4486), list
  `item.link` (save gate 15880; rendered ungated at 11091), recipe `r.url`
  (save runs `normalizeRecipeUrl` at 10323, which *prefixes* rather than
  refuses; rendered ungated at 9937). → **F3**.
- `calLink` (11046): item name is `encodeURIComponent`d ✓, but `dueDate`/
  `dueTime` are concatenated into a single-quoted href with no esc — a
  malformed synced record could break out of the attribute. Folded into F3.
- Escaping spot-checks all pass (`esc()` used consistently in the sampled
  renderers; `toast()` renders via textContent; watch info links are
  encodeURIComponent-built search URLs, never stored). Full 21k-line XSS sweep
  NOT done — out of scope for one session; the prior external reviews +
  council passes covered the older sections.
- Import parsers: `inventoryRecordFrom` gates manual/photos (5050) ✓,
  plant import gates photoLink (3431) ✓, trip import's `location` is
  encodeURIComponent'd at render ✓. `importBackupData` is the one ungated
  entry — which is exactly why F3's render-time gate matters.

### Section 4 — service worker (DONE 30/08)
Read `sw.js` in full (123 lines). **The three hard-won rules are all intact:**
- v426 best-effort install — per-asset `c.add(...).catch(() => {})`, no `addAll`
  anywhere ✓ (this is the "stuck on an old version" root cause; the comment at
  21–28 correctly forbids reverting it).
- v389 `cache: 'reload'` on each install fetch ✓.
- v422 `/cdn-cgi/` passthrough present (77) and pinned by
  `tests/sw-cases/04-sw-cdn-cgi-passthrough.js` ✓.
- Activate deletes every non-current cache ✓ (the "SW cache grows forever"
  claim the 02/07 triage dismissed remains correctly dismissed).
- **One real gap: the shell's background refresh has no redirect guard — F6.**
  This one matters *now*, because Cloudflare step 7 is live planned work.
- Minor (not worth a finding on its own, fold into any SW version): the
  `caches.open(CACHE).then(c => c.put(...))` calls at 94 and 117 are not held
  by `e.waitUntil`, so the browser may terminate the worker before the write
  lands. Self-heals on the next open; costs at most one extra open.

### Section 5 — data-model consistency (DONE 30/08)
Mechanically diffed every hand-listed field map against its documented list.
**The three multi-place field maps are all consistent at v443 — no drift:**
- **Trip bookings (3 places):** export map (6180), `importTripFromJSON`
  (5576–5586), `mergeBookingsIntoTrip` (5603) all carry the same 11 fields
  (`type,title,start,end,location,ref,notes,connectsFrom,boarding,gate,seats`),
  matching CLAUDE.md exactly. `id`/`updated` omitted as documented. ✓
- **Plants (2 hand-listed scalars):** `plantExportObj` (3309) and
  `plantApplyImport` (3417) both carry all 10 (`name,latin,room,emoji,
  waterDays,feedDays,waterOff,feedPauseFrom,feedPauseTo,photoLink`); sections
  flow through `PLANT_SECTIONS` in both. `photo`/`waterLog`/`feedLog` correctly
  untouched by import. ✓
- **Inventory (the file's two halves):** `inventoryExportObj` (4993) and
  `inventoryRecordFrom` (5036) both carry all 14 fields; the `value: ""`-not-
  missing-key rule is correctly implemented at 5059. ✓
- **`buildTestSeed` vs `buildExportPayload`:** every top-level key in the seed
  (22 of them) exists in the payload — no silently-dropped seed section. ✓

### Section 6 — dosing safety (DONE 30/08) — no findings
`tests/checks.sh` pins the literals mechanically and passes; I verified the
logic behind the pins rather than re-checking the strings.
- Constants correct at the chip definitions (19873–19874): Calpol 15mg/kg,
  120mg/5ml, cap 10, no floor; Nurofen 10mg/kg, 100mg/5ml, **floor 5kg**,
  cap 10 ✓.
- Formula `Math.floor((w*mgkg*5/mg5)*4)/4` (19954) — **rounds DOWN** to the
  nearest 0.25ml as required ✓. Spot-checked: 10kg on Calpol → 6.25ml, on
  Nurofen → 5ml, both correct against the product strengths.
- Under-floor branch blanks the dose and says to check the GP/pharmacist rather
  than proposing a reduced one ✓. Cap flagged as "(capped)" in the working ✓.
- Working shown + "estimate only, check the leaflet" + field stays editable ✓.
- v291 advisories (19854–19864): 4h/max 4 and 6h/max 3 correct; advisory only,
  never disables logging; every line says "Last logged" ✓.
- One observation, **believed deliberate, not filed as a finding**: the
  "Based only on logged doses — check the leaflet" tail is appended only when
  `warn` is true, so the neutral line ends at `gapText`. Reads as an
  anti-banner-blindness choice and the calculator itself always carries the
  wording. Worth one sentence of confirmation from Cathal, no more.

## Findings
*(numbered F1, F2… as found; severity: HIGH = data loss/safety/security,
MED = real bug, user-visible, LOW = polish/hygiene. Each carries file:line
anchors at v443 — re-grep before editing, line numbers rot.)*

### F1 (MED) — v443 saved-meal tombstones: backup restore silently re-deletes a restored saved meal
- **Where:** `importBackupData`, the `data.saved_meals` line (index.html:13409 at v443).
- **What:** v443 added deletion tombstones for saved meals to the sync merge
  (`fl4_tomb_saved_meals`, filtered in `applyPersonal` ~14419–14426) but did not
  update the backup-restore path. Every other tombstoned collection in
  `importBackupData` does one of two deliberate things: **resurrect + clear the
  tombstone + stamp `updated=now`** (list items 13360–13364, recipebook 13416–13418,
  plants, watchlist, appliances, trips) or **filter the incoming through local
  tombstones so the delete sticks** (hist v323, medicine v329, growth/milestones
  v371). The saved-meals line does neither — plain id-union concat.
- **Effect:** restore a backup containing a saved meal deleted in the last 90
  days → it reappears in the UI, then silently vanishes on the next personal-sync
  pull (the tombstone is still live and `applyPersonal` filters it out). Worst
  case is a confused user, not data loss beyond what was already deleted — but it
  makes "restore my deleted saved meal from backup" quietly impossible for a
  logged-in device, while working (misleadingly) for an offline one.
- **Fix shape:** match the documented additive-restore contract (comment at
  ~13343): for each restored meal whose id sits in `fl4_tomb_saved_meals`, delete
  the tombstone entry (same 3-line pattern as recipebook/plants). Saved meals
  have no `updated` field, so no stamping needed. One-line-ish; good piggyback
  candidate for the next version touching the food-journal area + a small
  extension to `tests/cases/53-saved-meal-delete-sync.js` or `07-backup-roundtrip`.

### F2 (LOW) — `fl4_notes_<lt>` per-list notes: a dead store still riding sync, export and import
- **Where:** `getNotes`/`saveNotes` (16109–16118), sync payloads (14215/14599
  send, 14351/19004 wholesale-replace on receive), export (13181), import (13495),
  wipe (13725).
- **What:** the per-list notes subsystem's UI was removed in v335 (orphaned
  pre-v318 `noteEditorOverlay` etc.), but the four `fl4_notes_grocery/todo/
  travel/personal` arrays still ride every push/pull/backup, and the receive
  side is a wholesale last-write-wins overwrite (no merge, no tombstones).
  Grep at v443 finds **no UI reader or writer left** — only sync/export/import.
- **Effect:** none user-visible today (nothing writes them, so the naive
  overwrite has nothing to lose). Cost is payload bytes + a trap: if a future
  feature ever reuses the store, it inherits a lossy merge silently.
- **Fix shape:** decision for Cathal, not urgent — either drop the fields from
  push/apply/export/import in one version, or leave with a warning comment at
  `saveNotes`. Verify on a real device first that the arrays are actually empty
  before dropping (they may hold pre-v335 data worth exporting once).

### F3 (MED) — three link fields are gated on save but rendered raw: the v428/v432 rule isn't applied app-wide
- **Where:** watchlist link (save gate ~4685–4686, raw render 4486), list item
  link (save gate 15880–15881, raw render 11091), recipe source URL (save
  `normalizeRecipeUrl` 10323, raw render 9937). Plus `calLink` (11046–11069),
  which builds an href from unescaped `dueDate`/`dueTime`.
- **What:** `HEARTH-notes.md` states the rule plainly for appliances and plants —
  *"a record can arrive from sync or a restored backup written by anything"*, so
  the gate runs **on save, on import AND at render time**. Those two fields obey
  it. The three older link fields do not: their only check is in the editor's
  save handler, and the render path emits `esc(value)` straight into an `href`.
  `esc()` escapes the quotes so the attribute can't be broken out of, but it does
  **nothing** about the scheme — `javascript:alert(1)` survives `esc()` intact.
- **Effect:** no live exploit path today, and this is deliberately NOT a
  re-report of the 5th-review item the backlog already dismissed (that one was
  about `normalizeRecipeUrl`'s own behaviour). The gap is that a record reaching
  the store **without passing an editor** is rendered ungated. Three such paths
  exist: `importBackupData` (no link gating at all), a sync payload from a device
  running any build, and a hand-edited backup JSON. The realistic risk is low —
  this is a two-person family app on a gated origin, and the attacker would need
  write access to Firebase or the file the user restores. But the fix is the same
  one already shipped twice, and the inconsistency is itself the hazard: the next
  person adding a link field will copy whichever neighbour they land on.
- **Fix shape:** wrap the three render sites in the existing `applianceLinkUrl`
  (it already allows exactly http(s); the watchlist/item fields additionally
  permit `mailto:`/`tel:` on save, so either widen the shared gate deliberately
  or accept narrowing those two to http(s) — **needs a design call, don't guess**).
  Do NOT write a second gate function — the v428 comment at 4936 says why in
  as many words. `calLink` is separate and smaller: `esc()` the two date parts.
- **Model note:** this touches a security gate, so per CLAUDE.md it wants a
  Fable/Opus session, not a plain-Sonnet build.

### F4 (LOW) — `secVisible` and `syncPrefs` are exported and never restored
- **Where:** `buildExportPayload` writes both (13175–13176); `importBackupData`
  (13352–13521) reads neither. They are also **not** in either sync payload
  (`pushPersonal` 14212–14251, `pushHousehold` 14596–14635 — checked, absent).
- **What:** these two are the only exported keys with no import path, so they
  are write-only: the backup file faithfully carries which sections you turned
  on (`fl4_secVisible` — Plants, Watch, Appliances, Sports, Family Log are all
  opt-in) and which lists you sync (`fl4_syncPrefs`), and a restore ignores both.
- **Effect:** exactly the documented recovery path is where it bites. The
  service-worker recovery ladder in `HEARTH-notes.md` ends at "delete the site's
  data", which clears localStorage — and the same happens on the Cloudflare
  origin move (step 7 explicitly warns of fresh `localStorage` per device).
  After either, restoring the backup brings the data back but **not** the
  section toggles or sync prefs, so opt-in sections silently vanish from the nav
  and the user has to remember what they had enabled. `personal` defaults to
  NOT synced (13820), so a restore also quietly resets that choice.
- **Fix shape:** small, but a **design call, not a mechanical fix** — restoring
  `syncPrefs` from a file changes what leaves the device, which is not obviously
  right to do silently. Options: restore `secVisible` only (the safe half);
  restore both; or leave as-is and document it. Ask Cathal. If built, extend
  `tests/cases/07-backup-roundtrip.js`.

### F5 (LOW, piggyback) — the EXPORT COVERAGE comment omits `appliances`
- **Where:** the checklist comment above `exportData` (13130–13148).
- **What:** the comment is the stated mechanism for catching export drift ("check
  on each release that new data types are included") and lists plants and
  watchlist by name, but **never mentions `appliances`** — added to the payload
  in v424 and widened in v428 without the comment being updated. The code is
  correct (13172); only the checklist is stale.
- **Effect:** none at runtime. It weakens the one guardrail against the next
  section being forgotten, and `HEARTH-notes.md` § Data & export *does* list
  appliances, so the two disagree.
- **Fix shape:** one comment line, in the next version that touches
  `index.html`. Genuine piggyback-fix candidate — add it to
  `HEARTH-backlog.md` § Piggyback fixes (both current entries there are struck
  through as fixed in v442, so the list is empty and this would be its only
  live item).

### F6 (MED now, HIGH at Cloudflare step 7) — the shell's background refresh can cache the Access login page AS the app
- **Where:** `sw.js` 90–107, the v373 cache-first-with-background-refresh shell
  branch. Specifically the `response.status === 200` gate at 92.
- **What:** v422 fixed the *callback* leg by letting `/cdn-cgi/` paths bypass the
  worker. But the leg that runs first is a plain navigation to `/`, which is the
  **shell** branch, not a `/cdn-cgi/` path. Once the Access session expires,
  Cloudflare answers that navigation with a redirect to its login page. The
  background `fetch(e.request)` follows the redirect, and what comes back is a
  **200** — status 200 is the login page, not the app. The only gate before
  `c.put(e.request, clone)` is that status check, so the login page HTML can be
  written into the versioned cache **under the app shell's own key**.
- **Effect if it lands:** the next open is served cache-first and paints
  Cloudflare's login page (or a blank/broken page) *as the app*, from cache, with
  no network involved — so it persists offline and survives reloads. That is the
  same shape as the v426 "wedged device" incident, and the recovery is the same
  expensive ladder (`chrome://serviceworker-internals` → Unregister, or delete
  site data and re-enter the Firebase URL, login and household code). On a phone
  that is the worst outcome in the whole SW.
- **Confidence — read this before fixing.** The hazard is real and the code path
  is plainly unguarded, but I could **not** verify the exact browser behaviour
  here: whether the followed cross-origin redirect yields a response
  `Cache.put` accepts, and whether `respondWith` later refuses it for a
  navigation (`response.redirected === true` is rejected for navigations in
  some browsers, which would turn this into a hard error instead of a silent
  bad-cache). This sandbox has no outbound access to the Pages host, and the
  live gate has never been exercised from a device whose session expired — so
  this is **a hazard to close defensively, not a confirmed reproduction.**
  Do not write it up as a diagnosed incident.
- **Fix shape (cheap, defensive, no behaviour change when the gate is absent):**
  before caching in the shell branch, require the response to be same-origin and
  un-redirected — roughly `if (response && response.status === 200 &&
  !response.redirected && new URL(response.url).origin === self.location.origin)`.
  Same guard is worth having on the generic asset branch at 115. It costs nothing
  today (on GitHub Pages nothing redirects) and it is exactly the case step 7
  will start producing. **Touches the service worker ⇒ Fable/Opus session, no
  design-here-build-there split** (CLAUDE.md is explicit).
- **Test:** a 5th `tests/sw-cases/` file in the shape of `04-sw-cdn-cgi-
  passthrough.js` — serve a path that 302s to a different origin, confirm the
  cached shell is still the app afterwards. The harness already serves over a
  real HTTP origin, so this is expressible.
- **Also worth telling Cathal regardless of the fix:** if a family member ever
  reports the app opening to a Cloudflare page or a blank screen after step 7,
  this is the first thing to suspect, and unregistering the worker
  (`chrome://serviceworker-internals`) is the cheap recovery that keeps
  `localStorage` — i.e. no re-entering the Firebase URL or household code.

---

## Priority plan & model suitability (added 30/08/2026, on Opus 5)

Cathal asked: prioritise the audit findings alongside the backlog's other bug
fixes, and say which of them plain Sonnet can build.

### First: what the backlog actually still holds

Re-derived from `HEARTH-backlog.md` rather than assumed. **Almost nothing in it
is an open bug.** Everything under "Pending / next steps" is one of:

- **shipped** (struck through — the great majority),
- **rejected or closed on record** (nav consolidation stages 2–4, purchase
  quantities, eating exercise calories back, warranty badges, dark mode…),
- **a feature needing its own design confirm** (TDEE follow-ups ①–⑤, watchlist
  ①②③④⑥, plants ②④, recipe prep ⓪①②, inventory ②③, global-search item-level
  deep links) — these are *not* bugs and shouldn't compete with fixes,
- **blocked on Cathal, not on code** (Undo/optimistic delete: reviewed, NOT
  approved, 3 decisions still open; Cloudflare step 7: dashboard + home screens;
  categorising imported recipes),
- **explicitly accepted** (the minor recipe-parser gaps: "rare; acceptable").

That leaves exactly **one** live bug in the backlog:

- **`flushSyncRenders` never passes `watchlist`** (found at v424, still unfixed —
  re-confirmed at v443 in section 1 above; *both* calls omit it, 14552 and 19144).
  Two lines. Cosmetic: a partner's watchlist edit doesn't repaint the open
  section until you leave and come back.

And the § Piggyback fixes list is **empty** — both entries were fixed in v442.

**So the six audit findings are effectively the whole live bug queue.** That is
the main scheduling fact: these aren't competing with a backlog of other fixes.

### The combined queue

| # | Version | Item | Why here | Model |
|---|---|---|---|---|
| 1 | v444 | **F6** SW redirect guard (+ 5th sw-case) | Only item where *waiting* makes it worse | **Opus/Fable** — service worker |
| 2 | v445 | **F1** saved-meal restore + **F5** comment + **watchlist flush** | One small correctness bundle, all in `index.html` | **Opus/Fable** (F1 is sync-adjacent) |
| 3 | v446 | **F3** render-time link gates | Needs one design answer first | Opus to decide; **Sonnet can build** |
| 4 | piggyback | **F4** `secVisible` half only | Rides any later version | **Sonnet** |
| 5 | parked | **F4** `syncPrefs` half, **F2** dead notes store | Low value, need decisions | Opus if ever |

**Why F6 first, and when to flip it.** F6 is the only finding whose cost is
asymmetric in time: today it is a no-op (nothing redirects on GitHub Pages), and
after step 7 a bad cache wedges a phone in a state that needs
`chrome://serviceworker-internals` to clear — hard to talk someone through
remotely. F1 is a *more real* bug today but a rare one (it only bites on a backup
restore of a meal deleted in the last 90 days). **If step 7 has slipped and isn't
happening for a while, do F1 first** — it is the one with an actual user-visible
symptom.

### Sonnet verdicts, against CLAUDE.md's own rules

The governing rule: sync/merge, dosing, trip import/export, the service worker,
or any fuzzy design ⇒ Fable/Opus, and **build in the same session** (no
design-here-build-there split for those). Separately, a build describable in
under ~200 words shouldn't be split either — writing the spec costs more than
doing the work. **Most of these findings are under 200 words**, so the practical
answer is usually "whoever is in the session should just build it", and the only
real question is whether that session may be Sonnet.

- **F6 — NOT Sonnet.** Service worker, named explicitly. One Opus/Fable session,
  design and build together, with the new `tests/sw-cases/` file. Also the one
  finding I could not reproduce here (no outbound access to the Pages host), so
  it wants a session that will reason about it rather than pattern-match a fix.
- **F1 — decision on Opus; the typing is trivial either way.** The code is ~3
  lines. But there is a genuine semantic question first, and it is *not*
  cosmetic: **should a restored saved meal resurrect, or should the delete
  stick?** `importBackupData` already does both, deliberately — list items,
  recipes, plants, watchlist, appliances and trips **resurrect** (tombstone
  cleared, `updated` stamped); hist (v323), medicine (v329) and growth/milestones
  (v371) **stay deleted**. Saved meals need to be assigned to one camp. My read:
  resurrect, matching its nearest neighbours and the "additive only" contract at
  the top of the function — a saved meal is a convenience shortcut, not safety
  data like a logged dose. **Once that is written down, Sonnet can build it**
  (copy the recipebook pattern verbatim). Don't hand it over before.
- **F3 — Sonnet-buildable after one design answer.** The change is wrapping three
  render sites in the existing `applianceLinkUrl`; no new gate function (the
  comment at `index.html:4936` forbids a second copy, and that is the whole
  point of the finding). The open question: watchlist and list-item links accept
  `mailto:` and `tel:` on save, `applianceLinkUrl` allows http(s) only — so
  either widen the shared gate to those two schemes, or accept narrowing those
  fields. **This must be decided, not guessed.** If it gets split across
  sessions, the design PR has to be **merged** before the build session starts
  (the v415 lesson).
- **F5 — any model, no version of its own.** One comment line. Add it to
  § Piggyback fixes so `tests/checks.sh` starts printing the reminder.
- **watchlist flush — Sonnet.** Two lines, and `HEARTH-backlog.md` already
  states the exact fix (`watchlist:_rDirty.watchlist` in both calls). It sits
  inside the sync functions but changes only which view repaints, not what
  merges — no merge semantics involved.
- **F4 — split it.** `secVisible` is UI state: restoring it is obviously safe and
  **Sonnet-safe**. `syncPrefs` decides what leaves the device, so silently
  restoring it from a file is a real decision — Opus, and only if Cathal wants it.
- **F2 — park.** Needs a real-device check that the arrays are empty before
  anything is dropped, plus a decision. Touches both sync payloads. Low value.

### The three questions blocking the queue

1. **F1:** restored saved meal — resurrect (my recommendation) or stay deleted?
2. **F3:** keep `mailto:`/`tel:` on watchlist + list-item links (widen the shared
   gate), or narrow those fields to http(s) like everything else?
3. **F4:** should a backup restore bring back your section toggles? And
   separately, your sync preferences?

Q1 and Q2 are each one sentence of answer and then the work is small. Q3 can wait.
