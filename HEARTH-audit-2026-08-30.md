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

## Status / what's left
- [x] Baseline: `tests/checks.sh` — PASS (all green at v443)
- [x] Baseline: `node tests/run.js` — PASS (all 54 cases + 4 sw-cases, exit 0)
- [x] Section 1: Sync/merge layer — DONE, one finding (F1) + notes below
- [ ] Section 2: Food journal / TDEE / autosuggest / saved-meal→recipe (v434–v443 — newest code, least reviewed)
- [x] Section 3: Security pass — DONE, one finding (F3) + notes below
- [x] Section 4: Service worker — DONE, one finding (F6) + notes below
- [x] Section 5: Data-model consistency — DONE, two findings (F4, F5) + notes below
- [ ] Section 6: Dosing safety pins (mostly covered by checks.sh — spot-verify wording sites)
- [ ] Final: triage findings by severity, write summary at top

## Baseline (30/08/2026)
- `tests/checks.sh`: **PASS** — all mechanical checks green, no pending piggyback
  fix notes, size 1,249,221 bytes (matches base), version v443 · 28/08/2026
  consistent across index.html/sw.js.
- `node tests/run.js`: (in progress — 54 case files)

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
