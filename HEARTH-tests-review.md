# Hearth — Automated-tests proposal: review + build-ready spec

Reviewed 24/07/2026 on Fable (`claude-fable-5`) against v349. This document reviews the prior Opus session's
test-coverage proposal, corrects it where it was wrong, and specifies the version of it that should actually be
built — build-ready for a plain-Sonnet session per the 12/07/2026 handoff policy. **No app files were changed by
this review.** Every claim below marked ✅/❌ was verified empirically in this session by loading `index.html` in
the pre-installed headless Chromium over raw CDP (no npm packages — see §2, this matters).

**Verdict in one line: build a small test suite, but not the one proposed — no Playwright, no npm, no
node_modules, no dose-math extraction, sync merges first (not the boot smoke), and two of the six items
downgraded to CI greps.**

---

## 1. Claim-by-claim verification of the prior analysis

| Claim | Verdict |
|---|---|
| Page loads from `file://` in headless Chromium with zero page errors | ✅ Confirmed (zero `pageerror` on load and after a full 9-section nav sweep) |
| "All ~443 functions are page globals" | ⚠️ Loose. 393 top-level `function` declarations ARE globals (all 19 sampled merge/pure functions callable). ~50 more are nested inside handlers/closures and are NOT globals. Everything the tests need is global; the number was padded. |
| `node --check` cannot catch the v226 (helper-in-IIFE) and v235 (null wiring) classes | ✅ Trivially true — both are runtime errors in parse-clean code. |
| `mergeHist` throws on a nameless hist entry | ✅ Confirmed, and it's worse than stated: throws whether the nameless entry is on the *incoming* side (line 8581) **or** the *existing* side (line 8579). `capHistToLiveLimit` (8562) additionally throws, but only when hist exceeds 150 entries. `null` entries (Firebase array holes) are handled fine everywhere. |
| …and is reachable in practice | ❌ **Not in practice.** Every hist writer (`addToHist` 2329, `addToHistFor` 9704, and all their callers at 2203/2209/3355/4874/8333/9686) passes a validated non-empty string name. Firebase RTDB strips `null` values — but `name` is never null in a pushed payload, and array holes come back as `null` *entries*, which the `h &&` guard and the household channel's `.filter(Boolean)` (11018) already screen. The only real vector is a hand-edited/corrupted backup JSON fed to `importBackupData` (6317). **Severity: robustness nicety, not fix-now.** The one-line guard is still worth folding into the test version (see §7 decision D2) because it sits in the sync apply path and costs nothing. |
| Trip export/import round-trip passes for all 11 fields | ✅ Confirmed empirically (export map 3074 ↔ `importTripFromJSON` 2467 ↔ `mergeBookingsIntoTrip` 2497; `connectsFrom` consistently `!!`-boolean). |
| "Playwright is available globally" | ❌ **False in this very environment** — `require('playwright')` fails from Node here. The harness must not depend on it (and doesn't need to — §2). |
| "Adds node_modules and a CI install step; judged worth it" | ❌ **False premise.** See §2 — zero npm dependencies needed, locally or in CI. |
| Dose math is "structurally untestable" without extracting it | ❌ **False — disproven end-to-end.** Seeding a growth entry, calling `renderMedicine()`, and dispatching a real `click` on the chip drives the actual handler: 8 kg → Calpol chip fills `#medDose` with `"5ml"`, Nurofen `"4ml"`, 4.5 kg → Nurofen gives empty dose + "under 5kg… check your GP" note, and the note text carries "check the leaflet". The REAL code path — `data-*` attributes, handler, formula, cap, wording — is testable with **zero app-code change**. |
| Tests run with Firebase hard-blocked ("test mode") | ⚠️ Half right. On `file://` the app enters **preview** mode (`_isPreview`, line 1522 — empty hostname), NOT test-build mode (`_isTestBuild` is false, 1540). Preview skips login and the SW, but several Firebase guards check only `_isTestBuild` (6704/6735/6754/7065/7297/7869/7901). In practice a fresh headless profile has no credentials/household code so sync is inert — but the harness adds a hard network block anyway (§3). |
| `scaleIngredient` counts contradiction | ✅ Confirmed: 3 cloves at ×0.5 → `"1 ½ cloves"` (line 3527 uses `fmtNumber`, no whole-number rounding). `HEARTH-notes.md` line 186 says counts "scale as whole numbers". Doc and code disagree — decision D4. |
| `growthCentile` callable, sex-unset → null | ✅ Confirmed (boy, 8 kg @ 70 cm → 26.39th centile; `''` sex → null). |

---

## 2. The dependency question — answered by construction

The proposal's stated trade-off ("adds node_modules and a CI install step to a deliberately dependency-free
repo") is a false dilemma. This review's own verification ran on a **~100-line, zero-dependency harness**:

- spawn the pre-installed Chromium (`/opt/pw-browsers/chromium` in Claude sessions; plain `google-chrome`,
  pre-installed on GitHub's `ubuntu-latest` runners, in CI) with `--headless=new --remote-debugging-port`;
- talk CDP over **Node ≥22's built-in `WebSocket`** — no `ws` package, no Playwright, nothing;
- `Runtime.evaluate` into the page; collect `Runtime.exceptionThrown` as page errors.

So: **no `package.json`, no `node_modules`, no lockfile, no `npm install` step, no supply chain, ever.** The
repo stays exactly as dependency-free as it is today; `tests/` is plain Node scripts. The cost is owning ~100
lines of harness instead of leaning on Playwright's ergonomics — irrelevant here, since the tests call page
globals and click a handful of elements. This also removes the "thin end of the wedge" risk entirely: there is
no wedge.

## 3. Hermeticity

- Fresh Chromium profile per run (`--user-data-dir` in a temp dir): empty localStorage, no credentials, no
  household code — all push paths bail before the network.
- Belt-and-braces: launch with `--host-resolver-rules="MAP * 127.0.0.1"` so nothing can leave the machine even
  if a future code change loosens a guard. Open-Meteo/Firebase fetches fail instantly and silently (the app
  already tolerates offline).
- No service worker on `file://` preview mode — no cache interference.

---

## 4. The dose question — recommendation: do NOT extract

The prior session proposed extracting `Math.floor((w*mgkg*5/mg5)*4)/4` (11917) into a top-level
`doseForWeight()` as "the one item that requires an app-code change". **Rejected**, for three reasons:

1. **The premise was wrong.** The inline handler is fully testable through the DOM (§1). The e2e chip test
   exercises MORE than an extracted function would: the `data-mgkg`/`data-mg5`/`data-floor`/`data-cap`
   attributes (11836–11837), the weight lookup, the under-5 kg block, the cap, the fallback, and the note
   wording. An extracted `doseForWeight` would leave all of that plumbing untested — and a wrong
   `data-mgkg='15'` typo is exactly as dangerous as a wrong formula.
2. **Churn on safety-critical working code buys nothing.** The formula hasn't changed since v264/v291. The
   historical failure mode in this repo is not "the arithmetic regressed"; it's config/data drift — which the
   e2e test plus the greps below catch and an extraction doesn't.
3. **What should guard the math instead:** CI literal-pin greps (zero app risk, zero tokens) asserting exact
   occurrence counts of: `data-mgkg='15' data-mg5='120'` (Calpol), `data-mgkg='10' data-mg5='100'` and
   `data-floor='5'` (Nurofen), the formula string `Math.floor((w*mgkg*5/mg5)*4)/4`, and the v291 interval
   constants/wording ("check the leaflet", "logged"). Any PR touching those lines goes red until the greps are
   deliberately updated — "never silently change strengths or formulas" made mechanical.

---

## 5. Re-ranking (with the reasoning, since it disagrees with the prior session)

1. **Sync merge tests** (was #2) — promoted to #1. The changelog is dominated by sync bugs (v245, v333, v342,
   v343, v348, plus the two notes defects the Fable audit found), and — the decisive point — **sync is the one
   area Cathal structurally cannot test**: the raw.githack pre-merge link hard-blocks Firebase, and merges need
   two devices anyway. Everything else in the workflow has a human safety net; merges have none. Tests are the
   only instrument that covers the worst incident class.
2. **Boot smoke test** (was #1) — demoted, still early. It catches the v226/v235 repeat-offender classes that
   `node --check` can't see, and covers renderers in sections Cathal wouldn't poke on his phone. But a broken
   boot IS caught by the phone test within minutes, so its marginal value is "earlier + all sections", not
   "only line of defence" — that title belongs to the merges.
3. **Trip + backup round-trips** (was #5) — promoted. `buildExportPayload → importBackupData` is the disaster
   recovery path and the daily cloud backup, currently untested end to end; the trip round-trip mechanically
   enforces the three-place field checklist CLAUDE.md currently asks a human to remember.
4. **Dose e2e + CI dosing greps** (reshaped #3) — no app-code change (§4).
5. **Grocery suggestions/history** (was #6) — two consecutive regression fixes (v342, v348), pure-ish logic,
   cheap once the harness exists.
6. **Growth centiles** (was #4) — demoted. The WHO data was cross-checked and Cathal-confirmed at v347, and the
   code won't churn. Golden values guard only hypothetical future edits. Include a handful because they're
   nearly free, but note honestly: **golden values pin today's outputs, they do not re-validate the WHO data.**

**Cut:** `sw.js` tests (see §6). Nothing else cut, but items 5–6 can trail in a second version if the first
slice needs to stay small.

## 6. What the proposal missed

- **Duplicate-function CI grep** (lessons list #1): extract all `^function (\w+)` names, assert each count is
  exactly 1, with a small allowlist for the known still-duplicated `openSetSheet`/`closeSetSheet` region. A
  hoisting-shadowed duplicate is a *silent* no-op — no test can see it, a grep can. Zero tokens.
- **The dosing literal greps** (§4) — stronger than any dose test alone.
- **`sw.js`: accept the gap.** Testing it means an HTTP server + SW lifecycle harness for 96 lines whose only
  subtle part (the v295 lie-fi race) is stable and was hand-verified. The CI version-consistency check already
  pins the failure mode that actually recurs (label/cache drift). Not worth the harness complexity now.
- **Firebase transport: accept the gap, deliberately.** No backend, no two-device tests. Mitigation: the
  historical transport-adjacent bugs (SSE self-echo, normalisation strips) all *manifested through the merge
  functions*, which are exactly what item 1 pins. A live-backend test rig is disproportionate for a two-user
  family app. This is the biggest accepted gap and it's acceptable — state it, don't paper over it.
- **Tests can be wrongly "fixed" by a future AI session.** New workflow rule: any PR that edits files under
  `tests/` must say so explicitly in the PR body ("tests changed: which, why"), so a behaviour change can't
  slip through as a quiet test edit. Cathal reviews test diffs like app diffs.
- **Doc/code mismatch:** `scaleIngredient` counts (D4 below).

---

## 7. Decisions needed from Cathal (none assumed)

- **D1 — Go/no-go** on building slice 1 (§8). Recommendation: go.
- **D2 — `mergeHist`/`capHistToLiveLimit` nameless-entry guard** (one line each: treat an entry with no `name`
  as dead in `live()` / skip it in the cap). Include in the same version as the tests, or leave the code
  untouched and have the test document the current throw? Recommendation: include — it's sync-path robustness
  at near-zero risk, and the test then pins it. (Including it means the version bumps and the PR shows a
  2-line `index.html` diff; excluding it means slice 1 touches zero app code.)
- **D3 — Blocking or report-only?** The Action already prints red ✗ but only blocks if Cathal adds the branch
  protection rule (noted in the workflow file header since it was written). Recommendation: report-only for the
  first 2–3 PRs, then enable branch protection once the suite has proven quiet.
- **D4 — `scaleIngredient` counts:** notes say whole numbers, code produces "1 ½ cloves". Recommendation: fix
  the DOC (halving 3 cloves to "1 ½" is sensible; silently changing recipe scaling behaviour is worse). Code
  change only if Cathal actually wants whole-number counts.
- **D5 — dosing test sign-off:** no app code is touched (§4), but per the safety rules Cathal should explicitly
  OK the dose e2e cases + literal greps before they're built.
- **D6 — accept the `sw.js` and Firebase-transport gaps** as documented in §6.

---

## 8. Build spec — slice 1 (build on Sonnet from this section alone)

**Version/PR:** one version (vNNN per normal flow **if D2 is included**, otherwise a no-bump tests-only PR —
CI's bump check skips when app files are unchanged). Normal preflight/verifier flow either way. PR body must
start with the test link as usual and state "tests changed: initial suite" per the new rule in §6.

**Files to create:**

```
tests/
  harness.js     — CDP harness (spec below)
  run.js         — runner: boots page, runs every file in tests/cases/, exit 1 on any failure
  cases/
    01-boot-smoke.js
    02-merge-lists.js
    03-merge-hist.js
    04-merge-baby.js      (mergeBabyData incl. medicine tombstones + v296 carry-through, mergeNotes, mergeBottles)
    05-merge-trips.js
    06-trip-roundtrip.js
    07-backup-roundtrip.js
    08-dose-e2e.js
```

(Grocery-suggestions and centile cases are slice 2 — same harness, add `09-`/`10-` later.)

**`tests/harness.js`** (~100 lines, zero dependencies, Node ≥22 only):
- Resolve the browser: `process.env.CHROME_BIN`, else first of `/opt/pw-browsers/chromium`,
  `google-chrome`, `chromium-browser`, `chromium` found on PATH (`which`).
- Spawn with: `--headless=new --no-sandbox --disable-gpu --remote-debugging-port=<port>`
  `--remote-allow-origins=* --user-data-dir=<fresh tmp dir> --host-resolver-rules="MAP * 127.0.0.1"`.
- Poll `http://127.0.0.1:<port>/json` (250 ms × 40) for the page target; connect with the **built-in global
  `WebSocket`** (no `ws` package).
- Expose: `navigate(url)` (Page.navigate + settle wait ~2.5 s), `evaluate(exprString)` (Runtime.evaluate with
  `returnByValue:true`, throw on `exceptionDetails`), `pageErrors` (accumulated from
  `Runtime.exceptionThrown` after `Runtime.enable`), `close()`.
- **Do not add auto-wait/retry sophistication** — the app is synchronous; a fixed settle wait is fine and keeps
  the harness inspectable.

**`tests/run.js`:**
- For each case file (sorted): fresh `navigate('file://<abs path>/index.html')` — this resets localStorage
  because... it does NOT (same origin). **Reset explicitly instead:** before each case file, evaluate
  `localStorage.clear(); location.reload()` and re-settle. State isolation between case files is mandatory;
  within a file, cases may share state deliberately.
- Assert zero `pageErrors` after every case file, not just at boot.
- Each case file exports `module.exports = { name, run(page) }` where `run` calls `page.evaluate` with an
  in-page IIFE string returning `{pass: [names], fail: [{name, detail}]}` (in-page code is ES5-compatible like
  the app). DOM-driving cases (01, 08) may make several evaluate calls.
- Output: one line per case (`ok`/`FAIL`), failures repeated at the end as GitHub annotations
  (`::error::<case> — <plain-English one-liner>`) so a red PR shows *what broke in words* on the Checks tab —
  that is what Cathal sees on his phone. Exit non-zero on any failure.

**Case specs (exact behaviours to pin — read each function before writing its cases; line anchors are at v349):**

- **01-boot-smoke:** after load, zero page errors; then `switchSection(s)` for every
  `s ∈ home, lists, recipes, baby, trips, train, track, sports, famlog` (this covers hidden sections the phone
  test never reaches); zero page errors after each; verified working in this session. Also click the 5 visible
  bottom-nav buttons as real DOM clicks.
- **02-merge-lists** (`mergeListItems` 1958): union preserves adds from both sides · per-id newest-wins by
  `updated` · tombstone at/after `updated` drops the item; re-add with fresher `updated` survives ·
  `push` flag true when local has items remote lacks · null entries tolerated.
- **03-merge-hist** (`mergeHist` 8571, `capHistToLiveLimit` 8557): union by name, existing side wins ·
  tombstone ≥ `lastUsed` drops; fresher `lastUsed` revives · sort by count then lastUsed · v348 cap
  protection: 155 entries with 10 matching live items → all 10 protected survive, total ≤ 160 · under-150
  input passes through uncapped · **if D2 accepted:** nameless entry is silently dropped, no throw (this is
  the pinned-fix test); **if D2 declined:** omit nameless cases entirely — do not pin a throw as correct.
- **04-merge-baby** (`mergeBabyData` 1913, `mergeNotes` 2578, `mergeBottles` 1903): medicine per-id
  newest-wins + med tombstone respected + re-log after delete survives · v296 generic key carry-through: a
  key present only on local (e.g. `babySex`) survives a merge with a remote lacking it — **the incident class,
  the single most important assertion in this file** · notes: id-union, newest-wins by `updatedAt||id`,
  tombstone filtered · bottles: per-key newest-wins by `updated`, tie → remote.
- **05-merge-trips** (`mergeTripsData` 2510): per-booking newest-wins · v296 field-fill (winner missing
  `seats` gets loser's; a winner's explicit `""` stays `""`) · trip + booking tombstones · `push` flag on
  local-fuller.
- **06-trip-roundtrip:** the 11-field test exactly as verified in this session (build a `trip-v1` JSON with
  every field populated incl. `connectsFrom:true`, import, assert all 11 land intact; repeat through
  `mergeBookingsIntoTrip`); plus `importTripFromJSON` error paths (bad JSON, missing `hearth` tag, missing
  name). Clean up the imported trip afterwards.
- **07-backup-roundtrip:** seed known data through app functions (a grocery item + hist via
  `addItemToCurrent`, a recipe, a trip, a baby growth+medicine entry, a note), `buildExportPayload()` (6131),
  snapshot it, `localStorage.clear(); location.reload()`, `importBackupData(payload)` (6300), assert each
  seeded datum is back; assert a v323 hist tombstone written locally before import still suppresses that hist
  entry after import.
- **08-dose-e2e** (no app-code change — drives the real chips at 11836/11895): seed `bd.growth`, switch to
  baby/medicine, `renderMedicine()`, real `.click()` on chips, read `#medDose` / `#medDoseNote`:
  - 8 kg → Calpol `"5ml"`, note contains `"120mg/5ml"` and `"check the leaflet"`
  - 8 kg → Nurofen `"4ml"`
  - 7.3 kg → Calpol `"4.5ml"` (round-down-to-0.25 pin: raw 4.5625)
  - 18 kg → Calpol `"10ml"`, note contains `"(capped)"`
  - 4.5 kg → Nurofen: empty dose, note contains `"under 5kg"`
  - no weight logged → Calpol `"5ml"` fallback, note contains `"No weight logged"`
  All six verified reachable this session (values 1, 2, 5, 6 executed; 3, 4 computed from the same formula).

**CI wiring** (`.github/workflows/hearth-pr-checks.yml`): add a second step after the existing checks:

```yaml
      - name: Behaviour tests
        run: CHROME_BIN="$(command -v google-chrome || command -v chromium-browser)" node tests/run.js
```

No install step. Same job, so one red ✗. Blocking is D3 (branch protection, Cathal's toggle, exactly as the
workflow header already documents for the existing checks).

**New CI greps** (add to the existing script step — these are the §4/§6 items, cheaper than tests):
- dosing literal pins: `grep -c "data-mgkg='15' data-mg5='120'" index.html` = 1;
  `grep -c "data-mgkg='10' data-mg5='100'" index.html` = 1; `grep -c "data-floor='5'" index.html` = 1;
  `grep -cF "Math.floor((w*mgkg*5/mg5)*4)/4" index.html` = 1; `grep -c "check the leaflet" index.html` ≥ 4
  (count the actual number at build time and pin it exactly).
- duplicate functions: `grep -oE '^function [A-Za-z0-9_]+' index.html | sort | uniq -d` must be empty after
  removing allowlisted names (`openSetSheet`, `closeSetSheet` — re-verify the actual duplicated names by grep
  before pinning the allowlist).

**Who runs what:**
- **GitHub Action:** the full suite, every PR (zero tokens, ~30–60 s).
- **Editing session:** run `node tests/run.js` directly via Bash before committing (cheap; do NOT spawn a
  subagent for it). Add one line to the `hearth-verifier` checklist: "run `node tests/run.js` — expect exit 0";
  the Haiku verifier may run it since it has Bash, but the editing session running it first is the norm.
- **Cathal, on a red ✗:** don't merge; open the Checks tab — the `::error::` lines say in plain English what
  broke; paste them to the next Claude session (or comment on the PR if a session is watching it).

**Docs to update in the same PR:** `HEARTH-notes.md` changelog entry + a short "Tests" subsection under the
workflow section (what exists, how to run, the tests-changed-PR-body rule from §6); `CLAUDE.md` gets two lines
(tests exist in `tests/`, run before committing; test edits must be called out in the PR body). If D4 = fix
the doc, correct the counts line in `HEARTH-notes.md` §"Recipe unit rules" in the same pass.

---

## 9. Plain-English summary for Cathal

- **Should Hearth have automated tests? Yes — a small, targeted set.** Not because the current workflow is
  weak, but because one thing can't be human-tested at all: the sync/merge logic. Your pre-merge phone link
  deliberately blocks sync, and most of the app's worst historical bugs were exactly there. Tests are the only
  net for that area, so those come first.
- **No new dependencies — genuinely none.** The earlier proposal said tests would add an npm install and a
  `node_modules` folder. It's wrong: I ran a full verification today using only the browser that's already
  installed and plain Node. The repo stays exactly as dependency-free as it is now.
- **Nobody touches the medicine dosing code.** The earlier proposal wanted to restructure the dose calculation
  to make it testable. Also wrong — I tested the real thing today by simulating actual taps on the Calpol and
  Nurofen buttons (8 kg → 5 ml and 4 ml, the under-5 kg Nurofen block, the "check the leaflet" wording — all
  correct). The tests will do exactly that, plus a tripwire that turns the checks red if any future change
  touches the strengths, the formula, or the safety wording.
- **One small code flaw found, low risk:** a grocery-history merge function crashes if it's ever fed an entry
  with no name. I checked every way that could happen — the app itself can never produce one; only a
  hand-edited backup file could. Worth a one-line fix alongside the tests (your call, D2), not urgent.
- **One documentation mismatch:** the notes say ingredient counts scale as whole numbers, but the app shows
  "1 ½ cloves" when you halve 3 cloves. I'd fix the notes, not the app (D4).
- **What stays untested, honestly:** the service worker (small, stable, not worth the rig) and the live
  Firebase connection (needs two real devices; the logic *around* it is what the tests pin). Accepted gaps,
  stated plainly (D6).
- **What happens when a test fails:** the PR shows a red ✗ with a plain-English line saying what broke. Don't
  merge; tell the next Claude session. Whether a red ✗ physically blocks merging is a switch in your repo
  settings — I'd leave it off for the first few PRs, then turn it on (D3).
- **To proceed:** answer D1–D6 above, then any plain-Sonnet session can build slice 1 from §8 of this file as
  one normal version + PR.
