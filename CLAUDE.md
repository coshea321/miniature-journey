# Hearth — Claude Code project guide

Hearth is a family-hub PWA: one large single-file vanilla **HTML/JS** app, no build step, no framework.
Cathal is a **non-coder**; treat him as the reviewer, not a co-developer. Lead with the answer, be concise, flag honest trade-offs over overselling.

## Repo layout
- `index.html` — the entire app (~9,500 lines: HTML + one big inline `<script>` + CSS). This is where almost all work happens.
- `sw.js` — service worker. Single source of truth is its `VERSION` constant (cache name + the version label shown in-app both derive from it).
- `HEARTH-notes.md` — **read this at the start of any non-trivial task.** Full architecture, sync model, the per-feature changelog, the open backlog, and a long list of hard-won "do/don't" lessons. Don't duplicate it here; consult it.
- Hosted on **GitHub Pages**; `main` is live. No backend except Firebase Realtime DB (household sync via room codes, REST/EventSource — no SDK).

## Per-change workflow (every change)
1. **Create a backup branch `backup-vNNN` first** (current version, before edits). Suggest pruning branches older than 3 versions back. Never touch `main` directly for non-trivial work.
2. **Edit incrementally** — never rewrite the whole file. Make targeted edits.
3. **Verify the edit landed** (grep for the changed strings) — silent no-op edits have caused real incidents here.
4. **Syntax-check the main script block**: extract from the `// PREVIEW MODE` comment to the FIRST `</script>` and run `node --check`. (The file also contains an escaped `</script>` inside a JS print-doc string — don't be fooled by it.)
5. **Verify file integrity**: sane length (~557k, grows slowly — a jump to ~900k+ means the v221-style document-doubling bug), exactly ONE real `<!DOCTYPE>`/`<html lang>`, ONE version label, clean `</body>\n</html>` EOF.
6. **Bump the version in BOTH `index.html` and `sw.js`.** Format: `vNNN · DD/MM/YYYY` (date only, no time). For `sw.js` this is the one-line `VERSION` edit.
7. **Commit, push, then immediately open a GitHub PR** — always, without waiting to be asked. The PR is how Cathal reviews the diff and merges to `main`. Describe changes clearly in the PR body. Never push and say "create a PR when you're ready" — create it now.

## Design & safety rules (these override a prompt that conflicts)
- **Confirm feature design before building anything non-trivial.** Cathal has corrected mid-build many times; align upfront.
- **Medicine dosing is safety-sensitive.** Weight-based doses use confirmed product strengths only (Calpol Infant 120mg/5ml @15mg/kg; Nurofen for Children 100mg/5ml @10mg/kg), round DOWN, cap at 10ml, block Nurofen under 5kg, always show the working + "check the leaflet", keep editable. Never silently change strengths or formulas.
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
When Cathal says **"use my council"**, run the full **Hearth PWA Review Council**: 7 independent experts — PWA/Mobile UX, Healthcare/Wellness Designer (physio + dosing safety), Firebase/Sync Architect, Accessibility, Privacy Advocate, Non-Technical Parent User, Devil's Advocate — each with assumptions/risks/alternatives, then a consensus with a confidence level. Skip it for small changes unless asked.

## After significant work
Update `HEARTH-notes.md` (changelog entry + sync the version state) so the next session starts current.
