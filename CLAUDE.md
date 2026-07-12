# Hearth — Claude Code project guide

Hearth is a family-hub PWA: one large single-file vanilla **HTML/JS** app, no build step, no framework.
Cathal is a **non-coder**; treat him as the reviewer, not a co-developer. Lead with the answer, be concise, flag honest trade-offs over overselling.

## Repo layout
- `index.html` — the entire app (~11,200 lines: HTML + one big inline `<script>` + CSS). This is where almost all work happens.
- `sw.js` — service worker. Single source of truth is its `VERSION` constant (cache name + the version label shown in-app both derive from it).
- `HEARTH-notes.md` — **read this at the start of any non-trivial task.** Full architecture, sync model, the recent changelog, the open backlog, and a long list of hard-won "do/don't" lessons. Don't duplicate it here; consult it.
- `HEARTH-archive.md` — detailed changelog for versions older than the newest ~10. Read it **only** when an old version is referenced.
- `.claude/` — the workflow tooling: `agents/hearth-preflight.md` + `agents/hearth-verifier.md` (both Haiku; subagents below), `agents/hearth-scout.md` (Sonnet, read-only code-location sweeps), `commands/release.md` (`/release`), `skills/hearth-council/` (council review).
- Hosted on **GitHub Pages**; `main` is live. No backend except Firebase Realtime DB (household sync via room codes, REST/EventSource — no SDK).

## Per-change workflow (every change)
1. **Run the `hearth-preflight` subagent before any edits** — every time, without exception. It confirms the base is the latest `origin/main` (one PR per version), pushes the `backup-vNNN` branch, reports version state, names backup branches outside the keep-newest-10 window for Cathal to delete, and greps for already-built features when given keywords. Resolve any flags before editing. Never touch `main` directly.
2. **Edit incrementally** — never rewrite the whole file. Make targeted edits. **Never read `index.html` in full** (660KB ≈ most of a context window) — grep for the target function/text and read only the relevant line ranges. For broad "where is X / does X exist / who calls Y" sweeps, delegate to the **`hearth-scout` subagent** (Sonnet, read-only) and work from its line anchors — but always read the exact lines you're about to edit yourself; the scout finds code, it doesn't vouch for understanding it.
3. **Run the `hearth-verifier` subagent after edits, before committing** (edits-landed greps, `node --check` on the extracted script block, file integrity, version-bump consistency). A DO NOT COMMIT verdict means stop and fix. If the subagents are unavailable, both agent files contain the full manual checklists — run them by hand.
4. **Bump the version in BOTH `index.html` and `sw.js`.** Format: `vNNN · DD/MM/YYYY` (date only, no time). For `sw.js` this is the one-line `VERSION` edit.
5. **Commit, push, then immediately open a GitHub PR** — always, without waiting to be asked. The PR is how Cathal reviews the diff and merges to `main`. Describe changes clearly in the PR body, and **start the body with a "👉 Try this version" test link** (since v324): `https://raw.githack.com/coshea321/miniature-journey/<branch>/index.html` — it serves the branch with the in-app test mode active (orange banner, Firebase sync/login hard-blocked, no service worker, per-site sandboxed storage), so Cathal can try the change on his phone before merging. Never push and say "create a PR when you're ready" — create it now. **One PR per version** (policy set 02/07/2026): Cathal merges within minutes, so never stack a second version onto an existing PR's branch — fetch/rebase onto the latest `main` before starting each new version, and open a fresh PR for it. The `/release` command automates the bump→verify→commit→push→PR tail; a GitHub Action re-runs the mechanical checks on every PR as a backstop.

## Design & safety rules (these override a prompt that conflicts)
- **Model check before risky/fuzzy work (Cathal's standing request, 05/07/2026).** Before building anything that touches sync/merge logic, medicine dosing, trip import/export, or the service worker — or any feature whose design is still fuzzy — say which model this session is running on. If it isn't a top-tier model (Fable/Opus), prompt Cathal to restart the session on one (or use plan mode on the stronger model) and wait for his answer before building. Don't nag for small, well-defined changes — plain Sonnet is the right default for those. The rule runs both ways: if a session on Fable/Opus turns out to be a small, well-defined change, say so in the wrap-up ("this would have been fine on Sonnet") so Cathal can calibrate future session choices — finish the task either way, never stop work over it. **Design-here, build-on-Sonnet handoff (12/07/2026):** when a Fable/Opus design chat confirms a feature that won't be built in the same session, record every confirmed decision in the feature's backlog entry in `HEARTH-notes.md` — specific enough that a plain-Sonnet session can build it from the notes alone. That session-level split is the preferred model economy; do NOT delegate editing to a cheaper-model subagent inside a session instead (subagents stay read-only/checking: scout, preflight, verifier — the editing session must always read the lines it edits itself).
- **Confirm feature design before building anything non-trivial.** Cathal has corrected mid-build many times; align upfront.
- **Medicine dosing is safety-sensitive.** Weight-based doses use confirmed product strengths only (Calpol Infant 120mg/5ml @15mg/kg; Nurofen for Children 100mg/5ml @10mg/kg), round DOWN, cap at 10ml, block Nurofen under 5kg, always show the working + "check the leaflet", keep editable. Never silently change strengths or formulas. The v291 **interval advisories** (paracetamol ≥4h gap / max 4 per 24h; ibuprofen ≥6h / max 3 per 24h) are advisory only: never disable logging, never drop the "logged" / "check the leaflet" wording, never silently change the intervals.
- **Never claim a file/feature is missing without grepping first.** Check whether something already exists before building it (features have been rebuilt by accident here).
- This is a **personal/family app**: no Play Store, no push notifications, no third-party analytics. Don't propose them.

## Critical code quirks (full list in HEARTH-notes.md)
- `renderX()` functions rebuild their view from scratch — static HTML for those sections is dead code; put changes inside the render function.
- Helpers called from renderers must be **top-level**, not locally scoped.
- Guard `find()`/array lookups against `-1` (an unguarded `-1` once duplicated the whole document).
- A literal `</script>` inside a JS string breaks the HTML parser → blank page; the print-doc string escapes it as `<\/script>`.
- Avoid `var history` (shadows `window.history`).
- The in-app version label is set at runtime from the `sw.js` `VERSION` via postMessage — a stale-looking version means the new service worker hasn't activated yet, not a bug.

## Council review
When Cathal says **"use my council"**, invoke the **`hearth-council` skill** — the full 7-expert Hearth PWA Review Council spec lives there. Skip it for small changes unless asked.

## Trip data model — keep export/import in sync
**Whenever a new field is added to booking objects**, update all three of these in the same change:
1. **Export map** in `openTripEditor` (the `.map(function(b){ return {...} })` inside the `tpExport` click handler) — add the new field.
2. **`importTripFromJSON`** — add the field with a safe fallback (e.g. `field: b.field || ""`).
3. **`mergeBookingsIntoTrip`** — add the field with the same fallback.

Current booking fields in the export: `type`, `title`, `start`, `end`, `location`, `ref`, `notes`, `connectsFrom`, `boarding` (v292, "HH:MM" or ""), `gate` (v292), `seats` (v293, free text). Fields intentionally omitted: `id` (regenerated on import), `updated` (set to now on import).

## After significant work
Update `HEARTH-notes.md` (changelog entry + sync the version state) so the next session starts current.
