👉 **Try this version:** https://raw.githack.com/coshea321/miniature-journey/BRANCH-NAME/index.html

## What changed

<!-- Plain-English bullets a non-coder can review. -->

## Why

<!-- The request or the bug that prompted it. -->

## Before you merge

The test link opens with **demo data already in it** — a made-up household with
lists, recipes, a trip, baby records, plants and a watchlist. It reloads itself
fresh on every new version, so you are never reviewing against real data that
wandered in from a previous PR. **Tap the orange banner at any time to put the
demo data back.**

**Always check (30 seconds):**

- [ ] The app opens — no blank screen, no white flash that never ends
- [ ] The orange `TEST BUILD` banner is across the top
- [ ] The demo data is there — Grocery has items, Recipes has "Demo Chicken Traybake"
- [ ] No red bug badge in the bottom-right corner (that badge is JS errors)
- [ ] Tap the orange banner → confirm → the demo data reloads

**Check for this change:**

<!-- 2-4 tick-box steps aimed at what this version actually changed. Name the
     section, the tap, and what should happen. Delete this comment. -->

- [ ]
- [ ]

## Checks

<!-- The mechanical-checks summary block (tests/checks.sh), pasted verbatim,
     plus the node tests/run.js result. If anything under tests/ changed:
     which file, and why. -->

## Rollback

<!-- The backup branch for this version, e.g. backup-v406. -->

<!-- ── Writing this PR body ──────────────────────────────────────────────
     Keep it to what Cathal needs in order to review and merge. Cover the
     substance — what changed, why, what to tap — and stop there: no filler
     sections, no restating the same point in three registers, no recap of
     work already visible in the diff. The "Before you merge" boxes are the
     part he actually acts on, so they should not be buried under prose.
     Long-form reasoning that a future session will need belongs in the
     changelog entry or its own doc, not here.
     ──────────────────────────────────────────────────────────────────── -->
