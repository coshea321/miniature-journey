---
name: hearth-council
description: >
  The full Hearth PWA Review Council — run when Cathal says "use my council"
  or "council review" on a feature design, a shipped version, or the whole
  app. Seven independent expert reviews followed by a consensus. Skip for
  small changes unless he asks.
---

# Hearth PWA Review Council

Convene seven INDEPENDENT experts. Each writes their own review before any
consensus is drawn — do not let earlier experts' conclusions leak into later
ones. Each expert produces:

- **Assumptions** they are making about users, devices, and data.
- **Risks / concerns** ranked by severity, each tied to something concrete
  in the design or code (no generic advice).
- **Alternatives** — at least one different way to achieve the same goal,
  even if they end up preferring the original.
- **Confidence** in their own review (high / medium / low) and why.

## The seven experts

1. **Mobile UX & accessibility engineer** — offline behaviour,
   service-worker update cycle, touch targets (~44px), one-handed phone use
   at 480px, Android Chrome quirks, contrast, font sizes (safety-relevant
   text must not be the smallest on screen), screen-reader labels,
   works-without-precision-pointing. Hearth is installed as a PWA on phones
   and a tablet.
2. **Healthcare & wellness designer** (physio + paediatric dosing safety) —
   anything touching the Baby section, medicine logging, dose calculation,
   or Train/physio flows. The CLAUDE.md dosing rules are NON-NEGOTIABLE
   constraints, not review topics: confirmed strengths only, round down,
   10ml cap, Nurofen under-5kg block, working always shown, "logged" /
   "check the leaflet" wording, advisories never block logging.
3. **Sync & data-lifecycle architect** — the room-code REST + EventSource
   model, union-by-id + newest-wins + tombstones, self-echo races,
   field-wise merges, what happens when a device is offline for weeks.
   Also owns the data lifecycle AROUND the protocol — the app's most
   recurring bug class: export/import/cloud-backup coverage for any new
   field (the trip-booking export/import/merge trio), `updated`-stamp
   discipline on every mutation and revive path (stale-copy-wins-the-merge
   incidents), sync-apply rebuilding objects from hand-typed field lists
   (the babySex incident class), mixed-version household convergence, and
   graceful degradation of pre-existing caches. Knows the history: never
   reintroduce a grace window; merge-then-re-push-if-fuller.
4. **Privacy & security reviewer** — family data, child health data,
   location. No third-party analytics, no push notifications, no new
   third-party services without explicit sign-off; data stays localStorage
   + the family's own Firebase. Also the security surface: escaping of
   user-entered and imported content (`esc()`, DOMPurify), Firebase rules,
   paste-import handling, and the existing third-party touchpoints
   (Open-Meteo, the sports fixture API, raw.githack test links).
5. **Future maintainer** — the engineer who inherits this change in six
   months, in a ~715k / ~12,100-line single file. Does the design respect
   the codebase quirks (top-level helpers, renderers rebuild from scratch,
   the export trio)? Does every new field it adds become a permanent
   obligation on future sync/export changes? And per the design-here,
   build-on-Sonnet handoff policy (12/07/2026): is the design specified
   tightly enough that a plain-Sonnet session could build it from the
   backlog notes alone? Their job is to make risky designs safer to build
   and cheaper to live with — not to vote them down (that's #7's job).
6. **Non-technical parent user** (Cathal/Petra proxy) — is it obvious at
   2am with a sick child? Would a mis-tap do something surprising? Is the
   wording plain English? Does it add clutter to a 5-icon nav?
7. **Devil's Advocate** — argues the feature should NOT be built or shipped
   as designed: maintenance burden on a ~715k single file, coverage cliffs,
   free-API longevity, "who asked for this?". A real dissent, not a token
   one; their strongest objection must be answered in the consensus.

## Consensus

After all seven reviews:

- **Verdict**: build / build-with-changes / don't build (or ship / fix
  first, for a version review), with the specific changes listed.
- **Confidence level** (high / medium / low) and the main thing that would
  change it.
- **Dissent log**: any expert who disagrees with the verdict is recorded by
  name with their objection — dissent is never silently absorbed. (The v291
  "logged" wording rule came from a recorded dissent; they matter.)
- **What to check with Cathal before building** — the design questions only
  he can answer, phrased for a non-coder.

Keep each expert tight (a paragraph or two per section). The value is in
independence and specificity, not length.
