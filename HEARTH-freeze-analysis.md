# Startup freeze / "doesn't open" — review verification notes (31/07/2026)

**Status: IN PROGRESS — written realtime so a later session can pick up if this one dies.**
Session: Fable 5, analysis-only (no app code changes in this session). Branch `claude/hearth-freeze-startup-myxl6g`.

Cathal supplied an external review claiming 9 causes for the app freezing on open / sometimes not opening.
This file records, per claim: VERIFIED / PARTLY TRUE / FALSE / UNVERIFIED, with code anchors and the
design history the review didn't know about. A build session must read the anchors itself before editing.

## Context established so far (verified)

- Current version **v371 · 31/07/2026**; `index.html` is **842,515 bytes ≈ 823 KiB** (review's "824 KB" figure is accurate/current). Preflight: branch = latest `origin/main`, all three version sources aligned, tree clean. Backup branches outside keep-10 window for Cathal to delete: `backup-v356`, `backup-v358`, `backup-v359`.
- **The 4s/8s boot gate is a deliberate design, not an accident** — v312 (design confirmed by Cathal 06/07/2026)
  built the dark `#bootSplash` + version gate specifically to fix the *cold-start opening flash* (old version
  visible before the new SW takes over). Hide-immediately paths already exist: preview mode, no SW support,
  no `navigator.serviceWorker.controller`, registration failure, offline. The silent `bootStaleReload()` behind
  the splash (with sessionStorage loop guard) is also deliberate. **Removing the gate (review Release 1)
  reverses a design Cathal explicitly asked for — needs his decision, with the trade-off stated:
  instant open vs. seeing a stale version flash / running mixed old-page-new-SW.**
- **The 12s failsafe is v356** — fix for Cathal's own 25/07/2026 report "stuck on the boot loading screen".
  It is a hard ceiling that force-hides the splash (plus pageshow/bfcache and early-error handlers inlined
  right after the splash markup, before the big script). It is NOT an intentional 12s wait; it's the
  last-resort recovery. v356 documents a **known residual**: if the browser suspends timers while a
  `bootStaleReload()` navigation stalls, every timer freezes incl. the failsafe — that case still shows a
  stuck splash until the OS resumes the page. **This residual is a plausible real cause of "sometimes
  doesn't open at all" on Android.**
- **SW network-first 3.5s cap on the app shell is real** (`sw.js` fetch handler) — but it IS the v295 lie-fi fix
  (before it, network-first waited on the browser's own timeout ≈ up to a minute). The review's proposed
  cache-first + background refresh would make opens instant but reintroduces "update lands only on second
  open" — combined with the v312 gate's stale-version reload logic this interacts; the two must be
  redesigned together, not patched separately.
- Worst-case serial stack on a lie-fi cold open, as currently designed:
  SW nav wait 3.5s → parse/execute ~842 KB page → boot gate up to 4s/8s (12s ceiling) → verifySession
  watchdog (claimed 6s, verification pending) → data fetches. The review's core architectural point —
  *local access should not wait on network confirmation* — is sound; the question is which waits Cathal
  agrees to trade away.

## Per-claim verdicts

| # | Claim | Verdict | Notes |
|---|-------|---------|-------|
| 1 | Boot gate 4s/8s/12s intentional wait | **PARTLY TRUE** | 4s/8s real + deliberate (v312); 12s is a recovery ceiling (v356), not a wait. `_bootUpdateInstalling` never-reset claim: pending code check. |
| 2 | verifySession 6s watchdog blocks local entry | pending | scout sweep running |
| 3 | Firebase fetches have no timeout | pending | scout sweep running |
| 4 | SW network-first 3.5s on shell | **VERIFIED** | but it's the v295 lie-fi fix; cache-first proposal reverses a documented decision — design call for Cathal |
| 5 | 842 KB page, synchronous parse + localStorage at startup | **TRUE (size)** | severity on real devices unmeasured; v356 failsafe already mitigates the worst outcome (permanent splash) |
| 6 | applyPersonal/applyHousehold render-storm on sync | pending | scout sweep running |
| 7 | EventSource reconnects can stack (no in-progress guard) | pending | scout sweep running |
| 8 | Test suite broken (switchSection undefined, file:// localStorage error) | pending | `node tests/run.js` running now; note suite was 21/21 green at v371 (31/07/2026) per changelog, so a hard breakage today would be surprising — review may have run it in a different environment |
| 9 | Debug console-override instrumentation in production | pending | scout sweep running; not in v359–v371 changelog, so if present it predates v359 or the review saw a test build |

## Recommendations (draft — finalise at bottom when verification completes)

(to be filled in)
