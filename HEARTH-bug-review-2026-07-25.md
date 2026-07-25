# Hearth — in-depth bug review (v351, 25/07/2026)

**Purpose:** a hand-off document for a fresh **Fable** session to review, triage and cost.
Nothing in this review has been fixed — this branch contains **only this file**. No app code,
no `tests/`, no version bump.

**How this was produced:** read-through of `index.html` (targeted greps + line-range reads, never
a full read) and `sw.js`, followed by **empirical verification in the real app** using the v350 CDP
harness (`tests/harness.js`) driving headless Chromium. Every finding marked ✅ CONFIRMED below was
reproduced by running the app's own functions — the probe output is quoted inline. Findings marked
⚠️ REASONED were established by code reading only and still want a second opinion.

**Baseline:** `node tests/run.js` is green (8/8) at v351 both before and after this review.
None of the bugs below is caught by the current suite.

---

## How to read this

Findings are ordered by **what they cost Cathal and Petra if they hit them**, not by how
interesting they are. Each one has:

- **What happens** — in plain terms
- **Where** — `index.html:LINE`
- **Evidence** — the probe that proved it, or the reasoning
- **Suggested fix** — a sketch, not a decision
- **Open question** — where Cathal's call is genuinely needed

There is a **recurring theme** (§2) that accounts for four separate findings. Fixing the theme
once is probably better value than fixing the four sites individually.

---

# Tier 1 — data loss

## 1. Backup restore silently drops all body-weight and blood-pressure history ✅ CONFIRMED

**What happens.** The file export and the daily cloud backup both include the *whole* `getWD()`
object — workouts, `bodyweight`, and `bp`. The **import** only reads `data.workouts.workouts`.
Everything else in the health store is discarded without a word. Restore a backup onto a fresh
phone and the entire Body tab (v336 weight chart, BP chart, all readings) comes back empty, while
the toast says the import succeeded.

**Where.** `index.html:6314–6318` (`importBackupData`, the `data.workouts` block).
Contrast `applyPersonal` at `index.html:7105–7117`, which *does* merge `bodyweight` and `bp`
correctly — the sync path was updated for v336, the import path was not.

**Evidence (probe 1).** Seeded 1 bodyweight entry + 1 BP reading + 1 workout, exported, wiped
localStorage, re-imported:

```
export contained bodyweight entries: 1   bp entries: 1
after wipe+import -> {"workoutsAfter":1,"bodyweightAfter":0,"bpAfter":0}
```

**Why it matters.** This is the one path that exists *specifically* to survive losing everything
else. It is also invisible: nothing warns, and the data is present in the backup file the whole
time. The blast radius grows every version that adds a nested key under `getWD()`.

**Suggested fix.** Merge `bodyweight` by `date` and `bp` by `ts` (union, keep local on collision) —
`applyPersonal:7105–7112` already has exactly the right shape to copy. Then carry unknown
top-level keys through generically so the next nested field can't repeat this (same catch-all
`mergeBabyData` got in v296).

**Open question for Cathal.** Restore semantics for these two: additive union (never lose a local
reading), or backup-wins on a same-date collision? Everything else in `importBackupData` is
additive-only, so union is the consistent answer unless you say otherwise.

---

## 2. THEME — four mutation sites forget to stamp `updated`, so their change never syncs ✅ CONFIRMED

The whole list/notes sync model rests on one rule: **every mutation bumps `updated` (notes:
`updatedAt`), and the merge takes the newer stamp.** `mergeListItems` (`index.html:1965`) gives
**ties to the remote copy**. So a change that mutates a field without touching the stamp is not
merely "not newer" — it *loses* to any partner copy that still has the old value.

v326 fixed this for the item sheet (`index.html:8372`, comment: *"sheet edits must win the
newest-wins merge (was unstamped)"*). Four sites were missed.

### 2a. "Reopen all" — every reopened item can be flipped back to done

**Where.** `index.html:4780`

```js
listData[currentList].items = getItems().map(function(x){
  return x.done ? Object.assign({}, x, {done:false}, (x.checks ? {checks:emptyPersonChecks()} : null)) : x;
});
```

`Object.assign` copies the *old* `updated` straight through.

**Evidence (probe 2).**
```
{"stampChanged":false,"afterReopenDone":false,"mergedDone":true}
```
i.e. the reopen worked locally, and then merging against a partner copy carrying `done:true` at the
same stamp put every item straight back to done.

**Failure scenario.** Cathal taps "Reopen all" on Travel before a trip. Petra's tablet has been in
a drawer; she opens it and adds one item, which triggers a full `/shared` push of her stale list.
Cathal's device merges — remote wins the tie — and the whole packing list is packed again.

**Fix.** `{done:false, updated: Date.now()}`. One word.

### 2b. Recipe re-tag of an item already on the list

**Where.** `index.html:3336–3339` (`addRecipeToGroceries`) and the twin at `index.html:8299–8302`
(the grocery quick-import). `updated` is bumped **only** inside `if (existing.done)` — the revive
branch. Re-tagging an *active* item sets `.recipe` and `.catId` unstamped.

**Evidence (probe 7).**
```
{"updatedChanged":false,"tagApplied":true,"tagSurvivesMerge":false}
```

**Fix.** Move `existing.updated = Date.now();` out of the `if (existing.done)` branch.

### 2c. Recipe "clear" restore path

**Where.** `index.html:4529` and `index.html:4534–4536` (`doClear`). Restoring `done`/`catId`/
`recipe` from `_recipePrev`, and clearing the tag on kept items, are both unstamped.

**Evidence (probe 8).** `{"stampChanged":false,"recipeCleared":true}`

**Fix.** `it.updated = Date.now();` on both branches.

### 2d. Note star (highlight) toggle never reaches the other device

**Where.** `index.html:5125–5134` (`toggleNoteHighlightById`) — writes `highlighted`, pushes, but
never touches `updatedAt`.

This one behaves slightly differently because `mergeNotes` (`index.html:2582`) gives **ties to
local**, the opposite of `mergeListItems`. So the star isn't reverted locally — it simply never
arrives anywhere else, in either direction, permanently.

**Evidence (probe 9).**
```
{"starApplied":true,"stampChanged":false,"partnerGetsStar":false,"partnerWouldRepush":false}
```

**Fix.** `note.updatedAt = Date.now();`

**Open question for Cathal.** Should starring a note count as "modifying" it — i.e. is it OK that
the note's "Modified" timestamp in the editor jumps when you only starred it? If not, the star
needs its own stamp field and a rule in `notesTs`, which is a bigger change than one line.

> **Note for the reviewing session:** the tie-break rules genuinely differ between
> `mergeListItems` (remote wins) and `mergeNotes`/`mergeTripsData` (local wins). That asymmetry is
> undocumented in `HEARTH-notes.md` and is what makes 2a dangerous and 2d merely inert. Worth
> deciding whether it's deliberate.

---

## 3. Growth: the inline date edit breaks the one-entry-per-date invariant ✅ CONFIRMED

**What happens.** The growth **log** path enforces one record per date (`findIndex` by date,
overwrite — `index.html:10938–10940`). The inline **edit** path just assigns `rec.date = nd`
(`index.html:10981`) with no collision check. Edit an entry's date onto a date that already has an
entry and you get two rows for the same day. Then the delete button filters *by date*
(`index.html:10948`) — so deleting either row deletes **both**.

**Evidence (probe 3).**
```
{"dupesAfterEdit":2,"remainingAfterSingleDelete":0}
```

**And it is worse across devices (probe 10).** `mergeBabyData` merges growth by `date`
(`index.html:1937`). A date edit changes the merge key, so the partner's copy under the *old* date
survives the next merge and the entry resurrects as a duplicate:
```
{"growthCount":2,"dates":["2026-07-05","2026-06-05"]}
```

**Why it matters.** Growth entries feed the WHO centile chart and the dosing weight
(`latestBabyWeightRec`, `index.html:11301`). A duplicated or silently-vanished measurement is
baby-data, and the weight-based dose chips read from it.

**Relation to the backlog.** `HEARTH-notes.md` already documents the date-change hazard under
*"Deferred sync hardening — growth & milestones per-entry merge"*, including the `addTomb("growth",
oldDate)` remedy. What that entry does **not** say is that the *local, single-device* half is
already broken today — the duplicate-row + delete-both behaviour needs no sync at all. That half is
small and could ship independently of the sync hardening.

**Suggested fix (local half only).** In the edit save handler, if `nd !== oldDate` and an entry
already exists at `nd`, either refuse with a toast or merge the two — Cathal's call. Deleting by
date should also target one record, not a filter.

**Open question for Cathal.** When you retype a growth date onto a day that already has a
measurement, should the app (a) refuse and say so, (b) overwrite the existing one, or (c) keep both?

---

# Tier 2 — crashes

## 4. A history entry with no `name` still crashes four readers ✅ CONFIRMED

v350's D2 guard was added to `mergeHist` and `capHistToLiveLimit` only. The other readers of `hist`
still call `.name.toLowerCase()` unguarded:

| Where | Function |
|---|---|
| `index.html:1886` | `deleteHistEntries` |
| `index.html:2126` | `showAC` (the while-typing autocomplete) |
| `index.html:2326` | `addToHist` |
| `index.html:4792` | `renderHistory` |
| `index.html:9352` | `addToHistFor` |

**Evidence (probes 5 + 11).** With one nameless hist entry seeded:
```
{"showAC":"THREW: Cannot read properties of undefined (reading 'toLowerCase')",
 "addToHist":"THREW: ...", "deleteHist":"THREW: ..."}
{"renderHistoryNameless":"THREW: ..."}
```
`buildGrocerySuggestions` is fine — it already guards (`index.html:4271`).

**Reachability, honestly stated.** `mergeHist` filters nameless entries out of the three sync/import
paths, so this is not reachable through the normal flow. It is reachable through a corrupted
`localStorage` write (quota truncation, a manual edit, a partially-applied merge). The reason to
fix it is that v350 already decided a corrupt entry must not throw — the decision was just applied
in two places instead of six. And the failure mode is bad: `showAC` throws **on every keystroke**,
so the add row becomes unusable with no visible error.

**Fix.** `if (!h || !h.name) return;` / `continue;` at each site. Cheap, and the v350 test
(`03-merge-hist`) shows how to pin it.

---

# Tier 3 — behaviour and UX

## 5. The phone back button does nothing useful during a running Train session ✅ CONFIRMED

**What happens.** `closeTopOverlay()` (`index.html:7741`) enumerates every dismissible layer. Its
generic branch looks for `.overlay.open` (`index.html:7772`) — but `#sessionOverlay` is shown by
setting `style.display`, has no `.overlay` class, and no `role="dialog"`, so **no branch matches
it**. The back-press falls through to `switchSection()`, which changes the section *underneath* a
still-visible `z-index:800` overlay. The timer keeps ticking and the chimes keep firing.

**Evidence (probe 13).** With a yoga session running:
```
{"overlayVisibleBefore":"block","timerRunningBefore":true,
 "closeTopOverlayHandledIt":false,"overlayStillVisible":"block","timerStillRunning":true}
```
For reference, the only elements the `.overlay.open` branch can ever catch (probe 15):
`weatherOverlay`, `pickerOverlay`, `syncOverlay`, `settingsOverlay`.

**Why it matters.** v330 and v345 were both explicitly about making back behave. This is the last
full-screen layer that was missed, and it is the one where a stuck timer is most annoying.

**Suggested fix.** Add a `#sessionOverlay` check to `closeTopOverlay` that runs the **existing**
`sesBackBtn` click handler (so the "Exit workout? Progress will be lost" guard still applies) rather
than reimplementing the close — same principle as the v345 `data-bbclose` step.

**Blocked on 7 below:** that handler currently uses native `confirm()`.

## 6. Native `confirm()` in the session exit path is blocked in the test-mode sandbox ⚠️ REASONED

**Where.** `index.html:9696` and `index.html:9699` — `sesBackBtn` uses `confirm()` for
"Exit workout?" / "Exit yoga session?".

v346 already hit this class: *"`prompt()` is blocked in sandboxed iframes"*, and built an overlay
instead. `confirm()` is blocked the same way and **returns `false`**, so in a sandboxed context the
exit button silently does nothing — the user is stuck in the session with no way out but killing the
app. Everywhere else in the app uses `confirmDialog()` (`index.html:10863`).

**Fix.** Convert both to `confirmDialog()`. This also makes them back-button-aware for free (the
`#_cfNo` branch of `closeTopOverlay` is step 1) and unblocks finding 5.

## 7. A bottle with a window of 14 days or less is "due soon" the moment you open it ✅ CONFIRMED

**Where.** `index.html:11373` — the "due" tier is a fixed 14-day lead:

```js
if (now >= discardTs) status = "past";
else if (now >= discardTs - 14*24*3600*1000) status = "due";
```

**Evidence (probe 4)** — status at the instant of opening:
```
{"w7":"due","w14":"due","w28":"fresh","w90":"fresh"}
```

**Why it matters.** v346 shipped 90 days as a soft *placeholder*, with an explicit ask for Cathal
to *"confirm the real after-opening windows from his actual bottles and set them"*. Real
after-opening windows for paediatric liquids are frequently **28 days or less**. The moment Cathal
does what the PR asked and enters a real short figure, the row is permanently amber and the "due
soon" signal stops meaning anything.

**Suggested fix.** Make the lead proportional with a cap, e.g. `min(14 days, 25% of the window)`, so
a 7-day bottle turns amber at ~day 5 rather than at day 0.

**Open question for Cathal.** Two things, and the second is the one that actually matters:
(1) what warning lead feels right for a short window; (2) **what are the real after-opening windows
on your bottles?** — still outstanding from the v346 PR, and this finding is downstream of it.

## 8. Family Log shows "Nothing here yet" and a "Load earlier" button at the same time ⚠️ REASONED

**Where.** `index.html:7592–7611`. `shown` is filtered to the last `_famlogDays`; the empty state is
keyed on `!shown.length` while `hasMore` is keyed on `filtered.length > shown.length`. With events
that are all older than 90 days, both render — the empty state says *"Events … will appear as
they're logged — try the All filter"*, which is wrong, and the fix (tap "Load earlier") is sitting
right underneath it unexplained.

**Fix.** When `!shown.length && hasMore`, swap the copy for something like *"Nothing in the last
N days"*.

---

# Tier 4 — hardening and consistency (low)

## 9. `javascript:` URLs are accepted and rendered in item links ✅ CONFIRMED

**Where.** `index.html:8348` adds `https://` only when the value doesn't already look like a scheme
(`/^[a-z]+:/i`) — so `javascript:…` passes through untouched and lands in the `href` at
`index.html:4662`.

**Evidence (probe 14).** `{"storedAs":"javascript:alert(1)","hrefInMarkup":"javascript:alert(1)"}`

**Threat model, honestly.** Two trusted family members typing into their own list. This is
self-XSS, not a real attack surface, and `esc()` correctly prevents breaking out of the attribute.
Worth one line anyway because links *do* travel over household sync, so it isn't strictly
self-inflicted.

**Fix.** Reject anything that isn't `http:`/`https:` (or `mailto:`/`tel:` if wanted) at save time.

## 10. Trip import can give two bookings the same id ✅ CONFIRMED

**Where.** `index.html:2459–2462` (`importTripFromJSON`) and `index.html:2490`
(`mergeBookingsIntoTrip`) — every booking in one import gets `now + random(0..99999)` with `now`
captured **once** outside the loop.

**Evidence (probe 6).** 300 simulated 12-booking imports → **1** produced a duplicate id
(~0.3% per import; the birthday bound is ~0.7%).

**Why it matters.** Booking ids are the merge key *and* the tombstone key. Two bookings sharing an
id means the second silently overwrites the first on the next sync, and deleting one deletes both.
Compare `addItemToCurrent` (`index.html:2201`), which re-reads `Date.now()` per item.

**Fix.** Use a monotonic counter (`now + i*1000 + random`) or re-read `Date.now()` inside the map.

## 11. Tombstone comparisons are inconsistent: `>` in trips, `>=` everywhere else ⚠️ REASONED

| Site | Comparison |
|---|---|
| `index.html:1970` — `mergeListItems` | `ts >= (it.updated\|\|0)` |
| `index.html:1931` — `mergeMedicine` | `ts >= medUpdatedTs(m)` |
| `index.html:2593` — `mergeNotes` | `tombs[n.id] >= notesTs(n)` |
| `index.html:2530` — booking tombstones | `> (b.updated\|\|0)` |
| `index.html:2555` — trip tombstones | `> (t.updated\|\|0)` |
| `index.html:7214` / `10727` — recipebook | `> (m.updated\|\|0)` |

A tombstone written in the same millisecond as the entry's last edit fails to suppress the entry in
the `>` cases. Vanishingly unlikely by hand — but the trip **import** paths stamp every booking
`updated: now` in a tight loop, which is exactly where same-millisecond values are normal. Low
priority, but the inconsistency itself is a trap for whoever edits these next.

## 12. `applyPersonal`'s health rebuild drops unknown top-level keys — confirmed live ✅ CONFIRMED

Already on the backlog as **sync-audit item ③** (`HEARTH-notes.md`, "When Train/Track is next
touched"). Recording the confirmation so the reviewing session doesn't re-derive it.

**Where.** `index.html:7113` — `Object.assign({}, remoteWD, {workouts, bodyweight, bp})`. Any
local-only key under `fl4_workouts` that the remote copy doesn't have is wiped.

**Evidence (probe 12).** `{"futureFieldSurvived":false,"bodyweightSurvived":1}`

Note the overlap with **finding 1**: the same "hand-typed field list vs. generic carry-through"
mistake exists in the import path *and* the sync path. If both are fixed in one version, the
`getWD()` store finally matches the v296 treatment `getBD()` already has.

## 13. Internal recipe bookkeeping fields sync and export ⚠️ REASONED

`_recipePrev` and `_recipeAdded` (`index.html:3333–3337`, `8296–8307`) are transient UI bookkeeping,
but they live on the item object, so they ride into `localStorage`, both push payloads, and the
backup file. `_recipePrev` is a whole snapshot object per tagged item. Not a bug today — the clear
flow relies on them surviving a reload — but they belong in the "deliberately not exported" list in
`HEARTH-notes.md` or in a side store, and right now they're in neither.

## 14. `existingIds` is declared twice in the same function scope ⚠️ REASONED

**Where.** `index.html:10643` and `index.html:10668`, both `var existingIds` inside the same
`forEach(function(lt){…})` callback in `applyHousehold`. The second reassigns the first.

Harmless **only** because the first use (partner-added item detection, `10646–10652`) completes
before the second declaration is reached. It is exactly the kind of shadowing that breaks the moment
someone moves a block, and this file has a documented history with duplicate/shadowed declarations
(quirk #1, and the v351 cleanup). Rename the second to `existingCatIds` — the personal-channel twin
at `index.html:7143` already uses that name.

## 15. Note bodies are stored unsanitised; only the render is sanitised ⚠️ REASONED

`doSave` (`index.html:5381–5389`) writes `bodyEl.innerHTML` straight to storage. DOMPurify runs on
the way **in** to the editor (`index.html:5248`, the v328 fix) and the list preview escapes
(`index.html:5065`), so there is no live hole. But the unsanitised HTML is what gets synced,
exported and cloud-backed-up, so every future consumer of `note.body` has to remember to sanitise.
Sanitising on save as well is defence in depth and costs one call.

## 16. `sw.js?v=121` is a stale cache-buster ⚠️ REASONED

**Where.** `index.html:11954` — registered as `./sw.js?v=121` while the app is at v351. `updateViaCache:
"none"` means the browser revalidates anyway, so it is harmless — but it reads like a version marker
that stopped being maintained 230 versions ago, and someone will eventually "fix" it by hand.
Either drop the query or wire it to the real version.

---

# What I checked and found clean

Recording this so the reviewing session doesn't spend effort re-covering it:

- **Dosing maths** — `index.html:11562`. `Math.floor(w*mgkg*5/mg5 * 4)/4` rounds **down** to 0.25 ml;
  the 10 ml cap, the Nurofen 5 kg floor, both product strengths, the working string and the
  "check the leaflet" wording are all intact and match `MED_RULES`. `08-dose-e2e` pins them. **No
  dosing bug found.**
- **Interval advisories** — `medHistoryFor` (`index.html:11340`) correctly uses absolute distance to
  the nearest logged dose (so a backfilled dose checks both neighbours) and a 24 h window ending at
  the entered time, not "now". Wording says "logged" throughout. Correct.
- **WHO centile maths** — `whoWflLMS`/`normalCdf`/`growthCentile` (`index.html:11026–11051`). The
  A&S 7.1.26 CDF approximation is applied correctly (`z/√2`), the 110 cm boundary clamp is right,
  and `ordinal()` handles 11/12/13 correctly.
- **`esc()`** — escapes `& < > " '`. All the concatenated-HTML renderers I read route user text
  through it. The only `href` reaching the DOM unfiltered is finding 9.
- **Duplicate top-level definitions** — the v351 cleanup holds: the CI grep finds none, and the
  allowlist is empty.
- **`sw.js`** — the v295 lie-fi race, the cache-name-from-VERSION deletion, and the shell
  network-first/cache-fallback logic all read correctly. No finding.
- **Session timers** — `clearST()` is called on every branch and phase transition in yoga, physio and
  workout. No leak found (finding 5 is a *navigation* gap, not a timer-lifecycle bug).
- **`storeSet` quota handling** — catches and toasts, as documented. Note that callers proceed as
  though the write succeeded (the in-memory state is already mutated and will still push), but that
  is arguably the right behaviour and is already a recorded decision.

---

# Suggested batching

Not a decision — a starting point for the reviewing session.

| Version | Contents | Why together |
|---|---|---|
| A | Findings **1** + **12** | Both are the same "hand-typed field list" mistake in the `getWD()` store, import side and sync side. One version, one test case. |
| B | Finding **2** (all four sites) | One rule, four one-line edits. Needs the tie-break asymmetry decided first. |
| C | Findings **5** + **6** | 6 unblocks 5. Pure UI/navigation, no data model. |
| D | Finding **3**, local half only | Small, contained, independent of the deferred growth sync hardening. |
| E | Finding **4** | Five guards. Trivially testable against `03-merge-hist`'s pattern. |
| F | Findings **7**–**16** | Polish/hardening bundle; **7** wants Cathal's real bottle windows first. |

**Test coverage.** Findings 1, 2a–2d, 3, 4 and 10 are all expressible as pure-function or
seed-export-wipe-import cases in the existing harness — they fit the parked "slice 2" work
(`HEARTH-notes.md` § Tests) with no new infrastructure. Whichever fixes ship should land with the
matching case, per the v350 precedent of pinning both the throw and the correct behaviour.

---

# Questions that need Cathal, collected

1. **(finding 1)** Restore semantics for bodyweight/BP — additive union, or backup-wins on collision?
2. **(finding 2d)** Should starring a note bump its "Modified" date?
3. **(finding 2, general)** Is the tie-break asymmetry deliberate — remote wins for list items,
   local wins for notes and trips?
4. **(finding 3)** Retyping a growth date onto an existing date: refuse, overwrite, or keep both?
5. **(finding 7)** The real after-opening windows on your actual Calpol/Nurofen bottles — still
   outstanding from the v346 PR — and what warning lead feels right for a short window.

---

# Reproducing any of this

The probes were run against the checked-in harness with no changes to it:

```js
const { launch } = require('/path/to/tests/harness.js');
const page = await launch();
await page.navigate('file:///path/to/index.html');
await page.evaluate(`(function(){ /* call the app's own functions */ })()`);
await page.reset(appUrl);   // localStorage.clear() + renavigate, for isolation
```

Every ✅ CONFIRMED finding above was produced this way, calling the app's real functions rather
than reimplementing them.

---

*Review run on `claude-opus-5`. Read-only: no app code, no `sw.js`, no `tests/` and no version
number were touched on this branch.*
