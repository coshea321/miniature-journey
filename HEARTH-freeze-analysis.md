# Startup freeze / "doesn't open" — review verification notes (31/07/2026)

**Status: PLAN COMPLETE — A (v372), B (v373), C (v374), D (v375), E (v376) all shipped.**
Verified on v371 by a Fable 5 session. Anchors below are v371 line numbers — **v372–v376 moved
things; any later session must re-grep and read the exact lines before editing.** Per-release
detail lives in the `HEARTH-changelog.md` entries (in `HEARTH-notes.md` before the 16/08/2026 split).

**One correction worth carrying forward (found building Release E):** the "http://localhost server
mode" this document proposes below **cannot work as written** — `_isPreview` treats `localhost` and
`127.0.0.1` as preview, and `_isTestBuild` treats any non-production hostname as a test build, so
the page skips service-worker registration on a localhost origin exactly as it does on a
raw.githack link. v376 instead serves the repo locally *under the production hostname*, redirected
inside the test browser only. Anything similar in future must clear those two guards first.

## The symptom, mapped to code

"Freezes beyond the normal amount of time": on a bad ("lie-fi") mobile connection a cold open can stack:
SW network-first wait **3.5s** (`sw.js` fetch handler) → parse/execute the **842 KB** page →
boot-gate splash **4s, extended to 8s** if an update looks like it's installing (12s hard ceiling)
→ `verifySession` **6s** watchdog (overlaps the gate — both run near the bottom of the script)
→ Home "loading" for up to **4s** (`_homeAwaitingFetch` fallback, line ~8841).
Every stage is a deliberate, documented defence individually; stacked, a bad-network open can
plausibly sit at a splash/blank/loading screen for 10–15+ seconds. **The review's core diagnosis is
correct: opening the app is conditioned on network/SW state even though all data is local.**

"Sometimes doesn't open at all": mostly fixed by v356 (12s force-hide ceiling + bfcache/pageshow +
early-error handlers). The **documented residual** (v356 changelog): if the browser suspends timers
while a `bootStaleReload()` navigation stalls, every timer freezes including the failsafe — that
still presents as a permanently stuck splash until the OS resumes the page. No in-page fix exists;
the only real mitigation is making the reload path rarer/faster (see decisions below).

## Per-claim verdicts

| # | Review claim | Verdict |
|---|-------|---------|
| 1 | Boot gate waits 4s/8s/12s | **PARTLY TRUE.** 4s/8s real and deliberate (v312, design Cathal confirmed 06/07/2026, built to kill the stale-version flash on cold start). 12s is the v356 *recovery ceiling*, not a wait. The subtle sub-claim is **TRUE and worth fixing**: `_bootUpdateInstalling` (set at ~13925/13926) is never reset — a failed or completed install leaves it stuck true, which blocks the fast same-version confirm at ~13980 **and** buys a pointless 4s extension at ~13912. Reset it on the installing worker's `statechange` (→ `redundant` or `activated`). |
| 2 | Login/session restore blocks entry up to 6s | **TRUE in substance.** `verifySession` (~8782–8813, watchdog is v290) gates `onLoginSuccess` on a token refresh / auth fetch; 6s watchdog guarantees entry. Nuance the review missed: every network path is already lenient (failure ⇒ enter anyway) — the 6s only bites when a request *hangs*, and it overlaps the boot gate rather than adding serially. But the structural point stands: **a logged-in user with full local data waits on a network round-trip to see their app.** |
| 3 | No network timeouts on Firebase calls | **VERIFIED.** Zero `AbortController` / timeout wiring anywhere in index.html. Bare `fetch()` at ~8537 (token), 8557, 8576, 8706/8710/8732/8746, 8803 (verifySession), 8854 (household code), 8921 (pushPersonal), 9111 (fetchPersonal), 9177 (pushHousehold), 12546 (fetchHousehold). The v290 watchdog is the only timeout in the whole sync stack. |
| 4 | SW is network-first (3.5s) on the shell | **VERIFIED — but it's the v295 lie-fi fix**, not an oversight (before it, opens waited on the browser's own timeout, up to ~a minute). Cache-first + background refresh (review's proposal) is a real design reversal: instant opens, but updates land on the *second* open and the v312 gate's whole purpose (never show a stale build) is voided. **Gate + fetch strategy must be redesigned together as one decision — see below.** |
| 5 | Large page, synchronous startup work | **TRUE on size** (842,515 bytes, ~708 KB inline JS parsed before the gate arms at the script bottom). **Overstated on localStorage**: only ~8 top-level `storeGet` reads (clusters ~7748, ~8478–8512) — parse/execute cost is the real item, and it's why the v356 failsafe lives in its own early `<script>` at ~673. Splitting the file is on the standing rejected list (02/07/2026 triage) — do not re-open without Cathal. |
| 6 | Sync apply causes heavy re-render | **VERIFIED structurally.** `applyPersonal` (~8925–9105) can call `renderRecipes` ×2, `renderTrips`, `renderBabyView`, then unconditionally `renderList` + `renderHomeScreen`/`renderTrainView`; `applyHousehold` (~12555–12709) same shape. No batching / render-once-per-cycle. Severity unmeasured — no evidence this is the *opening* freeze; it's a mid-session jank risk. Note asymmetry: `applyHousehold` is try/catch-wrapped, `applyPersonal` is not. |
| 7 | EventSource reconnects can stack | **PARTLY TRUE.** Both listeners (~9712–9727 personal, ~9744–9759 household) reconnect on `setTimeout(...,5000)` with no reconnect-in-progress flag, so timers can stack — but each `start*Listening()` closes the previous ES first, so **listeners don't accumulate**, only redundant restart attempts do. Plus a 5-min `setInterval` staleness fallback (~9690–9710). Cheap fix: one pending-reconnect timer id per listener. |
| 8 | Test suite is broken | **FALSE as stated.** `node tests/run.js` on v371, this session: **21/21 files green, exit 0**, incl. `01-boot-smoke` and `10-boot-splash-failsafe`. The reviewer ran the page outside the sanctioned harness (run.js drives its own Chromium configured for file://). **Real gap underneath:** on `file://` no service worker registers, so the gate's SW/network/update paths — the exact area under suspicion — have zero automated coverage. Their scenario list (slow SW update, old-page/new-SW, hanging Firebase, corrupt localStorage, large datasets) is a good *addition*, not a repair. |
| 9 | Debug instrumentation live in production | **VERIFIED.** "Debug overlay (temporary)" block ~13992–14029 + markup ~14033–14041: overrides `console.error`/`console.warn`, unbounded `errors[]`, rebuilds the full log innerHTML on **every** entry (O(n²) DOM work under repeated sync failures — which is exactly the bad-network case), and after 2s shows the badge **even with zero errors**. Not in the v359–v371 changelog, so it predates v359 and was simply never removed. Safe quick win: delete, or gate behind `_isTestBuild`. |

**Incidental bug found while verifying:** `onLoginSuccess`'s household-code fetch error handler
(~8862) logs a copy-pasted `"SW registration failed:"` message — wrong text, will mislead the debug
overlay / console. One-line fix whenever a session is next in that area.

## What the review got wrong overall

It treats the gate, the 3.5s SW cap, and the watchdog as accumulated accidents. They are each a
**documented fix for a complaint Cathal actually made** (v312 stale-flash, v295 lie-fi hang, v290
boot hang, v356 stuck splash). The review's "remove the gate, go cache-first" plan silently reverses
two of those decisions. The correct framing for Cathal is a **trade-off decision**, not a repair.

## Recommended plan (for Cathal to approve — nothing here is agreed yet)

**Release A — no design change, build-ready for plain Sonnet (one version):**
1. Remove or `_isTestBuild`-gate the debug overlay (claim 9).
2. Reset `_bootUpdateInstalling` on the installing worker's `statechange` (claim 1's sub-bug).
3. Add a pending-reconnect guard per EventSource listener (claim 7).
4. Fix the ~8862 wrong error message.
None of these change designed behaviour; all reduce worst-case startup/jank a little.

**Release B — needs Cathal's design call: the gate/fetch-strategy trade-off (claims 1+2+4).**
The one question that matters: **"On a slow connection, would you rather see the app instantly —
possibly one version stale, with an update banner — or keep the guarantee of never seeing a stale
build, at the cost of up to ~8s of splash?"**
- If instant-open wins: enter the app immediately when stored credentials exist (call
  `onLoginSuccess` straight away, refresh the token in the background — auth failure affects sync
  status only); hide the splash as soon as the script arms; keep the version check running in the
  background and use the existing update banner instead of `bootStaleReload`. The SW can then go
  cache-first (or stale-while-revalidate) on the shell. This is the review's Release 1+2 and the
  biggest win for the reported symptom — and it also shrinks the window for the v356 un-fixable
  reload-stall residual, since startup reloads stop happening at all.
- If never-stale wins: keep the gate but tighten it — reset `_bootUpdateInstalling` properly (Release
  A), consider 3s deadline, and still decouple `verifySession` (entry need not wait for auth even if
  the version gate stays).
Either way this touches the service worker and sync entry → **top-tier model session, design
confirmed via AskUserQuestion first** per the standing model-check rule.

**Release C — build-ready after B: `fetchWithTimeout` helper** (claim 3): one shared helper
(AbortController, ~8s) applied to the ~12 bare fetch sites; hung requests currently survive behind
the watchdogs and keep running.

**Release D — backlog, medium:** batch sync-apply rendering (claim 6): apply all merges, then render
each visible section once per apply cycle; wrap `applyPersonal` in try/catch to match
`applyHousehold`.

**Release E — SHIPPED v376 (prevention).** Extend the test harness so a service worker can register,
then add the update/hang scenarios from claim 8's verdict. Built as a second phase of
`node tests/run.js` (own server + own browser, `tests/sw-cases/`) — see the correction at the top of
this file about why the "localhost" wording had to change, and the v376 changelog entry for the two
measurement traps that made an earlier draft of the offline test pass against a network-first shell.

**Explicitly not recommended:** splitting index.html (rejected 02/07/2026 triage — don't re-open);
removing the 3.5s lie-fi cap without Release B's decision; any change that drops the update banner.
