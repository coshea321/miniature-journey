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
4. **Run the `hearth-verifier` subagent** and wait for its verdict. If it
   says DO NOT COMMIT, stop and report — do not commit.
5. **Commit** everything with message `vNNN: <summary>`.
6. **Push** with `git push -u origin <current-branch>`; on network errors
   retry up to 4 times with backoff (2s/4s/8s/16s). Never push to `main`.
7. **Open the PR immediately** (GitHub MCP `create_pull_request`, base
   `main`) — never wait to be asked. Title `vNNN: <summary>`. Body:
   - **What changed** — plain-English bullets a non-coder can review.
   - **Why** — the request or bug that prompted it.
   - **Checks** — the verifier's summary block, pasted verbatim.
   - **Rollback** — the backup branch name for this version.

One PR per version: if this branch already has a merged PR, stop and tell
Cathal a fresh branch off latest `main` is needed instead.
