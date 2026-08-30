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
- [ ] Section 1: Sync/merge layer (push/apply personal + household, tombstones, stamps) — focus on v441–v443 additions (cal-goal/profile stamps, saved-meal tombstones)
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

## Findings
*(numbered F1, F2… as found; severity: HIGH = data loss/safety/security,
MED = real bug, user-visible, LOW = polish/hygiene. Each carries file:line
anchors at v443 — re-grep before editing, line numbers rot.)*

*(none yet)*
