---
description: Hearth release tail — bump version, verify, commit, push, open the PR
argument-hint: [one-line summary of the change]
---

Run the fixed Hearth release sequence for the change currently in the
working tree. The one-line summary of the change: $ARGUMENTS
(if empty, derive it from the diff).

Steps, in order — stop at the first failure and report it instead of
continuing:

1. **Determine the new version.** Read the `VERSION` constant in `sw.js`
   (e.g. `v308 · 03/07/2026`). New version = NNN + 1, date = today in
   DD/MM/YYYY. Format is exactly `vNNN · DD/MM/YYYY` — date only, no time.
   If the working tree has already been bumped this session, don't bump
   twice — verify and continue.
2. **Bump both files.** Edit the one-line `VERSION` constant in `sw.js` and
   the `appVersionLabel` div in `index.html` to the same new string.
3. **Update `HEARTH-notes.md`.** Add the new version's changelog entry at
   the top of "Recently completed" (keep that section to the newest ~10
   entries — move the oldest surplus entry to `HEARTH-archive.md`), update
   the "Current version" line, and sync the backlog if this change closed
   or added anything.
4. **Run `node tests/run.js`** (expect exit 0), then the **`hearth-verifier`
   subagent**, and wait for its verdict. If it says DO NOT COMMIT, stop and
   report — do not commit.
5. **Commit** everything with message `vNNN: <summary>`.
6. **Push** with `git push -u origin <current-branch>`; on network errors
   retry up to 4 times with backoff (2s/4s/8s/16s). Never push to `main`.
7. **Open the PR immediately** (GitHub MCP `create_pull_request`, base
   `main`) — never wait to be asked. Title `vNNN: <summary>`. Body: fill in
   `.github/pull_request_template.md` section for section — that file is the
   canonical PR shape, and the API does not apply it automatically, so you
   have to reproduce it. In order:
   - **👉 Try this version** — first line of the body, the test link for
     this branch (v324 test mode: sync/login blocked, data sandboxed;
     v407 demo data: the link opens with a fixed sample household already
     in it, reloaded fresh for every version):
     `https://raw.githack.com/coshea321/miniature-journey/<branch>/index.html`
   - **What changed** — plain-English bullets a non-coder can review.
   - **Why** — the request or bug that prompted it.
   - **Before you merge** — the pre-merge checklist (v407). Copy the
     "Always check" block from the template **verbatim, unchanged, on every
     PR** — it is the same five boxes every time on purpose, and it is what
     catches a change that quietly breaks boot or an unrelated section.
     Then write the **"Check for this change"** boxes yourself: 2–4 steps
     aimed at what this version actually did, each naming the section to
     open, the thing to tap, and what should happen. Write them for a
     non-coder — "open Recipes, tap Demo Chicken Traybake, tap a step: it
     should grey out", not "verify the cook-tick handler fires". If the
     change is invisible in the UI (a sync-timing fix, a merge guard), say
     so in one line and point at what the tests cover instead of inventing
     a tap that proves nothing.
   - **Checks** — the verifier's summary block, pasted verbatim. If
     anything under `tests/` changed, say which file and why, here.
   - **Rollback** — the backup branch name for this version.

One PR per version: if this branch already has a merged PR, stop and tell
Cathal a fresh branch off latest `main` is needed instead.
