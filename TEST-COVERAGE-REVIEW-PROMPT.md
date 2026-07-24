# Prompt for Fable — review the Hearth test-coverage proposal

*(Transient working file. Paste everything below the line into a Fable session — ideally one pointed at this repo so it can verify claims against `index.html`, `CLAUDE.md` and `HEARTH-notes.md` directly. Delete this file once the review is done and the decisions are recorded in `HEARTH-notes.md`.)*

---

You are reviewing a proposal to add automated tests to **Hearth**, a family-hub PWA. Read `CLAUDE.md` and `HEARTH-notes.md` in this repo first — they carry the architecture, the workflow rules, and the hard-won lessons list.

**Context you need up front:**

- Hearth is one ~740KB single-file vanilla HTML/JS app (`index.html`, ~12,500 lines: HTML + one big inline `<script>` + CSS) plus a small `sw.js`. **No build step, no framework, no `node_modules`, no `package.json`.** That dependency-free property is deliberate and has served the project well.
- Cathal, the owner, is a **non-coder**. He reviews PR diffs on his phone and merges. Anything proposed has to survive that: it must not make his review harder, and it must not break the "tap the raw.githack link, poke the app, merge" loop.
- Current version at time of writing: **v349 · 22/07/2026**. No app files were changed to produce this analysis.
- This is a personal/family app. No Play Store, no push notifications, no third-party analytics.

A prior session (Opus) analysed test coverage and produced the proposal below. **Your job is to review it, not to rubber-stamp it.** Cathal's project rules explicitly value honest trade-offs over overselling, and the notes record several occasions where a confident-sounding plan was wrong. Push back hard where you disagree.

---

## What the analysis found

### 1. There are currently zero tests

The only automated checking is `.github/workflows/hearth-pr-checks.yml` plus the `hearth-verifier` subagent, which run the same mechanical checks: `node --check` on the extracted inline script block, DOCTYPE / `<html lang>` / version-label counts, a file-size sanity bound, clean EOF, and version-bump consistency between `index.html` and `sw.js`.

Assessment offered: this is a good *corruption* guard — it catches the v221 document-doubling class and the blank-page class — but it verifies **no behaviour at all**. The claim is that every behavioural regression in the changelog (v245 sync echo, v333 Firebase normalisation echo, v342 suggestion chips, v343 notes sync, v348 grocery hist divergence) would have been invisible to it.

### 2. A test harness needs no changes to `index.html` — verified, not assumed

All ~443 functions in the inline script are page globals. Headless Chromium can load `index.html` from `file://` and call them directly. This was verified end to end in the analysis session:

- Node alone fails immediately (`window is not defined` at line 4 of the extracted block), so a pure-Node harness is out.
- Chromium is pre-installed in the Claude Code web environment and Playwright is available globally.
- Loading the page and calling `mergeListItems`, `mergeHist`, `capHistToLiveLimit`, `growthCentile`, `medRuleFor`, `parseAmount`, `scaleIngredient`, `importTripFromJSON`, `mergeTripsData`, `bottleFreshness`, `detectCat`, `fuzzyMatch` all worked, with **zero page errors** on load.

So tests would live entirely in a separate `tests/` folder. `index.html` stays untouched — with one exception, item 3 below.

### 3. One real bug surfaced during the analysis

`mergeHist` throws on a history entry with a missing `name`:

```js
mergeHist([{name:'milk',count:2,lastUsed:5}], [{count:1,lastUsed:9}], {}, [])
// → TypeError: Cannot read properties of undefined (reading 'toLowerCase')
```

`index.html:8579` (in `mergeHist`) and `index.html:8562` (in `capHistToLiveLimit`) both call `h.name.toLowerCase()` having guarded only that `h` itself is non-null. The `live()` filter above them uses `String(h.name)`, so it does *not* screen a nameless entry out.

This sits in the sync apply path. The v243 `try/finally` guard should stop it becoming a visible crash, so the predicted symptom is that sync silently stops applying — which matches the hardest-to-diagnose class in the "Sync troubleshooting" notes.

**Please verify this independently and judge its real severity.** Specifically: can a nameless hist entry actually arise in practice (partial backup import, an older device's payload, Firebase normalisation stripping a key), or is this only reachable with hand-crafted input? That determines whether it is a fix-now bug or a robustness nicety.

### 4. The trip export/import round-trip currently passes

All 11 booking fields (`type`, `title`, `start`, `end`, `location`, `ref`, `notes`, `connectsFrom`, `boarding`, `gate`, `seats`) survive a round-trip through `importTripFromJSON` intact. `connectsFrom` is consistently boolean across the editor, the export map, and both import paths — an earlier suspicion of a type mismatch there was checked and is unfounded.

---

## The proposal, as ranked by the prior session

**1. Boot smoke test — claimed highest value per hour.** Load the page, assert zero `pageerror`s, click through all 5 nav sections, assert zero errors again. Rationale: this catches the v226 class (a helper defined inside an IIFE instead of top-level, so a renderer throws "X is not defined") and the v235 class (wiring an element that is `null` because its HTML sits after the script). Both are repeat offenders in the lessons list, and both parse perfectly, so `node --check` cannot see them.

**2. Sync merges.** `mergeListItems`, `mergeHist`, `mergeBabyData`, `mergeTripsData`, `mergeNotes`, `mergeBottles`, `capHistToLiveLimit`. All pure, all directly callable. Pin: newest-wins, tombstone-beats-stale, union preserves adds from both sides, the `push` convergence flag, the v296 babySex-class generic key carry-through, and robustness against malformed input.

**3. Dose calculation — the one item that requires an app-code change.** The math is `Math.floor((w*mgkg*5/mg5)*4)/4` at `index.html:11917`, inside a `chip.addEventListener("click", …)` handler, fed by `data-*` attributes on button HTML strings (`index.html:11836-11837`). The most safety-sensitive logic in the app is therefore the one part that is structurally untestable. The proposal is to extract it to a top-level pure `doseForWeight(w, mgkg, mg5, floor, cap)` and test: Calpol 8kg → 5ml, Nurofen 8kg → 4ml, round-down-to-0.25ml, the 10ml cap, the under-5kg Nurofen block, and the no-weight fallback.

**4. Growth centiles.** `growthCentile` / `whoWflLMS` / `normalCdf` are hand-rolled LMS math with no library. v347's own changelog entry records that the newly-sourced WHO medians disagreed with the app's previous table by up to ~3.5%. Proposal: golden values plus boundaries (45cm, 110cm, interpolation midpoints, sex-unset → null).

**5. Trip and backup round-trips.** `CLAUDE.md` requires a human to remember three separate places whenever a booking field is added (export map, `importTripFromJSON`, `mergeBookingsIntoTrip`). One round-trip test enforces that mechanically. Same pattern for `buildExportPayload` → `importBackupData`, which is both the disaster-recovery path and the daily cloud backup, and is currently untested end to end.

**6. Grocery suggestions and history.** Two consecutive versions were bug fixes here (v342 "Bananas", v348 "blueberries"), the logic is pure, and the tests are cheap.

Also flagged, smaller: `HEARTH-notes.md` states that counts scale as whole numbers, but `scaleIngredient` returns `1 ½ cloves` for 3 cloves at half servings. Someone needs to decide which is intended.

**Stated trade-off:** this adds `node_modules` and a CI install step to a deliberately dependency-free repo. The prior session's judgement was that it is worth it because the tests sit outside `index.html` and nothing about the single-file, no-build-step app changes — but that the dose extraction is dosing code and needs Cathal's explicit sign-off.

**Suggested first slice:** items 1 and 2 only, as one version, touching no app code.

---

## What to give back

Be genuinely critical. If the premise is wrong, say so plainly — "don't add tests to this project" is an acceptable conclusion if you can argue it, and a reviewer who agrees with everything is of no use here.

Please cover:

1. **Is the premise sound?** For a single-file family PWA maintained by a non-coder through AI sessions, is an automated test suite actually the right instrument — or would the same effort be better spent on, say, stronger CI greps, a richer verifier checklist, or better subagent discipline? The existing workflow (preflight → scout → verifier → PR → phone test → merge) already catches a lot. Say where tests genuinely beat it and where they would just be ceremony.

2. **The dependency cost.** Is `node_modules` + a CI install step acceptable here, or is that the thin end of a wedge that ends with a build step? Is there a materially lighter harness that gets most of the value — CDP over the pre-installed Chromium with no npm dependency at all, for instance? Judge whether the extra complexity is worth avoiding the dependency.

3. **The dose extraction specifically.** This is the only proposed change to app code, and it touches dosing. Is extracting the inline handler math to a top-level pure function the right call, or does the risk of touching working safety-sensitive code outweigh the benefit of being able to test it? If you favour it, specify exactly how to do it so behaviour is provably identical — including what happens to the `data-*` attribute plumbing and the existing v291 interval advisories. If you are against it, say what should guard that math instead.

4. **Re-rank the six items** by real-world value for *this* project, and cut anything that is not worth doing. The prior session put the boot smoke test first; test that judgement rather than inheriting it.

5. **What was missed.** `sw.js` has no tests at all (cache versioning, offline load, the `VERSION` postMessage that drives the in-app label). The duplicate-function hazard from lessons list item 1 is arguably better served by a CI grep-count assertion than by a test. Firebase sync behaviour cannot be tested without a backend — is that an acceptable gap or the biggest one? Add anything else you spot.

6. **How this should run.** Should tests block PR merge, or report only? Where do they live? Who runs them — the GitHub Action, the `hearth-verifier` subagent, or both? Note that the verifier is a Haiku subagent and the Action is zero-token, which is a relevant cost consideration. How does a non-coder act on a red test result on his phone?

7. **Anything in the analysis you can falsify.** Specific claims to check: that all ~443 functions are reachable as page globals; that `node --check` cannot catch the v226 and v235 classes; that the `mergeHist` throw is reachable in practice; that the trip round-trip currently passes cleanly.

**Output format.** Per the design-here-build-on-Sonnet handoff policy in `CLAUDE.md` (12/07/2026): if you conclude any of this should be built, write it up as a **build-ready spec** — specific enough that a plain-Sonnet session could implement it from the notes alone, with file paths, function names, exact test cases, and the CI wiring. Flag every decision that still needs Cathal's answer rather than assuming one. End with a short, plain-English summary he can act on without reading the spec.
