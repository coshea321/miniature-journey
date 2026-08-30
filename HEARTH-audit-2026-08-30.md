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
- Session model: Fable (top-tier), so the sync/dosing areas may be audited here
  per the standing model-check rule.

## Status / what's left
- [x] Baseline: `tests/checks.sh` — PASS (all green at v443)
- [x] Baseline: `node tests/run.js` — PASS (all 54 cases + 4 sw-cases, exit 0)
- [x] Section 1: Sync/merge layer — DONE, one finding (F1) + notes below
- [ ] Section 2: Food journal / TDEE / autosuggest / saved-meal→recipe (v434–v443 — newest code, least reviewed)
- [ ] Section 3: Security pass — esc()/innerHTML sites, URL gates (`applianceLinkUrl` coverage), import parsers (trip/plant/inventory/backup JSON)
- [ ] Section 4: Service worker (v426 best-effort install, v373 cache-first shell, /cdn-cgi passthrough)
- [ ] Section 5: Data-model consistency — export/import field maps vs documented field lists (trip, plant, inventory); `buildTestSeed` coverage; `buildExportPayload` coverage
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
